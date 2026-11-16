import { Fragment, useState } from 'react';
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

const SUB: React.CSSProperties = { fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: '16px' };

/** One request as a table row (plus a second row for the "give part" / "decline" inputs). Same look as the pharmacist's request table. */
function LegRow({ leg, canAct, actHint, reload }: { leg: ApiEmergencyLeg; canAct: boolean; actHint?: string; reload: () => void }) {
  const tick = useTick();
  const [mode, setMode] = useState<'none' | 'partial' | 'reject'>('none');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = legStatusMeta(leg.status);
  const cls = classMeta(leg.item.class);
  const left = leg.remainingSec !== null ? Math.max(0, leg.remainingSec - tick) : null;
  // a timed-out request that still lacks goods can be confirmed late (the first confirmation still wins)
  const late = leg.status !== 'SENT' && leg.canAnswerLate;
  const pending = leg.status === 'SENT' || late;
  const noStock = pending && leg.available < 1;
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
    <Fragment>
      <tr>
        <td style={{ minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{leg.item.name}</span>
            <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5, padding: '0 6px' }}>{cls.label}</span>
          </div>
          <div style={SUB}>{leg.request.requestNo} · เหตุ {leg.incident.incidentNo}{leg.incident.type ? ` · ${leg.incident.type}` : ''}</div>
          {leg.item.blood && <div style={{ ...SUB, color: '#b91c1c' }}>เลือด PRC กรุ๊ป O: ธนาคารเลือดต้องยืนยัน ABO/Rh และ cross-match · คืนเป็นเลือดทดแทน</div>}
        </td>
        <td className="r" style={{ whiteSpace: 'nowrap' }}>
          <b style={{ fontSize: 14 }}>{num(leg.qtyAsked)}</b> <span style={{ color: '#64748b', fontSize: 12 }}>{leg.item.unit}</span>
          {pending && <div style={{ ...SUB, color: noStock ? '#b91c1c' : '#64748b' }}>เรามี {num(leg.available)}</div>}
        </td>
        <td>
          <div style={{ fontWeight: 500 }}>{leg.borrower.name}</div>
          {leg.transitMin !== null && <div style={SUB}>เดินทาง {num(Math.round(leg.transitMin))} นาที</div>}
        </td>
        <td>
          <span className={`badge ${st.cls}`} style={{ whiteSpace: 'nowrap' }}>{st.label}</span>
          {leg.round > 1 && <div style={SUB}>รอบที่ {leg.round}</div>}
          {!pending && leg.qtyAccepted !== null && <div style={SUB}>ยืนยัน {num(leg.qtyAccepted)} {leg.item.unit}{leg.task ? ` · ${leg.task.taskNo}` : ''}</div>}
          {leg.rejectReason && <div style={SUB}>{REJECT_TEXT[leg.rejectReason] ?? leg.rejectReason}</div>}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {pending && left !== null && !late ? (
            <b style={{ fontFamily: 'Inter, monospace', fontSize: 14, color: left < 60 ? '#b91c1c' : '#0f172a' }}>{mmss(left)}</b>
          ) : late ? (
            <span style={{ fontSize: 12, color: '#64748b' }}>ยืนยันช้าได้</span>
          ) : (
            <span style={{ color: '#cbd5e1' }}>—</span>
          )}
          {leg.incident.eta.arrivalAt && <div style={SUB}>ผู้ป่วยถึง {clock(leg.incident.eta.arrivalAt)}</div>}
          {leg.lateForEta && <div style={{ ...SUB, color: '#b91c1c' }}>ของถึงหลังผู้ป่วย</div>}
        </td>
        <td className="r" style={{ whiteSpace: 'nowrap' }}>
          {pending ? (
            noStock ? (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>ไม่มีสต็อก</span>
                {!late && <button type="button" className="btn btn-s btn-sm" disabled={!canAct || busy} title={canAct ? undefined : actHint} onClick={() => setMode(mode === 'reject' ? 'none' : 'reject')}>ปฏิเสธ</button>}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-p btn-sm" disabled={!canAct || busy} title={canAct ? undefined : actHint} onClick={() => void answer({ decision: 'CONFIRM' })}>
                  ยืนยัน {num(Math.min(leg.qtyAsked, leg.available))}
                </button>
                {leg.qtyAsked >= 2 && (
                  <button type="button" className="btn btn-s btn-sm" disabled={!canAct || busy} title={canAct ? undefined : actHint} onClick={() => { setMode(mode === 'partial' ? 'none' : 'partial'); setQty(String(Math.max(1, Math.min(leg.qtyAsked - 1, leg.available)))); }}>บางส่วน</button>
                )}
                {!late && <button type="button" className="btn btn-s btn-sm" disabled={!canAct || busy} title={canAct ? undefined : actHint} onClick={() => setMode(mode === 'reject' ? 'none' : 'reject')}>ปฏิเสธ</button>}
              </div>
            )
          ) : null}
        </td>
      </tr>
      {(mode !== 'none' || error || (pending && !enough && !noStock)) && (
        <tr>
          <td colSpan={6} style={{ background: '#f8fafc' }}>
            {mode === 'partial' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: '#475569' }}>จำนวนที่ให้</span>
                <input type="number" min={1} max={leg.qtyAsked - 1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="จำนวนที่ให้" style={{ width: 80, height: 30, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontFamily: 'inherit' }} />
                <span style={{ fontSize: 12, color: '#64748b' }}>จาก {num(leg.qtyAsked)} {leg.item.unit} · ที่เหลือระบบจะขอโรงพยาบาลถัดไป</span>
                <button type="button" className="btn btn-p btn-sm" disabled={busy || !(Number(qty) >= 1 && Number(qty) < leg.qtyAsked)} onClick={() => void answer({ decision: 'PARTIAL', qty: Number(qty) })}>ยืนยันบางส่วน</button>
              </div>
            )}
            {mode === 'reject' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ปฏิเสธ (อย่างน้อย 3 ตัวอักษร)" aria-label="เหตุผลที่ปฏิเสธ" style={{ flex: '1 1 260px', height: 30, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 10px', fontFamily: 'inherit' }} />
                <button type="button" className="btn btn-s btn-sm" disabled={busy || reason.trim().length < 3} onClick={() => void answer({ decision: 'REJECT', reason: reason.trim() })}>ยืนยันปฏิเสธ</button>
              </div>
            )}
            {mode === 'none' && pending && !enough && !noStock && <span style={{ fontSize: 12, color: '#64748b' }}>สต็อกเราไม่พอตามที่ขอ ยืนยันได้ {num(leg.available)} {leg.item.unit} หรือให้บางส่วน</span>}
            {error && <ErrorNote message={error} />}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function LegTable({ legs, canAct, actHint, reload }: { legs: ApiEmergencyLeg[]; canAct: boolean; actHint?: string; reload: () => void }) {
  return (
    <div className="card" style={{ padding: '6px 18px 10px' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="qt" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th scope="col">รายการที่ขอ</th>
              <th scope="col" className="r">จำนวน</th>
              <th scope="col">ผู้ขอยืม</th>
              <th scope="col">สถานะ</th>
              <th scope="col">เวลาที่เหลือ</th>
              <th scope="col" aria-label="ตอบคำขอ" />
            </tr>
          </thead>
          <tbody>
            {legs.map((l) => <LegRow key={l.id} leg={l} canAct={canAct} actHint={actHint} reload={reload} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Urgent requests other hospitals sent to this hospital (F3 lender side): confirm, give part, or decline. Waiting requests come
 * first, then the ones in progress; finished and declined ones are history, folded away.
 */
export function LiveInbox({ legs, canAct, actHint, reload, empty = 'ไม่มีคำขอเร่งด่วนจากโรงพยาบาลอื่น' }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const pending = legs.filter((l) => l.status === 'SENT' || l.canAnswerLate);
  const active = legs.filter((l) => ['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'].includes(l.status));
  const history = legs.filter((l) => !l.canAnswerLate && !['SENT', 'ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT'].includes(l.status));
  if (pending.length + active.length === 0 && history.length === 0) return <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>{empty}</div>;
  const head = (text: string, n: number) => <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2a5c' }}>{text} <span style={{ fontWeight: 500, color: '#64748b' }}>({n})</span></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pending.length > 0 ? (
        <>
          {head('รอเราตอบ', pending.length)}
          <LegTable legs={pending} canAct={canAct} actHint={actHint} reload={reload} />
          <div style={{ fontSize: 11.5, color: '#64748b' }}>รายแรกที่ยืนยันได้จำนวนนั้นได้งานไป โรงพยาบาลอื่นที่ถูกขอพร้อมกันจะถูกปรับหรือยกเลิกทันที · ไม่ตอบภายในเวลาถือเป็นการปฏิเสธ</div>
        </>
      ) : (
        <div className="card" style={{ padding: '12px 18px', fontSize: 12.5, color: '#475569' }}>ไม่มีคำขอที่รอเราตอบ</div>
      )}
      {active.length > 0 && (
        <>
          {head('กำลังจัดส่ง', active.length)}
          <LegTable legs={active} canAct={false} reload={reload} />
        </>
      )}
      {history.length > 0 && (
        <button type="button" className="btn btn-s btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'ซ่อนประวัติ' : `ดูประวัติคำขอ (${history.length})`}
        </button>
      )}
      {showHistory && <LegTable legs={history.slice(0, 20)} canAct={false} reload={reload} />}
    </div>
  );
}
