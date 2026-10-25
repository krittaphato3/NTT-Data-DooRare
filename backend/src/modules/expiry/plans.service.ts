/**
 * Regional pool (API-F2a-006) and allocation plans (API-F2a-007..011, SM-5, FL-14).
 * Approval: every involved hospital's pharmacist; any rejection or a missed deadline => NEEDS_DISCUSSION; all approved => transport tasks.
 * Uneconomical plans (F-23) need the owner pharmacist's option first (BR-F2a-010/011). Cancelling after approval needs two hospitals (BR-F2a-018).
 * A plan comes from the allocation agent (allocation.agent.ts) or is written by the owner pharmacist (`createManual`); while it is
 * open, any other hospital of the region can see it and object with a reason (`objection`), which also means NEEDS_DISCUSSION.
 */
import type { Request } from 'express';
import type pg from 'pg';
import { auditContext, systemAuditContext, writeAudit } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { notifyRoles } from '../../core/notify.js';
import { parsePage, toPage } from '../../core/pagination.js';
import { releaseHeld } from '../../core/stock.js';
import { bodyObject, isUuid, optionalNumber, uuidParam } from '../../core/validate.js';
import { pool, query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';
import { costCheck } from '../../core/formulas/expiry.js';
import { round } from '../../core/formulas/borrow.js';
import { loadExpiryConfig } from './expiry.config.js';
import { createPlanFromAgentProposal, demandCandidates, loadPoolLot, poolLotBlocker, startTransport } from './matching.js';
import type { AgentProposal, PoolLot } from './matching.js';

/** FL-12 / schema `allocation_plan.option_chosen`: the four options offered for an uneconomical lot (BR-F2a-010 / -011). */
export const OPTIONS = [
  { id: 'MERGE_SHIPMENTS', label: 'รวมเที่ยวขนส่งให้คุ้มขึ้น (ดำเนินการตามแผน)', effect: 'continue' },
  { id: 'RAISE_VALUE', label: 'เพิ่มมูลค่าล็อตให้คุ้มค่าขนส่ง (ดำเนินการตามแผน)', effect: 'continue' },
  { id: 'DONATE_OR_DISCARD', label: 'บริจาค/ทำลายตามระเบียบ', effect: 'discard' },
  { id: 'HOLD', label: 'พักไว้ในคลังกลาง รอจับคู่ใหม่', effect: 'hold' },
] as const;
const OPEN_FOR_APPROVAL = ['READY_FOR_APPROVAL', 'NEEDS_DISCUSSION'];
const APPROVED_STATES = ['AUTO_APPROVED', 'APPROVED', 'TRANSPORTING'];

const PLAN_SELECT = `
  SELECT ap.id, ap.plan_no, ap.status::text AS status, ap.version, ap.total_value_thb::float8 AS total_value, ap.total_transport_cost_thb::float8 AS total_cost,
         ap.cost_ratio::float8 AS cost_ratio, ap.economical, ap.option_chosen, ap.approval_deadline, ap.created_at, ap.updated_at, ap.agent_run_id, ap.region_id,
         pe.id AS pool_id, ne.id AS item_id, ne.hospital_id AS origin_id, oh.code AS origin_code, COALESCE(oh.name_th, oh.name_en) AS origin_name,
         sl.lot_no, sl.expiry_date::text AS expiry_date, (sl.expiry_date - current_date) AS days_left, hd.local_code, hd.ved::text AS ved, COALESCE(hd.unit_price_thb, 0)::float8 AS unit_price,
         COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), hd.local_name) AS drug_name, COALESCE(dm.base_unit, hd.local_unit) AS unit,
         COALESCE(dm.is_cold_chain, false) AS cold_chain
    FROM allocation_plan ap
    JOIN pool_entry pe ON pe.id = ap.pool_entry_id
    JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
    JOIN hospital oh ON oh.id = ne.hospital_id
    JOIN stock_lot sl ON sl.id = ne.lot_id
    JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
    LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id`;

const mustBePharmacist = (user: AuthSessionUser): string => {
  if (!user.hospitalId) throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้ใช้ของโรงพยาบาล');
  return user.hospitalId;
};

async function planViews(db: Db, rows: Record<string, any>[], viewer: AuthSessionUser) {
  const out = [];
  for (const p of rows) {
    const lines = (
      await db.query(
        `SELECT al.id, al.receiver_hospital_id, h.code, COALESCE(h.name_th, h.name_en) AS name, al.qty::float8 AS qty, al.value_thb::float8 AS value_thb, al.distance_km::float8 AS km,
                al.transport_cost_thb::float8 AS cost, al.cold_chain, tt.id AS task_id, tt.task_no, tt.status::text AS task_status
           FROM allocation_line al JOIN hospital h ON h.id = al.receiver_hospital_id
           LEFT JOIN transport_task tt ON tt.ref_type = 'ALLOCATION_LINE' AND tt.ref_id = al.id AND tt.status <> 'CANCELLED'
          WHERE al.plan_id = $1 ORDER BY h.code, al.id`,
        [p.id],
      )
    ).rows;
    const approvals = (
      await db.query(
        `SELECT pa.hospital_id, h.code, COALESCE(h.name_th, h.name_en) AS name, pa.decision::text AS decision, pa.decided_at, pa.comment, u.display_name AS decided_by
           FROM plan_approval pa JOIN hospital h ON h.id = pa.hospital_id LEFT JOIN app_user u ON u.id = pa.decided_by WHERE pa.plan_id = $1 ORDER BY (pa.hospital_id = $2) DESC, h.code`,
        [p.id, p.origin_id],
      )
    ).rows;
    const mine = approvals.find((a) => a.hospital_id === viewer.hospitalId);
    const task = lines.find((l) => l.task_id);
    const agent = p.agent_run_id
      ? (await db.query(`SELECT status, model_id, output->>'summary_th' AS summary, output->>'confidence' AS confidence, output->'flags' AS flags FROM agent_run WHERE id = $1`, [p.agent_run_id])).rows[0]
      : null;
    const kindOf = (hospitalId: string) => (hospitalId === p.origin_id ? 'ORIGIN' : lines.some((l) => l.receiver_hospital_id === hospitalId) ? 'RECEIVER' : 'OBJECTOR');
    const requested = lines.length
      ? (await db.query(`SELECT cancel_requested_by FROM transport_task WHERE ref_type = 'ALLOCATION_LINE' AND ref_id = ANY($1::uuid[]) AND status <> 'CANCELLED' AND cancel_requested_by IS NOT NULL LIMIT 1`, [lines.map((l) => l.id)])).rows[0]
      : null;
    out.push({
      id: p.id,
      planNo: p.plan_no,
      status: p.status,
      version: Number(p.version),
      drug: { name: p.drug_name, localCode: p.local_code, ved: p.ved, unit: p.unit, coldChain: p.cold_chain },
      lot: { lotNo: p.lot_no, expiryDate: p.expiry_date, daysLeft: Number(p.days_left) },
      origin: { id: p.origin_id, code: p.origin_code, name: p.origin_name },
      qty: lines.reduce((s, l) => s + l.qty, 0),
      unitValue: p.unit_price,
      lines: lines.map((l) => ({ id: l.id, receiver: { id: l.receiver_hospital_id, code: l.code, name: l.name }, qty: l.qty, valueThb: l.value_thb, distanceKm: l.km, transportCostThb: l.cost, coldChain: l.cold_chain, task: l.task_id ? { id: l.task_id, taskNo: l.task_no, status: l.task_status } : null })),
      totalValueThb: p.total_value,
      transportCostThb: p.total_cost,
      costRatio: p.cost_ratio,
      costRatioPct: p.cost_ratio === null ? null : Math.round(p.cost_ratio * 1000) / 10,
      economical: p.economical,
      option: p.option_chosen,
      options: p.economical ? [] : OPTIONS.map(({ id, label }) => ({ id, label })),
      approvals: approvals.map((a) => ({ hospital: { id: a.hospital_id, code: a.code, name: a.name }, kind: kindOf(a.hospital_id), decision: a.decision, decidedAt: a.decided_at ? new Date(a.decided_at).toISOString() : null, decidedBy: a.decided_by, comment: a.comment })),
      myDecision: mine ? mine.decision : null,
      isOrigin: viewer.hospitalId === p.origin_id,
      /** The viewer's hospital takes part (origin, receiver or an objector); others of the region only see open plans and may object. */
      involved: Boolean(mine),
      myKind: mine ? kindOf(mine.hospital_id) : null,
      canObject:
        !mine && Boolean(viewer.hospitalId) &&
        (OPEN_FOR_APPROVAL.includes(p.status) || (APPROVED_STATES.includes(p.status) && lines.every((l) => !l.task_id || l.task_status === 'WAITING_DISPATCH'))),
      agent: agent
        ? { status: agent.status as string, model: agent.model_id as string | null, summary: agent.summary as string | null, confidence: agent.confidence as string | null, flags: (agent.flags ?? []) as string[] }
        : null,
      approvalDeadline: p.approval_deadline ? new Date(p.approval_deadline).toISOString() : null,
      cancelRequestedBy: requested?.cancel_requested_by ?? null,
      agentRunId: p.agent_run_id,
      createdAt: new Date(p.created_at).toISOString(),
      updatedAt: new Date(p.updated_at).toISOString(),
      _task: task ? true : false,
    });
  }
  return out.map(({ _task, ...rest }) => rest);
}

/** Region of the signed-in user: the user's own region, else the region of the user's hospital. */
async function viewerRegion(db: Db, user: AuthSessionUser): Promise<string | null> {
  if (user.regionId) return user.regionId;
  if (!user.hospitalId) return null;
  return (await db.query(`SELECT region_id FROM hospital WHERE id = $1`, [user.hospitalId])).rows[0]?.region_id ?? null;
}

/**
 * A plan the user may see. Involved hospitals always; with `regionRead`, any hospital of the plan's region while the plan can still
 * be objected to (OBJECTABLE). Every action other than an objection needs an involved hospital.
 */
async function loadPlan(db: Db, id: string, user: AuthSessionUser, lock = false, regionRead = false) {
  const row = (await db.query(`${PLAN_SELECT} WHERE ap.id = $1 ${lock ? 'FOR UPDATE OF ap' : ''}`, [id])).rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบแผนจัดสรร');
  if (user.hospitalId) {
    const involved = (await db.query(`SELECT 1 FROM plan_approval WHERE plan_id = $1 AND hospital_id = $2`, [id, user.hospitalId])).rowCount;
    const regionOk =
      regionRead && !involved && row.region_id === (await viewerRegion(db, user)) &&
      Boolean((await db.query(`SELECT ${OBJECTABLE} AS ok FROM allocation_plan ap WHERE ap.id = $1`, [id])).rows[0]?.ok);
    if (!involved && !regionOk) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบแผนจัดสรร');
  }
  return row;
}

/** §14.6: the human action on an agent-made plan. */
async function logDecision(db: Db, plan: { id: string; agent_run_id: string | null }, decision: string, rationale: string | null, userId: string, action: string): Promise<void> {
  if (!plan.agent_run_id) return;
  await db.query(
    `INSERT INTO decision_log (agent_run_id, ref_type, ref_id, decision, rationale, human_actor_id, human_action) VALUES ($1, 'allocation_plan', $2, $3, $4, $5, $6)`,
    [plan.agent_run_id, plan.id, decision, rationale, userId, action],
  );
}

/** Body of a hand-made split: 1-20 distinct receivers with whole positive quantities. */
function parseLines(raw: unknown): AgentProposal['lines'] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) throw new HttpError(400, 'VALIDATION', 'lines ต้องมี 1-20 รายการ');
  const lines = raw.map((l) => {
    const o = bodyObject(l);
    const qty = Number(o.qty);
    if (!isUuid(o.receiverHospitalId) || !Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'VALIDATION', 'แต่ละรายการต้องมี receiverHospitalId และ qty เป็นจำนวนเต็มบวก');
    return { receiverHospitalId: o.receiverHospitalId as string, qty };
  });
  if (new Set(lines.map((l) => l.receiverHospitalId)).size !== lines.length) throw new HttpError(400, 'VALIDATION', 'โรงพยาบาลผู้รับซ้ำกัน');
  return lines;
}

/** A pool lot of the user's region (404 otherwise, like the pool listing). */
async function poolLotOfRegion(db: Db, user: AuthSessionUser, rawId: string, lock = false): Promise<PoolLot> {
  const pool = await loadPoolLot(db, uuidParam(rawId, 'id'), lock);
  const region = await viewerRegion(db, user);
  if (!pool || (region && pool.region_id !== region)) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อตในคลังกลาง');
  return pool;
}

async function involvedHospitals(db: Db, planId: string): Promise<string[]> {
  return (await db.query(`SELECT hospital_id FROM plan_approval WHERE plan_id = $1`, [planId])).rows.map((r) => r.hospital_id);
}

async function notifyInvolved(db: Db, planId: string, kind: string, title: string, body?: string): Promise<void> {
  for (const h of await involvedHospitals(db, planId)) await notifyRoles(db, h, ['PHARMACIST', 'HOSPITAL_ADMIN'], { kind, title, body: body ?? null, refType: 'allocation_plan', refId: planId });
}

function assertVersion(row: { version: number }, version: number | undefined): void {
  if (version !== undefined && version !== Number(row.version)) throw new HttpError(409, 'VERSION_CONFLICT', 'แผนถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรช', { currentVersion: Number(row.version) });
}

/** Live transport tasks of a plan's lines, locked. */
async function lockPlanTasks(client: pg.PoolClient, planId: string): Promise<{ id: string; status: string; cancel_requested_by: string | null }[]> {
  return (
    await client.query(
      `SELECT tt.id, tt.status::text AS status, tt.cancel_requested_by FROM transport_task tt JOIN allocation_line al ON al.id = tt.ref_id
        WHERE tt.ref_type = 'ALLOCATION_LINE' AND al.plan_id = $1 AND tt.status <> 'CANCELLED' FOR UPDATE OF tt`,
      [planId],
    )
  ).rows;
}

/** Cancels transport tasks that have not left yet (WAITING_DISPATCH), with their CANCELLED event. */
async function cancelTasks(client: pg.PoolClient, taskIds: string[], userId: string, by: { consentBy?: string; reason?: string }): Promise<void> {
  await client.query(
    `UPDATE transport_task SET status = 'CANCELLED', cancel_consent_by = COALESCE($2, cancel_consent_by), cancel_reason = COALESCE($3, cancel_reason), updated_at = now(), version = version + 1 WHERE id = ANY($1::uuid[])`,
    [taskIds, by.consentBy ?? null, by.reason ?? null],
  );
  for (const id of taskIds) {
    await client.query(
      `INSERT INTO transport_event (task_id, client_event_id, seq, to_status, captured_at, actor_id, photo_keys, applied) VALUES ($1, gen_random_uuid(), (SELECT COALESCE(max(seq), 0) + 1 FROM transport_event WHERE task_id = $1), 'CANCELLED', now(), $2, '{}', true)`,
      [id, userId],
    );
  }
}

/**
 * SQL on `ap`: a plan another hospital of the region may still object to - open for approval, or approved (also auto-approved
 * inside one network) while none of its goods has left (every transport task still WAITING_DISPATCH, as for a cancel, BR-F2a-018).
 */
const OBJECTABLE = `(ap.status IN ('READY_FOR_APPROVAL', 'NEEDS_DISCUSSION')
  OR (ap.status IN ('AUTO_APPROVED', 'APPROVED', 'TRANSPORTING') AND NOT EXISTS (
        SELECT 1 FROM allocation_line al JOIN transport_task tt ON tt.ref_type = 'ALLOCATION_LINE' AND tt.ref_id = al.id
         WHERE al.plan_id = ap.id AND tt.status NOT IN ('WAITING_DISPATCH', 'CANCELLED'))))`;

/** The pool's lot goes back to waiting for a new plan: quantity of the cancelled lines returns to `qty_available`. */
async function returnLinesToPool(client: pg.PoolClient, planId: string, poolId: string): Promise<number> {
  const qty = Number((await client.query(`SELECT COALESCE(sum(qty), 0)::float8 AS q FROM allocation_line WHERE plan_id = $1`, [planId])).rows[0].q);
  await client.query(`UPDATE pool_entry SET qty_available = qty_available + $2 WHERE id = $1`, [poolId, qty]);
  return qty;
}

export class PlansService {
  /** API-F2a-006: the regional pool; the origin's own stock level is never exposed (BR-F2a-030). */
  async pool(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const params: unknown[] = [user.regionId ?? null, user.hospitalId ?? null, page.limit + 1, page.offset];
    const rows = (
      await query(
        `SELECT pe.id, ne.id AS item_id, ne.status::text AS item_status, pe.qty_available::float8 AS qty_available, pe.released_at, ne.hospital_id AS origin_id, oh.code AS origin_code,
                COALESCE(oh.name_th, oh.name_en) AS origin_name, sl.lot_no, sl.expiry_date::text AS expiry_date, (sl.expiry_date - current_date) AS days_left,
                COALESCE(hd.unit_price_thb, 0)::float8 AS unit_price, COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), hd.local_name) AS drug_name,
                COALESCE(dm.base_unit, hd.local_unit) AS unit, hd.local_code, hd.ved::text AS ved, u.display_name AS released_by,
                (SELECT COALESCE(sum(al.qty), 0)::float8 FROM allocation_line al JOIN allocation_plan ap ON ap.id = al.plan_id WHERE ap.pool_entry_id = pe.id AND ap.status::text = ANY($5::text[])) AS in_plans,
                (SELECT ap.plan_no FROM allocation_plan ap WHERE ap.pool_entry_id = pe.id AND ap.status::text = ANY($5::text[]) ORDER BY ap.created_at DESC LIMIT 1) AS plan_no
           FROM pool_entry pe JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id JOIN hospital oh ON oh.id = ne.hospital_id
           JOIN stock_lot sl ON sl.id = ne.lot_id JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id LEFT JOIN app_user u ON u.id = ne.decided_by
          WHERE ne.status IN ('RELEASED_TO_POOL', 'ALLOCATED') AND sl.expiry_date > current_date
            AND ($1::uuid IS NULL OR pe.region_id = $1::uuid OR pe.region_id = (SELECT region_id FROM hospital WHERE id = $2::uuid))
          ORDER BY pe.released_at DESC, pe.id LIMIT $3 OFFSET $4`,
        [...params, ['DRAFT', 'READY_FOR_APPROVAL', 'AUTO_APPROVED', 'APPROVED', 'NEEDS_DISCUSSION', 'TRANSPORTING']],
      )
    ).rows;
    const slice = toPage(rows, page);
    return {
      ok: true,
      items: slice.items.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        drug: { name: r.drug_name, localCode: r.local_code, ved: r.ved, unit: r.unit },
        lotNo: r.lot_no,
        expiryDate: r.expiry_date,
        daysLeft: Number(r.days_left),
        qtyAvailable: r.qty_available,
        qtyInPlans: r.in_plans,
        qtyReleased: r.qty_available + r.in_plans,
        unitPrice: r.unit_price,
        valueThb: Math.round((r.qty_available + r.in_plans) * r.unit_price * 100) / 100,
        origin: { id: r.origin_id, code: r.origin_code, name: r.origin_name },
        status: r.item_status === 'ALLOCATED' ? 'ALLOCATED' : r.plan_no ? 'IN_PLAN' : 'HELD',
        planNo: r.plan_no,
        releasedBy: r.released_by,
        releasedAt: new Date(r.released_at).toISOString(),
      })),
      nextCursor: slice.nextCursor,
    };
  }

  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const params: unknown[] = [user.hospitalId ?? null, await viewerRegion(pool, user)];
    // involved plans, plus the plans of the region another hospital may still object to
    const where = [
      `($1::uuid IS NULL OR EXISTS (SELECT 1 FROM plan_approval pa WHERE pa.plan_id = ap.id AND pa.hospital_id = $1::uuid)
        OR (ap.region_id = $2::uuid AND ${OBJECTABLE}))`,
    ];
    if (typeof raw.status === 'string') {
      const groups: Record<string, string[]> = {
        open: ['READY_FOR_APPROVAL', 'NEEDS_DISCUSSION'],
        active: ['AUTO_APPROVED', 'APPROVED', 'TRANSPORTING'],
        done: ['COMPLETED', 'CANCELLED'],
      };
      where.push(`ap.status::text = ANY($${params.push(groups[raw.status] ?? raw.status.split(','))}::text[])`);
    }
    if (raw.needsMe === 'true' && user.hospitalId) where.push(`EXISTS (SELECT 1 FROM plan_approval pa WHERE pa.plan_id = ap.id AND pa.hospital_id = $1 AND pa.decision = 'PENDING') AND ap.status = 'READY_FOR_APPROVAL'`);
    params.push(page.limit + 1, page.offset);
    const rows = (await query(`${PLAN_SELECT} WHERE ${where.join(' AND ')} ORDER BY (ap.status IN ('READY_FOR_APPROVAL','NEEDS_DISCUSSION')) DESC, ap.created_at DESC, ap.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
    const slice = toPage(rows, page);
    return { ok: true, items: await planViews(pool, slice.items, user), nextCursor: slice.nextCursor };
  }

  async detail(user: AuthSessionUser, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const row = await loadPlan(pool, id, user, false, true);
    const data = (await planViews(pool, [row], user))[0];
    return { ok: true, id, version: data.version, data };
  }

  /** `GET /pool/{id}/candidates`: who can use the lot before expiry and how much (F-22), for a hand-made plan or to check the agent. */
  async candidates(user: AuthSessionUser, rawId: string) {
    const lot = await poolLotOfRegion(pool, user, rawId);
    const { life, candidates } = await demandCandidates(pool, lot);
    return {
      ok: true,
      data: {
        poolEntryId: lot.id,
        drug: { name: lot.drug_name, unit: lot.unit },
        lotNo: lot.lot_no,
        daysLeft: life,
        qtyAvailable: lot.qty_available,
        unitPrice: lot.unit_price,
        isOrigin: lot.origin_id === user.hospitalId,
        blocker: poolLotBlocker(lot),
        candidates: candidates.map((c) => ({
          hospital: { id: c.hospitalId, code: c.code, name: c.name },
          maxQty: c.cap?.qty ?? 0,
          deficit: c.cap?.deficit ?? Math.max(0, Math.round((c.totalTarget - c.stock - c.incoming) * 1000) / 1000),
          usePerDay: c.usePerDay,
          daysOfStock: Math.round((c.stock / c.usePerDay) * 10) / 10,
          distanceKm: c.km,
          transitDays: Math.round(c.transitDays * 100) / 100,
          transportCostThb: c.transportCostThb,
          canUseBeforeExpiry: c.cap !== null,
        })),
      },
    };
  }

  /** `POST /allocation-plans`: the origin pharmacist writes the split by hand; the code checks every line against F-22 like an agent's. */
  async createManual(req: Request) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const body = bodyObject(req.body);
    if (!isUuid(body.poolEntryId)) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ poolEntryId');
    const lines = parseLines(body.lines);
    return withTransaction(async (client) => {
      const lot = await poolLotOfRegion(client, user, body.poolEntryId as string, true);
      if (lot.origin_id !== hospitalId) throw new HttpError(403, 'FORBIDDEN', 'เฉพาะเภสัชกรของโรงพยาบาลเจ้าของล็อตสร้างแผนจัดสรรได้');
      const blocker = poolLotBlocker(lot);
      if (blocker) throw new HttpError(409, 'NOT_ALLOCATABLE', blocker);
      const { candidates } = await demandCandidates(client, lot);
      for (const l of lines) {
        const c = candidates.find((x) => x.hospitalId === l.receiverHospitalId);
        if (!c?.cap) throw new HttpError(422, 'NOT_A_CANDIDATE', `${c?.name ?? 'โรงพยาบาลนี้'} ใช้ยานี้ไม่ทันก่อนหมดอายุ หรือไม่มีรายการยาที่จับคู่แล้ว/ผลพยากรณ์`);
        if (l.qty > c.cap.qty) throw new HttpError(422, 'OVER_CAP', `${c.name} ใช้ได้ก่อนหมดอายุไม่เกิน ${c.cap.qty} ${lot.unit} (F-22)`);
      }
      const total = lines.reduce((s, l) => s + l.qty, 0);
      if (total > lot.qty_available) throw new HttpError(422, 'OVER_POOL', `รวม ${total} เกินจำนวนที่เหลือในคลังกลาง (${lot.qty_available} ${lot.unit})`);
      const created = await createPlanFromAgentProposal(client, lot.id, { agentRunId: null, lines }, auditContext(req));
      if (!created) throw new HttpError(409, 'NOT_ALLOCATABLE', 'สร้างแผนไม่ได้ กรุณารีเฟรชแล้วลองใหม่');
      const fresh = await loadPlan(client, created.planId, user);
      const data = (await planViews(client, [fresh], user))[0];
      return { ok: true, id: created.planId, version: data.version, data };
    });
  }

  /**
   * `POST /allocation-plans/{id}/objection`: a hospital of the region that is not in the plan objects with a reason. It joins the
   * plan's approvals as REJECTED, so the plan needs discussion (ASM-16) and the objection is settled at the meeting ("เห็นชอบตามมติ"
   * re-creates the transport). An approved plan (also auto-approved inside one network) can be objected to until its goods leave:
   * its WAITING_DISPATCH tasks are cancelled and the lot waits in the pool for the meeting.
   */
  async objection(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผลที่คัดค้าน (อย่างน้อย 3 ตัวอักษร)');
    if (reason.length > 1000) throw new HttpError(400, 'VALIDATION', 'เหตุผลยาวเกิน 1000 ตัวอักษร');
    return withTransaction(async (client) => {
      const plan = await loadPlan(client, id, user, true, true);
      if ((await client.query(`SELECT 1 FROM plan_approval WHERE plan_id = $1 AND hospital_id = $2`, [id, hospitalId])).rowCount) {
        throw new HttpError(409, 'ALREADY_INVOLVED', 'โรงพยาบาลของคุณอยู่ในแผนนี้แล้ว ใช้ปุ่ม “ไม่เห็นชอบ” แทน');
      }
      let stoppedTasks = 0;
      if (APPROVED_STATES.includes(plan.status)) {
        const tasks = await lockPlanTasks(client, id);
        if (tasks.some((t) => t.status !== 'WAITING_DISPATCH')) throw new HttpError(409, 'TOO_LATE', 'ของขึ้นรถแล้ว คัดค้านแผนนี้ไม่ได้');
        await cancelTasks(client, tasks.map((t) => t.id), user.id, { reason: `คัดค้านแผน: ${reason}` });
        await client.query(`UPDATE near_expiry_item SET status = 'RELEASED_TO_POOL', updated_at = now(), version = version + 1 WHERE id = $1 AND status = 'ALLOCATED'`, [plan.item_id]);
        stoppedTasks = tasks.length;
        for (const h of await involvedHospitals(client, id)) {
          await notifyRoles(client, h, ['WAREHOUSE_OFFICER'], { kind: 'TRANSFER_HELD', title: `พักงานขนส่งแผน ${plan.plan_no}: มีโรงพยาบาลคัดค้าน รอที่ประชุม`, body: reason, refType: 'allocation_plan', refId: id });
        }
      }
      await client.query(`INSERT INTO plan_approval (plan_id, hospital_id, decision, decided_by, decided_at, comment) VALUES ($1, $2, 'REJECTED', $3, now(), $4)`, [id, hospitalId, user.id, reason]);
      await client.query(`UPDATE allocation_plan SET status = 'NEEDS_DISCUSSION', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
      await writeAudit(client, auditContext(req), { action: 'PLAN_OBJECTED', entityType: 'allocation_plan', entityId: id, reason, before: { status: plan.status }, after: { hospital: hospitalId, planNo: plan.plan_no, stoppedTasks } });
      await logDecision(client, plan, 'OBJECTED', reason, user.id, 'object');
      const name = (await client.query(`SELECT COALESCE(name_th, name_en) AS name FROM hospital WHERE id = $1`, [hospitalId])).rows[0]?.name ?? 'โรงพยาบาลในเขต';
      await notifyInvolved(client, id, 'PLAN_OBJECTION', `${name} คัดค้านแผนจัดสรร ${plan.plan_no} · ต้องหารือ`, reason);
      const fresh = await loadPlan(client, id, user);
      const data = (await planViews(client, [fresh], user))[0];
      return { ok: true, id, version: data.version, data };
    });
  }

  /**
   * `POST /allocation-plans/{id}/revise`: an involved pharmacist changes the split of a plan that is still open (READY_FOR_APPROVAL /
   * NEEDS_DISCUSSION), e.g. after the discussion. The code re-checks every line like a new plan (F-22 cap, pool quantity), recomputes
   * value / transport cost / F-23, bumps the version and asks every involved hospital to approve again (the reviser's own approval is
   * given with the change). When all have approved, the transport starts as usual (`decision`).
   */
  async revise(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const lines = parseLines(body.lines);
    const version = optionalNumber(body.version, 'version', { min: 1 });
    if (version === undefined) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ version');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล/ผลการหารือ (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const plan = await loadPlan(client, id, user, true);
      if (!OPEN_FOR_APPROVAL.includes(plan.status)) throw new HttpError(409, 'ALREADY_DECIDED', `แผนอยู่ในสถานะ ${plan.status} แก้ยอดไม่ได้`);
      assertVersion(plan, version);
      if (!(await client.query(`SELECT 1 FROM plan_approval WHERE plan_id = $1 AND hospital_id = $2`, [id, hospitalId])).rowCount) {
        throw new HttpError(403, 'FORBIDDEN', 'เฉพาะโรงพยาบาลที่อยู่ในแผนนี้แก้ยอดได้');
      }
      const oldLines = (await client.query(`SELECT receiver_hospital_id, qty::float8 AS qty FROM allocation_line WHERE plan_id = $1`, [id])).rows;
      const oldTotal = oldLines.reduce((s, l) => s + Number(l.qty), 0);
      // give the plan's own quantity back to the pool and drop its lines: the candidates are then computed as for a new plan (its own lines are not counted as incoming)
      await client.query(`DELETE FROM allocation_line WHERE plan_id = $1`, [id]);
      await client.query(`UPDATE pool_entry SET qty_available = qty_available + $2 WHERE id = $1`, [plan.pool_id, oldTotal]);
      const lot = (await loadPoolLot(client, plan.pool_id, true))!;
      const cfg = await loadExpiryConfig(client, lot.origin_id);
      const { candidates } = await demandCandidates(client, lot);
      const total = lines.reduce((s, l) => s + l.qty, 0);
      if (total > lot.qty_available) throw new HttpError(422, 'OVER_POOL', `รวม ${total} เกินจำนวนที่จัดสรรได้ (${lot.qty_available} ${lot.unit})`);
      const built = lines.map((l) => {
        const c = candidates.find((x) => x.hospitalId === l.receiverHospitalId);
        if (!c?.cap) throw new HttpError(422, 'NOT_A_CANDIDATE', `${c?.name ?? 'โรงพยาบาลนี้'} ใช้ยานี้ไม่ทันก่อนหมดอายุ หรือไม่มีรายการยาที่จับคู่แล้ว/ผลพยากรณ์`);
        if (l.qty > c.cap.qty) throw new HttpError(422, 'OVER_CAP', `${c.name} ใช้ได้ก่อนหมดอายุไม่เกิน ${c.cap.qty} ${lot.unit} (F-22)`);
        return { receiverId: c.hospitalId, qty: l.qty, km: c.km, cost: c.transportCostThb, value: round(l.qty * lot.unit_price, 2) };
      });
      const totalValue = round(built.reduce((s, l) => s + l.value, 0), 2);
      const totalCost = round(built.reduce((s, l) => s + l.cost, 0), 2);
      const check = costCheck(totalCost, totalValue, cfg.cost.ratioMax);
      for (const l of built) {
        await client.query(
          `INSERT INTO allocation_line (plan_id, receiver_hospital_id, qty, value_thb, expected_use_before_expiry, distance_km, transport_cost_thb, cold_chain) VALUES ($1, $2, $3, $4, true, $5, $6, $7)`,
          [id, l.receiverId, l.qty, l.value, l.km, l.cost, lot.cold_chain],
        );
      }
      await client.query(`UPDATE pool_entry SET qty_available = qty_available - $2 WHERE id = $1`, [plan.pool_id, total]);
      // approvals: the owner and the new receivers take part; former receivers that dropped out leave, outside objectors stay. Everybody approves again.
      const keep = new Set<string>([lot.origin_id, ...built.map((l) => l.receiverId)]);
      const formerReceivers = oldLines.map((l) => l.receiver_hospital_id as string).filter((h) => !keep.has(h));
      if (formerReceivers.length) await client.query(`DELETE FROM plan_approval WHERE plan_id = $1 AND hospital_id = ANY($2::uuid[])`, [id, formerReceivers]);
      for (const h of keep) {
        await client.query(
          `INSERT INTO plan_approval (plan_id, hospital_id, decision) VALUES ($1, $2, 'PENDING') ON CONFLICT (plan_id, hospital_id) DO NOTHING`,
          [id, h],
        );
      }
      await client.query(`UPDATE plan_approval SET decision = 'PENDING', decided_by = NULL, decided_at = NULL, comment = NULL WHERE plan_id = $1`, [id]);
      await client.query(`UPDATE plan_approval SET decision = 'APPROVED', decided_by = $3, decided_at = now(), comment = $4 WHERE plan_id = $1 AND hospital_id = $2`, [id, hospitalId, user.id, `ปรับยอดจัดสรร: ${note}`]);
      await client.query(
        `UPDATE allocation_plan SET status = 'READY_FOR_APPROVAL', total_value_thb = $2, total_transport_cost_thb = $3, cost_ratio = $4, economical = $5, option_chosen = NULL,
                approval_deadline = now() + make_interval(hours => $6::int), updated_at = now(), version = version + 1 WHERE id = $1`,
        [id, totalValue, totalCost, check.ratio === null ? null : Math.min(check.ratio, 99.9999), !check.uneconomical, cfg.planApprovalTimeoutH],
      );
      await writeAudit(client, auditContext(req), {
        action: 'PLAN_REVISED', entityType: 'allocation_plan', entityId: id, reason: note,
        before: { status: plan.status, lines: oldLines.map((l) => ({ to: l.receiver_hospital_id, qty: l.qty })) },
        after: { hospital: hospitalId, planNo: plan.plan_no, lines: built.map((l) => ({ to: l.receiverId, qty: l.qty, cost: l.cost })), totalValue, totalCost, economical: !check.uneconomical },
      });
      await logDecision(client, plan, 'REVISED', note, user.id, 'revise');
      await notifyInvolved(client, id, 'PLAN_APPROVAL_REQUEST', `แผนจัดสรร ${plan.plan_no} ปรับยอดแล้ว · รอเห็นชอบอีกครั้ง`, note);
      const fresh = await loadPlan(client, id, user);
      const data = (await planViews(client, [fresh], user))[0];
      return { ok: true, id, version: data.version, data };
    });
  }

  /** API-F2a-009: approve / reject as an involved hospital (If-Match semantics via `version`). */
  async decision(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const decision = body.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new HttpError(400, 'VALIDATION', 'decision ต้องเป็น APPROVED หรือ REJECTED');
    const version = optionalNumber(body.version, 'version', { min: 1 });
    if (version === undefined) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ version');
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (decision === 'REJECTED' && comment.length < 3) throw new HttpError(400, 'VALIDATION', 'การไม่เห็นชอบต้องระบุเหตุผล');
    return withTransaction(async (client) => {
      const plan = await loadPlan(client, id, user, true);
      if (!OPEN_FOR_APPROVAL.includes(plan.status)) throw new HttpError(409, 'ALREADY_DECIDED', `แผนอยู่ในสถานะ ${plan.status} ตัดสินใจไม่ได้`);
      assertVersion(plan, version);
      if (decision === 'APPROVED' && !plan.economical && !plan.option_chosen) throw new HttpError(409, 'OPTION_REQUIRED', 'ค่าขนส่งเกินเกณฑ์ ต้องให้เภสัชกรเจ้าของยาเลือกทางเลือกก่อน (BR-F2a-011)');
      if (body.approveAll && decision === 'APPROVED') {
        if (Array.isArray(body.lines)) {
          for (const line of body.lines) {
            const qty = Number(line.qty);
            if (qty > 0 && typeof line.receiver === 'string') {
              const cleanName = line.receiver.replace(/^รพ\./, '').trim();
              await client.query(
                `UPDATE allocation_line al
                 SET qty = $1, value_thb = round(($1 * (al.value_thb / NULLIF(al.qty, 0)))::numeric, 2)
                 FROM hospital h
                 WHERE al.receiver_hospital_id = h.id AND al.plan_id = $2
                   AND (h.name_th LIKE '%' || $3 || '%' OR h.code = $3)`,
                [qty, id, cleanName],
              );
            }
          }
        }
        await client.query(
          `UPDATE plan_approval SET decision = 'APPROVED', decided_by = $2, decided_at = now(), comment = COALESCE(comment, 'เห็นชอบตามมติที่ประชุม') WHERE plan_id = $1`,
          [id, user.id],
        );
      } else {
        await client.query(`UPDATE plan_approval SET decision = $3::approval_decision, decided_by = $4, decided_at = now(), comment = $5 WHERE plan_id = $1 AND hospital_id = $2`, [id, hospitalId, decision, user.id, comment || null]);
      }
      const ctx = auditContext(req);
      await writeAudit(client, ctx, { action: `PLAN_${decision}`, entityType: 'allocation_plan', entityId: id, reason: comment || null, after: { hospital: hospitalId, planNo: plan.plan_no } });
      await logDecision(client, plan, decision, comment || null, user.id, decision === 'APPROVED' ? (body.approveAll ? 'approve_meeting' : 'approve') : 'reject');
      let next = plan.status;
      let started = 0;
      if (decision === 'REJECTED') {
        next = 'NEEDS_DISCUSSION';
        await client.query(`UPDATE allocation_plan SET status = 'NEEDS_DISCUSSION', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
        await notifyInvolved(client, id, 'PLAN_NEEDS_DISCUSSION', `แผนจัดสรร ${plan.plan_no} ต้องหารือ`, comment);
      } else {
        const pending = (await client.query(`SELECT count(*)::int AS n FROM plan_approval WHERE plan_id = $1 AND decision <> 'APPROVED'`, [id])).rows[0].n;
        if (pending === 0) {
          next = 'APPROVED';
          await client.query(`UPDATE allocation_plan SET status = 'APPROVED', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
          started = await startTransport(client, id, ctx);
          next = 'TRANSPORTING';
        } else {
          await client.query(`UPDATE allocation_plan SET updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
        }
      }
      const fresh = await loadPlan(client, id, user);
      const data = (await planViews(client, [fresh], user))[0];
      return { ok: true, id, version: data.version, data, transportTasks: started };
    });
  }

  /** API-F2a-010: the owner pharmacist chooses what to do with an uneconomical lot. */
  async option(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const opt = OPTIONS.find((o) => o.id === body.option);
    if (!opt) throw new HttpError(400, 'VALIDATION', `option ต้องเป็นหนึ่งใน ${OPTIONS.map((o) => o.id).join(', ')}`);
    const version = optionalNumber(body.version, 'version', { min: 1 });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    return withTransaction(async (client) => {
      const plan = await loadPlan(client, id, user, true);
      if (plan.origin_id !== hospitalId) throw new HttpError(403, 'FORBIDDEN', 'เฉพาะเภสัชกรของโรงพยาบาลเจ้าของยาเลือกทางเลือกได้');
      if (plan.economical) throw new HttpError(409, 'NOT_APPLICABLE', 'แผนนี้ค่าขนส่งไม่เกินเกณฑ์ ไม่ต้องเลือกทางเลือก');
      if (!OPEN_FOR_APPROVAL.includes(plan.status)) throw new HttpError(409, 'ALREADY_DECIDED', `แผนอยู่ในสถานะ ${plan.status}`);
      if (plan.option_chosen) throw new HttpError(409, 'ALREADY_DECIDED', `เลือกทางเลือกแล้ว (${plan.option_chosen})`);
      assertVersion(plan, version);
      const ctx = auditContext(req);
      await client.query(`UPDATE allocation_plan SET option_chosen = $2, updated_at = now(), version = version + 1 WHERE id = $1`, [id, opt.id]);
      await writeAudit(client, ctx, { action: 'PLAN_OPTION_CHOSEN', entityType: 'allocation_plan', entityId: id, reason: reason || null, after: { option: opt.id } });
      if (opt.effect === 'hold') {
        // the lot stays HELD in the pool; the plan is cancelled and its quantity returns to the pool for a new proposal
        await client.query(`UPDATE allocation_plan SET status = 'CANCELLED', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
        await returnLinesToPool(client, id, plan.pool_id);
        await notifyInvolved(client, id, 'PLAN_CANCELLED', `แผนจัดสรร ${plan.plan_no} ยกเลิก`, opt.label);
      } else if (opt.effect === 'discard') {
        // donated / destroyed: the hold is released, the lot leaves the pool and the lost value is counted for F2b
        const poolRow = (await client.query(`SELECT pe.qty_available::float8 AS q, ne.lot_id FROM pool_entry pe JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id WHERE pe.id = $1`, [plan.pool_id])).rows[0];
        const planQty = Number((await client.query(`SELECT COALESCE(sum(qty), 0)::float8 AS q FROM allocation_line WHERE plan_id = $1`, [id])).rows[0].q);
        await releaseHeld(client, plan.origin_id, poolRow.lot_id, poolRow.q + planQty);
        await client.query(`UPDATE pool_entry SET qty_available = 0 WHERE id = $1`, [plan.pool_id]);
        await client.query(`UPDATE near_expiry_item SET status = 'DISMISSED', note = $2, decided_by = $3, decided_at = now(), updated_at = now(), version = version + 1 WHERE id = $1`, [plan.item_id, `${opt.label}${reason ? ` · ${reason}` : ''}`, user.id]);
        await client.query(`UPDATE allocation_plan SET status = 'CANCELLED', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
        await client.query(
          `INSERT INTO value_record (hospital_id, region_id, metric, period, value_thb, value_qty, ref_type, ref_id, detail)
           SELECT $1::uuid, h.region_id, 'EXPIRED_WRITEOFF_THB', date_trunc('month', now())::date, round($2::numeric * $3::numeric, 2), $2::numeric, 'allocation_plan', $4::uuid, jsonb_build_object('reason', 'DONATE_OR_DISCARD')
             FROM hospital h WHERE h.id = $1::uuid`,
          [plan.origin_id, poolRow.q + planQty, plan.unit_price, id],
        );
        await notifyInvolved(client, id, 'PLAN_CANCELLED', `แผนจัดสรร ${plan.plan_no} ยกเลิก`, opt.label);
      } else {
        await notifyInvolved(client, id, 'PLAN_OPTION', `เจ้าของยายืนยันจัดสรรตามแผน ${plan.plan_no} แม้ค่าขนส่งเกินเกณฑ์`, undefined);
      }
      const fresh = await loadPlan(client, id, user);
      const data = (await planViews(client, [fresh], user))[0];
      return { ok: true, id, version: data.version, data };
    });
  }

  /**
   * API-F2a-011. Before approval any involved pharmacist can cancel. After approval (tasks still WAITING_DISPATCH) it needs two hospitals,
   * one of them the origin: the first call records the request, the second call from another involved hospital is the consent (BR-F2a-018).
   */
  async cancel(req: Request, rawId: string) {
    const user = req.user!;
    const hospitalId = mustBePharmacist(user);
    const id = uuidParam(rawId, 'id');
    const body = bodyObject(req.body);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) throw new HttpError(400, 'VALIDATION', 'ต้องระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)');
    return withTransaction(async (client) => {
      const plan = await loadPlan(client, id, user, true);
      const ctx = auditContext(req);
      // a hospital that only objected takes part in the discussion, but the plan is cancelled by its owner or a receiver
      const party = plan.origin_id === hospitalId || (await client.query(`SELECT 1 FROM allocation_line WHERE plan_id = $1 AND receiver_hospital_id = $2`, [id, hospitalId])).rowCount;
      if (!party) throw new HttpError(403, 'FORBIDDEN', 'ยกเลิกแผนได้เฉพาะโรงพยาบาลเจ้าของยาและโรงพยาบาลผู้รับ');
      if (OPEN_FOR_APPROVAL.includes(plan.status)) {
        await client.query(`UPDATE allocation_plan SET status = 'CANCELLED', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
        await returnLinesToPool(client, id, plan.pool_id);
        await writeAudit(client, ctx, { action: 'PLAN_CANCELLED', entityType: 'allocation_plan', entityId: id, reason, before: { status: plan.status } });
        await notifyInvolved(client, id, 'PLAN_CANCELLED', `แผนจัดสรร ${plan.plan_no} ถูกยกเลิก`, reason);
      } else if (APPROVED_STATES.includes(plan.status)) {
        const tasks = await lockPlanTasks(client, id);
        if (tasks.length === 0 || tasks.some((t) => t.status !== 'WAITING_DISPATCH')) throw new HttpError(409, 'NOT_CANCELLABLE', 'ยกเลิกได้เฉพาะตอนงานขนส่งทั้งหมดยังรอขึ้นรถ (BR-F2a-018)');
        const requestedBy = tasks.find((t) => t.cancel_requested_by)?.cancel_requested_by as string | undefined;
        if (!requestedBy) {
          await client.query(`UPDATE transport_task SET cancel_requested_by = $2, cancel_reason = $3, updated_at = now(), version = version + 1 WHERE id = ANY($1::uuid[])`, [tasks.map((t) => t.id), hospitalId, reason]);
          await writeAudit(client, ctx, { action: 'PLAN_CANCEL_REQUESTED', entityType: 'allocation_plan', entityId: id, reason });
          await notifyInvolved(client, id, 'PLAN_CANCEL_REQUESTED', `ขอยกเลิกแผน ${plan.plan_no} รอ รพ.อีกฝ่ายยินยอม`, reason);
          const fresh = await loadPlan(client, id, user);
          const data = (await planViews(client, [fresh], user))[0];
          return { ok: true, id, version: data.version, data, state: 'CANCEL_REQUESTED' };
        }
        if (requestedBy === hospitalId) throw new HttpError(409, 'ALREADY_REQUESTED', 'โรงพยาบาลของคุณขอยกเลิกไปแล้ว รออีกฝ่ายยินยอม');
        if (hospitalId !== plan.origin_id && requestedBy !== plan.origin_id) throw new HttpError(403, 'FORBIDDEN', 'การยกเลิกต้องมีโรงพยาบาลเจ้าของยาร่วมยินยอม');
        await cancelTasks(client, tasks.map((t) => t.id), user.id, { consentBy: hospitalId });
        await client.query(`UPDATE allocation_plan SET status = 'CANCELLED', updated_at = now(), version = version + 1 WHERE id = $1`, [id]);
        await returnLinesToPool(client, id, plan.pool_id);
        await client.query(`UPDATE near_expiry_item SET status = 'RELEASED_TO_POOL', updated_at = now(), version = version + 1 WHERE id = $1 AND status = 'ALLOCATED'`, [plan.item_id]);
        await writeAudit(client, ctx, { action: 'PLAN_CANCELLED', entityType: 'allocation_plan', entityId: id, reason, before: { status: plan.status }, after: { consentBy: hospitalId, requestedBy } });
        await notifyInvolved(client, id, 'PLAN_CANCELLED', `แผนจัดสรร ${plan.plan_no} ถูกยกเลิก (ยินยอมทั้งสองฝ่าย)`, reason);
      } else {
        throw new HttpError(409, 'ALREADY_DECIDED', `ยกเลิกไม่ได้ในสถานะ ${plan.status}`);
      }
      const fresh = await loadPlan(client, id, user);
      const data = (await planViews(client, [fresh], user))[0];
      return { ok: true, id, version: data.version, data, state: 'CANCELLED' };
    });
  }
}

/** Missed deadline of a plan waiting for approvals => NEEDS_DISCUSSION (BR-F2a-013). Run by the expiry job. */
export async function processPlanTimeouts(client: pg.PoolClient, ctx: AuditContext = systemAuditContext()): Promise<{ timedOut: number }> {
  const due = (
    await client.query(
      `SELECT ap.id, ap.plan_no FROM allocation_plan ap
        WHERE ap.status = 'READY_FOR_APPROVAL' AND ap.approval_deadline < now() AND EXISTS (SELECT 1 FROM plan_approval pa WHERE pa.plan_id = ap.id AND pa.decision = 'PENDING') FOR UPDATE OF ap`,
    )
  ).rows;
  for (const p of due) {
    await client.query(`UPDATE allocation_plan SET status = 'NEEDS_DISCUSSION', updated_at = now(), version = version + 1 WHERE id = $1`, [p.id]);
    await writeAudit(client, ctx, { action: 'PLAN_TIMED_OUT', entityType: 'allocation_plan', entityId: p.id, after: { planNo: p.plan_no } });
    await notifyInvolved(client, p.id, 'PLAN_NEEDS_DISCUSSION', `แผนจัดสรร ${p.plan_no} เกินกำหนดเห็นชอบ ต้องหารือ`);
  }
  return { timedOut: due.length };
}

export const plansService = new PlansService();
