import { NAV } from '../../data/navigation';
import { Icon } from '../common/icons';
import type { IconName } from '../common/icons';

interface SidebarProps {
  /** Desktop rail state; on <1024px the drawer always shows full labels. */
  collapsed: boolean;
  onToggle: () => void;
  /** Called when a nav link is used, so the mobile drawer can close itself. */
  onNavigate: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  return (
    <aside className="side" id="app-sidebar" data-part="sidebar" aria-label="เมนูหลัก">
      <div className="side-brand">
        <div className="side-brand-main">
          <span style={{ width: 32, height: 32, borderRadius: 8, background: '#1D4ED8', color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="plus" style={{ strokeWidth: 2.5 }} />
          </span>
          <div className="side-brand-text">
            <div className="side-brand-name">MedSupply Link</div>
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
      <nav className="sidenav" aria-label="เมนูหลัก">
        {NAV.map((n) => (
          <a
            key={n.en}
            href="#"
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
              <span className="navbadge" aria-label={`${n.badge} รายการรอดำเนินการ`}>
                {n.badge}
              </span>
            )}
          </a>
        ))}
      </nav>
      <div className="sidefoot">
        <div className="sidefoot-title">ต้องการความช่วยเหลือ?</div>
        <div>ศูนย์ประสานยา เขต 6 · โทร 1669 ต่อ 214</div>
      </div>
    </aside>
  );
}
