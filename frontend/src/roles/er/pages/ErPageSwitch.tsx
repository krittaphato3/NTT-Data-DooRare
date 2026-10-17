import { TransportTrackingPage } from '../../warehouse/pages/TransportTrackingPage';
import { WhDrugsPage } from '../../warehouse/pages/WhDrugsPage';
import { ER_HOME_HREF } from '../../../data/navigation';
import type { ErPage } from '../data/navigation';
import { ErDashboardPage } from './ErDashboardPage';
import { ErDocumentsPage } from './ErDocumentsPage';
import { IncidentListPage } from './IncidentListPage';
import { IncidentFlowPage } from './IncidentFlowPage';
import { SummaryPage } from './SummaryPage';
import { TrackPage } from './TrackPage';

/** Renders the ER page named by `?page=`. */
export function ErPageSwitch({ page }: { page: ErPage }) {
  switch (page) {
    case 'incidents':
      return <IncidentListPage />;
    case 'flow':
      return <IncidentFlowPage />;
    case 'track':
      return <TrackPage />;
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
