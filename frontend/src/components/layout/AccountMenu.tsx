import React, { useEffect, useRef, useState } from 'react';
import { USER } from '../../data/session';
import type { UserProfile } from '../../data/session';
import { Icon } from '../common/icons';
import { useAuth } from '../../context/AuthContext';

interface AccountMenuProps {
  isAdmin: boolean;
  user?: UserProfile;
  /** Show the dropdown chevron (the ops mockup omits it). */
  chevron?: boolean;
}

export function AccountMenu({ isAdmin, user: propUser, chevron = true }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { user: authUser, logout, activeRole } = useAuth();

  const currentUser = authUser
    ? {
        name: authUser.name,
        role: activeRole || authUser.role,
        roleTh: authUser.roleTh,
        scopeLabel: authUser.scopeLabel,
        hospitalLabel: authUser.hospitalName,
        initial: authUser.initial || authUser.name.charAt(0),
      }
    : propUser || USER;

  const currentRole = activeRole || currentUser.role;

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

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    if (logout) {
      await logout();
      window.location.href = '/';
    }
  };

  const isSysAdmin = isAdmin || currentRole === 'SYSTEM_ADMIN' || authUser?.role === 'SYSTEM_ADMIN';

  return (
    <div className="menu-wrap acct-wrap" ref={wrapRef}>
      <button
        className="btn btn-g acct-btn"
        aria-label="เมนูผู้ใช้"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="av acct-avatar">{currentUser.initial}</span>
        <span className="acct-text">
          <span className="acct-name">{currentUser.name}</span>
          <span className="acct-role">{isAdmin ? 'ADMIN' : currentRole}</span>
        </span>
        {chevron && <Icon name="chev" />}
      </button>
      {open && (
        <div role="menu" aria-label="เมนูผู้ใช้" className="card popover acct-pop" style={{ minWidth: 240 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{currentUser.name}</div>
            <div style={{ fontSize: 12, color: '#475569' }}>{isAdmin ? 'ผู้ดูแลระบบ (Admin)' : currentUser.roleTh}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{currentUser.scopeLabel}</div>
            {authUser?.email && (
              <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace', marginTop: 3 }}>
                {authUser.email}
              </div>
            )}
          </div>

          <div style={{ paddingTop: 2 }}>
            {isSysAdmin && (
              <a
                href="/?page=admin&role=admin"
                role="menuitem"
                className="navlink"
                style={{ minHeight: 32, fontSize: 12.5, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Icon name="shield" className="ic14" />
                คอนโซลผู้ดูแลระบบ · Admin Console
              </a>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="navlink"
              style={{
                width: '100%',
                minHeight: 32,
                fontSize: 12.5,
                padding: '6px 8px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                color: '#DC2626',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="x" className="ic14" />
              ออกจากระบบ · Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
