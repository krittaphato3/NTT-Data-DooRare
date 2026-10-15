/**
 * UI-02 — แจ้งเตือนสต็อกและการพยากรณ์ / Stock alert queue mock data.
 *
 * Values mirror the spec + mockup (spec §7.A F1a, §15.1 UI-02):
 *  - the queue is ordered V → E → D, then ABC value, then days left (BR-F1a-011, FR-F1a-009).
 *  - 5 LOW_STOCK + 2 OVERSTOCK + 1 LOW_CONFIDENCE = the 8 open alerts (FL-02, SM-8).
 *  - the 14-drug list is the full monitored set, including items with no alert.
 * Numeric fields reuse the mockup's seed (adr, alp, ten, fu120, cef, glv, omp, vk1, nor, amp, fu025, prc, aml, ate).
 */

import type { IconName } from '../../../components/common/icons';

export type Severity = 'critical' | 'urgent' | 'normal';
export type AlertType = 'LOW_STOCK' | 'OVERSTOCK' | 'LOW_CONFIDENCE' | 'DATA_STALE';
export type AlertStatus = 'open' | 'acknowledged' | 'linked' | 'snoozed';
export type Ved = 'V' | 'E' | 'D';
export type Abc = 'A' | 'B' | 'C' | 'D' | 'E' | 'V' | '–';
export type ForecastMethod = 'MA_ES' | 'QUANTILE_LGBM' | 'MIN_MAX' | 'COLD_START';
export type NoteTone = 'crit' | 'warn' | 'ok' | 'info';
export type SortMode = 'default' | 'days' | 'abc';

/* ------------------------------------------------------------------ labels */

export interface LabelMeta {
  labelTh: string;
  /** Tooltip / a11y English only — never rendered as an on-screen gloss. */
  labelEn: string;
  cls: string;
  /** Leading glyph shown inside the badge (design). */
  icon?: IconName;
}

/** Severity badges (BR-F1b-008 / F-11): critical red · urgent orange · normal gray. */
export const SEVERITY_META: Record<Severity, LabelMeta> = {
  critical: { labelTh: 'เร่งด่วนมาก', labelEn: 'Critical', cls: 'ug-critical', icon: 'tri' },
  urgent: { labelTh: 'เร่งด่วน', labelEn: 'Urgent', cls: 'ug-urgent', icon: 'alertc' },
  normal: { labelTh: 'ปกติ', labelEn: 'Normal', cls: 'ug-normal', icon: 'minusc' },
};

/**
 * Alert status badges (SM-8): open light-yellow · linked light-green.
 * Acknowledged is light-blue per the UI-02 design image (an earlier spec said green).
 */
export const ALERT_STATUS_META: Record<AlertStatus, LabelMeta> = {
  open: { labelTh: 'เปิด', labelEn: 'Open', cls: 't-amber' },
  acknowledged: { labelTh: 'รับทราบแล้ว', labelEn: 'Acknowledged', cls: 't-blue' },
  linked: { labelTh: 'ผูกคำขอแล้ว', labelEn: 'Linked to request', cls: 't-green' },
  snoozed: { labelTh: 'เลื่อนเตือน', labelEn: 'Snoozed', cls: 't-grey' },
};

export interface AlertTypeMeta {
  th: string;
  en: string;
  cls: string;
  icon: IconName;
}

/** Alert types (`alert_type` enum in schema.sql: LOW_STOCK, OVERSTOCK, DATA_STALE, LOW_CONFIDENCE). */
export const ALERT_TYPE_META: Record<AlertType, AlertTypeMeta> = {
  LOW_STOCK: { th: 'สต็อกต่ำ', en: 'Low stock', cls: 't-red', icon: 'tri' },
  OVERSTOCK: { th: 'สต็อกเกิน', en: 'Overstock', cls: 't-blue', icon: 'pkg' },
  LOW_CONFIDENCE: { th: 'พยากรณ์ไม่มั่นใจ', en: 'Low-confidence forecast', cls: 't-red', icon: 'alertc' },
  DATA_STALE: { th: 'ข้อมูลเก่า', en: 'Stale data', cls: 't-grey', icon: 'clock' },
};

/** Status text under the Predict/Total-Target bar. */
export const NOTE_TONE_COLOR: Record<NoteTone, string> = {
  crit: '#DC2626',
  warn: '#D97706',
  ok: '#166534',
  info: '#1D4ED8',
};

/* --------------------------------------------------------------- summary */

export type SummaryTone = 'crit' | 'warn' | 'blue' | 'grey' | 'teal';

export interface SummaryCard {
  key: AlertType | 'NEAR_EXPIRY';
  /** Bold Thai heading. */
  labelTh: string;
  /** Small uppercase muted code next to the heading; omitted for near-expiry. */
  code?: string;
  count: number;
  /** Thai-only sub-label under the count. */
  subTh: string;
  tone: SummaryTone;
  /** Near-expiry is a cross-reference into UI-07, not an alert of this queue. */
  href?: string;
}

/**
 * Left accent border per card (design image) — replaces the old icon tile.
 * crit red · overstock/data-stale gray-blue · low-confidence orange · near-expiry teal.
 */
export const SUMMARY_ACCENT: Record<SummaryTone, string> = {
  crit: '#DC2626',
  blue: '#64748B',
  warn: '#EA580C',
  grey: '#64748B',
  teal: '#0D9488',
};

export const ALERT_SUMMARY: SummaryCard[] = [
  {
    key: 'LOW_STOCK', labelTh: 'สต็อกต่ำ', code: 'LOW_STOCK', count: 5,
    subTh: 'เร่งด่วนมาก 1 · เร่งด่วน 3 · ปกติ 1', tone: 'crit',
  },
  {
    key: 'OVERSTOCK', labelTh: 'สต็อกเกิน', code: 'OVERSTOCK', count: 2,
    subTh: 'เกิน 2 เท่าของเป้า · ข้อมูลเท่านั้น', tone: 'blue',
  },
  {
    key: 'LOW_CONFIDENCE', labelTh: 'พยากรณ์ไม่มั่นใจ', code: 'LOW_CONFIDENCE', count: 1,
    subTh: 'ประวัติ < 90 วัน (COLD_START)', tone: 'warn',
  },
  {
    key: 'DATA_STALE', labelTh: 'ข้อมูลเก่า', code: 'DATA_STALE', count: 0,
    subTh: 'นำเข้าล่าสุด 06:10 น. · เตือนเมื่อเกิน 7 วัน', tone: 'grey',
  },
  {
    key: 'NEAR_EXPIRY', labelTh: 'ใกล้หมดอายุ\u00A0≤\u00A0180\u00A0วัน', count: 3,
    subTh: 'ลิสต์ตรวจสอบ · ไปหน้า UI-07', tone: 'teal', href: '#UI-07',
  },
];

/** Header context line (design image): pharmacy, forecast round, cadence, latest eval, HIS sync. */
export const PHARMACY_CONTEXT = {
  subtitle:
    'รพ.สมุทรปราการ · พยากรณ์รอบ 01:00 น. · ประเมินแจ้งเตือนทุก 15 นาที (ล่าสุด 19:00 น.) · สต็อกจาก HIS นำเข้า 06:10 น.',
};

/* ------------------------------------------------------- tabs & filters */

export interface AlertTab {
  key: 'queue' | 'all';
  /** Tab label is Thai-only (design); the count renders in a pill from live row counts. */
  labelTh: string;
}

export const ALERT_TABS: AlertTab[] = [
  { key: 'queue', labelTh: 'คิวแจ้งเตือน' },
  { key: 'all', labelTh: 'รายการยาทั้งหมด' },
];

export const SEVERITY_FILTERS: { key: 'all' | Severity; labelTh: string; labelEn: string }[] = [
  { key: 'all', labelTh: 'ทั้งหมด', labelEn: 'All' },
  { key: 'critical', labelTh: 'เร่งด่วนมาก', labelEn: 'Critical' },
  { key: 'urgent', labelTh: 'เร่งด่วน', labelEn: 'Urgent' },
  { key: 'normal', labelTh: 'ปกติ', labelEn: 'Normal' },
];

export const VED_FILTERS: Ved[] = ['V', 'E', 'D'];

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'ข้อกำหนด: V ก่อน → มูลค่า ABC → วันคงเหลือ' },
  { value: 'days', label: 'วันคงเหลือน้อยก่อน' },
  { value: 'abc', label: 'มูลค่า ABC สูงก่อน' },
];

/* ----------------------------------------------------------------- rows */

export interface AlertRef {
  alertId: string;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  /** Mockup-style short stamp: "14:15" or "12 ต.ค.". */
  time: string;
  /** Linked borrow request number (BR-…), shown under the status badge. */
  brNo?: string;
}

export interface StockAlertRow {
  id: string;
  drug: string;
  /** HIS local code (TMT is the canonical code; this is the hospital's own). */
  code: string;
  ved: Ved;
  abc: Abc;
  onHand: number;
  unit: string;
  /** Days of cover = on_hand ÷ daily use; 1–2 decimals. */
  daysLeft: number;
  /** Daily usage rate `u` (F-08). */
  dailyUse: number;
  /** Forecast P50 (Predict); null for Min-Max and blood items. */
  predict: number | null;
  /** Total Target: P95 for V, P90 for E (F-06); null for Min-Max and blood. */
  totalTarget: number | null;
  /** Min-Max items carry min/max instead of Predict/TT (BR-F1a-005, BR-F1a-020). */
  min?: number;
  max?: number;
  /** Status line under the target bar. */
  note: string;
  noteTone: NoteTone;
  method: ForecastMethod | null;
  /** Badge next to the method: 'ปกติ' or 'LOW_CONFIDENCE'. */
  methodNote: string;
  lowConfidence: boolean;
  alert: AlertRef | null;
}

const VED_RANK: Record<Ved, number> = { V: 0, E: 1, D: 2 };
const ABC_RANK: Record<Abc, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, V: 5, '–': 6 };

/**
 * Queue order: V first → ABC value → fewest days remaining (BR-F1a-011).
 * `days` sorts purely by days-left; `abc` keeps the V-first grouping but sorts by ABC inside it.
 */
export function sortAlertRows(rows: StockAlertRow[], mode: SortMode): StockAlertRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (mode === 'days') return a.daysLeft - b.daysLeft || VED_RANK[a.ved] - VED_RANK[b.ved];
    if (mode === 'abc') return VED_RANK[a.ved] - VED_RANK[b.ved] || ABC_RANK[a.abc] - ABC_RANK[b.abc] || a.daysLeft - b.daysLeft;
    return (
      VED_RANK[a.ved] - VED_RANK[b.ved] ||
      ABC_RANK[a.abc] - ABC_RANK[b.abc] ||
      a.daysLeft - b.daysLeft
    );
  });
  return copy;
}

export const ALERT_ROWS: StockAlertRow[] = [
  {
    id: 'alp', drug: 'ALprostadil 500 mcg/mL inj (CASE)', code: '1002160', ved: 'V', abc: 'A',
    onHand: 3, unit: 'AMP', daysLeft: 6, dailyUse: 0.5, predict: 4, totalTarget: 7,
    note: 'สต็อก < Predict → จัดหา/ยืม', noteTone: 'crit',
    method: 'QUANTILE_LGBM', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-1002160', type: 'LOW_STOCK', severity: 'urgent', status: 'open', time: '14:15' },
  },
  {
    id: 'ten', drug: 'Tenecteplase 50 mg inj', code: '1002875', ved: 'V', abc: 'A',
    onHand: 4, unit: 'VIAL', daysLeft: 20, dailyUse: 0.2, predict: 2, totalTarget: 4,
    note: 'ไม่ต้องดำเนินการ', noteTone: 'ok',
    method: 'COLD_START', methodNote: 'LOW_CONFIDENCE', lowConfidence: true,
    alert: { alertId: 'AL-2026-1002875', type: 'LOW_CONFIDENCE', severity: 'normal', status: 'acknowledged', time: '12 ต.ค.' },
  },
  {
    id: 'adr', drug: 'ADRENaline 1 mg/mL inj (HAD)', code: '1000147', ved: 'V', abc: 'B',
    onHand: 15, unit: 'AMP', daysLeft: 1.5, dailyUse: 10, predict: 70, totalTarget: 96,
    note: 'สต็อก < Predict → จัดหา/ยืม', noteTone: 'crit',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-1000147', type: 'LOW_STOCK', severity: 'critical', status: 'linked', time: '19:02', brNo: 'BR-2026-000125' },
  },
  {
    id: 'fu120', drug: '5-FU 120 SYRINGE', code: '1000017', ved: 'E', abc: 'A',
    onHand: 10, unit: 'SYRINGE', daysLeft: 1.25, dailyUse: 8, predict: 56, totalTarget: 66,
    note: 'สต็อก < Predict → จัดหา/ยืม', noteTone: 'crit',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-1000017', type: 'LOW_STOCK', severity: 'urgent', status: 'linked', time: '15:45', brNo: 'BR-2026-000124' },
  },
  {
    id: 'cef', drug: 'CefTRIAXone 1 g inj', code: '1000402', ved: 'E', abc: 'B',
    onHand: 8, unit: 'VIAL', daysLeft: 0.89, dailyUse: 9, predict: 63, totalTarget: 76,
    note: 'สต็อก < Predict → จัดหา/ยืม', noteTone: 'crit',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-1000402', type: 'LOW_STOCK', severity: 'urgent', status: 'linked', time: '09:15', brNo: 'BR-2026-000109' },
  },
  {
    id: 'glv', drug: 'ถุงมือไนไตรล์ M 100 ชิ้น/กล่อง', code: 'SUP-0004', ved: 'E', abc: 'B',
    onHand: 24, unit: 'BOX', daysLeft: 8, dailyUse: 3, predict: 21, totalTarget: 27,
    note: 'สต็อก ≥ Predict < เป้า → เตรียมสั่งล่วงหน้า', noteTone: 'warn',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-SUP0004', type: 'LOW_STOCK', severity: 'normal', status: 'open', time: '11:30' },
  },
  {
    id: 'omp', drug: 'Omeprazole 40 mg inj', code: '1000671', ved: 'E', abc: 'C',
    onHand: 150, unit: 'VIAL', daysLeft: 100, dailyUse: 1.5, predict: 11, totalTarget: 14,
    note: 'สต็อก > 2× เป้า → ข้อมูลเท่านั้น', noteTone: 'info',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-1000671', type: 'OVERSTOCK', severity: 'normal', status: 'open', time: '10 ต.ค.' },
  },
  {
    id: 'vk1', drug: 'Phytomenadione (Vit K1) 10 mg/mL inj', code: '1000731', ved: 'E', abc: 'C',
    onHand: 85, unit: 'AMP', daysLeft: 283.33, dailyUse: 0.3, predict: 2, totalTarget: 4,
    note: 'สต็อก > 2× เป้า → ข้อมูลเท่านั้น', noteTone: 'info',
    method: 'QUANTILE_LGBM', methodNote: 'ปกติ', lowConfidence: false,
    alert: { alertId: 'AL-2026-1000731', type: 'OVERSTOCK', severity: 'normal', status: 'open', time: '10 ต.ค.' },
  },
  /* -------- monitored items with no alert (shown in the "all drugs" tab) -------- */
  {
    id: 'nor', drug: 'NORepinephrine 4 mg/4 mL inj', code: '1000588', ved: 'V', abc: 'B',
    onHand: 48, unit: 'AMP', daysLeft: 8, dailyUse: 6, predict: 42, totalTarget: 55,
    note: 'สต็อก ≥ Predict < เป้า → เตรียมสั่งล่วงหน้า', noteTone: 'warn',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false, alert: null,
  },
  {
    id: 'prc', drug: 'PRC group O (packed red cells)', code: 'BLD-PRC-O', ved: 'V', abc: '–',
    onHand: 12, unit: 'UNIT', daysLeft: 8, dailyUse: 1.5, predict: null, totalTarget: null,
    note: 'เลือด: ไม่อยู่ใน F1/F2 (ASM-47) → อ้างอิงเท่านั้น', noteTone: 'info',
    method: null, methodNote: '–', lowConfidence: false, alert: null,
  },
  {
    id: 'amp', drug: 'AMPIcillin 1 g inj', code: '1000245', ved: 'E', abc: 'B',
    onHand: 190, unit: 'VIAL', daysLeft: 15.8, dailyUse: 12, predict: 84, totalTarget: 102,
    note: 'สต็อก ≥ เป้า → ไม่ต้องดำเนินการ', noteTone: 'ok',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false, alert: null,
  },
  {
    id: 'fu025', drug: '5-FU 0.25 DOSE', code: '1000016', ved: 'E', abc: 'C',
    onHand: 12, unit: 'DOSE', daysLeft: 12, dailyUse: 1, predict: 7, totalTarget: 9,
    note: 'สต็อก ≥ เป้า → ไม่ต้องดำเนินการ', noteTone: 'ok',
    method: 'MA_ES', methodNote: 'ปกติ', lowConfidence: false, alert: null,
  },
  {
    id: 'aml', drug: 'AMLOdipine 5 mg tab', code: '1000223', ved: 'D', abc: 'C',
    onHand: 2400, unit: 'เม็ด', daysLeft: 16, dailyUse: 150, predict: null, totalTarget: null, min: 1050, max: 3150,
    note: 'อยู่ในช่วง Min-Max → แจ้งเตือนอย่างเดียว', noteTone: 'info',
    method: 'MIN_MAX', methodNote: 'ปกติ', lowConfidence: false, alert: null,
  },
  {
    id: 'ate', drug: 'ATEnolol 50 mg tab', code: '1000313', ved: 'D', abc: 'C',
    onHand: 6800, unit: 'เม็ด', daysLeft: 20.6, dailyUse: 330, predict: null, totalTarget: null, min: 2100, max: 6300,
    note: 'สต็อก > ค่า Max → แจ้งเตือนอย่างเดียว', noteTone: 'info',
    method: 'MIN_MAX', methodNote: 'ปกติ', lowConfidence: false, alert: null,
  },
];

/** Rows carrying an open alert — the "คิวแจ้งเตือน" tab (8 rows). */
export const QUEUE_ROWS: StockAlertRow[] = ALERT_ROWS.filter((r) => r.alert !== null);

/* -------------------------------------------------------------- history */

export interface HistoryEntry {
  time: string;
  actor: string;
  text: string;
}

/** Audit trail preview for the header "ประวัติ" dialog (audit_log style). */
export const ALERT_HISTORY: HistoryEntry[] = [
  { time: '19:02', actor: 'ระบบ', text: 'ยก ADRENaline 1 mg/mL inj เป็น เร่งด่วนมาก · ผูกคำขอ BR-2026-000125' },
  { time: '17:45', actor: 'เภสัชกร', text: 'รับทราบ Tenecteplase 50 mg inj (LOW_CONFIDENCE · COLD_START)' },
  { time: '15:45', actor: 'เภสัชกร', text: 'ผูก 5-FU 120 SYRINGE กับคำขอ BR-2026-000124' },
  { time: '14:15', actor: 'ระบบ', text: 'เปิด LOW_STOCK ALprostadil 500 mcg/mL inj (เหลือ 6 วัน)' },
  { time: '11:30', actor: 'ระบบ', text: 'เปิด LOW_STOCK ถุงมือไนไตรล์ M (สต็อก ≥ Predict < เป้า)' },
  { time: '10 ต.ค.', actor: 'ระบบ', text: 'เปิด OVERSTOCK Omeprazole 40 mg inj · Phytomenadione (Vit K1)' },
];
