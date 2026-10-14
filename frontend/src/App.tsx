import { useEffect, useState } from 'react';
import { Footer } from './components/layout/Footer';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { getNavForRole, NAV } from './data/navigation';
import { ALERTS } from './roles/pharmacist/data/dashboard';
import { DashboardPage } from './roles/pharmacist/pages/DashboardPage';
import { WAREHOUSE_NOTIFICATIONS, WAREHOUSE_USER } from './roles/warehouse/data/session';
import { TransportTrackingPage } from './roles/warehouse/pages/TransportTrackingPage';

const WAREHOUSE_NAV_ITEMS = getNavForRole('WAREHOUSE_OFFICER', 'tr');

/** No router yet: `?page=transport` shows the warehouse Transport tracking screen (UI-14). */
function initialPage(): 'dashboard' | 'transport' {
  try {
    return new URLSearchParams(window.location.search).get('page') === 'transport' ? 'transport' : 'dashboard';
  } catch {
    return 'dashboard';
  }
}

function initialRole(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('role') === 'Admin';
  } catch {
    return false;
  }
}

/**
 * App shell: sidebar + top bar + the active role page + footer.
 * Role pages live in `src/roles/<role>/pages/` (see src/README.md).
 */
export default function App() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [hospital, setHospital] = useState('ทุกโรงพยาบาล (12)');
  const [isAdmin] = useState(initialRole);
  const [page] = useState(initialPage);
  const ops = page === 'transport';

  // Mobile drawer: lock page scroll, close on Escape and when resizing to desktop.
  useEffect(() => {
    if (!navOpen) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const close = () => setNavOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    desktop.addEventListener('change', close);
    window.addEventListener('keydown', onKey);
    document.body.classList.add('nav-open');
    return () => {
      desktop.removeEventListener('change', close);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('nav-open');
    };
  }, [navOpen]);

  const shellClass = ['shell', collapsed ? 'shell-collapsed' : '', navOpen ? 'shell-nav-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onNavigate={() => setNavOpen(false)}
        items={ops ? WAREHOUSE_NAV_ITEMS : NAV}
      />
      {navOpen && <button className="nav-scrim" aria-label="ปิดเมนู" onClick={() => setNavOpen(false)} />}
      <div className="content">
        <TopBar
          query={query}
          onQuery={setQuery}
          isAdmin={isAdmin}
          navOpen={navOpen}
          onMenu={() => setNavOpen((v) => !v)}
          notifications={ops ? WAREHOUSE_NOTIFICATIONS : ALERTS.map((a) => ({ drug: a.drug, time: a.time }))}
          variant={ops ? 'ops' : 'pharmacist'}
          user={ops ? WAREHOUSE_USER : undefined}
        />
        <main className="mainpad">
          {ops ? <TransportTrackingPage /> : <DashboardPage isAdmin={isAdmin} query={query} hospital={hospital} onHospital={setHospital} />}
        </main>
        {!ops && <Footer isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
