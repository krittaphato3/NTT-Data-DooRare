import { useEffect, useRef, useState } from 'react';
import { USER } from '../../data/session';
import type { UserProfile } from '../../data/session';
import { Icon } from '../common/icons';

const MENU_ITEMS = ['โปรไฟล์ของฉัน · Profile', 'ตั้งค่า · Settings', 'ออกจากระบบ · Log out'];

const SWITCH_ROLES = [
  { name: 'ภก.ณัฐวุฒิ ศรีสุข', role: 'PHARMACIST', label: 'เภสัชกร (Pharmacist)', href: '/', initial: 'ณ' },
  { name: 'คุณประเสริฐ ใจงาม', role: 'WAREHOUSE_OFFICER', label: 'เจ้าหน้าที่คลัง (Warehouse)', href: '/?role=warehouse', initial: 'ป' },
  { name: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN', label: 'ผู้ดูแลโรงพยาบาล (Hospital Admin)', href: '/?page=users&role=hospital-admin', initial: 'อ' },
  { name: 'คุณสมชาย แก้วกล้า', role: 'DRIVER', label: 'พนักงานขับรถ (Driver)', href: '/?page=transport&role=driver', initial: 'ส' },
];

interface AccountMenuProps {
  isAdmin: boolean;
  user?: UserProfile;
  /** Show the dropdown chevron (the ops mockup omits it). */
  chevron?: boolean;
}

export function AccountMenu({ isAdmin, user = USER, chevron = true }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap acct-wrap" ref={wrapRef}>
      <button
        className="btn btn-g acct-btn"
        aria-label="เมนูผู้ใช้"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="av acct-avatar">{user.initial}</span>
        <span className="acct-text">
          <span className="acct-name">{user.name}</span>
          <span className="acct-role">{isAdmin ? 'ADMIN' : user.role}</span>
        </span>
        {chevron && <Icon name="chev" />}
      </button>
      {open && (
        <div role="menu" aria-label="เมนูผู้ใช้" className="card popover acct-pop" style={{ minWidth: 260 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{user.name}</div>
            <div style={{ fontSize: 12, color: '#475569' }}>{isAdmin ? 'ผู้ดูแลระบบ (Admin)' : user.roleTh}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{user.scopeLabel}</div>
          </div>

          <div style={{ padding: '4px 10px 2px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
            สลับบทบาท (Switch Role)
          </div>
          {SWITCH_ROLES.map((r) => {
            const isCurrent = user.role === r.role;
            return (
              <a
                key={r.role}
                href={r.href}
                className="navlink"
                style={{
                  minHeight: 34,
                  fontSize: 12.5,
                  padding: '4px 8px',
                  background: isCurrent ? '#EFF6FF' : undefined,
                  color: isCurrent ? '#1D4ED8' : '#0F2A5C',
                  fontWeight: isCurrent ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="av" style={{ width: 22, height: 22, fontSize: 11 }}>{r.initial}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}
                </span>
                {isCurrent && <Icon name="check" className="ic12" />}
              </a>
            );
          })}

          <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 4, paddingTop: 4 }}>
            {MENU_ITEMS.map((item) => (
              <a key={item} href="#" role="menuitem" className="navlink" style={{ minHeight: 32, fontSize: 12.5, padding: '4px 8px' }}>
                {item}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
