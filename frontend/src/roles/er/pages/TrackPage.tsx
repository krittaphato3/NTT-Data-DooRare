import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { IncidentBorrowStatus } from '../components/IncidentBorrowStatus';
import { IncidentTabs } from '../components/IncidentTabs';
import type { IncidentTab } from '../components/IncidentTabs';
import { PackPanel } from '../components/PackPanel';
import { ViewOnlyBanner } from '../components/ViewOnlyBanner';
import type { RoleCode } from '../../../lib/rbac';
import { getIncidentAccess } from '../data/access';
import { groupBatchesByHospital } from '../data/borrowView';
import { EMERGENCY_BORROWS } from '../data/incident';
import { statusMeta, useIncidents } from '../data/incidentStore';
import { erHref } from '../data/navigation';

const TRACK_TABS: IncidentTab[] = ['borrow', 'pack'];

/**
 * After the requests are sent: "ยืมฉุกเฉิน" is organised incident → lender hospital → items asked
 * and how each answered; "จัดชุด" is the kit assembly (picking and confirming) for the hospital's own stock.
 */
export function TrackPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const [tab, setTab] = useState<IncidentTab>('borrow');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const withRequests = useIncidents().filter((r) => (r.status === 'planning' || r.status === 'sent') && (r.seed === 'live' || r.batches.length > 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="ติดตามคำขอและจัดชุด" />
      {!access.mayWrite && <ViewOnlyBanner />}
      <ErPageHeading title="ติดตามคำขอและจัดชุด" titleEn="/ Track & pack" subtitle="UI-11 · UI-13 · คำขอยืมแยกตามเหตุการณ์และโรงพยาบาล · จัดชุดจากของแยก" />
      <IncidentTabs tabs={TRACK_TABS} active={tab} onChange={setTab} />

      {tab === 'borrow' ? (
        withRequests.length === 0 ? (
          <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>ยังไม่มีคำขอยืมที่ส่งออกไป</div>
        ) : (
          withRequests.map((r) => {
            const meta = statusMeta(r);
            const isCollapsed = collapsed.has(r.id);
            const hospitalCount = r.seed === 'live' ? new Set(EMERGENCY_BORROWS.flatMap((b) => b.hospitals.map((h) => h.hospital))).size : groupBatchesByHospital(r.batches).length;
            return (
              <section key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 14px' }}>
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `ขยาย ${r.id}` : `ย่อ ${r.id}`}
                    onClick={() => toggle(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', flexWrap: 'wrap' }}
                  >
                    <Icon name="chev" className="ic14" style={{ color: '#2563eb', transition: 'transform .15s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }} />
                    <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, fontSize: 13, color: '#0f2a5c' }}>{r.id}</span>
                    <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f2a5c' }}>
                      {r.intake.category} · {r.intake.location}
                    </span>
                  </button>
                  <span style={{ fontSize: 11.5, color: '#64748b', marginLeft: 'auto' }}>
                    {isCollapsed ? `ย่ออยู่ · ${hospitalCount} โรงพยาบาล` : 'ผู้ให้ยืมยืนยันเอง · Agent ไม่ยืนยันแทน'}
                  </span>
                  <a className="link" href={erHref('incidents', { incident: r.id })} style={{ fontSize: 12 }}>
                    รายละเอียด
                  </a>
                </div>
                {!isCollapsed && <IncidentBorrowStatus rec={r} />}
              </section>
            );
          })
        )
      ) : (
        <PackPanel access={access} />
      )}
    </div>
  );
}
