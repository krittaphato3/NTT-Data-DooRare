/** Mock data + status metadata for UI-14 Transport tracking (SM-6). Replace with API-F2a-012 later. */
import type { IconName } from '../../../components/common/icons';

export type TransportStatus = 'WAITING_DISPATCH' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED' | 'CANCELLED';
export type Tone = 'amber' | 'green' | 'blue' | 'teal' | 'red' | 'grey' | 'orange';
export type HospitalCode = 'HA' | 'HB' | 'HC' | 'HD' | 'HE';
export type ShipmentKind = 'F1' | 'F2';

export const HOME_HOSPITAL: HospitalCode = 'HA';

export const HOSPITALS: Record<HospitalCode, string> = {
  HA: 'รพ.สมุทรปราการ',
  HB: 'รพ.บางพลี',
  HC: 'รพ.พระสมุทรเจดีย์ฯ',
  HD: 'รพ.บางบ่อ',
  HE: 'รพ.บางเสาธง',
};

export interface PickLot {
  lot: string;
  expiry: string;
  daysLeft: number;
  qty: number;
  location: string;
  coldChain?: boolean;
}

export interface TransportPhoto {
  stage: 'LOADED' | 'ARRIVED';
  time: string;
  /** Captured offline, not yet synced (FR-F2a-016). */
  pending?: boolean;
}

export interface Shipment {
  id: string;
  kind: ShipmentKind;
  ref: string;
  drug: string;
  qty: number;
  unit: string;
  from: HospitalCode;
  to: HospitalCode;
  status: TransportStatus;
  updatedAt: string;
  updatedBy: string;
  driver?: string;
  pending?: boolean;
  /** Cold-chain item (RBAC §4.4: shown to WH and driver). */
  coldChain?: boolean;
  cancelRequest?: { by: string; time: string; reason: string };
  photos: TransportPhoto[];
  /** Timestamp line for each step in STEPS order ('' = not reached). */
  times: string[];
  /** Lots the warehouse will pick while the task waits for the truck (outbound only, read-only preview). */
  pick?: PickLot[];
  lot: string;
  lotCode: string;
  expiry?: string;
}

const RAW_SHIPMENTS: Shipment[] = [
  { id: 'TR-2026-000334', kind: 'F2', ref: 'AP-2026-000041 · บรรทัด 2', drug: 'AMLOdipine 5 mg tab', qty: 500, unit: 'เม็ด', from: 'HD', to: 'HA', status: 'ARRIVED', updatedAt: '18:58', updatedBy: 'คุณวิทยา (คนขับ)', driver: 'คุณวิทยา บุญมา', photos: [{ stage: 'LOADED', time: '17:20' }, { stage: 'LOADED', time: '17:21' }, { stage: 'ARRIVED', time: '18:58' }], times: ['13 ต.ค. 13:40 · แผนอนุมัติ', '17:20 · คุณมานพ (คลัง รพ.บางบ่อ) + รูป 2', '17:32 · คุณวิทยา', '18:58 · คุณวิทยา + รูป 1', ''], lot: 'AML-HD2403 · หมดอายุ 31 มี.ค. 2027 (169 วัน)', lotCode: 'AML-HD2403', expiry: 'หมดอายุ 31 มี.ค. 2027' },
  { id: 'TR-2026-000341', kind: 'F1', ref: 'BR-2026-000126 · รอบ 1', drug: 'AMPIcillin 1 g inj', qty: 20, unit: 'VIAL', from: 'HA', to: 'HC', status: 'LOADED', updatedAt: '16:30', updatedBy: 'คุณประเสริฐ (คลัง)', driver: 'คุณสมชาย แก้วกล้า', pending: true, photos: [{ stage: 'LOADED', time: '16:28' }, { stage: 'LOADED', time: '16:29', pending: true }], times: ['15:10 · ตอบรับคำขอ', '16:30 · คุณประเสริฐ + รูป 2', '', '', ''], lot: 'AMP-2411 · หมดอายุ 30 ก.ย. 2027 (352 วัน)', lotCode: 'AMP-2411', expiry: 'หมดอายุ 30 ก.ย. 2027' },
  { id: 'TR-2026-000338', kind: 'F2', ref: 'AP-2026-000045 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 100, unit: 'VIAL', from: 'HA', to: 'HB', status: 'WAITING_DISPATCH', updatedAt: '13:20', updatedBy: 'ระบบ (แผนอนุมัติ)', driver: 'คุณสมชาย แก้วกล้า', photos: [], times: ['13:20 · แผนอนุมัติ', '', '', '', ''], lot: 'OMP-2403 · หมดอายุ 20 ธ.ค. 2026 (68 วัน) · ถูกกันไว้จนขึ้นรถ', lotCode: 'OMP-2403', expiry: 'หมดอายุ 20 ธ.ค. 2026' },
  { id: 'TR-2026-000339', kind: 'F2', ref: 'AP-2026-000045 · บรรทัด 2', drug: 'Omeprazole 40 mg inj', qty: 80, unit: 'VIAL', from: 'HA', to: 'HE', status: 'WAITING_DISPATCH', updatedAt: '18:30', updatedBy: 'รพ.บางเสาธง', driver: 'คุณวิทยา บุญมา', cancelRequest: { by: 'รพ.บางเสาธง', time: '18:30', reason: 'ตู้ยาเต็ม รับไม่ได้สัปดาห์นี้' }, photos: [], times: ['13:20 · แผนอนุมัติ', '', '', '', ''], lot: 'OMP-2403 · หมดอายุ 20 ธ.ค. 2026 (68 วัน) · ถูกกันไว้จนขึ้นรถ', lotCode: 'OMP-2403', expiry: 'หมดอายุ 20 ธ.ค. 2026' },
  { id: 'TR-2026-000336', kind: 'F1', ref: 'BR-2026-000109 · รอบ 2', drug: 'CefTRIAXone 1 g inj', qty: 10, unit: 'VIAL', from: 'HC', to: 'HA', status: 'IN_TRANSIT', updatedAt: '18:40', updatedBy: 'คนขับ รพ.พระสมุทรเจดีย์ฯ', photos: [{ stage: 'LOADED', time: '18:10' }, { stage: 'LOADED', time: '18:11' }], times: ['16:20 · ตอบรับบางส่วน 10', '18:10 · คลัง รพ.พระสมุทรเจดีย์ฯ + รูป 2', '18:40 · ออกเดินทาง', '', ''], lot: 'CF2509 · หมดอายุ 31 ส.ค. 2027 (322 วัน)', lotCode: 'CF2509', expiry: 'หมดอายุ 31 ส.ค. 2027' },
  { id: 'TR-2026-000335', kind: 'F1', ref: 'BR-2026-000120 · EMERGENCY', drug: 'PRC group O', qty: 4, unit: 'UNIT', coldChain: true, from: 'HB', to: 'HA', status: 'RECEIVED', updatedAt: '12 ต.ค. 02:40', updatedBy: 'ธนาคารเลือด', photos: [{ stage: 'LOADED', time: '02:05' }, { stage: 'ARRIVED', time: '02:36' }], times: ['01:58', '02:05', '02:08', '02:36', '02:40 · ธนาคารเลือด รพ.สมุทรปราการ'], lot: 'O+ 6630 · O+ 6631', lotCode: 'O+ 6630' },
  { id: 'TR-2026-000333', kind: 'F1', ref: 'BR-2026-000117 · รอบ 1', drug: 'NORepinephrine 4 mg/4 mL', qty: 20, unit: 'AMP', from: 'HB', to: 'HA', status: 'RECEIVED', updatedAt: '11 ต.ค. 14:20', updatedBy: 'คุณประเสริฐ', photos: [{ stage: 'LOADED', time: '11:40' }, { stage: 'ARRIVED', time: '14:12' }], times: ['09:15', '11:40', '11:52', '14:12', '14:20'], lot: 'NE25C11', lotCode: 'NE25C11' },
  { id: 'TR-2026-000332', kind: 'F1', ref: 'BR-2026-000117 · รอบ 1', drug: 'NORepinephrine 4 mg/4 mL', qty: 10, unit: 'AMP', from: 'HC', to: 'HA', status: 'RECEIVED', updatedAt: '11 ต.ค. 15:05', updatedBy: 'คุณประเสริฐ', photos: [{ stage: 'LOADED', time: '12:30' }, { stage: 'ARRIVED', time: '15:00' }], times: ['09:20', '12:30', '12:41', '15:00', '15:05'], lot: 'NE25B02', lotCode: 'NE25B02' },
  { id: 'TR-2026-000330', kind: 'F1', ref: 'BR-2026-000115 · รอบ 1', drug: 'AMLOdipine 5 mg tab', qty: 300, unit: 'เม็ด', from: 'HA', to: 'HE', status: 'RECEIVED', updatedAt: '9 ต.ค. 11:30', updatedBy: 'รพ.บางเสาธง', photos: [{ stage: 'LOADED', time: '08:50' }, { stage: 'ARRIVED', time: '11:20' }], times: ['8 ต.ค. 10:02', '08:50', '09:05', '11:20', '11:30'], lot: 'AML-2502', lotCode: 'AML-2502' },
  { id: 'TR-2026-000329', kind: 'F2', ref: 'AP-2026-000039 · บรรทัด 1', drug: 'Omeprazole 40 mg inj', qty: 180, unit: 'VIAL', from: 'HA', to: 'HC', status: 'CANCELLED', updatedAt: '10 ต.ค. 16:00', updatedBy: 'ยินยอมทั้งสองฝ่าย', photos: [], times: ['9 ต.ค.', '', '', '', ''], lot: 'OMP-2403', lotCode: 'OMP-2403' },
];

/** Rows created from confirmed requests (work inbox) that are still being prepared / waiting for a truck. */
const NEW_ROWS: Shipment[] = [
  {
    id: 'TR-2026-000342', kind: 'F1', ref: 'BR-2026-000129 · รอบ 1', drug: 'CefTRIAXone 1 g inj', qty: 30, unit: 'VIAL', from: 'HA', to: 'HD', status: 'WAITING_DISPATCH',
    updatedAt: '17:55', updatedBy: 'คุณประเสริฐ (คลัง)', driver: 'คุณสมชาย แก้วกล้า', photos: [],
    times: ['17:55 · ยืนยันแล้ว · เตรียมของ รอขึ้นรถ', '', '', '', ''], lot: 'CF2511 + CF2512 · อายุ > 180 วัน (FEFO)', lotCode: 'CF2511',
    pick: [
      { lot: 'CF2511', expiry: '30 พ.ย. 2027', daysLeft: 382, qty: 20, location: 'ชั้น C3' },
      { lot: 'CF2512', expiry: '31 ธ.ค. 2027', daysLeft: 413, qty: 10, location: 'ชั้น C3' },
    ],
  },
  {
    id: 'TR-2026-000345', kind: 'F1', ref: 'BR-2026-000127 · EMERGENCY', drug: 'Atropine 1 mg/mL amp', qty: 20, unit: 'AMP', from: 'HA', to: 'HD', status: 'IN_TRANSIT',
    updatedAt: '16:05', updatedBy: 'คุณสมชาย (คนขับ)', driver: 'คุณสมชาย แก้วกล้า', photos: [{ stage: 'LOADED', time: '15:55' }, { stage: 'LOADED', time: '15:56' }],
    times: ['15:42 · WH ยืนยันคำขอเร่งด่วน (F3)', '15:56 · คุณประเสริฐ + รูป 2', '16:05 · คุณสมชาย ออกเดินทาง', '', ''], lot: 'ATR-2504 · หมดอายุ 30 เม.ย. 2027 (198 วัน)', lotCode: 'ATR-2504', expiry: 'หมดอายุ 30 เม.ย. 2027',
  },
  {
    id: 'TR-2026-000343', kind: 'F1', ref: 'BR-2026-000130 · รอบ 1', drug: 'Adrenaline 1 mg/mL amp', qty: 20, unit: 'AMP', from: 'HB', to: 'HA', status: 'WAITING_DISPATCH',
    updatedAt: '18:20', updatedBy: 'รพ.บางพลี (ต้นทาง)', photos: [], times: ['18:20 · ต้นทางกำลังเตรียมของ · รอขึ้นรถ', '', '', '', ''], lot: 'ต้นทางเลือกล็อต (FEFO)', lotCode: 'ADR-HB2501',
  },
  {
    id: 'TR-2026-000344', kind: 'F2', ref: 'AP-2026-000047 · บรรทัด 2', drug: 'Metformin 500 mg tab', qty: 2000, unit: 'เม็ด', from: 'HD', to: 'HA', status: 'WAITING_DISPATCH',
    updatedAt: '17:10', updatedBy: 'ระบบ (แผนอนุมัติ)', photos: [], times: ['17:10 · แผนอนุมัติ · ต้นทางรอขึ้นรถ', '', '', '', ''], lot: 'MET-HD2412 · หมดอายุ 31 ม.ค. 2027 (109 วัน)', lotCode: 'MET-HD2412', expiry: 'หมดอายุ 31 ม.ค. 2027',
  },
];

export const SHIPMENTS: Shipment[] = [...NEW_ROWS, ...RAW_SHIPMENTS];


export const DRIVERS = ['คุณสมชาย แก้วกล้า', 'คุณวิทยา บุญมา'];

/** SM-6 main path (CANCELLED is a side exit). */
export const STEP_ORDER: TransportStatus[] = ['WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED'];

export const STEPS: { label: string; code: TransportStatus; icon: IconName }[] = [
  { label: 'รอขึ้นรถ', code: 'WAITING_DISPATCH', icon: 'hourglass' },
  { label: 'ขึ้นรถแล้ว · เจ้าหน้าที่ + รูป', code: 'LOADED', icon: 'box' },
  { label: 'ออกเดินทาง · คนขับ', code: 'IN_TRANSIT', icon: 'truck' },
  { label: 'ถึงปลายทาง · คนขับ + รูป', code: 'ARRIVED', icon: 'camera' },
  { label: 'ปลายทางยืนยันรับ', code: 'RECEIVED', icon: 'pkg' },
];

export const STATUS_META: Record<TransportStatus, { label: string; tileLabel: string; tone: Tone; icon: IconName }> = {
  WAITING_DISPATCH: { label: 'รอขึ้นรถ', tileLabel: 'รอขึ้นรถ', tone: 'amber', icon: 'hourglass' },
  LOADED: { label: 'ขึ้นรถแล้ว', tileLabel: 'ขึ้นรถแล้ว', tone: 'blue', icon: 'box' },
  IN_TRANSIT: { label: 'กำลังเดินทาง', tileLabel: 'กำลังเดินทาง', tone: 'blue', icon: 'truck' },
  ARRIVED: { label: 'ถึงปลายทาง · รอรับ', tileLabel: 'ถึง · รอรับ', tone: 'green', icon: 'checkc' },
  RECEIVED: { label: 'รับของแล้ว', tileLabel: 'รับของแล้ว', tone: 'teal', icon: 'pkg' },
  CANCELLED: { label: 'ยกเลิก', tileLabel: 'ยกเลิก', tone: 'grey', icon: 'minusc' },
};

export const TILE_ORDER: TransportStatus[] = ['WAITING_DISPATCH', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED'];

export const AUDIT_HISTORY = [
  { t: '18:58', who: 'คุณวิทยา บุญมา', role: 'DRIVER · รพ.บางบ่อ', tone: 'orange' as Tone, text: 'TR-2026-000334 ถึงปลายทาง + รูป 1', code: 'TRANSPORT_ARRIVED' },
  { t: '18:40', who: 'คนขับ รพ.พระสมุทรเจดีย์ฯ', role: 'DRIVER', tone: 'orange' as Tone, text: 'TR-2026-000336 ออกเดินทาง', code: 'TRANSPORT_DEPARTED' },
  { t: '18:30', who: 'รพ.บางเสาธง', role: 'PHARMACIST', tone: 'orange' as Tone, text: 'ขอยกเลิก TR-2026-000339 · รอความยินยอม', code: 'TRANSPORT_CANCEL_REQUESTED' },
  { t: '16:30', who: 'คุณประเสริฐ ใจงาม', role: 'WAREHOUSE_OFFICER', tone: 'blue' as Tone, text: 'TR-2026-000341 ขึ้นรถ + รูป 2 (1 รอซิงก์) · ตัดสต็อก 20 VIAL', code: 'TRANSPORT_LOADED' },
];

export const isOutbound = (s: Shipment) => s.from === HOME_HOSPITAL;
export const fmtQty = (n: number) => n.toLocaleString('en-US');
