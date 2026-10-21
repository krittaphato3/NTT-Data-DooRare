import type { RoleCode } from '../../../lib/rbac';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { AlertsPanel } from '../components/AlertsPanel';
import { AgentSummaryPanel } from '../components/AgentSummaryPanel';
import { BottomRow } from '../components/BottomRow';
import { KpiRow } from '../components/KpiRow';
import { MiddleRow } from '../components/MiddleRow';
import { PageHeader } from '../components/PageHeader';
import { RequestStatusPanel } from '../components/RequestStatusPanel';

interface DashboardPageProps {
  isAdmin: boolean;
  query: string;
  hospital: string;
  onHospital: (v: string) => void;
  /** Role viewing the page; every role other than the owner is gated through `lib/rbac.ts`. */
  role?: RoleCode;
  /** Hospital Admin opens the dashboard with the selector pinned to its own hospital. */
  hospitalLocked?: boolean;
}

/**
 * Pharmacist landing page: KPIs, alerts, request status and network overview.
 * HOSPITAL_ADMIN renders the same screen read-only (Phase 2B).
 */
export function DashboardPage({ isAdmin, query, hospital, onHospital, role = 'PHARMACIST', hospitalLocked = false }: DashboardPageProps) {
  return (
    <>
      <PageHeader
        isAdmin={isAdmin}
        hospital={hospital}
        onHospital={onHospital}
        role={role}
        hospitalLocked={hospitalLocked}
      />
      <KpiRow />
      <section className="rowcards">
        <AlertsPanel query={query} hospital={hospital} role={role} />
        <RequestStatusPanel query={query} hospital={hospital} role={role} />
      </section>
      {/* Nearby hospitals, work history, near-expiry lots, network activity and the Agent summary have no API yet: demo mode only. */}
      {mockFallbackEnabled() && (
        <>
          <MiddleRow role={role} />
          <BottomRow />
          <AgentSummaryPanel />
        </>
      )}
    </>
  );
}
