import { Icon } from '../../../../components/common/icons';
import type { IncidentAccess } from '../../data/access';
import { LENDERS } from '../../data/stockCheck';
import type { BorrowRequestDraft } from '../../data/stockCheck';

interface BorrowConfirmStepProps {
  requests: BorrowRequestDraft[];
  etaMin: number;
  /** `${requestId}|${hospital}` the user has switched off. */
  excluded: Set<string>;
  /** `${requestId}|${hospital}` already sent. */
  sentKeys: Set<string>;
  note: string;
  access: IncidentAccess;
  onToggle: (key: string) => void;
  onNote: (v: string) => void;
  onBack: () => void;
  /** Send the checked, unsent items of one hospital. */
  onSendHospital: (hospital: string) => void;
  /** Send everything checked and not yet sent, to every hospital. */
  onSendAll: () => void;
}

/**
 * Step 4: the requests the Agent drafted, grouped by lender hospital. Staff tick items off and confirm
 * each hospital separately (or all at once); a hospital that was already sent is locked.
 */
export function BorrowConfirmStep({ requests, etaMin, excluded, sentKeys, note, access, onToggle, onNote, onBack, onSendHospital, onSendAll }: BorrowConfirmStepProps) {
  const chosen = (r: BorrowRequestDraft) => r.lenders.filter((h) => !excluded.has(`${r.id}|${h.name}`) || sentKeys.has(`${r.id}|${h.name}`));
  const uncovered = requests.filter((r) => chosen(r).length === 0);
  // Hospitals the Agent picked, nearest first, each with the items it is asked for.
  const hospitals = LENDERS.filter((h) => requests.some((r) => r.lenders.some((l) => l.name === h.name)));
  const unsent = (name: string) =>
    requests.filter((r) => r.lenders.some((l) => l.name === name) && !excluded.has(`${r.id}|${name}`) && !sentKeys.has(`${r.id}|${name}`));
  const totalUnsent = hospitals.reduce((n, h) => n + unsent(h.name).length, 0);
  const canSend = access.mayWrite && uncovered.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#1e3a8a', lineHeight: '19px' }}>
        <b>Agent เลือกโรงพยาบาลผู้ให้ยืมแล้ว</b> · ส่งถึงโรงพยาบาลที่มาถึงทันภายใน ETA {etaMin} นาที · ยืนยันส่งทีละโรงพยาบาลหรือส่งทั้งหมดก็ได้ · รายแรกที่ยืนยันได้จำนวนนั้น ที่เหลือถูกปรับ/ยกเลิกอัตโนมัติ · Agent ไม่ส่งเอง ต้องให้เจ้าหน้าที่กดยืนยัน
      </div>

      {hospitals.map((h) => {
        const rows = requests.filter((r) => r.lenders.some((l) => l.name === h.name));
        const keyOf = (r: BorrowRequestDraft) => `${r.id}|${h.name}`;
        const pending = unsent(h.name);
        const sentCount = rows.filter((r) => sentKeys.has(keyOf(r))).length;
        const editable = rows.filter((r) => !sentKeys.has(keyOf(r)));
        const onCount = editable.filter((r) => !excluded.has(keyOf(r))).length;
        return (
          <div key={h.name} className="card" style={{ padding: '14px 18px', borderColor: pending.length === 0 && sentCount > 0 ? '#bbf7d0' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  aria-label={`เลือกทุกรายการของ ${h.name}`}
                  disabled={editable.length === 0}
                  checked={editable.length > 0 && onCount === editable.length}
                  ref={(el) => {
                    if (el) el.indeterminate = onCount > 0 && onCount < editable.length;
                  }}
                  onChange={() => editable.forEach((r) => (onCount === editable.length) === !excluded.has(keyOf(r)) && onToggle(keyOf(r)))}
                  style={{ accentColor: '#2563eb' }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>{h.name}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>เดินทาง {h.travelMin} นาที</span>
                {sentCount > 0 && <span className="badge st-approved">ส่งแล้ว {sentCount}/{rows.length}</span>}
              </div>
              <button
                type="button"
                className="btn btn-p btn-sm"
                style={{ fontWeight: 600 }}
                disabled={!access.mayWrite || pending.length === 0}
                title={access.mayWrite ? undefined : access.writeHint}
                onClick={() => onSendHospital(h.name)}
              >
                <Icon name="send" className="ic14" />
                {pending.length ? `ยืนยันและส่งให้ ${h.name} (${pending.length} รายการ)` : 'ไม่มีรายการที่ต้องส่ง'}
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="qt" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 50 }}>ส่ง</th>
                    <th scope="col">รายการที่ขอยืม</th>
                    <th scope="col" className="r">จำนวน</th>
                    <th scope="col">ต้องตอบภายใน</th>
                    <th scope="col">เทียบกับ ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = keyOf(r);
                    const sent = sentKeys.has(key);
                    const lender = r.lenders.find((l) => l.name === h.name);
                    return (
                      <tr key={key} style={excluded.has(key) && !sent ? { opacity: 0.5 } : undefined}>
                        <td>
                          <input type="checkbox" disabled={sent} checked={sent || !excluded.has(key)} onChange={() => onToggle(key)} style={{ accentColor: '#2563eb' }} />
                        </td>
                        <td style={{ fontWeight: 600, color: '#0f2a5c' }}>
                          {r.item}{' '}
                          <span className={`badge ${r.urgent ? 'ug-critical' : 'ug-normal'}`} style={{ height: 18, fontSize: 10.5, padding: '0 5px' }}>
                            {r.urgent ? 'วิกฤต' : 'สนับสนุน'}
                          </span>{' '}
                          <span style={{ fontFamily: 'Inter, monospace', fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{r.id}</span>
                        </td>
                        <td className="r" style={{ fontWeight: 700 }}>{r.qty} <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 400 }}>{r.unit}</span></td>
                        <td>{r.timeoutMin} นาที</td>
                        <td>
                          {sent ? (
                            <span className="badge st-approved">ส่งแล้ว · รอตอบ</span>
                          ) : (
                            <span className={`badge ${lender?.inTime ? 'st-approved' : 'st-pending'}`}>{lender?.inTime ? `ทันภายใน ${etaMin} นาที` : 'ไม่ทัน ETA (LATE_FOR_ETA)'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {uncovered.length > 0 && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#b91c1c' }}>
          ยังไม่มีผู้ให้ยืมสำหรับ: {uncovered.map((r) => r.item).join(', ')} · ต้องเลือกอย่างน้อย 1 โรงพยาบาลต่อรายการ
        </div>
      )}

      <div className="card" style={{ padding: '14px 18px' }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>หมายเหตุถึงผู้ให้ยืม (ไม่บังคับ · ใช้กับการส่งครั้งถัดไป)</label>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="เช่น ขอให้จัดส่งด่วนที่ ER ประตูหลัง"
          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>

      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: '#475569' }}>
          รอส่ง {totalUnsent} รายการ · ส่งแล้ว {sentKeys.size} · ผู้ป่วยถึงใน ~{etaMin} นาที
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-s" onClick={onBack}>
            ← กลับ
          </button>
          <button
            type="button"
            className="btn btn-p"
            style={{ fontWeight: 600 }}
            disabled={!canSend || totalUnsent === 0}
            title={access.mayWrite ? undefined : access.writeHint}
            onClick={onSendAll}
          >
            <Icon name="send" className="ic14" />
            ส่งทุกโรงพยาบาลที่เหลือ
          </button>
        </div>
      </div>
    </div>
  );
}
