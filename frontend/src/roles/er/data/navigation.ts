/**
 * ER (ER_STAFF) sidebar: the ER-owned pages, built from the RBAC matrix (UI codes per spec §15.1).
 * Same pattern as `roles/driver/data/navigation.ts` and `roles/warehouse/data/navigation.ts`.
 * To add an ER page: extend `ErPage`, add it to `ER_ITEMS`, then render it in `App.tsx`.
 */
import type { IconName } from '../../../components/common/icons';
import type { ShellNavEntry } from '../../../data/navigation';
import { withRole } from '../../../data/navigation';

export type ErPage = 'incident';

interface ErNavDef {
  page: ErPage;
  th: string;
  en: string;
  ui: string;
  icon: IconName;
  badge?: string;
  badgeTone?: 'red' | 'neutral';
}

const ER_ITEMS: ErNavDef[] = [
  { page: 'incident', th: 'เหตุฉุกเฉิน · ชุดยา', en: 'Incidents & kits', ui: 'UI-11 – UI-13', icon: 'siren' },
];

export const ER_NAV_GROUP = 'งานฉุกเฉิน (ER)';

/** `?page=<page>&role=er` — the URL of an ER page. */
export function erHref(page: ErPage): string {
  return withRole(`?page=${page}`, 'ER_STAFF');
}

export function getErNav(active: ErPage): ShellNavEntry[] {
  return [
    { kind: 'group', th: ER_NAV_GROUP },
    ...ER_ITEMS.map((d): ShellNavEntry => ({
      key: d.page,
      th: d.th,
      en: d.en,
      ui: d.ui,
      icon: d.icon,
      href: erHref(d.page),
      active: d.page === active,
      badge: d.badge ?? '',
      badgeTone: d.badgeTone ?? 'neutral',
    })),
  ];
}
