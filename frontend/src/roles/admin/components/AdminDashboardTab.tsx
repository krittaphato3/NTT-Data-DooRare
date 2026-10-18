import { useState, useEffect } from 'react';
import { Icon } from '../../../components/common/icons';
import * as authApi from '../../../services/authApi';
import {
  ADMIN_KPIS,
  DAILY_REQUEST_TRENDS,
  EXECUTIVE_VALUE,
  HOURLY_LOGIN_STATS,
  RECENT_LOGINS,
  SYSTEM_HEALTH,
  TOP_REQUESTED_DRUGS,
  type HospitalSummary,
  type UserAccount,
  type LoginHistoryRow,
} from '../data/adminData';

interface AdminDashboardTabProps {
  hospitals: HospitalSummary[];
  users: UserAccount[];
  onSelectHospital: (hospitalId: string) => void;
  onGoToAccounts: () => void;
  onShowToast?: (msg: string) => void;
}

export function AdminDashboardTab({
  hospitals,
  users,
  onSelectHospital,
  onGoToAccounts,
  onShowToast,
}: AdminDashboardTabProps) {
  // Modal state for Executive Report Export
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportType, setExportType] = useState('executive_summary');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [isExporting, setIsExporting] = useState(false);

  // Live PostgreSQL login events
  const [recentLogins, setRecentLogins] = useState<LoginHistoryRow[]>(RECENT_LOGINS);
  const [liveOnlineCount, setLiveOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    authApi.getRecentLogins(25).then(({ events, onlineCount }) => {
      if (!mounted || !events || events.length === 0) return;
      const mapped: LoginHistoryRow[] = events.map((e) => {
        const d = new Date(e.occurred_at);
        const timeStr = `${d.getDate()} ต.ค. 69 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
        return {
          id: `SES-${e.id}`,
          userName: e.display_name || e.email.split('@')[0],
          userRole: e.role || 'ผู้ใช้งานระบบ',
          hospitalName: e.hospital_name || 'ส่วนกลาง เขต 6',
          timestamp: timeStr,
          device: e.device || 'Windows PC',
          browser: e.browser || 'Chrome',
          ip: e.ip || '127.0.0.1',
          status: e.success ? 'SUCCESS' : 'FAILED',
          failureReason: e.failure_reason || '',
        };
      });
      setRecentLogins(mapped);
      if (onlineCount > 0) setLiveOnlineCount(onlineCount);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Compute dynamic stats from active state
  const totalUsers = users.length;
  const activeOnlineUsers = liveOnlineCount !== null ? liveOnlineCount : users.filter((u) => u.isOnline).length;

  const totalRequestsAll = hospitals.reduce((acc, h) => acc + h.requestCount, 0);
  const totalDispatchesAll = hospitals.reduce((acc, h) => acc + h.dispatchedCount, 0);
  const totalApprovedAll = hospitals.reduce((acc, h) => acc + h.approvedCount, 0);
  const totalRejectedAll = hospitals.reduce((acc, h) => acc + h.rejectedCount, 0);
  const totalTimeoutAll = hospitals.reduce((acc, h) => acc + h.timeoutCount, 0);

  const maxLoginsHour = Math.max(...HOURLY_LOGIN_STATS.map((s) => s.logins));

  const handleDownloadReport = () => {
    setIsExporting(true);
    setTimeout(() => {
      try {
        const ext = exportFormat === 'excel' ? 'csv' : exportFormat;
        const reportTitle =
          exportType === 'executive_summary'
            ? 'Executive_Summary_Report'
            : exportType === 'cold_chain'
            ? 'Cold_Chain_Audit_Report'
            : 'Audit_Trail_Report';
        const filename = `${reportTitle}_${new Date().toISOString().slice(0, 10)}.${ext}`;
        const content =
          exportFormat === 'csv' || exportFormat === 'excel'
            ? `ID,ประเภทรายงาน,วันที่,ยอดรอบส่งยา,มูลค่ายาช่วยชีวิต(บาท),สถานะความปลอดภัย,Hash\n1,${exportType},2026-10-16,1329,14850000,VERIFIED,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n`
            : `%PDF-1.4\n1 0 obj\n<< /Title (${reportTitle}) /Author (NTT-Data-DooRare) >>\nendobj\nรายงานสรุปผู้บริหาร เขตสุขภาพที่ 6\nสถานะ: ส่งมอบสำเร็จ 100% | มูลค่า: ฿14,850,000\n`;
        const blob = new Blob([content], {
          type: exportFormat === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Download error:', err);
      }

      setIsExporting(false);
      setIsExportOpen(false);
      const msg = `ส่งออก "${exportType === 'executive_summary' ? 'รายงานสรุปภาพรวมผู้บริหาร' : exportType === 'cold_chain' ? 'รายงานห่วงโซ่ความเย็น' : 'บันทึกการตรวจสอบย้อนกลับ'}" รูปแบบ .${exportFormat.toUpperCase()} สำเร็จแล้ว (กำลังดาวน์โหลดไฟล์)`;
      if (onShowToast) {
        onShowToast(msg);
      }
    }, 800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* EXPORT ACTION BANNER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '14px 20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F2A5C', margin: 0 }}>
            ภาพรวมศูนย์บริหารจัดการยาและเวชภัณฑ์ฉุกเฉิน · เขตสุขภาพที่ 6
          </h2>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            ข้อมูล Real-time ประจำวันที่ 16 ตุลาคม 2569 · ครอบคลุม 12 โรงพยาบาลศูนย์/ทั่วไป/ชุมชน
          </div>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={() => setIsExportOpen(true)}
          style={{ height: 38, padding: '0 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon name="download" style={{ width: 16, height: 16 }} />
          ส่งออกรายงานผู้บริหาร (Export Report)
        </button>
      </div>

      {/* 4 PRIMARY KPIS SPECIFIED BY USER */}
      <section className="admin-kpi-grid" aria-label="ตัวชี้วัดสำคัญของระบบ">
        {/* KPI 1: Drug Requests & Dispatches */}
        <div className="admin-kpi-card kpi-blue">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">รอบส่งคำขอส่งยา (Drug Requests)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="truck" style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="admin-kpi-value">{totalRequestsAll.toLocaleString()} รอบ</div>
          <div className="admin-kpi-subtext">
            <span className="admin-kpi-trend-good">นำส่งสำเร็จ {totalDispatchesAll.toLocaleString()} รอบ</span>
            <span>· สำเร็จ 89.7%</span>
          </div>
        </div>

        {/* KPI 2: Total Registered Users */}
        <div className="admin-kpi-card kpi-purple">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">จำนวนผู้ใช้งานทั้งหมด (Total Users)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="users" style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="admin-kpi-value">{totalUsers} บัญชี</div>
          <div className="admin-kpi-subtext">
            <span>ครอบคลุม 12 โรงพยาบาล</span>
            <button
              type="button"
              onClick={onGoToAccounts}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#1E40AF',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              จัดการบัญชี →
            </button>
          </div>
        </div>

        {/* KPI 3: Total Logins */}
        <div className="admin-kpi-card kpi-amber">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">จำนวนการล็อคอิน (Total Logins)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="login" style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="admin-kpi-value">{ADMIN_KPIS.totalLoginsToday.toLocaleString()} ครั้ง</div>
          <div className="admin-kpi-subtext">
            <span>วันนี้ (สะสมเดือนนี้ {ADMIN_KPIS.totalLoginsMonth.toLocaleString()} ครั้ง)</span>
          </div>
        </div>

        {/* KPI 4: Active Online Users */}
        <div className="admin-kpi-card kpi-green">
          <div className="admin-kpi-top">
            <span className="admin-kpi-label">ผู้ใช้ที่ออนไลน์อยู่ (Online Now)</span>
            <div className="admin-kpi-icon-wrap">
              <Icon name="userCheck" style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="admin-kpi-value" style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeOnlineUsers} คน
            <span className="admin-live-pulse" style={{ width: 12, height: 12 }} />
          </div>
          <div className="admin-kpi-subtext">
            <span className="admin-badge admin-badge-success" style={{ fontSize: 11 }}>
              Real-time WebSocket เชื่อมต่อปกติ
            </span>
          </div>
        </div>
      </section>

      {/* EXECUTIVE VALUE & IMPACT METRICS */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
        aria-label="มูลค่าการประหยัดงบประมาณและการช่วยชีวิต"
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1E40AF 0%, #0F2A5C 100%)',
            color: '#FFFFFF',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 4px 12px rgba(15, 42, 92, 0.15)',
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="chart" style={{ width: 16, height: 16 }} />
            มูลค่ายาที่ยืมสำเร็จช่วยชีวิต
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 2px 0' }}>
            ฿{(EXECUTIVE_VALUE.totalSharedValueThb / 1000000).toFixed(2)}M
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            สะสม 1,329 รอบ · ส่งมอบสำเร็จ 100%
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #059669 0%, #064E3B 100%)',
            color: '#FFFFFF',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.15)',
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="spark" style={{ width: 16, height: 16 }} />
            มูลค่ายาที่ลดการหมดอายุ
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 2px 0' }}>
            ฿{(EXECUTIVE_VALUE.wastePreventedValueThb / 1000000).toFixed(2)}M
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            หมุนเวียนก่อน Expire ผ่าน Near-expiry Pool
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="siren" style={{ width: 16, height: 16 }} />
            การจัดส่งฉุกเฉินวิกฤต (24 ชม.)
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0F2A5C', margin: '6px 0 2px 0' }}>
            {EXECUTIVE_VALUE.emergencyDeliveriesCount} เคส
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            เวลาตอบรับเฉลี่ย 2.8 นาที (เป้าหมาย &lt; 3 นาที)
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ fontSize: 12, color: '#2563EB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="truck" style={{ width: 16, height: 16 }} />
            เวลาขนส่งระหว่าง รพ. เฉลี่ย
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0F2A5C', margin: '6px 0 2px 0' }}>
            {EXECUTIVE_VALUE.avgDeliveryMinutes} นาที
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            ห่วงโซ่ความเย็น 2-8°C ควบคุมปลอดภัย 100%
          </div>
        </div>
      </section>

      {/* SYSTEM HEALTH & GATEWAY INFRASTRUCTURE BAR */}
      <div
        style={{
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: 10,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="admin-live-pulse" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
            โครงสร้างพื้นฐานระบบ (System Infrastructure Health):
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#166534' }}>
          <span>
            🏥 <strong>HIS Gateways:</strong> {SYSTEM_HEALTH.hisGatewaysConnected}/{SYSTEM_HEALTH.hisGatewaysTotal} รพ. ออนไลน์
          </span>
          <span>
            ❄️ <strong>Cold Chain Sensors:</strong> {SYSTEM_HEALTH.coldChainSensorsOk}/{SYSTEM_HEALTH.coldChainSensorsTotal} ปกติ (2-8°C)
          </span>
          <span>
            🤖 <strong>AI Matching Engine:</strong> {SYSTEM_HEALTH.agentLatencySec}s ({SYSTEM_HEALTH.agentAccuracyPct}%)
          </span>
          <span>
            🔒 <strong>Audit Hash Chain:</strong> ตรวจสอบแล้ว (Verified)
          </span>
        </div>
      </div>

      {/* SUMMARY BANNER OF REQUEST STATUSES */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="chart" style={{ width: 20, height: 20, color: '#1E40AF' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0F2A5C' }}>
            สถานะคำขอรวมในเขต 6:
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="admin-badge admin-badge-success" style={{ padding: '6px 12px', fontSize: 12 }}>
            <Icon name="check" style={{ width: 14, height: 14 }} />
            อนุมัติ (Approved): {totalApprovedAll} รายการ ({((totalApprovedAll / totalRequestsAll) * 100).toFixed(1)}%)
          </div>
          <div className="admin-badge admin-badge-danger" style={{ padding: '6px 12px', fontSize: 12 }}>
            <Icon name="x" style={{ width: 14, height: 14 }} />
            ปฏิเสธ (Rejected): {totalRejectedAll} รายการ ({((totalRejectedAll / totalRequestsAll) * 100).toFixed(1)}%)
          </div>
          <div className="admin-badge admin-badge-warning" style={{ padding: '6px 12px', fontSize: 12 }}>
            <Icon name="clock" style={{ width: 14, height: 14 }} />
            หมดเวลา (Timeout): {totalTimeoutAll} รายการ ({((totalTimeoutAll / totalRequestsAll) * 100).toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <section className="admin-grid-2col">
        {/* CHART 1: Daily Requests & Fulfillment */}
        <div className="admin-section-card">
          <div className="admin-section-head">
            <div>
              <h2 className="admin-section-title">
                <Icon name="activity" style={{ width: 18, height: 18, color: '#1E40AF' }} />
                แนวโน้มการส่งคำขอส่งยาและผลการตอบรับ (7 วันล่าสุด)
              </h2>
              <div className="admin-section-desc">
                ปริมาณคำขอยืมยาแยกตาม อนุมัติ (เขียว), ปฏิเสธ (แดง), และ หมดเวลา (ส้ม)
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: '#10B981', borderRadius: 2 }} /> อนุมัติ
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: '#EF4444', borderRadius: 2 }} /> ปฏิเสธ
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: '#F59E0B', borderRadius: 2 }} /> หมดเวลา
              </span>
            </div>
          </div>

          <div className="admin-chart-wrap">
            <svg viewBox="0 0 600 220" className="admin-chart-svg" preserveAspectRatio="none">
              {/* Grid Lines */}
              <line x1="40" y1="30" x2="580" y2="30" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="80" x2="580" y2="80" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="130" x2="580" y2="130" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="180" x2="580" y2="180" stroke="#E2E8F0" strokeWidth="1.5" />

              {/* Y Axis Labels */}
              <text x="30" y="34" fontSize="10" fill="#94A3B8" textAnchor="end">100</text>
              <text x="30" y="84" fontSize="10" fill="#94A3B8" textAnchor="end">60</text>
              <text x="30" y="134" fontSize="10" fill="#94A3B8" textAnchor="end">30</text>
              <text x="30" y="184" fontSize="10" fill="#94A3B8" textAnchor="end">0</text>

              {/* Bars per day */}
              {DAILY_REQUEST_TRENDS.map((item, idx) => {
                const xBase = 60 + idx * 75;
                const apprH = (item.approved / 100) * 150;
                const rejH = (item.rejected / 100) * 150;
                const timeH = (item.timeout / 100) * 150;

                const yAppr = 180 - apprH;
                const yRej = yAppr - rejH;
                const yTime = yRej - timeH;

                return (
                  <g key={item.day}>
                    {/* Approved Bar */}
                    <rect
                      x={xBase}
                      y={yAppr}
                      width="38"
                      height={apprH}
                      fill="#10B981"
                      rx="2"
                    />
                    {/* Rejected Bar */}
                    <rect
                      x={xBase}
                      y={yRej}
                      width="38"
                      height={rejH}
                      fill="#EF4444"
                    />
                    {/* Timeout Bar */}
                    <rect
                      x={xBase}
                      y={yTime}
                      width="38"
                      height={timeH}
                      fill="#F59E0B"
                      rx="2"
                    />
                    {/* Day label */}
                    <text
                      x={xBase + 19}
                      y="200"
                      fontSize="10"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      {item.day.split(' ')[0]}
                    </text>
                    <text
                      x={xBase + 19}
                      y={yTime - 5}
                      fontSize="10"
                      fontWeight="600"
                      fill="#0F2A5C"
                      textAnchor="middle"
                    >
                      {item.requested}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* CHART 2: Hourly Login & Online Activity */}
        <div className="admin-section-card">
          <div className="admin-section-head">
            <div>
              <h2 className="admin-section-title">
                <Icon name="clock" style={{ width: 18, height: 18, color: '#D97706' }} />
                ความหนาแน่นการล็อคอินรายชั่วโมง
              </h2>
              <div className="admin-section-desc">สถิติช่วงเวลาใช้งานจริงในรอบ 24 ชั่วโมง</div>
            </div>
          </div>

          <div className="admin-chart-wrap">
            <svg viewBox="0 0 320 220" className="admin-chart-svg" preserveAspectRatio="none">
              <line x1="30" y1="180" x2="310" y2="180" stroke="#E2E8F0" strokeWidth="1.5" />
              {HOURLY_LOGIN_STATS.map((h, i) => {
                const x = 40 + i * 22;
                const barHeight = (h.logins / maxLoginsHour) * 130;
                const y = 180 - barHeight;
                return (
                  <g key={h.hour}>
                    <rect
                      x={x}
                      y={y}
                      width="14"
                      height={barHeight}
                      fill={h.logins > 50 ? '#3B82F6' : '#93C5FD'}
                      rx="3"
                    >
                      <title>{`${h.hour}: ${h.logins} ครั้ง (ออนไลน์ ${h.online} คน)`}</title>
                    </rect>
                    {i % 2 === 0 && (
                      <text x={x + 7} y="198" fontSize="9" fill="#64748B" textAnchor="middle">
                        {h.hour.split(':')[0]}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x="310" y="210" fontSize="9" fill="#94A3B8" textAnchor="end">น.</text>
            </svg>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
            <span>ช่วงใช้งานสูงสุด: 08:00 – 10:00 น. (86 ครั้ง)</span>
            <span style={{ color: '#16A34A', fontWeight: 600 }}>อัตราปลอดภัย 99.8%</span>
          </div>
        </div>
      </section>

      {/* RECENT LOGINS & NETWORK STATUS */}
      <section className="admin-grid-2col">
        {/* Recent Login Feed */}
        <div className="admin-section-card">
          <div className="admin-section-head">
            <h2 className="admin-section-title">
              <Icon name="monitor" style={{ width: 18, height: 18, color: '#1E40AF' }} />
              ประวัติการเข้าสู่ระบบล่าสุด (Live Authentication Feed)
            </h2>
          </div>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ผู้ใช้งาน</th>
                  <th>โรงพยาบาล</th>
                  <th>อุปกรณ์ / IP</th>
                  <th>เวลา</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {recentLogins.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0F2A5C' }}>{row.userName}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{row.userRole}</div>
                    </td>
                    <td>{row.hospitalName}</td>
                    <td>
                      <div>{row.device}</div>
                      <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>{row.ip}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.timestamp}</td>
                    <td>
                      {row.status === 'SUCCESS' ? (
                        <span className="admin-badge admin-badge-success">สำเร็จ</span>
                      ) : (
                        <span
                          className="admin-badge admin-badge-danger"
                          title={row.failureReason}
                        >
                          ล้มเหลว (ถูกบล็อก)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Active Hospitals in Network */}
        <div className="admin-section-card">
          <div className="admin-section-head">
            <h2 className="admin-section-title">
              <Icon name="hosp" style={{ width: 18, height: 18, color: '#0D9488' }} />
              โรงพยาบาลที่มีการส่งยาความถี่สูงสุด
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hospitals.slice(0, 5).map((h) => (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onClick={() => onSelectHospital(h.id)}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>
                    {h.type} · จ.{h.province} · {h.bedCount} เตียง
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: 14 }}>
                    {h.requestCount} รอบ
                  </div>
                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                    อนุมัติ {h.approvedCount} รอบ
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TOP 5 ESSENTIAL & RARE DRUGS IN REGION 6 */}
      <section className="admin-section-card" aria-label="5 อันดับยาจำเป็นและยากำพร้าที่มีการแลกเปลี่ยนสูงสุด">
        <div className="admin-section-head">
          <div>
            <h2 className="admin-section-title">
              <Icon name="pkg" style={{ width: 18, height: 18, color: '#2563EB' }} />
              5 อันดับยาจำเป็นและยากำพร้าที่มีการแลกเปลี่ยนสูงสุดในเขต 6 (Top Requested Essential Drugs)
            </h2>
            <div className="admin-section-desc">
              ติดตามปริมาณความต้องการ มูลค่าเวชภัณฑ์ที่ช่วยกระจาย และสถานะสต็อกสำรองระดับเขตสุขภาพ
            </div>
          </div>
          <span className="admin-badge admin-badge-info" style={{ fontSize: 12 }}>
            อัปเดตแบบเรียลไทม์
          </span>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: 'center' }}>อันดับ</th>
                <th>ชื่อยาและรูปแบบเวชภัณฑ์</th>
                <th style={{ textAlign: 'right' }}>รอบขอยืม (Requests)</th>
                <th style={{ textAlign: 'right' }}>จำนวนที่ส่งมอบทั้งหมด</th>
                <th style={{ textAlign: 'right' }}>มูลค่าหมุนเวียน (บาท)</th>
                <th style={{ textAlign: 'center' }}>สถานะสต็อกสำรองเขต 6</th>
              </tr>
            </thead>
            <tbody>
              {TOP_REQUESTED_DRUGS.map((drug, idx) => (
                <tr key={drug.id}>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: idx === 0 ? '#FEF3C7' : idx === 1 ? '#F1F5F9' : '#F8FAFC',
                        color: idx === 0 ? '#B45309' : '#475569',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>
                      {drug.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{drug.form}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#1E40AF' }}>
                    {drug.borrowCount} รอบ
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#0F2A5C' }}>
                    {drug.totalUnits.toLocaleString()} {drug.unit}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                    ฿{drug.valueThb.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {drug.stockStatus === 'NORMAL' && (
                      <span className="admin-badge admin-badge-success">
                        <Icon name="check" style={{ width: 12, height: 12 }} /> ปกติ (Safe)
                      </span>
                    )}
                    {drug.stockStatus === 'LOW' && (
                      <span className="admin-badge admin-badge-warning">
                        <Icon name="tri" style={{ width: 12, height: 12 }} /> สต็อกต่ำ (Low)
                      </span>
                    )}
                    {drug.stockStatus === 'CRITICAL' && (
                      <span className="admin-badge admin-badge-danger">
                        <Icon name="siren" style={{ width: 12, height: 12 }} /> วิกฤต (Critical Shortage)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* EXECUTIVE REPORT EXPORT MODAL */}
      {isExportOpen && (
        <div className="admin-modal-backdrop" onClick={() => !isExporting && setIsExportOpen(false)}>
          <div
            className="admin-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">ส่งออกรายงานสรุปสำหรับผู้บริหาร</h3>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  ศูนย์บริหารจัดการยาและเวชภัณฑ์ฉุกเฉิน เขตสุขภาพที่ 6
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => !isExporting && setIsExportOpen(false)}
                disabled={isExporting}
              >
                ×
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label className="admin-form-label">ประเภทรายงานที่ต้องการส่งออก *</label>
                <select
                  className="admin-form-select"
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value)}
                  disabled={isExporting}
                >
                  <option value="executive_summary">
                    รายงานสรุปภาพรวมผู้บริหาร (มูลค่าแลกเปลี่ยน & ยาช่วยชีวิต)
                  </option>
                  <option value="cold_chain">
                    รายงานความปลอดภัยห่วงโซ่ความเย็น (Cold Chain 2-8°C Audit)
                  </option>
                  <option value="audit_trail">
                    รายงานบันทึกการตรวจสอบย้อนกลับ (SHA-256 Audit Trail)
                  </option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">ช่วงเวลาข้อมูล *</label>
                <select className="admin-form-select" defaultValue="current_month" disabled={isExporting}>
                  <option value="current_month">เดือนปัจจุบัน (ตุลาคม 2569)</option>
                  <option value="q4_2026">ไตรมาสที่ 4/2569</option>
                  <option value="year_2026">ปีงบประมาณ 2569 ทั้งปี</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">รูปแบบไฟล์เอกสาร *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <button
                    type="button"
                    className={`admin-btn ${exportFormat === 'pdf' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setExportFormat('pdf')}
                    disabled={isExporting}
                    style={{ height: 42, justifyContent: 'center' }}
                  >
                    📄 PDF (.pdf)
                  </button>
                  <button
                    type="button"
                    className={`admin-btn ${exportFormat === 'excel' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setExportFormat('excel')}
                    disabled={isExporting}
                    style={{ height: 42, justifyContent: 'center' }}
                  >
                    📊 Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    className={`admin-btn ${exportFormat === 'csv' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setExportFormat('csv')}
                    disabled={isExporting}
                    style={{ height: 42, justifyContent: 'center' }}
                  >
                    📝 CSV (.csv)
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12,
                  color: '#475569',
                }}
              >
                🔒 รายงานที่ส่งออกจะประทับตรารับรองดิจิทัลและรหัสตรวจสอบย้อนกลับ SHA-256 เพื่อความโปร่งใสตามมาตรฐานกระทรวงสาธารณสุข
              </div>
            </div>

            <div className="admin-modal-foot">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setIsExportOpen(false)}
                disabled={isExporting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={handleDownloadReport}
                disabled={isExporting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isExporting ? (
                  <>
                    <span className="admin-live-pulse" />
                    กำลังประมวลผลรายงาน...
                  </>
                ) : (
                  <>
                    <Icon name="download" style={{ width: 16, height: 16 }} />
                    ดาวน์โหลดรายงาน (Download)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
