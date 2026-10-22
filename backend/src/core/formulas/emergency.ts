/**
 * F3 formulas as pure functions (spec §9.5: F-26 ETA, F-27 kit requirement / spreading / plan, F-28 emergency timeout).
 * Every number of the incident plan comes from here, never from an LLM. Worked examples are in
 * `tests/emergency.formulas.test.ts`.
 */

export type Triage = 'RED' | 'YELLOW' | 'GREEN' | 'BLACK' | 'UNKNOWN';
export type Counts = Record<Triage, number>;
export type EmergencyClass = 'CRITICAL' | 'SUPPORTIVE';

export const TRIAGE_LEVELS: readonly Triage[] = ['RED', 'YELLOW', 'GREEN', 'BLACK', 'UNKNOWN'];
/** Only these levels carry kit / extra-item rules; BLACK and UNKNOWN are counted but never produce lines. */
export const PLANNED_TRIAGE: readonly Triage[] = ['RED', 'YELLOW', 'GREEN'];

export const emptyCounts = (): Counts => ({ RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0, UNKNOWN: 0 });

/** `ceil` that ignores binary noise: 10 patients x 0.7 is 7, not 8. */
export const ceilSafe = (value: number): number => Math.ceil(Math.round(value * 1e6) / 1e6 - 1e-9) || 0;

// ───────────────────────────── F-26 ETA ─────────────────────────────

export type EtaSource = 'REPORTED' | 'ROUTE' | 'UNAVAILABLE';
export type EtaFlag = 'ETA_UNAVAILABLE' | 'ROUTE_UNAVAILABLE';

export interface EtaInput {
  /** Minutes reported by the rescue unit (entered by the officer). */
  reported?: number | null;
  unsure?: boolean;
  /** Minutes from the route service, when it answered. */
  route?: number | null;
}

export interface EtaResult {
  minutes: number | null;
  source: EtaSource;
  flags: EtaFlag[];
}

const wholeMinutes = (m: number): number => Math.max(1, Math.floor(m));

/**
 * `ETA = reported` when entered and not unsure; `min(reported, route)` when unsure and both exist; the route time when
 * nothing was reported; otherwise ETA_UNAVAILABLE (no number is ever invented, no distance / speed fallback).
 */
export function resolveEta(input: EtaInput): EtaResult {
  const reported = input.reported != null && input.reported > 0 ? wholeMinutes(input.reported) : null;
  const route = input.route != null && input.route > 0 ? wholeMinutes(input.route) : null;
  const unsure = Boolean(input.unsure);
  if (reported !== null && !unsure) return { minutes: reported, source: 'REPORTED', flags: [] };
  if (reported !== null && route !== null) return route < reported ? { minutes: route, source: 'ROUTE', flags: [] } : { minutes: reported, source: 'REPORTED', flags: [] };
  if (reported !== null) return { minutes: reported, source: 'REPORTED', flags: ['ROUTE_UNAVAILABLE'] };
  if (route !== null) return { minutes: route, source: 'ROUTE', flags: [] };
  return { minutes: null, source: 'UNAVAILABLE', flags: ['ETA_UNAVAILABLE'] };
}

/** Minutes left until the casualties arrive (0 once the ETA has passed); null while the ETA is unavailable. */
export function etaRemainingMin(etaMinutes: number | null, startedAt: Date, now: Date): number | null {
  if (etaMinutes === null) return null;
  return Math.max(0, etaMinutes - (now.getTime() - startedAt.getTime()) / 60_000);
}

// ───────────────────────────── F-28 timeout ─────────────────────────────

/** `T_eff = max(1, min(T_class, ETA_remaining))` whole minutes; the class time alone while the ETA is unavailable. */
export function emergencyTimeoutMin(cls: EmergencyClass, etaRemaining: number | null, cfg: { critical: number; supportive: number }): number {
  const base = cls === 'CRITICAL' ? cfg.critical : cfg.supportive;
  if (etaRemaining === null) return base;
  return Math.max(1, Math.min(base, Math.floor(etaRemaining)));
}

// ───────────────────────────── F-27 requirement ─────────────────────────────

export interface Rule {
  key: string;
  triage: Triage;
  perPatient: number;
  critical: boolean;
}

export interface NeedLine {
  key: string;
  est: number;
  crit: number;
}

/**
 * Estimated = `ceil(sum over triage of patients x per-patient)` over all planned levels; Critical Minimum = the same over the
 * rows flagged critical (RED in the rules). Fractions accumulate before the ceiling. Lines are sorted by key.
 */
export function needs(counts: Counts, rules: Rule[]): NeedLine[] {
  const est = new Map<string, number>();
  const crit = new Map<string, number>();
  for (const rule of rules) {
    if (!PLANNED_TRIAGE.includes(rule.triage)) continue;
    const patients = counts[rule.triage] ?? 0;
    est.set(rule.key, (est.get(rule.key) ?? 0) + patients * rule.perPatient);
    if (rule.critical) crit.set(rule.key, (crit.get(rule.key) ?? 0) + patients * rule.perPatient);
    else if (!crit.has(rule.key)) crit.set(rule.key, 0);
  }
  return [...est.keys()]
    .sort()
    .map((key) => ({ key, est: ceilSafe(est.get(key) ?? 0), crit: ceilSafe(crit.get(key) ?? 0) }))
    .filter((line) => line.est > 0 || line.crit > 0);
}

export interface KitInput {
  key: string;
  est: number;
  crit: number;
  /** Ready (packed) sets the hospital can use now. */
  ready: number;
  /** Recipe: units of each item in one set. Empty = no recipe. */
  components: { item: string; perKit: number }[];
}

export interface PlannedKit {
  key: string;
  quantity: number;
  useReady: number;
  /** Most sets the loose stock could still complete. */
  packMax: number;
  pack: number;
  borrowSet: number;
  noRecipe: boolean;
  overridden: boolean;
}

export interface PlannedExtra {
  key: string;
  quantity: number;
  useLoose: number;
  borrow: number;
}

export interface RejectedOverride {
  key: string;
  requested: number;
  max: number;
}

export interface PlanResult {
  kits: PlannedKit[];
  extras: PlannedExtra[];
  looseLeft: Record<string, number>;
  rejectedOverrides: RejectedOverride[];
}

const floorUnits = (value: number): number => Math.max(0, Math.floor(value + 1e-9));

/**
 * Plan for one quantity (`est` or `crit`) in the priority order of BR-F3-011: ready sets, then pack from loose stock
 * (only complete sets; kits ordered critical first so shared components go to them first), then borrow whole sets;
 * extra items use loose stock left over and borrow the rest. Staff may lower the pack count (`packOverrides`), the
 * difference becomes borrow quantity; a higher count is returned in `rejectedOverrides` and ignored.
 */
export function planKits(
  kits: KitInput[],
  extras: { key: string; est: number; crit: number }[],
  loose: Record<string, number>,
  basis: 'est' | 'crit',
  packOverrides: Record<string, number> = {},
): PlanResult {
  const left: Record<string, number> = { ...loose };
  const rejectedOverrides: RejectedOverride[] = [];
  const ordered = [...kits].sort((a, b) => (b.crit > 0 ? 1 : 0) - (a.crit > 0 ? 1 : 0) || a.key.localeCompare(b.key));
  const plannedKits = ordered.map((kit): PlannedKit => {
    const quantity = basis === 'est' ? kit.est : kit.crit;
    const useReady = Math.min(quantity, Math.max(0, kit.ready));
    const rem = quantity - useReady;
    const noRecipe = kit.components.length === 0;
    const packMax = noRecipe ? 0 : Math.min(...kit.components.map((c) => floorUnits((left[c.item] ?? 0) / c.perKit)));
    let pack = Math.min(rem, packMax);
    let overridden = false;
    const override = packOverrides[kit.key];
    if (override !== undefined) {
      if (override > pack || override < 0 || !Number.isInteger(override)) rejectedOverrides.push({ key: kit.key, requested: override, max: pack });
      else if (override < pack) {
        pack = override;
        overridden = true;
      }
    }
    for (const c of kit.components) left[c.item] = (left[c.item] ?? 0) - pack * c.perKit;
    return { key: kit.key, quantity, useReady, packMax, pack, borrowSet: rem - pack, noRecipe, overridden };
  });
  const plannedExtras = [...extras]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((extra): PlannedExtra => {
      const quantity = basis === 'est' ? extra.est : extra.crit;
      const useLoose = Math.min(quantity, floorUnits(left[extra.key] ?? 0));
      left[extra.key] = (left[extra.key] ?? 0) - useLoose;
      return { key: extra.key, quantity, useLoose, borrow: quantity - useLoose };
    });
  return { kits: plannedKits, extras: plannedExtras, looseLeft: left, rejectedOverrides };
}

export interface SpreadLine {
  item: string;
  need: number;
  available: number;
  shortage: number;
}

/**
 * One-pass inventory check (BR-F3-009): spread the estimated kits by recipe into items, add the extra items and compare with
 * loose stock plus the items inside ready sets. Calculation only, no real set is opened. Informational.
 */
export function spread(
  kits: { key: string; est: number; ready: number; components: { item: string; perKit: number }[] }[],
  extras: { key: string; est: number }[],
  loose: Record<string, number>,
): SpreadLine[] {
  const need = new Map<string, number>();
  const available = new Map<string, number>(Object.entries(loose));
  for (const kit of kits) {
    for (const c of kit.components) {
      need.set(c.item, (need.get(c.item) ?? 0) + kit.est * c.perKit);
      available.set(c.item, (available.get(c.item) ?? 0) + kit.ready * c.perKit);
    }
  }
  for (const extra of extras) need.set(extra.key, (need.get(extra.key) ?? 0) + extra.est);
  return [...need.keys()]
    .sort()
    .map((item) => {
      const n = Math.round((need.get(item) ?? 0) * 1000) / 1000;
      const a = Math.round((available.get(item) ?? 0) * 1000) / 1000;
      return { item, need: n, available: a, shortage: Math.max(0, Math.round((n - a) * 1000) / 1000) };
    });
}

// ───────────────────────────── lender choice (BR-F3-017/020/021) ─────────────────────────────

export interface LenderCandidate {
  hospitalId: string;
  /** Travel minutes lender -> borrower from the distance matrix (null when unknown). */
  transitMin: number | null;
}

export type LenderMode = 'IN_TIME' | 'FASTEST_LATE' | 'ETA_UNKNOWN';

/**
 * Picks the hospitals to ask at once. ETA known: those with `Ttransit <= ETA remaining`, nearest first; when nobody can arrive in
 * time the single fastest one is asked and the result is flagged late (BR-F3-021). ETA unknown: nearest ones, flagged so the
 * staff can choose lenders themselves by radio.
 */
export function chooseLenders(candidates: LenderCandidate[], etaRemaining: number | null, cap: number, unknownEtaCap = 3): { chosen: LenderCandidate[]; mode: LenderMode } {
  const byTime = [...candidates].sort((a, b) => (a.transitMin ?? Infinity) - (b.transitMin ?? Infinity) || a.hospitalId.localeCompare(b.hospitalId));
  if (byTime.length === 0) return { chosen: [], mode: etaRemaining === null ? 'ETA_UNKNOWN' : 'IN_TIME' };
  if (etaRemaining === null) return { chosen: byTime.slice(0, unknownEtaCap), mode: 'ETA_UNKNOWN' };
  const inTime = byTime.filter((c) => c.transitMin !== null && c.transitMin <= etaRemaining);
  if (inTime.length > 0) return { chosen: inTime.slice(0, cap), mode: 'IN_TIME' };
  return { chosen: byTime.slice(0, 1), mode: 'FASTEST_LATE' };
}

/** Class of a kit line: critical when it is part of the Critical Minimum. */
export const kitClass = (crit: number): EmergencyClass => (crit > 0 ? 'CRITICAL' : 'SUPPORTIVE');
