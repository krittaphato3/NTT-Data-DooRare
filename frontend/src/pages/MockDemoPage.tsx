import React, { useState, useEffect, useRef } from 'react';
import {
  getDemoStats,
  runFullDemoSeed,
  runF2NearExpirySeed,
  runRoleScenarios,
  toggleNetworkSplit,
  cleanDemoRecords,
  type DbStats,
} from '../services/mockDemoApi';

export const MockDemoPage: React.FC = () => {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
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
      `[${now}] INFO: Ready to generate test data, manage regional pool lots, and simulate role scenarios.`,
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
      setLogs((prev) => [...prev, `[${doneTs}] FINISH: ${res.message || successLabel} สำเร็จ`]);
    } catch (err: any) {
      const errTs = new Date().toISOString().substring(11, 19);
      const errMsg = err.message || 'เกิดข้อผิดพลาดในการดำเนินการ';
      setErrorMsg(errMsg);
      setLogs((prev) => [...prev, `[${errTs}] ERROR: ${errMsg}`]);
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
          {stats?.isNetworkSplit ? (
            <span style={{ fontSize: '12px', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
              สถานะ: แยกเครือข่าย B (HD, HE อยู่ใน Network B)
            </span>
          ) : (
            <span style={{ fontSize: '12px', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
              สถานะ: เครือข่ายเดียวปกติ (Network A ทั้งหมด)
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
          {/* Card 1: Complete Demo Seed */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                  ONE-CLICK SEED
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#0f172a' }}>
                  สร้างชุดข้อมูลจำลองสมบูรณ์ (F1 Borrow + F2 Expiry)
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              รันการเตรียมข้อมูลครบถ้วน: เพิ่ม Lot ยาใกล้หมดอายุ (F2) ทั้ง 3 รูปแบบ (ในเครือข่าย A, ข้ามเครือข่าย X, และต้นทุนขนส่งสูง U), ตรวจจับเข้าสู่ระบบใกล้หมดอายุ, และปรับแต่งสต็อกเพื่อสร้างการแจ้งเตือนขอยืมยา (F1) ให้กับทั้ง 5 โรงพยาบาล
            </p>
            <button
              type="button"
              disabled={executingAction !== null}
              onClick={() => handleAction('seed-full', runFullDemoSeed, 'สร้างชุดข้อมูลจำลองสมบูรณ์ (F1 + F2)')}
              style={{
                width: '100%',
                padding: '11px 16px',
                background: executingAction === 'seed-full' ? '#94a3b8' : '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: executingAction !== null ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(2,132,199,0.2)',
                transition: 'background 0.15s ease',
              }}
            >
              {executingAction === 'seed-full' ? 'กำลังดำเนินการ...' : 'เริ่มสร้างชุดข้อมูล F1 + F2 (Full Seed)'}
            </button>
          </div>

          {/* Card 2: Seed F2 Near-Expiry Pools Only */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
                  F2 REGIONAL POOL
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#0f172a' }}>
                  สร้างเฉพาะยาใกล้หมดอายุ (F2 Near-Expiry Only)
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              เพิ่มเฉพาะสต็อกยาใกล้หมดอายุ (35, 45, 60, 75 วัน) ให้กับ HA, HB, HC และทำการสแกนตรวจจับ เพื่อให้เภสัชกรเห็นรายการยารอส่งเข้าคลังกลาง (Regional Pool) หรือจัดสรรได้ทันที
            </p>
            <button
              type="button"
              disabled={executingAction !== null}
              onClick={() => handleAction('seed-f2', runF2NearExpirySeed, 'สร้างเฉพาะยาใกล้หมดอายุ F2')}
              style={{
                width: '100%',
                padding: '11px 16px',
                background: executingAction === 'seed-f2' ? '#94a3b8' : '#d97706',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: executingAction !== null ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(217,119,6,0.2)',
                transition: 'background 0.15s ease',
              }}
            >
              {executingAction === 'seed-f2' ? 'กำลังดำเนินการ...' : 'สร้างเฉพาะยาใกล้หมดอายุ (F2 Only)'}
            </button>
          </div>

          {/* Card 3: Role Scenarios (4 Roles) */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', padding: '2px 8px', borderRadius: '4px' }}>
                  ROLE SCENARIOS
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#0f172a' }}>
                  จำลองงานค้าง 4 บทบาท (Role Scenarios)
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              สร้างคำขอยืมฉุกเฉินสำหรับห้องฉุกเฉิน (ER), งานค้างรอตอบรับสำหรับเภสัชกร, งานหยิบยา/แพ็คสำหรับเจ้าหน้าที่คลังสินค้า (Warehouse), และงานจัดส่งที่กำลังเดินทางสำหรับพนักงานขับรถ (Driver)
            </p>
            <button
              type="button"
              disabled={executingAction !== null}
              onClick={() => handleAction('seed-scenarios', runRoleScenarios, 'สร้างงานจำลอง 4 บทบาท')}
              style={{
                width: '100%',
                padding: '11px 16px',
                background: executingAction === 'seed-scenarios' ? '#94a3b8' : '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: executingAction !== null ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(124,58,237,0.2)',
                transition: 'background 0.15s ease',
              }}
            >
              {executingAction === 'seed-scenarios' ? 'กำลังดำเนินการ...' : 'สร้างสถานการณ์งานค้าง 4 บทบาท'}
            </button>
          </div>

          {/* Card 4: Network Partitioning */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e', background: '#ccfbf1', padding: '2px 8px', borderRadius: '4px' }}>
                  NETWORK PARTITIONING
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#0f172a' }}>
                  การแบ่ง / รวมเครือข่ายโรงพยาบาล (Network Splitting)
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              ย้าย รพ.บางบ่อ (HD) และ รพ.บางเสาธง (HE) ไปยัง 'เครือข่ายตัวอย่าง B' เพื่อทดสอบสถานการณ์แผนจัดสรรข้ามเครือข่ายที่ต้องรอการกดเห็นชอบ (Manual Approval) แทนการอนุมัติอัตโนมัติ
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                disabled={executingAction !== null}
                onClick={() => handleAction('network-split', () => toggleNetworkSplit(true), 'แยกเครือข่าย B')}
                style={{
                  padding: '10px 14px',
                  background: stats?.isNetworkSplit ? '#f1f5f9' : '#0f766e',
                  color: stats?.isNetworkSplit ? '#94a3b8' : '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: executingAction !== null || stats?.isNetworkSplit ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                {executingAction === 'network-split' ? 'กำลังดำเนินการ...' : 'แยกเป็นเครือข่าย B (Split)'}
              </button>

              <button
                type="button"
                disabled={executingAction !== null}
                onClick={() => handleAction('network-unify', () => toggleNetworkSplit(false), 'รวมเครือข่าย A')}
                style={{
                  padding: '10px 14px',
                  background: !stats?.isNetworkSplit ? '#f1f5f9' : '#475569',
                  color: !stats?.isNetworkSplit ? '#94a3b8' : '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: executingAction !== null || !stats?.isNetworkSplit ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                {executingAction === 'network-unify' ? 'กำลังดำเนินการ...' : 'รวมเป็นเครือข่ายเดียว (Unify)'}
              </button>
            </div>
          </div>

          {/* Card 5: Clean Demo Data */}
          <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                  CLEANUP & RESET
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '6px 0 4px 0', color: '#991b1b' }}>
                  ล้างข้อมูลจำลองทั้งหมด (Purge Demo Data)
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#7f1d1d', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              ลบเฉพาะข้อมูลจำลอง (Lot ยาที่ขึ้นต้นด้วย DEMO-*, คำขอจำลอง, แผนจัดสรร และภารกิจขนส่งที่เกี่ยวข้อง) โดยไม่กระทบข้อมูลหลัก (Master Data) ของโรงพยาบาลและยา
            </p>
            <button
              type="button"
              disabled={executingAction !== null}
              onClick={() => {
                if (window.confirm('คุณต้องการลบข้อมูลจำลอง DEMO ทั้งหมดใช่หรือไม่?')) {
                  handleAction('clean-demo', cleanDemoRecords, 'ล้างข้อมูลจำลองทั้งหมด');
                }
              }}
              style={{
                width: '100%',
                padding: '11px 16px',
                background: executingAction === 'clean-demo' ? '#94a3b8' : '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: executingAction !== null ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(220,38,38,0.2)',
                transition: 'background 0.15s ease',
              }}
            >
              {executingAction === 'clean-demo' ? 'กำลังล้างข้อมูล...' : 'ล้างข้อมูลจำลอง (Purge Demo Data)'}
            </button>
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
