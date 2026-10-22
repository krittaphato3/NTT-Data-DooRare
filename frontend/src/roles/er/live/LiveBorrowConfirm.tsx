import { useEffect, useMemo, useState } from 'react';
import { useTick } from '../../../lib/time';
import { previewBorrow, sendBorrow } from '../../../services/incidentApi';
import type { ApiBorrowPreview, ApiPreviewLine, ApiSendResult } from '../../../services/incidentApi';
import type { IncidentAccess } from '../data/access';
import { ErrorNote } from './IncidentHeader';
import { classMeta, errorText, num } from './format';

const MODE_TEXT: Record<string, { label: string; cls: string }> = {
  IN_TIME: { label: 'มาถึงทัน ETA', cls: 'st-approved' },
  FASTEST_LATE: { label: 'ไม่มีแห่งไหนทัน ETA · ขอแห่งที่เร็วที่สุด', cls: 'st-rejected' },
  ETA_UNKNOWN: { label: 'ไม่มี ETA · เลือกผู้ให้ยืมเองได้', cls: 'st-pending' },
  COVERED: { label: 'ส่งคำขอครบแล้ว', cls: 'st-approved' },
};

interface Props {
  incidentId: string;
  access: IncidentAccess;
  onBack: () => void;
  onSent: (result: ApiSendResult) => void;
}

/**
 * Step 4: the requests the rules prepared for the missing items, checked by staff before they go out. Every hospital that can
 * arrive within the ETA is asked at the same time; staff may switch hospitals on or off per item. The first to confirm wins.
 */
export function LiveBorrowConfirm({ incidentId, access, onBack, onSent }: Props) {
  const tick = useTick();
  const [preview, setPreview] = useState<ApiBorrowPreview | null>(null);
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** `${lineKey}|${hospitalId}` -> asked (true) / not asked (false); missing = the default pick. */
  const [override, setOverride] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    previewBorrow(incidentId)
      .then((r) => {
        if (!alive) return;
        setPreview(r.data);
        setLoadedAt(Date.now());
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [incidentId]);

  const on = (line: ApiPreviewLine, hospitalId: string, chosen: boolean): boolean => override[`${line.key}|${hospitalId}`] ?? chosen;
  const lines = useMemo(() => (preview?.lines ?? []).filter((l) => l.mode !== 'COVERED'), [preview]);
  const asked = (line: ApiPreviewLine) => line.lenders.filter((h) => on(line, h.hospitalId, h.chosen));
  const canSend = access.mayWrite && lines.length > 0 && lines.some((l) => asked(l).length > 0) && !busy;
  void tick; // re-render every second so the remaining ETA stays current
  const remaining = preview?.etaRemainingMin === null || preview?.etaRemainingMin === undefined ? null : Math.max(0, preview.etaRemainingMin * 60 - (Date.now() - loadedAt) / 1000);

  const send = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const lenderPlan: Record<string, string[]> = {};
      for (const l of lines) lenderPlan[l.key] = asked(l).map((h) => h.hospitalId);
      const r = await sendBorrow(incidentId, lenderPlan);
      onSent(r.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!preview) {
    return error ? <ErrorNote message={error} /> : <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>กำลังจัดคำขอยืมให้ตรวจ…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', fontSize: 12, color: '#1e3a8a', lineHeight: '18px' }}>
        ส่งพร้อมกันถึงโรงพยาบาลที่มีของและมาถึงทัน (เวลาเดินทาง ≤ ETA ที่เหลือ
        {remaining !== null ? ` · เหลือราว ${Math.floor(remaining / 60)} นาที` : ''}) · รายแรกที่ยืนยันได้จำนวนนั้น ที่เหลือถูกปรับ/ยกเลิกทันที · หมดเวลา: วิกฤต 3 นาที · สนับสนุน 5 นาที ไม่เกิน ETA · เวลาเดินทางมาจากตารางระยะทางของเครือข่าย
      </div>
      <ErrorNote message={error} />
      {lines.length === 0 ? (
        <div className="card" style={{ padding: '14px 18px', fontSize: 13, color: '#166534' }}>ไม่มีรายการที่ต้องยืมเพิ่ม · ของในคลังพอตามแผน ไปจัดชุดและติดตามต่อได้</div>
      ) : (
        lines.map((line) => {
          const cls = classMeta(line.class);
          const mode = MODE_TEXT[line.mode];
          return (
            <div key={line.key} className="card" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2a5c' }}>{line.name} × {num(line.qty)} {line.unit}</span>
                  <span className={`badge ${cls.cls}`} style={{ height: 18, fontSize: 10.5 }}>{cls.label}</span>
                  {mode && <span className={`badge ${mode.cls}`} style={{ height: 18, fontSize: 10.5 }}>{mode.label}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>ผู้ให้ต้องตอบภายใน {line.timeoutMin} นาที{line.covered > 0 ? ` · ส่งไปแล้ว ${num(line.covered)}` : ''}</div>
              </div>
              {line.warnings.map((w) => (
                <div key={w.code} style={{ fontSize: 12, color: w.code === 'NO_LENDER' ? '#b91c1c' : '#92400e', marginBottom: 6 }}>{w.message}</div>
              ))}
              {line.lenders.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="qt" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: 54 }}>ขอ</th>
                        <th scope="col">โรงพยาบาล</th>
                        <th scope="col" className="r">เดินทาง</th>
                        <th scope="col">ทัน ETA</th>
                        <th scope="col" className="r">มีของ</th>
                        <th scope="col" className="r">จะขอ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.lenders.map((h) => {
                        const checked = on(line, h.hospitalId, h.chosen);
                        return (
                          <tr key={h.hospitalId} style={checked ? undefined : { opacity: 0.55 }}>
                            <td>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!access.mayWrite}
                                aria-label={`ขอ ${line.name} จาก ${h.name}`}
                                onChange={(e) => setOverride((prev) => ({ ...prev, [`${line.key}|${h.hospitalId}`]: e.target.checked }))}
                                style={{ accentColor: '#2563eb' }}
                              />
                            </td>
                            <td style={{ fontWeight: 600, color: '#0f2a5c' }}>{h.name}</td>
                            <td className="r">{h.transitMin === null ? '—' : `${num(h.transitMin)} นาที`}</td>
                            <td>{h.inTime === null ? <span style={{ color: '#94a3b8' }}>ไม่ทราบ</span> : h.inTime ? <span className="badge st-approved">ทัน</span> : <span className="badge st-rejected">ไม่ทัน</span>}</td>
                            <td className="r">{num(h.available)}</td>
                            <td className="r" style={{ fontWeight: 600 }}>{checked ? num(h.askQty) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {asked(line).length === 0 && line.lenders.length > 0 && <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>ไม่ได้เลือกโรงพยาบาล · รายการนี้จะไม่ถูกส่ง</div>}
            </div>
          );
        })
      )}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11.5, color: '#64748b' }}>Agent ไม่ยืนยันแทน — ผู้ให้ยืมยืนยันเอง · ส่งแล้วยกเลิกคำขอที่รอตอบได้เมื่อแผนลดหรือปิดเหตุการณ์</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-s" onClick={onBack}>← กลับ</button>
            <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!canSend} title={access.mayWrite ? undefined : access.writeHint} onClick={() => void send()}>
              {busy ? 'กำลังส่ง…' : 'ส่งคำขอยืมทั้งหมด'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
