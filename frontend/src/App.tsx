import { useEffect, useState } from 'react';
import { Footer } from './components/layout/Footer';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { getNavForRole } from './data/navigation';
import type { ShellNavEntry } from './data/navigation';
import { ALERTS } from './roles/pharmacist/data/dashboard';
import { DashboardPage } from './roles/pharmacist/pages/DashboardPage';
import { ReportsPage } from './roles/pharmacist/pages/ReportsPage';
import { WAREHOUSE_NOTIFICATIONS, WAREHOUSE_USER } from './roles/warehouse/data/session';
import { TransportTrackingPage } from './roles/warehouse/pages/TransportTrackingPage';
import type { TransportRole } from './roles/warehouse/pages/TransportTrackingPage';

type AppPage = 'dashboard' | 'transport' | 'report';

/**
 * No router yet: `?page=transport` shows Transport tracking (UI-14),
 * `?page=report` shows Reports & Value (UI-19).
 * `&role=pharmacist` = read-only pharmacist view, otherwise the warehouse officer view.
 */
function initialRoute(): { page: AppPage; transportRole: TransportRole } {
  try {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('page');
    let page: AppPage = 'dashboard';
    if (p === 'transport') page = 'transport';
    else if (p === 'report' || p === 'rep') page = 'report';
    return {
      page,
      transportRole: q.get('role')?.toLowerCase() === 'pharmacist' ? 'PHARMACIST' : 'WAREHOUSE_OFFICER',
    };
  } catch {
    return { page: 'dashboard', transportRole: 'WAREHOUSE_OFFICER' };
  }
}

/** Point the catalogue's mockup hrefs (`*.dc.html`) at the screens that exist in this app. */
function withLinks(items: ShellNavEntry[], role: string): ShellNavEntry[] {
  const suffix = role === 'PHARMACIST' ? '&role=pharmacist' : '';
  return items.map((e) => {
    if ('kind' in e) return e;
    if (e.key === 'tr') return { ...e, href: `?page=transport${suffix}` };
    if (e.key === 'rep') return { ...e, href: `?page=report${suffix}` };
    if (e.key === 'dash' && role === 'PHARMACIST') return { ...e, href: '/' };
    return e;
  });
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
  const [route] = useState(initialRoute);
  const onTransport = route.page === 'transport';
  const onReport = route.page === 'report';
  // The warehouse officer gets the ops top bar; the pharmacist keeps the standard shell.
  const ops = onTransport && route.transportRole === 'WAREHOUSE_OFFICER';
  const navRole = ops ? 'WAREHOUSE_OFFICER' : 'PHARMACIST';
  const activeNavKey = onTransport ? 'tr' : onReport ? 'rep' : 'dash';
  const navItems = withLinks(getNavForRole(navRole, activeNavKey), navRole);

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
        items={navItems}
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
          {onTransport ? (
            <TransportTrackingPage role={route.transportRole} />
          ) : onReport ? (
            <ReportsPage />
          ) : (
            <DashboardPage isAdmin={isAdmin} query={query} hospital={hospital} onHospital={setHospital} />
          )}
        </main>
        {!ops && <Footer isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
