import type { RoleCode } from '../../../lib/rbac';
import { LiveConsole } from '../live/LiveConsole';

/**
 * UI-11 – UI-13 combined incident console, tabbed. ER works through one page per step (`ErPageSwitch`); this single page is what
 * the pharmacist and hospital admin open: the same live incidents of their own hospital, view-only (gated by `getIncidentAccess`).
 */
export function IncidentConsolePage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  return <LiveConsole role={role} />;
}
