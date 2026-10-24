import { useEffect, useState } from 'react';
import { getExtraSuggestions, requestExtraSuggestions } from '../../../services/incidentApi';
import type { ApiExtraSuggestion } from '../../../services/incidentApi';

interface Props {
  incidentId: string;
  /** Drug master ids already in the plan (their "add" is replaced by "in plan"). */
  extrasInPlan: string[];
  /** Staff who may edit the plan add items; everyone else only reads the suggestion (`onAdd` undefined). */
  onAdd?: (drugMasterId: string, qty: number, name: string) => void;
  /** May ask the agent for a (new) opinion. */
  mayAsk: boolean;
  disabled?: boolean;
}

const STATUS_HINT: Record<string, string> = {
  FALLBACK: 'Agent ตอบไม่ได้หรือไม่ผ่านการตรวจ (หรือยังไม่ได้ตั้งค่า LLM) — ใช้แผนตามกฎต่อไป',
  SKIPPED: 'ปิด Agent อยู่ — ใช้แผนตามกฎ',
};

/**
 * AGT-F3: the second opinion on items outside the preset kits. The rule plan is already on screen; this only suggests extras and the
 * staff add them one by one (or all) through the normal plan edit. Nothing is added by the agent itself.
 */
export function AgentExtrasPanel({ incidentId, extrasInPlan, onAdd, mayAsk, disabled = false }: Props) {
  const [data, setData] = useState<ApiExtraSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [version, setVersion] = useState(0);

  // load the latest result and, while the agent runs in the background, poll until it is done
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      getExtraSuggestions(incidentId)
        .then((r) => {
          if (!alive) return;
          setData(r.data.latest);
          setLoading(r.data.running);
          if (r.data.running) timer = setTimeout(load, 3000);
        })
        .catch(() => { if (alive) { setData(null); setLoading(false); } });
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [incidentId, version]);

  const ask = () => {
    setLoading(true);
    setError(null);
    requestExtraSuggestions(incidentId)
      .then(() => { setQty({}); setVersion((v) => v + 1); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  };
  const open = (data?.suggestions ?? []).filter((s) => !extrasInPlan.includes(s.drugMasterId));
  const addAll = () => open.forEach((s) => onAdd?.(s.drugMasterId, qty[s.drugMasterId] ?? s.qty, s.name));

  return (
    <div className="card" style={{ padding: '14px 16px' }} data-part="agent-extras">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c' }}>
          ข้อเสนอของ Agent · รายการนอกชุด <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>AGT-F3</span>
        </div>
        {mayAsk && (
          <button type="button" className="btn btn-s btn-sm" disabled={loading || disabled} onClick={ask}>
            {loading ? 'Agent กำลังวิเคราะห์…' : data ? 'ขอความเห็นใหม่' : 'ขอความเห็น Agent'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        ชุดยามาจากกฎและขึ้นทันที ส่วนนี้ให้ Agent แนะนำของนอกชุดที่ควรเตรียมเพิ่มตามประเภทเหตุและจำนวนผู้ป่วย · เป็นข้อเสนอให้ทีมตรวจ ไม่ใช่คำแนะนำทางคลินิก และไม่เพิ่มเข้าแผนเอง
      </div>
      {loading && <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: '#475569' }}>กำลังให้ Agent วิเคราะห์ (อาจใช้เวลาครึ่งนาที) · แผนตามกฎใช้งานได้ตามปกติระหว่างรอ</div>}
      {error && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>ขอความเห็นไม่สำเร็จ: {error}</div>}
      {!loading && !data && !error && <div style={{ marginTop: 10, fontSize: 12.5, color: '#94a3b8' }}>ยังไม่ได้ขอความเห็นจาก Agent</div>}
      {!loading && data && data.status !== 'OK' && <div style={{ marginTop: 10, fontSize: 12.5, color: '#92400e' }}>{STATUS_HINT[data.status]}</div>}
      {!loading && data?.status === 'OK' && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: '#0f2a5c', lineHeight: '19px' }}>
            {data.summary} <span style={{ color: '#94a3b8' }}>· {data.model}{data.confidence ? ` · ความมั่นใจ ${data.confidence}` : ''}</span>
          </div>
          {data.suggestions.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#475569' }}>Agent เห็นว่าไม่ต้องเพิ่มรายการนอกชุด</div>
          ) : (
            <>
              <table className="qt" aria-label="ข้อเสนอรายการนอกชุดจาก Agent">
                <thead>
                  <tr><th>รายการ</th><th className="r" style={{ width: 120 }}>จำนวน</th><th style={{ width: 110 }} /></tr>
                </thead>
                <tbody>
                  {data.suggestions.map((s) => {
                    const inPlan = extrasInPlan.includes(s.drugMasterId);
                    return (
                      <tr key={s.drugMasterId}>
                        <td>
                          <b style={{ color: '#0f2a5c' }}>{s.name}</b>
                          <div style={{ fontSize: 12, color: '#475569' }}>{s.rationale}</div>
                          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>ในคลังตอนนี้ {s.freeStock.toLocaleString()} {s.unit}</div>
                        </td>
                        <td className="r">
                          {onAdd && !inPlan ? (
                            <input
                              type="number" min={1} aria-label={`จำนวน ${s.name}`} value={qty[s.drugMasterId] ?? s.qty} disabled={disabled}
                              onChange={(e) => setQty((m) => ({ ...m, [s.drugMasterId]: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                              style={{ width: 80, height: 30, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 6px', textAlign: 'right' }}
                            />
                          ) : (
                            <span className="num">{s.qty.toLocaleString()}</span>
                          )}{' '}
                          <span style={{ fontSize: 11.5 }}>{s.unit}</span>
                        </td>
                        <td className="r">
                          {inPlan ? <span className="badge t-green">อยู่ในแผนแล้ว</span> : onAdd ? (
                            <button type="button" className="btn btn-p btn-sm" disabled={disabled} onClick={() => onAdd(s.drugMasterId, qty[s.drugMasterId] ?? s.qty, s.name)}>+ เพิ่ม</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {onAdd && open.length > 1 && (
                <div><button type="button" className="btn btn-s btn-sm" disabled={disabled} onClick={addAll}>เพิ่มทั้งหมด ({open.length} รายการ)</button></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
