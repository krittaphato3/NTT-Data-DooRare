import { useEffect, useState } from 'react';
import { Footer } from './components/layout/Footer';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { getNavForRole, HOSPITAL_ADMIN_HOME_HREF, HOSPITAL_ADMIN_ROLE_QUERY } from './data/navigation';
import { can } from './lib/rbac';
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
import { WAREHOUSE_NOTIFICATIONS, WAREHOUSE_USER } from './roles/warehouse/data/session';
import { TransportTrackingPage } from './roles/warehouse/pages/TransportTrackingPage';
import type { TransportRole } from './roles/warehouse/pages/TransportTrackingPage';
import { AccessDenied } from './roles/hospital-admin/components/AccessDenied';
import { ADMIN_NOTIFICATIONS, HOSPITAL_ADMIN_USER } from './roles/hospital-admin/data/session';
import { AuditLogPage } from './roles/hospital-admin/pages/AuditLogPage';
import { UserManagementPage } from './roles/hospital-admin/pages/UserManagementPage';

type Page = 'dashboard' | 'transport' | 'requests' | 'lend' | 'incident' | 'alerts' | 'report' | 'expiry' | 'pool' | 'docs' | 'users' | 'audit';

/** Pharmacist on the ops-style top bar (UI-05 mockup: scope pill, agent pill, TH/EN). */
const PHARMACIST_OPS_USER = { ...USER, scopeLabel: 'เห็นเฉพาะข้อมูล รพ.สมุทรปราการ' };

/**
 * No router yet:
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
    let page: Page = 'dashboard';
    if (p === 'transport') page = 'transport';
    else if (p === 'requests' || p === 'borrow') page = 'requests';
    else if (p === 'lend') page = 'lend';
    else if (p === 'incident' || p === 'inc') page = 'incident';
    else if (p === 'alerts') page = 'alerts';
    else if (p === 'report' || p === 'rep') page = 'report';
    else if (p === 'expiry' || p === 'exp') page = 'expiry';
    else if (p === 'pool' || p === 'alloc') page = 'pool';
    else if (p === 'docs' || p === 'doc') page = 'docs';
    else if (p === 'users' || p === 'usr' || p === 'user') page = 'users';
    else if (p === 'audit' || p === 'aud') page = 'audit';
    return {
      page,
      transportRole: q.get('role')?.toLowerCase() === 'pharmacist' ? 'PHARMACIST' : 'WAREHOUSE_OFFICER',
    };
  } catch {
    return { page: 'dashboard', transportRole: 'WAREHOUSE_OFFICER' };
  }
}

/**
 * Roles that are not the implicit default and therefore must be carried in every in-app href.
 * A relative `?page=…` link replaces the whole query string, so a role whose shell is selected by a
 * query param would otherwise be dropped on each click (and on browser back/forward).
 */
const ROLE_QUERY: Record<string, string> = {
  HOSPITAL_ADMIN: HOSPITAL_ADMIN_ROLE_QUERY,
};

/** Append the role query param to an href when the role is not the default. */
function withRole(href: string, role: string): string {
  const r = ROLE_QUERY[role];
  if (!r || href === '#' || href.includes(`role=${r}`)) return href;
  return `${href}${href.includes('?') ? '&' : '?'}role=${r}`;
}

/** Point the catalogue's mockup hrefs (`*.dc.html`) at the screens that exist in this app. */
function withLinks(items: ShellNavEntry[], role: string): ShellNavEntry[] {
  const suffix = role === 'PHARMACIST' ? '&role=pharmacist' : '';
  // HOSPITAL_ADMIN shares the pharmacist screens (spec §5.2 grants own-hospital viewing), so the
  // pharmacist hrefs apply to it too; its own admin pages are mapped below.
  const pharmacistLike = role === 'PHARMACIST' || role === 'HOSPITAL_ADMIN';
  const resolved = items.map((e) => {
    if ('kind' in e) return e;
    if (e.key === 'tr') return { ...e, href: `?page=transport${suffix}` };
    if (e.key === 'lend') return { ...e, href: '?page=lend' };
    if (e.key === 'inc') return { ...e, href: '?page=incident' };
    if (e.key === 'alerts') return { ...e, href: '?page=alerts' };
    if (e.key === 'rep') return { ...e, href: `?page=report${suffix}` };
    if (e.key === 'exp') return { ...e, href: '?page=expiry' };
    if (e.key === 'pool') return { ...e, href: '?page=pool' };
    if (e.key === 'doc') return { ...e, href: '?page=docs' };
    if (e.key === 'usr') return { ...e, href: '?page=users' };
    if (e.key === 'aud') return { ...e, href: '?page=audit' };
    if (e.key === 'dash' && pharmacistLike) return { ...e, href: '/' };
    if (e.key === 'req' && pharmacistLike) return { ...e, href: '?page=requests' };
    return e;
  });
  // Keep the active role in every link so navigation never falls back to the default shell.
  return resolved.map((e) => ('kind' in e ? e : { ...e, href: withRole(e.href, role) }));
}

function initialRole(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('role') === 'Admin';
  } catch {
    return false;
  }
}

/** `?role=hospital-admin` renders the HOSPITAL_ADMIN shell — own-hospital scope, never "all hospitals". */
function initialHospitalAdmin(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('role')?.toLowerCase() === 'hospital-admin';
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
  const [hospitalAdmin] = useState(initialHospitalAdmin);
  const [route] = useState(initialRoute);
  const onTransport = route.page === 'transport';
  const onRequests = route.page === 'requests';
  const onLend = route.page === 'lend';
  const onIncident = route.page === 'incident';
  const onAlerts = route.page === 'alerts';
  const onReport = route.page === 'report';
  const onExpiry = route.page === 'expiry';
  const onPool = route.page === 'pool';
  const onDocs = route.page === 'docs';
  const onUsers = route.page === 'users';
  const onAudit = route.page === 'audit';
  const warehouse = onTransport && route.transportRole === 'WAREHOUSE_OFFICER';
  // Warehouse transport, UI-05, and UI-06 use the ops top bar (no footer); dashboard, alerts, report, and incident console keep standard shell.
  const ops = warehouse || onRequests || onLend;
  // UI-07/08/09/15 screenshots use the ops top bar but keep the standard footer.
  const opsBar = ops || onExpiry || onPool || onDocs;
  const navRole = warehouse ? 'WAREHOUSE_OFFICER' : hospitalAdmin ? 'HOSPITAL_ADMIN' : 'PHARMACIST';
  const activeKey = onTransport ? 'tr' : onRequests ? 'req' : onLend ? 'lend' : onIncident ? 'inc' : onAlerts ? 'alerts' : onReport ? 'rep' : onExpiry ? 'exp' : onPool ? 'pool' : onDocs ? 'doc' : onUsers ? 'usr' : onAudit ? 'aud' : 'dash';
  const navItems = withLinks(getNavForRole(navRole, activeKey), navRole);
  // Page access for the Hospital Admin shell is decided by lib/rbac.ts, not by local role checks.
  const mayManageUsers = can(navRole, 'manageUsers');
  const mayViewAudit = can(navRole, 'viewAudit');

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
          notifications={
            warehouse
              ? WAREHOUSE_NOTIFICATIONS
              : hospitalAdmin
                ? ADMIN_NOTIFICATIONS
                : ALERTS.map((a) => ({ drug: a.drug, time: a.time }))
          }
          variant={opsBar ? 'ops' : 'pharmacist'}
          user={warehouse ? WAREHOUSE_USER : hospitalAdmin ? HOSPITAL_ADMIN_USER : opsBar ? PHARMACIST_OPS_USER : undefined}
        />
        <main className="mainpad">
          {hospitalAdmin && !((onUsers && mayManageUsers) || (onAudit && mayViewAudit)) ? (
            /* Phase 1: only User management + Audit log are built for HOSPITAL_ADMIN. The spec's
               read-only operational views (dashboard, alerts, requests, …) arrive in Phase 2; until
               then a direct ?page= must not render a screen carrying pharmacist write actions. */
            <AccessDenied homeHref={HOSPITAL_ADMIN_HOME_HREF} />
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
          ) : onUsers ? (
            <UserManagementPage />
          ) : onAudit ? (
            <AuditLogPage />
          ) : (
            <DashboardPage isAdmin={isAdmin} query={query} hospital={hospital} onHospital={setHospital} />
          )}
        </main>
        {!ops && <Footer isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
