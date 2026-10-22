import { useState } from 'react';
import type { RoleCode } from '../../../lib/rbac';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { ViewOnlyBanner } from '../components/ViewOnlyBanner';
import { getIncidentAccess } from '../data/access';
import { IncidentPicker } from './IncidentPicker';
import { LiveSummaryPanel } from './LiveSummary';
import { readParam } from '../data/navigation';
import { useIncidentList } from './hooks';

/** ER page: สรุปและปิดเหตุการณ์ — pick an incident, record actual use, request / sign the close. */
export function LiveSummaryPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const list = useIncidentList('all');
  const [picked, setPicked] = useState<string | undefined>(() => readParam('incident'));
  const items = list.items.filter((i) => i.status !== 'CANCELLED');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="สรุปและปิดเหตุการณ์" />
      {!access.mayWrite && <ViewOnlyBanner />}
      <ErPageHeading title="สรุปและปิดเหตุการณ์" titleEn="/ Summary & close" subtitle="F3 §11 · บันทึกจำนวนที่ใช้จริง ดูยืม-คืนต่อโรงพยาบาล และขอปิดเหตุการณ์ (ER + เภสัชกรลงนามร่วม)" />
      <IncidentPicker items={items} value={picked} onChange={setPicked} />
      {picked && <LiveSummaryPanel incidentId={picked} role={role} mayWrite={access.mayWrite} onChanged={list.reload} />}
    </div>
  );
}
