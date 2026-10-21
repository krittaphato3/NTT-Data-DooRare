/**
 * Return obligations (spec SM-7, BR-XC-003..005, 013): a borrower owes the lender the SAME drug in the SAME quantity.
 * Obligations are created when a borrow leg is received (transport workflow). Here: list, record a return, waive.
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { bodyObject, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import { adjustStock, ensureLot, findHospitalDrug, pickFefo } from '../../core/stock.js';
import { HttpError } from '../../middleware/httpError.js';
import type { Db } from '../../db/tx.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

const STATUSES = ['OPEN', 'REMINDED', 'RETURNED', 'OVERDUE', 'WAIVED'] as const;
const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;
const ROUND = (n: number) => Math.round(n * 1000) / 1000;

const SELECT = `
  SELECT ro.id, ro.leg_id, ro.status::text AS status, ro.return_mode, ro.qty::float8 AS qty, ro.qty_returned::float8 AS qty_returned,
         ro.due_date::text AS due_date, ro.returned_at, ro.waived_reason, ro.waived_by,
         ro.debtor_hospital_id, d.code AS debtor_code, d.name_th AS debtor_name,
         ro.creditor_hospital_id, c.code AS creditor_code, c.name_th AS creditor_name,
         ro.drug_master_id, COALESCE(${DRUG_NAME}, kt.name) AS drug_name, COALESCE(dm.base_unit, 'ชุด') AS base_unit,
         br.request_no, bl.round_no, wu.display_name AS waived_by_name,
         (SELECT a.occurred_at FROM audit_log a WHERE a.entity_type = 'return_obligation' AND a.entity_id = ro.id AND a.action = 'RETURN_WAIVED' ORDER BY a.id DESC LIMIT 1) AS waived_at,
         (SELECT hd.ved::text FROM hospital_drug hd WHERE hd.hospital_id = ro.debtor_hospital_id AND hd.drug_master_id = ro.drug_master_id ORDER BY hd.local_code LIMIT 1) AS ved,
         (ro.due_date < current_date AND ro.status IN ('OPEN', 'REMINDED', 'OVERDUE')) AS past_due
    FROM return_obligation ro
    JOIN hospital d ON d.id = ro.debtor_hospital_id
    JOIN hospital c ON c.id = ro.creditor_hospital_id
    JOIN borrow_leg bl ON bl.id = ro.leg_id
    JOIN borrow_request br ON br.id = bl.request_id
    LEFT JOIN drug_master dm ON dm.id = ro.drug_master_id
    LEFT JOIN kit_type kt ON kt.id = ro.kit_type_id
    LEFT JOIN app_user wu ON wu.id = ro.waived_by`;

function view(row: Record<string, any>, user: AuthSessionUser, receipts: any[] = []) {
  const mine = user.hospitalId;
  return {
    id: row.id,
    legId: row.leg_id,
    requestNo: row.request_no,
    roundNo: row.round_no === null ? null : Number(row.round_no),
    status: row.status,
    returnMode: row.return_mode,
    /** From the caller's hospital: OWE = we must return, OWED = we are waiting for a return; null for region-wide users. */
    direction: !mine ? null : row.debtor_hospital_id === mine ? 'OWE' : row.creditor_hospital_id === mine ? 'OWED' : null,
    drug: { id: row.drug_master_id, name: row.drug_name, baseUnit: row.base_unit, ved: row.ved ?? null },
    qty: row.qty,
    qtyReturned: row.qty_returned,
    qtyRemaining: ROUND(row.qty - row.qty_returned),
    dueDate: row.due_date,
    pastDue: Boolean(row.past_due),
    returnedAt: row.returned_at ? new Date(row.returned_at).toISOString() : null,
    waived: row.status === 'WAIVED' ? { reason: row.waived_reason, by: row.waived_by, byName: row.waived_by_name ?? null, at: row.waived_at ? new Date(row.waived_at).toISOString() : null } : null,
    debtor: { id: row.debtor_hospital_id, code: row.debtor_code, name: row.debtor_name },
    creditor: { id: row.creditor_hospital_id, code: row.creditor_code, name: row.creditor_name },
    receipts,
  };
}

async function receiptsFor(db: Db, ids: string[]): Promise<Map<string, any[]>> {
  const map = new Map<string, any[]>();
  if (ids.length === 0) return map;
  const result = await db.query(
    `SELECT rr.id, rr.obligation_id, rr.qty_base::float8 AS qty, rr.received_at, sl.lot_no, sl.expiry_date::text AS expiry_date, u.display_name
       FROM return_receipt rr LEFT JOIN stock_lot sl ON sl.id = rr.lot_id LEFT JOIN app_user u ON u.id = rr.received_by
      WHERE rr.obligation_id = ANY($1::uuid[]) ORDER BY rr.received_at`,
    [ids],
  );
  for (const row of result.rows) {
    const list = map.get(row.obligation_id) ?? [];
    list.push({ id: row.id, qty: row.qty, lotNo: row.lot_no, expiryDate: row.expiry_date, receivedAt: new Date(row.received_at).toISOString(), receivedBy: row.display_name });
    map.set(row.obligation_id, list);
  }
  return map;
}

export class ReturnsService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const status = oneOf(raw.status, STATUSES, 'status');
    const direction = oneOf(raw.direction, ['all', 'owe', 'owed'] as const, 'direction') ?? 'all';
    const params: unknown[] = [];
    const where: string[] = [];
    if (user.hospitalId) {
      params.push(user.hospitalId);
      const p = `$${params.length}`;
      where.push(direction === 'owe' ? `ro.debtor_hospital_id = ${p}` : direction === 'owed' ? `ro.creditor_hospital_id = ${p}` : `(ro.debtor_hospital_id = ${p} OR ro.creditor_hospital_id = ${p})`);
    }
    if (status) where.push(`ro.status = $${params.push(status)}::return_status`);
    params.push(page.limit + 1, page.offset);
    const result = await query(
      `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY (ro.status IN ('RETURNED', 'WAIVED')), ro.due_date, ro.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const slice = toPage(result.rows, page);
    const receipts = await receiptsFor(pool, slice.items.map((row) => row.id));
    return { ok: true, items: slice.items.map((row) => view(row, user, receipts.get(row.id) ?? [])), nextCursor: slice.nextCursor };
  }

  /** API-XC-004: record (part of) a return in kind. Debtor stock out FEFO, creditor stock in, one receipt per lot. */
  async recordReturn(req: Request, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const qty = optionalNumber(body.qty, 'qty', { min: 0.001 });
    if (qty === undefined) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ qty');
    const user = req.user!;
    return withTransaction(async (client) => {
      const ob = (await client.query(`${SELECT} WHERE ro.id = $1 FOR UPDATE OF ro`, [id])).rows[0];
      const mine = user.hospitalId;
      if (!ob || !mine || (ob.debtor_hospital_id !== mine && ob.creditor_hospital_id !== mine)) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบภาระการคืน');
      if (!['OPEN', 'REMINDED', 'OVERDUE'].includes(ob.status)) throw new HttpError(409, 'ALREADY_DECIDED', `ภาระการคืนนี้ปิดแล้ว (${ob.status})`);
      if (ob.return_mode !== 'IN_KIND') throw new HttpError(422, 'VALIDATION', 'การคืนเลือดทำโดยธนาคารเลือด ยังไม่รองรับใน API นี้');
      if (!ob.drug_master_id) throw new HttpError(422, 'VALIDATION', 'การคืนชุดยายังไม่รองรับใน API นี้');
      const remaining = ROUND(ob.qty - ob.qty_returned);
      if (qty > remaining + 1e-9) throw new HttpError(400, 'VALIDATION', `คืนได้ไม่เกินที่ค้างอยู่ (${remaining})`);

      const picks = await pickFefo(client, ob.debtor_hospital_id, ob.drug_master_id, qty);
      const creditorListing = await findHospitalDrug(client, ob.creditor_hospital_id, ob.drug_master_id);
      if (!creditorListing) throw new HttpError(409, 'MAPPING_NOT_VERIFIED', 'ผู้ให้ยืมไม่มีรายการยานี้ในบัญชียาของตน');
      for (const pick of picks) {
        await adjustStock(client, ob.debtor_hospital_id, { lotId: pick.lotId, delta: -pick.qty, reason: 'RETURN_OUT', refType: 'return_obligation', refId: id, actorId: user.id });
        const creditorLot = await ensureLot(client, ob.creditor_hospital_id, creditorListing, { lotNo: pick.lotNo, expiryDate: pick.expiryDate, manufacturer: pick.manufacturer });
        await adjustStock(client, ob.creditor_hospital_id, { lotId: creditorLot, delta: pick.qty, reason: 'RETURN_IN', refType: 'return_obligation', refId: id, actorId: user.id });
        await client.query(
          `INSERT INTO return_receipt (obligation_id, drug_master_id, lot_id, qty_local, qty_base, received_by) VALUES ($1, $2, $3, $4, $4, $5)`,
          [id, ob.drug_master_id, creditorLot, pick.qty, user.id],
        );
      }
      const done = ROUND(ob.qty_returned + qty) >= ob.qty - 1e-9;
      await client.query(
        `UPDATE return_obligation SET qty_returned = qty_returned + $2, status = CASE WHEN $3 THEN 'RETURNED'::return_status ELSE status END,
                returned_at = CASE WHEN $3 THEN now() ELSE returned_at END WHERE id = $1`,
        [id, qty, done],
      );
      await writeAudit(client, auditContext(req), {
        action: done ? 'RETURN_COMPLETED' : 'RETURN_RECORDED',
        entityType: 'return_obligation',
        entityId: id,
        before: { qtyReturned: ob.qty_returned, status: ob.status },
        after: { qtyReturned: ROUND(ob.qty_returned + qty), status: done ? 'RETURNED' : ob.status },
      });
      const row = (await client.query(`${SELECT} WHERE ro.id = $1`, [id])).rows[0];
      const receipts = await receiptsFor(client, [id]);
      const data = view(row, user, receipts.get(id) ?? []);
      return { ok: true, id, data };
    });
  }

  /**
   * API-XC-005: a hospital admin of either party waives the remaining quantity (spec says only "HOSPITAL_ADMIN with reason";
   * the pharmacist screen has the debtor's admin do it). Allowed from OPEN or OVERDUE only (SM-7). The reason is audited.
   */
  async waive(req: Request, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลในการยกเว้น (อย่างน้อย 3 ตัวอักษร)');
    const user = req.user!;
    return withTransaction(async (client) => {
      const ob = (await client.query(`${SELECT} WHERE ro.id = $1 FOR UPDATE OF ro`, [id])).rows[0];
      const mine = user.hospitalId;
      if (!ob || !mine || (ob.debtor_hospital_id !== mine && ob.creditor_hospital_id !== mine)) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบภาระการคืน');
      if (!['OPEN', 'OVERDUE'].includes(ob.status)) throw new HttpError(409, 'ALREADY_DECIDED', `ยกเว้นไม่ได้ในสถานะ ${ob.status}`);
      await client.query(`UPDATE return_obligation SET status = 'WAIVED', waived_reason = $2, waived_by = $3 WHERE id = $1`, [id, reason, user.id]);
      await writeAudit(client, auditContext(req), {
        action: 'RETURN_WAIVED',
        entityType: 'return_obligation',
        entityId: id,
        before: { status: ob.status, qtyReturned: ob.qty_returned },
        after: { status: 'WAIVED', qtyRemaining: ROUND(ob.qty - ob.qty_returned), side: ob.creditor_hospital_id === mine ? 'CREDITOR' : 'DEBTOR' },
        reason,
      });
      const row = (await client.query(`${SELECT} WHERE ro.id = $1`, [id])).rows[0];
      return { ok: true, id, data: view(row, user, (await receiptsFor(client, [id])).get(id) ?? []) };
    });
  }
}

export const returnsService = new ReturnsService();
