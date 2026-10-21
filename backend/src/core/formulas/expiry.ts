/**
 * F2 formulas as pure functions (spec §9.4: F-22 expiry feasibility and allocation, F-23 transport cost vs value,
 * F-25 repeated expiry). Every number of the near-expiry / pool / allocation screens comes from here, never from an LLM.
 * Worked examples are in `tests/expiry.formulas.test.ts`.
 */
import { round } from './borrow.js';

/** F-22: `remaining_days = expiry_date - today` (whole days). */
export function remainingDays(expiry: Date, today: Date): number {
  const d0 = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d0 - t0) / 86_400_000);
}

/** Near-expiry if `remaining_days <= threshold_days` and the lot is not expired yet (an expired lot cannot be released). */
export const isNearExpiry = (remaining: number, thresholdDays: number): boolean => remaining > 0 && remaining <= thresholdDays;

/** Quantity the owner can still use before expiry (FEFO, UI-07 drawer): floor((days_left - 1) * u). */
export const fefoUsable = (daysLeft: number, usePerDay: number): number => Math.max(0, Math.floor((daysLeft - 1) * usePerDay));

/** Suggested release quantity: what FEFO use will not consume. */
export const releasable = (qty: number, daysLeft: number, usePerDay: number): number => Math.max(0, qty - fefoUsable(daysLeft, usePerDay));

export interface Receiver {
  hospitalId: string;
  /** Receiver Total Target TT_r (Q-05), stock_r (usable), incoming_r, u_r units/day, transit time in days. */
  totalTarget: number;
  stock: number;
  incoming: number;
  usePerDay: number;
  transitDays: number;
}

export interface Allocation {
  hospitalId: string;
  qty: number;
  deficit: number;
  daysAvail: number;
  consumable: number;
  daysOfStock: number;
  transitDays: number;
}

/** F-22 for one receiver: alloc = min(qty_remaining, deficit, consumable), integer; infeasible when 0 or when it cannot be used up in time. */
export function allocateToReceiver(r: Receiver, remainingLife: number, qtyRemaining: number, handlingDays = 1): Allocation | null {
  if (!(r.usePerDay > 0)) return null; // u_r = 0: not feasible
  const deficit = Math.max(0, r.totalTarget - r.stock - r.incoming);
  const daysAvail = remainingLife - r.transitDays - handlingDays;
  const consumable = Math.floor(Math.max(0, daysAvail) * r.usePerDay);
  const qty = Math.floor(Math.min(qtyRemaining, deficit, consumable) + 1e-9);
  if (!(qty > 0) || qty / r.usePerDay > daysAvail) return null;
  return { hospitalId: r.hospitalId, qty, deficit, daysAvail, consumable, daysOfStock: r.stock / r.usePerDay, transitDays: r.transitDays };
}

/** Greedy order of F-22 / BR-F2a-025: fewest days of stock first, ties by shorter transit. */
export const greedyOrder = (rs: Receiver[]): Receiver[] =>
  [...rs].sort((a, b) => {
    const da = a.usePerDay > 0 ? a.stock / a.usePerDay : Infinity;
    const db = b.usePerDay > 0 ? b.stock / b.usePerDay : Infinity;
    return da - db || a.transitDays - b.transitDays;
  });

/** F-22 greedy split of a pool lot across receivers; the remainder (sum < qty) stays in the pool. */
export function splitLot(rs: Receiver[], qtyPool: number, remainingLife: number, handlingDays = 1): { lines: Allocation[]; remainder: number } {
  const lines: Allocation[] = [];
  let remaining = qtyPool;
  for (const r of greedyOrder(rs)) {
    if (remaining <= 0) break;
    const a = allocateToReceiver(r, remainingLife, remaining, handlingDays);
    if (!a) continue;
    lines.push(a);
    remaining -= a.qty;
  }
  return { lines, remainder: remaining };
}

export interface CostModel {
  base: number;
  perKm: number;
  coldChainSurcharge: number;
  ratioMax: number;
}

/** F-23: cost = base + per_km * km (+ cold-chain surcharge), THB with 2 decimals. */
export const transportCost = (distanceKm: number, coldChain: boolean, m: CostModel): number => round(m.base + m.perKm * distanceKm + (coldChain ? m.coldChainSurcharge : 0), 2);

/** F-23: uneconomical when cost >= ratio_max * value (value 0 is uneconomical). Returns the ratio (null when value is 0). */
export function costCheck(cost: number, value: number, ratioMax: number): { ratio: number | null; uneconomical: boolean } {
  if (!(value > 0)) return { ratio: null, uneconomical: true };
  return { ratio: round(cost / value, 4), uneconomical: cost >= ratioMax * value - 1e-9 };
}

export interface RepeatInput {
  /** Lots expired or released to the pool because of near-expiry in the trailing window (exceptions already excluded) and what was left. */
  leftovers: { qty: number; unitCost: number }[];
  watchCount: number;
  recommendCount: number;
  recommendValueThb: number;
}

/** F-25 level: WATCH if n >= 2; RECOMMEND if n >= 3 or lost value >= threshold. */
export function repeatLevel(i: RepeatInput): { level: 'WATCH' | 'RECOMMEND' | null; lots: number; lostValue: number } {
  const lots = i.leftovers.length;
  const lostValue = round(i.leftovers.reduce((s, l) => s + l.qty * l.unitCost, 0), 2);
  const level = lots >= i.recommendCount || (lots > 0 && lostValue >= i.recommendValueThb) ? 'RECOMMEND' : lots >= i.watchCount ? 'WATCH' : null;
  return { level, lots, lostValue };
}

/** F-25 recommendation: new_order = max(order_qty_avg - avg_leftover, ceil(u * order_cycle_days)); null when no order history or nothing to cut. */
export function reductionPlan(input: { orderQtyAvg: number | null; orderCycleDays: number | null; usePerDay: number; unitCost: number; avgLeftover: number }):
  { newOrder: number; reduction: number; cyclesPerYear: number; expectedSavingsThb: number } | null {
  if (input.orderQtyAvg === null || input.orderCycleDays === null || !(input.orderCycleDays > 0)) return null;
  const newOrder = Math.max(input.orderQtyAvg - input.avgLeftover, Math.ceil(input.usePerDay * input.orderCycleDays));
  const reduction = input.orderQtyAvg - newOrder;
  if (!(reduction > 0)) return null;
  const cyclesPerYear = Math.floor(365 / input.orderCycleDays);
  return { newOrder, reduction, cyclesPerYear, expectedSavingsThb: round(reduction * cyclesPerYear * input.unitCost, 2) };
}
