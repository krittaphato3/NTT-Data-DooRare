/** Mock data for the "ภาระการคืน · Return obligations" sub-tab (Hospital Admin, Phase 2C).
 *
 * Ground truth: `specification/`
 *  - `return_obligation` (§12 / schema.sql:315): `qty` is base units, `qty_returned` is cumulative
 *    and may not exceed `qty`, `return_mode` is IN_KIND | BLOOD_REPLACEMENT, `due_date` defaults to
 *    receipt + 30 days, `status` is the `return_status` enum, `waived_reason` / `waived_by` are set
 *    only on a waive.
 *  - SM-7 (`05-flows-states.md`): `OPEN → REMINDED → RETURNED | OVERDUE → RETURNED | WAIVED`;
 *    reminders at due−7 and due−1; OVERDUE after the due date; WAIVED by HOSPITAL_ADMIN with reason.
 *  - FR-XC-003 (reminders), FR-XC-004 + F-30 (in kind only — same drug, same base-unit quantity;
 *    partial returns close the obligation only when cumulative = borrowed), BR-XC-013 (blood is
 *    returned as replacement through the blood bank), Q-19 (own hospital + counter-party only).
 *
 * Endpoint it will call when wired: API-XC-003 `GET /api/v1/return-obligations`
 * (PHARMACIST, HOSPITAL_ADMIN, WAREHOUSE_OFFICER). Every row is the return leg of one of *our own*
 * borrow requests: the debtor is always this hospital, the counter-party is the lender we must
 * return to. Values are mock and live in memory only — a waive is lost on reload (no persistence).
 */

import type { IconName } from '../../../components/common/icons';
import type { Tone } from './borrow';

/** `return_status` enum (schema.sql:42), one tile per value. */
export type ObligationState = 'OPEN' | 'REMINDED' | 'RETURNED' | 'OVERDUE' | 'WAIVED';

/** `return_obligation.return_mode` (BR-XC-013: blood is replaced, not returned in kind). */
export type ReturnMode = 'IN_KIND' | 'BLOOD_REPLACEMENT';

/** Which reminder FR-XC-003 already sent for this obligation. */
export type ReminderStage = 'DUE_7' | 'DUE_1' | 'DAILY';

/** Badge tones used here; `teal`/`orange` exist in the CSS beyond the borrow-page tone set. */
export type ObligationTone = Tone | 'teal' | 'orange';

export interface ReturnObligation {
  /** `RO-…` obligation number (`return_obligation.id`). */
  id: string;
  /** Live data: the obligation uuid used by the API. */
  uuid?: string;
  /** The borrow request this obligation came from — our own request, always. */
  requestId: string;
  /** Which round/lender leg produced it (`return_obligation.leg_id` → `borrow_leg`). */
  leg: string;
  /** Counter-party we must return to (`creditor_hospital_id`); we are the debtor. */
  creditor: string;
  drug: string;
  ved: 'V' | 'E' | 'D';
  /** Base units borrowed. */
  qty: number;
  /** Cumulative returned / replaced base units — never above `qty` (CHECK in the schema). */
  qtyReturned: number;
  unit: string;
  mode: ReturnMode;
  /** Thai short Buddhist-era due date. */
  dueDate: string;
  /** Days until due on 14 ต.ค. 69; negative means overdue. */
  daysLeft: number;
  state: ObligationState;
  reminder?: ReminderStage;
  returnedAt?: string;
  waivedBy?: string;
  waivedReason?: string;
  waivedAt?: string;
}

/** Own hospital — the debtor on every row (`debtor_hospital_id`). */
export const OUR_HOSPITAL = 'รพ.สมุทรปราการ';

/**
 * Rows in the order they need attention: overdue first, then reminded, then open (soonest due
 * first), then the settled states. The state tiles filter this order, they never re-sort it.
 */
export const RETURN_OBLIGATIONS: ReturnObligation[] = [
  {
    id: 'RO-2026-000072', requestId: 'BR-2026-000091', leg: 'รอบ 1 · รพ.บางพลี', creditor: 'รพ.บางพลี',
    drug: 'CefTRIAXone 1 g inj', ved: 'E', qty: 20, qtyReturned: 0, unit: 'VIAL', mode: 'IN_KIND',
    dueDate: '12 ต.ค. 69', daysLeft: -2, state: 'OVERDUE', reminder: 'DAILY',
  },
  {
    id: 'RO-2026-000069', requestId: 'BR-2026-000081', leg: 'รอบ 1 · รพ.บางบ่อ', creditor: 'รพ.บางบ่อ',
    drug: 'CefTRIAXone 1 g inj', ved: 'E', qty: 18, qtyReturned: 0, unit: 'VIAL', mode: 'IN_KIND',
    dueDate: '20 ต.ค. 69', daysLeft: 6, state: 'REMINDED', reminder: 'DUE_7',
  },
  {
    id: 'RO-2026-000075', requestId: 'BR-2026-000117', leg: 'รอบ 1 · รพ.บางพลี', creditor: 'รพ.บางพลี',
    drug: 'NORepinephrine 4 mg/4 mL', ved: 'V', qty: 20, qtyReturned: 8, unit: 'AMP', mode: 'IN_KIND',
    dueDate: '10 พ.ย. 69', daysLeft: 27, state: 'OPEN',
  },
  {
    id: 'RO-2026-000076', requestId: 'BR-2026-000117', leg: 'รอบ 1 · รพ.พระสมุทรเจดีย์ฯ', creditor: 'รพ.พระสมุทรเจดีย์ฯ',
    drug: 'NORepinephrine 4 mg/4 mL', ved: 'V', qty: 10, qtyReturned: 0, unit: 'AMP', mode: 'IN_KIND',
    dueDate: '10 พ.ย. 69', daysLeft: 27, state: 'OPEN',
  },
  {
    id: 'RO-2026-000077', requestId: 'BR-2026-000120', leg: 'รอบเดียว · รพ.บางพลี', creditor: 'รพ.บางพลี',
    drug: 'PRC group O', ved: 'V', qty: 4, qtyReturned: 0, unit: 'UNIT', mode: 'BLOOD_REPLACEMENT',
    dueDate: '11 พ.ย. 69', daysLeft: 28, state: 'OPEN',
  },
  {
    /* Matches audit fixture AUD-0005817 (entityId RO-2026-000071): the historical waive UI-18 already shows. */
    id: 'RO-2026-000071', requestId: 'BR-2026-000068', leg: 'รอบ 2 · รพ.บางพลี', creditor: 'รพ.บางพลี',
    drug: 'CefTRIAXone 1 g inj', ved: 'E', qty: 24, qtyReturned: 0, unit: 'VIAL', mode: 'IN_KIND',
    dueDate: '26 ก.ย. 69', daysLeft: -18, state: 'WAIVED',
    waivedBy: 'ภญ.อรอุมา พรหมมา', waivedAt: '12 ต.ค. 69 11:02',
    waivedReason: 'คู่กรณีเป็น รพ.ในเครือข่ายเดียวกัน และยืนยันคืนเป็นล็อตถัดไป',
  },
  {
    id: 'RO-2026-000058', requestId: 'BR-2026-000087', leg: 'รอบเดียว · รพ.บางพลี', creditor: 'รพ.บางพลี',
    drug: 'ADRENaline 1 mg/mL inj', ved: 'V', qty: 27, qtyReturned: 27, unit: 'AMP', mode: 'IN_KIND',
    dueDate: '20 ก.ย. 69', daysLeft: -24, state: 'RETURNED', returnedAt: '15 ก.ย. 69',
  },
];

export const OBLIGATION_STATE_META: Record<ObligationState, { label: string; tone: ObligationTone; icon: IconName }> = {
  OPEN: { label: 'ค้างคืน', tone: 'amber', icon: 'hourglass' },
  REMINDED: { label: 'แจ้งเตือนแล้ว', tone: 'amber', icon: 'bell' },
  RETURNED: { label: 'คืนครบแล้ว', tone: 'green', icon: 'checkc' },
  OVERDUE: { label: 'เกินกำหนด', tone: 'red', icon: 'tri' },
  WAIVED: { label: 'ยกเว้นแล้ว', tone: 'orange', icon: 'minusc' },
};

/** Tile order follows SM-7 (`OPEN → REMINDED → RETURNED | OVERDUE → WAIVED`). */
export const OBLIGATION_STATES: ObligationState[] = ['OPEN', 'REMINDED', 'RETURNED', 'OVERDUE', 'WAIVED'];

export const OBLIGATION_CODES: Record<ObligationState, string> = {
  OPEN: 'OPEN',
  REMINDED: 'REMINDED',
  RETURNED: 'RETURNED',
  OVERDUE: 'OVERDUE',
  WAIVED: 'WAIVED',
};

/**
 * Server-side block on the waive endpoint, mirrored in the UI.
 *
 * SM-7 draws only two transitions into WAIVED — `OPEN → WAIVED` and `OVERDUE → WAIVED`. A REMINDED
 * obligation (already past due−7 but not yet due) is therefore not waivable from this screen, and
 * RETURNED / WAIVED are settled states. The server stays the authority (SEC-002).
 */
export const WAIVABLE_STATES: ObligationState[] = ['OPEN', 'OVERDUE'];

export const MODE_META: Record<ReturnMode, { label: string; tone: ObligationTone }> = {
  IN_KIND: { label: 'คืนเป็นยาตัวเดิม', tone: 'blue' },
  BLOOD_REPLACEMENT: { label: 'ทดแทนผ่านธนาคารเลือด', tone: 'teal' },
};

const REMINDER_LABEL: Record<ReminderStage, string> = {
  DUE_7: 'แจ้งเตือน due−7 แล้ว',
  DUE_1: 'แจ้งเตือน due−1 แล้ว',
  DAILY: 'แจ้งเตือนรายวัน (เกินกำหนด)',
};

export const reminderLabel = (stage: ReminderStage) => REMINDER_LABEL[stage];

/** FR-XC-003 outward wording for the due cell: `อีก N วัน` / `เกินกำหนด N วัน` / `ครบกำหนดวันนี้`. */
export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'ครบกำหนดวันนี้';
  return daysLeft > 0 ? `อีก ${daysLeft} วัน` : `เกินกำหนด ${-daysLeft} วัน`;
}

/** Outstanding base units still to return (F-30: the obligation closes only at 0). */
export const outstandingOf = (o: ReturnObligation) => o.qty - o.qtyReturned;

/** Counts per state for the filter tiles. */
export function obligationCounts(rows: ReturnObligation[]): Record<ObligationState, number> {
  return OBLIGATION_STATES.reduce(
    (acc, s) => ({ ...acc, [s]: rows.filter((r) => r.state === s).length }),
    {} as Record<ObligationState, number>,
  );
}

/* ── live data (API-XC-003) ───────────────────────────────────────────────── */

const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const shortThai = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`;
};

/** Maps an API obligation (we are the debtor) onto the row the Hospital Admin tab renders. */
export function obligationFromApi(o: import('../../../services/returnsApi').ApiReturnObligation, today = new Date()): ReturnObligation {
  const daysLeft = Math.round((new Date(`${o.dueDate.slice(0, 10)}T00:00:00`).getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  // The server only flips OPEN -> OVERDUE in a job; a passed due date is shown as overdue meanwhile.
  const state: ObligationState = o.status === 'OPEN' && o.pastDue ? 'OVERDUE' : o.status;
  return {
    id: `RO-${o.id.slice(0, 8).toUpperCase()}`,
    requestId: o.requestNo,
    leg: `รอบ ${o.roundNo ?? 1} · ${o.creditor.name}`,
    creditor: o.creditor.name,
    drug: o.drug.name ?? '–',
    ved: o.drug.ved ?? 'D',
    qty: o.qty,
    qtyReturned: o.qtyReturned,
    unit: o.drug.baseUnit ?? '',
    mode: o.returnMode,
    dueDate: shortThai(o.dueDate),
    daysLeft,
    state,
    ...(o.returnedAt ? { returnedAt: shortThai(o.returnedAt) } : {}),
    ...(o.waived ? { waivedBy: o.waived.byName ?? 'ผู้ดูแล รพ.', waivedReason: o.waived.reason ?? '–', waivedAt: o.waived.at ? `${shortThai(o.waived.at)} ${new Date(o.waived.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : '–' } : {}),
    uuid: o.id,
  };
}
