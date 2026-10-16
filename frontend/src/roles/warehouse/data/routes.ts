/** WH page URLs (`?role=warehouse&page=…`). Pages not built yet map to `undefined` so links render disabled. */
export type WarehousePage = 'dashboard' | 'transport' | 'kit' | 'docs' | 'stock' | 'requests' | 'expiry' | 'drugs';

const BUILT: Partial<Record<WarehousePage, string>> = {
  dashboard: '?role=warehouse',
  transport: '?role=warehouse&page=transport',
};

export const whHref = (page: WarehousePage): string | undefined => BUILT[page];
