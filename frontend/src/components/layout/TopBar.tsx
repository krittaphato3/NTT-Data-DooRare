import { useEffect, useRef, useState } from 'react';
import { USER } from '../../data/session';
import type { UserProfile } from '../../data/session';
import { Icon } from '../common/icons';
import { AccountMenu } from './AccountMenu';
import { LangToggle } from './LangToggle';

interface TopBarProps {
  query: string;
  onQuery: (v: string) => void;
  isAdmin: boolean;
  navOpen: boolean;
  onMenu: () => void;
  /** Unread notifications for the bell popover (role-scoped data passed in). */
  notifications: { id?: string; drug: string; time: string }[];
  /** Real unread count from the API (the list is capped); falls back to the list length. */
  unreadCount?: number;
  /** Marks one notification read (live bell only). */
  onRead?: (id: string) => void;
  /** `pharmacist` = hospital selector + scope chip; `ops` = scope pill, agent pill, TH/EN switch. */
  variant?: 'pharmacist' | 'ops';
  user?: UserProfile;
}

export function TopBar({ query, onQuery, isAdmin, navOpen, onMenu, notifications, unreadCount, onRead, variant = 'pharmacist', user = USER }: TopBarProps) {
  const ops = variant === 'ops';
  const [bellOpen, setBellOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setBellOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [bellOpen]);

  const scopeLabel = isAdmin ? 'Viewing as: Admin – All hospitals' : user.scopeLabel;
  const hospitalLabel = isAdmin ? 'ทุกโรงพยาบาล' : user.hospitalLabel;

  return (
    <header className="topbar" data-part="topbar">
      <button
        className="icbtn nav-toggle"
        aria-label="เปิดเมนูหลัก"
        aria-controls="app-sidebar"
        aria-expanded={navOpen ? 'true' : 'false'}
        onClick={onMenu}
      >
        <Icon name="menu" className="ic20" />
      </button>
      <label className="topbar-search">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={ops ? 'ค้นหายา รหัสยา เลขคำขอ BR-…' : 'ค้นหายา, เลขคำขอ, โรงพยาบาล…'}
          aria-label="ค้นหา / Search"
          style={{ border: 0, outline: 'none', flex: 1, minWidth: 0, font: 'inherit', color: '#0F2A5C', background: 'transparent' }}
        />
        {!ops && <span className="num kbd-hint">Ctrl K</span>}
      </label>
      <span className="topbar-spacer" />
      {ops ? (
        <>
          <span className="topbar-scope topbar-scope-plain" title="SEC-002: ผู้ใช้เห็นเฉพาะสต็อกของโรงพยาบาลตัวเอง">
            <Icon name="lock" className="ic14" />
            {scopeLabel}
          </span>
          <span className="topbar-scope" title="Agent ทำหน้าที่สรุปและร่างข้อความเท่านั้น ตัวเลขทั้งหมดคำนวณโดยระบบ">
            <Icon name="spark" className="ic14" />
            Agent พร้อม
          </span>
          <LangToggle />
        </>
      ) : (
        <>
          <span className="topbar-scope">
            <Icon name="eye" className="ic14" />
            {scopeLabel}
          </span>
          <button className="btn btn-g topbar-hospital" aria-label="เลือกโรงพยาบาลและเขต">
            <Icon name="hosp" />
            <span className="label">{hospitalLabel}</span>
            <span className="region" style={{ color: '#475569', fontWeight: 400 }}>· เขตสุขภาพที่ 6</span>
            <Icon name="chev" />
          </button>
        </>
      )}
      <div className="menu-wrap bell-wrap" ref={bellRef}>
        <button
          className="icbtn bell-btn"
          aria-label={`การแจ้งเตือน ${unreadCount ?? notifications.length} รายการที่ยังไม่อ่าน`}
          aria-expanded={bellOpen ? 'true' : 'false'}
          onClick={() => setBellOpen((v) => !v)}
        >
          <Icon name="bell" className="ic20" />
          {(unreadCount ?? notifications.length) > 0 && <span className="num bell-count">{unreadCount ?? notifications.length}</span>}
        </button>
        {bellOpen && (
          <div role="region" aria-label="การแจ้งเตือนที่ยังไม่อ่าน" className="card popover bell-pop">
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C', marginBottom: 8 }}>
              การแจ้งเตือนที่ยังไม่อ่าน ({unreadCount ?? notifications.length})
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifications.map((n) => (
                <li key={n.id ?? n.drug} style={{ fontSize: 12, lineHeight: '18px' }}>
                  <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{n.drug}</span>
                  <span style={{ color: '#475569' }}> · {n.time}</span>
                  {n.id && onRead && (
                    <button className="link" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => onRead(n.id!)}>อ่านแล้ว</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <AccountMenu isAdmin={isAdmin} user={user} chevron={!ops} />
    </header>
  );
}
