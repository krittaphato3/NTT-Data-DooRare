/**
 * Lender queue mock data (UI-06): incoming borrow requests that our hospital
 * must respond to. Ground truth: Mockups/Dashboard - Pharmacist Hospital (2).
 */

export type BRStatus = 'waiting' | 'accepted' | 'partial' | 'loaded' | 'in_transit' | 'received' | 'declined' | 'timeout';
export type BRUrgency = 'critical' | 'urgent' | 'normal';

export interface LotOption {
  lotId: string;
  /** stock_lot id when the row came from the API. */
  uuid?: string;
  expDate: string;
  daysLeft: number;
  qty: number;
  fefoEligible: boolean; // age >= 180d so we can lend it
  note?: string;
}

export interface BorrowRequest {
  id: string;
  /** borrow_leg id when the row came from the API (needed to answer it). */
  legId?: string;
  drug: string;
  ved: 'V' | 'E' | 'D';
  vedLabel: string;
  qty: number;
  unit: string;
  requester: string;
  receivedDate: string;
  urgency: BRUrgency;
  urgencyLabel: string;
  status: BRStatus;
  trigger: string; // e.g. STOCK_ALERT | MANUAL
  round: number;
  /** Seconds remaining on timer at tick=0 (undefined if not waiting) */
  deadlineSecs?: number;
  deadlineLabel?: string; // e.g. "ตอบภายใน 23:40 น."
  deadlinePct?: number;  // percent of window used
  message: string;       // requester note
  /** F3: answered through POST /emergency-legs/{id}/confirm; `lateAnswer` = timed out but the request still lacks goods. */
  lateAnswer?: boolean;
}

export interface LendableStock {
  current: number;
  maxLendable: number;
  afterLend: number;
  explanation: string;
}

/** Legs still open for us (the tab counters leave out received, declined, timed-out ones). */
export const isOpenLeg = (s: BRStatus) => ['waiting', 'accepted', 'partial', 'loaded', 'in_transit'].includes(s);

// ─── Status meta ────────────────────────────────────────────────────
export const BR_STATUS_META: Record<BRStatus, { th: string; en: string; cls: string }> = {
  waiting:    { th: 'รอตอบกลับ',   en: 'Sent',        cls: 'st-pending' },
  accepted:   { th: 'ตอบรับแล้ว',  en: 'Accepted',    cls: 'st-approved' },
  partial:    { th: 'ตอบรับบางส่วน', en: 'Partial',   cls: 'st-transit' },
  loaded:     { th: 'กำลังส่ง',    en: 'Loaded',      cls: 'st-transit' },
  in_transit: { th: 'อยู่ระหว่างส่ง', en: 'In Transit', cls: 'st-transit' },
  received:   { th: 'ผู้ยืมรับแล้ว', en: 'Received', cls: 'st-approved' },
  declined:   { th: 'ปฏิเสธ',     en: 'Declined',    cls: 'st-rejected' },
  timeout:    { th: 'หมดเวลา',    en: 'Timeout',     cls: 'st-timeout' },
};

export const BR_URGENCY_META: Record<BRUrgency, { label: string; cls: string }> = {
  critical: { label: 'เร่งด่วนมาก', cls: 'ug-critical' },
  urgent:   { label: 'เร่งด่วน',   cls: 'ug-urgent' },
  normal:   { label: 'ปกติ',       cls: 'ug-normal' },
};

// ─── Summary tiles ───────────────────────────────────────────────────
export const SM1B = {
  sent: 2,
  accepted: 0,
  loaded: 1,
};

// ─── Borrow requests ─────────────────────────────────────────────────
export const BORROW_REQUESTS: BorrowRequest[] = [
  {
    id: 'BR-2026-000131',
    drug: 'AMPicillin 1 g inj',
    ved: 'E',
    vedLabel: 'Essential',
    qty: 40,
    unit: 'VIAL',
    requester: 'รพ.บางบ่อ',
    receivedDate: '13 ต.ค. 17:40',
    urgency: 'urgent',
    urgencyLabel: 'เร่งด่วน',
    status: 'waiting',
    trigger: 'STOCK_ALERT',
    round: 1,
    deadlineSecs: 16090, // ~04:28:10
    deadlineLabel: 'ตอบภายใน 23:40 น.',
    deadlinePct: 50,
    message: 'เรียน เภสัชกร รพ.สมุทรปราการ\nรพ.บางบ่อ ขอยืม AMPicillin 1 g inj จำนวน 40 VIAL (เร่งด่วน) เนื่องจากคงเหลือใช้ได้ประมาณ 1.6 วัน\nจะคืนเป็นยาตัวเดิมจำนวนเท่ากันภายใน 30 วัน',
  },
  {
    id: 'BR-2026-000129',
    drug: 'AMLOdipine 5 mg tab',
    ved: 'D',
    vedLabel: 'Desirable',
    qty: 600,
    unit: 'เม็ด',
    requester: 'รพ.บางเสาธง',
    receivedDate: '12 ต.ค. 14:05',
    urgency: 'normal',
    urgencyLabel: 'ปกติ',
    status: 'waiting',
    trigger: 'MANUAL',
    round: 1,
    deadlineSecs: 72000,
    deadlineLabel: 'ตอบภายใน 14:05 น. พรุ่งนี้',
    deadlinePct: 20,
    message: 'เรียน เภสัชกร รพ.สมุทรปราการ\nรพ.บางเสาธง ขอยืม AMLOdipine 5 mg tab จำนวน 600 เม็ด เพื่อสำรองสต็อก กรุณาพิจารณาด้วยนะครับ',
  },
  {
    id: 'BR-2026-000126',
    drug: 'AMPicillin 1 g inj',
    ved: 'E',
    vedLabel: 'Essential',
    qty: 20,
    unit: 'VIAL',
    requester: 'รพ.พระสมุทรเจดีย์ฯ',
    receivedDate: '13 ต.ค. 14:20',
    urgency: 'urgent',
    urgencyLabel: 'เร่งด่วน',
    status: 'waiting',
    trigger: 'STOCK_ALERT',
    round: 1,
    deadlineSecs: 7200,
    deadlineLabel: 'ตอบภายใน 20:20 น.',
    deadlinePct: 70,
    message: 'เรียน เภสัชกร รพ.สมุทรปราการ\nรพ.พระสมุทรเจดีย์ฯ ขอยืม AMPicillin 1 g inj จำนวน 20 VIAL (เร่งด่วน) เนื่องจากสต็อกจะหมดในวันนี้',
  },
  {
    id: 'BR-2026-000119',
    drug: 'ถุงมือไนไตรล์ M',
    ved: 'E',
    vedLabel: 'Essential',
    qty: 10,
    unit: 'BOX',
    requester: 'รพ.บางบ่อ',
    receivedDate: '13 ต.ค. 10:50',
    urgency: 'normal',
    urgencyLabel: 'ปกติ',
    status: 'loaded',
    trigger: 'MANUAL',
    round: 1,
    message: 'เรียน เภสัชกร รพ.สมุทรปราการ\nรพ.บางบ่อ ขอยืม ถุงมือไนไตรล์ M จำนวน 10 BOX เพื่อใช้ในแผนกอายุรกรรม',
  },
  {
    id: 'BR-2026-000127',
    drug: 'ATEnolol 50 mg tab',
    ved: 'D',
    vedLabel: 'Desirable',
    qty: 200,
    unit: 'เม็ด',
    requester: 'รพ.บางพลี',
    receivedDate: '11 ต.ค. 10:15',
    urgency: 'normal',
    urgencyLabel: 'ปกติ',
    status: 'accepted',
    trigger: 'MANUAL',
    round: 1,
    message: 'เรียน เภสัชกร รพ.สมุทรปราการ\nรพ.บางพลี ขอยืม ATEnolol 50 mg tab จำนวน 200 เม็ด กรุณาอนุมัติด้วยครับ',
  },
  {
    id: 'BR-2026-000115',
    drug: 'AMLOdipine 5 mg tab',
    ved: 'D',
    vedLabel: 'Desirable',
    qty: 300,
    unit: 'เม็ด',
    requester: 'รพ.บางเสาธง',
    receivedDate: '8 ต.ค. 09:30',
    urgency: 'normal',
    urgencyLabel: 'ปกติ',
    status: 'accepted',
    trigger: 'MANUAL',
    round: 1,
    message: 'เรียน เภสัชกร รพ.สมุทรปราการ\nรพ.บางเสาธง ขอยืม AMLOdipine 5 mg tab จำนวน 300 เม็ด เพื่อสำรองสต็อก',
  },
];

// ─── Lendable stock per drug (keyed by drug name) ────────────────────
export const LENDABLE_STOCK: Record<string, LendableStock> = {
  'AMPicillin 1 g inj': {
    current: 220,
    maxLendable: 88,
    afterLend: 180,
    explanation: 'max(0, ล็อต > 180 วัน 190 - Total Target 102) = 88\nหลังให้ยืม 180 ยังสูงกว่า Total Target 102 - ให้ยืมได้',
  },
  'AMLOdipine 5 mg tab': {
    current: 1800,
    maxLendable: 600,
    afterLend: 1200,
    explanation: 'max(0, ล็อต > 180 วัน 2400 - Total Target 1800) = 600\nหลังให้ยืม 1200 ยังสูงกว่า Total Target 1800 - ให้ยืมได้',
  },
  'ATEnolol 50 mg tab': {
    current: 800,
    maxLendable: 200,
    afterLend: 600,
    explanation: 'max(0, ล็อต > 180 วัน 1000 - Total Target 800) = 200',
  },
};

// ─── FEFO lot options per drug ────────────────────────────────────────
export const LOTS: Record<string, LotOption[]> = {
  'AMPicillin 1 g inj': [
    { lotId: 'AMP-2411', expDate: '30 ก.ย. 2027', daysLeft: 352, qty: 40, fefoEligible: true, note: 'FEFO ลำดับแรกที่อายุ > 180 วัน' },
    { lotId: 'AMP-2405', expDate: '20 ม.ค. 2027', daysLeft: 99, qty: 160, fefoEligible: false, note: 'อายุ ≤ 180 วัน · ให้ยืมไม่ได้' },
  ],
  'AMLOdipine 5 mg tab': [
    { lotId: 'AML-2412', expDate: '15 ธ.ค. 2027', daysLeft: 420, qty: 600, fefoEligible: true, note: 'FEFO ลำดับแรก' },
    { lotId: 'AML-2410', expDate: '10 ต.ค. 2027', daysLeft: 180, qty: 400, fefoEligible: false, note: 'อายุ ≤ 180 วัน' },
  ],
  'ATEnolol 50 mg tab': [
    { lotId: 'ATE-2411', expDate: '28 พ.ย. 2027', daysLeft: 390, qty: 200, fefoEligible: true, note: 'FEFO ลำดับแรก' },
  ],
  'ถุงมือไนไตรล์ M': [
    { lotId: 'GXM-2411', expDate: '5 ก.พ. 2028', daysLeft: 480, qty: 10, fefoEligible: true, note: 'FEFO ลำดับแรก' },
  ],
};
