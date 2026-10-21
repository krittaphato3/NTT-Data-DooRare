/**
 * The borrowing process after approval (spec FL-05..FL-09): sending legs, reacting to responses / timeouts / receipts,
 * the F-20 stop rule, next-lender rounds and escalation. Every entry point runs in the caller's transaction.
 */
import type pg from 'pg';
import { stopMet, timeoutPlan, allocateRound } from '../../core/formulas/borrow.js';
import type { Urgency } from '../../core/formulas/borrow.js';
import { writeAudit, systemAuditContext } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { notifyRoles } from '../../core/notify.js';
import { loadBorrowConfig } from './borrow.config.js';
import { usableStock } from './borrow.inputs.js';
import type { LadderEntry } from './borrow.ladder.js';

export const CONFIRMED_STATUSES = ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'] as const;
const OPEN_REQUEST = ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED'];

export interface StoredLadder {
  version: number;
  need: { u: number; leadDays: number; required: number | null; stock: number; incoming: number; windowDays: number; urgency: Urgency; ved: string; pattern: string; flags: string[] };
  ladder: LadderEntry[];
  excluded: { hospitalId: string; code: string; reason: string | null }[];
  drafts: Record<string, string>;
  parallel: boolean;
  builtAt: string;
}

/** The ladder frozen by this module; seed rows written before F1b hold an older array shape and count as "no ladder". */
export function asStoredLadder(value: unknown): StoredLadder | null {
  const v = value as StoredLadder | null;
  return v && !Array.isArray(v) && typeof v === 'object' && Array.isArray(v.ladder) ? v : null;
}

export const urgencyTh = (u: string) => (u === 'VERY_URGENT' ? 'เร่งด่วนมาก' : u === 'URGENT' ? 'เร่งด่วน' : 'ปกติ');

/** Rule-based message draft (the agent's Task 3 template; used as is while no agent is connected). */
export function draftMessage(input: { requester: string; drug: string; qty: number; unit: string; urgency: string; round: number; deadlineMin: number }): string {
  const hours = input.deadlineMin >= 120 ? `${Math.round(input.deadlineMin / 60)} ชั่วโมง` : `${Math.round(input.deadlineMin)} นาที`;
  return `${input.requester} ขอยืม ${input.drug} จำนวน ${input.qty.toLocaleString('en-US')} ${input.unit} (รอบที่ ${input.round}) ความเร่งด่วน: ${urgencyTh(input.urgency)} กรุณายืนยันภายใน ${hours} คืนเป็นยาชนิดและจำนวนเดียวกัน`;
}

interface RequestRow {
  id: string;
  request_no: string;
  borrower_hospital_id: string;
  status: string;
  urgency: Urgency;
  version: number;
  stock_alert_id: string | null;
  stop_threshold: number | null;
  ladder: StoredLadder | null;
  item_id: string;
  drug_master_id: string | null;
  item_kind: string;
  qty_requested: number;
  drug_name: string;
  base_unit: string;
  borrower_name: string;
  ved: string | null;
}

async function loadRequest(client: pg.PoolClient, id: string): Promise<RequestRow | null> {
  const r = (
    await client.query(
      `SELECT br.id, br.request_no, br.borrower_hospital_id, br.status::text AS status, br.urgency::text AS urgency, br.version, br.stock_alert_id,
              br.stop_threshold::float8 AS stop_threshold, br.ladder, i.id AS item_id, i.drug_master_id, i.kind::text AS item_kind, i.qty_requested::float8 AS qty_requested,
              COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), kt.name) AS drug_name, COALESCE(dm.base_unit, 'ชุด') AS base_unit, COALESCE(h.name_th, h.name_en) AS borrower_name,
              (SELECT hd.ved::text FROM hospital_drug hd WHERE hd.hospital_id = br.borrower_hospital_id AND hd.drug_master_id = i.drug_master_id LIMIT 1) AS ved
         FROM borrow_request br
         JOIN LATERAL (SELECT x.* FROM borrow_request_item x WHERE x.request_id = br.id ORDER BY x.id LIMIT 1) i ON true
         LEFT JOIN drug_master dm ON dm.id = i.drug_master_id
         LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
         JOIN hospital h ON h.id = br.borrower_hospital_id
        WHERE br.id = $1 FOR UPDATE OF br`,
      [id],
    )
  ).rows[0];
  return r ? { ...r, ladder: asStoredLadder(r.ladder) } : null;
}

/** Legs of a request with the numbers the flow needs. */
async function loadLegs(client: pg.PoolClient, requestId: string) {
  return (
    await client.query(
      `SELECT id, lender_hospital_id, round_no, status::text AS status, qty_asked::float8 AS qty_asked, qty_accepted::float8 AS qty_accepted,
              qty_received::float8 AS qty_received, sent_at, deadline_at, reminded_at
         FROM borrow_leg WHERE request_id = $1 ORDER BY round_no, rank_in_ladder`,
      [requestId],
    )
  ).rows as { id: string; lender_hospital_id: string; round_no: number; status: string; qty_asked: number; qty_accepted: number | null; qty_received: number | null; sent_at: Date | null; deadline_at: Date | null; reminded_at: Date | null }[];
}

export const effectiveQty = (legs: { status: string; qty_accepted: number | null; qty_received: number | null }[]): number =>
  legs.reduce((sum, l) => sum + (l.status === 'RECEIVED' ? (l.qty_received ?? 0) : (CONFIRMED_STATUSES as readonly string[]).includes(l.status) ? (l.qty_accepted ?? 0) : 0), 0);

/** Sends legs (status SENT) to the given ladder entries and notifies the lenders' pharmacists. */
export async function sendLegs(
  client: pg.PoolClient,
  request: RequestRow,
  entries: { entry: LadderEntry; qty: number }[],
  round: number,
  stored: StoredLadder,
  messages: Record<string, string>,
): Promise<number> {
  const cfg = await loadBorrowConfig(client, request.borrower_hospital_id);
  const stockNow = await usableStock(client, (await client.query(`SELECT id FROM hospital_drug WHERE hospital_id = $1 AND drug_master_id = $2 LIMIT 1`, [request.borrower_hospital_id, request.drug_master_id])).rows[0]?.id ?? '00000000-0000-0000-0000-000000000000');
  const plan = timeoutPlan(request.urgency, stockNow, stored.need.u, cfg.timeoutMin, cfg.reminderRatio);
  let sent = 0;
  for (const { entry, qty } of entries) {
    const text = messages[entry.hospitalId] ?? stored.drafts[entry.hospitalId] ?? draftMessage({ requester: request.borrower_name, drug: request.drug_name, qty, unit: request.base_unit, urgency: request.urgency, round, deadlineMin: plan.effectiveMin });
    const leg = (
      await client.query(
        `INSERT INTO borrow_leg (request_id, request_item_id, lender_hospital_id, round_no, rank_in_ladder, status, score_si, score_parts, t_transit_min, window_max_days,
                                 qty_asked, sent_at, deadline_at, message_text)
         VALUES ($1, $2, $3, $4, $5, 'SENT', $6, $7::jsonb, $8, $9, $10, now(), now() + make_interval(mins => $11::int), $12) RETURNING id`,
        [request.id, request.item_id, entry.hospitalId, round, entry.rank, entry.si, JSON.stringify(entry.parts), entry.transitMin, Math.min(stored.need.windowDays, 99999), qty, Math.max(1, Math.round(plan.effectiveMin)), text],
      )
    ).rows[0];
    await notifyRoles(client, entry.hospitalId, ['PHARMACIST'], {
      kind: 'BORROW_REQUEST_RECEIVED',
      title: `คำขอยืม ${request.drug_name} ${qty} ${request.base_unit} จาก ${request.borrower_name}`,
      body: text,
      refType: 'borrow_leg',
      refId: leg.id,
    });
    sent += 1;
  }
  return sent;
}

async function setRequestStatus(client: pg.PoolClient, request: RequestRow, status: string, ctx: AuditContext, action: string, extra: Record<string, unknown> = {}): Promise<void> {
  if (request.status === status) return;
  await client.query(`UPDATE borrow_request SET status = $2::request_status, updated_at = now(), version = version + 1 WHERE id = $1`, [request.id, status]);
  await writeAudit(client, ctx, { action, entityType: 'borrow_request', entityId: request.id, before: { status: request.status }, after: { status, ...extra } });
  request.status = status;
  if (status === 'FULFILLED' && request.stock_alert_id) {
    await client.query(`UPDATE stock_alert SET status = 'RESOLVED', updated_at = now(), version = version + 1 WHERE id = $1 AND status = 'LINKED_TO_REQUEST'`, [request.stock_alert_id]);
  }
}

/**
 * Re-evaluates a request after a leg changed (response, timeout, receipt): stop rule (F-20), next lender without re-asking
 * (BR-F1b-030), escalation (BR-F1b-031) and the SM-1 status.
 */
export async function advanceRequest(client: pg.PoolClient, requestId: string, ctx: AuditContext = systemAuditContext()): Promise<{ status: string; newLegs: number }> {
  const request = await loadRequest(client, requestId);
  if (!request || !OPEN_REQUEST.includes(request.status) || !request.ladder) return { status: request?.status ?? 'NOT_FOUND', newLegs: 0 };
  const cfg = await loadBorrowConfig(client, request.borrower_hospital_id);
  const legs = await loadLegs(client, requestId);
  const stored = request.ladder;
  const threshold = request.stop_threshold ?? Infinity;
  const effective = effectiveQty(legs);
  const received = legs.filter((l) => l.status === 'RECEIVED').reduce((s, l) => s + (l.qty_received ?? 0), 0);
  const sentLegs = legs.filter((l) => l.status === 'SENT');
  const inFlight = legs.filter((l) => (CONFIRMED_STATUSES as readonly string[]).includes(l.status));
  const progress = received > 0 ? 'PARTIALLY_FULFILLED' : 'IN_PROGRESS';

  if (stopMet(effective, threshold)) {
    // Enough is confirmed: stop asking (F-20) and withdraw requests that are still waiting for an answer.
    for (const l of sentLegs) {
      await client.query(`UPDATE borrow_leg SET status = 'CANCELLED', reject_reason = 'STOP_RULE' WHERE id = $1`, [l.id]);
    }
    if (inFlight.length === 0) {
      await setRequestStatus(client, request, received >= threshold ? 'FULFILLED' : 'PARTIALLY_FULFILLED', ctx, received >= threshold ? 'REQ_FULFILLED' : 'REQ_PARTIAL', { effective, received, threshold });
    } else {
      await setRequestStatus(client, request, progress, ctx, 'REQ_PROGRESS', { effective, received, threshold });
    }
    return { status: request.status, newLegs: 0 };
  }

  if (sentLegs.length > 0) {
    await setRequestStatus(client, request, progress, ctx, 'REQ_PROGRESS', { effective, received, threshold });
    return { status: request.status, newLegs: 0 };
  }

  // Not enough and nobody is answering: ask the shortfall from lenders not asked yet.
  const asked = new Set(legs.map((l) => l.lender_hospital_id));
  const remainingLadder = stored.ladder.filter((e) => !asked.has(e.hospitalId) && e.lendable > 0);
  const remaining = Math.max(0, Math.ceil(request.qty_requested - effective - 1e-9));
  const parallel = request.urgency === 'VERY_URGENT';
  const allocation = remaining > 0 ? allocateRound(remainingLadder, remaining, parallel, cfg.maxParallel) : [];
  if (allocation.length === 0) {
    if (inFlight.length > 0) {
      await setRequestStatus(client, request, progress, ctx, 'REQ_PROGRESS', { effective, received, threshold });
    } else {
      await setRequestStatus(client, request, 'ESCALATED', ctx, 'REQ_ESCALATED', { effective, threshold, reason: 'LADDER_EXHAUSTED' });
      await notifyRoles(client, request.borrower_hospital_id, ['HOSPITAL_ADMIN', 'PHARMACIST'], {
        kind: 'BORROW_ESCALATED',
        title: `คำขอยืม ${request.request_no} ยังขาด ${remaining.toLocaleString('en-US')} ${request.base_unit} และไม่มีผู้ให้ยืมเหลือ`,
        body: 'ติดต่อฝ่ายจัดซื้อ/คลังเขต หรือเพิ่มผู้ให้ยืมด้วยตนเอง',
        refType: 'borrow_request',
        refId: request.id,
      });
    }
    return { status: request.status, newLegs: 0 };
  }
  const round = Math.max(0, ...legs.map((l) => l.round_no)) + 1;
  const sent = await sendLegs(client, request, allocation.map((a) => ({ entry: remainingLadder.find((e) => e.hospitalId === a.hospitalId) as LadderEntry, qty: a.qty })), round, stored, {});
  await setRequestStatus(client, request, progress, ctx, 'REQ_NEXT_ROUND', { round, legs: sent });
  return { status: request.status, newLegs: sent };
}

/** JOB-04: reminders at 50 % of the effective timeout and TIMED_OUT at the deadline (silence is a rejection). */
export async function processLegTimers(client: pg.PoolClient, now = new Date()): Promise<{ reminded: number; timedOut: number }> {
  const result = { reminded: 0, timedOut: 0 };
  const due = (
    await client.query(
      `SELECT bl.id, bl.request_id, bl.lender_hospital_id, bl.sent_at, bl.deadline_at, bl.reminded_at, br.request_no
         FROM borrow_leg bl JOIN borrow_request br ON br.id = bl.request_id
        WHERE bl.status = 'SENT' AND bl.deadline_at IS NOT NULL ORDER BY bl.deadline_at FOR UPDATE OF bl`,
    )
  ).rows;
  const touched = new Set<string>();
  for (const leg of due) {
    const sent = new Date(leg.sent_at).getTime();
    const deadline = new Date(leg.deadline_at).getTime();
    if (deadline <= now.getTime()) {
      await client.query(`UPDATE borrow_leg SET status = 'TIMED_OUT' WHERE id = $1`, [leg.id]);
      await client.query(
        `INSERT INTO reliability_stat (lender_hospital_id, month, requests_received, accepted_on_time) VALUES ($1, date_trunc('month', now())::date, 1, 0)
         ON CONFLICT (lender_hospital_id, month) DO UPDATE SET requests_received = reliability_stat.requests_received + 1`,
        [leg.lender_hospital_id],
      );
      touched.add(leg.request_id);
      result.timedOut += 1;
    } else if (!leg.reminded_at && sent + (deadline - sent) * 0.5 <= now.getTime()) {
      await client.query(`UPDATE borrow_leg SET reminded_at = now() WHERE id = $1`, [leg.id]);
      await notifyRoles(client, leg.lender_hospital_id, ['PHARMACIST'], {
        kind: 'BORROW_REMINDER',
        title: `เตือน: คำขอยืม ${leg.request_no} ยังรอการตอบ`,
        refType: 'borrow_leg',
        refId: leg.id,
      });
      result.reminded += 1;
    }
  }
  for (const requestId of touched) await advanceRequest(client, requestId);
  return result;
}

export { setRequestStatus, loadRequest, loadLegs };
export type { RequestRow };
