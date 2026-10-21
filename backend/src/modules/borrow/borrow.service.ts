/**
 * Borrow requests (F1b, borrower side): create (API-F1b-001), list / detail (-002/-003), propose (-004), approve (-005),
 * reject (-006), edit ladder (-007), manual lender after escalation (-012), agent runs (-013).
 * Flow: DRAFT -> propose -> PENDING_APPROVAL -> approve -> APPROVED/IN_PROGRESS (legs sent) -> ... (borrow.flow.ts).
 * Numbers come from `core/formulas/borrow.ts`; this file only reads inputs, applies them and stores the result.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { normalUseQty, stopThreshold, timeoutPlan, round } from '../../core/formulas/borrow.js';
import type { Urgency } from '../../core/formulas/borrow.js';
import { notifyRoles } from '../../core/notify.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { hospitalForRead } from '../../core/scope.js';
import { bodyObject, isUuid, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { loadBorrowConfig } from './borrow.config.js';
import { advanceRequest, draftMessage, effectiveQty, loadLegs, loadRequest, sendLegs, setRequestStatus } from './borrow.flow.js';
import type { StoredLadder } from './borrow.flow.js';
import { findListing, loadNeed, usableStock } from './borrow.inputs.js';
import { buildLadder } from './borrow.ladder.js';
import type { LadderEntry } from './borrow.ladder.js';

const STATUS_GROUPS: Record<string, string[]> = {
  pending: ['DRAFT', 'PENDING_APPROVAL'],
  progress: ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED'],
  escalated: ['ESCALATED'],
  fulfilled: ['FULFILLED'],
  closed: ['CLOSED_UNFULFILLED', 'CANCELLED'],
};
const ALL_STATUSES = Object.values(STATUS_GROUPS).flat();
const ACTIVE_REQUEST = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED'];

const mustBePharmacistOf = (user: AuthSessionUser): string => {
  if (!user.hospitalId) throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้ใช้ของโรงพยาบาล');
  return user.hospitalId;
};

const DETAIL_SELECT = `
  SELECT br.id, br.request_no, br.status::text AS status, br.context::text AS context, br.urgency::text AS urgency, br.reason, br.version,
         br.borrower_hospital_id, COALESCE(bh.name_th, bh.name_en) AS borrower_name, bh.code AS borrower_code,
         br.stock_alert_id, br.first_round_qty::float8 AS first_round_qty, br.stop_threshold::float8 AS stop_threshold, br.ladder,
         br.created_at, br.updated_at, br.approved_at, cu.display_name AS created_by_name, au.display_name AS approved_by_name,
         i.id AS item_id, i.drug_master_id, i.qty_requested::float8 AS qty_requested, i.qty_fulfilled::float8 AS qty_fulfilled, i.r_value::float8 AS r_value,
         concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form) AS drug_name, dm.base_unit, COALESCE(dm.is_cold_chain, false) AS cold_chain,
         (SELECT hd.ved::text FROM hospital_drug hd WHERE hd.hospital_id = br.borrower_hospital_id AND hd.drug_master_id = i.drug_master_id LIMIT 1) AS ved
    FROM borrow_request br
    JOIN hospital bh ON bh.id = br.borrower_hospital_id
    JOIN app_user cu ON cu.id = br.created_by
    LEFT JOIN app_user au ON au.id = br.approved_by
    JOIN borrow_request_item i ON i.request_id = br.id
    JOIN drug_master dm ON dm.id = i.drug_master_id`;

const legView = (l: Record<string, any>, now = Date.now()) => ({
  id: l.id,
  lender: { id: l.lender_hospital_id, code: l.lender_code, name: l.lender_name },
  round: Number(l.round_no),
  rank: Number(l.rank_in_ladder),
  status: l.status,
  qtyAsked: l.qty_asked,
  qtyAccepted: l.qty_accepted,
  qtyReceived: l.qty_received,
  si: l.score_si === null ? null : Number(l.score_si),
  scoreParts: l.score_parts,
  transitMin: l.t_transit_min === null ? null : Number(l.t_transit_min),
  sentAt: l.sent_at ? new Date(l.sent_at).toISOString() : null,
  deadlineAt: l.deadline_at ? new Date(l.deadline_at).toISOString() : null,
  remainingSec: l.status === 'SENT' && l.deadline_at ? Math.max(0, Math.round((new Date(l.deadline_at).getTime() - now) / 1000)) : null,
  remindedAt: l.reminded_at ? new Date(l.reminded_at).toISOString() : null,
  respondedAt: l.responded_at ? new Date(l.responded_at).toISOString() : null,
  rejectReason: l.reject_reason,
  messageText: l.message_text,
});

export async function requestView(db: Db, row: Record<string, any>, viewer: AuthSessionUser) {
  const legs = (
    await db.query(
      `SELECT bl.id, bl.lender_hospital_id, bl.round_no, bl.rank_in_ladder, bl.status::text AS status, bl.qty_asked::float8 AS qty_asked, bl.qty_accepted::float8 AS qty_accepted,
              bl.qty_received::float8 AS qty_received, bl.score_si, bl.score_parts, bl.t_transit_min, bl.sent_at, bl.deadline_at, bl.reminded_at, bl.responded_at,
              bl.reject_reason, bl.message_text, h.code AS lender_code, COALESCE(h.name_th, h.name_en) AS lender_name
         FROM borrow_leg bl JOIN hospital h ON h.id = bl.lender_hospital_id WHERE bl.request_id = $1 ORDER BY bl.round_no, bl.rank_in_ladder`,
      [row.id],
    )
  ).rows;
  const isBorrower = viewer.hospitalId === row.borrower_hospital_id || !viewer.hospitalId;
  const visibleLegs = isBorrower ? legs : legs.filter((l) => l.lender_hospital_id === viewer.hospitalId);
  const effective = effectiveQty(legs.map((l) => ({ status: l.status, qty_accepted: l.qty_accepted, qty_received: l.qty_received })));
  const stored = row.ladder as StoredLadder | null;
  return {
    id: row.id,
    requestNo: row.request_no,
    status: row.status,
    context: row.context,
    urgency: row.urgency,
    reason: row.reason,
    version: Number(row.version),
    borrower: { id: row.borrower_hospital_id, code: row.borrower_code, name: row.borrower_name },
    drug: { id: row.drug_master_id, name: row.drug_name, baseUnit: row.base_unit, ved: row.ved, coldChain: row.cold_chain },
    qtyRequested: row.qty_requested,
    qtyFulfilled: row.qty_fulfilled,
    rValue: row.r_value,
    firstRoundQty: row.first_round_qty,
    stop: row.stop_threshold === null ? null : { threshold: row.stop_threshold, effective, remaining: Math.max(0, Math.ceil(row.qty_requested - effective - 1e-9)), met: effective >= row.stop_threshold },
    alertId: row.stock_alert_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by_name,
    approvedBy: row.approved_by_name,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    legs: visibleLegs.map((l) => legView(l)),
    ...(isBorrower && stored
      ? {
          proposal: {
            need: stored.need,
            ladder: stored.ladder.map((e) => ({ hospitalId: e.hospitalId, code: e.code, name: e.name, rank: e.rank, si: e.si, parts: e.parts, transitMin: e.transitMin, lendable: e.lendable, stock: e.stock, qtyPlanned: e.qtyPlanned, message: stored.drafts[e.hospitalId] ?? null })),
            excluded: stored.excluded,
            parallel: stored.parallel,
            builtAt: stored.builtAt,
          },
        }
      : {}),
  };
}

async function nextRequestNo(client: Db): Promise<string> {
  const prefix = `BR-${new Date().getFullYear()}-`;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const last = await client.query(`SELECT max(substring(request_no FROM '[0-9]+$')::int) AS n FROM borrow_request WHERE request_no LIKE $1`, [`${prefix}%`]);
  return `${prefix}${String(Number(last.rows[0].n ?? 0) + 1).padStart(6, '0')}`;
}

async function loadDetail(db: Db, id: string): Promise<Record<string, any>> {
  const row = (await db.query(`${DETAIL_SELECT} WHERE br.id = $1`, [id])).rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอยืม');
  return row;
}

function assertBorrower(user: AuthSessionUser, row: { borrower_hospital_id: string } | null | undefined): asserts row is { borrower_hospital_id: string } {
  if (!row || !user.hospitalId || row.borrower_hospital_id !== user.hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอยืม');
}

export class BorrowService {
  /** API-F1b-001: a DRAFT request with the borrow quantity from F-09 (or the pharmacist's own quantity for a manual request). */
  async create(req: Request) {
    const user = req.user!;
    const hospitalId = mustBePharmacistOf(user);
    const body = bodyObject(req.body);
    const context = oneOf(body.context, ['STOCK_ALERT', 'MANUAL'] as const, 'context') ?? (body.stockAlertId ? 'STOCK_ALERT' : 'MANUAL');
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > 1) throw new HttpError(422, 'VALIDATION', 'คำขอหนึ่งใบยืมยาได้ 1 รายการ');
    const item = items[0] && typeof items[0] === 'object' ? (items[0] as Record<string, unknown>) : {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    return withTransaction(async (client) => {
      let alert: { id: string; drug_master_id: string; status: string } | null = null;
      let drugMasterId = isUuid(item.drugMasterId) ? item.drugMasterId : null;
      if (body.stockAlertId !== undefined) {
        const a = (
          await client.query(
            `SELECT a.id, a.status::text AS status, a.hospital_id, hd.drug_master_id FROM stock_alert a JOIN hospital_drug hd ON hd.id = a.hospital_drug_id WHERE a.id = $1 FOR UPDATE OF a`,
            [uuidParam(body.stockAlertId, 'stockAlertId')],
          )
        ).rows[0];
        if (!a || a.hospital_id !== hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบการแจ้งเตือน');
        if (!['OPEN', 'ACKNOWLEDGED'].includes(a.status)) throw new HttpError(409, 'ALREADY_DECIDED', `สร้างคำขอจากแจ้งเตือนสถานะ ${a.status} ไม่ได้`);
        if (!a.drug_master_id) throw new HttpError(422, 'MAPPING_NOT_VERIFIED', 'รายการยายังไม่ได้จับคู่รหัสกลาง');
        alert = { id: a.id, drug_master_id: a.drug_master_id, status: a.status };
        drugMasterId = a.drug_master_id;
      }
      if (!drugMasterId) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ stockAlertId หรือ items[0].drugMasterId');
      const manualQty = optionalNumber(item.qtyRequested, 'qtyRequested', { min: 0.001 });
      if (context === 'MANUAL') {
        if (manualQty === undefined) throw new HttpError(400, 'VALIDATION', 'คำขอแบบกรอกเองต้องระบุ qtyRequested');
        if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'คำขอแบบกรอกเองต้องระบุเหตุผล');
      }
      const dup = await client.query(
        `SELECT br.request_no FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
          WHERE br.borrower_hospital_id = $1 AND i.drug_master_id = $2 AND br.status::text = ANY($3::text[]) LIMIT 1`,
        [hospitalId, drugMasterId, ACTIVE_REQUEST],
      );
      if (dup.rows[0]) throw new HttpError(409, 'CONFLICT', `มีคำขอยืมยานี้ที่ยังไม่ปิดแล้ว (${dup.rows[0].request_no})`, { requestNo: dup.rows[0].request_no });

      const cfg = await loadBorrowConfig(client, hospitalId);
      const need = await loadNeed(client, cfg, hospitalId, drugMasterId, context === 'MANUAL' ? manualQty : undefined);
      if (need.borrow <= 0) throw new HttpError(409, 'NO_NEED', 'สต็อกและของที่กำลังมาเพียงพอแล้ว ไม่ต้องยืม (BR-F1b-004)', { required: need.required, stock: need.stock, incoming: need.incoming });
      const urgency: Urgency = need.urgency;
      const qty = manualQty ?? need.borrow;
      const requestNo = await nextRequestNo(client);
      const normalUse = normalUseQty(need.u, need.leadDays, need.stock, need.incoming);
      const inserted = await client.query(
        `INSERT INTO borrow_request (request_no, borrower_hospital_id, context, status, urgency, stock_alert_id, reason, created_by, first_round_qty, stop_threshold)
         VALUES ($1, $2, $3::request_context, 'DRAFT', $4::alert_severity, $5, $6, $7, $8, $9) RETURNING id`,
        [requestNo, hospitalId, context, urgency, alert?.id ?? null, reason || null, user.id, qty, stopThreshold(need.ved, qty, normalUse, cfg.stopRatioV, cfg.stopRatioE)],
      );
      const id = inserted.rows[0].id;
      await client.query(`INSERT INTO borrow_request_item (request_id, kind, drug_master_id, qty_requested, r_value) VALUES ($1, 'DRUG', $2, $3, $4)`, [id, drugMasterId, qty, need.required === null ? null : round(need.required, 3)]);
      if (alert) await client.query(`UPDATE stock_alert SET status = 'LINKED_TO_REQUEST', updated_at = now(), version = version + 1 WHERE id = $1`, [alert.id]);
      await writeAudit(client, auditContext(req), { action: 'REQ_CREATED', entityType: 'borrow_request', entityId: id, after: { requestNo, context, qty, urgency, need: { u: need.u, leadDays: need.leadDays, required: need.required, stock: need.stock, incoming: need.incoming, flags: need.flags } } });
      const view = await requestView(client, await loadDetail(client, id), user);
      return { ok: true, id, version: view.version, data: { ...view, need } };
    });
  }

  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const role = oneOf(raw.role, ['borrower', 'lender', 'all'] as const, 'role') ?? 'borrower';
    const params: unknown[] = [hospitalId];
    const scope =
      role === 'borrower' ? 'br.borrower_hospital_id = $1'
      : role === 'lender' ? 'EXISTS (SELECT 1 FROM borrow_leg l WHERE l.request_id = br.id AND l.lender_hospital_id = $1)'
      : '(br.borrower_hospital_id = $1 OR EXISTS (SELECT 1 FROM borrow_leg l WHERE l.request_id = br.id AND l.lender_hospital_id = $1))';
    const where = [scope];
    if (typeof raw.status === 'string') {
      const statuses = STATUS_GROUPS[raw.status] ?? raw.status.split(',');
      for (const s of statuses) if (!ALL_STATUSES.includes(s)) throw new HttpError(400, 'INVALID_QUERY', `status ไม่ถูกต้อง: ${s}`);
      where.push(`br.status::text = ANY($${params.push(statuses)}::text[])`);
    }
    if (typeof raw.q === 'string' && raw.q.trim()) {
      params.push(`%${raw.q.trim()}%`);
      where.push(`(br.request_no ILIKE $${params.length} OR dm.generic_name ILIKE $${params.length})`);
    }
    params.push(page.limit + 1, page.offset);
    const result = await query(
      `${DETAIL_SELECT} WHERE ${where.join(' AND ')} ORDER BY br.created_at DESC, br.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const slice = toPage(result.rows, page);
    const items = [];
    for (const row of slice.items) items.push(await requestView(pool, row, user));
    return { ok: true, items, nextCursor: slice.nextCursor };
  }

  async detail(user: AuthSessionUser, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const row = await loadDetail(pool, id);
    const involved = !user.hospitalId || row.borrower_hospital_id === user.hospitalId
      || (await pool.query(`SELECT 1 FROM borrow_leg WHERE request_id = $1 AND lender_hospital_id = $2 LIMIT 1`, [id, user.hospitalId])).rowCount;
    if (!involved) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอยืม');
    const data = await requestView(pool, row, user);
    return { ok: true, id, version: data.version, data };
  }

  /** API-F1b-004: recompute need, rank lenders, draft messages, store the ladder; DRAFT/PENDING_APPROVAL -> PENDING_APPROVAL (or ESCALATED when nobody can lend). */
  async propose(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacistOf(user);
    const id = uuidParam(rawId, 'id');
    return withTransaction(async (client) => {
      const request = await loadRequest(client, id);
      assertBorrower(user, request);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(request!.status)) throw new HttpError(409, 'ALREADY_DECIDED', `เสนอแผนไม่ได้ในสถานะ ${request!.status}`);
      const r = request!;
      const cfg = await loadBorrowConfig(client, hospitalId);
      const ctx = (await client.query(`SELECT context::text AS context FROM borrow_request WHERE id = $1`, [id])).rows[0].context;
      const need = await loadNeed(client, cfg, hospitalId, r.drug_master_id, ctx === 'MANUAL' ? r.qty_requested : undefined);
      if (need.borrow <= 0) {
        await setRequestStatus(client, r, 'CANCELLED', auditContext(req), 'REQ_NO_NEED', { reason: 'NO_NEED' });
        if (r.stock_alert_id) await client.query(`UPDATE stock_alert SET status = 'ACKNOWLEDGED', updated_at = now(), version = version + 1 WHERE id = $1 AND status = 'LINKED_TO_REQUEST'`, [r.stock_alert_id]);
        throw new HttpError(409, 'NO_NEED', 'สต็อกเพียงพอแล้ว ปิดคำขอโดยไม่ต้องยืม (BR-F1b-004)');
      }
      const plan = await buildLadder(client, cfg, need, hospitalId);
      const timeout = timeoutPlan(need.urgency, need.stock, need.u, cfg.timeoutMin, cfg.reminderRatio);
      const drafts: Record<string, string> = {};
      for (const e of plan.ladder) {
        drafts[e.hospitalId] = draftMessage({ requester: r.borrower_name, drug: r.drug_name, qty: e.qtyPlanned || Math.min(e.lendable, need.borrow), unit: r.base_unit, urgency: need.urgency, round: e.qtyPlanned ? 1 : 2, deadlineMin: timeout.effectiveMin });
      }
      const stored: StoredLadder = {
        version: 1,
        need: { u: need.u, leadDays: need.leadDays, required: need.required, stock: need.stock, incoming: need.incoming, windowDays: need.windowDays, urgency: need.urgency, ved: need.ved, pattern: need.pattern, flags: need.flags },
        ladder: plan.ladder,
        excluded: plan.candidates.filter((c) => !c.eligible).map((c) => ({ hospitalId: c.hospitalId, code: c.code, reason: c.failure })),
        drafts,
        parallel: plan.parallel,
        builtAt: new Date().toISOString(),
      };
      const normalUse = normalUseQty(need.u, need.leadDays, need.stock, need.incoming);
      const noLender = plan.ladder.length === 0;
      await client.query(
        `UPDATE borrow_request SET ladder = $2::jsonb, urgency = $3::alert_severity, first_round_qty = $4, stop_threshold = $5, updated_at = now(), version = version + 1 WHERE id = $1`,
        [id, JSON.stringify(stored), need.urgency, need.borrow, stopThreshold(need.ved, need.borrow, normalUse, cfg.stopRatioV, cfg.stopRatioE)],
      );
      await client.query(`UPDATE borrow_request_item SET qty_requested = $2, r_value = $3 WHERE id = $1`, [r.item_id, need.borrow, need.required === null ? null : round(need.required, 3)]);
      const input = { hospitalId, drugMasterId: r.drug_master_id, qty: need.borrow, urgency: need.urgency };
      const run = (
        await client.query(
          `INSERT INTO agent_run (agent, task, ref_type, ref_id, hospital_id, model_id, input_hash, input, output, status, guardrail_hits)
           VALUES ('RULES', 'PROPOSE', 'borrow_request', $1, $2, NULL, $3, $4::jsonb, $5::jsonb, 'SKIPPED', $6::jsonb) RETURNING id`,
          [
            id, hospitalId, crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'), JSON.stringify({ ...input, need }),
            JSON.stringify({ mode: cfg.agentEnabled ? 'RULES_ONLY_NO_AGENT_CONNECTED' : 'AGENT_DISABLED', ladder: plan.ladder.map((e) => ({ hospitalId: e.hospitalId, si: e.si, qtyPlanned: e.qtyPlanned })), excluded: stored.excluded, drafts }),
            JSON.stringify([
              { rule: 'G-QTY', ok: plan.ladder.reduce((s, e) => s + e.qtyPlanned, 0) <= need.borrow, note: 'first round does not exceed the borrow quantity' },
              { rule: 'G-HARD-FILTER', ok: plan.ladder.every((e) => e.eligible), note: 'only lenders passing F-12' },
              { rule: 'G-PARALLEL', ok: plan.ladder.filter((e) => e.qtyPlanned > 0).length <= (plan.parallel ? cfg.maxParallel : 1), note: 'sequential, or up to max_parallel when very urgent' },
            ]),
          ],
        )
      ).rows[0];
      await writeAudit(client, auditContext(req), { action: 'REQ_PROPOSED', entityType: 'borrow_request', entityId: id, agentRunId: run.id, after: { ladder: plan.ladder.map((e) => ({ code: e.code, si: e.si, qtyPlanned: e.qtyPlanned })), excluded: stored.excluded } });
      const fresh = await loadRequest(client, id);
      if (noLender) {
        await setRequestStatus(client, fresh!, 'ESCALATED', auditContext(req), 'REQ_ESCALATED', { reason: 'NO_LENDER' });
        await notifyRoles(client, hospitalId, ['HOSPITAL_ADMIN'], { kind: 'BORROW_ESCALATED', title: `คำขอยืม ${fresh!.request_no} ไม่พบผู้ให้ยืมที่เหมาะสม`, body: 'พิจารณาสั่งซื้อฉุกเฉินหรือขอจากคลังเขต', refType: 'borrow_request', refId: id });
      } else {
        await setRequestStatus(client, fresh!, 'PENDING_APPROVAL', auditContext(req), 'REQ_PENDING_APPROVAL');
      }
      const data = await requestView(client, await loadDetail(client, id), user);
      return { ok: true, id, version: data.version, data };
    });
  }

  /** API-F1b-007: edit the first-round plan before approval (quantities per lender, message texts); the plan is re-validated. */
  async editLadder(req: Request, rawId: string) {
    const user = req.user!;
    mustBePharmacistOf(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const version = optionalNumber(body.version, 'version', { min: 1 });
    return withTransaction(async (client) => {
      const request = await loadRequest(client, id);
      assertBorrower(user, request);
      const r = request!;
      if (r.status !== 'PENDING_APPROVAL' || !r.ladder) throw new HttpError(409, 'ALREADY_DECIDED', 'แก้แผนได้เฉพาะคำขอที่รออนุมัติ');
      if (version !== undefined && version !== Number(r.version)) throw new HttpError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขโดยผู้อื่นแล้ว', { currentVersion: Number(r.version) });
      const cfg = await loadBorrowConfig(client, r.borrower_hospital_id);
      const stored = r.ladder;
      if (Array.isArray(body.legs)) {
        const wanted = new Map<string, number>();
        for (const raw of body.legs) {
          const leg = bodyObject(raw);
          const hospitalId = uuidParam(leg.hospitalId, 'legs[].hospitalId');
          const qty = optionalNumber(leg.qty, 'legs[].qty', { min: 0 });
          if (qty === undefined) throw new HttpError(400, 'VALIDATION', 'legs[].qty ต้องระบุ');
          const entry = stored.ladder.find((e) => e.hospitalId === hospitalId);
          if (!entry) throw new HttpError(422, 'GUARDRAIL_REJECTED', 'โรงพยาบาลนี้ไม่อยู่ในรายชื่อผู้ให้ยืมที่ผ่านเกณฑ์');
          if (qty > entry.lendable) throw new HttpError(422, 'GUARDRAIL_REJECTED', `ขอเกินจำนวนที่ให้ยืมได้ของ ${entry.code} (${entry.lendable})`);
          wanted.set(hospitalId, qty);
        }
        const active = [...wanted.values()].filter((q) => q > 0);
        const total = active.reduce((s, q) => s + q, 0);
        if (total > r.qty_requested + 1e-9) throw new HttpError(422, 'GUARDRAIL_REJECTED', 'ขอรวมเกินจำนวนที่ต้องยืม (BR-F1b-032)');
        if (active.length > (stored.parallel ? cfg.maxParallel : 1)) throw new HttpError(422, 'GUARDRAIL_REJECTED', stored.parallel ? `ส่งพร้อมกันได้ไม่เกิน ${cfg.maxParallel} แห่ง` : 'ส่งทีละแห่งเท่านั้น');
        for (const e of stored.ladder) e.qtyPlanned = wanted.get(e.hospitalId) ?? 0;
      }
      if (body.messages && typeof body.messages === 'object') {
        for (const [hospitalId, text] of Object.entries(body.messages as Record<string, unknown>)) {
          if (typeof text === 'string' && text.trim() && stored.ladder.some((e) => e.hospitalId === hospitalId)) stored.drafts[hospitalId] = text.trim();
        }
      }
      await client.query(`UPDATE borrow_request SET ladder = $2::jsonb, updated_at = now(), version = version + 1 WHERE id = $1`, [id, JSON.stringify(stored)]);
      await writeAudit(client, auditContext(req), { action: 'REQ_LADDER_EDITED', entityType: 'borrow_request', entityId: id, after: { plan: stored.ladder.map((e) => ({ code: e.code, qty: e.qtyPlanned })) } });
      const data = await requestView(client, await loadDetail(client, id), user);
      return { ok: true, id, version: data.version, data };
    });
  }

  /** API-F1b-005: human approval (HITL) freezes the ladder and sends the first round. */
  async approve(req: Request, rawId: string) {
    const user = req.user!;
    mustBePharmacistOf(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body ?? {});
    const version = optionalNumber(body.version, 'version', { min: 1 });
    return withTransaction(async (client) => {
      const request = await loadRequest(client, id);
      assertBorrower(user, request);
      const r = request!;
      if (r.status !== 'PENDING_APPROVAL' || !r.ladder) throw new HttpError(409, 'ALREADY_DECIDED', `อนุมัติไม่ได้ในสถานะ ${r.status}`);
      if (version !== undefined && version !== Number(r.version)) throw new HttpError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(r.version) });
      const cfg = await loadBorrowConfig(client, r.borrower_hospital_id);
      const stored = r.ladder;
      const planned = stored.ladder.filter((e) => e.qtyPlanned > 0);
      if (planned.length === 0) throw new HttpError(422, 'NO_LENDER', 'ไม่มีผู้ให้ยืมในรอบแรก');
      // re-validate against today's stock (FL-05: code re-validates before anything is sent)
      for (const e of planned) {
        const lendableNow = Math.max(0, (e.listingId ? await usableStock(client, e.listingId, cfg.lotMinRemainingDays) : 0) - (e.totalTarget ?? 0));
        if (lendableNow + 1e-9 < e.qtyPlanned) throw new HttpError(409, 'LADDER_STALE', `สต็อกของ ${e.code} เปลี่ยนไปแล้ว กรุณาเสนอแผนใหม่`, { hospital: e.code, lendableNow, planned: e.qtyPlanned });
      }
      if (body.messages && typeof body.messages === 'object') {
        for (const [hospitalId, text] of Object.entries(body.messages as Record<string, unknown>)) {
          if (typeof text === 'string' && text.trim() && stored.ladder.some((e) => e.hospitalId === hospitalId)) stored.drafts[hospitalId] = text.trim();
        }
      }
      await client.query(`UPDATE borrow_request SET status = 'APPROVED', approved_by = $2, approved_at = now(), ladder = $3::jsonb, updated_at = now(), version = version + 1 WHERE id = $1`, [id, user.id, JSON.stringify(stored)]);
      await writeAudit(client, auditContext(req), { action: 'REQ_APPROVED', entityType: 'borrow_request', entityId: id, before: { status: 'PENDING_APPROVAL' }, after: { status: 'APPROVED', plan: planned.map((e) => ({ code: e.code, qty: e.qtyPlanned })) } });
      const run = (await client.query(`SELECT id FROM agent_run WHERE ref_type = 'borrow_request' AND ref_id = $1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0];
      await client.query(
        `INSERT INTO decision_log (agent_run_id, ref_type, ref_id, decision, rationale, human_actor_id, human_action) VALUES ($1, 'borrow_request', $2, 'APPROVED', $3, $4, 'approve')`,
        [run?.id ?? null, id, `first round: ${planned.map((e) => `${e.code} ${e.qtyPlanned}`).join(', ')}`, user.id],
      );
      r.status = 'APPROVED';
      const sent = await sendLegs(client, r, planned.map((e) => ({ entry: e, qty: e.qtyPlanned })), 1, stored, {});
      await setRequestStatus(client, r, 'IN_PROGRESS', auditContext(req), 'LEG_SENT', { round: 1, legs: sent });
      const data = await requestView(client, await loadDetail(client, id), user);
      return { ok: true, id, version: data.version, data };
    });
  }

  /** API-F1b-006: reject / cancel before anything was sent; the linked alert goes back to ACKNOWLEDGED. */
  async reject(req: Request, rawId: string) {
    const user = req.user!;
    mustBePharmacistOf(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body ?? {});
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const request = await loadRequest(client, id);
      assertBorrower(user, request);
      const r = request!;
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(r.status)) throw new HttpError(409, 'ALREADY_DECIDED', `ยกเลิกไม่ได้ในสถานะ ${r.status}`);
      await setRequestStatus(client, r, 'CANCELLED', auditContext(req), 'REQ_REJECTED', { reason });
      await client.query(`UPDATE borrow_request SET reason = COALESCE(reason || ' | ', '') || $2 WHERE id = $1`, [id, `ยกเลิก: ${reason}`]);
      if (r.stock_alert_id) await client.query(`UPDATE stock_alert SET status = 'ACKNOWLEDGED', updated_at = now(), version = version + 1 WHERE id = $1 AND status = 'LINKED_TO_REQUEST'`, [r.stock_alert_id]);
      const run = (await client.query(`SELECT id FROM agent_run WHERE ref_type = 'borrow_request' AND ref_id = $1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0];
      await client.query(`INSERT INTO decision_log (agent_run_id, ref_type, ref_id, decision, rationale, human_actor_id, human_action) VALUES ($1, 'borrow_request', $2, 'REJECTED', $3, $4, 'reject')`, [run?.id ?? null, id, reason, user.id]);
      const data = await requestView(client, await loadDetail(client, id), user);
      return { ok: true, id, version: data.version, data };
    });
  }

  /** API-F1b-012: after an escalation, add a lender by hand (no Si, but the same guardrails on quantity and eligibility basics). */
  async escalateManual(req: Request, rawId: string) {
    const user = req.user!;
    mustBePharmacistOf(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const lenderId = uuidParam(body.lenderHospitalId, 'lenderHospitalId');
    const qty = optionalNumber(body.qty, 'qty', { min: 0.001 });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (qty === undefined) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ qty');
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล');
    return withTransaction(async (client) => {
      const request = await loadRequest(client, id);
      assertBorrower(user, request);
      const r = request!;
      if (r.status !== 'ESCALATED') throw new HttpError(409, 'ALREADY_DECIDED', 'เพิ่มผู้ให้ยืมด้วยมือได้เมื่อคำขอถูกส่งต่อ (ESCALATED) เท่านั้น');
      if (lenderId === r.borrower_hospital_id) throw new HttpError(422, 'VALIDATION', 'เลือกโรงพยาบาลตัวเองไม่ได้');
      const lender = (await client.query(`SELECT id, active, agent_participation, COALESCE(name_th, name_en) AS name, code FROM hospital WHERE id = $1`, [lenderId])).rows[0];
      if (!lender || !lender.active) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบโรงพยาบาลผู้ให้ยืม');
      const listing = await findListing(client, lenderId, r.drug_master_id);
      if (!listing || !listing.mapped) throw new HttpError(422, 'MAPPING_NOT_VERIFIED', 'โรงพยาบาลนั้นไม่มีรายการยานี้ที่จับคู่รหัสแล้ว');
      const legs = await loadLegs(client, id);
      const remaining = Math.max(0, Math.ceil(r.qty_requested - effectiveQty(legs) - 1e-9));
      if (qty > remaining) throw new HttpError(422, 'GUARDRAIL_REJECTED', `ขอเกินจำนวนที่ยังขาด (${remaining})`);
      const stored = r.ladder as StoredLadder;
      const manual: LadderEntry = {
        hospitalId: lender.id, code: lender.code, name: lender.name, eligible: true, failure: null, listingId: listing.id, transitMin: 0, usableForLending: 0, totalTarget: null,
        lendable: qty, stock: 0, uLender: 0, approvalRate: null, timeoutRate: null, parts: { time: 0, fulfill: 0, stockSafety: 0, reliability: 0 }, si: 0, rank: stored.ladder.length + 1, qtyPlanned: qty,
      };
      const round = Math.max(0, ...legs.map((l) => l.round_no)) + 1;
      const text = draftMessage({ requester: r.borrower_name, drug: r.drug_name, qty, unit: r.base_unit, urgency: r.urgency, round, deadlineMin: 0 });
      await sendLegs(client, r, [{ entry: manual, qty }], round, stored, { [lender.id]: `${text} (เพิ่มโดยเภสัชกร: ${reason})` });
      await client.query(`UPDATE borrow_leg SET score_si = NULL, t_transit_min = NULL WHERE request_id = $1 AND lender_hospital_id = $2 AND round_no = $3`, [id, lender.id, round]);
      await setRequestStatus(client, r, 'IN_PROGRESS', auditContext(req), 'REQ_MANUAL_LENDER', { lender: lender.code, qty, reason });
      const data = await requestView(client, await loadDetail(client, id), user);
      return { ok: true, id, version: data.version, data };
    });
  }

  /** API-F1b-013: decision log of the request (agent runs and the human decisions). */
  async agentRuns(user: AuthSessionUser, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const row = await loadDetail(pool, id);
    if (user.hospitalId && row.borrower_hospital_id !== user.hospitalId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอยืม');
    const [runs, decisions] = await Promise.all([
      query(`SELECT id, agent, task, status, model_id, input, output, guardrail_hits, created_at FROM agent_run WHERE ref_type = 'borrow_request' AND ref_id = $1 ORDER BY created_at`, [id]),
      query(`SELECT d.id, d.decision, d.rationale, d.human_action, d.created_at, u.display_name FROM decision_log d LEFT JOIN app_user u ON u.id = d.human_actor_id WHERE d.ref_type = 'borrow_request' AND d.ref_id = $1 ORDER BY d.created_at`, [id]),
    ]);
    return {
      ok: true,
      items: runs.rows.map((r) => ({ id: r.id, agent: r.agent, task: r.task, status: r.status, modelId: r.model_id, input: r.input, output: r.output, guardrails: r.guardrail_hits, createdAt: new Date(r.created_at).toISOString() })),
      decisions: decisions.rows.map((d) => ({ id: d.id, decision: d.decision, rationale: d.rationale, humanAction: d.human_action, by: d.display_name, createdAt: new Date(d.created_at).toISOString() })),
    };
  }

  /** Called by the transport workflow when a leg was received. */
  async onLegReceived(client: import('pg').PoolClient, requestId: string): Promise<void> {
    await advanceRequest(client, requestId);
  }
}

export const borrowService = new BorrowService();
