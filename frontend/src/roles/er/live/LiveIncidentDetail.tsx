import { useState } from 'react';
import { approvePlan, closeIncident, updateCounts } from '../../../services/incidentApi';
import type { ApiIncidentDetail, TriageLevel } from '../../../services/incidentApi';
import type { IncidentAccess } from '../data/access';
import { erHref } from '../data/navigation';
import { ErrorNote, IncidentHeader, Warnings } from './IncidentHeader';
import { LiveBorrowStatus } from './LiveBorrowStatus';
import { LiveExtrasTable, LiveKitTable, PlanNotes } from './PlanTables';
import { dateTime, errorText, TRIAGE } from './format';

const cardTitle = { fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 } as const;
const OPEN = ['OPEN', 'PLAN_REVIEW', 'ACTIVE'];

/** Change the patient counts and / or ETA. The API opens a new plan revision that has to be approved again (BR-F3-026). */
function UpdateForm({ incident, onDone }: { incident: ApiIncidentDetail; onDone: () => void }) {
  const [counts, setCounts] = useState<Record<TriageLevel, string>>({
    RED: String(incident.counts.RED), YELLOW: String(incident.counts.YELLOW), GREEN: String(incident.counts.GREEN), BLACK: String(incident.counts.BLACK), UNKNOWN: String(incident.counts.UNKNOWN),
  });
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const changed = TRIAGE.filter((t) => Number(counts[t.key]) !== incident.counts[t.key]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const body: Parameters<typeof updateCounts>[1] = { note: note.trim() || undefined, version: incident.version };
      if (changed.length > 0) body.counts = Object.fromEntries(changed.map((t) => [t.key, Number(counts[t.key])]));
      if (eta.trim() !== '') body.reportedEtaMin = Number(eta);
      const r = await updateCounts(incident.id, body);
      setDone(r.data.newPlanRevision ? `บันทึกแล้ว · ระบบทำแผนฉบับที่ ${r.data.newPlanRevision} รอตรวจและอนุมัติ` : 'บันทึกแล้ว');
      setNote('');
      setEta('');
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={cardTitle}>อัปเดตจำนวนผู้ป่วย / ETA</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        {TRIAGE.map((t) => (
          <label key={t.key} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 8, textAlign: 'center', display: 'block' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: t.color, marginBottom: 4 }}>{t.label}</span>
            <input type="number" min={0} value={counts[t.key]} onChange={(e) => setCounts({ ...counts, [t.key]: e.target.value })} style={{ width: '100%', height: 30, textAlign: 'center', fontSize: 15, fontWeight: 700, color: t.color, border: `1px solid ${t.border}`, borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
          ETA ใหม่ (นาทีจากนี้)
          <input type="number" min={1} value={eta} onChange={(e) => setEta(e.target.value)} placeholder="ไม่เปลี่ยน" style={{ display: 'block', width: 120, height: 34, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', flex: '1 1 240px' }}>
          หมายเหตุ
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น รถพยาบาลรายงานเพิ่ม" style={{ display: 'block', width: '100%', height: 34, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </label>
        <button type="button" className="btn btn-p" disabled={busy || (changed.length === 0 && eta.trim() === '' && note.trim() === '')} onClick={() => void submit()}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกการอัปเดต'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>จำนวนเปลี่ยน → ระบบทำแผนฉบับใหม่ให้ตรวจ ส่วนที่ขาดเพิ่มจะขอยืมเพิ่มเฉพาะส่วนต่าง ถ้าลดจำนวน คำขอที่ยังรอตอบจะถูกปรับลด ส่วนที่ยืนยันแล้วคงไว้</div>
      <div style={{ marginTop: 8 }}><ErrorNote message={error} /></div>
      {done && <div style={{ marginTop: 8, fontSize: 12.5, color: '#166534' }}>{done}</div>}
    </div>
  );
}

/** One incident: situation, plan and stock result, borrow request status, history, and the update form. */
export function LiveIncidentDetail({ incident, access, reload }: { incident: ApiIncidentDetail; access: IncidentAccess; reload: () => void }) {
  const open = OPEN.includes(incident.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const approve = async () => {
    if (!incident.plan?.id) return;
    setBusy(true);
    setError(null);
    try {
      await approvePlan(incident.id, incident.plan.id);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await closeIncident(incident.id, { mode: 'CANCEL', reason: (cancelReason ?? '').trim() });
      setCancelReason(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const plan = incident.plan;
  const waitingApproval = plan?.status === 'READY_FOR_APPROVAL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <IncidentHeader
        incident={incident}
        actions={
          open && access.mayWrite ? (
            <>
              <a className="btn btn-p" href={erHref('flow', { incident: incident.id })}>เปิดใน flow →</a>
              <a className="btn btn-s" href={erHref('track')}>ติดตามคำขอและจัดชุด</a>
            </>
          ) : undefined
        }
      />
      <Warnings items={incident.warnings} />
      <ErrorNote message={error} />

      {open && waitingApproval && access.mayApprovePlan && (
        <div role="status" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#92400e', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>แผนฉบับที่ {plan?.revision} รออนุมัติ{incident.status === 'ACTIVE' ? ' · แผนเดิมยังใช้อยู่จนกว่าจะอนุมัติฉบับนี้' : ''}</span>
          <button type="button" className="btn btn-p btn-sm" disabled={busy} onClick={() => void approve()}>อนุมัติแผนฉบับที่ {plan?.revision}</button>
        </div>
      )}

      {plan ? (
        <>
          <LiveKitTable plan={plan} editable={false} />
          <LiveExtrasTable plan={plan} editable={false} />
          <PlanNotes plan={plan} />
        </>
      ) : (
        <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>ยังไม่มีแผน — เปิดใน flow เพื่อให้ระบบคำนวณแผน</div>
      )}

      {(incident.borrowLines.length > 0 || open) && (
        <div>
          <div style={cardTitle}>สถานะคำขอยืม · แยกตามโรงพยาบาล</div>
          <LiveBorrowStatus lines={incident.borrowLines} />
        </div>
      )}

      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={cardTitle}>ประวัติการอัปเดต</div>
        {incident.updates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#94a3b8' }}>ยังไม่มีการอัปเดต</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: '22px' }}>
            {[...incident.updates].reverse().map((u, i) => (
              <li key={i}>
                <b style={{ fontFamily: 'Inter, monospace' }}>{dateTime(u.at)}</b> · {u.action === 'INCIDENT_COUNTS_UPDATED' ? (u.changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join(' · ') || 'อัปเดต ETA / หมายเหตุ') : ACTION_TEXT[u.action] ?? u.action}
                {u.note ? ` · ${u.note}` : ''}
                {u.by ? <span style={{ color: '#94a3b8' }}> · {u.by}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && access.mayWrite && <UpdateForm key={`${incident.id}-${incident.version}`} incident={incident} onDone={reload} />}

      {open && access.mayWrite && (
        <div className="card" style={{ padding: '12px 18px' }}>
          {cancelReason === null ? (
            <button type="button" className="btn btn-g btn-sm" onClick={() => setCancelReason('')}>ยกเลิกเหตุ (แจ้งผิด)</button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="เหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)" style={{ flex: '1 1 260px', height: 34, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 10px', fontFamily: 'inherit' }} />
              <button type="button" className="btn btn-sm" style={{ background: '#b91c1c', color: '#fff', border: 'none' }} disabled={busy || cancelReason.trim().length < 3} onClick={() => void cancel()}>ยืนยันยกเลิกเหตุ</button>
              <button type="button" className="btn btn-s btn-sm" onClick={() => setCancelReason(null)}>ไม่ยกเลิก</button>
              <span style={{ fontSize: 11, color: '#94a3b8', flexBasis: '100%' }}>คำขอที่ยังรอตอบจะถูกยกเลิก ส่วนที่ผู้ให้ยืมยืนยันแล้วยังคงต้องรับและคืนตามปกติ</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  INCIDENT_CREATED: 'แจ้งเหตุ',
  INCIDENT_CLOSE_REQUESTED: 'ขอปิดเหตุการณ์',
  INCIDENT_RECONCILED: 'สรุปเหตุการณ์ (ลงนามร่วม ER + เภสัชกร)',
  INCIDENT_CANCELLED: 'ยกเลิกเหตุการณ์',
  ETA_UNAVAILABLE: 'ไม่สามารถการันตี ETA — ใช้วิทยุสื่อสาร',
  INCIDENT_USAGE_RECORDED: 'บันทึกการใช้เวชภัณฑ์',
};
