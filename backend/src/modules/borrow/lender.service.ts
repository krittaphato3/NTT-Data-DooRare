/**
 * Lender side of F1b: the queue of incoming requests (API-F1b-008) and the answer to one leg (API-F1b-009).
 * Accepting reserves the lots (FEFO, >= lot_min_remaining_days left), creates the transport task and lets the request
 * react (stop rule / next lender) in the same transaction.
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { lendableStock } from '../../core/formulas/borrow.js';
import { notifyRoles } from '../../core/notify.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { holdStock, pickFefo } from '../../core/stock.js';
import type { FefoPick } from '../../core/stock.js';
import { createTransportTask } from '../../core/transportTask.js';
import { bodyObject, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { loadBorrowConfig } from './borrow.config.js';
import { advanceRequest } from './borrow.flow.js';
import { findListing, latestForecast, usableStock } from './borrow.inputs.js';

const QUEUE_GROUPS: Record<string, string[]> = {
  pending: ['SENT'],
  confirmed: ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'],
  done: ['RECEIVED'],
  declined: ['REJECTED', 'TIMED_OUT', 'CANCELLED'],
};

const mustBeLender = (user: AuthSessionUser): string => {
  if (!user.hospitalId) throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้ใช้ของโรงพยาบาล');
  return user.hospitalId;
};

/** What the lender may give now: usable lots with enough shelf life, minus the hospital's own target (F-14). */
async function lendableNow(db: Db, hospitalId: string, drugMasterId: string, minDays: number): Promise<{ lendable: number; usable: number; target: number }> {
  const listing = await findListing(db, hospitalId, drugMasterId);
  if (!listing) return { lendable: 0, usable: 0, target: 0 };
  const usable = await usableStock(db, listing.id, minDays);
  const f = await latestForecast(db, listing.id, 'WEEK');
  const target = f?.total_target ?? f?.p50 ?? 0;
  return { lendable: lendableStock(usable, target), usable, target };
}

async function lotOptions(db: Db, hospitalId: string, drugMasterId: string, minDays: number) {
  const r = await db.query(
    `SELECT sl.id, sl.lot_no, sl.expiry_date::text AS expiry_date, sl.manufacturer, (sl.qty_on_hand - sl.qty_held)::float8 AS free, (sl.expiry_date - current_date) AS days_left
       FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
      WHERE sl.hospital_id = $1 AND hd.drug_master_id = $2 AND sl.expiry_date > current_date AND sl.qty_on_hand > sl.qty_held
      ORDER BY sl.expiry_date, sl.lot_no`,
    [hospitalId, drugMasterId],
  );
  return r.rows.map((l) => ({ lotId: l.id, lotNo: l.lot_no, expiryDate: l.expiry_date, manufacturer: l.manufacturer, free: l.free, daysLeft: Number(l.days_left), lendable: Number(l.days_left) > minDays }));
}

const QUEUE_SELECT = `
  SELECT bl.id, bl.request_id, bl.round_no, bl.status::text AS status, bl.qty_asked::float8 AS qty_asked, bl.qty_accepted::float8 AS qty_accepted, bl.qty_received::float8 AS qty_received,
         bl.sent_at, bl.deadline_at, bl.reminded_at, bl.responded_at, bl.reject_reason, bl.message_text, br.request_no, br.urgency::text AS urgency, br.reason, br.context::text AS context,
         (SELECT hd.ved::text FROM hospital_drug hd WHERE hd.hospital_id = br.borrower_hospital_id AND hd.drug_master_id = i.drug_master_id LIMIT 1) AS ved,
         br.borrower_hospital_id, bh.code AS borrower_code, COALESCE(bh.name_th, bh.name_en) AS borrower_name,
         i.drug_master_id, COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), kt.name) AS drug_name, COALESCE(dm.base_unit, 'ชุด') AS base_unit, COALESCE(dm.is_cold_chain, kt.needs_cold_chain, false) AS cold_chain,
         tt.id AS task_id, tt.task_no, tt.status::text AS task_status
    FROM borrow_leg bl
    JOIN borrow_request br ON br.id = bl.request_id
    JOIN LATERAL (SELECT x.* FROM borrow_request_item x WHERE x.request_id = bl.request_id ORDER BY (x.id = bl.request_item_id) DESC, x.id LIMIT 1) i ON true
    LEFT JOIN drug_master dm ON dm.id = i.drug_master_id
    LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
    JOIN hospital bh ON bh.id = br.borrower_hospital_id
    LEFT JOIN transport_task tt ON tt.ref_type = 'BORROW_LEG' AND tt.ref_id = bl.id AND tt.status <> 'CANCELLED'`;

export class LenderService {
  async queue(user: AuthSessionUser, raw: Record<string, unknown>) {
    const hospitalId = mustBeLender(user);
    const page = parsePage(raw);
    const params: unknown[] = [hospitalId];
    const where = ['bl.lender_hospital_id = $1'];
    if (typeof raw.status === 'string') {
      const statuses = QUEUE_GROUPS[raw.status] ?? raw.status.split(',');
      where.push(`bl.status::text = ANY($${params.push(statuses)}::text[])`);
    }
    params.push(page.limit + 1, page.offset);
    const rows = (
      await query(
        `${QUEUE_SELECT} WHERE ${where.join(' AND ')}
          ORDER BY (bl.status = 'SENT') DESC, CASE WHEN bl.status = 'SENT' THEN bl.deadline_at END, bl.sent_at DESC NULLS LAST, bl.id
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
    ).rows;
    const slice = toPage(rows, page);
    const cfg = await loadBorrowConfig(pool, hospitalId);
    const now = Date.now();
    const items = [];
    for (const l of slice.items) {
      const pending = l.status === 'SENT';
      const stockInfo = pending ? await lendableNow(pool, hospitalId, l.drug_master_id, cfg.lotMinRemainingDays) : null;
      items.push({
        id: l.id,
        requestId: l.request_id,
        requestNo: l.request_no,
        round: Number(l.round_no),
        status: l.status,
        urgency: l.urgency,
        reason: l.reason,
        context: l.context,
        ved: l.ved,
        borrower: { id: l.borrower_hospital_id, code: l.borrower_code, name: l.borrower_name },
        drug: { id: l.drug_master_id, name: l.drug_name, baseUnit: l.base_unit, coldChain: l.cold_chain },
        qtyAsked: l.qty_asked,
        qtyAccepted: l.qty_accepted,
        qtyReceived: l.qty_received,
        sentAt: l.sent_at ? new Date(l.sent_at).toISOString() : null,
        deadlineAt: l.deadline_at ? new Date(l.deadline_at).toISOString() : null,
        remainingSec: pending && l.deadline_at ? Math.max(0, Math.round((new Date(l.deadline_at).getTime() - now) / 1000)) : null,
        rejectReason: l.reject_reason,
        messageText: l.message_text,
        task: l.task_id ? { id: l.task_id, taskNo: l.task_no, status: l.task_status } : null,
        ...(stockInfo
          ? { lendable: stockInfo.lendable, usableForLending: stockInfo.usable, ownTarget: stockInfo.target, lots: await lotOptions(pool, hospitalId, l.drug_master_id, cfg.lotMinRemainingDays) }
          : {}),
      });
    }
    return { ok: true, items, nextCursor: slice.nextCursor };
  }

  /** API-F1b-009: ACCEPT (full), PARTIAL (qty < asked) or REJECT (reason required). */
  async respond(req: Request, rawLegId: string) {
    const user = req.user!;
    const hospitalId = mustBeLender(user);
    const legId = uuidParam(rawLegId, 'legId');
    const body = bodyObject(req.body);
    const decision = oneOf(body.decision, ['ACCEPT', 'PARTIAL', 'REJECT'] as const, 'decision');
    if (!decision) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ decision (ACCEPT | PARTIAL | REJECT)');
    const version = optionalNumber(body.version, 'version', { min: 1 });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (decision === 'REJECT' && reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลที่ปฏิเสธ');

    return withTransaction(async (client) => {
      const leg = (
        await client.query(
          `SELECT bl.id, bl.request_id, bl.status::text AS status, bl.qty_asked::float8 AS qty_asked, bl.lender_hospital_id, bl.sent_at, bl.deadline_at, bl.window_max_days,
                  br.borrower_hospital_id, br.request_no, br.status::text AS request_status, i.drug_master_id, COALESCE(dm.base_unit, 'ชุด') AS base_unit,
                  COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), kt.name) AS drug_name, COALESCE(dm.is_cold_chain, kt.needs_cold_chain, false) AS cold_chain
             FROM borrow_leg bl JOIN borrow_request br ON br.id = bl.request_id JOIN LATERAL (SELECT x.* FROM borrow_request_item x WHERE x.request_id = bl.request_id ORDER BY (x.id = bl.request_item_id) DESC, x.id LIMIT 1) i ON true LEFT JOIN drug_master dm ON dm.id = i.drug_master_id LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
            WHERE bl.id = $1 FOR UPDATE OF bl`,
          [legId],
        )
      ).rows[0];
      if (!leg || leg.lender_hospital_id !== hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอยืมที่ส่งถึงโรงพยาบาลนี้');
      if (leg.status !== 'SENT') throw new HttpError(409, 'ALREADY_DECIDED', `คำขอนี้อยู่ในสถานะ ${leg.status} ตอบไม่ได้แล้ว`, { status: leg.status });
      if (leg.deadline_at && new Date(leg.deadline_at).getTime() <= Date.now()) throw new HttpError(409, 'TIMED_OUT', 'หมดเวลาตอบแล้ว (ถือเป็นการปฏิเสธ)');
      if (!leg.drug_master_id) throw new HttpError(422, 'NOT_SUPPORTED', 'คำขอชุดยา (F3) ตอบด้วยขั้นตอนนี้ไม่ได้');
      void version; // legs have no version column; the status guard above is the concurrency check

      const ctx = auditContext(req);
      const onTime = decision !== 'REJECT' ? 1 : 0;
      await client.query(
        `INSERT INTO reliability_stat (lender_hospital_id, month, requests_received, accepted_on_time) VALUES ($1, date_trunc('month', now())::date, 1, $2)
         ON CONFLICT (lender_hospital_id, month) DO UPDATE SET requests_received = reliability_stat.requests_received + 1, accepted_on_time = reliability_stat.accepted_on_time + $2`,
        [hospitalId, onTime],
      );

      if (decision === 'REJECT') {
        await client.query(`UPDATE borrow_leg SET status = 'REJECTED', reject_reason = $2, responded_at = now(), responded_by = $3 WHERE id = $1`, [legId, reason, user.id]);
        await writeAudit(client, ctx, { action: 'LEG_REJECTED', entityType: 'borrow_leg', entityId: legId, after: { requestNo: leg.request_no, reason } });
        await notifyRoles(client, leg.borrower_hospital_id, ['PHARMACIST'], { kind: 'BORROW_LEG_REJECTED', title: `ผู้ให้ยืมปฏิเสธคำขอ ${leg.request_no}`, body: reason, refType: 'borrow_request', refId: leg.request_id });
        const next = await advanceRequest(client, leg.request_id, ctx);
        return { ok: true, id: legId, data: { id: legId, status: 'REJECTED', requestStatus: next.status, nextRoundLegs: next.newLegs } };
      }

      const asked = leg.qty_asked as number;
      const qty = decision === 'ACCEPT' ? asked : optionalNumber(body.qty, 'qty', { min: 0.001 });
      if (qty === undefined) throw new HttpError(400, 'VALIDATION', 'PARTIAL ต้องระบุ qty');
      if (decision === 'PARTIAL' && !(qty < asked)) throw new HttpError(422, 'VALIDATION', 'PARTIAL ต้องน้อยกว่าจำนวนที่ขอ');

      const cfg = await loadBorrowConfig(client, hospitalId);
      const now = await lendableNow(client, hospitalId, leg.drug_master_id, cfg.lotMinRemainingDays);
      if (qty > now.lendable + 1e-9) {
        throw new HttpError(422, 'GUARDRAIL_REJECTED', `ให้ยืมได้ไม่เกิน ${now.lendable} ${leg.base_unit} (เหลือสำหรับตัวเองตามเป้าหมาย ${now.target})`, { lendable: now.lendable, requested: qty });
      }

      let picks: FefoPick[];
      if (Array.isArray(body.lots) && body.lots.length > 0) {
        picks = [];
        let sum = 0;
        for (const raw of body.lots) {
          const lot = bodyObject(raw);
          const lotId = uuidParam(lot.lotId, 'lots[].lotId');
          const lotQty = optionalNumber(lot.qty, 'lots[].qty', { min: 0.001 });
          if (lotQty === undefined) throw new HttpError(400, 'VALIDATION', 'lots[].qty ต้องระบุ');
          const row = (
            await client.query(
              `SELECT sl.id, sl.lot_no, sl.expiry_date::text AS expiry_date, sl.manufacturer, (sl.qty_on_hand - sl.qty_held)::float8 AS free, hd.drug_master_id, (sl.expiry_date - current_date) AS days_left
                 FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id WHERE sl.id = $1 AND sl.hospital_id = $2 FOR UPDATE OF sl`,
              [lotId, hospitalId],
            )
          ).rows[0];
          if (!row || row.drug_master_id !== leg.drug_master_id) throw new HttpError(422, 'VALIDATION', 'ล็อตที่เลือกไม่ใช่ยานี้ของโรงพยาบาล');
          if (Number(row.days_left) <= cfg.lotMinRemainingDays) throw new HttpError(422, 'GUARDRAIL_REJECTED', `ล็อต ${row.lot_no} เหลืออายุไม่เกิน ${cfg.lotMinRemainingDays} วัน ให้ยืมไม่ได้ (BR-F1b-013)`);
          if (lotQty > row.free + 1e-9) throw new HttpError(409, 'INSUFFICIENT_STOCK', `ล็อต ${row.lot_no} คงเหลือไม่พอ`, { free: row.free });
          picks.push({ lotId, lotNo: row.lot_no, expiryDate: row.expiry_date, manufacturer: row.manufacturer, qty: lotQty });
          sum += lotQty;
        }
        if (Math.abs(sum - qty) > 1e-6) throw new HttpError(422, 'VALIDATION', `จำนวนรวมของล็อต (${sum}) ไม่ตรงกับจำนวนที่ให้ยืม (${qty})`);
      } else {
        picks = await pickFefo(client, hospitalId, leg.drug_master_id, qty, cfg.lotMinRemainingDays);
      }
      for (const p of picks) {
        await holdStock(client, hospitalId, p.lotId, p.qty);
        await client.query(`INSERT INTO borrow_leg_lot (leg_id, lot_id, qty) VALUES ($1, $2, $3)`, [legId, p.lotId, p.qty]);
      }
      const status = decision === 'ACCEPT' ? 'ACCEPTED' : 'PARTIAL';
      await client.query(`UPDATE borrow_leg SET status = $2::leg_status, qty_accepted = $3, responded_at = now(), responded_by = $4 WHERE id = $1`, [legId, status, qty, user.id]);

      const vehicle = (await client.query(`SELECT id FROM vehicle WHERE hospital_id = $1 AND active AND ($2::boolean = false OR has_cold_box) ORDER BY has_cold_box DESC, plate LIMIT 1`, [hospitalId, leg.cold_chain])).rows[0];
      const driver = (await client.query(`SELECT id FROM app_user WHERE hospital_id = $1 AND role = 'DRIVER' AND active ORDER BY display_name LIMIT 1`, [hospitalId])).rows[0];
      const task = await createTransportTask(client, { refType: 'BORROW_LEG', refId: legId, fromHospitalId: hospitalId, toHospitalId: leg.borrower_hospital_id, vehicleId: vehicle?.id ?? null, driverId: driver?.id ?? null });

      await writeAudit(client, ctx, { action: decision === 'ACCEPT' ? 'LEG_ACCEPTED' : 'LEG_PARTIAL', entityType: 'borrow_leg', entityId: legId, after: { requestNo: leg.request_no, qty, asked, lots: picks.map((p) => ({ lot: p.lotNo, qty: p.qty })), task: task.taskNo } });
      await notifyRoles(client, leg.borrower_hospital_id, ['PHARMACIST', 'WAREHOUSE_OFFICER'], {
        kind: 'BORROW_LEG_ACCEPTED',
        title: `${decision === 'ACCEPT' ? 'ผู้ให้ยืมตอบรับ' : 'ผู้ให้ยืมให้บางส่วน'} ${leg.request_no}: ${qty.toLocaleString('en-US')} ${leg.base_unit}`,
        refType: 'borrow_request',
        refId: leg.request_id,
      });
      const next = await advanceRequest(client, leg.request_id, ctx);
      return { ok: true, id: legId, data: { id: legId, status, qtyAccepted: qty, lots: picks, task, requestStatus: next.status, nextRoundLegs: next.newLegs } };
    });
  }
}

export const lenderService = new LenderService();
