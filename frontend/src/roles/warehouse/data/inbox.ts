/**
 * "Requests to confirm" mock data (WH). One place where the warehouse answers every request that
 * asks it to send goods out — F1 borrow, F2 near-expiry allocation, F3 emergency (urgent). Confirming
 * hands the task to Transport tracking (starting at "กำลังเตรียมของ"); declining sends it back to
 * the pharmacist. Packing sets for our own incidents lives on the F3 page.
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
    note: 'คำขอยืมเร่งด่วน F3 · ยืนยันก่อนส่งของ (ฝั่งผู้ให้)',
  },
  {
    id: 'IB-F1-0128', feature: 'F1', ref: 'BR-2026-000128 · รอบ 1', drug: 'NORepinephrine 4 mg/4 mL', qty: 15, unit: 'AMP',
    to: 'HB', requestedBy: 'ภก. รพ.บางพลี', due: 'ส่งภายใน 2 ชม.', status: 'NEW',
    pick: [{ lot: 'NE25D04', expiry: '31 ก.ค. 2027', daysLeft: 290, qty: 15, location: 'ตู้ยา B2' }],
    note: 'เภสัชกรเราตอบรับแล้ว · ล็อตที่ให้ยืมต้องอายุ > 180 วัน (FEFO)',
  },
  {
    id: 'IB-F2-0046', feature: 'F2', ref: 'AP-2026-000046 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 120, unit: 'VIAL',
    to: 'HC', requestedBy: 'แผนจัดสรร (อนุมัติ 17:40)', due: 'ส่งภายในพรุ่งนี้', status: 'NEW',
    pick: [{ lot: 'OMP-2403', expiry: '20 ธ.ค. 2026', daysLeft: 68, qty: 120, location: 'ชั้น C1 · ถูกกันไว้' }],
    note: 'โอนยาใกล้หมดอายุเข้าคลังกลาง · ล็อตถูกกันไว้จนขึ้นรถ',
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
    id: 'IB-F2-0045', feature: 'F2', ref: 'AP-2026-000045 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 100, unit: 'VIAL',
    to: 'HB', requestedBy: 'แผนจัดสรร (อนุมัติ 13:20)', due: 'ส่งวันนี้', status: 'CONFIRMED', transportId: 'TR-2026-000338',
    pick: [{ lot: 'OMP-2403', expiry: '20 ธ.ค. 2026', daysLeft: 68, qty: 100, location: 'ชั้น C1 · ถูกกันไว้' }],
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
