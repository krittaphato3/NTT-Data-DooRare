/**
 * Near-expiry review (API-F2a-001..005, UI-07): list, release to the regional pool, keep, dismiss, withdraw.
 * State machine SM-2. Released quantity becomes HELD at the origin (ASM-12) and waits in the pool for the Agent's matching (not built yet: nothing is matched automatically).
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { fefoUsable, releasable } from '../../core/formulas/expiry.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { hospitalForRead } from '../../core/scope.js';
import { holdStock, releaseHeld } from '../../core/stock.js';
import { bodyObject, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { ACTIVE_PLAN } from './matching.js';
import { loadExpiryConfig } from './expiry.config.js';

const STATUS_GROUPS: Record<string, string[]> = {
  review: ['DETECTED'],
  released: ['RELEASED_TO_POOL', 'ALLOCATED'],
  kept: ['KEPT'],
  done: ['TRANSFERRED', 'DISMISSED'],
};

const SELECT = `
  SELECT ne.id, ne.hospital_id, ne.status::text AS status, ne.qty::float8 AS qty, (sl.expiry_date - current_date) AS days_left, ne.value_thb::float8 AS value_thb,
         ne.note, ne.review_after::text AS review_after, ne.decided_at, ne.created_at, ne.updated_at, ne.version,
         sl.id AS lot_id, sl.lot_no, sl.expiry_date::text AS expiry_date, (sl.qty_on_hand - sl.qty_held)::float8 AS lot_free, sl.qty_held::float8 AS lot_held,
         hd.id AS hd_id, hd.local_code, hd.local_name, hd.ved::text AS ved, hd.abc::text AS abc, hd.local_unit, COALESCE(hd.unit_price_thb, 0)::float8 AS unit_price,
         COALESCE(hd.expiry_threshold_days, $1::int) AS threshold_days, hd.drug_master_id, dm.base_unit,
         COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), hd.local_name) AS drug_name,
         COALESCE(dm.is_blood_product, false) AS blood, COALESCE(dm.is_controlled, false) AS controlled, COALESCE(dm.is_cold_chain, false) AS cold_chain,
         (SELECT m.status::text FROM drug_mapping m WHERE m.hospital_drug_id = hd.id ORDER BY (m.status = 'VERIFIED') DESC LIMIT 1) AS mapping_status,
         pe.id AS pool_id, pe.qty_available::float8 AS pool_qty_available, pe.released_at,
         (SELECT COALESCE(sum(al.qty), 0)::float8 FROM allocation_line al JOIN allocation_plan ap ON ap.id = al.plan_id WHERE ap.pool_entry_id = pe.id AND (ap.status::text = ANY($2::text[]) OR ap.status = 'COMPLETED')) AS in_plans,
         (SELECT ap.id FROM allocation_plan ap WHERE ap.pool_entry_id = pe.id AND ap.status = 'COMPLETED' ORDER BY ap.created_at DESC LIMIT 1) AS done_plan_id,
         (SELECT ap.plan_no FROM allocation_plan ap WHERE ap.pool_entry_id = pe.id AND ap.status = 'COMPLETED' ORDER BY ap.created_at DESC LIMIT 1) AS done_plan_no,
         (SELECT ap.plan_no FROM allocation_plan ap WHERE ap.pool_entry_id = pe.id AND ap.status::text = ANY($2::text[]) ORDER BY ap.created_at DESC LIMIT 1) AS plan_no,
         (SELECT ap.id FROM allocation_plan ap WHERE ap.pool_entry_id = pe.id AND ap.status::text = ANY($2::text[]) ORDER BY ap.created_at DESC LIMIT 1) AS plan_id,
         du.display_name AS decided_by_name
    FROM near_expiry_item ne
    JOIN stock_lot sl ON sl.id = ne.lot_id
    JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
    LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
    LEFT JOIN pool_entry pe ON pe.near_expiry_item_id = ne.id
    LEFT JOIN app_user du ON du.id = ne.decided_by`;

async function usageByListing(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = (await db.query(`SELECT DISTINCT ON (hospital_drug_id) hospital_drug_id, u_per_day::float8 AS u FROM v_latest_forecast WHERE granularity = 'WEEK' AND hospital_drug_id = ANY($1::uuid[]) ORDER BY hospital_drug_id, period_start DESC NULLS LAST`, [ids])).rows;
  return new Map(rows.map((r) => [r.hospital_drug_id, Number(r.u)]));
}

async function view(db: Db, rows: Record<string, any>[]) {
  const usage = await usageByListing(db, [...new Set(rows.map((r) => r.hd_id))]);
  const flags = rows.length
    ? (await db.query(`SELECT hospital_id, drug_master_id, level FROM repeat_expiry_flag WHERE (dismissed_until IS NULL OR dismissed_until < current_date) AND (hospital_id, drug_master_id) IN (SELECT x.hospital_id, x.drug_master_id FROM unnest($1::uuid[], $2::uuid[]) AS x(hospital_id, drug_master_id))`, [rows.map((r) => r.hospital_id), rows.map((r) => r.drug_master_id)])).rows
    : [];
  const out = [];
  for (const r of rows) {
    const u = usage.get(r.hd_id) ?? 0;
    const history = (
      await db.query(
        `SELECT sl.lot_no, ne.status::text AS status, ne.qty::float8 AS qty FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
          WHERE ne.id <> $1 AND hd.id = $2 ORDER BY ne.created_at DESC LIMIT 3`,
        [r.id, r.hd_id],
      )
    ).rows;
    const daysLeft = Number(r.days_left);
    const released = r.pool_id && ['RELEASED_TO_POOL', 'ALLOCATED', 'TRANSFERRED'].includes(r.status) ? r.pool_qty_available + r.in_plans : null;
    out.push({
      id: r.id,
      status: r.status,
      expired: daysLeft <= 0,
      lot: { id: r.lot_id, lotNo: r.lot_no, expiryDate: r.expiry_date, freeQty: r.lot_free, heldQty: r.lot_held },
      drug: { hospitalDrugId: r.hd_id, drugMasterId: r.drug_master_id, name: r.drug_name, localCode: r.local_code, localName: r.local_name, ved: r.ved, abc: r.abc, unit: r.base_unit ?? r.local_unit, coldChain: r.cold_chain, mapping: r.mapping_status },
      qty: r.qty,
      unitPrice: r.unit_price,
      valueThb: r.value_thb,
      daysLeft,
      thresholdDays: Number(r.threshold_days),
      usePerDay: u,
      fefoUsable: fefoUsable(daysLeft, u),
      releasable: Math.min(releasable(r.qty, daysLeft, u), r.lot_free),
      repeatFlag: flags.find((f) => f.hospital_id === r.hospital_id && f.drug_master_id === r.drug_master_id)?.level ?? null,
      detectedAt: new Date(r.created_at).toISOString(),
      releasedQty: released,
      poolEntryId: r.pool_id,
      plan: r.plan_id ? { id: r.plan_id, planNo: r.plan_no } : r.done_plan_id ? { id: r.done_plan_id, planNo: r.done_plan_no } : null,
      note: r.note,
      reviewAfter: r.review_after ?? null,
      decidedBy: r.decided_by_name,
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      history: history.map((h) => ({ lot: h.lot_no, status: h.status, qty: h.qty })),
      version: Number(r.version),
    });
  }
  return out;
}

const mustBePharmacist = (user: AuthSessionUser): string => {
  if (!user.hospitalId) throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้ใช้ของโรงพยาบาล');
  return user.hospitalId;
};

async function loadItem(client: Db, id: string, hospitalId: string, lock = false) {
  const cfg = await loadExpiryConfig(client, hospitalId);
  const row = (await client.query(`${SELECT} WHERE ne.id = $3 ${lock ? 'FOR UPDATE OF ne' : ''}`, [cfg.thresholdDaysDefault, ACTIVE_PLAN, id])).rows[0];
  if (!row || row.hospital_id !== hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการใกล้หมดอายุ');
  return row;
}

function assertVersion(row: { version: number }, version: number | undefined): void {
  if (version !== undefined && version !== Number(row.version)) throw new HttpError(409, 'VERSION_CONFLICT', 'รายการถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(row.version) });
}

export class NearExpiryService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const page = parsePage(raw);
    const cfg = await loadExpiryConfig(pool, hospitalId);
    const params: unknown[] = [cfg.thresholdDaysDefault, ACTIVE_PLAN, hospitalId];
    const where = ['ne.hospital_id = $3'];
    if (typeof raw.status === 'string') {
      const statuses = STATUS_GROUPS[raw.status] ?? raw.status.split(',');
      where.push(`ne.status::text = ANY($${params.push(statuses)}::text[])`);
    }
    if (typeof raw.q === 'string' && raw.q.trim()) {
      params.push(`%${raw.q.trim()}%`);
      where.push(`(dm.generic_name ILIKE $${params.length} OR hd.local_name ILIKE $${params.length} OR sl.lot_no ILIKE $${params.length})`);
    }
    params.push(page.limit + 1, page.offset);
    const rows = (await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY (ne.status = 'DETECTED') DESC, hd.ved, (sl.expiry_date - current_date), ne.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
    const slice = toPage(rows, page);
    const counts = (await query(`SELECT status::text AS status, count(*)::int AS n FROM near_expiry_item WHERE hospital_id = $1 GROUP BY 1`, [hospitalId])).rows;
    return { ok: true, items: await view(pool, slice.items), nextCursor: slice.nextCursor, meta: { byStatus: Object.fromEntries(counts.map((c) => [c.status, c.n])) } };
  }

  /** API-F2a-002: release `qty` (<= free quantity of the lot, BR-F2a-022) to the pool and hold it. */
  async release(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body ?? {});
    const version = optionalNumber(body.version, 'version', { min: 1 });
    const qtyBody = optionalNumber(body.qty, 'qty', { min: 0.001 });
    return withTransaction(async (client) => {
      const row = await loadItem(client, id, hospitalId, true);
      if (row.status !== 'DETECTED') throw new HttpError(409, 'ALREADY_DECIDED', `ปล่อยไม่ได้ในสถานะ ${row.status}`);
      assertVersion(row, version);
      if (Number(row.days_left) <= 0) throw new HttpError(409, 'EXPIRED', 'ล็อตนี้หมดอายุแล้ว ปล่อยเข้าคลังกลางไม่ได้');
      if (row.blood) throw new HttpError(422, 'VALIDATION', 'ส่วนประกอบโลหิตไม่ร่วมการแลกเปลี่ยนยาใกล้หมดอายุ (BR-F2a-031)');
      if (row.controlled) throw new HttpError(422, 'VALIDATION', 'ยาควบคุมพิเศษไม่เข้าการจัดสรรอัตโนมัติ (BR-F2a-027)');
      if (row.mapping_status !== 'VERIFIED' || !row.drug_master_id) throw new HttpError(422, 'MAPPING_NOT_VERIFIED', 'รายการยานี้ยังไม่ได้จับคู่รหัสกลาง จัดสรรไม่ได้ (BR-F2a-008)');
      const u = (await usageByListing(client, [row.hd_id])).get(row.hd_id) ?? 0;
      const qty = qtyBody ?? Math.min(releasable(row.qty, Number(row.days_left), u), row.lot_free);
      if (!(qty > 0)) throw new HttpError(422, 'VALIDATION', 'ไม่มีจำนวนที่ปล่อยได้ (FEFO ใช้ทัน) ระบุ qty เองหรือเลือกเก็บไว้ใช้เอง');
      if (qty > row.lot_free + 1e-9) throw new HttpError(422, 'VALIDATION', `ปล่อยได้ไม่เกินจำนวนที่ว่างในล็อต (${row.lot_free})`, { free: row.lot_free });
      await holdStock(client, hospitalId, row.lot_id, qty);
      const region = (await client.query(`SELECT region_id FROM hospital WHERE id = $1`, [hospitalId])).rows[0].region_id;
      const existing = (await client.query(`SELECT id FROM pool_entry WHERE near_expiry_item_id = $1 ORDER BY released_at DESC LIMIT 1`, [id])).rows[0];
      const poolRow = existing
        ? (await client.query(`UPDATE pool_entry SET qty_available = $2, released_at = now() WHERE id = $1 RETURNING id`, [existing.id, qty])).rows[0]
        : (await client.query(`INSERT INTO pool_entry (region_id, near_expiry_item_id, qty_available) VALUES ($1, $2, $3) RETURNING id`, [region, id, qty])).rows[0];
      await client.query(`UPDATE near_expiry_item SET status = 'RELEASED_TO_POOL', decided_by = $2, decided_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [id, user.id]);
      await writeAudit(client, auditContext(req), { action: 'NEAR_EXPIRY_RELEASED', entityType: 'near_expiry_item', entityId: id, before: { status: 'DETECTED' }, after: { status: 'RELEASED_TO_POOL', qty, lot: row.lot_no } });
      const fresh = await loadItem(client, id, hospitalId);
      return { ok: true, id, version: Number(fresh.version), data: (await view(client, [fresh]))[0] };
    });
  }

  /** API-F2a-003: keep for own use; the item returns to DETECTED after `days` (default 30) for a new decision. */
  async keep(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body ?? {});
    const version = optionalNumber(body.version, 'version', { min: 1 });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const row = await loadItem(client, id, hospitalId, true);
      const cfg = await loadExpiryConfig(client, hospitalId);
      const days = optionalNumber(body.reviewDays, 'reviewDays', { min: 1, max: 365 }) ?? cfg.keepReviewDays;
      if (row.status !== 'DETECTED') throw new HttpError(409, 'ALREADY_DECIDED', `เก็บไว้ไม่ได้ในสถานะ ${row.status}`);
      assertVersion(row, version);
      await client.query(`UPDATE near_expiry_item SET status = 'KEPT', note = $2, review_after = current_date + $3::int, decided_by = $4, decided_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [id, reason, Math.round(days), user.id]);
      await writeAudit(client, auditContext(req), { action: 'NEAR_EXPIRY_KEPT', entityType: 'near_expiry_item', entityId: id, reason, after: { reviewDays: days } });
      const fresh = await loadItem(client, id, hospitalId);
      return { ok: true, id, version: Number(fresh.version), data: (await view(client, [fresh]))[0] };
    });
  }

  async dismiss(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body ?? {});
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const row = await loadItem(client, id, hospitalId, true);
      if (!['DETECTED', 'KEPT'].includes(row.status)) throw new HttpError(409, 'ALREADY_DECIDED', `ยกเลิกรายการไม่ได้ในสถานะ ${row.status}`);
      assertVersion(row, optionalNumber(body.version, 'version', { min: 1 }));
      await client.query(`UPDATE near_expiry_item SET status = 'DISMISSED', note = $2, decided_by = $3, decided_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [id, reason, user.id]);
      await writeAudit(client, auditContext(req), { action: 'NEAR_EXPIRY_DISMISSED', entityType: 'near_expiry_item', entityId: id, reason });
      const fresh = await loadItem(client, id, hospitalId);
      return { ok: true, id, version: Number(fresh.version), data: (await view(client, [fresh]))[0] };
    });
  }

  /** API-F2a-005: take a released lot back (SM-2 RELEASED_TO_POOL -> DETECTED) only while no plan is active. */
  async withdraw(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body ?? {});
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const row = await loadItem(client, id, hospitalId, true);
      if (row.status !== 'RELEASED_TO_POOL' || !row.pool_id) throw new HttpError(409, 'ALREADY_DECIDED', `ถอนออกจากคลังกลางไม่ได้ในสถานะ ${row.status}`);
      assertVersion(row, optionalNumber(body.version, 'version', { min: 1 }));
      if (row.plan_id) throw new HttpError(409, 'PLAN_ACTIVE', `มีแผนจัดสรร ${row.plan_no} ที่ยังดำเนินการอยู่ ต้องยกเลิกแผนก่อน`, { planNo: row.plan_no });
      const qty = Number(row.pool_qty_available);
      if (qty > 0) await releaseHeld(client, hospitalId, row.lot_id, qty);
      const used = (await client.query(`SELECT 1 FROM allocation_plan WHERE pool_entry_id = $1 LIMIT 1`, [row.pool_id])).rowCount;
      if (used) await client.query(`UPDATE pool_entry SET qty_available = 0 WHERE id = $1`, [row.pool_id]);
      else await client.query(`DELETE FROM pool_entry WHERE id = $1`, [row.pool_id]);
      await client.query(`UPDATE near_expiry_item SET status = 'DETECTED', note = $2, decided_by = $3, decided_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [id, reason, user.id]);
      await writeAudit(client, auditContext(req), { action: 'NEAR_EXPIRY_WITHDRAWN', entityType: 'near_expiry_item', entityId: id, reason, after: { releasedHold: qty } });
      const fresh = await loadItem(client, id, hospitalId);
      return { ok: true, id, version: Number(fresh.version), data: (await view(client, [fresh]))[0] };
    });
  }
}

export const nearExpiryService = new NearExpiryService();
export { oneOf };
