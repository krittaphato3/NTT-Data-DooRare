import type { UserProfile } from '../../../data/session';

/** ER staff (RBAC role 3): records incidents, approves the F3 plan and urgent borrows. Own hospital only. */
export const ER_USER: UserProfile = {
  name: 'พว.กมลชนก ใจดี',
  role: 'ER_STAFF',
  roleTh: 'พยาบาลห้องฉุกเฉิน (ER)',
  scopeLabel: 'เห็นเฉพาะข้อมูล รพ.สมุทรปราการ',
  hospitalLabel: 'โรงพยาบาลสมุทรปราการ',
  initial: 'ก',
};

export const ER_NOTIFICATIONS = [
  { drug: 'INC-2026-000015 ผู้ป่วยถึงใน 11 นาที (19:43)', time: '19:31' },
  { drug: 'BR-2026-000134 Tranexamic acid รอผู้ให้ยืมยืนยัน', time: '19:30' },
  { drug: 'Intubation Set ขาด 1 ชุด · ยืมเพิ่มแล้ว', time: '19:28' },
  { drug: 'แผน v2 รอตรวจหลังแก้จำนวนแดง 5 → 7', time: '19:27' },
];
