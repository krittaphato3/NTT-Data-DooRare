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
import { mockFallbackEnabled } from '../../../services/dataSource';
import { LiveConsole } from '../live/LiveConsole';

/** Keeps an inactive tab mounted (so its state survives a tab switch) but hidden. */
function TabSlot({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>;
}

/**
 * UI-11 – UI-13 combined incident console, tabbed. ER works through one page per step
 * (`ErPageSwitch`); this single page is what the pharmacist and hospital admin open (view-only,
 * gated by `getIncidentAccess`).
 */
function MockIncidentConsole({ role }: { role: RoleCode }) {
  const [activeTab, setActiveTab] = useState<IncidentTab>('plan');

  return (
    <div className="er-page">
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
    </div>
  );
}

/** Live console (plan, borrowing, packing, summary of a chosen incident); the sample-data prototype only in demo mode (`?mock=1`). */
export function IncidentConsolePage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  return mockFallbackEnabled() ? <MockIncidentConsole role={role} /> : <LiveConsole role={role} />;
}
