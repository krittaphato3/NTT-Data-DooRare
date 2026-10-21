/**
 * F1b formulas as pure functions (spec §9.2). Every number the borrowing flow shows comes from here, never from an
 * LLM (BR-F1b-038). Each function names the formula / rule it implements; examples are in `tests/borrow.formulas.test.ts`.
 */

export type Ved = 'V' | 'E' | 'D';
export type Urgency = 'NORMAL' | 'URGENT' | 'VERY_URGENT';
export type DemandPattern = 'REGULAR' | 'INTERMITTENT' | 'NO_USAGE';

export const round = (value: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
};

/** F-08 lead time L (BR-F1b-005): earliest open PO eta (not overdue), else the drug's standard lead time. */
export function leadTimeDays(poEta: Date | null, today: Date, standardDays: number): number {
  if (poEta) {
    const days = Math.ceil((poEta.getTime() - today.getTime()) / 86_400_000);
    if (days >= 0) return Math.max(1, days);
  }
  return Math.max(1, Math.ceil(standardDays));
}

/** F-08 / BR-F1b-006-007: daily use from P50 only (no buffer): P50_week / 7 when L <= 7, else P50_month / 30. */
export function dailyUsage(p50Week: number | null, p50Month: number | null, leadDays: number): number | null {
  if (leadDays <= 7) return p50Week === null ? null : p50Week / 7;
  return p50Month === null ? null : p50Month / 30;
}

/** F-09 required quantity until the new lot arrives. REGULAR: u*L + Z*sigma*sqrt(L); INTERMITTENT: the lead-time quantile. */
export function requiredQty(input: { pattern: DemandPattern; u: number; leadDays: number; sigma: number; z: number; quantileOverLead: number | null }): number {
  if (input.pattern === 'INTERMITTENT' && input.quantileOverLead !== null) return input.quantileOverLead;
  return input.u * input.leadDays + input.z * input.sigma * Math.sqrt(input.leadDays);
}

/** F-09: borrow = ceil(max(0, R - stock - incoming)); 0 means no borrowing needed (BR-F1b-004). */
export const borrowQty = (required: number, stock: number, incoming: number): number => Math.max(0, Math.ceil(required - stock - incoming - 1e-9));

/** F-10 window: days until stock-out; u = 0 is capped at 365 days, no stock is 0 (edge cases of the spec). */
export function windowMaxDays(stock: number, u: number): number {
  if (stock <= 0) return 0;
  if (u <= 0) return 365;
  return Math.min(365, stock / u);
}

/** F-11 urgency from days to stock-out and VED (thresholds are the `borrow.urgency.*` settings). */
export function urgencyFor(ved: Ved, windowDays: number, cfg = { veryUrgentVDays: 2, urgentVDays: 7, urgentEDays: 2 }): Urgency {
  if (ved === 'V') return windowDays <= cfg.veryUrgentVDays ? 'VERY_URGENT' : windowDays <= cfg.urgentVDays ? 'URGENT' : 'NORMAL';
  if (ved === 'E') return windowDays <= cfg.urgentEDays ? 'URGENT' : 'NORMAL';
  return 'NORMAL';
}

/** BR-F1b-009: a (human-approved) adjustment may raise urgency by one level, never lower it. */
export const raiseUrgency = (u: Urgency): Urgency => (u === 'NORMAL' ? 'URGENT' : 'VERY_URGENT');

/** F-13 LendableStock = max(0, usable_for_lending - lender Total Target). `usableForLending` already excludes held, expired and < 180-day lots. */
export const lendableStock = (usableForLending: number, lenderTotalTarget: number): number => Math.max(0, usableForLending - lenderTotalTarget);

export interface HardFilterInput {
  transitMin: number | null;
  windowMaxMin: number;
  lendable: number;
  coldChain: boolean;
  lenderColdChainCapable: boolean;
  boxMinutes: number;
  controlled: boolean;
  lenderActive: boolean;
  lenderAgentParticipation: boolean;
  mappingVerified: boolean;
  /** Lender forecast (Total Target) exists; without it LendableStock cannot be computed (F-13 edge case). */
  hasTotalTarget: boolean;
}

/** F-12 hard filter. Returns the first failing reason or null when the lender is eligible. */
export function hardFilterFailure(i: HardFilterInput): string | null {
  if (i.transitMin === null) return 'NO_DISTANCE';
  if (!i.lenderActive) return 'INACTIVE';
  if (!i.lenderAgentParticipation) return 'NOT_PARTICIPATING';
  if (!i.mappingVerified) return 'MAPPING_NOT_VERIFIED';
  if (i.controlled) return 'CONTROLLED_DRUG';
  if (!i.hasTotalTarget) return 'NO_TOTAL_TARGET';
  if (!(i.transitMin <= i.windowMaxMin)) return 'TRANSIT_TOO_LONG';
  if (!(i.lendable > 0)) return 'NO_LENDABLE_STOCK';
  if (i.coldChain && !(i.lenderColdChainCapable && i.transitMin <= i.boxMinutes)) return 'COLD_CHAIN';
  return null;
}

/*
 * The four component scores are kept UNROUNDED: the spec's worked example for lender E (Si = 0.5348) only comes out when Si is
 * computed from the exact parts and rounded once at the end. Use `roundParts` for what is stored / displayed.
 */
/** F-15 */
export const scoreTime = (transitMin: number, windowMaxMin: number): number => Math.max(0, 1 - transitMin / windowMaxMin);
/** F-16 */
export const scoreFulfill = (lendable: number, borrow: number): number => Math.min(1, lendable / borrow);
/** F-17: days of stock the lender keeps after lending, capped by `stock_safety_days` (u_lender = 0 gives 1). */
export function scoreStockSafety(currentStock: number, qtyLend: number, uLender: number, safetyDays = 30): number {
  if (uLender <= 0) return 1;
  return Math.max(0, Math.min(1, (currentStock - qtyLend) / uLender / safetyDays));
}
/** F-18: approval rate x (1 - timeout rate); no history gives the default 0.5 (BR-F1b-017). */
export function scoreReliability(approvalRate: number | null, timeoutRate: number | null, fallback = 0.5): number {
  if (approvalRate === null || timeoutRate === null) return fallback;
  return approvalRate * (1 - timeoutRate);
}

export interface ScoreParts {
  time: number;
  fulfill: number;
  stockSafety: number;
  reliability: number;
}
export const roundParts = (p: ScoreParts): ScoreParts => ({ time: round(p.time, 4), fulfill: round(p.fulfill, 4), stockSafety: round(p.stockSafety, 4), reliability: round(p.reliability, 4) });

export interface ScoreWeights {
  time: number;
  fulfill: number;
  stockSafety: number;
  reliability: number;
}
export const DEFAULT_WEIGHTS: ScoreWeights = { time: 0.45, fulfill: 0.28, stockSafety: 0.17, reliability: 0.1 };

/** F-14 Si (4 decimals). */
export function priorityScore(parts: ScoreParts, w: ScoreWeights = DEFAULT_WEIGHTS): number {
  return round(w.time * parts.time + w.fulfill * parts.fulfill + w.stockSafety * parts.stockSafety + w.reliability * parts.reliability + 1e-9, 4);
}

/** Ranking: Si desc, ties by shorter transit then hospital id (F-14 rounding note). */
export function rankBySi<T extends { si: number; transitMin: number; hospitalId: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.si - a.si || a.transitMin - b.transitMin || (a.hospitalId < b.hospitalId ? -1 : a.hospitalId > b.hospitalId ? 1 : 0));
}

/**
 * F-21 round allocation. `ranked` is in Si order. Sequential: first lender only. Parallel (very urgent): up to `maxParallel`
 * lenders until the remaining need is 0. q_j = min(shareable_j, remaining), shareable_j = min(lendable_j, borrow_remaining).
 */
export function allocateRound<T extends { hospitalId: string; lendable: number }>(ranked: T[], borrowRemaining: number, parallel: boolean, maxParallel = 3): { hospitalId: string; qty: number }[] {
  const out: { hospitalId: string; qty: number }[] = [];
  let remaining = borrowRemaining;
  for (const lender of ranked) {
    if (remaining <= 0 || out.length >= (parallel ? maxParallel : 1)) break;
    const qty = Math.min(Math.min(lender.lendable, borrowRemaining), remaining);
    if (qty > 0) {
      out.push({ hospitalId: lender.hospitalId, qty });
      remaining -= qty;
    }
  }
  return out;
}

/** F-20 normal use for E drugs: max(0, u*L - stock - incoming). */
export const normalUseQty = (u: number, leadDays: number, stock: number, incoming: number): number => Math.max(0, u * leadDays - stock - incoming);

/**
 * F-20 stop rule. V: confirmed >= 0.90 x first-round quantity. E: confirmed >= normal use. D never borrows.
 * Returns the threshold so screens can show "got X of Y".
 */
export function stopThreshold(ved: Ved, firstRoundQty: number, normalUse: number, ratioV = 0.9, ratioE = 1): number {
  if (ved === 'V') return Math.ceil(ratioV * firstRoundQty - 1e-9);
  if (ved === 'E') return Math.ceil(ratioE * normalUse - 1e-9);
  return Infinity;
}
export const stopMet = (confirmedTotal: number, threshold: number): boolean => confirmedTotal >= threshold;

/** F-20 after each response: ask the next lender for ceil(max(0, R - stock - incoming - confirmed)). */
export const borrowRemaining = (required: number, stock: number, incoming: number, confirmed: number): number => Math.max(0, Math.ceil(required - stock - incoming - confirmed - 1e-9));

/** F-19 timeout: T_eff = min(table, remaining stock window); reminder at 50 %; under 15 minutes escalates at once. */
export function timeoutPlan(urgency: Urgency, stock: number, u: number, table = { VERY_URGENT: 120, URGENT: 360, NORMAL: 2880 }, reminderRatio = 0.5) {
  const windowMin = u > 0 ? (stock / u) * 1440 : Infinity;
  const effective = Math.min(table[urgency], windowMin);
  return { effectiveMin: effective, reminderAfterMin: effective * reminderRatio, autoEscalate: effective < 15 };
}
