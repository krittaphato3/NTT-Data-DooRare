import { useEffect, useState } from 'react';
import { Footer } from './components/layout/Footer';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { getNavForRole, HOSPITAL_ADMIN_HOME_HREF, withRole } from './data/navigation';
import { can } from './lib/rbac';
import type { RoleCode } from './lib/rbac';
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
import { getWarehouseNav } from './roles/warehouse/data/navigation';
import { WAREHOUSE_NOTIFICATIONS, WAREHOUSE_USER } from './roles/warehouse/data/session';
import { TransportTrackingPage } from './roles/warehouse/pages/TransportTrackingPage';
import { InboxPage } from './roles/warehouse/pages/InboxPage';
import { KitPage } from './roles/warehouse/pages/KitPage';
import { WhBorrowPage } from './roles/warehouse/pages/WhBorrowPage';
import { WhDrugsPage } from './roles/warehouse/pages/WhDrugsPage';
import { WhExpiryPage } from './roles/warehouse/pages/WhExpiryPage';
import { WhStockPage } from './roles/warehouse/pages/WhStockPage';
import { WarehouseDashboardPage } from './roles/warehouse/pages/WarehouseDashboardPage';
import type { TransportRole } from './roles/warehouse/pages/TransportTrackingPage';
import { AccessDenied } from './roles/hospital-admin/components/AccessDenied';
import { ADMIN_NOTIFICATIONS, HOSPITAL_ADMIN_USER } from './roles/hospital-admin/data/session';
import { AuditLogPage } from './roles/hospital-admin/pages/AuditLogPage';
import { ConfigurationPage } from './roles/hospital-admin/pages/ConfigurationPage';
import { UserManagementPage } from './roles/hospital-admin/pages/UserManagementPage';
import { DRIVER_NOTIFICATIONS, DRIVER_USER } from './roles/driver/data/session';
import { ER_NOTIFICATIONS, ER_USER } from './roles/er/data/session';
import { getDriverNav } from './roles/driver/data/navigation';
import { DriverTransportPage } from './roles/driver/pages/DriverTransportPage';
import { DriverSyncPage } from './roles/driver/pages/DriverSyncPage';
import { AdminPage } from './roles/admin/pages/AdminPage';

type Page = 'dashboard' | 'inbox' | 'kit' | 'stock' | 'drugs' | 'transport' | 'requests' | 'lend' | 'incident' | 'alerts' | 'report' | 'expiry' | 'pool' | 'docs' | 'users' | 'audit' | 'config' | 'sync' | 'admin';

/** System Admin user profile (Health Region 6). */
const SYSTEM_ADMIN_USER = {
  name: 'ดร.สมเกียรติ วิจิตรพงศ์',
  role: 'SYSTEM_ADMIN',
  roleTh: 'ผู้ดูแลระบบกลาง (System Admin)',
  scopeLabel: 'Viewing as: Admin – All hospitals (เขตสุขภาพที่ 6)',
  hospitalLabel: 'ทุกโรงพยาบาล (12)',
  initial: 'ส',
};

const SYSTEM_ADMIN_NOTIFICATIONS = [
  { drug: 'ระบบความปลอดภัย: ตรวจพบและบล็อก IP ผิดปกติ 185.220.101.4', time: '21:58 น.' },
  { drug: 'สิทธิ์ผู้ใช้: เพิ่มบัญชีเจ้าหน้าที่ใหม่ รพ.บางพลี', time: '20:10 น.' },
  { drug: 'รายงานอัตโนมัติ: สรุปยอดคำขอประจำวันสำเร็จ (JOB-11)', time: '02:30 น.' },
];

/**
 * The pharmacist/warehouse screens the Hospital Admin shell opens read-only (Phase 2B).
 * They are the shared pages, so every write control inside them is gated through `lib/rbac.ts`.
 * (The warehouse-only pages — inbox, kit, stock, drugs — are not part of the Hospital Admin set.)
 */
const HA_READ_ONLY_PAGES: Page[] = [
  'dashboard', 'alerts', 'requests', 'lend', 'expiry', 'pool', 'incident', 'transport', 'docs', 'report',
];

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
 * `?role=warehouse` switches the whole shell to the warehouse officer: `/?role=warehouse` is the WH
 * dashboard, `&page=inbox` work inbox (F1/F2/F3 out + in), `&page=kit` F3 emergency (urgent requests, kits, incidents), `&page=docs` documents (UI-15, shared with the pharmacist), `&page=stock|requests|expiry|drugs` read-only views, `&page=transport` its transport tracking (other WH pages
 * fall back to its dashboard).
 * `?role=er` switches the shell to ER_STAFF (RBAC role 3): F3 only, so every ER URL lands on the
 * incident console with the ER write controls enabled.
 */
function initialRoute(): { page: Page; transportRole: TransportRole; warehouse: boolean; isDriver: boolean; isEr: boolean; isSystemAdmin: boolean } {
  try {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('role')?.toLowerCase();
    const isDriver = r === 'driver';
    const isEr = r === 'er';
    const isSystemAdmin = r === 'admin';
    const p = q.get('page');
    let page: Page = isDriver ? 'transport' : isSystemAdmin ? 'admin' : 'dashboard';
    if (p === 'admin' || p === 'adm') page = 'admin';
    else if (p === 'transport') page = 'transport';
    else if (p === 'sync') page = 'sync';
    else if (p === 'inbox') page = 'inbox';
    else if (p === 'kit') page = 'kit';
    else if (p === 'stock') page = 'stock';
    else if (p === 'drugs') page = 'drugs';
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
    else if (p === 'config' || p === 'cfg') page = 'config';
    if (isEr) page = 'incident';
    return {
      page,
      transportRole: isDriver ? 'DRIVER' : r === 'pharmacist' ? 'PHARMACIST' : 'WAREHOUSE_OFFICER',
      // `page=transport` without a role keeps meaning the warehouse view (back-compat).
      warehouse: !isDriver && !isEr && !isSystemAdmin && (r === 'warehouse' || (page === 'transport' && r !== 'pharmacist')),
      isDriver,
      isEr,
      isSystemAdmin,
    };
  } catch {
    return { page: 'dashboard', transportRole: 'WAREHOUSE_OFFICER', warehouse: false, isDriver: false, isEr: false, isSystemAdmin: false };
  }
}

/**
 * Point the catalogue's mockup hrefs (`*.dc.html`) at the screens that exist in this app.
 * `withRole` (see `data/navigation.ts`) then keeps the active role in every href.
 */
function withLinks(items: ShellNavEntry[], role: string): ShellNavEntry[] {
  const suffix = role === 'PHARMACIST' ? '&role=pharmacist' : '';
  const isSysAdmin = role === 'SYSTEM_ADMIN';
  // HOSPITAL_ADMIN shares the pharmacist screens (spec §5.2 grants own-hospital viewing), so the
  // pharmacist hrefs apply to it too; its own admin pages are mapped below.
  const pharmacistLike = role === 'PHARMACIST' || role === 'HOSPITAL_ADMIN';
  const resolved = items.map((e) => {
    if ('kind' in e) return e;
    if (e.key === 'adm') return { ...e, href: '?page=admin' };
    if (e.key === 'hosp') return { ...e, href: '?page=admin&tab=hospitals' };
    if (e.key === 'acct') return { ...e, href: '?page=admin&tab=accounts' };
    if (e.key === 'cfg' && isSysAdmin) return { ...e, href: '?page=admin&tab=config' };
    if (e.key === 'aud' && isSysAdmin) return { ...e, href: '?page=admin&tab=audit' };
    if (e.key === 'tr') return { ...e, href: `?page=transport${suffix}` };
    if (e.key === 'lend') return { ...e, href: '?page=lend' };
    if (e.key === 'inc') return { ...e, href: '?page=incident' };
    if (e.key === 'alerts') return { ...e, href: '?page=alerts' };
    if (e.key === 'rep') return { ...e, href: `?page=report${suffix}` };
    if (e.key === 'exp') return { ...e, href: '?page=expiry' };
    if (e.key === 'pool') return { ...e, href: '?page=pool' };
    if (e.key === 'doc') return { ...e, href: '?page=docs' };
    if (e.key === 'usr') return { ...e, href: '?page=users' };
    if (e.key === 'cfg') return { ...e, href: '?page=config' };
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
    const q = new URLSearchParams(window.location.search);
    const r = q.get('role')?.toLowerCase();
    const p = q.get('page')?.toLowerCase();
    return r === 'admin' || p === 'admin' || p === 'adm';
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

/** `?role=driver` renders the DRIVER shell — assigned transport tasks only (SEC-002, ASM-44). */
function initialDriver(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('role')?.toLowerCase() === 'driver';
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
  const [isDriver] = useState(initialDriver);
  const [route] = useState(initialRoute);
  const onAdmin = route.page === 'admin';
  const isSystemAdminRole = isAdmin || route.isSystemAdmin || onAdmin;
  const isDriverRole = !isSystemAdminRole && (isDriver || route.isDriver);
  const onTransport = route.page === 'transport';
  const onSync = route.page === 'sync';
  const onInbox = route.page === 'inbox';
  const onKit = route.page === 'kit';
  const onStock = route.page === 'stock';
  const onDrugs = route.page === 'drugs';
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
  const onConfig = route.page === 'config';
  // The Hospital Admin shell keeps its own navigation on every page, including transport.
  const warehouse = !isSystemAdminRole && !hospitalAdmin && !isDriverRole && route.warehouse;
  const isEr = !isSystemAdminRole && !hospitalAdmin && !isDriverRole && route.isEr;
  // Warehouse transport, driver console, ER shell, UI-05, and UI-06 use the ops top bar (no footer); dashboard, alerts, report, and the pharmacist incident console keep standard shell.
  const ops = isDriverRole || warehouse || isEr || onRequests || onLend;
  // UI-07/08/09/15 screenshots use the ops top bar but keep the standard footer.
  const opsBar = !isSystemAdminRole && (ops || onExpiry || onPool || onDocs);
  const navRole = isSystemAdminRole
    ? 'SYSTEM_ADMIN'
    : isDriverRole
    ? 'DRIVER'
    : warehouse
    ? 'WAREHOUSE_OFFICER'
    : hospitalAdmin
    ? 'HOSPITAL_ADMIN'
    : isEr
    ? 'ER_STAFF'
    : 'PHARMACIST';
  /** Role the shared pharmacist/warehouse pages gate their write controls on. */
  const viewerRole: RoleCode = hospitalAdmin ? 'HOSPITAL_ADMIN' : isEr ? 'ER_STAFF' : 'PHARMACIST';
  const adminTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const activeKey = isSystemAdminRole
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
    : onConfig
    ? 'cfg'
    : onUsers
    ? 'usr'
    : onAudit
    ? 'aud'
    : 'dash';
  // WH and Driver own their sidebars; other roles use the shared catalogue.
  const navItems = isDriverRole
    ? getDriverNav(onSync ? 'sync' : onDocs ? 'docs' : 'transport')
    : warehouse
      ? getWarehouseNav(onTransport ? 'transport' : onInbox ? 'inbox' : onKit ? 'kit' : onDocs ? 'docs' : onStock || onAlerts ? 'stock' : onRequests ? 'requests' : onExpiry ? 'expiry' : onDrugs ? 'drugs' : 'dashboard')
      : withLinks(getNavForRole(navRole, activeKey), navRole);
  // Page access for the Hospital Admin shell is decided by lib/rbac.ts, not by local role checks.
  const mayManageUsers = can(navRole, 'manageUsers');
  const mayViewAudit = can(navRole, 'viewAudit');
  const mayConfigure = can(navRole, 'configureRules');
  const onReadOnlyView = HA_READ_ONLY_PAGES.includes(route.page);
  /** Pages the Hospital Admin shell may render; anything else keeps the 403 card. */
  const isHospitalAdminPageAllowed =
    (onUsers && mayManageUsers) || (onAudit && mayViewAudit) || (onConfig && mayConfigure) || onReadOnlyView;

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
          isAdmin={isSystemAdminRole}
          navOpen={navOpen}
          onMenu={() => setNavOpen((v) => !v)}
          notifications={
            isSystemAdminRole
              ? SYSTEM_ADMIN_NOTIFICATIONS
              : isDriverRole
              ? DRIVER_NOTIFICATIONS
              : warehouse
                ? WAREHOUSE_NOTIFICATIONS
                : hospitalAdmin
                  ? ADMIN_NOTIFICATIONS
                  : isEr
                    ? ER_NOTIFICATIONS
                    : ALERTS.map((a) => ({ drug: a.drug, time: a.time }))
          }
          variant={opsBar ? 'ops' : 'pharmacist'}
          user={isSystemAdminRole ? SYSTEM_ADMIN_USER : isDriverRole ? DRIVER_USER : warehouse ? WAREHOUSE_USER : hospitalAdmin ? HOSPITAL_ADMIN_USER : isEr ? ER_USER : opsBar ? PHARMACIST_OPS_USER : undefined}
        />
        <main className="mainpad">
          {isSystemAdminRole ? (
            <AdminPage query={query} onQuery={setQuery} />
          ) : isDriverRole ? (
            onSync ? (
              <DriverSyncPage />
            ) : onDocs ? (
              <DocumentsPage role="DRIVER" />
            ) : (
              <DriverTransportPage />
            )
          ) : hospitalAdmin && !isHospitalAdminPageAllowed ? (
            /* Guard for a Hospital Admin page outside the allowed set. The operational screens
               render read-only through their `role` prop; this card covers anything else. */
            <AccessDenied homeHref={HOSPITAL_ADMIN_HOME_HREF} />
          ) : warehouse ? (
            onTransport ? <TransportTrackingPage role="WAREHOUSE_OFFICER" /> : onInbox ? <InboxPage /> : onKit ? <KitPage /> : onDocs ? <DocumentsPage role="WAREHOUSE_OFFICER" /> : onStock || onAlerts ? <WhStockPage /> : onRequests ? <WhBorrowPage /> : onExpiry ? <WhExpiryPage /> : onDrugs ? <WhDrugsPage /> : <WarehouseDashboardPage />
          ) : onTransport ? (
            <TransportTrackingPage role={hospitalAdmin ? 'HOSPITAL_ADMIN' : route.transportRole} />
          ) : onRequests ? (
            <BorrowRequestsPage role={viewerRole} />
          ) : onLend ? (
            <LenderQueuePage role={viewerRole} />
          ) : onIncident ? (
            <IncidentConsolePage role={viewerRole} />
          ) : onAlerts ? (
            <StockAlertsPage role={viewerRole} />
          ) : onReport ? (
            <ReportsPage role={viewerRole} />
          ) : onExpiry ? (
            <NearExpiryPage role={viewerRole} />
          ) : onPool ? (
            <PoolAllocationPage role={viewerRole} />
          ) : onDocs ? (
            <DocumentsPage role={viewerRole} />
          ) : onConfig ? (
            <ConfigurationPage />
          ) : onUsers ? (
            <UserManagementPage />
          ) : onAudit ? (
            <AuditLogPage />
          ) : (
            <DashboardPage
              isAdmin={isAdmin}
              query={query}
              hospital={hospital}
              onHospital={setHospital}
              role={viewerRole}
              hospitalLocked={hospitalAdmin}
            />
          )}
        </main>
        {!ops && <Footer isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
