/**
 * JOB-05 near-expiry scan and JOB-07 repeated-expiry recomputation (FL-11, F-25). Runs in the caller's transaction.
 * Detection is code only: lots with 0 < days_left <= the drug's threshold become DETECTED items for the owner pharmacist.
 */
import type pg from 'pg';
import { reductionPlan, repeatLevel } from '../../core/formulas/expiry.js';
import { notifyRoles } from '../../core/notify.js';
import { loadExpiryConfig } from './expiry.config.js';

export interface ScanResult {
  detected: number;
  reevaluated: number;
  refreshed: number;
  writeOffs: number;
}

export async function scanNearExpiry(client: pg.PoolClient, today = new Date()): Promise<ScanResult> {
  const cfg = await loadExpiryConfig(client);
  const day = today.toISOString().slice(0, 10);
  const result: ScanResult = { detected: 0, reevaluated: 0, refreshed: 0, writeOffs: 0 };

  // KEPT items come back for a new decision when their review date has passed (SM-2: KEPT -> DETECTED), if the lot can still be used.
  const back = await client.query(
    `UPDATE near_expiry_item ne SET status = 'DETECTED', updated_at = now(), version = ne.version + 1
       FROM stock_lot sl
      WHERE sl.id = ne.lot_id AND ne.status = 'KEPT' AND ne.review_after IS NOT NULL AND ne.review_after <= $1::date
        AND sl.expiry_date > $1::date AND sl.qty_on_hand - sl.qty_held > 0
      RETURNING ne.id`,
    [day],
  );
  result.reevaluated = back.rowCount ?? 0;

  // New items: free quantity of lots inside the threshold, no blood products (BR-F2a-031), one item per lot.
  const inserted = await client.query(
    `INSERT INTO near_expiry_item (hospital_id, lot_id, status, qty, days_left, value_thb)
     SELECT sl.hospital_id, sl.id, 'DETECTED', sl.qty_on_hand - sl.qty_held, (sl.expiry_date - $1::date),
            round((sl.qty_on_hand - sl.qty_held) * COALESCE(hd.unit_price_thb, 0), 2)
       FROM stock_lot sl
       JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id AND hd.active
       LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
      WHERE sl.qty_on_hand - sl.qty_held > 0
        AND sl.expiry_date > $1::date
        AND (sl.expiry_date - $1::date) <= COALESCE(hd.expiry_threshold_days, $2::int)
        AND COALESCE(dm.is_blood_product, false) = false
        AND NOT EXISTS (SELECT 1 FROM near_expiry_item x WHERE x.lot_id = sl.id)
     RETURNING id, hospital_id`,
    [day, cfg.thresholdDaysDefault],
  );
  result.detected = inserted.rowCount ?? 0;
  const perHospital = new Map<string, number>();
  for (const r of inserted.rows) perHospital.set(r.hospital_id, (perHospital.get(r.hospital_id) ?? 0) + 1);
  for (const [hospitalId, n] of perHospital) {
    await notifyRoles(client, hospitalId, ['PHARMACIST'], { kind: 'NEAR_EXPIRY_DETECTED', title: `พบล็อตใกล้หมดอายุใหม่ ${n} ล็อต`, body: 'ตรวจและตัดสินใจปล่อยเข้าคลังกลางหรือเก็บไว้ใช้เอง', refType: 'near_expiry_item', refId: null });
  }

  // Days left / value follow the calendar for items still undecided or in the pool.
  const refreshed = await client.query(
    `UPDATE near_expiry_item ne SET days_left = (sl.expiry_date - $1::date), updated_at = now()
       FROM stock_lot sl
      WHERE sl.id = ne.lot_id AND ne.status IN ('DETECTED','KEPT','RELEASED_TO_POOL','ALLOCATED') AND ne.days_left <> (sl.expiry_date - $1::date)`,
    [day],
  );
  result.refreshed = refreshed.rowCount ?? 0;

  // A plan still waiting for approval cannot ship an expired lot: it is cancelled (approved plans are left to the transport flow).
  await client.query(
    `UPDATE allocation_plan ap SET status = 'CANCELLED', updated_at = now(), version = ap.version + 1
       FROM pool_entry pe, near_expiry_item ne, stock_lot sl
      WHERE pe.id = ap.pool_entry_id AND ne.id = pe.near_expiry_item_id AND sl.id = ne.lot_id
        AND ap.status IN ('DRAFT','READY_FOR_APPROVAL','NEEDS_DISCUSSION') AND sl.expiry_date <= $1::date`,
    [day],
  );

  // BR-F2a-024: a released lot that expired before any shipment leaves the pool; the hold is released and the item is closed.
  const stale = (
    await client.query(
      `SELECT ne.id, ne.hospital_id, ne.lot_id, pe.id AS pool_id, pe.qty_available::float8 AS q
         FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id JOIN pool_entry pe ON pe.near_expiry_item_id = ne.id
        WHERE ne.status = 'RELEASED_TO_POOL' AND sl.expiry_date <= $1::date
          AND NOT EXISTS (SELECT 1 FROM allocation_plan ap WHERE ap.pool_entry_id = pe.id AND ap.status IN ('DRAFT','READY_FOR_APPROVAL','AUTO_APPROVED','APPROVED','NEEDS_DISCUSSION','TRANSPORTING'))
        FOR UPDATE OF ne`,
      [day],
    )
  ).rows;
  for (const s of stale) {
    if (s.q > 0) await client.query(`UPDATE stock_lot SET qty_held = GREATEST(0, qty_held - $2), updated_at = now(), version = version + 1 WHERE id = $1`, [s.lot_id, s.q]);
    await client.query(`UPDATE pool_entry SET qty_available = 0 WHERE id = $1`, [s.pool_id]);
    await client.query(`UPDATE near_expiry_item SET status = 'DISMISSED', note = 'หมดอายุก่อนส่ง (BR-F2a-024)', updated_at = now(), version = version + 1 WHERE id = $1`, [s.id]);
  }

  // BR-F2a-024: a lot that expired with stock still on the shelf is an expiry write-off event (counted once per lot) for F2b.
  const writeOff = await client.query(
    `INSERT INTO value_record (hospital_id, region_id, metric, period, value_thb, value_qty, ref_type, ref_id, detail)
     SELECT sl.hospital_id, h.region_id, 'EXPIRED_WRITEOFF_THB', date_trunc('month', sl.expiry_date)::date,
            round(sl.qty_on_hand * COALESCE(hd.unit_price_thb, 0), 2), sl.qty_on_hand, 'stock_lot', sl.id,
            jsonb_build_object('lotNo', sl.lot_no, 'expiryDate', sl.expiry_date, 'drugMasterId', hd.drug_master_id)
       FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id JOIN hospital h ON h.id = sl.hospital_id
      WHERE sl.expiry_date <= $1::date AND sl.qty_on_hand > 0
        AND NOT EXISTS (SELECT 1 FROM value_record v WHERE v.metric = 'EXPIRED_WRITEOFF_THB' AND v.ref_type = 'stock_lot' AND v.ref_id = sl.id)
     RETURNING id`,
    [day],
  );
  result.writeOffs = writeOff.rowCount ?? 0;
  return result;
}

/**
 * F-25: per hospital x drug count the lots released to the pool because of near-expiry (or already expired) in the window, derive
 * WATCH / RECOMMEND and, when purchase history exists, the order reduction. A flag dismissed by the pharmacist stays quiet until `dismissed_until`.
 */
export async function recomputeRepeatExpiry(client: pg.PoolClient, today = new Date()): Promise<{ flags: number }> {
  const cfg = await loadExpiryConfig(client);
  const day = today.toISOString().slice(0, 10);
  const rows = (
    await client.query(
      `SELECT ne.hospital_id, hd.drug_master_id, hd.id AS hd_id, ne.qty::float8 AS qty, COALESCE(hd.unit_price_thb, 0)::float8 AS unit_cost
         FROM near_expiry_item ne
         JOIN stock_lot sl ON sl.id = ne.lot_id
         JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
        WHERE hd.drug_master_id IS NOT NULL
          AND ne.created_at >= ($1::date - make_interval(months => $2::int))
          AND (ne.status IN ('RELEASED_TO_POOL','ALLOCATED','TRANSFERRED') OR sl.expiry_date <= $1::date)`,
      [day, cfg.repeat.windowMonths],
    )
  ).rows;
  type Group = { hospitalId: string; drugMasterId: string; hdId: string; items: { qty: number; unitCost: number }[] };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.hospital_id}:${r.drug_master_id}`;
    const g: Group = groups.get(key) ?? { hospitalId: r.hospital_id, drugMasterId: r.drug_master_id, hdId: r.hd_id, items: [] };
    g.items.push({ qty: r.qty, unitCost: r.unit_cost });
    groups.set(key, g);
  }
  let flags = 0;
  for (const g of groups.values()) {
    const lv = repeatLevel({ leftovers: g.items, watchCount: cfg.repeat.watchCount, recommendCount: cfg.repeat.recommendCount, recommendValueThb: cfg.repeat.recommendValueThb });
    if (!lv.level) continue;
    const orders = (
      await client.query(
        `SELECT qty::float8 AS qty, expected_date FROM incoming_order WHERE hospital_drug_id = $1 AND status <> 'CANCELLED' AND expected_date >= ($2::date - make_interval(months => $3::int)) ORDER BY expected_date`,
        [g.hdId, day, cfg.repeat.windowMonths],
      )
    ).rows;
    const fc = (await client.query(`SELECT u_per_day::float8 AS u FROM v_latest_forecast WHERE hospital_drug_id = $1 AND granularity = 'WEEK' ORDER BY period_start DESC NULLS LAST LIMIT 1`, [g.hdId])).rows[0];
    let suggestion: Record<string, unknown> | null = null;
    if (lv.level === 'RECOMMEND' && orders.length >= 2 && fc?.u > 0) {
      const gaps = orders.slice(1).map((o, i) => (new Date(o.expected_date).getTime() - new Date(orders[i].expected_date).getTime()) / 86_400_000).filter((d) => d > 0);
      const cycle = gaps.length ? Math.round(gaps.reduce((s, d) => s + d, 0) / gaps.length) : null;
      const plan = reductionPlan({
        orderQtyAvg: Math.round(orders.reduce((s, o) => s + o.qty, 0) / orders.length),
        orderCycleDays: cycle,
        usePerDay: fc.u,
        unitCost: g.items[0].unitCost,
        avgLeftover: Math.ceil(g.items.reduce((s, i) => s + i.qty, 0) / g.items.length),
      });
      if (plan) suggestion = { action: 'ลดปริมาณสั่งซื้อต่อรอบ', orderCycleDays: cycle, ...plan };
    }
    const existing = (await client.query(`SELECT id, dismissed_until::text AS dismissed_until FROM repeat_expiry_flag WHERE hospital_id = $1 AND drug_master_id = $2 ORDER BY created_at DESC LIMIT 1`, [g.hospitalId, g.drugMasterId])).rows[0];
    if (existing) {
      if (existing.dismissed_until && existing.dismissed_until > day) continue;
      await client.query(`UPDATE repeat_expiry_flag SET level = $2, lots_12m = $3, value_12m_thb = $4, suggestion = $5::jsonb, dismissed_until = NULL WHERE id = $1`, [existing.id, lv.level, lv.lots, lv.lostValue, suggestion ? JSON.stringify(suggestion) : null]);
    } else {
      await client.query(`INSERT INTO repeat_expiry_flag (hospital_id, drug_master_id, level, lots_12m, value_12m_thb, suggestion) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [g.hospitalId, g.drugMasterId, lv.level, lv.lots, lv.lostValue, suggestion ? JSON.stringify(suggestion) : null]);
    }
    flags += 1;
  }
  return { flags };
}
