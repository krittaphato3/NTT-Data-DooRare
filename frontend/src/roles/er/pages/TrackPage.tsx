import { useState } from 'react';
import { BorrowPanel } from '../components/BorrowPanel';
import { IncidentFrame } from '../components/IncidentFrame';
import { IncidentTabs } from '../components/IncidentTabs';
import type { IncidentTab } from '../components/IncidentTabs';
import { PackPanel } from '../components/PackPanel';
import type { RoleCode } from '../../../lib/rbac';

const TRACK_TABS: IncidentTab[] = ['borrow', 'pack'];

/** After the requests are sent: follow the lenders' replies and assemble the kits, on one page. */
export function TrackPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const [tab, setTab] = useState<IncidentTab>('borrow');

  return (
    <IncidentFrame
      role={role}
      title="ติดตามคำขอและจัดชุด"
      titleEn="/ Track & pack"
      breadcrumb="ติดตามคำขอและจัดชุด"
      subtitle="UI-11 · UI-13 · ดูคำตอบจากผู้ให้ยืม และจัดชุดจากของแยกในหน้าเดียว"
      onViewBorrow={() => setTab('borrow')}
    >
      {({ access }) => (
        <>
          <IncidentTabs tabs={TRACK_TABS} active={tab} onChange={setTab} />
          {tab === 'borrow' ? <BorrowPanel /> : <PackPanel access={access} />}
        </>
      )}
    </IncidentFrame>
  );
}
