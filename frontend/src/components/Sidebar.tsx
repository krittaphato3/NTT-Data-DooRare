import { NAV } from '../data/mock';
import { Icon } from './icons';
import type { IconName } from './icons';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className="side"
      aria-label="เมนูหลัก"
      style={{ flex: collapsed ? '0 0 64px' : '0 0 240px', maxWidth: '100%', background: '#FFFFFF', borderRight: '1px solid #E2E8F0', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 4px 8px' }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: '#1D4ED8', color: '#FFFFFF', display: 'grid', placeItems: 'center' }}>
              <Icon name="plus" style={{ strokeWidth: 2.5 }} />
            </span>
            <div>
              <div style={{ fontSize: 16, lineHeight: '20px', fontWeight: 600, color: '#0F2A5C' }}>MedSupply Link</div>
              <div className="en">เครือข่ายเขตสุขภาพที่ 6</div>
            </div>
          </div>
        )}
        <button
          className="icbtn"
          aria-label={collapsed ? 'ขยายเมนู / Expand sidebar' : 'ย่อเมนู / Collapse sidebar'}
          aria-expanded={collapsed ? 'false' : 'true'}
          onClick={onToggle}
          style={{ border: 0 }}
        >
          <Icon name="collapse" />
        </button>
      </div>
      <nav className="sidenav" aria-label="เมนูหลัก" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <a key={n.en} href="#" title={collapsed ? `${n.th} ${n.en}` : undefined} className={`navlink ${n.active ? 'nav-on' : ''}`} aria-current={n.active ? 'page' : 'false'}>
            <Icon name={n.icon as IconName} className="ic20" />
            {!collapsed && (
              <span>
                <span>{n.th}</span>
                <span className="en">{n.en}</span>
              </span>
            )}
            {!collapsed && n.badge !== '' && (
              <span className="navbadge" aria-label={`${n.badge} รายการรอดำเนินการ`}>
                {n.badge}
              </span>
            )}
          </a>
        ))}
      </nav>
      {!collapsed && (
        <div className="sidefoot" style={{ marginTop: 'auto', padding: 12, borderRadius: 8, background: '#F5F8FC', fontSize: 12, lineHeight: '18px' }}>
          <div style={{ color: '#0F2A5C', fontWeight: 500 }}>ต้องการความช่วยเหลือ?</div>
          <div>ศูนย์ประสานยา เขต 6 · โทร 1669 ต่อ 214</div>
        </div>
      )}
    </aside>
  );
}
