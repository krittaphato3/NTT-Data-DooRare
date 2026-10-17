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
  cfg: { th: 'ตั้งค่า · Kill switch', en: 'Configuration', ui: 'UI-17', icon: 'gear', href: '#', badge: '', red: false },
  aud: { th: 'บันทึกตรวจสอบ', en: 'Audit log', ui: 'UI-18', icon: 'shield', href: '#', badge: '', red: false },
  // Derived entry (no UI-nn code in spec §15.1): Hospital Admin user management, API-AD-006/007.
  usr: { th: 'จัดการผู้ใช้', en: 'User management', ui: '—', icon: 'users', href: '#', badge: '', red: false },
};

/** Role → nav keys (`'|'` renders the admin group header) — mockup `ROLES` verbatim. */
export const ROLE_NAV: Record<string, string[]> = {
  PHARMACIST: ['dash', 'alerts', 'req', 'lend', 'exp', 'pool', 'inc', 'tr', 'doc', 'rep'],
  PROCUREMENT_OFFICER: ['dash', 'alerts', 'req', 'doc', 'rep'],
  WAREHOUSE_OFFICER: ['dash', 'tr', 'inc', 'doc'],
  DRIVER: ['tr'],
  // RBAC 5.3: ER works in F3 only (no F1/F2, no transport list).
  ER_STAFF: ['inc'],
  HOSPITAL_ADMIN: ['dash', 'alerts', 'req', 'lend', 'exp', 'pool', 'inc', 'tr', 'doc', 'rep', '|', 'usr', 'cfg', 'aud'],
};

export const ADMIN_GROUP_LABEL = 'ผู้ดูแลระบบ';

/**
 * Query value that selects the Hospital Admin shell.
 *
 * Every in-app href must carry it: sidebar links are plain `<a href="?page=…">` navigations, and a
 * relative query-only href REPLACES the whole query string — so without the role in the href the
 * shell silently falls back to the default role (PHARMACIST) on every click.
 */
export const HOSPITAL_ADMIN_ROLE_QUERY = 'hospital-admin';

/** First page of the Hospital Admin shell — the sidebar target and the breadcrumb "home". */
export const HOSPITAL_ADMIN_HOME_HREF = `?page=users&role=${HOSPITAL_ADMIN_ROLE_QUERY}`;
export const DRIVER_ROLE_QUERY = 'driver';
export const DRIVER_HOME_HREF = `?page=transport&role=${DRIVER_ROLE_QUERY}`;
export const ER_ROLE_QUERY = 'er';
/** ER has no dashboard (F3 only): its home is the incident console. */
export const ER_HOME_HREF = `?page=incident&role=${ER_ROLE_QUERY}`;

/**
 * Roles that are not the implicit default and therefore must be carried in every in-app href.
 * A relative `?page=…` link replaces the whole query string, so a role whose shell is selected by a
 * query param would otherwise be dropped on each click (and on browser back/forward).
 */
export const ROLE_QUERY: Record<string, string> = {
  HOSPITAL_ADMIN: HOSPITAL_ADMIN_ROLE_QUERY,
  WAREHOUSE_OFFICER: 'warehouse',
  DRIVER: DRIVER_ROLE_QUERY,
  ER_STAFF: ER_ROLE_QUERY,
};

/**
 * Append the role query param to an href when the role is not the default.
 * Shared by the shell chrome and by every page that renders its own breadcrumb, so no link is
 * hand-written and none can silently drop the role.
 */
export function withRole(href: string, role: string): string {
  const r = ROLE_QUERY[role];
  if (!r || href === '#' || href.includes(`role=${r}`)) return href;
  return `${href}${href.includes('?') ? '&' : '?'}role=${r}`;
}

/**
 * Dashboard href for a role — the breadcrumb "home" a page links back to.
 * The default shell's dashboard is `/`; a role selected by a query param needs it appended.
 */
export function homeHrefFor(role: string): string {
  if (role === 'DRIVER') return DRIVER_HOME_HREF;
  if (role === 'ER_STAFF') return ER_HOME_HREF;
  return withRole('/', role);
}

/**
 * Nav keys actually rendered per role.
 *
 * `ROLE_NAV.HOSPITAL_ADMIN` holds the entries the spec allows this role to reach (mockup order).
 * Phase 2A enabled the three administration pages; Phase 2B adds the operational screens, which the
 * role opens read-only (no write actions — see `lib/rbac.ts`).
 */
const VISIBLE_KEYS: Record<string, string[]> = {
  HOSPITAL_ADMIN: ['dash', 'alerts', 'req', 'lend', 'exp', 'pool', 'inc', 'tr', 'doc', 'rep', '|', 'usr', 'cfg', 'aud'],
};

/**
 * Resolve a role's nav keys into renderable entries. `activeKey` marks the
 * current page (today the dashboard shell renders `dash` active).
 */
export function getNavForRole(role: string, activeKey = 'dash'): ShellNavEntry[] {
  const keys = ROLE_NAV[role] ?? ROLE_NAV.PHARMACIST;
  const visible = VISIBLE_KEYS[role];
  const shown = visible ? keys.filter((k) => visible.includes(k)) : keys;
  return shown.map((k): ShellNavEntry => {
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
