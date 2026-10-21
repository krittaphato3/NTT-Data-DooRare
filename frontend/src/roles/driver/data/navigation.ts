import type { IconName } from '../../../components/common/icons';
import type { ShellNavEntry } from '../../../data/navigation';
import { withRole } from '../../../data/navigation';

export type DriverPage = 'transport' | 'sync' | 'docs';

interface DriverNavDef {
  page: DriverPage;
  th: string;
  en: string;
  ui: string;
  icon: IconName;
  badge?: string;
  badgeTone?: 'red' | 'neutral';
}

const DRIVER_ITEMS: DriverNavDef[] = [
  { page: 'transport', th: 'งานขนส่งของฉัน', en: 'My Deliveries · PWA', ui: 'UI-14', icon: 'truck', badge: '2', badgeTone: 'red' },
  { page: 'sync', th: 'คิวออฟไลน์ & รถขนส่ง', en: 'Offline Queue & Vehicle', ui: 'NFR-011', icon: 'sync' },
  { page: 'docs', th: 'เอกสารใบนำส่ง', en: 'Transport Slips', ui: 'UI-15', icon: 'printer' },
];

export function driverHref(page: DriverPage): string {
  if (page === 'transport') return withRole('?page=transport', 'DRIVER');
  return withRole(`?page=${page}`, 'DRIVER');
}

export function getDriverNav(active: DriverPage): ShellNavEntry[] {
  return [
    { kind: 'group', th: 'งานคนขับ (Driver)' },
    ...DRIVER_ITEMS.map((d): ShellNavEntry => ({
      key: d.page,
      th: d.th,
      en: d.en,
      ui: d.ui,
      icon: d.icon,
      href: driverHref(d.page),
      active: d.page === active,
      badge: d.badge ?? '',
      badgeTone: d.badgeTone ?? 'neutral',
    })),
  ];
}
