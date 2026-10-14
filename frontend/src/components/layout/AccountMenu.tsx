import { useEffect, useRef, useState } from 'react';
import { USER } from '../../data/session';
import type { UserProfile } from '../../data/session';
import { Icon } from '../common/icons';

const MENU_ITEMS = ['โปรไฟล์ของฉัน · Profile', 'ตั้งค่า · Settings', 'ออกจากระบบ · Log out'];

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
        <div role="menu" aria-label="เมนูผู้ใช้" className="card popover acct-pop">
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{user.name}</div>
            <div style={{ fontSize: 12 }}>{isAdmin ? 'ผู้ดูแลระบบ (Admin)' : user.roleTh}</div>
          </div>
          {MENU_ITEMS.map((item) => (
            <a key={item} href="#" role="menuitem" className="navlink" style={{ minHeight: 36, fontSize: 13 }}>
              {item}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
