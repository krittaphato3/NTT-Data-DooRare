/** Signed-in Hospital Admin (HOSPITAL_ADMIN) — own-hospital scope only (SEC-002, Q-19). */

import type { UserProfile } from '../../../data/session';

/** Mock identity from `Mockups/Dashboard - Pharmacist Hospital (2)/Main.dc.html` ROLES map. */
export const HOSPITAL_ADMIN_USER: UserProfile = {
  name: 'ภญ.อรอุมา พรหมมา',
  role: 'HOSPITAL_ADMIN',
  roleTh: 'ผู้ดูแลโรงพยาบาล (Hospital Admin)',
  scopeLabel: 'เห็นเฉพาะข้อมูล รพ.สมุทรปราการ',
  hospitalLabel: 'โรงพยาบาลสมุทรปราการ',
  initial: 'อ',
};

export interface AdminNotification {
  drug: string;
  time: string;
}

/** Unread items for the top-bar bell — administration events only, never clinical stock data. */
export const ADMIN_NOTIFICATIONS: AdminNotification[] = [
  { drug: 'คำเชิญผู้ใช้รอยืนยัน 2 รายการ', time: '08:40' },
  { drug: 'ผู้ใช้ถูกระงับการใช้งาน 1 รายการ', time: 'เมื่อวาน' },
  { drug: 'ผู้ใช้ใหม่เข้าสู่ระบบครั้งแรก 3 รายการ', time: '13 ต.ค.' },
];
