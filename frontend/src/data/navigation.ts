/** App-shell navigation config. Today it lists the pharmacist role's menu. */

export interface NavItem {
  th: string;
  en: string;
  icon: string;
  active: boolean;
  badge: string;
  /** Badge colour; defaults to red (needs attention). */
  badgeTone?: 'red' | 'grey';
  href?: string;
}

export const NAV: NavItem[] = [
  { th: 'ภาพรวม', en: 'Dashboard', icon: 'grid', active: true, badge: '' },
  { th: 'สต็อกยา', en: 'Stock', icon: 'box', active: false, badge: '' },
  { th: 'คำขอยืม', en: 'Requests', icon: 'inbox', active: false, badge: '5' },
  { th: 'การจัดส่ง', en: 'Shipments', icon: 'truck', active: false, badge: '' },
  { th: 'โรงพยาบาลใกล้เคียง', en: 'Nearby Hospitals', icon: 'pin', active: false, badge: '' },
  { th: 'ยาใกล้หมดอายุ', en: 'Near-Expiry Pool', icon: 'calx', active: false, badge: '' },
  { th: 'เหตุฉุกเฉิน', en: 'Emergency', icon: 'siren', active: false, badge: '1' },
  { th: 'รายงาน', en: 'Reports', icon: 'chart', active: false, badge: '' },
  { th: 'ตั้งค่า', en: 'Settings', icon: 'gear', active: false, badge: '' },
  { th: 'เซสชันและการเข้าสู่ระบบ', en: 'Session & Login History', icon: 'shield', active: false, badge: '' },
];
