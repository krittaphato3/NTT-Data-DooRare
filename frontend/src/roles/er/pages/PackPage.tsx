import { PackPanel } from '../components/PackPanel';
import { IncidentFrame } from '../components/IncidentFrame';
import type { RoleCode } from '../../../lib/rbac';

/** ER page: จัดชุด. */
export function PackPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  return (
    <IncidentFrame role={role} title="จัดชุด" titleEn="/ Kit assembly" breadcrumb="จัดชุด" subtitle="UI-13 · จัดชุดจากของแยกตามสูตร แล้วยืนยันเพื่อตัดสต็อก">
      {({ access }) => <PackPanel access={access} />}
    </IncidentFrame>
  );
}
