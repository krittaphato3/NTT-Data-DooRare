import { useEffect, useState } from 'react';
import { Footer } from './components/layout/Footer';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { getNavForRole } from './data/navigation';
import type { ShellNavEntry } from './data/navigation';
import { USER } from './data/session';
import { ALERTS } from './roles/pharmacist/data/dashboard';
import { BorrowRequestsPage } from './roles/pharmacist/pages/BorrowRequestsPage';
import { DashboardPage } from './roles/pharmacist/pages/DashboardPage';
import { DocumentsPage } from './roles/pharmacist/pages/DocumentsPage';
import { IncidentConsolePage } from './roles/pharmacist/pages/IncidentConsolePage';
import { LenderQueuePage } from './roles/pharmacist/pages/LenderQueuePage';
import { NearExpiryPage } from './roles/pharmacist/pages/NearExpiryPage';
import { PoolAllocationPage } from './roles/pharmacist/pages/PoolAllocationPage';
import { ReportsPage } from './roles/pharmacist/pages/ReportsPage';
import { StockAlertsPage } from './roles/pharmacist/pages/StockAlertsPage';
import { AdminPage } from './roles/admin/pages/AdminPage';
import { WAREHOUSE_NOTIFICATIONS, WAREHOUSE_USER } from './roles/warehouse/data/session';
import { TransportTrackingPage } from './roles/warehouse/pages/TransportTrackingPage';
import type { TransportRole } from './roles/warehouse/pages/TransportTrackingPage';

type Page = 'dashboard' | 'transport' | 'requests' | 'lend' | 'incident' | 'alerts' | 'report' | 'expiry' | 'pool' | 'docs' | 'admin';

/** Pharmacist on the ops-style top bar (UI-05 mockup: scope pill, agent pill, TH/EN). */
const PHARMACIST_OPS_USER = { ...USER, scopeLabel: 'เห็นเฉพาะข้อมูล รพ.สมุทรปราการ' };

/** System Admin user profile (ADM-01). */
const ADMIN_USER = {
  name: 'ดร.สมเกียรติ วิจิตรพงศ์',
  role: 'SYSTEM_ADMIN',
  roleTh: 'ผู้ดูแลระบบสูงสุด (System Admin)',
  scopeLabel: 'Viewing as: Admin – All hospitals (เขตสุขภาพที่ 6)',
  hospitalLabel: 'ทุกโรงพยาบาล (12)',
  initial: 'ส',
};

/**
 * No router yet:
 * `?page=admin` shows Admin Console (ADM-01),
 * `?page=transport` shows Transport tracking (UI-14),
 * `?page=requests` shows Borrow requests (UI-05),
 * `?page=lend` shows Lender queue (UI-06),
 * `?page=incident` shows Incident console (UI-11 – UI-13),
 * `?page=alerts` shows Stock alert queue (UI-02),
 * `?page=report` shows Reports & Value (UI-19),
 * `?page=expiry` shows Near-expiry review (UI-07),
 * `?page=pool` shows Pool & allocation (UI-08 · UI-09),
 * `?page=docs` shows Documents (UI-15).
 * `&role=pharmacist` = read-only pharmacist transport view, otherwise the warehouse officer view.
 */
function initialRoute(): { page: Page; transportRole: TransportRole } {
  try {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('page');
    const r = q.get('role')?.toLowerCase();
    let page: Page = 'dashboard';
    if (p === 'admin' || p === 'adm' || r === 'admin' || p === 'config' || p === 'cfg' || p === 'audit' || p === 'aud') page = 'admin';
    else if (p === 'transport') page = 'transport';
    else if (p === 'requests' || p === 'borrow') page = 'requests';
    else if (p === 'lend') page = 'lend';
    else if (p === 'incident' || p === 'inc') page = 'incident';
    else if (p === 'alerts') page = 'alerts';
    else if (p === 'report' || p === 'rep') page = 'report';
    else if (p === 'expiry' || p === 'exp') page = 'expiry';
    else if (p === 'pool' || p === 'alloc') page = 'pool';
    else if (p === 'docs' || p === 'doc') page = 'docs';
    return {
      page,
      transportRole: q.get('role')?.toLowerCase() === 'pharmacist' ? 'PHARMACIST' : 'WAREHOUSE_OFFICER',
    };
  } catch {
    return { page: 'dashboard', transportRole: 'WAREHOUSE_OFFICER' };
  }
}

const ADMIN_NOTIFICATIONS = [
  { drug: 'ระบบความปลอดภัย: ตรวจพบและบล็อก IP ผิดปกติ 185.220.101.4', time: '21:58 น.' },
  { drug: 'สิทธิ์ผู้ใช้: เพิ่มบัญชีเจ้าหน้าที่ใหม่ รพ.บางพลี', time: '20:10 น.' },
  { drug: 'รายงานอัตโนมัติ: สรุปยอดคำขอประจำวันสำเร็จ (JOB-11)', time: '02:30 น.' },
];

/** Point the catalogue's mockup hrefs (`*.dc.html`) at the screens that exist in this app. */
function withLinks(items: ShellNavEntry[], role: string): ShellNavEntry[] {
  const suffix = role === 'PHARMACIST' ? '&role=pharmacist' : '';
  return items.map((e) => {
    if ('kind' in e) return e;
    if (e.key === 'adm') return { ...e, href: '?page=admin' };
    if (e.key === 'hosp') return { ...e, href: '?page=admin&tab=hospitals' };
    if (e.key === 'acct') return { ...e, href: '?page=admin&tab=accounts' };
    if (e.key === 'cfg') return { ...e, href: '?page=admin&tab=config' };
    if (e.key === 'aud') return { ...e, href: '?page=admin&tab=audit' };
    if (e.key === 'tr') return { ...e, href: `?page=transport${suffix}` };
    if (e.key === 'lend') return { ...e, href: '?page=lend' };
    if (e.key === 'inc') return { ...e, href: '?page=incident' };
    if (e.key === 'alerts') return { ...e, href: '?page=alerts' };
    if (e.key === 'rep') return { ...e, href: `?page=report${suffix}` };
    if (e.key === 'exp') return { ...e, href: '?page=expiry' };
    if (e.key === 'pool') return { ...e, href: '?page=pool' };
    if (e.key === 'doc') return { ...e, href: '?page=docs' };
    if (e.key === 'dash' && role === 'PHARMACIST') return { ...e, href: '/' };
    if (e.key === 'req' && role === 'PHARMACIST') return { ...e, href: '?page=requests' };
    return e;
  });
}

function initialRole(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('role')?.toLowerCase();
    const p = q.get('page')?.toLowerCase();
    return r === 'admin' || p === 'admin' || p === 'adm' || p === 'config' || p === 'cfg' || p === 'audit' || p === 'aud';
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
  const onAdmin = route.page === 'admin';
  const onTransport = route.page === 'transport';
  const onRequests = route.page === 'requests';
  const onLend = route.page === 'lend';
  const onIncident = route.page === 'incident';
  const onAlerts = route.page === 'alerts';
  const onReport = route.page === 'report';
  const onExpiry = route.page === 'expiry';
  const onPool = route.page === 'pool';
  const onDocs = route.page === 'docs';
  const warehouse = onTransport && route.transportRole === 'WAREHOUSE_OFFICER';
  // Warehouse transport, UI-05, and UI-06 use the ops top bar (no footer); dashboard, alerts, report, and incident console keep standard shell.
  const ops = warehouse || onRequests || onLend;
  // UI-07/08/09/15 screenshots use the ops top bar but keep the standard footer.
  const opsBar = ops || onExpiry || onPool || onDocs;
  const navRole = onAdmin || isAdmin ? 'SYSTEM_ADMIN' : warehouse ? 'WAREHOUSE_OFFICER' : 'PHARMACIST';
  const adminTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const activeKey = onAdmin
    ? adminTab === 'hospitals'
      ? 'hosp'
      : adminTab === 'accounts'
      ? 'acct'
      : adminTab === 'config' || adminTab === 'cfg'
      ? 'cfg'
      : adminTab === 'audit' || adminTab === 'aud'
      ? 'aud'
      : 'adm'
    : onTransport
    ? 'tr'
    : onRequests
    ? 'req'
    : onLend
    ? 'lend'
    : onIncident
    ? 'inc'
    : onAlerts
    ? 'alerts'
    : onReport
    ? 'rep'
    : onExpiry
    ? 'exp'
    : onPool
    ? 'pool'
    : onDocs
    ? 'doc'
    : 'dash';
  const navItems = withLinks(getNavForRole(navRole, activeKey), navRole);

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
          notifications={onAdmin || isAdmin ? ADMIN_NOTIFICATIONS : warehouse ? WAREHOUSE_NOTIFICATIONS : ALERTS.map((a) => ({ drug: a.drug, time: a.time }))}
          variant={opsBar ? 'ops' : 'pharmacist'}
          user={onAdmin || isAdmin ? ADMIN_USER : warehouse ? WAREHOUSE_USER : opsBar ? PHARMACIST_OPS_USER : undefined}
        />
        <main className="mainpad">
          {onAdmin ? (
            <AdminPage query={query} onQuery={setQuery} />
          ) : onTransport ? (
            <TransportTrackingPage role={route.transportRole} />
          ) : onRequests ? (
            <BorrowRequestsPage />
          ) : onLend ? (
            <LenderQueuePage />
          ) : onIncident ? (
            <IncidentConsolePage />
          ) : onAlerts ? (
            <StockAlertsPage />
          ) : onReport ? (
            <ReportsPage />
          ) : onExpiry ? (
            <NearExpiryPage />
          ) : onPool ? (
            <PoolAllocationPage />
          ) : onDocs ? (
            <DocumentsPage />
          ) : (
            <DashboardPage isAdmin={isAdmin} query={query} hospital={hospital} onHospital={setHospital} />
          )}
        </main>
        {!ops && <Footer isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
