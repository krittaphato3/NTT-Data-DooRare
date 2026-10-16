/** Warehouse officer sidebar: the WH pages agreed from the RBAC matrix (UI codes per spec §15.1). */
import type { IconName } from '../../../components/common/icons';
import type { ShellNavEntry } from '../../../data/navigation';
import { whHref } from './routes';
import type { WarehousePage } from './routes';

interface WhNavDef {
  page: WarehousePage;
  th: string;
  en: string;
  ui: string;
  icon: IconName;
  badge?: string;
  badgeTone?: 'red' | 'neutral';
}

const OPERATE: WhNavDef[] = [
  { page: 'dashboard', th: 'ภาพรวม', en: 'Dashboard', ui: 'UI-01', icon: 'grid' },
  { page: 'inbox', th: 'กล่องงานเข้า', en: 'Work inbox (F1 · F2 · F3)', ui: 'WH-IN', icon: 'inbox', badge: '5', badgeTone: 'red' },
  { page: 'transport', th: 'ติดตามการขนส่ง', en: 'Transport tracking', ui: 'UI-14', icon: 'truck', badge: '3' },
  { page: 'kit', th: 'เตรียมชุดยา · เหตุฉุกเฉิน', en: 'Kits & incidents (F3)', ui: 'UI-13', icon: 'siren' },
  { page: 'docs', th: 'พิมพ์เอกสาร', en: 'Documents', ui: 'UI-15', icon: 'printer' },
];

/** RBAC 👁: view-only pages. */
const VIEW_ONLY: WhNavDef[] = [
  { page: 'stock', th: 'สต็อก · ผลทำนาย · Agent', en: 'Stock, forecast & Agent', ui: 'UI-02 · UI-03', icon: 'bell' },
  { page: 'requests', th: 'คำขอยืม', en: 'Borrow requests', ui: 'UI-05', icon: 'inbox' },
  { page: 'expiry', th: 'ยาใกล้หมดอายุ', en: 'Near-expiry (F2)', ui: 'UI-07 · UI-08 · UI-09', icon: 'calx' },
  { page: 'drugs', th: 'ข้อมูลยา · รหัสยา', en: 'Drug master & mapping', ui: 'UI-16', icon: 'layers' },
];

export const WH_NAV_GROUPS = { operate: 'ปฏิบัติงาน', view: 'ดูข้อมูล (อ่านอย่างเดียว)' } as const;

/** Resolve the WH sidebar. Pages that are not built yet get `#` (inert link). */
export function getWarehouseNav(active: WarehousePage): ShellNavEntry[] {
  const item = (d: WhNavDef): ShellNavEntry => ({
    key: d.page,
    th: d.th,
    en: d.en,
    ui: d.ui,
    icon: d.icon,
    href: whHref(d.page) ?? '#',
    active: d.page === active,
    badge: d.badge ?? '',
    badgeTone: d.badgeTone ?? 'neutral',
  });
  return [
    { kind: 'group', th: WH_NAV_GROUPS.operate },
    ...OPERATE.map(item),
    { kind: 'group', th: WH_NAV_GROUPS.view },
    ...VIEW_ONLY.map(item),
  ];
}
