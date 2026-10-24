/**
 * F3 emergency borrowing (API-F3-007 send, API-F3-008 lender confirmation, JOB for follow-ups).
 *
 * One `borrow_request` (context EMERGENCY, urgency VERY_URGENT, one item) per planned borrow line: a whole kit set (kind KIT)
 * or an extra item (kind DRUG, PRC group O included). Legs go out to the eligible hospitals at the same time (BR-F3-017):
 *  - those whose transit time fits the ETA, nearest first (at most `emergency.max_parallel`);
 *  - none fits the ETA -> only the fastest one, flagged LATE_FOR_ETA (BR-F3-021);
 *  - ETA unavailable -> the nearest three, flagged, staff may name lenders themselves (F-26).
 * The first lender to confirm wins its quantity; the other open legs are trimmed or cancelled at once (BR-F3-018). A partial
 * confirmation, a rejection or silence opens the next round for the remainder with farther hospitals (BR-F3-019/020); when
 * nobody is left the request is ESCALATED and staff get an alert (BR-F3-022). Transit times come from the distance matrix
 * (`hospital_distance.travel_minutes`), not from a live route service: that is the only source this deployment has.
 */
import type { Request } from 'express';
import type pg from 'pg';
import { auditContext, systemAuditContext, writeAudit } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { chooseLenders, emergencyTimeoutMin, etaRemainingMin } from '../../core/formulas/emergency.js';
import type { EmergencyClass } from '../../core/formulas/emergency.js';
import { holdKits } from '../../core/kitStock.js';
import { notifyRoles } from '../../core/notify.js';
import { holdStock, pickFefo } from '../../core/stock.js';
import { createTransportTask, defaultCarrier } from '../../core/transportTask.js';
import { parsePage, toPage } from '../../core/pagination.js';
import { bodyObject, isUuid, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { CONFIRMED_STATUSES, effectiveQty, LATE_ANSWER_REQUEST, lateAnswerSql } from '../borrow/borrow.flow.js';
import { nextRequestNo } from '../borrow/borrow.service.js';
import { loadEmergencyConfig } from './incidents.config.js';
import type { EmergencyConfig } from './incidents.config.js';
import { assertOpen, etaView, hospitalOf, ownIncident } from './incidents.shared.js';
import type { IncidentRow } from './incidents.shared.js';

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;
/** Request statuses that still count as covering a need (a cancelled, escalated or given-up request covers nothing). */
const LIVE_REQUEST = ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'FULFILLED'] as const;
const OPEN_REQUEST = ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED'] as const;
const lateConfirmable = (request: { status: string; incident: { status: string } }): boolean => LATE_ANSWER_REQUEST.includes(request.status) && request.incident.status === 'ACTIVE';

export interface BorrowLine {
  /** kit type id or drug master id: the same value `keyOf` reads from an existing request item. */
  key: string;
  kind: 'KIT' | 'DRUG';
  kitTypeId: string | null;
  drugMasterId: string | null;
  name: string;
  unit: string;
  cls: EmergencyClass;
  qty: number;
  blood: boolean;
  coldChain: boolean;
}

/** The borrow quantities of an approved plan written by this module (seed plans have no structured lines and cannot be sent). */
export async function linesFromPlan(db: Db, plan: Record<string, any>): Promise<BorrowLine[]> {
  const steps: Record<string, any>[] = Array.isArray(plan.steps) ? plan.steps : [];
  const check = steps.find((s) => s?.kind === 'CHECK');
  if (!check) throw new HttpError(409, 'LEGACY_PLAN', 'แผนนี้เป็นข้อมูลเดิม ส่งคำขอยืมจากแผนนี้ไม่ได้');
  const kits = (steps.find((s) => s.kind === 'BORROW_SET')?.kits ?? {}) as Record<string, number>;
  const extras = (steps.find((s) => s.kind === 'BORROW_ITEM')?.extras ?? {}) as Record<string, number>;
  const lines: BorrowLine[] = [];
  const kitCodes = Object.keys(kits).filter((c) => kits[c] > 0);
  if (kitCodes.length > 0) {
    const r = await db.query(`SELECT id, code, name, needs_cold_chain FROM kit_type WHERE code = ANY($1::text[])`, [kitCodes]);
    for (const k of r.rows) {
      lines.push({ key: k.id, kind: 'KIT', kitTypeId: k.id, drugMasterId: null, name: k.name, unit: 'ชุด', cls: (check.classes?.kits?.[k.code] as EmergencyClass) ?? 'SUPPORTIVE', qty: kits[k.code], blood: false, coldChain: k.needs_cold_chain });
    }
  }
  const drugIds = Object.keys(extras).filter((id) => extras[id] > 0 && isUuid(id));
  if (drugIds.length > 0) {
    const r = await db.query(`SELECT dm.id, ${DRUG_NAME} AS name, dm.base_unit, dm.emergency_class, dm.is_blood_product, dm.is_cold_chain FROM drug_master dm WHERE dm.id = ANY($1::uuid[])`, [drugIds]);
    for (const d of r.rows) {
      lines.push({ key: d.id, kind: 'DRUG', kitTypeId: null, drugMasterId: d.id, name: d.name, unit: d.base_unit, cls: d.emergency_class, qty: extras[d.id], blood: d.is_blood_product, coldChain: d.is_cold_chain });
    }
  }
  return lines.sort((a, b) => (a.cls === b.cls ? a.name.localeCompare(b.name) : a.cls === 'CRITICAL' ? -1 : 1));
}

interface Candidate {
  hospitalId: string;
  code: string;
  name: string;
  transitMin: number | null;
  avail: number;
}

async function findLenders(db: Db, borrowerId: string, line: { kind: 'KIT' | 'DRUG'; kitTypeId: string | null; drugMasterId: string | null; blood: boolean }, exclude: string[], cfg: EmergencyConfig): Promise<Candidate[]> {
  const common = `h.id <> $1 AND h.active AND h.region_id = (SELECT region_id FROM hospital WHERE id = $1) AND NOT (h.id = ANY($3::uuid[]))`;
  const transit = `LEFT JOIN hospital_distance d ON d.from_hospital_id = h.id AND d.to_hospital_id = $1`;
  const cols = `h.id, h.code, COALESCE(h.name_th, h.name_en) AS name, COALESCE(d.travel_minutes_override, d.travel_minutes)::float8 AS transit`;
  const rows =
    line.kind === 'KIT'
      ? (
          await db.query(
            `SELECT ${cols}, (ks.qty_ready - ks.qty_held)::float8 AS avail
               FROM hospital h JOIN kit_stock ks ON ks.hospital_id = h.id AND ks.kit_type_id = $2 ${transit}
              WHERE ${common} AND ks.qty_ready - ks.qty_held >= 1`,
            [borrowerId, line.kitTypeId, exclude],
          )
        ).rows
      : (
          await db.query(
            `SELECT ${cols}, free.avail
               FROM hospital h
               JOIN LATERAL (
                 SELECT sum(sl.qty_on_hand - sl.qty_held)::float8 AS avail
                   FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
                  WHERE sl.hospital_id = h.id AND hd.drug_master_id = $2 AND sl.expiry_date > current_date + $4::int AND sl.qty_on_hand > sl.qty_held
               ) free ON free.avail >= 1
               ${transit}
              WHERE ${common} AND ($5::boolean = false OR h.has_blood_bank)`,
            [borrowerId, line.drugMasterId, exclude, line.blood ? cfg.blood.prcOMinRemainingDays : 0, line.blood],
          )
        ).rows;
  return rows.map((r) => ({ hospitalId: r.id, code: r.code, name: r.name, transitMin: r.transit === null ? null : Number(r.transit), avail: Math.floor(Number(r.avail)) }));
}

const confirmedOf = (legs: { status: string; qty_accepted: number | null; qty_received: number | null }[]) => effectiveQty(legs);

async function requestLegs(db: Db, requestId: string) {
  return (
    await db.query(
      `SELECT id, lender_hospital_id, round_no, status::text AS status, qty_asked::float8 AS qty_asked, qty_accepted::float8 AS qty_accepted, qty_received::float8 AS qty_received
         FROM borrow_leg WHERE request_id = $1 ORDER BY round_no, rank_in_ladder`,
      [requestId],
    )
  ).rows as { id: string; lender_hospital_id: string; round_no: number; status: string; qty_asked: number; qty_accepted: number | null; qty_received: number | null }[];
}

async function alreadyNotified(db: Db, kind: string, refId: string): Promise<boolean> {
  return ((await db.query(`SELECT 1 FROM notification WHERE kind = $1 AND ref_id = $2 LIMIT 1`, [kind, refId])).rowCount ?? 0) > 0;
}

interface RequestCtx {
  id: string;
  requestNo: string;
  status: string;
  borrowerId: string;
  incident: IncidentRow;
  itemId: string;
  line: BorrowLine;
  qtyRequested: number;
}

async function loadRequestCtx(db: Db, requestId: string, lock: boolean): Promise<RequestCtx | null> {
  const r = (
    await db.query(
      `SELECT br.id, br.request_no, br.status::text AS status, br.borrower_hospital_id, br.incident_id, i.id AS item_id, i.kind::text AS kind, i.kit_type_id, i.drug_master_id, i.qty_requested::float8 AS qty,
              COALESCE(NULLIF(${DRUG_NAME}, ''), kt.name) AS name, COALESCE(dm.base_unit, 'ชุด') AS unit, COALESCE(dm.emergency_class, 'SUPPORTIVE') AS cls,
              COALESCE(dm.is_blood_product, false) AS blood, COALESCE(dm.is_cold_chain, kt.needs_cold_chain, false) AS cold, br.ladder
         FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
         LEFT JOIN drug_master dm ON dm.id = i.drug_master_id LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
        WHERE br.id = $1 AND br.context = 'EMERGENCY' ${lock ? 'FOR UPDATE OF br' : ''}`,
      [requestId],
    )
  ).rows[0];
  if (!r || !r.incident_id) return null;
  const incident = (await db.query(`SELECT * FROM incident WHERE id = $1`, [r.incident_id])).rows[0] as IncidentRow;
  let cls: EmergencyClass = r.cls;
  if (r.kind === 'KIT') {
    // kits are critical when the approved plan counts them in the Critical Minimum
    const plan = (await db.query(`SELECT steps FROM emergency_plan WHERE incident_id = $1 AND status = 'APPROVED' ORDER BY revision DESC LIMIT 1`, [r.incident_id])).rows[0];
    const code = (await db.query(`SELECT code FROM kit_type WHERE id = $1`, [r.kit_type_id])).rows[0]?.code;
    const check = Array.isArray(plan?.steps) ? plan.steps.find((s: Record<string, any>) => s?.kind === 'CHECK') : null;
    cls = (check?.classes?.kits?.[code] as EmergencyClass | undefined) ?? 'SUPPORTIVE';
  }
  return {
    id: r.id, requestNo: r.request_no, status: r.status, borrowerId: r.borrower_hospital_id, incident, itemId: r.item_id, qtyRequested: r.qty,
    line: { key: r.kind === 'KIT' ? r.kit_type_id : r.drug_master_id, kind: r.kind, kitTypeId: r.kit_type_id, drugMasterId: r.drug_master_id, name: r.name, unit: r.unit, cls, qty: r.qty, blood: r.blood, coldChain: r.cold },
  };
}

/** Sends one round of legs for `need` units to the chosen hospitals; returns how many were sent and the flags to show staff. */
async function sendRound(client: pg.PoolClient, ctx: AuditContext, req: RequestCtx, need: number, round: number, candidates: Candidate[], cfg: EmergencyConfig): Promise<{ sent: number; mode: string; late: boolean; chosen: string[] }> {
  const eta = etaView(req.incident);
  const remaining = etaRemainingMin(eta.minutes, new Date(req.incident.created_at), new Date());
  const { chosen, mode } = chooseLenders(candidates.map((c) => ({ hospitalId: c.hospitalId, transitMin: c.transitMin })), remaining, cfg.maxParallel);
  const timeout = emergencyTimeoutMin(req.line.cls, remaining, { critical: cfg.timeoutCriticalMin, supportive: cfg.timeoutSupportiveMin });
  const borrower = (await client.query(`SELECT COALESCE(name_th, name_en) AS name FROM hospital WHERE id = $1`, [req.borrowerId])).rows[0];
  let rank = 0;
  for (const pick of chosen) {
    const cand = candidates.find((c) => c.hospitalId === pick.hospitalId) as Candidate;
    const asked = Math.max(1, Math.min(need, cand.avail));
    rank += 1;
    const late = mode === 'FASTEST_LATE';
    const text = `เหตุฉุกเฉิน ${req.incident.incident_no}: ${borrower.name} ขอยืม ${req.line.name} ${asked.toLocaleString('en-US')} ${req.line.unit} ด่วนที่สุด กรุณายืนยันภายใน ${timeout} นาที`;
    const leg = (
      await client.query(
        `INSERT INTO borrow_leg (request_id, request_item_id, lender_hospital_id, round_no, rank_in_ladder, status, score_parts, t_transit_min, qty_asked, sent_at, deadline_at, message_text)
         VALUES ($1, $2, $3, $4, $5, 'SENT', $6::jsonb, $7, $8, now(), now() + make_interval(mins => $9::int), $10) RETURNING id`,
        [req.id, req.itemId, pick.hospitalId, round, rank, JSON.stringify({ emergency: true, class: req.line.cls, mode, ttransitSource: 'DISTANCE_MATRIX', lateForEta: late }), pick.transitMin, asked, timeout, text],
      )
    ).rows[0];
    await notifyRoles(client, pick.hospitalId, ['PHARMACIST', 'WAREHOUSE_OFFICER'], {
      kind: 'EMERGENCY_BORROW_REQUEST', title: `ขอยืมฉุกเฉิน ${req.line.name} ${asked} ${req.line.unit} จาก ${borrower.name}`, body: text, refType: 'borrow_leg', refId: leg.id,
    });
  }
  await writeAudit(client, ctx, { action: 'EMERGENCY_LEGS_SENT', entityType: 'borrow_request', entityId: req.id, after: { requestNo: req.requestNo, round, need, mode, timeoutMin: timeout, lenders: chosen.map((c) => c.hospitalId) } });
  return { sent: chosen.length, mode, late: mode === 'FASTEST_LATE', chosen: chosen.map((c) => c.hospitalId) };
}

async function alertStaff(client: pg.PoolClient, incident: IncidentRow, kind: string, title: string, body: string, refId: string): Promise<void> {
  if (await alreadyNotified(client, kind, refId)) return;
  await notifyRoles(client, incident.hospital_id, ['ER_STAFF', 'PHARMACIST', 'HOSPITAL_ADMIN'], { kind, title, body, refType: 'borrow_request', refId });
}

/**
 * Asks more hospitals for what is still missing, when nobody is answering (BR-F3-019/020/022). Safe to call repeatedly:
 * it does nothing while a leg is waiting, and sends/escalates at most once per state.
 */
export async function expandRequest(client: pg.PoolClient, ctx: AuditContext, requestId: string): Promise<{ newLegs: number; escalated: boolean }> {
  const req = await loadRequestCtx(client, requestId, true);
  if (!req || !(OPEN_REQUEST as readonly string[]).includes(req.status)) return { newLegs: 0, escalated: false };
  // once the close is requested nothing new is asked (the waiting legs were cancelled); reconciliation only settles what is confirmed
  if (req.incident.status !== 'ACTIVE') return { newLegs: 0, escalated: false };
  const legs = await requestLegs(client, requestId);
  if (legs.some((l) => l.status === 'SENT')) return { newLegs: 0, escalated: false };
  const need = Math.ceil(req.qtyRequested - confirmedOf(legs) - 1e-9);
  if (need <= 0) return { newLegs: 0, escalated: false };
  const cfg = await loadEmergencyConfig(client, req.borrowerId);
  const asked = [...new Set(legs.map((l) => l.lender_hospital_id))];
  const candidates = await findLenders(client, req.borrowerId, req.line, asked, cfg);
  const inFlight = legs.some((l) => (CONFIRMED_STATUSES as readonly string[]).includes(l.status) || l.status === 'RECEIVED');
  if (candidates.length === 0) {
    if (!inFlight) {
      await client.query(`UPDATE borrow_request SET status = 'ESCALATED', updated_at = now(), version = version + 1 WHERE id = $1`, [req.id]);
      await writeAudit(client, ctx, { action: 'EMERGENCY_REQUEST_ESCALATED', entityType: 'borrow_request', entityId: req.id, before: { status: req.status }, after: { requestNo: req.requestNo, need } });
      await alertStaff(client, req.incident, 'EMERGENCY_ALL_REJECTED', `ไม่มีโรงพยาบาลให้ยืม ${req.line.name} (${req.incident.incident_no})`, `ยังขาด ${need} ${req.line.unit} ติดต่อโรงพยาบาลด้วยวิทยุ/โทรศัพท์`, req.id);
      return { newLegs: 0, escalated: true };
    }
    await alertStaff(client, req.incident, 'EMERGENCY_REMAINDER_UNSOURCED', `ยังขาด ${need} ${req.line.unit} ของ ${req.line.name} (${req.incident.incident_no})`, 'ไม่มีโรงพยาบาลเหลือให้ขอส่วนที่ขาด', req.id);
    return { newLegs: 0, escalated: false };
  }
  const round = Math.max(0, ...legs.map((l) => l.round_no)) + 1;
  const result = await sendRound(client, ctx, req, need, round, candidates, cfg);
  if (result.late) {
    await alertStaff(client, req.incident, 'EMERGENCY_LATE_FOR_ETA', `ไม่มีโรงพยาบาลที่ส่ง ${req.line.name} ทัน ETA (${req.incident.incident_no})`, 'ขอไปยังแห่งที่เร็วที่สุด ของจะถึงหลังผู้ป่วย', req.id);
  }
  return { newLegs: result.sent, escalated: false };
}

/** Cancels waiting legs (and requests nobody confirmed) of an incident; confirmed legs keep running and are returned in kind later. */
export async function cancelOpenLegs(client: pg.PoolClient, incidentId: string, reason: string): Promise<{ legs: number; requests: number }> {
  const legs = await client.query(
    `UPDATE borrow_leg bl SET status = 'CANCELLED', reject_reason = $2
       FROM borrow_request br WHERE br.id = bl.request_id AND br.incident_id = $1 AND br.context = 'EMERGENCY' AND bl.status = 'SENT' RETURNING bl.lender_hospital_id, bl.request_id`,
    [incidentId, reason],
  );
  const requests = await client.query(
    `UPDATE borrow_request br SET status = 'CANCELLED', updated_at = now(), version = version + 1
      WHERE br.incident_id = $1 AND br.context = 'EMERGENCY' AND br.status IN ('APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED')
        AND NOT EXISTS (SELECT 1 FROM borrow_leg l WHERE l.request_id = br.id AND l.status IN ('ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT', 'RECEIVED')) RETURNING br.id`,
    [incidentId],
  );
  for (const lenderId of new Set(legs.rows.map((l) => l.lender_hospital_id as string))) {
    await notifyRoles(client, lenderId, ['PHARMACIST', 'WAREHOUSE_OFFICER'], { kind: 'EMERGENCY_BORROW_CANCELLED', title: 'ยกเลิกคำขอยืมฉุกเฉิน', body: reason, refType: 'incident', refId: incidentId });
  }
  return { legs: legs.rowCount ?? 0, requests: requests.rowCount ?? 0 };
}

/**
 * Lowers the quantity of a request (the plan needs less now): waiting legs are trimmed or cancelled, confirmed quantity is kept
 * (flagged for early return). Returns what changed.
 */
async function reduceRequest(client: pg.PoolClient, ctx: AuditContext, req: RequestCtx, newQty: number): Promise<{ qty: number; cancelledLegs: number; trimmedLegs: number; keptConfirmed: number }> {
  const legs = await requestLegs(client, req.id);
  const confirmed = confirmedOf(legs);
  const target = Math.max(newQty, confirmed);
  const left = target - confirmed;
  let cancelledLegs = 0;
  let trimmedLegs = 0;
  for (const l of legs.filter((x) => x.status === 'SENT')) {
    if (left <= 0) {
      await client.query(`UPDATE borrow_leg SET status = 'CANCELLED', reject_reason = 'PLAN_REDUCED' WHERE id = $1`, [l.id]);
      cancelledLegs += 1;
    } else if (l.qty_asked > left) {
      await client.query(`UPDATE borrow_leg SET qty_asked = $2 WHERE id = $1`, [l.id, left]);
      trimmedLegs += 1;
    }
  }
  if (target <= 0) {
    await client.query(`UPDATE borrow_request SET status = 'CANCELLED', updated_at = now(), version = version + 1 WHERE id = $1`, [req.id]);
  } else {
    await client.query(`UPDATE borrow_request_item SET qty_requested = $2 WHERE id = $1`, [req.itemId, target]);
    await client.query(`UPDATE borrow_request SET first_round_qty = $2, stop_threshold = $2, updated_at = now(), version = version + 1 WHERE id = $1`, [req.id, target]);
  }
  await writeAudit(client, ctx, { action: 'EMERGENCY_REQUEST_REDUCED', entityType: 'borrow_request', entityId: req.id, before: { qty: req.qtyRequested }, after: { requestNo: req.requestNo, qty: target, cancelledLegs, trimmedLegs, keptConfirmed: confirmed } });
  return { qty: target, cancelledLegs, trimmedLegs, keptConfirmed: confirmed };
}

export interface SendResult {
  created: { requestId: string; requestNo: string; name: string; qty: number; legs: number; mode: string; late: boolean }[];
  increased: { requestId: string; requestNo: string; name: string; qty: number; legs: number }[];
  reduced: { requestId: string; requestNo: string; name: string; qty: number; keptConfirmed: number }[];
  unchanged: string[];
  warnings: { code: string; line: string; message: string }[];
}

/**
 * Brings the incident's requests in line with the approved plan: new lines get requests, a larger need asks for the difference
 * only, a smaller need trims waiting legs. Calling it twice with no plan change changes nothing.
 */
export async function reconcileBorrowing(client: pg.PoolClient, ctx: AuditContext, user: { id: string }, incident: IncidentRow, lenderFilter: string[] | null, lenderPlan: Record<string, string[]> = {}): Promise<SendResult> {
  const plan = (await client.query(`SELECT * FROM emergency_plan WHERE incident_id = $1 AND status = 'APPROVED' ORDER BY revision DESC LIMIT 1`, [incident.id])).rows[0];
  if (!plan) throw new HttpError(409, 'NO_APPROVED_PLAN', 'ต้องอนุมัติแผนก่อนจึงจะส่งคำขอยืมได้');
  const cfg = await loadEmergencyConfig(client, incident.hospital_id);
  const lines = await linesFromPlan(client, plan);
  const result: SendResult = { created: [], increased: [], reduced: [], unchanged: [], warnings: [] };
  const hospital = (await client.query(`SELECT has_blood_bank FROM hospital WHERE id = $1`, [incident.hospital_id])).rows[0];

  const existing = (
    await client.query(
      `SELECT br.id, br.status::text AS status, i.kind::text AS kind, i.kit_type_id, i.drug_master_id, i.qty_requested::float8 AS qty
         FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
        WHERE br.incident_id = $1 AND br.context = 'EMERGENCY' AND br.status = ANY($2::text[]::request_status[]) ORDER BY br.created_at DESC`,
      [incident.id, [...LIVE_REQUEST]],
    )
  ).rows as { id: string; status: string; kind: string; kit_type_id: string | null; drug_master_id: string | null; qty: number }[];
  const keyOf = (e: { kind: string; kit_type_id: string | null; drug_master_id: string | null }) => (e.kind === 'KIT' ? e.kit_type_id : e.drug_master_id);

  // lines that disappeared from the plan are reduced to what is already confirmed
  const wanted = new Set(lines.map((l) => l.key));
  for (const e of existing.filter((x) => !wanted.has(keyOf(x) as string))) {
    const req = await loadRequestCtx(client, e.id, true);
    if (req && (OPEN_REQUEST as readonly string[]).includes(req.status)) {
      const r = await reduceRequest(client, ctx, req, 0);
      result.reduced.push({ requestId: req.id, requestNo: req.requestNo, name: req.line.name, qty: r.qty, keptConfirmed: r.keptConfirmed });
    }
  }

  for (const line of lines) {
    const mine = existing.filter((e) => keyOf(e) === line.key);
    const covered = mine.reduce((s, e) => s + e.qty, 0);
    if (line.qty > covered + 1e-9) {
      const allow = lenderPlan[line.key] ?? lenderFilter;
      if (allow && allow.length === 0) {
        result.warnings.push({ code: 'SKIPPED_BY_STAFF', line: line.name, message: 'เจ้าหน้าที่ไม่เลือกผู้ให้ยืมสำหรับรายการนี้ จึงยังไม่ส่งคำขอ' });
        continue;
      }
      if (line.kind === 'DRUG') {
        const listing = (await client.query(`SELECT 1 FROM hospital_drug WHERE hospital_id = $1 AND drug_master_id = $2 AND active LIMIT 1`, [incident.hospital_id, line.drugMasterId])).rowCount;
        if (!listing) {
          result.warnings.push({ code: 'BORROWER_NOT_LISTED', line: line.name, message: 'โรงพยาบาลนี้ยังไม่มีรายการยานี้ในบัญชียา จึงรับของที่ยืมเข้าสต็อกไม่ได้ ไม่ส่งคำขอ' });
          continue;
        }
        if (line.blood && !hospital?.has_blood_bank) {
          result.warnings.push({ code: 'BLOOD_NOT_ALLOWED', line: line.name, message: 'ต้องเป็นโรงพยาบาลที่มีธนาคารเลือด (BR-F3-031)' });
          continue;
        }
      }
      const delta = line.qty - covered;
      const open = mine.find((e) => (OPEN_REQUEST as readonly string[]).includes(e.status));
      if (open && mine.length === 1) {
        // the need grew: one request covers the line, so raise it and ask for the difference
        const req = (await loadRequestCtx(client, open.id, true)) as RequestCtx;
        await client.query(`UPDATE borrow_request_item SET qty_requested = $2 WHERE id = $1`, [req.itemId, line.qty]);
        await client.query(`UPDATE borrow_request SET first_round_qty = $2, stop_threshold = $2, updated_at = now(), version = version + 1 WHERE id = $1`, [req.id, line.qty]);
        req.qtyRequested = line.qty;
        const legs = await requestLegs(client, req.id);
        const asked = [...new Set(legs.map((l) => l.lender_hospital_id))];
        const waiting = legs.filter((l) => l.status === 'SENT');
        const needNow = Math.ceil(line.qty - confirmedOf(legs) - 1e-9);
        for (const l of waiting) {
          if (l.qty_asked >= needNow) continue;
          await client.query(`UPDATE borrow_leg SET qty_asked = LEAST($2::numeric, qty_asked + $3::numeric) WHERE id = $1`, [l.id, needNow, delta]);
          // the lender is told that the quantity it is being asked for grew
          await notifyRoles(client, l.lender_hospital_id, ['PHARMACIST', 'WAREHOUSE_OFFICER'], {
            kind: 'EMERGENCY_LEG_INCREASED', title: `คำขอ ${line.name} (${incident.incident_no}) เพิ่มเป็น ${Math.min(needNow, l.qty_asked + delta)} ${line.unit}`, refType: 'borrow_request', refId: req.id,
          });
        }
        let sent = 0;
        if (waiting.length === 0 && needNow > 0) {
          const cands = (await findLenders(client, incident.hospital_id, line, asked, cfg)).filter((c) => !allow || allow.includes(c.hospitalId));
          if (cands.length > 0) sent = (await sendRound(client, ctx, req, needNow, Math.max(0, ...legs.map((l) => l.round_no)) + 1, cands, cfg)).sent;
        }
        await writeAudit(client, ctx, { action: 'EMERGENCY_REQUEST_INCREASED', entityType: 'borrow_request', entityId: req.id, before: { qty: covered }, after: { requestNo: req.requestNo, qty: line.qty, newLegs: sent } });
        result.increased.push({ requestId: req.id, requestNo: req.requestNo, name: line.name, qty: line.qty, legs: sent });
        continue;
      }
      // a new request for the missing quantity
      const requestNo = await nextRequestNo(client);
      const created = (
        await client.query(
          `INSERT INTO borrow_request (request_no, borrower_hospital_id, context, status, urgency, incident_id, reason, created_by, approved_by, approved_at, first_round_qty, stop_threshold)
           VALUES ($1, $2, 'EMERGENCY', 'IN_PROGRESS', 'VERY_URGENT', $3, $4, $5, $5, now(), $6, $6) RETURNING id`,
          [requestNo, incident.hospital_id, incident.id, `เหตุฉุกเฉิน ${incident.incident_no}`, user.id, delta],
        )
      ).rows[0];
      const item = (
        await client.query(`INSERT INTO borrow_request_item (request_id, kind, drug_master_id, kit_type_id, qty_requested) VALUES ($1, $2::item_kind, $3, $4, $5) RETURNING id`, [created.id, line.kind, line.drugMasterId, line.kitTypeId, delta])
      ).rows[0];
      const req: RequestCtx = { id: created.id, requestNo, status: 'IN_PROGRESS', borrowerId: incident.hospital_id, incident, itemId: item.id, line: { ...line, qty: delta }, qtyRequested: delta };
      await writeAudit(client, ctx, { action: 'EMERGENCY_REQUEST_CREATED', entityType: 'borrow_request', entityId: created.id, after: { requestNo, incidentNo: incident.incident_no, item: line.name, qty: delta } });
      const cands = (await findLenders(client, incident.hospital_id, line, [], cfg)).filter((c) => !allow || allow.includes(c.hospitalId));
      if (cands.length === 0) {
        await client.query(`UPDATE borrow_request SET status = 'ESCALATED', updated_at = now(), version = version + 1 WHERE id = $1`, [created.id]);
        await alertStaff(client, incident, 'EMERGENCY_ALL_REJECTED', `ไม่มีโรงพยาบาลที่มี ${line.name} ให้ยืม (${incident.incident_no})`, `ต้องการ ${delta} ${line.unit} ติดต่อด้วยวิทยุ/โทรศัพท์`, created.id);
        result.warnings.push({ code: 'NO_LENDER', line: line.name, message: 'ไม่มีโรงพยาบาลในเขตที่มีของพอให้ขอ' });
        result.created.push({ requestId: created.id, requestNo, name: line.name, qty: delta, legs: 0, mode: 'NONE', late: false });
        continue;
      }
      const sent = await sendRound(client, ctx, req, delta, 1, cands, cfg);
      if (sent.mode === 'FASTEST_LATE') result.warnings.push({ code: 'LATE_FOR_ETA', line: line.name, message: 'ไม่มีโรงพยาบาลที่ส่งทัน ETA ขอไปยังแห่งที่เร็วที่สุด ของจะถึงหลังผู้ป่วย' });
      if (sent.mode === 'ETA_UNKNOWN') result.warnings.push({ code: 'ETA_UNAVAILABLE', line: line.name, message: 'ไม่มี ETA จึงขอไปยังโรงพยาบาลที่ใกล้ที่สุด 3 แห่ง ใช้วิทยุเลือกผู้ให้ยืมได้' });
      result.created.push({ requestId: created.id, requestNo, name: line.name, qty: delta, legs: sent.sent, mode: sent.mode, late: sent.late });
      continue;
    }
    if (line.qty < covered - 1e-9 && mine.length > 0) {
      let excess = covered - line.qty;
      for (const e of mine) {
        if (excess <= 1e-9) break;
        const req = await loadRequestCtx(client, e.id, true);
        if (!req || !(OPEN_REQUEST as readonly string[]).includes(req.status)) continue;
        const reducible = req.qtyRequested - confirmedOf(await requestLegs(client, req.id));
        const cut = Math.min(excess, Math.max(0, reducible));
        if (cut <= 0) continue;
        const r = await reduceRequest(client, ctx, req, req.qtyRequested - cut);
        result.reduced.push({ requestId: req.id, requestNo: req.requestNo, name: line.name, qty: r.qty, keptConfirmed: r.keptConfirmed });
        excess -= cut;
      }
      continue;
    }
    result.unchanged.push(line.name);
  }
  return result;
}

// ───────────────────────────── lender confirmation ─────────────────────────────

const CONFIRM_DECISIONS = ['CONFIRM', 'PARTIAL', 'REJECT'] as const;

class EmergencyBorrowService {
  /** API-F3-007: send (or re-sync) the urgent requests of the approved plan. */
  async send(req: Request, rawId: string) {
    const user = req.user!;
    const body = req.body === undefined || req.body === null ? {} : bodyObject(req.body);
    let lenderFilter: string[] | null = null;
    if (body.lenderHospitalIds !== undefined) {
      if (!Array.isArray(body.lenderHospitalIds) || body.lenderHospitalIds.some((v) => !isUuid(v))) throw new HttpError(400, 'VALIDATION', 'lenderHospitalIds ต้องเป็นรายการ id ของโรงพยาบาล');
      lenderFilter = body.lenderHospitalIds as string[];
    }
    // per line (kit type id or drug id): the hospitals staff left switched on in the preview
    const lenderPlan: Record<string, string[]> = {};
    if (body.lenderPlan !== undefined && body.lenderPlan !== null) {
      const plan = bodyObject(body.lenderPlan);
      for (const [key, ids] of Object.entries(plan)) {
        if (!isUuid(key) || !Array.isArray(ids) || ids.some((v) => !isUuid(v))) throw new HttpError(400, 'VALIDATION', 'lenderPlan ต้องเป็น { id ของรายการ: [id ของโรงพยาบาล] }');
        lenderPlan[key] = ids as string[];
      }
    }
    return withTransaction(async (client) => {
      const incident = await ownIncident(client, user, rawId, true);
      assertOpen(incident, ['ACTIVE']);
      const result = await reconcileBorrowing(client, auditContext(req), user, incident, lenderFilter, lenderPlan);
      const sentLegs = result.created.reduce((s, c) => s + c.legs, 0) + result.increased.reduce((s, c) => s + c.legs, 0);
      return { ok: true, id: incident.id, data: { ...result, sentLegs } };
    });
  }

  /** API-F3-008: the lender's answer. The first confirmation wins its quantity; the others are trimmed / cancelled. */
  async confirm(req: Request, rawLegId: string) {
    const user = req.user!;
    const hospitalId = hospitalOf(user);
    const legId = uuidParam(rawLegId, 'legId');
    const body = bodyObject(req.body);
    const decision = (CONFIRM_DECISIONS as readonly string[]).includes(body.decision as string) ? (body.decision as (typeof CONFIRM_DECISIONS)[number]) : null;
    if (!decision) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ decision (CONFIRM | PARTIAL | REJECT)');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (decision === 'REJECT' && reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลที่ปฏิเสธ');

    return withTransaction(async (client) => {
      const requestId = (await client.query(`SELECT bl.request_id FROM borrow_leg bl JOIN borrow_request br ON br.id = bl.request_id WHERE bl.id = $1 AND br.context = 'EMERGENCY' AND bl.lender_hospital_id = $2`, [legId, hospitalId])).rows[0]?.request_id;
      if (!requestId) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำขอยืมฉุกเฉินที่ส่งถึงโรงพยาบาลนี้');
      const request = (await loadRequestCtx(client, requestId, true)) as RequestCtx; // serialises concurrent confirmations of one request
      const leg = (
        await client.query(
          `SELECT id, status::text AS status, qty_asked::float8 AS qty_asked, t_transit_min::float8 AS transit, score_parts, reject_reason FROM borrow_leg WHERE id = $1 FOR UPDATE`,
          [legId],
        )
      ).rows[0];
      // A lender whose turn timed out may still confirm late while the request lacks goods (the first confirmation still wins).
      const lateAnswer = leg.status === 'TIMED_OUT' && lateConfirmable(request);
      if (leg.status !== 'SENT' && !lateAnswer) {
        const taken = leg.status === 'CANCELLED' && leg.reject_reason === 'FIRST_CONFIRMED';
        throw new HttpError(409, taken ? 'TAKEN_BY_OTHER' : 'ALREADY_DECIDED', taken ? 'มีโรงพยาบาลอื่นยืนยันครบจำนวนแล้ว' : `คำขอนี้อยู่ในสถานะ ${leg.status} ตอบไม่ได้แล้ว`, { status: leg.status });
      }
      if (lateAnswer && decision === 'REJECT') throw new HttpError(409, 'ALREADY_DECIDED', 'คำขอนี้หมดเวลาตอบและส่งต่อโรงพยาบาลอื่นแล้ว ไม่ต้องปฏิเสธ');
      const ctx = auditContext(req);
      const legs = await requestLegs(client, requestId);
      const confirmedBefore = confirmedOf(legs);
      const remaining = request.qtyRequested - confirmedBefore;
      const incident = request.incident;

      // the timer already counted a timed-out leg as received and not answered on time
      if (!lateAnswer) {
        await client.query(
          `INSERT INTO reliability_stat (lender_hospital_id, month, requests_received, accepted_on_time) VALUES ($1, date_trunc('month', now())::date, 1, $2)
           ON CONFLICT (lender_hospital_id, month) DO UPDATE SET requests_received = reliability_stat.requests_received + 1, accepted_on_time = reliability_stat.accepted_on_time + $2`,
          [hospitalId, decision === 'REJECT' ? 0 : 1],
        );
      }

      if (decision === 'REJECT') {
        await client.query(`UPDATE borrow_leg SET status = 'REJECTED', reject_reason = $2, responded_at = now(), responded_by = $3 WHERE id = $1`, [legId, reason, user.id]);
        await writeAudit(client, ctx, { action: 'EMERGENCY_LEG_REJECTED', entityType: 'borrow_leg', entityId: legId, after: { requestNo: request.requestNo, reason } });
        await notifyRoles(client, incident.hospital_id, ['ER_STAFF', 'PHARMACIST'], { kind: 'EMERGENCY_LEG_REJECTED', title: `ผู้ให้ยืมปฏิเสธ ${request.line.name} (${incident.incident_no})`, body: reason, refType: 'borrow_request', refId: requestId });
        const next = await expandRequest(client, ctx, requestId);
        return { ok: true, id: legId, data: { id: legId, status: 'REJECTED', requestId, remaining, nextRoundLegs: next.newLegs, escalated: next.escalated } };
      }

      if (remaining <= 1e-9) throw new HttpError(409, 'TAKEN_BY_OTHER', 'มีโรงพยาบาลอื่นยืนยันครบจำนวนแล้ว');
      const cap = Math.min(leg.qty_asked, remaining);
      const qty = decision === 'CONFIRM' ? cap : optionalNumber(body.qty, 'qty', { min: 0.001 });
      if (qty === undefined) throw new HttpError(400, 'VALIDATION', 'PARTIAL ต้องระบุ qty');
      if (decision === 'PARTIAL' && !(qty < cap)) throw new HttpError(422, 'VALIDATION', `PARTIAL ต้องน้อยกว่าจำนวนที่ขอ (${cap})`);
      if (!Number.isInteger(qty)) throw new HttpError(422, 'VALIDATION', 'จำนวนที่ให้ยืมต้องเป็นจำนวนเต็ม');

      // reserve the goods: ready sets for a kit, FEFO lots (not expired; PRC O with enough shelf life) for an item
      const cfg = await loadEmergencyConfig(client, hospitalId);
      let lots: { lotNo: string; qty: number }[] = [];
      if (request.line.kind === 'KIT') {
        await holdKits(client, hospitalId, request.line.kitTypeId as string, qty);
      } else {
        const picks = await pickFefo(client, hospitalId, request.line.drugMasterId as string, qty, request.line.blood ? cfg.blood.prcOMinRemainingDays : 0);
        for (const p of picks) {
          await holdStock(client, hospitalId, p.lotId, p.qty);
          await client.query(`INSERT INTO borrow_leg_lot (leg_id, lot_id, qty) VALUES ($1, $2, $3)`, [legId, p.lotId, p.qty]);
        }
        lots = picks.map((p) => ({ lotNo: p.lotNo, qty: p.qty }));
      }
      const eta = etaView(incident);
      const etaLeft = etaRemainingMin(eta.minutes, new Date(incident.created_at), new Date());
      const late = etaLeft !== null && leg.transit !== null && leg.transit > etaLeft;
      const status = qty >= leg.qty_asked - 1e-9 ? 'ACCEPTED' : 'PARTIAL';
      await client.query(
        `UPDATE borrow_leg SET status = $2::leg_status, qty_accepted = $3, responded_at = now(), responded_by = $4, score_parts = COALESCE(score_parts, '{}'::jsonb) || $5::jsonb WHERE id = $1`,
        [legId, status, qty, user.id, JSON.stringify({ lateForEta: late || Boolean(leg.score_parts?.lateForEta), ...(lateAnswer ? { lateAnswer: true } : {}) })],
      );
      // an escalated request has a lender again
      if (lateAnswer && request.status === 'ESCALATED') {
        await client.query(`UPDATE borrow_request SET status = 'IN_PROGRESS', updated_at = now(), version = version + 1 WHERE id = $1`, [requestId]);
      }
      const carrier = await defaultCarrier(client, hospitalId, request.line.coldChain);
      const task = await createTransportTask(client, {
        refType: 'BORROW_LEG', refId: legId, fromHospitalId: hospitalId, toHospitalId: incident.hospital_id, vehicleId: carrier.vehicleId, driverId: carrier.driverId,
        etaAt: leg.transit !== null ? new Date(Date.now() + leg.transit * 60_000) : null,
      });

      // first confirmation wins: the other waiting legs get what is still missing, or are cancelled
      const left = remaining - qty;
      const cancelled: string[] = [];
      const trimmed: string[] = [];
      for (const other of legs.filter((l) => l.status === 'SENT' && l.id !== legId)) {
        if (left <= 1e-9) {
          await client.query(`UPDATE borrow_leg SET status = 'CANCELLED', reject_reason = 'FIRST_CONFIRMED' WHERE id = $1`, [other.id]);
          cancelled.push(other.lender_hospital_id);
        } else if (other.qty_asked > left) {
          await client.query(`UPDATE borrow_leg SET qty_asked = $2 WHERE id = $1`, [other.id, left]);
          trimmed.push(other.lender_hospital_id);
        }
      }
      for (const lenderId of cancelled) {
        await notifyRoles(client, lenderId, ['PHARMACIST', 'WAREHOUSE_OFFICER'], { kind: 'EMERGENCY_LEG_CANCELLED', title: `ยกเลิกคำขอ ${request.line.name} (${incident.incident_no}): มีผู้ยืนยันครบแล้ว`, refType: 'borrow_request', refId: requestId });
      }
      for (const lenderId of trimmed) {
        await notifyRoles(client, lenderId, ['PHARMACIST', 'WAREHOUSE_OFFICER'], { kind: 'EMERGENCY_LEG_REDUCED', title: `ปรับจำนวนคำขอ ${request.line.name} (${incident.incident_no}) เหลือ ${left} ${request.line.unit}`, refType: 'borrow_request', refId: requestId });
      }
      await writeAudit(client, ctx, {
        action: status === 'ACCEPTED' ? 'EMERGENCY_LEG_CONFIRMED' : 'EMERGENCY_LEG_PARTIAL', entityType: 'borrow_leg', entityId: legId,
        after: { requestNo: request.requestNo, qty, asked: leg.qty_asked, remainingAfter: left, lateForEta: late, lateAnswer, task: task.taskNo, lots, cancelled: cancelled.length, trimmed: trimmed.length },
      });
      const hospitalName = (await client.query(`SELECT COALESCE(name_th, name_en) AS name FROM hospital WHERE id = $1`, [hospitalId])).rows[0].name;
      await notifyRoles(client, incident.hospital_id, ['ER_STAFF', 'PHARMACIST', 'WAREHOUSE_OFFICER'], {
        kind: 'EMERGENCY_LEG_CONFIRMED', title: `${hospitalName} ยืนยันให้ยืม ${request.line.name} ${qty} ${request.line.unit} (${incident.incident_no})${late ? ' · ถึงหลัง ETA' : ''}`, refType: 'borrow_request', refId: requestId,
      });
      let nextRoundLegs = 0;
      if (left > 1e-9) nextRoundLegs = (await expandRequest(client, ctx, requestId)).newLegs;
      const fresh = (await client.query(`SELECT status::text AS status FROM borrow_request WHERE id = $1`, [requestId])).rows[0];
      return { ok: true, id: legId, data: { id: legId, status, qtyAccepted: qty, lateForEta: late, task, lots, requestId, requestStatus: fresh.status, remaining: Math.max(0, left), cancelledLegs: cancelled.length, trimmedLegs: trimmed.length, nextRoundLegs } };
    });
  }
}

export const emergencyBorrowService = new EmergencyBorrowService();



/** Class of each kit line in the incidents' approved plans (kits are critical when they count in the Critical Minimum), by incident id and kit code. */
export async function kitClassesOf(db: Db, incidentIds: string[]): Promise<Map<string, Record<string, EmergencyClass>>> {
  const out = new Map<string, Record<string, EmergencyClass>>();
  if (incidentIds.length === 0) return out;
  const rows = (await db.query(`SELECT DISTINCT ON (incident_id) incident_id, steps FROM emergency_plan WHERE incident_id = ANY($1::uuid[]) AND status = 'APPROVED' ORDER BY incident_id, revision DESC`, [incidentIds])).rows;
  for (const r of rows) {
    const check = Array.isArray(r.steps) ? r.steps.find((s: Record<string, any>) => s?.kind === 'CHECK') : null;
    out.set(r.incident_id, (check?.classes?.kits ?? {}) as Record<string, EmergencyClass>);
  }
  return out;
}

// ───────────────────────────── preview and the lender's inbox ─────────────────────────────

export interface PreviewLine {
  key: string;
  kind: 'KIT' | 'DRUG';
  name: string;
  unit: string;
  class: EmergencyClass;
  blood: boolean;
  /** Quantity this send would ask for (the plan's borrow quantity minus what live requests already cover). */
  qty: number;
  covered: number;
  timeoutMin: number;
  mode: string;
  lenders: { hospitalId: string; code: string; name: string; transitMin: number | null; inTime: boolean | null; available: number; askQty: number; chosen: boolean }[];
  warnings: { code: string; message: string }[];
}

/** What `reconcileBorrowing` would send right now, line by line, without writing anything (the "check before sending" step). */
export async function previewBorrowing(db: Db, incident: IncidentRow) {
  if (incident.status !== 'ACTIVE') throw new HttpError(409, 'INVALID_STATE', `เหตุการณ์อยู่ในสถานะ ${incident.status} ส่งคำขอยืมไม่ได้`, { status: incident.status });
  const plan = (await db.query(`SELECT * FROM emergency_plan WHERE incident_id = $1 AND status = 'APPROVED' ORDER BY revision DESC LIMIT 1`, [incident.id])).rows[0];
  if (!plan) throw new HttpError(409, 'NO_APPROVED_PLAN', 'ต้องอนุมัติแผนก่อนจึงจะส่งคำขอยืมได้');
  const cfg = await loadEmergencyConfig(db, incident.hospital_id);
  const lines = await linesFromPlan(db, plan);
  const eta = etaView(incident);
  const remaining = etaRemainingMin(eta.minutes, new Date(incident.created_at), new Date());
  const hospital = (await db.query(`SELECT has_blood_bank FROM hospital WHERE id = $1`, [incident.hospital_id])).rows[0];
  const covers = (
    await db.query(
      `SELECT coalesce(i.kit_type_id, i.drug_master_id) AS key, sum(i.qty_requested)::float8 AS qty
         FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
        WHERE br.incident_id = $1 AND br.context = 'EMERGENCY' AND br.status = ANY($2::text[]::request_status[]) GROUP BY 1`,
      [incident.id, [...LIVE_REQUEST]],
    )
  ).rows;
  const coveredOf = new Map(covers.map((c) => [c.key as string, Number(c.qty)]));
  const out: PreviewLine[] = [];
  for (const line of lines) {
    const covered = coveredOf.get(line.key) ?? 0;
    const need = line.qty - covered;
    const warnings: { code: string; message: string }[] = [];
    if (need <= 1e-9) {
      out.push({ key: line.key, kind: line.kind, name: line.name, unit: line.unit, class: line.cls, blood: line.blood, qty: 0, covered, timeoutMin: 0, mode: 'COVERED', lenders: [], warnings });
      continue;
    }
    if (line.kind === 'DRUG') {
      const listing = (await db.query(`SELECT 1 FROM hospital_drug WHERE hospital_id = $1 AND drug_master_id = $2 AND active LIMIT 1`, [incident.hospital_id, line.drugMasterId])).rowCount;
      if (!listing) warnings.push({ code: 'BORROWER_NOT_LISTED', message: 'โรงพยาบาลนี้ยังไม่มีรายการยานี้ในบัญชียา จึงรับของที่ยืมเข้าสต็อกไม่ได้' });
      if (line.blood && !hospital?.has_blood_bank) warnings.push({ code: 'BLOOD_NOT_ALLOWED', message: 'ต้องเป็นโรงพยาบาลที่มีธนาคารเลือด (BR-F3-031)' });
    }
    const cands = await findLenders(db, incident.hospital_id, line, [], cfg);
    const { chosen, mode } = chooseLenders(cands.map((c) => ({ hospitalId: c.hospitalId, transitMin: c.transitMin })), remaining, cfg.maxParallel);
    const chosenIds = new Set(chosen.map((c) => c.hospitalId));
    if (cands.length === 0) warnings.push({ code: 'NO_LENDER', message: 'ไม่มีโรงพยาบาลในเขตที่มีของพอให้ขอ' });
    if (mode === 'FASTEST_LATE' && cands.length > 0) warnings.push({ code: 'LATE_FOR_ETA', message: 'ไม่มีโรงพยาบาลที่ส่งทัน ETA ขอไปยังแห่งที่เร็วที่สุด ของจะถึงหลังผู้ป่วย' });
    if (mode === 'ETA_UNKNOWN' && cands.length > 0) warnings.push({ code: 'ETA_UNAVAILABLE', message: 'ไม่มี ETA จึงขอไปยังโรงพยาบาลที่ใกล้ที่สุด 3 แห่ง เลือกผู้ให้ยืมเองได้' });
    out.push({
      key: line.key, kind: line.kind, name: line.name, unit: line.unit, class: line.cls, blood: line.blood, qty: need, covered,
      timeoutMin: emergencyTimeoutMin(line.cls, remaining, { critical: cfg.timeoutCriticalMin, supportive: cfg.timeoutSupportiveMin }),
      mode,
      lenders: [...cands].sort((a, b) => (a.transitMin ?? Infinity) - (b.transitMin ?? Infinity)).map((c) => ({
        hospitalId: c.hospitalId, code: c.code, name: c.name, transitMin: c.transitMin, inTime: remaining === null || c.transitMin === null ? null : c.transitMin <= remaining,
        available: c.avail, askQty: Math.max(1, Math.min(need, c.avail)), chosen: chosenIds.has(c.hospitalId),
      })),
      warnings,
    });
  }
  return { etaRemainingMin: remaining === null ? null : Math.round(remaining * 10) / 10, eta: { minutes: eta.minutes, source: eta.source, flags: eta.flags }, lines: out };
}

const LEG_GROUPS: Record<string, string[]> = {
  pending: ['SENT'],
  confirmed: ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'],
  done: ['RECEIVED'],
  declined: ['REJECTED', 'TIMED_OUT', 'CANCELLED'],
};

/** A timed-out leg whose request still lacks goods (`$2` = LATE_ANSWER_REQUEST). */
const LATE_OK = lateAnswerSql('$2');

/** `GET /emergency-legs`: urgent requests other hospitals sent to the caller's hospital (the lender's inbox for F3). */
export async function listEmergencyLegs(user: AuthSessionUser, raw: Record<string, unknown>) {
  const hospitalId = hospitalOf(user);
  const page = parsePage(raw);
  const params: unknown[] = [hospitalId, LATE_ANSWER_REQUEST];
  const where = [`bl.lender_hospital_id = $1`, `br.context = 'EMERGENCY'`];
  if (typeof raw.status === 'string') {
    const statuses = `bl.status::text = ANY($${params.push(LEG_GROUPS[raw.status] ?? raw.status.split(','))}::text[])`;
    // a timed-out leg that can still be confirmed late stays in the lender's pending list
    where.push(raw.status === 'pending' ? `(${statuses} OR ${LATE_OK})` : statuses);
  }
  params.push(page.limit + 1, page.offset);
  const rows = (
    await query(
      `SELECT bl.id, bl.round_no, bl.status::text AS status, ${LATE_OK} AS late_ok, bl.qty_asked::float8 AS qty_asked, bl.qty_accepted::float8 AS qty_accepted, bl.qty_received::float8 AS qty_received, bl.sent_at, bl.deadline_at,
              bl.responded_at, bl.reject_reason, bl.message_text, bl.t_transit_min::float8 AS transit, bl.score_parts,
              br.id AS request_id, br.request_no, i.kind::text AS kind, i.kit_type_id, i.drug_master_id, i.qty_requested::float8 AS qty_requested,
              COALESCE(NULLIF(${DRUG_NAME}, ''), kt.name) AS name, kt.code AS kit_code, COALESCE(dm.base_unit, 'ชุด') AS unit, COALESCE(dm.emergency_class, 'SUPPORTIVE') AS cls, COALESCE(dm.is_blood_product, false) AS blood,
              bh.id AS borrower_id, bh.code AS borrower_code, COALESCE(bh.name_th, bh.name_en) AS borrower_name,
              inc.id AS incident_id, inc.incident_no, inc.incident_type, inc.location_text, inc.status::text AS incident_status, inc.created_at AS incident_at, inc.eta_minutes, inc.eta_unsure, inc.eta_source::text AS eta_source, inc.reported_eta_min,
              tt.id AS task_id, tt.task_no, tt.status::text AS task_status,
              CASE WHEN i.kind = 'KIT' THEN (SELECT (ks.qty_ready - ks.qty_held)::float8 FROM kit_stock ks WHERE ks.hospital_id = bl.lender_hospital_id AND ks.kit_type_id = i.kit_type_id)
                   ELSE (SELECT sum(sl.qty_on_hand - sl.qty_held)::float8 FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id WHERE sl.hospital_id = bl.lender_hospital_id AND hd.drug_master_id = i.drug_master_id AND sl.expiry_date > current_date) END AS available
         FROM borrow_leg bl
         JOIN borrow_request br ON br.id = bl.request_id
         JOIN borrow_request_item i ON i.id = COALESCE(bl.request_item_id, (SELECT min(y.id::text)::uuid FROM borrow_request_item y WHERE y.request_id = bl.request_id))
         JOIN incident inc ON inc.id = br.incident_id
         JOIN hospital bh ON bh.id = br.borrower_hospital_id
         LEFT JOIN drug_master dm ON dm.id = i.drug_master_id LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
         LEFT JOIN transport_task tt ON tt.ref_type = 'BORROW_LEG' AND tt.ref_id = bl.id AND tt.status <> 'CANCELLED'
        WHERE ${where.join(' AND ')}
        ORDER BY (bl.status = 'SENT') DESC, CASE WHEN bl.status = 'SENT' THEN bl.deadline_at END, bl.sent_at DESC NULLS LAST, bl.id
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
  ).rows;
  const slice = toPage(rows, page);
  const now = Date.now();
  const kitClasses = await kitClassesOf(pool, [...new Set(slice.items.map((l) => l.incident_id as string))]);
  const items = slice.items.map((l) => {
    const incident = { created_at: l.incident_at, eta_minutes: l.eta_minutes, eta_source: l.eta_source, eta_unsure: l.eta_unsure, reported_eta_min: l.reported_eta_min, status: l.incident_status } as IncidentRow;
    const eta = etaView(incident);
    return {
      id: l.id as string,
      round: Number(l.round_no),
      status: l.status as string,
      /** TIMED_OUT but the request still lacks goods: the lender may still confirm (first confirmation wins). */
      canAnswerLate: Boolean(l.late_ok),
      request: { id: l.request_id as string, requestNo: l.request_no as string },
      borrower: { id: l.borrower_id as string, code: l.borrower_code as string, name: l.borrower_name as string },
      incident: { id: l.incident_id as string, incidentNo: l.incident_no as string, type: l.incident_type as string | null, location: l.location_text as string | null, status: l.incident_status as string, eta: { minutes: eta.minutes, arrivalAt: eta.arrivalAt, remainingSec: eta.remainingSec, source: eta.source, flags: eta.flags } },
      item: { kind: l.kind as 'KIT' | 'DRUG', kitTypeId: l.kit_type_id as string | null, drugMasterId: l.drug_master_id as string | null, name: l.name as string, unit: l.unit as string, class: (l.kind === 'KIT' ? (kitClasses.get(l.incident_id)?.[l.kit_code] ?? 'SUPPORTIVE') : l.cls) as string, blood: l.blood as boolean },
      qtyRequested: l.qty_requested as number,
      qtyAsked: l.qty_asked as number,
      qtyAccepted: l.qty_accepted as number | null,
      qtyReceived: l.qty_received as number | null,
      available: l.available === null ? 0 : Math.floor(Number(l.available)),
      transitMin: l.transit as number | null,
      lateForEta: Boolean(l.score_parts?.lateForEta),
      sentAt: l.sent_at ? new Date(l.sent_at).toISOString() : null,
      deadlineAt: l.deadline_at ? new Date(l.deadline_at).toISOString() : null,
      remainingSec: l.status === 'SENT' && l.deadline_at ? Math.max(0, Math.round((new Date(l.deadline_at).getTime() - now) / 1000)) : null,
      respondedAt: l.responded_at ? new Date(l.responded_at).toISOString() : null,
      rejectReason: l.reject_reason as string | null,
      messageText: l.message_text as string | null,
      task: l.task_id ? { id: l.task_id as string, taskNo: l.task_no as string, status: l.task_status as string } : null,
    };
  });
  return { ok: true, items, nextCursor: slice.nextCursor };
}

/** Follow-ups once a minute: requests whose legs all ended without enough goods ask the next hospitals or escalate. */
export async function processEmergencyTimers(client: pg.PoolClient): Promise<{ expanded: number; escalated: number }> {
  const due = (
    await client.query(
      `SELECT br.id FROM borrow_request br JOIN incident i ON i.id = br.incident_id
        WHERE br.context = 'EMERGENCY' AND br.status IN ('IN_PROGRESS', 'PARTIALLY_FULFILLED') AND i.status = 'ACTIVE'
          AND EXISTS (SELECT 1 FROM borrow_leg l WHERE l.request_id = br.id AND l.status IN ('TIMED_OUT', 'REJECTED'))
          AND NOT EXISTS (SELECT 1 FROM borrow_leg l WHERE l.request_id = br.id AND l.status = 'SENT')
        ORDER BY br.created_at`,
    )
  ).rows;
  const ctx = systemAuditContext();
  const result = { expanded: 0, escalated: 0 };
  for (const row of due) {
    const r = await expandRequest(client, ctx, row.id);
    if (r.newLegs > 0) result.expanded += 1;
    if (r.escalated) result.escalated += 1;
  }
  return result;
}
