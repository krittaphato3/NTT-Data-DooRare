import type { ShellNavEntry, ShellNavItem } from '../../data/navigation';
import { Icon } from '../common/icons';

interface SidebarProps {
  /** Desktop rail state; on <1024px the drawer always shows full labels. */
  collapsed: boolean;
  onToggle: () => void;
  /** Called when a nav link is used, so the mobile drawer can close itself. */
  onNavigate: () => void;
  /** Resolved shell menu for the active role (see `getNavForRole`). */
  items: ShellNavEntry[];
}

/** Brand row — mockup sidebar header verbatim (`DooRare ดูแร์`). */
function SidebarBrand({ collapsed, onToggle, onNavigate }: Pick<SidebarProps, 'collapsed' | 'onToggle' | 'onNavigate'>) {
  return (
    <div className="side-brand">
      <div className="side-brand-main">
        <span className="side-logo" aria-hidden="true">
          <Icon name="plus" style={{ strokeWidth: 2.5 }} />
        </span>
        <div className="side-brand-text">
          <div className="side-brand-name">
            DooRare <span className="side-brand-name-th">ดูแร์</span>
          </div>
          <div className="en">เครือข่ายเขตสุขภาพที่ 6</div>
        </div>
      </div>
      <button
        className="icbtn side-collapse"
        aria-label={collapsed ? 'ขยายเมนู / Expand sidebar' : 'ย่อเมนู / Collapse sidebar'}
        aria-expanded={collapsed ? 'false' : 'true'}
        onClick={onToggle}
        style={{ border: 0 }}
      >
        <Icon name="collapse" />
      </button>
      <button className="icbtn side-close" aria-label="ปิดเมนู" onClick={onNavigate} style={{ border: 0 }}>
        <Icon name="x" />
      </button>
    </div>
  );
}

/** Single nav link — mockup `a.navlink` structure verbatim. */
function SidebarNavItem({ item, onNavigate }: { item: ShellNavItem; onNavigate: () => void }) {
  return (
    <a
      href={item.href}
      className={`navlink ${item.active ? 'nav-on' : ''}`}
      aria-current={item.active ? 'page' : 'false'}
      title={item.ui}
      onClick={(e) => {
        if (item.href === '#') e.preventDefault();
        onNavigate();
      }}
    >
      <span className="nav-ic" aria-hidden="true">
        <Icon name={item.icon} className="ic20" />
      </span>
      <span className="nav-text">
        <span>{item.th}</span>
        <span className="en">{item.en}</span>
      </span>
      {item.badge !== '' && (
        <span
          className={`navbadge ${item.badgeTone === 'neutral' ? 'navbadge-neutral' : ''}`}
          aria-label={`${item.badge} รายการรอดำเนินการ`}
        >
          {item.badge}
        </span>
      )}
    </a>
  );
}

/** Nav list — mockup `nav.sidenav` (`sc-for` over role-filtered catalogue). */
function SidebarNav({ items, onNavigate }: Pick<SidebarProps, 'items' | 'onNavigate'>) {
  return (
    <nav className="sidenav" aria-label="เมนูหลัก">
      {items.map((n) =>
        'kind' in n ? (
          <div key={n.th} className="navgrp">
            {n.th}
          </div>
        ) : (
          <SidebarNavItem key={n.key} item={n} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}

/** Sidebar footer — mockup `div.sidefoot` verbatim. */
function SidebarFooter() {
  return (
    <div className="sidefoot">
      <div className="sidefoot-title">ศูนย์ประสานยา เขตสุขภาพที่ 6</div>
      <div>
        HIS นำเข้าล่าสุด <span className="num">06:10</span> น.
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, onNavigate, items }: SidebarProps) {
  return (
    <aside className="side" id="app-sidebar" data-part="sidebar" aria-label="เมนูหลัก">
      <SidebarBrand collapsed={collapsed} onToggle={onToggle} onNavigate={onNavigate} />
      <SidebarNav items={items} onNavigate={onNavigate} />
      <SidebarFooter />
    </aside>
  );
}
