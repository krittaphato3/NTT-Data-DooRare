import type { UserProfile } from '../../../data/session';

export const DRIVER_USER: UserProfile = {
  name: 'คุณสมชาย แก้วกล้า',
  role: 'DRIVER',
  roleTh: 'พนักงานขับรถขนส่ง (Driver)',
  scopeLabel: 'เห็นเฉพาะงานขนส่งที่ได้รับมอบหมาย',
  hospitalLabel: 'โรงพยาบาลสมุทรปราการ',
  initial: 'ส',
};

export interface DriverVehicleProfile {
  plateNumber: string;
  vehicleType: string;
  coolingSpec: string;
  baseHospital: string;
  phone: string;
}

export const DRIVER_VEHICLE: DriverVehicleProfile = {
  plateNumber: '1นข-4920 กทม.',
  vehicleType: 'รถตู้ขนส่งเวชภัณฑ์ (ควบคุมอุณหภูมิ)',
  coolingSpec: 'ตู้แช่เย็น 2–8°C พร้อมเซนเซอร์บันทึกอุณหภูมิต่อเนื่อง',
  baseHospital: 'รพ.สมุทรปราการ (คลังกลางฝ่ายเภสัชกรรม)',
  phone: '081-456-7890',
};

export interface DriverNotification {
  drug: string;
  time: string;
}

export const DRIVER_NOTIFICATIONS: DriverNotification[] = [
  { drug: 'มีงานขนส่งใหม่ TR-2026-000341 มอบหมายให้ท่าน', time: '16:30' },
  { drug: 'TR-2026-000334 ยืนยันรับของแล้วที่ รพ.สมุทรปราการ', time: '18:58' },
  { drug: 'เตือน: กล่องควบคุมอุณหภูมิ TR-2026-000336 เหลือน้อยกว่า 3 ชม.', time: '18:40' },
];
