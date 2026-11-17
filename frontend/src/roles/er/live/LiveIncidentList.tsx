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

/** One short line about the borrow requests of an incident: the thing that needs attention first, the total below. */
function BorrowCell({ b }: { b: { requests: number; waiting: number; confirmed: number; received: number; escalated: number } }) {
  if (b.requests === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
  let line: React.ReactNode;
  if (b.escalated > 0) line = <span style={{ color: '#b91c1c', fontWeight: 600 }}>ไม่มีผู้ให้ {b.escalated}</span>;
  else if (b.waiting > 0) line = <span style={{ color: '#b45309', fontWeight: 600 }}>รอตอบ {b.waiting}</span>;
  else if (b.received >= b.requests) line = <span style={{ color: '#15803d', fontWeight: 600 }}>รับครบแล้ว</span>;
  else line = <span style={{ color: '#334155', fontWeight: 600 }}>ยืนยัน {b.confirmed} · รับแล้ว {b.received}</span>;
  return (
    <>
      {line}
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>จาก {b.requests} รายการ</div>
    </>
  );
}

/** ER page: every incident of the hospital, with the selected one opened below (plan, borrow requests, updates). */
export function LiveIncidentList({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const [group, setGroup] = useState<Group>('all');
  const selectedId = readParam('incident');
  const list = useIncidentList(group);
  const detail = useIncident(selectedId);
  /* Numbers of the cards above the list always cover every incident, whatever tab is open. */
  const all = useIncidentList('all', 0);
  const live = all.items.filter((i) => i.group === 'active');
  const cards = [
    { title: 'กำลังดำเนินการ', n: live.length, sub: 'เหตุที่ยังไม่ปิด', color: '#b91c1c' },
    { title: 'รอผู้ให้ยืมตอบ', n: live.reduce((a, i) => a + i.borrow.waiting, 0), sub: 'คำขอยืมที่ยังไม่มีคำตอบ', color: '#d97706' },
    { title: 'ผู้ป่วยในเหตุที่เปิดอยู่', n: live.reduce((a, i) => a + i.counts.total, 0), sub: 'รวมทุกระดับ', color: '#2563eb' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="รายการเหตุการณ์" />
      <ErPageHeading
        title="รายการเหตุการณ์"
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
      {all.items.length > 0 && (
        <section className="sa-cards" aria-label="สรุปเหตุการณ์">
          {cards.map((c) => (
            <div key={c.title} className={`card sa-card${c.n === 0 ? ' sa-card-zero' : ''}`} style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="sa-card-head"><span className="sa-card-title">{c.title}</span></div>
              <div className="num sa-card-num">{c.n.toLocaleString('en-US')}</div>
              <div className="sa-card-sub">{c.sub}</div>
            </div>
          ))}
        </section>
      )}
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
                const type = r.type ?? '';
                const place = r.location.text ?? '';
                const rest = type && place.startsWith(type) ? place.slice(type.length).replace(/^[\s·]+/, '') : place;
                return (
                  <tr key={r.id} style={r.id === selectedId ? { background: '#eff6ff' } : undefined}>
                    <td><a className="link" href={erHref('incidents', { incident: r.id })} style={{ fontFamily: 'Inter, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.incidentNo}</a></td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{type || place || '—'}</div>
                      {rest && <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{rest}</div>}
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{r.counts.total}</td>
                    <td style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{dateTime(r.createdAt)}</td>
                    <td><BorrowCell b={r.borrow} /></td>
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
