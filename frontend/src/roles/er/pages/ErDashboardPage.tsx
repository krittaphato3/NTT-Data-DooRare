import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { KitStockCard } from '../components/KitStockCard';
import { getIncidentAccess } from '../data/access';
import { EMERGENCY_BORROWS } from '../data/incident';
import { statusMeta, useIncidents } from '../data/incidentStore';
import type { IncidentRecord } from '../data/incidentStore';
import { triageTotal } from '../data/intake';
import { erHref } from '../data/navigation';

const STEP_LABEL = ['', 'แจ้งเหตุ', 'ตรวจแผนของ Agent', 'ตรวจสต็อก', 'ยืนยันคำขอยืม', 'ส่งแล้ว'];

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 11.5, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: tone ?? '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
    </div>
  );
}

/** Requests still waiting for a lender's answer. The live mock incident has its own tracking data. */
function pendingRequests(r: IncidentRecord): number {
  if (r.seed === 'live') return EMERGENCY_BORROWS.filter((b) => b.hospitals.some((h) => h.status === 'pending')).length;
  return r.batches.reduce((n, b) => n + b.requests.length, 0);
}

function nextAction(r: IncidentRecord): string {
  if (r.planStale) return 'จำนวนผู้ป่วยเปลี่ยน · ต้องให้ Agent ประเมินแผนใหม่';
  if (r.status === 'planning') return `ค้างที่ขั้น ${r.step}/5 · ${STEP_LABEL[r.step]}`;
  return 'ส่งคำขอยืมแล้ว · รอผู้ให้ยืมตอบ / จัดชุด';
}

const CHIPS: { key: 'red' | 'yellow' | 'green' | 'black' | 'unknown'; label: string; color: string; bg: string }[] = [
  { key: 'red', label: 'แดง', color: '#b91c1c', bg: '#fee2e2' },
  { key: 'yellow', label: 'เหลือง', color: '#b45309', bg: '#fef3c7' },
  { key: 'green', label: 'เขียว', color: '#15803d', bg: '#dcfce7' },
  { key: 'black', label: 'ดำ', color: '#334155', bg: '#f1f5f9' },
  { key: 'unknown', label: 'ไม่ทราบ', color: '#6d28d9', bg: '#f5f3ff' },
];

/** ER home: every open incident with what to do next, totals across them, and kit stock. */
export function ErDashboardPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const open = useIncidents().filter((r) => r.status === 'planning' || r.status === 'sent');
  const patients = open.reduce((n, r) => n + triageTotal(r.intake), 0);
  const waiting = open.reduce((n, r) => n + pendingRequests(r), 0);
  const stale = open.filter((r) => r.planStale).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="หน้าหลัก ER" />
      <ErPageHeading
        title="หน้าหลัก ER"
        titleEn="/ ER home"
        subtitle="รพ.สมุทรปราการ · เหตุที่เปิดอยู่ทั้งหมด และสิ่งที่ต้องทำต่อของแต่ละเหตุ"
        actions={
          access.mayWrite && (
            <a className="btn btn-sm" style={{ background: '#b91c1c', color: '#ffffff', border: 'none', fontWeight: 600 }} href={erHref('flow')}>
              <Icon name="siren" className="ic14" />
              + แจ้งเหตุใหม่
            </a>
          )
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="เหตุที่เปิดอยู่" value={open.length} sub="กำลังวางแผน + ส่งคำขอยืมแล้ว" tone="#b91c1c" />
        <Kpi label="ผู้ป่วยรวมทุกเหตุ" value={patients} sub="ทุกระดับคัดแยก" />
        <Kpi label="คำขอยืมที่รอผู้ให้ตอบ" value={waiting} sub="รายการที่ส่งแล้ว" tone="#b45309" />
        <Kpi label="ต้องประเมินแผนใหม่" value={stale} sub="จำนวนผู้ป่วยเปลี่ยนหลังทำแผน" tone={stale ? '#dc2626' : '#15803d'} />
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>เหตุที่เปิดอยู่</div>
          <a className="link" style={{ fontSize: 12 }} href={erHref('incidents')}>
            ดูทั้งหมด (รวมที่ปิดแล้ว)
          </a>
        </div>
        {open.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#64748b' }}>ไม่มีเหตุฉุกเฉินที่เปิดอยู่</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {open.map((r) => {
              const meta = statusMeta(r);
              const resume = !r.seed && (r.status === 'planning' || r.planStale);
              return (
                <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#0f2a5c', fontSize: 13 }}>{r.id}</span>
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                      <span style={{ fontSize: 11.5, color: '#94a3b8' }}>แจ้งเมื่อ {r.createdAt}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f2a5c', margin: '3px 0' }}>
                      {r.intake.category} · {r.intake.location}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {CHIPS.filter((c) => c.key !== 'unknown' || Number(r.intake.unknown) > 0).map((c) => (
                        <span key={c.key} style={{ background: c.bg, color: c.color, borderRadius: 6, padding: '1px 8px', fontSize: 11.5, fontWeight: 600 }}>
                          {c.label} {Number(r.intake[c.key]) || 0}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: r.planStale ? '#92400e' : '#64748b', marginTop: 6 }}>{nextAction(r)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {access.mayWrite && resume && (
                      <a className="btn btn-p btn-sm" href={erHref('flow', { incident: r.id })}>
                        {r.planStale ? 'ประเมินแผนใหม่' : 'ทำต่อ →'}
                      </a>
                    )}
                    {r.status === 'sent' && !r.planStale && (
                      <a className="btn btn-p btn-sm" href={erHref('track')}>
                        ติดตามและจัดชุด
                      </a>
                    )}
                    <a className="btn btn-s btn-sm" href={erHref('incidents', { incident: r.id })}>
                      รายละเอียด
                    </a>
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
                { href: erHref('flow'), label: 'รับเหตุและวางแผน', hint: 'แจ้งเหตุ → Agent เสนอแผน → ตรวจสต็อก → ส่งคำขอยืม' },
                { href: erHref('track'), label: 'ติดตามคำขอและจัดชุด', hint: 'ดูผู้ให้ยืม เวลาที่เหลือ และยืนยันจัดชุด' },
                { href: erHref('summary'), label: 'สรุปและปิดเหตุการณ์', hint: 'หลังเหตุการณ์สงบ' },
              ].map((n) => (
                <a key={n.href} href={n.href} className="link" style={{ textDecoration: 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>{n.label}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>{n.hint}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <KitStockCard />
        </div>
      </div>
    </div>
  );
}
