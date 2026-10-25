/** Mock data + SM-1 status metadata for UI-05 Borrow requests (our hospital = borrower).
 * Rows mirror the design capture "UI-05 Borrow requests – BR-2026-000124 detail". Replace with the API later. */
import type { IconName } from '../../../components/common/icons';

export type BorrowStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_FULFILLED'
  | 'ESCALATED'
  | 'FULFILLED'
  | 'CLOSED_UNFULFILLED'
  | 'CANCELLED';
export type StatusGroup = 'pending' | 'progress' | 'escalated' | 'fulfilled' | 'closed';
/** Filter tiles of the request list. Not the same as `StatusGroup`, which colours badges and the drawer. */
export type TileGroup = 'pending' | 'progress' | 'accepted' | 'fulfilled' | 'closed';
export type Urgency = 'CRITICAL' | 'URGENT' | 'NORMAL';
export type BorrowContext = 'STOCK_ALERT' | 'EMERGENCY' | 'MANUAL';
export type ReturnState = 'PENDING' | 'OVERDUE' | 'RETURNED';
export type LegState = 'WAITING' | 'NOT_SENT' | 'ACCEPTED' | 'DECLINED' | 'TIMED_OUT';
export type Tone = 'amber' | 'green' | 'blue' | 'red' | 'grey';
export type RowAction = 'approve' | 'detail' | 'addLender' | 'recordReturn';

export interface BorrowLeg {
  hospital: string;
  /** Set for a leg the API has sent (used to skip it). */
  legId?: string;
  /** Lender ranking score from the system order; absent for a lender added outside the ladder. */
  si?: number;
  state: LegState;
  /** Raw backend leg status (e.g. SENT, ACCEPTED, LOADED, IN_TRANSIT, RECEIVED, CANCELLED). */
  rawStatus?: string;
  detail: string;
}

export interface BorrowRequest {
  id: string;
  /** One line above the lender list: how many lenders the plan may ask in total. */
  ladderNote?: string;
  /** Set when the row came from the API (request uuid + row version). */
  uuid?: string;
  version?: number;
  context: BorrowContext;
  createdAt: string;
  /** Age in days on 14 ต.ค. — drives the period filter. */
  daysAgo: number;
  ved: 'V' | 'E' | 'D';
  drug: string;
  qty: number;
  unit: string;
  /** Lender column lines. */
  lender: string[];
  urgency: Urgency;
  status: BorrowStatus;
  returnState?: ReturnState;
  /** Seconds left on the current leg's response window (live countdown). */
  countdownSec?: number;
  /** Stop rule F-20: confirmed so far vs target. */
  stop?: { got: number; target: number; formula?: string; remaining: string };
  /** Progress cell text. */
  note: string;
  action: RowAction;
  banner: { title: string; text: string };
  contextLabel: string;
  firstRound: string;
  sendMode: string;
  createdBy: string;
  approvedBy?: string;
  legs: BorrowLeg[];
  agentNote?: { code: string; text: string; model?: string | null; confidence?: string | null; status?: 'OK' | 'FALLBACK' | 'SKIPPED' };
  /** F3 kit request: it has no drug item, so the ranked-lender steps (add a lender by hand) do not apply. */
  isKit?: boolean;
}

const NATTAWUT = 'ภก.ณัฐวุฒิ ศรีสุข';

export const BORROW_REQUESTS: BorrowRequest[] = [
  {
    id: 'BR-2026-000125', context: 'STOCK_ALERT', createdAt: '13 ต.ค. 19:04', daysAgo: 1, ved: 'V', drug: 'ADRENaline 1 mg/mL inj', qty: 27, unit: 'AMP',
    lender: ['ลำดับ 4 แห่ง · รอบแรก', 'รพ.บางพลี'], urgency: 'CRITICAL', status: 'PENDING_APPROVAL',
    note: 'Agent ร่างข้อความแล้ว · รออนุมัติ', action: 'approve',
    banner: { title: 'รอเภสัชกรอนุมัติก่อนส่ง', text: 'Agent ร่างข้อความถึงผู้ให้ยืมแล้ว · เร่งด่วนมาก ส่งพร้อมกันได้ ≤ 3 แห่ง' },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '27 AMP', sendMode: 'ส่งพร้อมกัน ≤ 3 แห่ง',
    createdBy: 'ระบบ (แจ้งเตือนสต็อก) · 13 ต.ค. 19:04',
    legs: [
      { hospital: 'รพ.บางพลี', si: 0.8721, state: 'NOT_SENT', detail: 'ลำดับ 1 · รอบแรก' },
      { hospital: 'รพ.พระสมุทรเจดีย์ฯ', si: 0.731, state: 'NOT_SENT', detail: 'ลำดับ 2 · รอบแรก' },
      { hospital: 'รพ.บางเสาธง', si: 0.6542, state: 'NOT_SENT', detail: 'ลำดับ 3 · รอบแรก' },
      { hospital: 'รพ.บางบ่อ', si: 0.512, state: 'NOT_SENT', detail: 'ลำดับ 4 · ส่งต่อถ้ารอบแรกได้ไม่ครบ' },
    ],
    agentNote: { code: 'F1_T3', text: 'ร่างข้อความขอยืมถึง 3 แห่งแรกตามลำดับของระบบ — รอเภสัชกรตรวจและอนุมัติ' },
  },
  {
    id: 'BR-2026-000124', context: 'STOCK_ALERT', createdAt: '13 ต.ค. 15:58', daysAgo: 1, ved: 'E', drug: '5-FU 120 SYRINGE', qty: 21, unit: 'SYRINGE',
    lender: ['รพ.บางพลี · รอบ 1'], urgency: 'URGENT', status: 'IN_PROGRESS', countdownSec: 2 * 3600 + 50 * 60 + 30,
    stop: { got: 0, target: 14, formula: 'E: หยุดเมื่อได้ ≥ u×L − สต็อก − กำลังมา = 8×3 − 10 − 0 = 14', remaining: 'คงต้องการ (borrow_remaining) 21 SYRINGE · ถ้าได้บางส่วน ระบบขอส่วนที่เหลือจากลำดับถัดไป' },
    note: 'เตือน 50% แล้ว 19:05', action: 'detail',
    banner: { title: 'รอ รพ.บางพลี ตอบ (รอบ 1)', text: 'หมดเวลา 22:05 น. → ระบบส่งต่อลำดับถัดไปอัตโนมัติ · เตือน 50% แล้ว 19:05' },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '21 SYRINGE · R = 30.65', sendMode: 'ส่งทีละแห่ง',
    createdBy: `${NATTAWUT} · 13 ต.ค. 15:58`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [
      { hospital: 'รพ.บางพลี', si: 0.8445, state: 'WAITING', detail: 'รอบ 1 · ขอ 21 · ส่ง 16:05 · เตือน 19:05 ✓ · หมดเวลา 22:05' },
      { hospital: 'รพ.พระสมุทรเจดีย์ฯ', si: 0.7245, state: 'NOT_SENT', detail: 'ลำดับ 2 · ส่งอัตโนมัติถ้า รพ.บางพลี ปฏิเสธหรือหมดเวลา' },
      { hospital: 'รพ.บางเสาธง', si: 0.6083, state: 'NOT_SENT', detail: 'ลำดับ 3' },
    ],
    agentNote: { code: 'F1_T5', text: 'ถ้า รพ.บางพลี ไม่ตอบ ลำดับถัดไปคือ รพ.พระสมุทรเจดีย์ฯ — ตรงกับลำดับของระบบ ✓ (Agent เสนอได้แต่ต้องตรงลำดับ)' },
  },
  {
    id: 'BR-2026-000109', context: 'STOCK_ALERT', createdAt: '13 ต.ค. 09:24', daysAgo: 1, ved: 'E', drug: 'CefTRIAXone 1 g inj', qty: 24, unit: 'VIAL',
    lender: ['ลำดับหมดแล้ว'], urgency: 'URGENT', status: 'ESCALATED',
    stop: { got: 10, target: 15, remaining: 'คงต้องการ (borrow_remaining) 14 VIAL · ผู้ดูแลเพิ่มผู้ให้ยืมนอกลำดับได้' },
    note: 'ยังขาด 14 · แจ้งผู้ดูแลแล้ว', action: 'addLender',
    banner: { title: 'ลำดับผู้ให้ยืมหมดแล้ว · ส่งต่อผู้ดูแล', text: 'ได้ 10 VIAL จาก รพ.พระสมุทรเจดีย์ฯ (TR-2026-000336 กำลังเดินทาง) · ยังขาด 14 VIAL · แจ้งผู้ดูแลแล้ว 18:20' },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '24 VIAL', sendMode: 'ส่งทีละแห่ง',
    createdBy: `${NATTAWUT} · 13 ต.ค. 09:24`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [
      { hospital: 'รพ.บางพลี', si: 0.8445, state: 'DECLINED', detail: 'รอบ 1 · ขอ 24 · ปฏิเสธ 11:02 · สต็อกไม่พอ' },
      { hospital: 'รพ.พระสมุทรเจดีย์ฯ', si: 0.7245, state: 'ACCEPTED', detail: 'รอบ 2 · ขอ 24 · ตอบรับบางส่วน 10 · 16:20' },
      { hospital: 'รพ.บางเสาธง', si: 0.6083, state: 'TIMED_OUT', detail: 'รอบ 3 · ขอ 14 · หมดเวลา 18:20' },
    ],
  },
  {
    id: 'BR-2026-000120', context: 'EMERGENCY', createdAt: '12 ต.ค. 01:52', daysAgo: 2, ved: 'V', drug: 'PRC group O', qty: 4, unit: 'UNIT',
    lender: ['รพ.บางพลี'], urgency: 'CRITICAL', status: 'FULFILLED', returnState: 'PENDING',
    note: 'เหตุ INC-2026-000014 · รับ 02:40', action: 'detail',
    banner: { title: 'ได้ครบแล้ว · รับ 12 ต.ค. 02:40', text: 'ส่วนประกอบโลหิต: คืนผ่านธนาคารเลือด (BLOOD_REPLACEMENT) · TR-2026-000335' },
    contextLabel: 'EMERGENCY · เหตุ INC-2026-000014', firstRound: '4 UNIT', sendMode: 'ส่งพร้อมกัน',
    createdBy: `${NATTAWUT} · 12 ต.ค. 01:52`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [{ hospital: 'รพ.บางพลี', si: 0.8445, state: 'ACCEPTED', detail: 'ขอ 4 · ตอบรับ 4 · 01:58' }],
  },
  {
    id: 'BR-2026-000117', context: 'STOCK_ALERT', createdAt: '11 ต.ค. 08:40', daysAgo: 3, ved: 'V', drug: 'NORepinephrine 4 mg/4 mL', qty: 30, unit: 'AMP',
    lender: ['รพ.บางพลี 20 · รพ.พระสมุทรเจดีย์ฯ 10'], urgency: 'CRITICAL', status: 'FULFILLED', returnState: 'PENDING',
    note: 'ครบ 30 · รับ 11 ต.ค.', action: 'detail',
    banner: { title: 'ได้ครบแล้ว 30 AMP · รับ 11 ต.ค. 15:05', text: 'ต้องคืนเป็นยาตัวเดิมจำนวนเท่ากันภายใน 30 วันหลังรับ' },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '30 AMP', sendMode: 'ส่งพร้อมกัน 2 แห่ง',
    createdBy: `${NATTAWUT} · 11 ต.ค. 08:40`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [
      { hospital: 'รพ.บางพลี', si: 0.8445, state: 'ACCEPTED', detail: 'รอบ 1 · ขอ 30 · ตอบรับ 20 · TR-2026-000333 รับ 14:20' },
      { hospital: 'รพ.พระสมุทรเจดีย์ฯ', si: 0.7245, state: 'ACCEPTED', detail: 'รอบ 1 · ขอ 30 · ตอบรับ 10 · TR-2026-000332 รับ 15:05' },
    ],
  },
  {
    id: 'BR-2026-000112', context: 'STOCK_ALERT', createdAt: '8 ต.ค. 10:12', daysAgo: 6, ved: 'V', drug: 'ALprostadil 500 mcg/mL', qty: 2, unit: 'AMP',
    lender: ['—'], urgency: 'URGENT', status: 'CANCELLED',
    note: 'ไม่อนุมัติ: ได้จาก PO 10 ต.ค.', action: 'detail',
    banner: { title: 'ยกเลิก · ไม่อนุมัติ', text: `${NATTAWUT} ไม่อนุมัติ 8 ต.ค. · ได้ยาจากใบสั่งซื้อ (PO) 10 ต.ค.` },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '2 AMP', sendMode: 'ส่งทีละแห่ง',
    createdBy: 'ระบบ (แจ้งเตือนสต็อก) · 8 ต.ค. 10:12',
    legs: [],
  },
  {
    id: 'BR-2026-000102', context: 'STOCK_ALERT', createdAt: '2 ต.ค. 14:30', daysAgo: 12, ved: 'V', drug: 'ALprostadil 500 mcg/mL', qty: 3, unit: 'AMP',
    lender: ['ลำดับหมด 3 แห่ง'], urgency: 'URGENT', status: 'CLOSED_UNFULFILLED',
    note: 'ผู้ดูแลปิด 3 ต.ค. · ได้จากคลังเขตแทน', action: 'detail',
    banner: { title: 'ปิด · ไม่ได้ยา', text: 'ลำดับผู้ให้ยืมหมด 3 แห่ง · ผู้ดูแลปิดคำขอ 3 ต.ค. · ได้จากคลังเขตแทน' },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '3 AMP', sendMode: 'ส่งทีละแห่ง',
    createdBy: `${NATTAWUT} · 2 ต.ค. 14:30`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [
      { hospital: 'รพ.บางพลี', si: 0.8445, state: 'DECLINED', detail: 'รอบ 1 · ขอ 3 · ปฏิเสธ 15:10' },
      { hospital: 'รพ.พระสมุทรเจดีย์ฯ', si: 0.7245, state: 'TIMED_OUT', detail: 'รอบ 2 · ขอ 3 · หมดเวลา 2 ต.ค. 21:40' },
      { hospital: 'รพ.บางเสาธง', si: 0.6083, state: 'DECLINED', detail: 'รอบ 3 · ขอ 3 · ปฏิเสธ 3 ต.ค. 08:15' },
    ],
  },
  {
    id: 'BR-2026-000091', context: 'MANUAL', createdAt: '10 ก.ย. 09:00', daysAgo: 34, ved: 'E', drug: 'CefTRIAXone 1 g inj', qty: 20, unit: 'VIAL',
    lender: ['รพ.บางพลี'], urgency: 'NORMAL', status: 'FULFILLED', returnState: 'OVERDUE',
    note: 'รับ 12 ก.ย.', action: 'recordReturn',
    banner: { title: 'ได้ครบแล้ว · คืนเกินกำหนด', text: 'ต้องคืน CefTRIAXone 1 g inj 20 VIAL ภายใน 12 ต.ค. (30 วันหลังรับ) · เกินกำหนด 2 วัน' },
    contextLabel: 'MANUAL · สร้างเอง (UI-10)', firstRound: '20 VIAL', sendMode: 'ส่งทีละแห่ง',
    createdBy: `${NATTAWUT} · 10 ก.ย. 09:00`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [{ hospital: 'รพ.บางพลี', si: 0.8445, state: 'ACCEPTED', detail: 'รอบ 1 · ขอ 20 · ตอบรับ 20 · รับ 12 ก.ย.' }],
  },
  {
    id: 'BR-2026-000087', context: 'STOCK_ALERT', createdAt: '21 ส.ค. 07:50', daysAgo: 54, ved: 'V', drug: 'ADRENaline 1 mg/mL inj', qty: 27, unit: 'AMP',
    lender: ['รพ.บางพลี'], urgency: 'CRITICAL', status: 'FULFILLED', returnState: 'RETURNED',
    note: 'รับ 21 ส.ค.', action: 'detail',
    banner: { title: 'ได้ครบแล้ว · คืนครบแล้ว', text: 'รับ 21 ส.ค. · คืน ADRENaline 27 AMP ครบ 15 ก.ย.' },
    contextLabel: 'STOCK_ALERT · จากแจ้งเตือนสต็อก', firstRound: '27 AMP', sendMode: 'ส่งพร้อมกัน',
    createdBy: `${NATTAWUT} · 21 ส.ค. 07:50`, approvedBy: `${NATTAWUT} (PHARMACIST)`,
    legs: [{ hospital: 'รพ.บางพลี', si: 0.8445, state: 'ACCEPTED', detail: 'รอบ 1 · ขอ 27 · ตอบรับ 27 · 08:05' }],
  },
];

/** UI-06 tab summary (we are the lender) — that screen is not built yet. */
export const LENDER_QUEUE = { total: 6, toAnswer: 2 };

export const GROUPS: { id: StatusGroup; label: string; codes: string; tone: Tone; icon: IconName }[] = [
  { id: 'pending', label: 'รออนุมัติ', codes: 'PENDING_APPROVAL · DRAFT', tone: 'amber', icon: 'hourglass' },
  { id: 'progress', label: 'กำลังขอยืม', codes: 'APPROVED · IN_PROGRESS · PARTIALLY_FULFILLED', tone: 'blue', icon: 'send' },
  { id: 'escalated', label: 'ส่งต่อผู้ดูแล', codes: 'ESCALATED', tone: 'red', icon: 'tri' },
  { id: 'fulfilled', label: 'ได้ครบแล้ว', codes: 'FULFILLED', tone: 'green', icon: 'checkc' },
  { id: 'closed', label: 'ปิด · ยกเลิก', codes: 'CLOSED_UNFULFILLED · CANCELLED', tone: 'grey', icon: 'minusc' },
];

export const TILES: { id: TileGroup; label: string; codes: string; tone: Tone; icon: IconName }[] = [
  { id: 'pending', label: 'รออนุมัติ', codes: 'PENDING_APPROVAL · DRAFT', tone: 'amber', icon: 'hourglass' },
  { id: 'progress', label: 'กำลังขอยืม', codes: 'รอผู้ให้ยืมตอบ · ต้องเพิ่มผู้ให้ยืม', tone: 'blue', icon: 'send' },
  { id: 'accepted', label: 'ตอบรับแล้ว', codes: 'ผู้ให้ยืมตอบรับ · รอขนส่ง', tone: 'green', icon: 'checkc' },
  { id: 'fulfilled', label: 'ได้ครบแล้ว', codes: 'FULFILLED', tone: 'green', icon: 'checkc' },
  { id: 'closed', label: 'ปิด · ยกเลิก', codes: 'CLOSED_UNFULFILLED · CANCELLED', tone: 'grey', icon: 'minusc' },
];

export const STATUS_META: Record<BorrowStatus, { label: string; group: StatusGroup }> = {
  DRAFT: { label: 'ร่าง', group: 'pending' },
  PENDING_APPROVAL: { label: 'รออนุมัติ', group: 'pending' },
  APPROVED: { label: 'อนุมัติแล้ว', group: 'progress' },
  IN_PROGRESS: { label: 'กำลังขอยืม', group: 'progress' },
  PARTIALLY_FULFILLED: { label: 'ได้บางส่วน', group: 'progress' },
  ESCALATED: { label: 'ต้องเพิ่มผู้ให้ยืม', group: 'escalated' },
  FULFILLED: { label: 'ได้ครบแล้ว', group: 'fulfilled' },
  CLOSED_UNFULFILLED: { label: 'ปิด · ไม่ได้ยา', group: 'closed' },
  CANCELLED: { label: 'ยกเลิก', group: 'closed' },
};

export const URGENCY_META: Record<Urgency, { label: string; cls: string; icon: IconName }> = {
  CRITICAL: { label: 'เร่งด่วนมาก', cls: 'ug-critical', icon: 'tri' },
  URGENT: { label: 'เร่งด่วน', cls: 'ug-urgent', icon: 'alertc' },
  NORMAL: { label: 'ปกติ', cls: 'ug-normal', icon: 'minusc' },
};

export const RETURN_META: Record<ReturnState, { label: string; tone: Tone }> = {
  PENDING: { label: 'รอคืน', tone: 'amber' },
  OVERDUE: { label: 'เกินกำหนด', tone: 'red' },
  RETURNED: { label: 'คืนครบแล้ว', tone: 'green' },
};

export const LEG_META: Record<LegState, { label: string; tone: Tone }> = {
  WAITING: { label: 'รอตอบกลับ', tone: 'amber' },
  NOT_SENT: { label: 'ยังไม่ส่ง', tone: 'grey' },
  ACCEPTED: { label: 'ตอบรับ', tone: 'green' },
  DECLINED: { label: 'ปฏิเสธ', tone: 'red' },
  TIMED_OUT: { label: 'หมดเวลา', tone: 'grey' },
};

export const ACTION_LABEL: Record<RowAction, string> = {
  approve: 'ตรวจและอนุมัติ',
  detail: 'ดูรายละเอียด',
  addLender: 'เพิ่มผู้ให้ยืม',
  recordReturn: 'บันทึกการคืน',
};

/** Requests still being worked on (the tab counters leave out finished ones: fulfilled, closed, cancelled). */
export const isOpenRequest = (s: BorrowStatus) => !['FULFILLED', 'CLOSED_UNFULFILLED', 'CANCELLED'].includes(s);

/** No lender left in the ladder: the request waits for the pharmacist to add one by hand. */
export const needsLender = (r: Pick<BorrowRequest, 'status' | 'isKit'>) => r.status === 'ESCALATED' && !r.isKit;

/**
 * Tile a request is counted under. Escalated requests stay under "กำลังขอยืม" (flagged by `needsLender`);
 * a request moves to "ตอบรับแล้ว" once any lender confirmed (accepted, loaded, in transit or received).
 */
export function tileOf(r: Pick<BorrowRequest, 'status' | 'legs'>): TileGroup {
  const g = STATUS_META[r.status].group;
  if (g === 'pending' || g === 'fulfilled' || g === 'closed') return g;
  if (r.status === 'ESCALATED') return 'progress';
  return r.legs.some((l) => l.state === 'ACCEPTED') ? 'accepted' : 'progress';
}

export const groupOf = (s: BorrowStatus) => STATUS_META[s].group;
export const groupMeta = (g: StatusGroup) => GROUPS.find((x) => x.id === g)!;
