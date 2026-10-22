import { useTick } from '../../../lib/time';
import type { ApiIncidentSummary } from '../../../services/incidentApi';
import { clock, dateTime, incidentStatusMeta, mmss, TRIAGE } from './format';

/** ETA line: reported time, arrival clock and a live countdown; the radio notice when no ETA could be guaranteed. */
export function EtaLine({ eta, status }: { eta: ApiIncidentSummary['eta']; status: ApiIncidentSummary['status'] }) {
  const tick = useTick();
  const running = ['OPEN', 'PLAN_REVIEW', 'ACTIVE', 'CLOSE_REQUESTED'].includes(status);
  if (eta.minutes === null) {
    return <span style={{ color: '#b91c1c', fontWeight: 600 }}>ไม่สามารถการันตี ETA — ใช้วิทยุสื่อสาร</span>;
  }
  const left = eta.remainingSec !== null ? Math.max(0, eta.remainingSec - tick) : null;
  return (
    <span>
      ETA {eta.minutes} นาที{eta.source === 'ROUTE' ? ' (จากเส้นทางจริง)' : ' (รายงานจากหน่วยกู้ภัย)'}
      {eta.unsure ? ' · ไม่แน่ใจ' : ''} · ถึงประมาณ <b>{clock(eta.arrivalAt)}</b>
      {running && left !== null && (left > 0 ? <> · เหลือ <b style={{ fontFamily: 'Inter, monospace', color: left < 300 ? '#b91c1c' : '#0f2a5c' }}>{mmss(left)}</b></> : <b style={{ color: '#b91c1c' }}> · ถึงเวลา ETA แล้ว (PATIENTS_ARRIVED)</b>)}
      {eta.flags.includes('ROUTE_UNAVAILABLE') && <span style={{ color: '#92400e' }}> · ไม่มีข้อมูลเส้นทางจริง</span>}
    </span>
  );
}

/** Situation card: number, status, place, patients per triage level, ETA. */
type HeaderIncident = Omit<ApiIncidentSummary, 'plan' | 'borrow'> & { plan: { revision: number } | null };

export function IncidentHeader({ incident, actions }: { incident: HeaderIncident; actions?: React.ReactNode }) {
  const meta = incidentStatusMeta(incident.status);
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Inter, monospace', fontWeight: 700, color: '#0f2a5c' }}>{incident.incidentNo}</span>
            <span className={`badge ${meta.cls}`}>{meta.label}</span>
            {incident.plan && <span className="badge t-grey">แผนฉบับที่ {incident.plan.revision}</span>}
            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>แจ้งเมื่อ {dateTime(incident.createdAt)}{incident.createdBy ? ` · ${incident.createdBy.name}` : ''}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f2a5c', marginTop: 4 }}>
            {incident.type ?? 'เหตุฉุกเฉิน'}
            {incident.location.text ? ` · ${incident.location.text}` : ''}
          </div>
          {incident.description && <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>{incident.description}</div>}
          <div style={{ fontSize: 12.5, color: '#334155', marginTop: 6 }}>
            <EtaLine eta={incident.eta} status={incident.status} />
          </div>
          {incident.cancelReason && <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 4 }}>ยกเลิก: {incident.cancelReason}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, marginTop: 12 }}>
        {TRIAGE.map((t) => (
          <div key={t.key} style={{ background: t.bg, color: t.color, borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{incident.counts[t.key]}</div>
          </div>
        ))}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f2a5c', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>รวม</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{incident.counts.total}</div>
        </div>
      </div>
    </div>
  );
}

export function Warnings({ items }: { items: { code: string; message: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div role="status" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#92400e', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((w) => (
        <div key={w.code}>{w.message}</div>
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#991b1b' }}>
      {message}
    </div>
  );
}
