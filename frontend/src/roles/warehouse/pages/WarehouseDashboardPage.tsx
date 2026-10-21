import { mockFallbackEnabled } from '../../../services/dataSource';
import { useTick } from '../../../lib/time';
import { WhActivityPanel } from '../components/WhActivityPanel';
import { WhKitStockPanel } from '../components/WhKitStockPanel';
import { WhKpiRow } from '../components/WhKpiRow';
import { WhPageHeader } from '../components/WhPageHeader';
import { WhTodoPanel } from '../components/WhTodoPanel';
import { WhTransportPanel } from '../components/WhTransportPanel';
import { URGENT_SECONDS } from '../data/dashboard';
import { useTransport } from '../data/useTransport';
import '../dashboard.css';

/** mm:ss countdown for the urgent lender request. */
function mmss(s: number): string {
  const v = Math.max(0, s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(v / 60))}:${p(v % 60)}`;
}

/** UI-01 Dashboard for WAREHOUSE_OFFICER: today's warehouse work at a glance (own hospital only). */
export function WarehouseDashboardPage() {
  const tick = useTick();
  const tr = useTransport();
  const urgentLeft = mmss(URGENT_SECONDS - tick);
  return (
    <>
      <WhPageHeader />
      <WhKpiRow urgentLeft={urgentLeft} shipments={tr.source === 'live' ? tr.shipments : undefined} />
      <section className="rowcards">
        <WhTodoPanel urgentLeft={urgentLeft} shipments={tr.source === 'live' ? tr.shipments : undefined} />
        <WhTransportPanel shipments={tr.source === 'live' ? tr.shipments : undefined} />
      </section>
      <section className="rowcards">
        {mockFallbackEnabled() && <WhKitStockPanel />}
        <WhActivityPanel history={tr.source === 'live' ? tr.history : undefined} />
      </section>
    </>
  );
}
