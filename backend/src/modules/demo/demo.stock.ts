import { pool } from '../../db/client.js';
import { HttpError } from '../../middleware/httpError.js';
import { runExpiryJobs } from '../expiry/expiry.routes.js';
import { reevaluateAlerts } from '../forecasts/forecasts.runs.js';
import { addStock, drain } from './demo.engine.js';
import { withDemoLock } from './demo.runner.js';

const bad = (message: string) => new HttpError(400, 'BAD_REQUEST', message);

export async function listHospitals() {
  return (await pool.query(`SELECT code, name_th AS name FROM hospital WHERE active ORDER BY code`)).rows as { code: string; name: string }[];
}

/** Drugs a hospital lists, with the stock it can use now, its target and its open stock alert (if any). */
export async function listDrugs(code: string, search: string) {
  const rows = (await pool.query(
    `SELECT hd.id, dm.generic_name AS name, hd.local_name, hd.local_unit AS unit, hd.ved::text AS ved, hd.unit_price_thb::float8 AS price,
            COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = hd.id AND l.expiry_date > current_date), 0)::float8 AS free,
            f.u_per_day::float8 AS u_per_day, f.total_target::float8 AS target,
            (SELECT a.severity::text || ':' || a.status::text FROM stock_alert a
              WHERE a.hospital_drug_id = hd.id AND a.type = 'LOW_STOCK' AND a.granularity = 'WEEK' AND a.status IN ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED')
              ORDER BY a.created_at DESC LIMIT 1) AS alert
       FROM hospital_drug hd
       JOIN hospital h ON h.id = hd.hospital_id AND h.code = $1
       JOIN drug_master dm ON dm.id = hd.drug_master_id
       LEFT JOIN v_latest_forecast f ON f.hospital_drug_id = hd.id AND f.granularity = 'WEEK'
      WHERE hd.active AND ($2 = '' OR dm.generic_name ILIKE '%' || $2 || '%' OR hd.local_name ILIKE '%' || $2 || '%')
      ORDER BY dm.generic_name LIMIT 200`, [code, search])).rows;
  return rows.map((r) => ({ ...r, alert: r.alert ? { severity: String(r.alert).split(':')[0], status: String(r.alert).split(':')[1] } : null }));
}

async function snapshot(hdId: string) {
  const r = (await pool.query(
    `SELECT COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = $1 AND l.expiry_date > current_date), 0)::float8 AS free,
            (SELECT a.severity::text || ':' || a.status::text FROM stock_alert a
              WHERE a.hospital_drug_id = $1 AND a.type = 'LOW_STOCK' AND a.granularity = 'WEEK' AND a.status IN ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED')
              ORDER BY a.created_at DESC LIMIT 1) AS alert`, [hdId])).rows[0];
  return { free: Number(r.free), alert: (r.alert as string | null) ?? null };
}

/**
 * Receive (delta > 0: a new lot, ledger IMPORT) or use (delta < 0: FEFO, ledger ISSUE_USAGE) stock of one hospital drug.
 * Afterwards the stock alerts are re-evaluated (and, for a short-dated lot, the near-expiry scan runs) so the screens show the effect now.
 */
export async function adjustStock(input: { hospital: string; hospitalDrugId: string; delta: number; expiryDays?: number }) {
  const delta = Math.trunc(Number(input.delta));
  if (!Number.isFinite(delta) || delta === 0) throw bad('ระบุจำนวนที่ไม่ใช่ 0');
  if (Math.abs(delta) > 1_000_000) throw bad('จำนวนมากเกินไป (สูงสุด 1,000,000 ต่อครั้ง)');
  const expiryDays = Math.trunc(Number(input.expiryDays ?? 365));
  if (delta > 0 && (!Number.isFinite(expiryDays) || expiryDays < 1 || expiryDays > 1095)) throw bad('วันหมดอายุต้องอยู่ระหว่าง 1-1095 วัน');

  const hd = (await pool.query(
    `SELECT hd.id, hd.hospital_id, dm.generic_name AS name, h.code,
            (SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = hd.id AND pack_size_base_units IS NOT NULL LIMIT 1) AS pack
       FROM hospital_drug hd JOIN hospital h ON h.id = hd.hospital_id JOIN drug_master dm ON dm.id = hd.drug_master_id
      WHERE hd.id = $1 AND h.code = $2 AND hd.active`, [input.hospitalDrugId, input.hospital])).rows[0];
  if (!hd) throw bad('ไม่พบยานี้ในบัญชียาของโรงพยาบาลที่เลือก');

  return withDemoLock(`ปรับสต็อก ${hd.code} ${hd.name}`, async () => {
    const before = await snapshot(hd.id);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      if (delta > 0) await addStock(c, hd.id, hd.hospital_id, `DEMO-ADJ-${hd.code}-${Date.now().toString(36).toUpperCase()}`, delta, expiryDays, hd.pack);
      else await drain(c, hd.id, hd.hospital_id, -delta, 'DEMO_ADJUST');
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    const ev = await reevaluateAlerts();
    let detected: number | null = null;
    if (delta > 0 && expiryDays <= 180) {
      const scan = (await runExpiryJobs()) as Record<string, number>;
      detected = Number(scan.detected ?? 0);
    }
    const after = await snapshot(hd.id);
    return {
      success: true,
      hospital: hd.code,
      drug: hd.name as string,
      requested: delta,
      applied: Math.round(after.free - before.free),
      before,
      after,
      alertsChanged: ev.map((e) => ({ granularity: e.granularity, opened: e.alerts.opened, closed: e.alerts.closed })),
      nearExpiryDetected: detected,
    };
  });
}
