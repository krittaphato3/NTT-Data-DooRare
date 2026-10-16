/**
 * Urgent lender requests (F3) the warehouse must confirm before sending goods to another hospital.
 * Only F3 needs a WH decision: for F1 and F2 the pharmacist decides, and the task simply arrives in
 * Transport tracking at "รอขึ้นรถ" (WAITING_DISPATCH). Confirming here starts a transport task at that same step;
 * declining sends the request back to the pharmacist.
 */
import type { IconName } from '../../../components/common/icons';
import type { HospitalCode, PickLot, Tone } from './transport';

export type InboxFeature = 'F1' | 'F2' | 'F3';
export type InboxStatus = 'NEW' | 'CONFIRMED' | 'DECLINED';

export const FEATURE_META: Record<InboxFeature, { label: string; tone: Tone }> = {
  F1: { label: 'F1 ยืม', tone: 'blue' },
  F2: { label: 'F2 โอนใกล้หมดอายุ', tone: 'teal' },
  F3: { label: 'F3 ฉุกเฉิน', tone: 'red' },
};

export const INBOX_STATUS_META: Record<InboxStatus, { label: string; tone: Tone; icon: IconName }> = {
  NEW: { label: 'รอยืนยัน', tone: 'amber', icon: 'hourglass' },
  CONFIRMED: { label: 'ยืนยันแล้ว', tone: 'green', icon: 'checkc' },
  DECLINED: { label: 'เตรียมไม่ได้ · ส่งกลับเภสัชกร', tone: 'orange', icon: 'tri' },
};

/** A request for goods the warehouse must send out. */
export interface RequestItem {
  id: string;
  feature: InboxFeature;
  ref: string;
  drug: string;
  qty: number;
  unit: string;
  to: HospitalCode;
  requestedBy: string;
  due: string;
  urgent?: boolean;
  status: InboxStatus;
  pick: PickLot[];
  note?: string;
  /** Transport task created once confirmed. */
  transportId?: string;
  declineReason?: string;
}

/** Seconds left on the urgent F3 request at page load (spec: confirm within 3–5 min). */
export const URGENT_SECONDS = 160;

export const REQUESTS: RequestItem[] = [
  {
    id: 'IB-F3-0131', feature: 'F3', ref: 'BR-2026-000131 · เหตุ INC-2026-0008', drug: 'Adrenaline 1 mg/mL amp', qty: 30, unit: 'AMP',
    to: 'HB', requestedBy: 'ER รพ.บางพลี', due: 'ยืนยันภายใน 03:00 นาที', urgent: true, status: 'NEW',
    pick: [{ lot: 'ADR-2506', expiry: '28 ก.พ. 2027', daysLeft: 137, qty: 30, location: 'ตู้ฉุกเฉิน A1' }],
    note: 'คำขอยืมเร่งด่วน F3 · WH ฝั่งผู้ให้ยืนยันก่อนส่งของ',
  },
  {
    id: 'IB-F3-0134', feature: 'F3', ref: 'BR-2026-000134 · เหตุ INC-2026-0008', drug: 'Tranexamic acid 500 mg inj', qty: 20, unit: 'AMP',
    to: 'HB', requestedBy: 'ER รพ.บางพลี', due: 'ยืนยันภายใน 04:30 นาที', urgent: true, status: 'NEW',
    pick: [{ lot: 'TXA-2507', expiry: '31 ส.ค. 2027', daysLeft: 321, qty: 20, location: 'ตู้ฉุกเฉิน A2' }],
    note: 'คำขอยืมเร่งด่วน F3 · WH ฝั่งผู้ให้ยืนยันก่อนส่งของ',
  },
  {
    id: 'IB-F3-0127', feature: 'F3', ref: 'BR-2026-000127 · เหตุ INC-2026-0006', drug: 'Atropine 1 mg/mL amp', qty: 20, unit: 'AMP',
    to: 'HD', requestedBy: 'ER รพ.บางบ่อ', due: 'ยืนยันแล้ว 15:42', status: 'CONFIRMED', transportId: 'TR-2026-000345',
    pick: [{ lot: 'ATR-2504', expiry: '30 เม.ย. 2027', daysLeft: 198, qty: 20, location: 'ตู้ฉุกเฉิน A1' }],
  },
];

export function inboxStats() {
  const open = REQUESTS.filter((r) => r.status === 'NEW');
  const by = (f: InboxFeature) => open.filter((r) => r.feature === f).length;
  return {
    newTotal: open.length,
    f1: by('F1'),
    f2: by('F2'),
    f3: by('F3'),
    urgent: open.filter((r) => r.urgent).length,
    confirmed: REQUESTS.filter((r) => r.status === 'CONFIRMED').length,
  };
}

/**
 * Work inbox (WH): every task that needs the warehouse, across F1 / F2 / F3.
 *  - Outbound: goods we pack and send to other hospitals. F1/F2 arrive after the pharmacist approves;
 *    F3 urgent requests are answered on the Emergency page and then show up here too.
 *  - Inbound: goods other hospitals are sending us (heads-up; WH confirms receipt on arrival).
 * Confirming an outbound task hands it to Transport tracking (starting at "รอขึ้นรถ").
 */
export const OUTBOUND_TASKS: RequestItem[] = [
  {
    id: 'IB-F1-0128', feature: 'F1', ref: 'BR-2026-000128 · รอบ 1', drug: 'NORepinephrine 4 mg/4 mL', qty: 15, unit: 'AMP',
    to: 'HB', requestedBy: 'ภก. รพ.บางพลี · เภสัชกรเราตอบรับแล้ว', due: 'ส่งภายใน 2 ชม.', status: 'NEW',
    pick: [{ lot: 'NE25D04', expiry: '31 ก.ค. 2027', daysLeft: 290, qty: 15, location: 'ตู้ยา B2' }],
    note: 'F1 ยืม · ล็อตที่ให้ยืมต้องอายุ > 180 วัน (FEFO)',
  },
  {
    id: 'IB-F2-0046', feature: 'F2', ref: 'AP-2026-000046 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 120, unit: 'VIAL',
    to: 'HC', requestedBy: 'แผนจัดสรร (เภสัชกรอนุมัติ 17:40)', due: 'ส่งภายในพรุ่งนี้', status: 'NEW',
    pick: [{ lot: 'OMP-2403', expiry: '20 ธ.ค. 2026', daysLeft: 68, qty: 120, location: 'ชั้น C1 · ถูกกันไว้' }],
    note: 'F2 โอนยาใกล้หมดอายุเข้าคลังกลาง · ล็อตถูกกันไว้จนขึ้นรถ',
  },
  {
    id: 'IB-F1-0129', feature: 'F1', ref: 'BR-2026-000129 · รอบ 1', drug: 'CefTRIAXone 1 g inj', qty: 30, unit: 'VIAL',
    to: 'HD', requestedBy: 'ภก. รพ.บางบ่อ', due: 'ส่งภายใน 4 ชม.', status: 'CONFIRMED', transportId: 'TR-2026-000342',
    pick: [
      { lot: 'CF2511', expiry: '30 พ.ย. 2027', daysLeft: 382, qty: 20, location: 'ชั้น C3' },
      { lot: 'CF2512', expiry: '31 ธ.ค. 2027', daysLeft: 413, qty: 10, location: 'ชั้น C3' },
    ],
  },
  {
    id: 'IB-F3-0127', feature: 'F3', ref: 'BR-2026-000127 · เหตุ INC-2026-0006', drug: 'Atropine 1 mg/mL amp', qty: 20, unit: 'AMP',
    to: 'HD', requestedBy: 'ER รพ.บางบ่อ · ยืนยันที่หน้า Emergency 15:42', due: 'ยืนยันแล้ว', status: 'CONFIRMED', transportId: 'TR-2026-000345',
    pick: [{ lot: 'ATR-2504', expiry: '30 เม.ย. 2027', daysLeft: 198, qty: 20, location: 'ตู้ฉุกเฉิน A1' }],
  },
  {
    id: 'IB-F2-0045', feature: 'F2', ref: 'AP-2026-000045 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 100, unit: 'VIAL',
    to: 'HB', requestedBy: 'แผนจัดสรร (อนุมัติ 13:20)', due: 'ส่งวันนี้', status: 'CONFIRMED', transportId: 'TR-2026-000338',
    pick: [{ lot: 'OMP-2403', expiry: '20 ธ.ค. 2026', daysLeft: 68, qty: 100, location: 'ชั้น C1 · ถูกกันไว้' }],
  },
];

export type InboundStatus = 'NEW' | 'ACKED';

export interface InboundTask {
  id: string;
  feature: InboxFeature;
  ref: string;
  drug: string;
  qty: number;
  unit: string;
  from: HospitalCode;
  /** NEW = the other hospital accepted our request and will send goods; WH presses "รับทราบ" to put it on Transport tracking (รับเข้า). */
  status: InboundStatus;
  stage: string;
  eta: string;
  /** Present once acknowledged: the goods are followed (and receipt confirmed) on Transport tracking. */
  transportId?: string;
}

export const INBOUND_TASKS: InboundTask[] = [
  { id: 'IN-F3-0132', feature: 'F3', ref: 'BR-2026-000132 · เหตุ INC-2026-0007', drug: 'NORepinephrine 4 mg/4 mL', qty: 20, unit: 'AMP', from: 'HB', status: 'NEW', stage: 'รพ.บางพลีตอบรับแล้ว · จะส่งของมาให้', eta: 'เร็วที่สุดภายใน 30 นาที' },
  { id: 'IN-F1-0136', feature: 'F1', ref: 'BR-2026-000136 · รอบ 1', drug: 'Furosemide 20 mg/2 mL inj', qty: 30, unit: 'AMP', from: 'HC', status: 'NEW', stage: 'รพ.พระสมุทรเจดีย์ฯตอบรับแล้ว · จะส่งของมาให้', eta: 'วันนี้ช่วงค่ำ' },
  { id: 'IN-F2-0048', feature: 'F2', ref: 'AP-2026-000048 · บรรทัด 1', drug: 'Amoxicillin 500 mg cap', qty: 1000, unit: 'CAP', from: 'HE', status: 'NEW', stage: 'แผนจัดสรรอนุมัติแล้ว · จะโอนมาให้เรา', eta: 'พรุ่งนี้เช้า' },
  { id: 'IN-F1-0130', feature: 'F1', ref: 'BR-2026-000130 · รอบ 1', drug: 'Adrenaline 1 mg/mL amp', qty: 20, unit: 'AMP', from: 'HB', status: 'ACKED', stage: 'รับทราบแล้ว · ต้นทางกำลังเตรียมของ', eta: 'ประมาณ 21:00', transportId: 'TR-2026-000343' },
  { id: 'IN-F2-0047', feature: 'F2', ref: 'AP-2026-000047 · บรรทัด 2', drug: 'Metformin 500 mg tab', qty: 2000, unit: 'เม็ด', from: 'HD', status: 'ACKED', stage: 'ต้นทางเตรียมเสร็จ · รอขึ้นรถ', eta: 'พรุ่งนี้เช้า', transportId: 'TR-2026-000344' },
  { id: 'IN-F1-0109', feature: 'F1', ref: 'BR-2026-000109 · รอบ 2', drug: 'CefTRIAXone 1 g inj', qty: 10, unit: 'VIAL', from: 'HC', status: 'ACKED', stage: 'อยู่ระหว่างเดินทาง', eta: 'ประมาณ 20:30', transportId: 'TR-2026-000336' },
  { id: 'IN-F2-0041', feature: 'F2', ref: 'AP-2026-000041 · บรรทัด 2', drug: 'AMLOdipine 5 mg tab', qty: 500, unit: 'เม็ด', from: 'HD', status: 'ACKED', stage: 'ถึงปลายทางแล้ว · รอยืนยันรับ', eta: 'ถึง 18:58 น.', transportId: 'TR-2026-000334' },
];

export function outboundStats() {
  const open = OUTBOUND_TASKS.filter((r) => r.status === 'NEW');
  return {
    newTotal: open.length,
    f1: open.filter((r) => r.feature === 'F1').length,
    f2: open.filter((r) => r.feature === 'F2').length,
    f3: open.filter((r) => r.feature === 'F3').length,
    inbound: INBOUND_TASKS.length,
    inboundNew: INBOUND_TASKS.filter((i) => i.status === 'NEW').length,
    toReceive: INBOUND_TASKS.filter((i) => i.stage.startsWith('ถึงปลายทาง')).length,
  };
}
