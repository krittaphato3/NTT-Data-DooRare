/**
 * Urgent lender requests (F3) the warehouse must confirm before sending goods to another hospital.
 * Only F3 needs a WH decision: for F1 and F2 the pharmacist decides, and the task simply arrives in
 * Transport tracking at "กำลังเตรียมของ". Confirming here starts a transport task at that same step;
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
