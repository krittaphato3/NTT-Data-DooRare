import { useEffect, useRef, useState } from 'react';
import { USER } from '../../data/session';
import type { UserProfile } from '../../data/session';
import { Icon } from '../common/icons';
import { useAuth } from '../../context/AuthContext';
import type { RoleCode } from '../../lib/rbac';

const SWITCH_ROLES = [
  { name: 'ภก.ณัฐวุฒิ ศรีสุข', role: 'PHARMACIST' as RoleCode, label: 'เภสัชกร (Pharmacist)', href: '/', initial: 'ณ' },
  { name: 'ดร.สมเกียรติ วิจิตรพงศ์', role: 'SYSTEM_ADMIN' as RoleCode, label: 'ผู้ดูแลระบบกลาง (System Admin)', href: '/?page=admin&role=admin', initial: 'ส' },
  { name: 'ภญ.อรอุมา พรหมมา', role: 'HOSPITAL_ADMIN' as RoleCode, label: 'ผู้ดูแลโรงพยาบาล (Hospital Admin)', href: '/?page=users&role=hospital-admin', initial: 'อ' },
  { name: 'คุณประเสริฐ ใจงาม', role: 'WAREHOUSE_OFFICER' as RoleCode, label: 'เจ้าหน้าที่คลัง (Warehouse)', href: '/?role=warehouse', initial: 'ป' },
  { name: 'พว.กมลชนก ใจดี', role: 'ER_STAFF' as RoleCode, label: 'พยาบาลห้องฉุกเฉิน (ER)', href: '/?role=er', initial: 'ก' },
  { name: 'คุณสมชาย แก้วกล้า', role: 'DRIVER' as RoleCode, label: 'พนักงานขับรถ (Driver)', href: '/?page=transport&role=driver', initial: 'ส' },
];

interface AccountMenuProps {
  isAdmin: boolean;
  user?: UserProfile;
  /** Show the dropdown chevron (the ops mockup omits it). */
  chevron?: boolean;
}

export function AccountMenu({ isAdmin, user: propUser, chevron = true }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { user: authUser, logout, switchRole, activeRole } = useAuth();

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

  // Filter switchable roles to what user is authorized to hold (or all roles for dev / sysadmin)
  const availableSwitchRoles = SWITCH_ROLES.filter((r) => {
    if (!authUser || authUser.role === 'SYSTEM_ADMIN') return true;
    return authUser.allRoles?.includes(r.role) || authUser.role === r.role;
  });

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
        <div role="menu" aria-label="เมนูผู้ใช้" className="card popover acct-pop" style={{ minWidth: 260 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{currentUser.name}</div>
            <div style={{ fontSize: 12, color: '#475569' }}>{isAdmin ? 'ผู้ดูแลระบบ (Admin)' : currentUser.roleTh}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{currentUser.scopeLabel}</div>
            {authUser?.email && (
              <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace', marginTop: 2 }}>
                {authUser.email}
              </div>
            )}
          </div>

          <div style={{ padding: '4px 10px 2px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
            สลับบทบาท (Switch Role)
          </div>
          {availableSwitchRoles.map((r) => {
            const isCurrent = currentRole === r.role;
            return (
              <a
                key={r.role}
                href={r.href}
                className="navlink"
                onClick={() => {
                  if (switchRole && authUser?.allRoles?.includes(r.role)) {
                    switchRole(r.role);
                  }
                }}
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
            <a
              href="/?page=admin&role=admin"
              role="menuitem"
              className="navlink"
              style={{ minHeight: 32, fontSize: 12.5, padding: '4px 8px' }}
            >
              คอนโซลผู้ดูแลระบบ · Admin Console
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="navlink"
              style={{
                width: '100%',
                minHeight: 32,
                fontSize: 12.5,
                padding: '4px 8px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                color: '#DC2626',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="x" className="ic12" />
              ออกจากระบบ · Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

