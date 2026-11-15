import React, { useEffect, useState } from 'react';
import { adjustStock, getDemoStats, getStockDrugs, getStockHospitals, type DbStats, type StockAdjustResult, type StockDrug, type StockHospital } from '../services/mockDemoApi';

const SEV: Record<string, string> = { VERY_URGENT: 'ด่วนมาก', URGENT: 'ด่วน', NORMAL: 'ปกติ' };
const STATUS: Record<string, string> = { OPEN: 'เปิดอยู่', ACKNOWLEDGED: 'รับทราบแล้ว', LINKED_TO_REQUEST: 'ผูกกับคำขอแล้ว', SNOOZED: 'พักไว้' };
const alertText = (a: string | null) => {
  if (!a) return 'ไม่มี alert';
  const [sev, st] = a.split(':');
  return `${SEV[sev] ?? sev} (${STATUS[st] ?? st})`;
};
const num = (n: number) => Math.round(n).toLocaleString();

const EXPIRY_CHOICES = [
  { days: 365, label: 'ปกติ (หมดอายุอีก 365 วัน)' },
  { days: 90, label: 'ใกล้หมดอายุ 90 วัน (เข้า F2 ได้)' },
  { days: 60, label: 'ใกล้หมดอายุ 60 วัน (เข้า F2 ได้)' },
  { days: 30, label: 'ใกล้หมดอายุ 30 วัน (เข้า F2 ได้)' },
];

export const MockStockPage: React.FC = () => {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [hospitals, setHospitals] = useState<StockHospital[]>([]);
  const [hospital, setHospital] = useState('');
  const [search, setSearch] = useState('');
  const [drugs, setDrugs] = useState<StockDrug[]>([]);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState('100');
  const [expiryDays, setExpiryDays] = useState(365);
  const [busy, setBusy] = useState<'add' | 'use' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ ts: string; ok: boolean; lines: string[] }[]>([]);

  const selected = drugs.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    getDemoStats().then(setStats).catch(() => undefined);
    getStockHospitals()
      .then((h) => { setHospitals(h); if (h[0]) setHospital(h[0].code); })
      .catch((e) => setError(e.message));
  }, []);

  const loadDrugs = async (code = hospital, q = search) => {
    if (!code) return;
    setLoadingDrugs(true);
    try {
      setDrugs(await getStockDrugs(code, q));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingDrugs(false);
    }
  };

  useEffect(() => {
    setSelectedId(null);
    const t = setTimeout(() => loadDrugs(hospital, search), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospital, search]);

  const run = async (mode: 'add' | 'use') => {
    if (!selected || busy) return;
    const n = Math.trunc(Number(qty));
    if (!Number.isFinite(n) || n <= 0) { setError('ระบุจำนวนเป็นตัวเลขมากกว่า 0'); return; }
    setBusy(mode);
    setError(null);
    const ts = new Date().toISOString().substring(11, 19);
    try {
      const r: StockAdjustResult = await adjustStock({ hospital, hospitalDrugId: selected.id, delta: mode === 'add' ? n : -n, expiryDays: mode === 'add' ? expiryDays : undefined });
      const lines = [
        `${mode === 'add' ? 'รับยาเข้า' : 'ใช้ยา'} ${r.hospital} · ${selected.local_name ?? r.drug}`,
        `สต็อกที่ใช้ได้: ${num(r.before.free)} → ${num(r.after.free)} (${r.applied >= 0 ? '+' : ''}${num(r.applied)})${mode === 'use' && -r.applied < n ? ` ขอใช้ ${num(n)} ได้เท่าที่มี` : ''}`,
        `alert สต็อก: ${alertText(r.before.alert)} → ${alertText(r.after.alert)}`,
      ];
      const opened = r.alertsChanged.reduce((a, x) => a + x.opened, 0);
      const closed = r.alertsChanged.reduce((a, x) => a + x.closed, 0);
      if (opened || closed) lines.push(`ทั้งระบบ: alert เปิดใหม่ ${opened}, ปิด ${closed}`);
      if (r.nearExpiryDetected !== null) lines.push(`สแกนใกล้หมดอายุ: พบ ${r.nearExpiryDetected} ล็อต (ไปดูที่หน้ายาใกล้หมดอายุ)`);
      setHistory((h) => [{ ts, ok: true, lines }, ...h].slice(0, 30));
      await loadDrugs();
      setSelectedId(selected.id);
      getDemoStats().then(setStats).catch(() => undefined);
    } catch (e: any) {
      setError(e.message || 'ไม่สำเร็จ');
      setHistory((h) => [{ ts, ok: false, lines: [`ไม่สำเร็จ: ${e.message}`] }, ...h].slice(0, 30));
    } finally {
      setBusy(null);
    }
  };

  const card: React.CSSProperties = { background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' };
  const btn: React.CSSProperties = { padding: '10px 18px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff' };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', padding: '24px 32px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '12px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px' }}>DEMO · ปรับสต็อกยา</span>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '8px 0 2px 0' }}>เพิ่ม / ลดสต็อกยาตามที่เลือก</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>เลือก รพ. และยา แล้วรับยาเข้า (เพิ่ม) หรือใช้ยา (ลด) ตามจำนวนที่ต้องการ ระบบบันทึกใน ledger และประเมิน alert ให้ทันที</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {stats?.database && (
            <span style={{ fontSize: '12px', background: stats.database.local ? '#dcfce7' : '#fee2e2', color: stats.database.local ? '#166534' : '#991b1b', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
              ฐาน: {stats.database.host}/{stats.database.name} ({stats.database.local ? 'LOCAL' : 'REMOTE'})
            </span>
          )}
          <a href="/mock-demo" style={{ ...btn, background: '#0284c7', textDecoration: 'none', fontSize: '13px' }}>ไปหน้าเติมข้อมูลเดโม</a>
        </div>
      </header>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#991b1b', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>เกิดข้อผิดพลาด: {error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', alignItems: 'start' }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: '10px' }}>1. เลือกโรงพยาบาลและยา</div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select value={hospital} onChange={(e) => setHospital(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
              {hospitals.map((h) => <option key={h.code} value={h.code}>{h.code} · {h.name}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อยา เช่น salbutamol" style={{ flex: 1, minWidth: '180px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
          </div>
          <div style={{ maxHeight: '560px', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>ยา</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>สต็อก</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>เป้า</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>ใช้/วัน</th>
                  <th style={{ padding: '6px 8px' }}>alert</th>
                </tr>
              </thead>
              <tbody>
                {drugs.map((d) => (
                  <tr key={d.id} onClick={() => setSelectedId(d.id)} style={{ cursor: 'pointer', borderTop: '1px solid #e2e8f0', background: d.id === selectedId ? '#e0f2fe' : undefined }}>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{d.name}{d.ved ? <span style={{ color: '#64748b', fontWeight: 400 }}> · {d.ved}</span> : null}</div>
                      <div style={{ color: '#64748b', fontSize: '11.5px' }}>{d.local_name}{d.unit ? ` (${d.unit})` : ''}</div>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{num(d.free)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b' }}>{d.target != null ? num(d.target) : '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b' }}>{d.u_per_day != null ? d.u_per_day.toFixed(1) : '-'}</td>
                    <td style={{ padding: '6px 8px', color: d.alert ? '#b45309' : '#94a3b8' }}>{d.alert ? alertText(`${d.alert.severity}:${d.alert.status}`) : '-'}</td>
                  </tr>
                ))}
                {drugs.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '14px', color: '#94a3b8', textAlign: 'center' }}>{loadingDrugs ? 'กำลังโหลด...' : 'ไม่พบยา'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: '10px' }}>2. ระบุจำนวน</div>
            {selected ? (
              <>
                <div style={{ fontSize: '13px', marginBottom: '12px', lineHeight: 1.5 }}>
                  <b>{hospital}</b> · {selected.local_name ?? selected.name}
                  <br />
                  <span style={{ color: '#64748b' }}>สต็อกที่ใช้ได้ {num(selected.free)} {selected.unit ?? ''}{selected.target != null ? ` · เป้า ${num(selected.target)}` : ''}</span>
                </div>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>จำนวน (หน่วยเดียวกับสต็อก)</label>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', margin: '4px 0 12px 0' }} />
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>วันหมดอายุของล็อตที่รับเข้า (ใช้กับปุ่มเพิ่ม)</label>
                <select value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} style={{ display: 'block', width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', margin: '4px 0 14px 0' }}>
                  {EXPIRY_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" disabled={busy !== null} onClick={() => run('add')} style={{ ...btn, background: '#059669', flex: 1, opacity: busy ? 0.6 : 1 }}>{busy === 'add' ? 'กำลังเพิ่ม...' : '+ เพิ่ม (รับยาเข้า)'}</button>
                  <button type="button" disabled={busy !== null} onClick={() => run('use')} style={{ ...btn, background: '#dc2626', flex: 1, opacity: busy ? 0.6 : 1 }}>{busy === 'use' ? 'กำลังลด...' : '− ลด (ใช้ยา)'}</button>
                </div>
                <p style={{ fontSize: '11.5px', color: '#64748b', margin: '10px 0 0 0', lineHeight: 1.5 }}>
                  ลดได้ไม่เกินสต็อกที่ใช้ได้ (ไม่แตะยาที่ถูกจอง) แก้ข้อมูลจริงของฐานที่ banner ด้านบนแสดง ตรวจให้ถูกก่อนกด
                </p>
              </>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>เลือกยาจากตารางด้านซ้ายก่อน</div>
            )}
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '14px', color: '#e2e8f0', fontSize: '12.5px', lineHeight: 1.6, minHeight: '120px', maxHeight: '340px', overflow: 'auto' }}>
            <div style={{ color: '#94a3b8', fontFamily: 'monospace', marginBottom: '8px' }}>ผลที่ทำ (ล่าสุดอยู่บน)</div>
            {history.length === 0 && <div style={{ color: '#64748b' }}>ยังไม่มีการปรับสต็อก</div>}
            {history.map((h, i) => (
              <div key={i} style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #1e293b', color: h.ok ? '#e2e8f0' : '#fca5a5' }}>
                <div style={{ color: '#38bdf8', fontFamily: 'monospace' }}>[{h.ts}]</div>
                {h.lines.map((l, j) => <div key={j}>{l}</div>)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
