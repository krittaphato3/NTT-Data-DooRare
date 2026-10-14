import type { UserProfile } from '../../../data/session';

export const WAREHOUSE_USER: UserProfile = {
  name: 'คุณประเสริฐ ใจงาม',
  role: 'WAREHOUSE_OFFICER',
  roleTh: 'เจ้าหน้าที่คลัง (Warehouse officer)',
  scopeLabel: 'เห็นเฉพาะข้อมูล รพ.สมุทรปราการ',
  hospitalLabel: 'โรงพยาบาลสมุทรปราการ',
  initial: 'ป',
};

export const WAREHOUSE_NOTIFICATIONS = [
  { drug: 'TR-2026-000334 ถึงปลายทาง · รอยืนยันรับ', time: '18:58' },
  { drug: 'TR-2026-000339 รพ.บางเสาธง ขอยกเลิก', time: '18:30' },
  { drug: 'TR-2026-000341 มีรูปรอซิงก์', time: '16:30' },
  { drug: 'TR-2026-000336 ออกเดินทาง', time: '18:40' },
  { drug: 'TR-2026-000338 รอขึ้นรถ', time: '13:20' },
  { drug: 'TR-2026-000339 รอขึ้นรถ', time: '13:20' },
];
