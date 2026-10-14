import type { NavItem } from '../../../data/navigation';
import type { UserProfile } from '../../../data/session';

export const WAREHOUSE_USER: UserProfile = {
  name: 'คุณประเสริฐ ใจงาม',
  role: 'WAREHOUSE_OFFICER',
  roleTh: 'เจ้าหน้าที่คลัง (Warehouse officer)',
  scopeLabel: 'เห็นเฉพาะข้อมูล รพ.สมุทรปราการ',
  hospitalLabel: 'โรงพยาบาลสมุทรปราการ',
  initial: 'ป',
};

/** Spec §15.1 UI catalogue, filtered for WAREHOUSE_OFFICER. */
export const WAREHOUSE_NAV: NavItem[] = [
  { th: 'ภาพรวม', en: 'Dashboard', icon: 'grid', active: false, badge: '' },
  { th: 'ติดตามการขนส่ง', en: 'Transport tracking', icon: 'truck', active: true, badge: '3', badgeTone: 'grey' },
  { th: 'เหตุฉุกเฉิน · ชุดยา', en: 'Incidents & kits', icon: 'siren', active: false, badge: '' },
  { th: 'พิมพ์เอกสาร', en: 'Documents', icon: 'printer', active: false, badge: '' },
];

export const WAREHOUSE_NOTIFICATIONS = [
  { drug: 'TR-2026-000334 ถึงปลายทาง · รอยืนยันรับ', time: '18:58' },
  { drug: 'TR-2026-000339 รพ.บางเสาธง ขอยกเลิก', time: '18:30' },
  { drug: 'TR-2026-000341 มีรูปรอซิงก์', time: '16:30' },
  { drug: 'TR-2026-000336 ออกเดินทาง', time: '18:40' },
  { drug: 'TR-2026-000338 รอขึ้นรถ', time: '13:20' },
  { drug: 'TR-2026-000339 รอขึ้นรถ', time: '13:20' },
];
