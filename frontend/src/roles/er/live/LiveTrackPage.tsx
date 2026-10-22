import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import type { ApiIncidentSummary } from '../../../services/incidentApi';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { ViewOnlyBanner } from '../components/ViewOnlyBanner';
import { getIncidentAccess } from '../data/access';
import { erHref } from '../data/navigation';
import { LiveBorrowStatus } from './LiveBorrowStatus';
import { LiveInbox } from './LiveInbox';
import { LivePackPanel } from './LivePack';
import { incidentStatusMeta } from './format';
import { useEmergencyInbox, useIncident, useIncidentList } from './hooks';

type Tab = 'borrow' | 'pack' | 'inbox';

function BorrowSection({ summary }: { summary: ApiIncidentSummary }) {
  const [collapsed, setCollapsed] = useState(false);
  const { incident } = useIncident(summary.id, 8000);
  const meta = incidentStatusMeta(summary.status);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 14px' }}>
        <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? `ขยาย ${summary.incidentNo}` : `ย่อ ${summary.incidentNo}`} onClick={() => setCollapsed((c) => !c)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', flexWrap: 'wrap' }}>
          <Icon name="chev" className="ic14" style={{ color: '#2563eb', transition: 'transform .15s', transform: collapsed ? 'rotate(-90deg)' : 'none' }} />
          <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, fontSize: 13, color: '#0f2a5c' }}>{summary.incidentNo}</span>
          <span className={`badge ${meta.cls}`}>{meta.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2a5c' }}>{summary.type ?? 'เหตุฉุกเฉิน'}{summary.location.text ? ` · ${summary.location.text}` : ''}</span>
        </button>
        <span style={{ fontSize: 11.5, color: '#64748b', marginLeft: 'auto' }}>
          {collapsed ? `ย่ออยู่ · ${summary.borrow.requests} รายการ` : 'ผู้ให้ยืมยืนยันเอง · ระบบไม่ยืนยันแทน'}
        </span>
        <a className="link" href={erHref('incidents', { incident: summary.id })} style={{ fontSize: 12 }}>รายละเอียด</a>
      </div>
      {!collapsed && (incident ? <LiveBorrowStatus lines={incident.borrowLines} /> : <div className="card" style={{ padding: '12px 16px', fontSize: 12.5, color: '#64748b' }}>กำลังโหลด…</div>)}
    </section>
  );
}

/**
 * After the requests are sent: "ยืมฉุกเฉิน" is organised incident → lender hospital → items asked and how each answered; "จัดชุด" is the
 * kit assembly of the hospital's own stock; "คำขอจาก รพ.อื่น" is where this hospital answers urgent requests as the lender.
 */
export function LiveTrackPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const [tab, setTab] = useState<Tab>('borrow');
  const list = useIncidentList('active');
  const inbox = useEmergencyInbox('all');
  const pending = inbox.legs.filter((l) => l.status === 'SENT').length;
  const withRequests = list.items.filter((i) => i.borrow.requests > 0 || i.status === 'ACTIVE');
  // ER staff may answer as the lender (RBAC confirmLend); the view-only roles do not reach this page.
  const mayAnswer = role === 'ER_STAFF' || role === 'PHARMACIST' || role === 'WAREHOUSE_OFFICER';

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'borrow', label: 'ยืมฉุกเฉิน', badge: list.items.reduce((n, i) => n + i.borrow.waiting, 0) || undefined },
    { id: 'pack', label: 'จัดชุด' },
    { id: 'inbox', label: 'คำขอจาก รพ.อื่น', badge: pending || undefined },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="ติดตามคำขอและจัดชุด" />
      {!access.mayWrite && <ViewOnlyBanner />}
      <ErPageHeading title="ติดตามคำขอและจัดชุด" titleEn="/ Track & pack" subtitle="UI-11 · UI-13 · คำขอยืมแยกตามเหตุการณ์และโรงพยาบาล · จัดชุดจากของแยก · ตอบคำขอเร่งด่วนจากโรงพยาบาลอื่น" />
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 2 }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" className="tab" onClick={() => setTab(t.id)} style={{ height: 38, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', borderBottom: tab === t.id ? '2.5px solid #2563eb' : '2.5px solid transparent', background: 'none', color: tab === t.id ? '#2563eb' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{t.label}</span>
            {t.badge !== undefined && <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {tab === 'borrow' &&
        (withRequests.length === 0 ? (
          <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>{list.source === 'loading' ? 'กำลังโหลด…' : 'ยังไม่มีคำขอยืมที่ส่งออกไป'}</div>
        ) : (
          withRequests.map((i) => <BorrowSection key={i.id} summary={i} />)
        ))}
      {tab === 'pack' && <LivePackPanel access={access} />}
      {tab === 'inbox' && <LiveInbox legs={inbox.legs} canAct={mayAnswer} reload={inbox.reload} />}
    </div>
  );
}
