/** Signed-in user + login-session data for the app shell (shared across roles). */

export interface SessionRow {
  date: string;
  time: string;
  icon: string;
  browser: string;
  os: string;
  ip: string;
  loc: string;
  st: string;
  stCls: string;
  current: boolean;
  active: boolean;
  note: string;
}

export const USER = {
  name: 'ภก.ณัฐวุฒิ ศรีสุข',
  role: 'PHARMACIST',
  roleTh: 'เภสัชกร (Pharmacist)',
  scopeLabel: 'Viewing as: รพ.สมุทรปราการ',
  hospitalLabel: 'โรงพยาบาลสมุทรปราการ',
  initial: 'ณ',
};

export const SESSIONS: SessionRow[] = [
  { date: '13 ต.ค. 69', time: '08:31', icon: 'monitor', browser: 'Chrome 129', os: 'Windows 11', ip: '10.24.6.18', loc: 'สมุทรปราการ (เครือข่าย รพ.)', st: 'Success', stCls: 'st-approved', current: true, active: false, note: '' },
  { date: '13 ต.ค. 69', time: '07:12', icon: 'tablet', browser: 'Safari', os: 'iPadOS 18', ip: '10.24.7.40', loc: 'สมุทรปราการ (เครือข่าย รพ.)', st: 'Success', stCls: 'st-approved', current: false, active: true, note: '' },
  { date: '12 ต.ค. 69', time: '21:47', icon: 'phone', browser: 'Chrome', os: 'Android 14', ip: '110.168.42.7', loc: 'บางพลี, สมุทรปราการ', st: 'Success', stCls: 'st-approved', current: false, active: true, note: '' },
  { date: '12 ต.ค. 69', time: '21:45', icon: 'phone', browser: 'Chrome', os: 'Android 14', ip: '110.168.42.7', loc: 'บางพลี, สมุทรปราการ', st: 'Failed', stCls: 'st-rejected', current: false, active: false, note: 'รหัสผ่านไม่ถูกต้อง' },
  { date: '11 ต.ค. 69', time: '02:13', icon: 'monitor', browser: 'Firefox 130', os: 'Linux', ip: '185.220.101.4', loc: 'ไม่ทราบ (ต่างประเทศ)', st: 'Failed', stCls: 'st-rejected', current: false, active: false, note: 'ตำแหน่งผิดปกติ · ถูกบล็อก' },
];
