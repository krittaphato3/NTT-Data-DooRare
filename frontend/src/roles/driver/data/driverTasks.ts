import type { Shipment, TransportStatus } from '../../warehouse/data/transport';
import { DRIVER_USER } from './session';

export interface DriverOfflineEvent {
  clientEventId: string;
  seq: number;
  taskId: string;
  toStatus: TransportStatus;
  capturedAt: string;
  receivedAt?: string;
  applied: boolean;
  photoKeys: string[];
  note: string;
}

export interface ColdChainGuideline {
  title: string;
  maxTransitHours: number;
  tempRange: string;
  ruleCode: string;
  description: string;
}

export const COLD_CHAIN_GUIDELINE: ColdChainGuideline = {
  title: 'เกณฑ์ควบคุมความเย็น (Cold Chain Protocol)',
  maxTransitHours: 6,
  tempRange: '2°C – 8°C',
  ruleCode: 'BR-F1b-012 · BR-F2a-026',
  description: 'ต้องขนส่งด้วยกล่องโฟม/กระเป๋าเก็บความเย็นพร้อม Ice pack และตัววัดอุณหภูมิ หากเวลาเดินทางเกิน 6 ชม. หรืออุณหภูมิเกิน 8°C ต้องรายงานคลังทันที',
};

export const EMERGENCY_CONTACTS = [
  { name: 'คลังกลาง รพ.สมุทรปราการ (ต้นทาง)', tel: '02-701-8132 ต่อ 104', time: '24 ชั่วโมง' },
  { name: 'ห้องจ่ายยาฉุกเฉิน (ER Pharmacy)', tel: '02-701-8132 ต่อ 112', time: '24 ชั่วโมง' },
  { name: 'หัวหน้างานยานพาหนะ / ศูนย์สั่งการ', tel: '089-123-4567', time: '06:00 - 22:00 น.' },
  { name: 'คลัง รพ.พระสมุทรเจดีย์ฯ (ปลายทาง HC)', tel: '02-425-8899 ต่อ 201', time: '08:00 - 20:00 น.' },
  { name: 'คลัง รพ.บางบ่อ (ปลายทาง HD)', tel: '02-708-5566 ต่อ 155', time: '08:00 - 20:00 น.' },
  { name: 'คลัง รพ.บางพลี (ปลายทาง HB)', tel: '02-337-3333 ต่อ 302', time: '08:00 - 20:00 น.' },
];

export const INITIAL_OFFLINE_EVENTS: DriverOfflineEvent[] = [
  {
    clientEventId: 'evt-c83f-4891-9a1b',
    seq: 1,
    taskId: 'TR-2026-000341',
    toStatus: 'LOADED',
    capturedAt: '16:29 น. (เวลาเครื่องขณะไม่มีสัญญาณ)',
    receivedAt: 'รอสัญญาณเชื่อมต่อ...',
    applied: false,
    photoKeys: ['ph-loaded-001.jpg'],
    note: 'ขึ้นรถที่ลานโหลดชั้นใต้ดิน รพ.สมุทรปราการ (อับสัญญาณ) · สต็อกจะตัดเมื่อซิงก์สำเร็จ',
  },
  {
    clientEventId: 'evt-b112-7801-44aa',
    seq: 2,
    taskId: 'TR-2026-000345',
    toStatus: 'IN_TRANSIT',
    capturedAt: '16:05 น.',
    receivedAt: '16:06 น. (เซิร์ฟเวอร์รับสำเร็จ)',
    applied: true,
    photoKeys: ['ph-loaded-002.jpg', 'ph-box-003.jpg'],
    note: 'ออกเดินทางจาก รพ.สมุทรปราการ มุ่งหน้า รพ.บางบ่อ (เหตุฉุกเฉิน F3)',
  },
  {
    clientEventId: 'evt-a099-2314-88ff',
    seq: 3,
    taskId: 'TR-2026-000334',
    toStatus: 'ARRIVED',
    capturedAt: '18:58 น.',
    receivedAt: '18:58 น.',
    applied: true,
    photoKeys: ['ph-arrived-001.jpg'],
    note: 'ถึงจุดรับส่งเวชภัณฑ์ รพ.สมุทรปราการ ถ่ายรูปกล่องพัสดุเรียบร้อย',
  },
];

/** Check if shipment belongs to the active driver. */
export function isAssignedToDriver(s: Shipment, driverName: string = DRIVER_USER.name): boolean {
  if (!s.driver) return false;
  return s.driver.trim().toLowerCase().includes(driverName.trim().toLowerCase()) ||
         driverName.trim().toLowerCase().includes(s.driver.trim().toLowerCase());
}
