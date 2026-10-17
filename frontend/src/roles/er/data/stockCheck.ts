import type { ExtraDrugRow, PresetKitRow } from './incident';

/** One line of the stock check: what the plan needs against what the hospital holds. */
export interface StockLine {
  name: string;
  kind: 'kit' | 'extra';
  type: string;
  typeCls: string;
  unit: string;
  need: number;
  /** Ready-to-use stock (kits) or on-hand stock (extras). */
  have: number;
  /** Kits assembled from loose parts (kits only). */
  assemble: number;
  /** Still missing → must be borrowed. */
  shortage: number;
}

const num = (s: string) => parseInt(s.replace(/,/g, ''), 10) || 0;

/** Check the (possibly edited) plan against stock: kits use ready stock, then loose parts, then borrow. */
export function buildStockCheck(kits: PresetKitRow[], extras: ExtraDrugRow[]): StockLine[] {
  const kitLines = kits.map((k): StockLine => ({
    name: k.name,
    kind: 'kit',
    type: k.type,
    typeCls: k.typeCls,
    unit: 'ชุด',
    need: k.estimated,
    have: k.readyInStock,
    assemble: k.assembleFromParts,
    shortage: Math.max(0, k.estimated - k.readyInStock - k.assembleFromParts),
  }));
  const extraLines = extras.map((d): StockLine => ({
    name: d.name,
    kind: 'extra',
    type: d.type,
    typeCls: d.typeCls,
    unit: d.estimated.replace(/^[\d,\s]+/, '') || 'หน่วย',
    need: num(d.estimated),
    have: num(d.stock),
    assemble: 0,
    shortage: num(d.borrowQty),
  }));
  return [...kitLines, ...extraLines];
}

export interface Lender {
  name: string;
  /** Travel time to us, minutes. */
  travelMin: number;
}

/** Nearby hospitals the Agent can ask, nearest first (mock). */
export const LENDERS: Lender[] = [
  { name: 'รพ.พระสมุทรเจดีย์ฯ', travelMin: 11 },
  { name: 'รพ.บางพลี', travelMin: 14 },
  { name: 'รพ.บางเสาธง', travelMin: 19 },
];

export interface DraftLender extends Lender {
  /** Arrives no later than the patients. */
  inTime: boolean;
}

export interface BorrowRequestDraft {
  id: string;
  item: string;
  qty: number;
  unit: string;
  urgent: boolean;
  /** Lender must answer within this many minutes (critical 3, supporting 5). */
  timeoutMin: number;
  lenders: DraftLender[];
  /** No hospital arrives in time: sent to the fastest one and flagged LATE_FOR_ETA. */
  late: boolean;
}

/**
 * The Agent's proposal for the missing items: ask every hospital that arrives within the ETA at the
 * same time (first to confirm wins, the rest are cancelled); if none arrives in time, ask the fastest.
 */
export function planBorrowRequests(lines: StockLine[], etaMin: number, startNo = 134): BorrowRequestDraft[] {
  return lines
    .filter((l) => l.shortage > 0)
    .map((l, i): BorrowRequestDraft => {
      const urgent = l.typeCls === 'ug-critical';
      const all = LENDERS.map((h): DraftLender => ({ ...h, inTime: h.travelMin <= etaMin }));
      const inTime = all.filter((h) => h.inTime);
      return {
        id: `BR-2026-${String(startNo + i).padStart(6, '0')}`,
        item: l.name,
        qty: l.shortage,
        unit: l.unit,
        urgent,
        timeoutMin: urgent ? 3 : 5,
        lenders: inTime.length ? inTime : [all[0]],
        late: inTime.length === 0,
      };
    });
}
