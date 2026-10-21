/**
 * FL-12 allocation, CODE side only. The matching itself (who gets how much of a pool lot) is the AGENT's job and is not built yet:
 * nothing here proposes a split. `createPlanFromAgentProposal` is the seam the Agent will call: it recomputes the F-22 cap of every
 * receiver, validates the proposed quantities against it and the pool quantity, runs the F-23 cost check and stores the plan
 * READY_FOR_APPROVAL (or AUTO_APPROVED inside one network). `startTransport` turns an approved plan into transport tasks.
 */
import type pg from 'pg';
import { auditContext, systemAuditContext, writeAudit } from '../../core/audit.js';
import type { AuditContext } from '../../core/audit.js';
import { allocateToReceiver, costCheck, remainingDays, transportCost } from '../../core/formulas/expiry.js';
import type { Receiver } from '../../core/formulas/expiry.js';
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
/** A split proposed by the Agent (FL-12: AGENT proposes, CODE validates). The code never trusts it: each line is capped by the F-22 allocation it computes itself. */
export interface AgentProposal {
  agentRunId: string;
  lines: { receiverHospitalId: string; qty: number }[];
}

export async function createPlanFromAgentProposal(client: pg.PoolClient, poolEntryId: string, proposal: AgentProposal, ctx: AuditContext = systemAuditContext(), today = new Date()): Promise<{ planId: string; planNo: string; status: string } | null> {
  const pool = (
    await client.query(
      `SELECT pe.id, pe.region_id, pe.qty_available::float8 AS qty_available, ne.id AS item_id, ne.hospital_id AS origin_id, ne.status::text AS item_status,
              sl.id AS lot_id, sl.expiry_date, hd.drug_master_id, COALESCE(hd.unit_price_thb, 0)::float8 AS unit_price, COALESCE(dm.is_cold_chain, false) AS cold_chain,
              COALESCE(dm.is_blood_product, false) AS blood, COALESCE(dm.is_controlled, false) AS controlled, oh.network_id AS origin_network
         FROM pool_entry pe
         JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
         JOIN stock_lot sl ON sl.id = ne.lot_id
         JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
         LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
         JOIN hospital oh ON oh.id = ne.hospital_id
        WHERE pe.id = $1 FOR UPDATE OF pe`,
      [poolEntryId],
    )
  ).rows[0];
  if (!pool || pool.item_status !== 'RELEASED_TO_POOL' || !(pool.qty_available > 0) || !pool.drug_master_id || pool.blood || pool.controlled) return null; // BR-F2a-027 / -031
  const cfg = await loadExpiryConfig(client, pool.origin_id);
  const life = remainingDays(new Date(pool.expiry_date), today);
  if (life <= 1) return null;

  const candidates = (
    await client.query(
      `SELECT h.id, h.code, h.network_id, d.distance_km::float8 AS km, COALESCE(d.travel_minutes_override, d.travel_minutes)::float8 AS minutes
         FROM hospital h
         JOIN hospital_distance d ON d.from_hospital_id = $2 AND d.to_hospital_id = h.id
        WHERE h.region_id = $1 AND h.id <> $2 AND h.active AND h.agent_participation`,
      [pool.region_id, pool.origin_id],
    )
  ).rows;
  const receivers: (Receiver & { km: number; networkId: string | null })[] = [];
  for (const c of candidates) {
    if (c.minutes === null) continue;
    const listing = await findListing(client, c.id, pool.drug_master_id);
    if (!listing || !listing.mapped) continue; // BR-F2a-008: verified mappings only
    const fc = await latestForecast(client, listing.id, 'WEEK');
    const tt = fc?.total_target ?? fc?.p50 ?? null;
    if (!fc || !(fc.u > 0) || tt === null) continue;
    const incoming = await incomingOrders(client, listing.id);
    receivers.push({ hospitalId: c.id, totalTarget: tt, stock: await usableStock(client, listing.id), incoming: incoming.qty, usePerDay: fc.u, transitDays: c.minutes / 1440, km: c.km, networkId: c.network_id });
  }
  // CODE validates the Agent's split: only receivers the code finds feasible, never above that receiver's F-22 cap, never above the pool quantity.
  let left = pool.qty_available;
  const accepted: NonNullable<ReturnType<typeof allocateToReceiver>>[] = [];
  for (const l of proposal.lines) {
    const r = receivers.find((x) => x.hospitalId === l.receiverHospitalId);
    const cap = r ? allocateToReceiver(r, life, pool.qty_available) : null;
    const qty = Math.floor(Math.min(l.qty, cap?.qty ?? 0, left));
    if (!cap || qty <= 0) continue;
    accepted.push({ ...cap, qty });
    left -= qty;
  }
  const split = { lines: accepted, remainder: left };
  if (split.lines.length === 0) return null;

  const lines = split.lines.map((l) => {
    const r = receivers.find((x) => x.hospitalId === l.hospitalId)!;
    const value = round(l.qty * pool.unit_price, 2);
    return { ...l, km: r.km, value, cost: transportCost(r.km, pool.cold_chain, cfg.cost), networkId: r.networkId };
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
    after: { planNo, lines: lines.map((l) => ({ to: l.hospitalId, qty: l.qty, cost: l.cost })), totalValue, totalCost, ratio: check.ratio, economical: !check.uneconomical, remainder: split.remainder },
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
