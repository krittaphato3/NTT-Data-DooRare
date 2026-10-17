import { SummaryPanel } from '../components/SummaryPanel';
import { IncidentFrame } from '../components/IncidentFrame';
import type { RoleCode } from '../../../lib/rbac';

/** ER page: สรุปและปิดเหตุการณ์. */
export function SummaryPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  return (
    <IncidentFrame role={role} title="สรุปและปิดเหตุการณ์" titleEn="/ Summary & close" breadcrumb="สรุปและปิดเหตุการณ์" subtitle="F3 §11 · บันทึกจำนวนที่ใช้จริง คืนของ และขอปิดเหตุการณ์">
      {({ access }) => <SummaryPanel access={access} />}
    </IncidentFrame>
  );
}
