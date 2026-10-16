/** App-shell navigation catalogue — verbatim ground truth from
 * `mockups/Dashboard - Pharmacist Hospital (2)/Main.dc.html` (`NAV` map +
 * `ROLES` nav lists, spec §15.1). Shared chrome must not pick a role itself;
 * callers pass the resolved list as props (see `Sidebar items`).
 */

import type { IconName } from '../components/common/icons';

export type BadgeTone = 'red' | 'neutral';

export interface ShellNavItem {
  key: string;
  th: string;
  en: string;
  /** UI catalogue code shown as the link `title` (spec §15.1). */
  ui: string;
  icon: IconName;
  href: string;
  active: boolean;
  badge: string;
  badgeTone: BadgeTone;
}

export interface ShellNavGroup {
  kind: 'group';
  th: string;
}

export type ShellNavEntry = ShellNavItem | ShellNavGroup;

interface NavDef {
  th: string;
  en: string;
  ui: string;
  icon: IconName;
  href: string;
  badge: string;
  red: boolean;
}

/** Full UI catalogue (12 entries) — mockup `NAV` map verbatim. */
const CATALOGUE: Record<string, NavDef> = {
  dash: { th: 'ภาพรวม', en: 'Dashboard', ui: 'UI-01', icon: 'grid', href: 'Main.dc.html', badge: '', red: false },
  alerts: { th: 'แจ้งเตือนสต็อก', en: 'Stock alerts · Forecast', ui: 'UI-02 · UI-03', icon: 'bell', href: 'Stock.dc.html', badge: '8', red: true },
  req: { th: 'คำขอยืมของเรา', en: 'Borrow requests', ui: 'UI-04 · UI-05 · UI-10', icon: 'inbox', href: 'Requests.dc.html', badge: '1', red: true },
  lend: { th: 'คิวตอบคำขอยืม', en: 'Lender queue', ui: 'UI-06', icon: 'hand', href: 'RequestsLender.dc.html', badge: '2', red: true },
  exp: { th: 'ยาใกล้หมดอายุ', en: 'Near-expiry review', ui: 'UI-07', icon: 'calx', href: '#', badge: '3', red: false },
  pool: { th: 'คลังกลาง · แผนจัดสรร', en: 'Pool & allocation', ui: 'UI-08 · UI-09', icon: 'layers', href: '#', badge: '1', red: false },
  inc: { th: 'เหตุฉุกเฉิน · ชุดยา', en: 'Incidents & kits', ui: 'UI-11 – UI-13', icon: 'siren', href: '#', badge: '', red: false },
  tr: { th: 'ติดตามการขนส่ง', en: 'Transport tracking', ui: 'UI-14', icon: 'truck', href: 'Shipments.dc.html', badge: '3', red: false },
  doc: { th: 'พิมพ์เอกสาร', en: 'Documents', ui: 'UI-15', icon: 'printer', href: '#', badge: '', red: false },
  rep: { th: 'รายงานมูลค่า', en: 'Reports · Value', ui: 'UI-19', icon: 'chart', href: '#', badge: '', red: false },
  adm: { th: 'ภาพรวมระบบ', en: 'Admin Dashboard', ui: 'ADM-01', icon: 'grid', href: '?page=admin', badge: '', red: false },
  hosp: { th: 'โรงพยาบาลในเครือข่าย', en: 'Hospitals & Deliveries', ui: 'ADM-02', icon: 'hosp', href: '?page=admin&tab=hospitals', badge: '12', red: false },
  acct: { th: 'จัดการบัญชีผู้ใช้', en: 'Account Management', ui: 'ADM-03', icon: 'users', href: '?page=admin&tab=accounts', badge: '', red: false },
  cfg: { th: 'ตั้งค่า · Kill switch', en: 'Configuration', ui: 'UI-17', icon: 'gear', href: '#', badge: '', red: false },
  aud: { th: 'บันทึกตรวจสอบ', en: 'Audit log', ui: 'UI-18', icon: 'shield', href: '#', badge: '', red: false },
};

/** Role → nav keys (`'|'` renders the admin group header) — mockup `ROLES` verbatim. */
export const ROLE_NAV: Record<string, string[]> = {
  PHARMACIST: ['dash', 'alerts', 'req', 'lend', 'exp', 'pool', 'inc', 'tr', 'doc', 'rep'],
  PROCUREMENT_OFFICER: ['dash', 'alerts', 'req', 'doc', 'rep'],
  WAREHOUSE_OFFICER: ['dash', 'tr', 'inc', 'doc'],
  DRIVER: ['tr'],
  HOSPITAL_ADMIN: ['adm', 'hosp', 'acct', '|', 'cfg', 'aud'],
  SYSTEM_ADMIN: ['adm', 'hosp', 'acct', '|', 'cfg', 'aud'],
  ADMIN: ['adm', 'hosp', 'acct', '|', 'cfg', 'aud'],
};

export const ADMIN_GROUP_LABEL = 'ผู้ดูแลระบบ';

/**
 * Resolve a role's nav keys into renderable entries. `activeKey` marks the
 * current page (today the dashboard shell renders `dash` active).
 */
export function getNavForRole(role: string, activeKey = 'dash'): ShellNavEntry[] {
  const keys = ROLE_NAV[role] ?? ROLE_NAV.PHARMACIST;
  return keys.map((k): ShellNavEntry => {
    if (k === '|') return { kind: 'group', th: ADMIN_GROUP_LABEL };
    const d = CATALOGUE[k];
    return {
      key: k,
      th: d.th,
      en: d.en,
      ui: d.ui,
      icon: d.icon,
      href: d.href,
      active: k === activeKey,
      badge: d.badge,
      badgeTone: d.red ? 'red' : 'neutral',
    };
  });
}

/** Pharmacist shell menu (10 entries) — what `App` passes to `Sidebar`. */
export const NAV: ShellNavItem[] = getNavForRole('PHARMACIST').filter(
  (e): e is ShellNavItem => !('kind' in e),
);
