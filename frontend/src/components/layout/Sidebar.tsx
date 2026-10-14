import { NAV } from '../../data/navigation';
import type { NavItem } from '../../data/navigation';
import { Icon } from '../common/icons';
import type { IconName } from '../common/icons';

interface SidebarProps {
  /** Desktop rail state; on <1024px the drawer always shows full labels. */
  collapsed: boolean;
  onToggle: () => void;
  /** Called when a nav link is used, so the mobile drawer can close itself. */
  onNavigate: () => void;
  /** Role menu; defaults to the pharmacist menu. */
  nav?: NavItem[];
  /** Brand block; defaults to the dashboard branding. */
  brand?: { name: React.ReactNode; sub: string };
  /** Footer card; defaults to the dashboard help card. */
  footer?: { title: string; text: React.ReactNode };
}

const DEFAULT_BRAND = { name: 'MedSupply Link', sub: 'เครือข่ายเขตสุขภาพที่ 6' };
const DEFAULT_FOOTER = { title: 'ต้องการความช่วยเหลือ?', text: 'ศูนย์ประสานยา เขต 6 · โทร 1669 ต่อ 214' };

export function Sidebar({ collapsed, onToggle, onNavigate, nav = NAV, brand = DEFAULT_BRAND, footer = DEFAULT_FOOTER }: SidebarProps) {
  return (
    <aside className="side" id="app-sidebar" data-part="sidebar" aria-label="เมนูหลัก">
      <div className="side-brand">
        <div className="side-brand-main">
          <span style={{ width: 32, height: 32, borderRadius: 8, background: '#1D4ED8', color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="plus" style={{ strokeWidth: 2.5 }} />
          </span>
          <div className="side-brand-text">
            <div className="side-brand-name">{brand.name}</div>
            <div className="en">{brand.sub}</div>
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
      <nav className="sidenav" aria-label="เมนูหลัก">
        {nav.map((n) => (
          <a
            key={n.en}
            href={n.href ?? '#'}
            className={`navlink ${n.active ? 'nav-on' : ''}`}
            aria-current={n.active ? 'page' : 'false'}
            onClick={onNavigate}
          >
            <Icon name={n.icon as IconName} className="ic20" />
            <span className="nav-text">
              <span>{n.th}</span>
              <span className="en">{n.en}</span>
            </span>
            {n.badge !== '' && (
              <span className={`navbadge ${n.badgeTone === 'grey' ? 'navbadge-grey' : ''}`} aria-label={`${n.badge} รายการรอดำเนินการ`}>
                {n.badge}
              </span>
            )}
          </a>
        ))}
      </nav>
      <div className="sidefoot">
        <div className="sidefoot-title">{footer.title}</div>
        <div>{footer.text}</div>
      </div>
    </aside>
  );
}
