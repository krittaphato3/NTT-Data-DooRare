import { TransportTrackingPage } from '../../warehouse/pages/TransportTrackingPage';
import { WhDrugsPage } from '../../warehouse/pages/WhDrugsPage';
import { ER_HOME_HREF } from '../../../data/navigation';
import type { ErPage } from '../data/navigation';
import { BorrowPage } from './BorrowPage';
import { ErDashboardPage } from './ErDashboardPage';
import { ErDocumentsPage } from './ErDocumentsPage';
import { IncidentListPage } from './IncidentListPage';
import { PackPage } from './PackPage';
import { PlanPage } from './PlanPage';
import { SummaryPage } from './SummaryPage';

/** Renders the ER page named by `?page=`. */
export function ErPageSwitch({ page }: { page: ErPage }) {
  switch (page) {
    case 'incidents':
      return <IncidentListPage />;
    case 'plan':
      return <PlanPage />;
    case 'borrow':
      return <BorrowPage />;
    case 'pack':
      return <PackPage />;
    case 'summary':
      return <SummaryPage />;
    case 'documents':
      return <ErDocumentsPage />;
    case 'transport':
      return <TransportTrackingPage role="ER_STAFF" />;
    case 'drugs':
      return <WhDrugsPage homeHref={ER_HOME_HREF} />;
    default:
      return <ErDashboardPage />;
  }
}
