import { AlertsPanel } from '../components/AlertsPanel';
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
}

/** Pharmacist landing page: KPIs, alerts, request status and network overview. */
export function DashboardPage({ isAdmin, query, hospital, onHospital }: DashboardPageProps) {
  return (
    <>
      <PageHeader isAdmin={isAdmin} hospital={hospital} onHospital={onHospital} />
      <KpiRow />
      <section className="rowcards">
        <AlertsPanel query={query} hospital={hospital} />
        <RequestStatusPanel query={query} hospital={hospital} />
      </section>
      <MiddleRow />
      <BottomRow />
    </>
  );
}
