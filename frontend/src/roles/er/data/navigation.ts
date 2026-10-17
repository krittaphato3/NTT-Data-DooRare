/**
 * ER (ER_STAFF) sidebar: the ER-owned pages, built from the RBAC matrix (UI codes per spec §15.1).
 * Same pattern as `roles/driver/data/navigation.ts` and `roles/warehouse/data/navigation.ts`.
 * To add an ER page: extend `ErPage`, add it to `ER_ITEMS`, then render it in `pages/ErPageSwitch.tsx`.
 */
import type { IconName } from '../../../components/common/icons';
import type { ShellNavEntry } from '../../../data/navigation';
import { withRole } from '../../../data/navigation';

export type ErPage =
  | 'dashboard'
  | 'incidents'
  | 'plan'
  | 'borrow'
  | 'pack'
  | 'summary'
  | 'documents'
  | 'transport'
  | 'drugs';

interface ErNavDef {
  page: ErPage;
  th: string;
  en: string;
  ui: string;
  icon: IconName;
  group: string;
  badge?: string;
  badgeTone?: 'red' | 'neutral';
}

export const ER_NAV_GROUP = 'งานฉุกเฉิน (ER)';
const DATA_GROUP = 'เอกสารและข้อมูล';

const ER_ITEMS: ErNavDef[] = [
  { page: 'dashboard', th: 'หน้าหลัก ER', en: 'ER home', ui: 'F3', icon: 'grid', group: ER_NAV_GROUP },
  { page: 'incidents', th: 'รายการเหตุการณ์', en: 'Incidents', ui: 'UI-11', icon: 'siren', group: ER_NAV_GROUP },
  { page: 'plan', th: 'แผนเวชภัณฑ์', en: 'Supply plan', ui: 'UI-12', icon: 'layers', group: ER_NAV_GROUP },
  { page: 'borrow', th: 'ยืมฉุกเฉิน', en: 'Emergency borrow', ui: 'UI-11', icon: 'hand', group: ER_NAV_GROUP, badge: '2', badgeTone: 'red' },
  { page: 'pack', th: 'จัดชุด', en: 'Kit assembly', ui: 'UI-13', icon: 'box', group: ER_NAV_GROUP, badge: '2', badgeTone: 'red' },
  { page: 'summary', th: 'สรุปและปิดเหตุการณ์', en: 'Summary & close', ui: 'F3 §11', icon: 'checkc', group: ER_NAV_GROUP },
  { page: 'documents', th: 'เอกสาร', en: 'Documents', ui: 'UI-15', icon: 'printer', group: DATA_GROUP },
  { page: 'transport', th: 'การจัดส่ง', en: 'Transport · view only', ui: 'UI-14', icon: 'truck', group: DATA_GROUP },
  { page: 'drugs', th: 'ข้อมูลยา', en: 'Drug master · view only', ui: 'ADM', icon: 'pkg', group: DATA_GROUP },
];

/** `?page=<page>&role=er` — the URL of an ER page. */
export function erHref(page: ErPage): string {
  return withRole(`?page=${page}`, 'ER_STAFF');
}

/** Page named by `?page=` (ER home when missing or unknown). */
export function erPageFromQuery(): ErPage {
  try {
    const p = new URLSearchParams(window.location.search).get('page');
    return ER_ITEMS.find((d) => d.page === p)?.page ?? 'dashboard';
  } catch {
    return 'dashboard';
  }
}

export function getErNav(active: ErPage): ShellNavEntry[] {
  const out: ShellNavEntry[] = [];
  let group = '';
  for (const d of ER_ITEMS) {
    if (d.group !== group) {
      group = d.group;
      out.push({ kind: 'group', th: group });
    }
    out.push({
      key: d.page,
      th: d.th,
      en: d.en,
      ui: d.ui,
      icon: d.icon,
      href: erHref(d.page),
      active: d.page === active,
      badge: d.badge ?? '',
      badgeTone: d.badgeTone ?? 'neutral',
    });
  }
  return out;
}
