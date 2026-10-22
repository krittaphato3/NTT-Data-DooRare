import { TransportTrackingPage } from '../../warehouse/pages/TransportTrackingPage';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { LiveErDashboard } from '../live/LiveDashboard';
import { LiveIncidentFlow } from '../live/LiveIncidentFlow';
import { LiveIncidentList } from '../live/LiveIncidentList';
import { LiveSummaryPage } from '../live/LiveSummaryPage';
import { LiveTrackPage } from '../live/LiveTrackPage';
import { WhDrugsPage } from '../../warehouse/pages/WhDrugsPage';
import { ER_HOME_HREF } from '../../../data/navigation';
import type { ErPage } from '../data/navigation';
import { ErDashboardPage } from './ErDashboardPage';
import { ErDocumentsPage } from './ErDocumentsPage';
import { IncidentListPage } from './IncidentListPage';
import { IncidentFlowPage } from './IncidentFlowPage';
import { SummaryPage } from './SummaryPage';
import { TrackPage } from './TrackPage';

/** Renders the ER page named by `?page=`: the live F3 screens, or the sample-data prototypes in demo mode (`?mock=1`). */
function pageFor(page: ErPage) {
  if (!mockFallbackEnabled()) {
    switch (page) {
      case 'incidents':
        return <LiveIncidentList />;
      case 'flow':
        return <LiveIncidentFlow />;
      case 'track':
        return <LiveTrackPage />;
      case 'summary':
        return <LiveSummaryPage />;
      case 'dashboard':
        return <LiveErDashboard />;
      default:
        break;
    }
  }
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

export function ErPageSwitch({ page }: { page: ErPage }) {
  return <div className="er-page">{pageFor(page)}</div>;
}
