import { useState } from 'react';
import { useTick } from '../../../lib/time';
import { confirmEmergencyLeg } from '../../../services/incidentApi';
import type { ApiEmergencyLeg } from '../../../services/incidentApi';
import { ErrorNote } from './IncidentHeader';
import { classMeta, clock, errorText, legStatusMeta, mmss, num, REJECT_TEXT } from './format';

interface Props {
  legs: ApiEmergencyLeg[];
  /** Whether this role may answer (ER staff, warehouse officer, pharmacist of the lending hospital). */
  canAct: boolean;
  actHint?: string;
  reload: () => void;
  empty?: string;
}

function LegCard({ leg, canAct, actHint, reload }: { leg: ApiEmergencyLeg; canAct: boolean; actHint?: string; reload: () => void }) {
  const tick = useTick();
  const [mode, setMode] = useState<'none' | 'partial' | 'reject'>('none');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = legStatusMeta(leg.status);
  const cls = classMeta(leg.item.class);
  const left = leg.remainingSec !== null ? Math.max(0, leg.remainingSec - tick) : null;
  const etaLeft = leg.incident.eta.remainingSec !== null ? Math.max(0, leg.incident.eta.remainingSec - tick) : null;
  const pending = leg.status === 'SENT';
  const enough = leg.available >= leg.qtyAsked;

  const answer = async (body: { decision: 'CONFIRM' | 'PARTIAL' | 'REJECT'; qty?: number; reason?: string }) => {
    setBusy(true);
    setError(null);
    try {
      await confirmEmergencyLeg(leg.id, body);
      setMode('none');
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: '14px 18px', border: pending ? '1px solid #fca5a5' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f2a5c' }}>{leg.item.name} × {num(leg.qtyAsked)} {leg.item.unit}</span>
            <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5 }}>{cls.label}</span>
            <span className={`badge ${st.cls}`}>{st.label}</span>
            {leg.round > 1 && <span className="badge t-grey">รอบที่ {leg.round}</span>}
            {leg.lateForEta && <span className="badge st-rejected">ถึงหลัง ETA</span>}
          </div>
          <div style={{ fontSize: 12.5, color: '#334155', marginTop: 4 }}>
            จาก <b>{leg.borrower.name}</b> · เหตุ {leg.incident.incidentNo}{leg.incident.type ? ` · ${leg.incident.type}` : ''}{leg.incident.location ? ` · ${leg.incident.location}` : ''}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            คำขอ {leg.request.requestNo} · ต้องการรวม {num(leg.qtyRequested)} {leg.item.unit} · ผู้ป่วยถึงประมาณ {clock(leg.incident.eta.arrivalAt)}
            {etaLeft !== null && leg.incident.status === 'ACTIVE' ? ` (อีก ${mmss(etaLeft)})` : ''}{leg.transitMin !== null ? ` · เดินทางมาหาเขา ${num(leg.transitMin)} นาที` : ''}
          </div>
          {leg.item.blood && <div style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 2 }}>เลือด PRC กรุ๊ป O: ธนาคารเลือดต้องยืนยัน ABO/Rh และ cross-match · คืนเป็น BLOOD_REPLACEMENT</div>}
          {pending && <div style={{ fontSize: 12, color: enough ? '#166534' : '#92400e', marginTop: 2 }}>สต็อกของเราที่ใช้ได้ {num(leg.available)} {leg.item.unit}{enough ? '' : ' · ไม่พอสำหรับที่ขอ ยืนยันได้บางส่วน'}</div>}
          {!pending && leg.qtyAccepted !== null && <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>ยืนยัน {num(leg.qtyAccepted)} {leg.item.unit}{leg.respondedAt ? ` เวลา ${clock(leg.respondedAt)}` : ''}{leg.task ? ` · งานขนส่ง ${leg.task.taskNo}` : ''}</div>}
          {leg.rejectReason && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{REJECT_TEXT[leg.rejectReason] ?? `เหตุผล: ${leg.rejectReason}`}</div>}
        </div>
        {pending && left !== null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>ต้องตอบภายใน</div>
            <div style={{ fontFamily: 'Inter, monospace', fontWeight: 700, fontSize: 22, color: left < 60 ? '#b91c1c' : '#e11d48' }}>{mmss(left)}</div>
          </div>
        )}
      </div>
      {pending && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!canAct || busy || leg.available < 1} title={canAct ? undefined : actHint} onClick={() => void answer({ decision: 'CONFIRM' })}>
              ยืนยัน {num(Math.min(leg.qtyAsked, leg.available))} {leg.item.unit}
            </button>
            <button type="button" className="btn btn-s" disabled={!canAct || busy || leg.available < 1 || leg.qtyAsked < 2} title={canAct ? undefined : actHint} onClick={() => { setMode(mode === 'partial' ? 'none' : 'partial'); setQty(String(Math.max(1, Math.min(leg.qtyAsked - 1, leg.available)))); }}>ให้บางส่วน</button>
            <button type="button" className="btn btn-g" disabled={!canAct || busy} title={canAct ? undefined : actHint} onClick={() => setMode(mode === 'reject' ? 'none' : 'reject')}>ปฏิเสธ</button>
          </div>
          {mode === 'partial' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" min={1} max={leg.qtyAsked - 1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="จำนวนที่ให้" style={{ width: 90, height: 34, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontFamily: 'inherit' }} />
              <span style={{ fontSize: 12, color: '#64748b' }}>จาก {num(leg.qtyAsked)} {leg.item.unit} · ที่เหลือระบบจะขอจากโรงพยาบาลถัดไป</span>
              <button type="button" className="btn btn-p btn-sm" disabled={busy || !(Number(qty) >= 1 && Number(qty) < leg.qtyAsked)} onClick={() => void answer({ decision: 'PARTIAL', qty: Number(qty) })}>ยืนยันบางส่วน</button>
            </div>
          )}
          {mode === 'reject' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ปฏิเสธ (อย่างน้อย 3 ตัวอักษร)" aria-label="เหตุผลที่ปฏิเสธ" style={{ flex: '1 1 260px', height: 34, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 10px', fontFamily: 'inherit' }} />
              <button type="button" className="btn btn-sm" style={{ background: '#b91c1c', color: '#fff', border: 'none' }} disabled={busy || reason.trim().length < 3} onClick={() => void answer({ decision: 'REJECT', reason: reason.trim() })}>ยืนยันปฏิเสธ</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8' }}>รายแรกที่ยืนยันได้จำนวนนั้น โรงพยาบาลอื่นที่ถูกขอพร้อมกันจะถูกปรับหรือยกเลิกทันที · ถ้าไม่ตอบภายในเวลา ถือเป็นการปฏิเสธและระบบขอโรงพยาบาลถัดไป</div>
        </div>
      )}
      <div style={{ marginTop: 6 }}><ErrorNote message={error} /></div>
    </div>
  );
}

/**
 * Urgent requests other hospitals sent to this hospital (F3 lender side): confirm, give part, or decline. Waiting requests come
 * first, then the ones in progress; finished and declined ones are history, folded away.
 */
export function LiveInbox({ legs, canAct, actHint, reload, empty = 'ไม่มีคำขอเร่งด่วนจากโรงพยาบาลอื่น' }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const pending = legs.filter((l) => l.status === 'SENT');
  const active = legs.filter((l) => ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'].includes(l.status));
  const history = legs.filter((l) => !['SENT', 'ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'].includes(l.status));
  if (pending.length + active.length === 0 && history.length === 0) return <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>{empty}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pending.length === 0 && <div className="card" style={{ padding: '12px 18px', fontSize: 12.5, color: '#166534' }}>ไม่มีคำขอที่รอเราตอบ</div>}
      {pending.map((l) => <LegCard key={l.id} leg={l} canAct={canAct} actHint={actHint} reload={reload} />)}
      {active.length > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2a5c', marginTop: 4 }}>ยืนยันแล้ว · อยู่ระหว่างจัดส่ง ({active.length})</div>}
      {active.map((l) => <LegCard key={l.id} leg={l} canAct={false} reload={reload} />)}
      {history.length > 0 && (
        <button type="button" className="btn btn-s btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'ซ่อนประวัติ' : `ดูประวัติคำขอ (${history.length})`}
        </button>
      )}
      {showHistory && history.slice(0, 20).map((l) => <LegCard key={l.id} leg={l} canAct={false} reload={reload} />)}
    </div>
  );
}
