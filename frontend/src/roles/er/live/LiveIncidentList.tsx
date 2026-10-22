import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { getIncidentAccess } from '../data/access';
import { erHref, readParam } from '../data/navigation';
import { LiveIncidentDetail } from './LiveIncidentDetail';
import { dateTime, incidentStatusMeta } from './format';
import { useIncident, useIncidentList } from './hooks';

type Group = 'all' | 'active' | 'closed' | 'cancelled';
const GROUPS: { id: Group; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'active', label: 'เปิดอยู่' },
  { id: 'closed', label: 'สรุปแล้ว' },
  { id: 'cancelled', label: 'ยกเลิก' },
];

/** ER page: every incident of the hospital, with the selected one opened below (plan, borrow requests, updates). */
export function LiveIncidentList({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const [group, setGroup] = useState<Group>('all');
  const selectedId = readParam('incident');
  const list = useIncidentList(group);
  const detail = useIncident(selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="รายการเหตุการณ์" />
      <ErPageHeading
        title="รายการเหตุการณ์"
        titleEn="/ Incidents"
        subtitle="ทุกเหตุที่ ER บันทึกไว้ · เลือกเลขที่เหตุเพื่อดูแผน สถานะการยืม และอัปเดตจำนวนผู้ป่วย (รายละเอียดจะอยู่ด้านบน)"
        actions={
          access.mayWrite && (
            <a className="btn btn-sm" style={{ background: '#b91c1c', color: '#ffffff', border: 'none', fontWeight: 600 }} href={erHref('flow', { new: '1' })}>
              <Icon name="siren" className="ic14" />
              + แจ้งเหตุใหม่
            </a>
          )
        }
      />
      {selectedId && <a className="link" href={erHref('incidents')} style={{ fontSize: 12.5 }}>← กลับไปรายการทั้งหมด</a>}
      {selectedId ? (
        detail.incident ? (
          <LiveIncidentDetail incident={detail.incident} access={access} reload={() => { detail.reload(); list.reload(); }} />
        ) : (
          <div style={{ fontSize: 12.5, color: '#94a3b8' }}>{detail.source === 'loading' ? 'กำลังโหลด…' : 'ไม่พบเหตุการณ์นี้'}</div>
        )
      ) : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className={group === g.id ? 'btn btn-p btn-sm' : 'btn btn-s btn-sm'} onClick={() => setGroup(g.id)}>{g.label}</button>
        ))}
      </div>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="qt" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th scope="col">เลขที่</th>
                <th scope="col">เหตุการณ์</th>
                <th scope="col" className="r">ผู้ป่วย</th>
                <th scope="col">แจ้งเมื่อ</th>
                <th scope="col">คำขอยืม</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {list.items.length === 0 && (
                <tr><td colSpan={6} style={{ color: '#94a3b8', fontSize: 12.5 }}>{list.source === 'loading' ? 'กำลังโหลด…' : 'ไม่มีเหตุการณ์'}</td></tr>
              )}
              {list.items.map((r) => {
                const meta = incidentStatusMeta(r.status);
                return (
                  <tr key={r.id} style={r.id === selectedId ? { background: '#eff6ff' } : undefined}>
                    <td><a className="link" href={erHref('incidents', { incident: r.id })} style={{ fontFamily: 'Inter, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.incidentNo}</a></td>
                    <td>{r.type ?? '—'}{r.location.text ? ` · ${r.location.text}` : ''}</td>
                    <td className="r">{r.counts.total}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{dateTime(r.createdAt)}</td>
                    <td style={{ fontSize: 12, color: '#475569' }}>
                      {r.borrow.requests === 0 ? '—' : `${r.borrow.requests} รายการ · รอตอบ ${r.borrow.waiting} · ยืนยัน ${r.borrow.confirmed} · รับแล้ว ${r.borrow.received}`}
                      {r.borrow.escalated > 0 && <span style={{ color: '#b91c1c' }}> · ไม่มีผู้ให้ {r.borrow.escalated}</span>}
                    </td>
                    <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
