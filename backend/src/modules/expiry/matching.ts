/**
 * FL-12 allocation, CODE side. `demandCandidates` computes who can use a pool lot and how much (F-22); the Agent
 * (allocation.agent.ts) or a pharmacist proposes a split from it. `createPlanFromAgentProposal` never trusts that split: it
 * recomputes the F-22 cap of every receiver, validates the proposed quantities against it and the pool quantity, runs the F-23
 * cost check and stores the plan READY_FOR_APPROVAL (or AUTO_APPROVED inside one network). `startTransport` turns an approved
 * plan into transport tasks.
 */
import type pg from 'pg';
import { auditContext, systemAuditContext, writeAudit } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { allocateToReceiver, costCheck, greedyOrder, remainingDays, splitLot, transportCost } from '../../core/formulas/expiry.js';
import type { Allocation, Receiver } from '../../core/formulas/expiry.js';
import type { Db } from '../../db/tx.js';
import { round } from '../../core/formulas/borrow.js';
import { notifyRoles } from '../../core/notify.js';
import { createTransportTask, defaultCarrier } from '../../core/transportTask.js';
import { findListing, incomingOrders, latestForecast, usableStock } from '../borrow/borrow.inputs.js';
import { loadExpiryConfig } from './expiry.config.js';

export interface PlanLineView {
  receiverHospitalId: string;
  qty: number;
}

async function nextPlanNo(client: pg.PoolClient): Promise<string> {
  const prefix = `AP-${new Date().getFullYear()}-`;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const last = await client.query(`SELECT max(substring(plan_no FROM '[0-9]+$')::int) AS n FROM allocation_plan WHERE plan_no LIKE $1`, [`${prefix}%`]);
  return `${prefix}${String(Number(last.rows[0].n ?? 0) + 1).padStart(5, '0')}`;
}

const ACTIVE_PLAN = ['DRAFT', 'READY_FOR_APPROVAL', 'AUTO_APPROVED', 'APPROVED', 'NEEDS_DISCUSSION', 'TRANSPORTING'];

/** Quantity of a pool entry not yet in an active plan: `qty_available` is kept equal to that (reduced on plan creation, restored on cancel). */
/**
 * A split to turn into a plan (FL-12: AGENT proposes, CODE validates). The code never trusts it: each line is capped by the F-22
 * allocation it computes itself. `agentRunId` is null for a plan the pharmacist wrote by hand.
 */
export interface AgentProposal {
  agentRunId: string | null;
  lines: { receiverHospitalId: string; qty: number }[];
}

export interface PoolLot {
  id: string;
  region_id: string;
  qty_available: number;
  item_id: string;
  origin_id: string;
  item_status: string;
  lot_id: string;
  lot_no: string;
  expiry_date: Date;
  drug_master_id: string | null;
  drug_name: string;
  unit: string;
  unit_price: number;
  cold_chain: boolean;
  blood: boolean;
  controlled: boolean;
  origin_network: string | null;
}

/** The pool lot a plan is built from (`lock` = FOR UPDATE, inside the transaction that creates the plan). */
export async function loadPoolLot(db: Db, poolEntryId: string, lock = false): Promise<PoolLot | null> {
  return (
    (
      await db.query(
        `SELECT pe.id, pe.region_id, pe.qty_available::float8 AS qty_available, ne.id AS item_id, ne.hospital_id AS origin_id, ne.status::text AS item_status,
                sl.id AS lot_id, sl.lot_no, sl.expiry_date, hd.drug_master_id, COALESCE(hd.unit_price_thb, 0)::float8 AS unit_price, COALESCE(dm.is_cold_chain, false) AS cold_chain,
                COALESCE(NULLIF(concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form), ''), hd.local_name) AS drug_name, COALESCE(dm.base_unit, hd.local_unit) AS unit,
                COALESCE(dm.is_blood_product, false) AS blood, COALESCE(dm.is_controlled, false) AS controlled, oh.network_id AS origin_network
           FROM pool_entry pe
           JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
           JOIN stock_lot sl ON sl.id = ne.lot_id
           JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
           LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
           JOIN hospital oh ON oh.id = ne.hospital_id
          WHERE pe.id = $1 ${lock ? 'FOR UPDATE OF pe' : ''}`,
        [poolEntryId],
      )
    ).rows[0] ?? null
  );
}

/** Why a pool lot cannot go into a new plan (BR-F2a-027 / -031), or null when it can. */
export function poolLotBlocker(pool: PoolLot | null, today = new Date()): string | null {
  if (!pool) return 'ไม่พบล็อตในคลังกลาง';
  // the remainder of a lot in transport waits until that plan arrives (transport.workflow puts it back to RELEASED_TO_POOL)
  if (pool.item_status === 'ALLOCATED') return 'ล็อตนี้กำลังขนส่งตามแผนก่อนหน้า ส่วนที่เหลือจัดสรรได้เมื่อแผนนั้นส่งถึงแล้ว';
  if (pool.item_status !== 'RELEASED_TO_POOL') return 'ล็อตนี้ไม่ได้อยู่ในสถานะปล่อยเข้าคลังกลางแล้ว';
  if (!(pool.qty_available > 0)) return 'ไม่มีจำนวนเหลือให้จัดสรร (อยู่ในแผนอื่นครบแล้ว)';
  if (!pool.drug_master_id) return 'ยายังไม่ได้จับคู่กับรายการกลาง จึงจัดสรรไม่ได้';
  if (pool.blood || pool.controlled) return 'เลือดและยาควบคุมไม่จัดสรรผ่านคลังกลาง (BR-F2a-031)';
  if (remainingDays(new Date(pool.expiry_date), today) <= 1) return 'ล็อตใกล้หมดอายุเกินกว่าจะส่งได้';
  return null;
}

/** A receiver the code considers for a pool lot, with its F-22 cap (`cap` null = cannot use any before expiry). */
export interface DemandCandidate extends Receiver {
  code: string;
  name: string;
  km: number;
  networkId: string | null;
  cap: Allocation | null;
  /** Transport cost of one line to this receiver (F-23 inputs), THB. */
  transportCostThb: number;
}

/**
 * Receiver candidates of a pool lot (agent tool `get_demand_candidates`): hospitals of the region with a VERIFIED mapping, a WEEK
 * forecast with use > 0 and a distance row, each with the F-22 quantity it can use before expiry, in the F-22 greedy order.
 */
/**
 * Quantity already promised to a receiver by other open plans for the same drug (not yet received). It counts as incoming supply,
 * so several lots of one drug allocated one after the other in a round never fill the same shortfall twice.
 */
async function plannedInbound(db: Db, receiverId: string, drugMasterId: string): Promise<number> {
  const r = await db.query(
    `SELECT COALESCE(sum(al.qty), 0)::float8 AS qty
       FROM allocation_line al
       JOIN allocation_plan ap ON ap.id = al.plan_id
       JOIN pool_entry pe ON pe.id = ap.pool_entry_id
       JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
       JOIN stock_lot sl ON sl.id = ne.lot_id
       JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
      WHERE al.receiver_hospital_id = $1 AND hd.drug_master_id = $2 AND ap.status::text = ANY($3::text[])
        AND NOT EXISTS (SELECT 1 FROM transport_task tt WHERE tt.ref_type = 'ALLOCATION_LINE' AND tt.ref_id = al.id AND tt.status::text IN ('RECEIVED', 'CANCELLED'))`,
    [receiverId, drugMasterId, ACTIVE_PLAN],
  );
  return Number(r.rows[0].qty);
}

export async function demandCandidates(db: Db, pool: PoolLot, today = new Date()): Promise<{ life: number; candidates: DemandCandidate[] }> {
  const cfg = await loadExpiryConfig(db, pool.origin_id);
  const life = remainingDays(new Date(pool.expiry_date), today);
  const rows = (
    await db.query(
      `SELECT h.id, h.code, COALESCE(h.name_th, h.name_en) AS name, h.network_id, d.distance_km::float8 AS km, COALESCE(d.travel_minutes_override, d.travel_minutes)::float8 AS minutes
         FROM hospital h
         JOIN hospital_distance d ON d.from_hospital_id = $2 AND d.to_hospital_id = h.id
        WHERE h.region_id = $1 AND h.id <> $2 AND h.active AND h.agent_participation`,
      [pool.region_id, pool.origin_id],
    )
  ).rows;
  const receivers: DemandCandidate[] = [];
  if (!pool.drug_master_id) return { life, candidates: receivers };
  for (const c of rows) {
    if (c.minutes === null) continue;
    const listing = await findListing(db, c.id, pool.drug_master_id);
    if (!listing || !listing.mapped) continue; // BR-F2a-008: verified mappings only
    const fc = await latestForecast(db, listing.id, 'WEEK');
    const tt = fc?.total_target ?? fc?.p50 ?? null;
    if (!fc || !(fc.u > 0) || tt === null) continue;
    const incoming = await incomingOrders(db, listing.id);
    const r: Receiver = { hospitalId: c.id, totalTarget: tt, stock: await usableStock(db, listing.id), incoming: incoming.qty + (await plannedInbound(db, c.id, pool.drug_master_id)), usePerDay: fc.u, transitDays: c.minutes / 1440 };
    receivers.push({ ...r, code: c.code, name: c.name, km: c.km, networkId: c.network_id, cap: allocateToReceiver(r, life, pool.qty_available), transportCostThb: transportCost(c.km, pool.cold_chain, cfg.cost) });
  }
  const order = greedyOrder(receivers).map((r) => r.hospitalId);
  return { life, candidates: receivers.sort((a, b) => order.indexOf(a.hospitalId) - order.indexOf(b.hospitalId)) };
}

/** The code's own split (F-22 greedy): the rule-based plan, and the fallback when the agent's proposal is unusable. */
export function ruleSplit(pool: PoolLot, life: number, candidates: DemandCandidate[]): AgentProposal['lines'] {
  return splitLot(candidates, pool.qty_available, life).lines.map((l) => ({ receiverHospitalId: l.hospitalId, qty: l.qty }));
}

export async function createPlanFromAgentProposal(client: pg.PoolClient, poolEntryId: string, proposal: AgentProposal, ctx: AuditContext = systemAuditContext(), today = new Date()): Promise<{ planId: string; planNo: string; status: string } | null> {
  const pool = await loadPoolLot(client, poolEntryId, true);
  if (poolLotBlocker(pool, today) || !pool) return null;
  const cfg = await loadExpiryConfig(client, pool.origin_id);
  const { candidates: receivers } = await demandCandidates(client, pool, today);
  // CODE validates the split: only receivers the code finds feasible, never above that receiver's F-22 cap, never above the pool quantity.
  let left = pool.qty_available;
  const accepted: Allocation[] = [];
  for (const l of proposal.lines) {
    const cap = receivers.find((x) => x.hospitalId === l.receiverHospitalId)?.cap ?? null;
    const qty = Math.floor(Math.min(l.qty, cap?.qty ?? 0, left));
    if (!cap || qty <= 0 || accepted.some((a) => a.hospitalId === cap.hospitalId)) continue;
    accepted.push({ ...cap, qty });
    left -= qty;
  }
  const split = { lines: accepted, remainder: left };
  if (split.lines.length === 0) return null;

  const lines = split.lines.map((l) => {
    const r = receivers.find((x) => x.hospitalId === l.hospitalId)!;
    const value = round(l.qty * pool.unit_price, 2);
    return { ...l, km: r.km, value, cost: r.transportCostThb, networkId: r.networkId };
  });
  const totalValue = round(lines.reduce((s, l) => s + l.value, 0), 2);
  const totalCost = round(lines.reduce((s, l) => s + l.cost, 0), 2);
  const check = costCheck(totalCost, totalValue, cfg.cost.ratioMax);
  const involvedHospitals = [pool.origin_id, ...lines.map((l) => l.hospitalId)];
  const sameNetwork = pool.origin_network !== null && lines.every((l) => l.networkId === pool.origin_network);
  const auto = cfg.autoApprove && sameNetwork && !check.uneconomical;

  const planNo = await nextPlanNo(client);
  const run = { id: proposal.agentRunId };
  const plan = (
    await client.query(
      `INSERT INTO allocation_plan (plan_no, region_id, pool_entry_id, status, total_value_thb, total_transport_cost_thb, cost_ratio, economical, agent_run_id, approval_deadline)
       VALUES ($1, $2, $3, $4::plan_status, $5, $6, $7, $8, $9, now() + make_interval(hours => $10::int)) RETURNING id`,
      [planNo, pool.region_id, poolEntryId, auto ? 'AUTO_APPROVED' : 'READY_FOR_APPROVAL', totalValue, totalCost, check.ratio === null ? null : Math.min(check.ratio, 99.9999), !check.uneconomical, run.id, cfg.planApprovalTimeoutH], // numeric(6,4): a ratio above 9999 % is stored capped
    )
  ).rows[0];
  for (const l of lines) {
    await client.query(
      `INSERT INTO allocation_line (plan_id, receiver_hospital_id, qty, value_thb, expected_use_before_expiry, distance_km, transport_cost_thb, cold_chain) VALUES ($1, $2, $3, $4, true, $5, $6, $7)`,
      [plan.id, l.hospitalId, l.qty, l.value, l.km, l.cost, pool.cold_chain],
    );
  }
  await client.query(`UPDATE pool_entry SET qty_available = qty_available - $2 WHERE id = $1`, [poolEntryId, lines.reduce((s, l) => s + l.qty, 0)]);
  for (const h of new Set(involvedHospitals)) {
    await client.query(
      `INSERT INTO plan_approval (plan_id, hospital_id, decision, decided_at, comment) VALUES ($1, $2, $3::approval_decision, $4, $5)`,
      [plan.id, h, auto ? 'APPROVED' : 'PENDING', auto ? new Date().toISOString() : null, auto ? 'อนุมัติอัตโนมัติ (เครือข่ายเดียวกัน)' : null],
    );
  }
  await writeAudit(client, ctx, {
    action: auto ? 'PLAN_AUTO_APPROVED' : 'PLAN_READY',
    entityType: 'allocation_plan',
    entityId: plan.id,
    agentRunId: run.id,
    after: { planNo, source: run.id ? 'AGENT' : 'MANUAL', lines: lines.map((l) => ({ to: l.hospitalId, qty: l.qty, cost: l.cost })), totalValue, totalCost, ratio: check.ratio, economical: !check.uneconomical, remainder: split.remainder },
  });
  for (const h of new Set(involvedHospitals)) {
    await notifyRoles(client, h, ['PHARMACIST'], {
      kind: auto ? 'PLAN_AUTO_APPROVED' : 'PLAN_APPROVAL_REQUEST',
      title: auto ? `แผนจัดสรร ${planNo} อนุมัติอัตโนมัติ` : `แผนจัดสรร ${planNo} รอเห็นชอบ`,
      body: check.uneconomical ? 'ค่าขนส่งเกินเกณฑ์ ต้องเลือกทางเลือกก่อน' : null,
      refType: 'allocation_plan',
      refId: plan.id,
    });
  }
  if (auto) await startTransport(client, plan.id, ctx);
  const status = auto ? 'TRANSPORTING' : 'READY_FOR_APPROVAL';
  return { planId: plan.id, planNo, status };
}

/** Approved plan -> one transport task per line from the origin (lot stays HELD until LOADED); plan TRANSPORTING, lot ALLOCATED. */
export async function startTransport(client: pg.PoolClient, planId: string, ctx: AuditContext): Promise<number> {
  const plan = (
    await client.query(
      `SELECT ap.plan_no, pe.near_expiry_item_id, ne.hospital_id AS origin_id FROM allocation_plan ap
         JOIN pool_entry pe ON pe.id = ap.pool_entry_id JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id WHERE ap.id = $1`,
      [planId],
    )
  ).rows[0];
  const lines = (await client.query(`SELECT id, receiver_hospital_id, cold_chain FROM allocation_line WHERE plan_id = $1 ORDER BY id`, [planId])).rows;
  let created = 0;
  for (const l of lines) {
    const carrier = await defaultCarrier(client, plan.origin_id, l.cold_chain);
    await createTransportTask(client, { refType: 'ALLOCATION_LINE', refId: l.id, fromHospitalId: plan.origin_id, toHospitalId: l.receiver_hospital_id, vehicleId: carrier.vehicleId, driverId: carrier.driverId });
    created += 1;
    await notifyRoles(client, plan.origin_id, ['WAREHOUSE_OFFICER'], { kind: 'TRANSFER_TASK', title: `ขึ้นรถ ${plan.plan_no}`, refType: 'allocation_line', refId: l.id });
    await notifyRoles(client, l.receiver_hospital_id, ['WAREHOUSE_OFFICER'], { kind: 'TRANSFER_INCOMING', title: `ของจากคลังกลางกำลังมา ${plan.plan_no}`, refType: 'allocation_line', refId: l.id });
  }
  await client.query(`UPDATE allocation_plan SET status = 'TRANSPORTING', updated_at = now(), version = version + 1 WHERE id = $1`, [planId]);
  await client.query(`UPDATE near_expiry_item SET status = 'ALLOCATED', updated_at = now(), version = version + 1 WHERE id = $1 AND status = 'RELEASED_TO_POOL'`, [plan.near_expiry_item_id]);
  await writeAudit(client, ctx, { action: 'PLAN_TRANSPORT_STARTED', entityType: 'allocation_plan', entityId: planId, after: { tasks: created } });
  return created;
}

export { ACTIVE_PLAN, auditContext };
