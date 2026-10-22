import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import type { ApiIncidentSummary } from '../../../services/incidentApi';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { getIncidentAccess } from '../data/access';
import { erHref } from '../data/navigation';
import { EtaLine } from './IncidentHeader';
import { LiveKitStockCard } from './LivePack';
import { TRIAGE, dateTime, incidentStatusMeta } from './format';
import { useEmergencyInbox, useIncidentList } from './hooks';

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: tone ?? '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
    </div>
  );
}

function nextAction(i: ApiIncidentSummary): string {
  if (i.status === 'OPEN') return 'ยังไม่มีแผน · เปิด flow เพื่อให้ระบบคำนวณแผน';
  if (i.status === 'PLAN_REVIEW') return `แผนฉบับที่ ${i.plan?.revision ?? 1} รอตรวจและอนุมัติ`;
  if (i.status === 'CLOSE_REQUESTED') return 'ขอปิดเหตุการณ์แล้ว · รอลงนามร่วม';
  if (i.plan?.status === 'READY_FOR_APPROVAL') return `จำนวนผู้ป่วยเปลี่ยน · แผนฉบับที่ ${i.plan.revision} รออนุมัติ`;
  if (i.borrow.escalated > 0) return 'มีรายการที่ไม่มีโรงพยาบาลให้ยืม · ติดต่อด้วยวิทยุ';
  if (i.borrow.requests === 0) return 'อนุมัติแผนแล้ว · ตรวจสต็อกและส่งคำขอยืม';
  if (i.borrow.waiting > 0) return `รอผู้ให้ยืมตอบ ${i.borrow.waiting} คำขอ`;
  return 'ส่งคำขอยืมแล้ว · ติดตามการขนส่ง / จัดชุด';
}

/** ER home: every open incident with what to do next, totals across them, urgent requests from other hospitals, and kit stock. */
export function LiveErDashboard({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const list = useIncidentList('active');
  const inbox = useEmergencyInbox('pending');
  const open = list.items;
  const patients = open.reduce((n, i) => n + i.counts.total, 0);
  const waiting = open.reduce((n, i) => n + i.borrow.waiting, 0);
  const awaitingPlan = open.filter((i) => i.status === 'PLAN_REVIEW' || i.plan?.status === 'READY_FOR_APPROVAL').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="หน้าหลัก ER" />
      <ErPageHeading
        title="หน้าหลัก ER"
        titleEn="/ ER home"
        subtitle="เหตุการณ์ที่เปิดอยู่ทั้งหมด และสิ่งที่ต้องทำต่อของแต่ละเหตุ"
        actions={
          access.mayWrite && (
            <a className="btn btn-sm" style={{ background: '#b91c1c', color: '#ffffff', border: 'none', fontWeight: 600 }} href={erHref('flow', { new: '1' })}>
              <Icon name="siren" className="ic14" />
              + แจ้งเหตุใหม่
            </a>
          )
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="เหตุการณ์ที่เปิดอยู่" value={open.length} sub="รอแผน + กำลังดำเนินการ" tone="#b91c1c" />
        <Kpi label="ผู้ป่วยรวมทุกเหตุ" value={patients} sub="ทุกระดับคัดแยก" />
        <Kpi label="คำขอยืมที่รอผู้ให้ตอบ" value={waiting} sub="คำขอที่ส่งแล้ว" tone="#b45309" />
        <Kpi label="แผนรออนุมัติ" value={awaitingPlan} sub="ฉบับแรกหรือหลังจำนวนผู้ป่วยเปลี่ยน" tone={awaitingPlan ? '#dc2626' : '#15803d'} />
        <Kpi label="คำขอเร่งด่วนจาก รพ.อื่น" value={inbox.legs.length} sub="รอเราตอบ" tone={inbox.legs.length ? '#b91c1c' : '#15803d'} />
      </div>

      {inbox.legs.length > 0 && (
        <div role="status" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, color: '#991b1b', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>มี {inbox.legs.length} คำขอเร่งด่วนจากโรงพยาบาลอื่นรอตอบ (ผู้ให้ต้องตอบภายใน 3-5 นาที)</span>
          <a className="btn btn-p btn-sm" href={erHref('track')}>ไปตอบคำขอ →</a>
        </div>
      )}

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>เหตุการณ์ที่เปิดอยู่</div>
          <a className="link" style={{ fontSize: 12 }} href={erHref('incidents')}>ดูทั้งหมด (รวมที่ปิดแล้ว)</a>
        </div>
        {open.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#64748b' }}>{list.source === 'loading' ? 'กำลังโหลด…' : 'ไม่มีเหตุฉุกเฉินที่เปิดอยู่'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {open.map((r) => {
              const meta = incidentStatusMeta(r.status);
              const needsFlow = r.status === 'OPEN' || r.status === 'PLAN_REVIEW' || r.plan?.status === 'READY_FOR_APPROVAL';
              return (
                <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#0f2a5c', fontSize: 13 }}>{r.incidentNo}</span>
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                      <span style={{ fontSize: 11.5, color: '#94a3b8' }}>แจ้งเมื่อ {dateTime(r.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2a5c', margin: '3px 0' }}>{r.type ?? 'เหตุฉุกเฉิน'}{r.location.text ? ` · ${r.location.text}` : ''}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TRIAGE.filter((t) => t.key !== 'UNKNOWN' || r.counts.UNKNOWN > 0).map((t) => (
                        <span key={t.key} style={{ background: t.bg, color: t.color, borderRadius: 6, padding: '1px 8px', fontSize: 11.5, fontWeight: 600 }}>{t.label} {r.counts[t.key]}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}><EtaLine eta={r.eta} status={r.status} /></div>
                    <div style={{ fontSize: 12, color: needsFlow ? '#92400e' : '#64748b', marginTop: 2 }}>{nextAction(r)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {access.mayWrite && needsFlow && <a className="btn btn-p btn-sm" href={erHref('flow', { incident: r.id })}>ทำต่อ →</a>}
                    {r.status === 'ACTIVE' && <a className="btn btn-p btn-sm" href={erHref('track')}>ติดตามและจัดชุด</a>}
                    <a className="btn btn-s btn-sm" href={erHref('incidents', { incident: r.id })}>รายละเอียด</a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>ทางลัด</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: erHref('flow'), label: 'รับเหตุและวางแผน', hint: 'แจ้งเหตุ → ระบบคำนวณแผน → ตรวจสต็อก → ส่งคำขอยืม' },
                { href: erHref('track'), label: 'ติดตามคำขอและจัดชุด', hint: 'ดูผู้ให้ยืม เวลาที่เหลือ ยืนยันจัดชุด และตอบคำขอจาก รพ.อื่น' },
                { href: erHref('summary'), label: 'สรุปและปิดเหตุการณ์', hint: 'หลังเหตุการณ์สงบ · ER และเภสัชกรลงนามร่วม' },
              ].map((n) => (
                <a key={n.href} href={n.href} className="link" style={{ textDecoration: 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>{n.label}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>{n.hint}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: '1 1 340px', minWidth: 280 }}>
          <LiveKitStockCard />
        </div>
      </div>
    </div>
  );
}
