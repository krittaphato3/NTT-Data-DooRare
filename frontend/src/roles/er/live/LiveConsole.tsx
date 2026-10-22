import { useState } from 'react';
import type { RoleCode } from '../../../lib/rbac';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { IncidentTabs } from '../components/IncidentTabs';
import type { IncidentTab } from '../components/IncidentTabs';
import { ViewOnlyBanner } from '../components/ViewOnlyBanner';
import { getIncidentAccess } from '../data/access';
import { IncidentHeader, Warnings } from './IncidentHeader';
import { IncidentPicker } from './IncidentPicker';
import { LiveBorrowStatus } from './LiveBorrowStatus';
import { LivePackPanel } from './LivePack';
import { LiveSummaryPanel } from './LiveSummary';
import { LiveExtrasTable, LiveKitTable, PlanNotes } from './PlanTables';
import { useIncident, useIncidentList } from './hooks';

/**
 * UI-11 – UI-13 combined incident console, tabbed, for the pharmacist and the hospital admin. Plan, borrowing and packing are
 * view-only (ER owns them); the pharmacist signs the close together with ER staff (A12) and may record actual use.
 */
export function LiveConsole({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const list = useIncidentList('all');
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<IncidentTab>('plan');
  const { incident } = useIncident(picked, 8000);
  const mayRecord = role === 'PHARMACIST' || role === 'ER_STAFF';
  const items = list.items.filter((i) => i.status !== 'CANCELLED' || i.id === picked);
  const waiting = incident ? incident.borrowLines.reduce((n, l) => n + l.legs.filter((g) => g.status === 'SENT').length, 0) : 0;
  const packOpen = incident ? incident.kitTasks.filter((t) => t.status === 'TODO').length : 0;

  return (
    <div className="er-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErBreadcrumb role={role} label="เหตุฉุกเฉิน" />
        {!access.mayWrite && <ViewOnlyBanner />}
        <ErPageHeading title="เหตุฉุกเฉินหมู่" titleEn="/ Incident console" subtitle="ดูแผน คำขอยืม และการจัดชุดของเหตุการณ์ · ER เป็นผู้บันทึกและอนุมัติ · เภสัชกรลงนามปิดเหตุการณ์ร่วมกับ ER" />
        <IncidentPicker items={items} value={picked} onChange={setPicked} />
        {incident && (
          <>
            <IncidentHeader incident={incident} />
            <Warnings items={incident.warnings} />
            <IncidentTabs active={tab} onChange={setTab} badges={{ borrow: waiting > 0 ? String(waiting) : undefined, pack: packOpen > 0 ? String(packOpen) : undefined }} />
            {tab === 'plan' &&
              (incident.plan ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <LiveKitTable plan={incident.plan} editable={false} />
                  <LiveExtrasTable plan={incident.plan} editable={false} />
                  <PlanNotes plan={incident.plan} />
                </div>
              ) : (
                <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>ยังไม่มีแผนสำหรับเหตุนี้</div>
              ))}
            {tab === 'borrow' && <LiveBorrowStatus lines={incident.borrowLines} />}
            {tab === 'pack' && <LivePackPanel access={{ ...access, mayWrite: false }} incidentId={incident.id} showStock />}
            {tab === 'summary' && <LiveSummaryPanel incidentId={incident.id} role={role} mayWrite={mayRecord} onChanged={list.reload} />}
          </>
        )}
      </div>
    </div>
  );
}
