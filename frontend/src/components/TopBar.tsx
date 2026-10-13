import { useEffect, useRef, useState } from 'react';
import { ALERTS, USER } from '../data/mock';
import { Icon } from './icons';

interface TopBarProps {
  query: string;
  onQuery: (v: string) => void;
  isAdmin: boolean;
}

export function TopBar({ query, onQuery, isAdmin }: TopBarProps) {
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setBellOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scopeLabel = isAdmin ? 'Viewing as: Admin – All hospitals' : USER.scopeLabel;
  const hospitalLabel = isAdmin ? 'ทุกโรงพยาบาล' : USER.hospitalLabel;

  return (
    <header
      className="topbar"
      style={{ minHeight: 64, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}
    >
      <label className="topbar-search" style={{ flex: '1 1 260px', minWidth: 0, maxWidth: 420, height: 40, border: '1px solid #94A3B8', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', color: '#475569' }}>
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="ค้นหายา, เลขคำขอ, โรงพยาบาล…"
          aria-label="ค้นหา / Search"
          style={{ border: 0, outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: '#0F2A5C', background: 'transparent' }}
        />
        <span className="num" style={{ fontSize: 11, border: '1px solid #E2E8F0', borderRadius: 4, padding: '0 5px', color: '#475569' }}>
          Ctrl K
        </span>
      </label>
      <span style={{ flex: '1 1 0' }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 6, background: '#EFF6FF', color: '#1E40AF', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
        <Icon name="eye" className="ic14" />
        {scopeLabel}
      </span>
      <button className="btn btn-g" style={{ borderColor: '#E2E8F0', gap: 8, color: '#0F2A5C' }} aria-label="เลือกโรงพยาบาลและเขต">
        <Icon name="hosp" />
        <span>{hospitalLabel}</span>
        <span style={{ color: '#475569', fontWeight: 400 }}>· เขตสุขภาพที่ 6</span>
        <Icon name="chev" />
      </button>
      <div style={{ position: 'relative' }}>
        <button
          className="icbtn"
          aria-label="การแจ้งเตือน 6 รายการที่ยังไม่อ่าน"
          aria-expanded={bellOpen ? 'true' : 'false'}
          onClick={() => { setBellOpen((v) => !v); setMenuOpen(false); }}
          style={{ width: 40, height: 40, position: 'relative', border: 0 }}
        >
          <Icon name="bell" className="ic20" />
          <span className="num" style={{ position: 'absolute', top: 3, right: 1, minWidth: 18, height: 18, borderRadius: 9999, background: '#B91C1C', color: '#FFFFFF', fontSize: 11, fontWeight: 600, lineHeight: '18px', padding: '0 4px' }}>
            6
          </span>
        </button>
        {bellOpen && (
          <div role="region" aria-label="การแจ้งเตือนที่ยังไม่อ่าน" className="card" style={{ position: 'absolute', right: 0, top: 46, width: 320, zIndex: 50, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C', marginBottom: 8 }}>การแจ้งเตือนที่ยังไม่อ่าน (6)</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ALERTS.map((a) => (
                <li key={a.drug} style={{ fontSize: 12, lineHeight: '18px' }}>
                  <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{a.drug}</span>
                  <span style={{ color: '#475569' }}> · {a.time}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-g"
          style={{ height: 44, padding: '0 8px 0 4px', gap: 10 }}
          aria-label="เมนูผู้ใช้"
          aria-expanded={menuOpen ? 'true' : 'false'}
          onClick={() => { setMenuOpen((v) => !v); setBellOpen(false); }}
        >
          <span className="av" style={{ width: 36, height: 36, background: '#DBEAFE', color: '#1E40AF' }}>
            {USER.initial}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 13, lineHeight: '16px', color: '#0F2A5C' }}>{USER.name}</span>
            <span style={{ fontSize: 11, lineHeight: '14px', padding: '0 6px', borderRadius: 4, border: '1px solid #94A3B8', color: '#475569', fontWeight: 500 }}>
              {isAdmin ? 'ADMIN' : USER.role}
            </span>
          </span>
          <Icon name="chev" />
        </button>
        {menuOpen && (
          <div role="menu" aria-label="เมนูผู้ใช้" className="card" style={{ position: 'absolute', right: 0, top: 50, width: 240, zIndex: 50, padding: 8 }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{USER.name}</div>
              <div style={{ fontSize: 12 }}>{isAdmin ? 'ผู้ดูแลระบบ (Admin)' : USER.roleTh}</div>
            </div>
            {['โปรไฟล์ของฉัน · Profile', 'ตั้งค่า · Settings', 'ออกจากระบบ · Log out'].map((item) => (
              <a key={item} href="#" role="menuitem" className="navlink" style={{ minHeight: 36, fontSize: 13 }}>{item}</a>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
