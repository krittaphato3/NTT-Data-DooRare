/**
 * Work inbox mock data (WH). Everything the warehouse must prepare for, or expect to receive, from
 * every feature (F1 borrow, F2 near-expiry allocation, F3 emergency). Outbound items become transport
 * tasks only after the warehouse confirms and marks them ready.
 */
import type { IconName } from '../../../components/common/icons';
import { SHIPMENTS } from './transport';
import type { HospitalCode, Tone, TransportStatus } from './transport';

export type InboxFeature = 'F1' | 'F2' | 'F3';
export type InboxStatus = 'NEW' | 'PREPARING' | 'READY' | 'DECLINED';

export const FEATURE_META: Record<InboxFeature, { label: string; tone: Tone }> = {
  F1: { label: 'F1 ยืม', tone: 'blue' },
  F2: { label: 'F2 โอนใกล้หมดอายุ', tone: 'teal' },
  F3: { label: 'F3 ฉุกเฉิน', tone: 'red' },
};

export const INBOX_STATUS_META: Record<InboxStatus, { label: string; tone: Tone; icon: IconName }> = {
  NEW: { label: 'รอยืนยันเตรียม', tone: 'amber', icon: 'hourglass' },
  PREPARING: { label: 'กำลังเตรียม', tone: 'blue', icon: 'box' },
  READY: { label: 'เตรียมเสร็จ', tone: 'green', icon: 'checkc' },
  DECLINED: { label: 'เตรียมไม่ได้ · ส่งกลับเภสัชกร', tone: 'orange', icon: 'tri' },
};

export const INBOX_STEPS: { code: InboxStatus; label: string; icon: IconName }[] = [
  { code: 'NEW', label: 'รอยืนยันเตรียม', icon: 'hourglass' },
  { code: 'PREPARING', label: 'กำลังหยิบ/เตรียมของ', icon: 'box' },
  { code: 'READY', label: 'เตรียมเสร็จ · สร้างงานขนส่ง', icon: 'checkc' },
];

export interface PickLot {
  lot: string;
  expiry: string;
  daysLeft: number;
  qty: number;
  location: string;
  coldChain?: boolean;
}

/** A drug/supply the hospital must send out. */
export interface OutboundItem {
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
  transportId?: string;
  declineReason?: string;
}

export interface KitLine {
  item: string;
  perSet: number;
  unit: string;
  coldChain?: boolean;
}

/** F3 pack task: patient sets to assemble for an incident. */
export interface PackTask {
  id: string;
  incident: string;
  kit: string;
  kitEn: string;
  qty: number;
  readyNow: number;
  target: number;
  recipe: KitLine[];
  status: InboxStatus;
  declineReason?: string;
}

export interface InboundItem {
  id: string;
  feature: InboxFeature;
  ref: string;
  drug: string;
  qty: number;
  unit: string;
  from: HospitalCode;
  stage: string;
  eta: string;
  /** Present once the goods are on a transport task (then followed on the transport page). */
  transportId?: string;
  transportStatus?: TransportStatus;
}

/** Seconds left on the urgent F3 lender request at page load (spec: confirm within 3–5 min). */
export const URGENT_SECONDS = 160;

export const OUTBOUND: OutboundItem[] = [
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
    id: 'IB-F1-0129', feature: 'F1', ref: 'BR-2026-000129 · รอบ 1', drug: 'CefTRIAXone 1 g inj', qty: 30, unit: 'VIAL',
    to: 'HD', requestedBy: 'ภก. รพ.บางบ่อ', due: 'ส่งภายใน 4 ชม.', status: 'PREPARING',
    pick: [
      { lot: 'CF2511', expiry: '30 พ.ย. 2027', daysLeft: 382, qty: 20, location: 'ชั้น C3' },
      { lot: 'CF2512', expiry: '31 ธ.ค. 2027', daysLeft: 413, qty: 10, location: 'ชั้น C3' },
    ],
    note: 'เภสัชกรเราตอบรับแล้ว · เตรียมจาก 2 ล็อตตาม FEFO',
  },
  {
    id: 'IB-F2-0046', feature: 'F2', ref: 'AP-2026-000046 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 120, unit: 'VIAL',
    to: 'HC', requestedBy: 'แผนจัดสรร (อนุมัติ 17:40)', due: 'ส่งภายในพรุ่งนี้', status: 'NEW',
    pick: [{ lot: 'OMP-2403', expiry: '20 ธ.ค. 2026', daysLeft: 68, qty: 120, location: 'ชั้น C1 · ถูกกันไว้' }],
    note: 'โอนยาใกล้หมดอายุเข้าคลังกลาง · ล็อตถูกกันไว้จนขึ้นรถ',
  },
  {
    id: 'IB-F2-0045', feature: 'F2', ref: 'AP-2026-000045 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 100, unit: 'VIAL',
    to: 'HB', requestedBy: 'แผนจัดสรร (อนุมัติ 13:20)', due: 'ส่งวันนี้', status: 'READY',
    pick: [{ lot: 'OMP-2403', expiry: '20 ธ.ค. 2026', daysLeft: 68, qty: 100, location: 'ชั้น C1 · ถูกกันไว้' }],
    transportId: 'TR-2026-000338',
  },
];

export const PACKS: PackTask[] = [
  {
    id: 'PK-2026-0012', incident: 'INC-2026-0007', kit: 'ชุดบาดเจ็บ', kitEn: 'Trauma', qty: 4, readyNow: 6, target: 10, status: 'NEW',
    recipe: [
      { item: 'Adrenaline 1 mg/mL amp', perSet: 2, unit: 'AMP' },
      { item: 'Tranexamic acid 500 mg inj', perSet: 2, unit: 'AMP' },
      { item: 'NSS 0.9% 1000 mL', perSet: 2, unit: 'BAG' },
      { item: 'ชุดแผล/ผ้าก๊อซ', perSet: 1, unit: 'SET' },
    ],
  },
  {
    id: 'PK-2026-0013', incident: 'INC-2026-0007', kit: 'ชุดใส่ท่อช่วยหายใจ', kitEn: 'Intubation', qty: 2, readyNow: 5, target: 6, status: 'NEW',
    recipe: [
      { item: 'Succinylcholine 100 mg inj', perSet: 1, unit: 'AMP', coldChain: true },
      { item: 'Propofol 200 mg inj', perSet: 1, unit: 'AMP' },
      { item: 'ท่อช่วยหายใจ เบอร์ 7.5', perSet: 1, unit: 'EA' },
      { item: 'Laryngoscope blade', perSet: 1, unit: 'EA' },
    ],
  },
];

const fromShipment = (id: string) => SHIPMENTS.find((s) => s.id === id)!;

function inboundFromShipment(feature: InboxFeature, id: string): InboundItem {
  const s = fromShipment(id);
  return {
    id: `IN-${id.slice(-6)}`, feature, ref: s.ref, drug: s.drug, qty: s.qty, unit: s.unit, from: s.from,
    stage: s.status === 'ARRIVED' ? 'ถึงปลายทางแล้ว · รอยืนยันรับ' : 'อยู่ระหว่างขนส่ง',
    eta: s.status === 'ARRIVED' ? `ถึง ${s.updatedAt} น.` : 'ประมาณ 20:30',
    transportId: s.id, transportStatus: s.status,
  };
}

export const INBOUND: InboundItem[] = [
  { id: 'IN-F1-0130', feature: 'F1', ref: 'BR-2026-000130 · รอบ 1', drug: 'Adrenaline 1 mg/mL amp', qty: 20, unit: 'AMP', from: 'HB', stage: 'ผู้ให้ตอบรับแล้ว · ต้นทางกำลังเตรียมของ', eta: 'ประมาณ 21:00' },
  { id: 'IN-F2-0047', feature: 'F2', ref: 'AP-2026-000047 · บรรทัด 2', drug: 'Metformin 500 mg tab', qty: 2000, unit: 'เม็ด', from: 'HD', stage: 'แผนอนุมัติแล้ว · รอต้นทางขึ้นรถ', eta: 'พรุ่งนี้เช้า' },
  inboundFromShipment('F1', 'TR-2026-000336'),
  inboundFromShipment('F2', 'TR-2026-000334'),
];

/** KPI / badge numbers from the initial mock state (UI only: the real source will be the API). */
export function inboxStats() {
  const outNew = OUTBOUND.filter((o) => o.status === 'NEW');
  const packNew = PACKS.filter((p) => p.status === 'NEW');
  const byFeature = (f: InboxFeature) => outNew.filter((o) => o.feature === f).length + (f === 'F3' ? packNew.length : 0);
  return {
    newTotal: outNew.length + packNew.length,
    f1: byFeature('F1'),
    f2: byFeature('F2'),
    f3: byFeature('F3'),
    preparing: OUTBOUND.filter((o) => o.status === 'PREPARING').length + PACKS.filter((p) => p.status === 'PREPARING').length,
    ready: OUTBOUND.filter((o) => o.status === 'READY').length,
    urgent: OUTBOUND.filter((o) => o.urgent && o.status === 'NEW').length,
  };
}
