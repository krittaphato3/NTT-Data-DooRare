/** WH page URLs (`?role=warehouse&page=…`). Pages not built yet map to `undefined` so links render disabled. */
export type WarehousePage = 'dashboard' | 'inbox' | 'transport' | 'kit' | 'docs' | 'stock' | 'requests' | 'expiry' | 'drugs';

const BUILT: Partial<Record<WarehousePage, string>> = {
  dashboard: '?role=warehouse',
  inbox: '?role=warehouse&page=inbox',
  kit: '?role=warehouse&page=kit',
  docs: '?role=warehouse&page=docs',
  stock: '?role=warehouse&page=stock',
  requests: '?role=warehouse&page=requests',
  expiry: '?role=warehouse&page=expiry',
  drugs: '?role=warehouse&page=drugs',
  transport: '?role=warehouse&page=transport',
};

export const whHref = (page: WarehousePage): string | undefined => BUILT[page];
