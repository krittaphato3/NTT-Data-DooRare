import { useState } from 'react';
import type { ReactNode } from 'react';
import { IncidentFrame } from '../components/IncidentFrame';
import { IncidentTabs } from '../components/IncidentTabs';
import type { IncidentTab } from '../components/IncidentTabs';
import { BorrowPanel } from '../components/BorrowPanel';
import { PackPanel } from '../components/PackPanel';
import { PlanPanel } from '../components/PlanPanel';
import { SummaryPanel } from '../components/SummaryPanel';
import type { RoleCode } from '../../../lib/rbac';

/** Keeps an inactive tab mounted (so its state survives a tab switch) but hidden. */
function TabSlot({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>;
}

/**
 * UI-11 – UI-13 combined incident console, tabbed. ER works through one page per step
 * (`ErPageSwitch`); this single page is what the pharmacist and hospital admin open (view-only,
 * gated by `getIncidentAccess`).
 */
export function IncidentConsolePage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [activeTab, setActiveTab] = useState<IncidentTab>('plan');

  return (
    <IncidentFrame role={role} title="เหตุฉุกเฉินหมู่" titleEn="/ Incident console" breadcrumb="เหตุฉุกเฉิน" onViewBorrow={() => setActiveTab('borrow')}>
      {({ scenario, setScenario, access }) => (
        <>
          <IncidentTabs active={activeTab} onChange={setActiveTab} />
          <TabSlot active={activeTab === 'plan'}>
            <PlanPanel scenario={scenario} setScenario={setScenario} access={access} />
          </TabSlot>
          <TabSlot active={activeTab === 'borrow'}>
            <BorrowPanel />
          </TabSlot>
          <TabSlot active={activeTab === 'pack'}>
            <PackPanel access={access} />
          </TabSlot>
          <TabSlot active={activeTab === 'summary'}>
            <SummaryPanel access={access} />
          </TabSlot>
        </>
      )}
    </IncidentFrame>
  );
}
