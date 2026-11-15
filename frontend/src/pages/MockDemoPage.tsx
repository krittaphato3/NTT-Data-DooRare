import React, { useState, useEffect, useRef } from 'react';
import { getDemoStats, getDemoPlan, runFill, type DbStats, type DemoPlan } from '../services/mockDemoApi';

const SEV_LABEL = { VERY_URGENT: 'ด่วนมาก', URGENT: 'ด่วน', NORMAL: 'ปกติ' } as const;

export const MockDemoPage: React.FC = () => {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [plan, setPlan] = useState<DemoPlan | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const terminalScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const loadStats = async () => {
    setLoadingStats(true);
    setErrorMsg(null);
    try {
      const data = await getDemoStats();
      setStats(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'ไม่สามารถโหลดข้อมูลสถิติได้');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    // Ensure page opens at the very top
    window.scrollTo(0, 0);
    loadStats();
    // Welcome log
    const now = new Date().toISOString().substring(11, 19);
    setLogs([
      `[${now}] INFO: Mock Demo Generator console initialized.`,
      `[${now}] INFO: Press 'ดูก่อน' to see what is missing, then a fill button: it only adds what is missing against the targets.`,
    ]);
  }, []);

  useEffect(() => {
    // Only scroll the terminal log container internally; NEVER scroll the browser window
    if (terminalScrollContainerRef.current) {
      terminalScrollContainerRef.current.scrollTop = terminalScrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleAction = async (actionKey: string, actionFn: () => Promise<any>, successLabel: string) => {
    if (executingAction) return;
    setExecutingAction(actionKey);
    setErrorMsg(null);
    const ts = new Date().toISOString().substring(11, 19);
    setLogs((prev) => [...prev, `[${ts}] --------------------------------------------------`, `[${ts}] START: ${successLabel}...`]);

    try {
      const res = await actionFn();
      if (res.logs && Array.isArray(res.logs)) {
        setLogs((prev) => [...prev, ...res.logs]);
      }
      if (res.stats) {
        setStats(res.stats);
      } else {
        await loadStats();
      }
      const doneTs = new Date().toISOString().substring(11, 19);
      if (res.success === false) {
        setErrorMsg(res.message || 'ไม่สำเร็จ');
        setLogs((prev) => [...prev, `[${doneTs}] ERROR: ${res.message || successLabel}`]);
      } else {
        setLogs((prev) => [...prev, `[${doneTs}] FINISH: ${res.message || successLabel}`]);
      }
    } catch (err: any) {
      const errTs = new Date().toISOString().substring(11, 19);
      const errMsg = err.message || 'เกิดข้อผิดพลาดในการดำเนินการ';
      setErrorMsg(errMsg);
      setLogs((prev) => [...prev, `[${errTs}] ERROR: ${errMsg}`]);
    } finally {
      setExecutingAction(null);
    }
  };

  const handlePlan = async () => {
    if (executingAction) return;
    setExecutingAction('plan');
    setErrorMsg(null);
    try {
      const p = await getDemoPlan();
      setPlan(p);
      const ts = new Date().toISOString().substring(11, 19);
      const f1 = p.f1.reduce((n, r) => n + r.canAdd, 0);
      const f2 = p.f2.reduce((n, r) => n + r.canAdd, 0);
      const miss = p.f1.reduce((n, r) => n + r.missing, 0) + p.f2.reduce((n, r) => n + r.missing, 0);
      setLogs((prev) => [...prev, `[${ts}] INFO: plan: a fill can add F1 ${f1} alert(s) and F2 ${f2} lot(s); below target in total ${miss}${p.forecastLoaded ? '' : ' (forecast not loaded yet: the fill loads it first)'}`]);
    } catch (err: any) {
      setErrorMsg(err.message || 'อ่านแผนไม่สำเร็จ');
    } finally {
      setExecutingAction(null);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    alert('คัดลอก Logs ไปยัง Clipboard แล้ว');
  };

  const handleClearLogs = () => {
    setLogs([`[${new Date().toISOString().substring(11, 19)}] INFO: Log console cleared.`]);
  };

  const navigateBack = () => {
    window.location.href = '/';
  };

  return (
    <div className="mock-demo-container" style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', padding: '24px 32px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#0284c7', letterSpacing: '-0.5px' }}>DooRare</span>
            <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '12px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px' }}>DEMO CONTROL CENTER</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0 4px 0', color: '#0f172a' }}>
            ระบบจัดการข้อมูลจำลอง (Mock Demo Data Control Center)
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            สร้างและจัดการข้อมูลจำลองสำหรับการทดสอบระบบ, การสาธิต (Demo), และการประเมินผลโดยไม่ต้องรันคำสั่งใน Terminal
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadStats}
            disabled={loadingStats || executingAction !== null}
            style={{
              padding: '9px 16px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loadingStats ? 'not-allowed' : 'pointer',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loadingStats ? 'spin 1s linear infinite' : 'none' }}>
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
            <span>รีเฟรชสถิติ</span>
          </button>

          <button
            type="button"
            onClick={navigateBack}
            style={{
              padding: '9px 18px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
            }}
          >
            กลับสู่ระบบหลัก
          </button>
        </div>
      </header>

      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', color: '#991b1b', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>เกิดข้อผิดพลาด: {errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Database Statistics Ribbon */}
      <section style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            สถานะฐานข้อมูลปัจจุบัน (Live DB Status)
          </h2>
          {stats?.database && (
            <span
              style={{
                fontSize: '12px',
                background: stats.database.local ? '#dcfce7' : '#fee2e2',
                color: stats.database.local ? '#166534' : '#991b1b',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 700,
              }}
            >
              ฐาน: {stats.database.host}/{stats.database.name} ({stats.database.local ? 'LOCAL' : 'REMOTE'})
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
          {[
            { label: 'รพ. ในระบบ', val: stats?.hospitals ?? '-', sub: 'Active Hospitals', color: '#0369a1' },
            { label: 'เวชภัณฑ์', val: stats?.drugs ?? '-', sub: 'Drug Masters', color: '#0f766e' },
            { label: 'สต็อกทั้งหมด', val: stats?.totalLots ?? '-', sub: 'Stock Lots', color: '#4338ca' },
            { label: 'Lot จำลอง', val: stats?.demoLots ?? '-', sub: 'DEMO-* Lots', color: '#b45309' },
            { label: 'เตือนสต็อกขาด', val: stats?.activeAlerts ?? '-', sub: 'Active Alerts', color: '#be123c' },
            { label: 'คำขอยืมยา', val: stats?.borrowRequests ?? '-', sub: 'Active Requests', color: '#1d4ed8' },
            { label: 'ยาใกล้หมดอายุ', val: stats?.nearExpiryDetected ?? '-', sub: 'Detected Items', color: '#c2410c' },
            { label: 'ยาใน Pool', val: stats?.nearExpiryPool ?? '-', sub: 'In Regional Pool', color: '#7c3aed' },
            { label: 'แผนจัดสรร', val: stats?.allocationPlans ?? '-', sub: 'Allocation Plans', color: '#047857' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: item.color, lineHeight: 1.1 }}>{item.val}</div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Grid: Control Cards (Left) & Terminal Output (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Action Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card 1: what is missing (read only) */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>READ ONLY</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#0f172a' }}>ดูก่อนว่าจะเติมอะไร</h3>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 14px 0' }}>
              นับสิ่งที่มีอยู่เทียบกับเป้า (มี/เป้า) แล้วจำลองการเลือกยาแบบเดียวกับตอนเติมจริง ไม่เขียนอะไรลงฐาน (+N = เติมได้จริง, "ไม่มียา" = ต่ำกว่าเป้าแต่ไม่มียาเข้าเงื่อนไข)
            </p>
            <button
              type="button"
              disabled={executingAction !== null}
              onClick={handlePlan}
              style={{ width: '100%', padding: '10px 16px', background: '#ffffff', color: '#0f172a', border: '1px solid #94a3b8', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600, cursor: executingAction !== null ? 'not-allowed' : 'pointer' }}
            >
              {executingAction === 'plan' ? 'กำลังอ่าน...' : 'ดูก่อน (Plan)'}
            </button>

            {plan && (
              <div style={{ marginTop: '16px', fontSize: '12.5px', color: '#334155' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>F1 แจ้งเตือนที่ยืมได้ (มี/เป้า)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                      <th style={{ padding: '5px 8px' }}>รพ.</th>
                      {(['VERY_URGENT', 'URGENT', 'NORMAL'] as const).map((k) => (
                        <th key={k} style={{ padding: '5px 8px' }}>{SEV_LABEL[k]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['HA', 'HB', 'HC', 'HD', 'HE'].map((h) => (
                      <tr key={h} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600 }}>{h}</td>
                        {(['VERY_URGENT', 'URGENT', 'NORMAL'] as const).map((k) => {
                          const r = plan.f1.find((x) => x.hospital === h && x.severity === k);
                          return (
                            <td key={k} style={{ padding: '5px 8px', color: !r || r.missing === 0 ? '#166534' : r.canAdd > 0 ? '#b45309' : '#94a3b8' }}>
                              {r ? `${r.have}/${r.want}` : '-'}
                              {r && r.canAdd > 0 ? ` (+${r.canAdd})` : ''}
                              {r && r.missing > 0 && r.canAdd < r.missing ? ' ·ไม่มียา' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>F2 ล็อตใกล้หมดอายุที่รออยู่ (มี/เป้า)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {plan.f2.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, width: '60px' }}>{r.owner} ({r.kind})</td>
                        <td style={{ padding: '5px 8px', color: r.missing === 0 ? '#166534' : r.canAdd > 0 ? '#b45309' : '#94a3b8', width: '130px' }}>
                          {r.have}/{r.want}
                          {r.canAdd > 0 ? ` (+${r.canAdd})` : ''}
                          {r.missing > 0 && r.canAdd < r.missing ? ' ·ไม่มียา' : ''}
                        </td>
                        <td style={{ padding: '5px 8px', color: '#64748b' }}>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: '10px', fontWeight: 600, color: plan.nothingToAdd ? '#64748b' : '#b45309' }}>
                  {plan.nothingToAdd
                    ? 'ตอนนี้เติมอะไรไม่ได้ (ครบเป้าแล้ว หรือไม่มียาที่เข้าเงื่อนไขเหลือ ช่องสีเทา "ไม่มียา")'
                    : `กดเติมแล้วจะได้เพิ่ม ${plan.canAddTotal} รายการ (ช่อง +N)`}
                </div>
              </div>
            )}
          </div>

          {/* Card 2: fill buttons */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>FILL (ADD ONLY)</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#0f172a' }}>เติมข้อมูลเดโมให้ครบเป้า</h3>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 14px 0' }}>
              เติมเฉพาะที่ขาด ไม่ลบอะไร กดซ้ำได้ ไม่ทบ ใช้ชุดตรรกะเดียวกับ <code>npm run db:demo-seed</code> (เลือกเฉพาะยาที่มีผู้ให้ยืมจริง) ใช้หลัง <code>db:reset</code> หรือหลังเดโมไปหลายรอบแล้วอยากเติมกลับ
              ย้อนสต็อกที่ถูกยืมไปแล้วไม่ได้ ถ้ายาที่เข้าเงื่อนไขหมด ต้อง reset หรือ restore dump ใหม่
            </p>
            {([
              { key: 'all' as const, label: 'เติมทั้งหมด (F2 + F1)', color: '#0284c7' },
              { key: 'f1' as const, label: 'เติมแจ้งเตือนสต็อก (F1) เท่านั้น', color: '#475569' },
              { key: 'f2' as const, label: 'เติมยาใกล้หมดอายุ (F2) เท่านั้น', color: '#475569' },
            ]).map((b) => (
              <button
                key={b.key}
                type="button"
                disabled={executingAction !== null}
                onClick={() => handleAction(`fill-${b.key}`, () => runFill(b.key), b.label)}
                style={{
                  width: '100%',
                  marginBottom: '8px',
                  padding: '11px 16px',
                  background: executingAction === `fill-${b.key}` ? '#94a3b8' : b.color,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: executingAction !== null ? 'not-allowed' : 'pointer',
                }}
              >
                {executingAction === `fill-${b.key}` ? 'กำลังดำเนินการ...' : b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Terminal Console Log Viewer */}
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '720px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {/* Console Header */}
          <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: '12.5px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 600, marginLeft: '6px' }}>
                execution.log
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCopyLogs}
                style={{ background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
              >
                คัดลอก Log
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                style={{ background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
              >
                ล้างหน้าจอ
              </button>
            </div>
          </div>

          {/* Console Log Content */}
          <div
            ref={terminalScrollContainerRef}
            style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', lineHeight: 1.6, color: '#cbd5e1' }}
          >
            {logs.map((line, index) => {
              let color = '#cbd5e1';
              if (line.includes('OK:')) color = '#34d399';
              else if (line.includes('INFO:') || line.includes('START:')) color = '#38bdf8';
              else if (line.includes('WARN:')) color = '#fbbf24';
              else if (line.includes('ERROR:')) color = '#f87171';
              else if (line.includes('FINISH:')) color = '#a7f3d0';

              return (
                <div key={index} style={{ color, wordBreak: 'break-all', marginBottom: '2px' }}>
                  {line}
                </div>
              );
            })}
          </div>

          {/* Console Footer Status */}
          <div style={{ background: '#1e293b', borderTop: '1px solid #334155', padding: '10px 18px', fontSize: '11.5px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              สถานะ: {executingAction ? `กำลังประมวลผล (${executingAction})` : 'พร้อมรับคำสั่ง (Idle)'}
            </span>
            <span>{logs.length} บรรทัด</span>
          </div>
        </div>
      </div>
    </div>
  );
};
