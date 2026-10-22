import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { LiveReports } from '../components/LiveReports';
import { mockFallbackEnabled } from '../../../services/dataSource';
import { homeHrefFor } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import {
  BORROW_KPIS,
  EXPIRY_KPIS,
  FIRST_RESPONSE_TIMES,
  FORECAST_RANGES,
  FORECAST_SUMMARY,
  LENDER_RELIABILITIES,
  MONTHLY_SAVINGS,
  RELEASED_EXPIRY_PLANS,
  REPEAT_EXPIRED_DRUGS,
  VALUE_KPIS,
  VALUE_SAVED,
  WATCHLIST_DRUGS,
} from '../data/reports';
import '../reports.css';

type ReportTab = 'value' | 'forecast' | 'borrow' | 'expiry';

interface TabItem {
  id: ReportTab;
  title: string;
  code: string;
}

const TABS: TabItem[] = [
  { id: 'value', title: 'มูลค่า', code: 'RPT-08' },
  { id: 'forecast', title: 'ความแม่นยำพยากรณ์', code: 'RPT-01' },
  { id: 'borrow', title: 'การยืม', code: 'RPT-02 · 03 · 04' },
  { id: 'expiry', title: 'ยาใกล้หมดอายุ', code: 'RPT-05 · 06' },
];

/**
 * UI-19 Reports & Value. Read-only for every role; `role` drives the breadcrumb home, because a role
 * carried in the query string must keep it in every link.
 */
function MockReportsPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [activeTab, setActiveTab] = useState<ReportTab>('value');
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const [period] = useState('12 เดือน · พ.ย. 68 – ต.ค. 69');
  const [emailOpen, setEmailOpen] = useState(true);

  return (
    <div className="rep-container">
      {/* Page Header */}
      <section className="pagehead">
        <div style={{ width: '100%' }}>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px', marginBottom: 4 }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true" style={{ color: '#94a3b8' }}>›</span>{' '}
            <span aria-current="page" style={{ color: '#64748b' }}>รายงานมูลค่า</span>
          </nav>

          <div className="rep-topbar">
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '2px 0 4px', color: '#0f2a5c' }}>
                รายงานและมูลค่า{' '}
                <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b' }}>
                  / Reports · Value ·
                </span>
              </h1>
              <div style={{ fontSize: 12.5, color: '#64748b' }}>
                {activeTab === 'borrow' ? (
                  <>เขตสุขภาพที่ 6 · 5 โรงพยาบาล · ข้อมูลสรุปรายวันจาก JOB-11 ล่าสุด 02:30 น. 13 ต.ค. · ทุกตัวเลขระบุนิยามและช่วงฐานเปรียบเทียบ</>
                ) : (
                  <>รพ.สมุทรปราการ · เห็นเฉพาะข้อมูลของโรงพยาบาลเรา · ข้อมูลสรุปรายวันจาก JOB-11 ล่าสุด 02:30 น. 13 ต.ค. · ทุกตัวเลขระบุนิยามและช่วงฐานเปรียบเทียบ</>
                )}
              </div>
            </div>

            <div className="rep-actions">
              {activeTab === 'borrow' && (
                <button className="btn btn-s btn-sm" type="button" style={{ fontSize: 12.5, fontWeight: 500, color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}>
                  ทั้งเขตสุขภาพที่ 6 (5 รพ.) <Icon name="chev" style={{ width: 12, height: 12, marginLeft: 2 }} />
                </button>
              )}

              <button className="btn btn-s btn-sm" type="button" style={{ fontSize: 12.5, fontWeight: 400 }}>
                {period} <Icon name="chev" style={{ width: 12, height: 12, marginLeft: 2 }} />
              </button>

              <button className="btn btn-s btn-sm" type="button">
                <Icon name="download" style={{ width: 13, height: 13 }} /> CSV
              </button>

              <button className="btn btn-s btn-sm" type="button">
                <Icon name="fileText" style={{ width: 13, height: 13 }} /> PDF
              </button>

              <button
                className="btn btn-s btn-sm"
                type="button"
                onClick={() => setEmailOpen((v) => !v)}
                style={{ color: emailOpen ? '#0f2a5c' : '#64748b' }}
              >
                <Icon name="mail" style={{ width: 13, height: 13 }} /> ส่งอีเมลรายเดือน: {emailOpen ? 'เปิด' : 'ปิด'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Tab Navigation */}
      <nav className="rep-tabs" aria-label="รายงานแต่ละด้าน">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`rep-tab ${isActive ? 'rep-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.title}</span>
              <span className="rep-tab-code">{tab.code}</span>
            </button>
          );
        })}
      </nav>

      {/* ─── TAB 1: มูลค่า RPT-08 ────────────────────────────────────── */}
      {activeTab === 'value' && (
        <>
          {/* Hero Card */}
          <section className="rep-hero-card">
            <div>
              <div className="rep-hero-head">
                <div>
                  <span className="rep-hero-title">มูลค่าที่ประหยัดได้</span>{' '}
                  <span className="rep-hero-meta">value_saved · F-31</span>
                </div>
                <span className="rep-hero-meta">12 เดือนหลังเริ่มใช้ระบบ</span>
              </div>

              <div className="rep-hero-amount-row">
                <div className="rep-hero-amount">฿{VALUE_SAVED.totalSaved.toLocaleString()}</div>
                <div className="rep-badge-compare">เทียบ 12 เดือนก่อนใช้ระบบ</div>
              </div>

              <div className="rep-formula-row">
                <span className="rep-formula-equal">=</span>
                <div className="rep-formula-box">
                  <div className="rep-formula-val">฿{VALUE_SAVED.preventedExpiry.toLocaleString()}</div>
                  <div className="rep-formula-desc">หมดอายุที่เลี่ยงได้</div>
                </div>

                <span className="rep-formula-op">+</span>

                <div className="rep-formula-box">
                  <div className="rep-formula-val">฿{VALUE_SAVED.reducedExcess.toLocaleString()}</div>
                  <div className="rep-formula-desc">ลดสต็อกเกิน ({VALUE_SAVED.holdingCostRate})</div>
                </div>

                <span className="rep-formula-op">-</span>

                <div className="rep-formula-box">
                  <div className="rep-formula-val">฿{VALUE_SAVED.transportCost.toLocaleString()}</div>
                  <div className="rep-formula-desc">ค่าขนส่ง</div>
                </div>
              </div>

              <div className="rep-subnote">
                หมดอายุที่เลี่ยงได้ = ต้นทุนของยาที่ส่งต่อไปและถูกใช้ก่อนหมดอายุ · ลดสต็อกเกิน = (มูลค่าส่วนเกินเฉลี่ยช่วงฐาน {VALUE_SAVED.baselineExcess.toLocaleString()} - ปัจจุบัน {VALUE_SAVED.currentExcess.toLocaleString()}) × ค่าถือครอง 10%/ปี · ค่าขนส่งของแผนโอนทั้งหมด · ช่วงฐาน: พ.ย. 2567 – ต.ค. 2568 (12 เดือนก่อนเริ่มใช้)
              </div>
            </div>

            {/* Agent Explains Trends */}
            <div className="rep-agent-card">
              <div className="rep-agent-title">
                <Icon name="sparkle" style={{ width: 16, height: 16 }} />
                <span>Agent อธิบายแนวโน้ม</span>
              </div>
              <div className="rep-agent-body">
                มูลค่าที่ประหยัดได้เพิ่มขึ้นต่อเนื่องหลังเดือน มี.ค. ซึ่งตรงกับช่วงที่เริ่มส่งยาใกล้หมดอายุเข้าคลังกลาง เดือน ต.ค. ยังเก็บข้อมูลไม่ครบเดือน สต็อกขาดลดลงมากที่สุดในยากลุ่ม V
              </div>
              <div className="rep-agent-lock">
                <Icon name="lock" style={{ width: 13, height: 13 }} />
                <span>อ่านอย่างเดียว · ตัวเลขทั้งหมดมาจากระบบ Agent ไม่ได้คำนวณ</span>
              </div>
            </div>
          </section>

          {/* 4 KPI Cards */}
          <section className="rep-kpi-grid">
            {VALUE_KPIS.map((kpi) => (
              <div key={kpi.title} className="rep-kpi-card">
                <div className="rep-kpi-title">{kpi.title}</div>
                <div className="rep-kpi-val-row">
                  <div className="rep-kpi-val">{kpi.value}</div>
                  <div className={`rep-kpi-diff ${kpi.diffPositive ? 'rep-diff-good' : 'rep-diff-bad'}`}>
                    <Icon name="trendDown" style={{ width: 12, height: 12 }} />
                    <span>{kpi.diff}</span>
                  </div>
                </div>
                <div className="rep-kpi-base">{kpi.baseline}</div>
                <div className="rep-kpi-desc">{kpi.desc}</div>
              </div>
            ))}
          </section>

          {/* Monthly Savings Bar Chart */}
          <section className="rep-card">
            <div className="rep-card-head">
              <div>
                <span className="rep-card-title">มูลค่าที่ประหยัดได้รายเดือน</span>
                <span className="rep-card-subtitle">฿ · รวม ฿{VALUE_SAVED.totalSaved.toLocaleString()}</span>
              </div>
              <button
                type="button"
                className="link"
                onClick={() => setShowMonthlyTable((v) => !v)}
              >
                {showMonthlyTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'}
              </button>
            </div>

            {showMonthlyTable ? (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>เดือน</th>
                      <th style={{ textAlign: 'right' }}>มูลค่าที่ประหยัดได้ (บาท)</th>
                      <th>สถานะข้อมูล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHLY_SAVINGS.map((m) => (
                      <tr key={m.month}>
                        <td style={{ fontWeight: 500 }}>{m.month}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                          ฿{m.amount.toLocaleString()}
                        </td>
                        <td style={{ color: m.isPartial ? '#d97706' : '#166534', fontSize: 12 }}>
                          {m.isPartial ? 'นับถึง 13 ต.ค. (ยังไม่ครบเดือน)' : 'ครบเดือน'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rep-chart-container">
                <svg viewBox="0 0 840 240" style={{ width: '100%', height: 240, display: 'block' }}>
                  {/* Y-axis gridlines & labels */}
                  {[
                    { label: '1.2K', y: 30 },
                    { label: '900', y: 75 },
                    { label: '600', y: 120 },
                    { label: '300', y: 165 },
                    { label: '0', y: 210 },
                  ].map((g) => (
                    <g key={g.label}>
                      <text x="35" y={g.y + 4} textAnchor="end" fontSize="11" fill="#94a3b8" fontFamily="Inter, sans-serif">
                        {g.label}
                      </text>
                      <line x1="45" y1={g.y} x2="820" y2={g.y} stroke="#f1f5f9" strokeWidth="1" />
                    </g>
                  ))}

                  {/* Bars */}
                  {MONTHLY_SAVINGS.map((item, idx) => {
                    const maxVal = 1200;
                    const chartHeight = 180; // from y=30 to y=210
                    const barHeight = (item.amount / maxVal) * chartHeight;
                    const barWidth = 32;
                    const x = 60 + idx * 64;
                    const y = 210 - barHeight;
                    const isOct = item.isPartial;

                    return (
                      <g key={item.month} className="rep-bar-group">
                        <title>{`${item.month}: ฿${item.amount.toLocaleString()}`}</title>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          fill={isOct ? '#93c5fd' : '#2563eb'}
                          rx="4"
                        />
                        <text
                          x={x + barWidth / 2}
                          y="228"
                          textAnchor="middle"
                          fontSize="11"
                          fill="#475569"
                          fontFamily="sans-serif"
                        >
                          {item.month}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            <div className="rep-subnote" style={{ marginTop: 10 }}>
              ต.ค. 69 นับถึง 13 ต.ค. (แสดงจางกว่า) · ชี้หรือแตะแท่งเพื่อดูค่า
            </div>
          </section>

          {/* Bottom Dual Trend Line Cards */}
          <section className="rep-trend-grid">
            {/* Stockout Trend */}
            <div className="rep-card">
              <div className="rep-card-head" style={{ marginBottom: 4 }}>
                <div>
                  <span className="rep-card-title">สต็อกขาด รายเดือน</span>
                  <span className="rep-card-subtitle">% ของวัน-รายการ</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: '#64748b' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#2563eb', display: 'inline-block' }} /> รายเดือน
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#94a3b8', display: 'inline-block' }} /> ช่วงฐาน 2.4%
                  </span>
                </div>
              </div>

              <div className="rep-chart-container">
                <svg viewBox="0 0 420 160" style={{ width: '100%', height: 160, display: 'block' }}>
                  {/* Gridlines */}
                  {[
                    { label: '3%', y: 25 },
                    { label: '2%', y: 65 },
                    { label: '1%', y: 105 },
                    { label: '0%', y: 145 },
                  ].map((g) => (
                    <g key={g.label}>
                      <text x="24" y={g.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="Inter, sans-serif">
                        {g.label}
                      </text>
                      <line x1="30" y1={g.y} x2="400" y2={g.y} stroke="#f1f5f9" strokeWidth="1" />
                    </g>
                  ))}

                  {/* Baseline line: 2.4% -> y = 145 - (2.4 / 3.0) * 120 = 145 - 96 = 49 */}
                  <line x1="45" y1="49" x2="395" y2="49" stroke="#94a3b8" strokeWidth="1.5" />

                  {/* Trend line: decreasing from ~1.8% down to 0.4% */}
                  {/* points: Nov(60, 75) ... Oct(390, 129) */}
                  <path
                    d="M 50 78 Q 120 85 180 102 T 310 120 L 385 129"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Dot at Oct with value label */}
                  <circle cx="385" cy="129" r="4.5" fill="#2563eb" />
                  <text x="385" y="118" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f2a5c" fontFamily="Inter, sans-serif">
                    0.4%
                  </text>

                  {/* X-axis labels */}
                  {['พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.'].map((m, idx) => (
                    <text key={m} x={50 + idx * 30.5} y="156" textAnchor="middle" fontSize="9" fill="#94a3b8">
                      {m}
                    </text>
                  ))}
                </svg>
              </div>

              <div className="rep-subnote" style={{ marginTop: 6 }}>
                เฉลี่ย 12 เดือน 0.9% เทียบช่วงฐาน 2.4% · เส้นเทาคือค่าเฉลี่ยช่วงฐาน
              </div>
            </div>

            {/* Excess Stock Trend */}
            <div className="rep-card">
              <div className="rep-card-head" style={{ marginBottom: 4 }}>
                <div>
                  <span className="rep-card-title">สต็อกเกิน รายเดือน</span>
                  <span className="rep-card-subtitle">% ของวัน-รายการ</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: '#64748b' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#2563eb', display: 'inline-block' }} /> รายเดือน
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#94a3b8', display: 'inline-block' }} /> ช่วงฐาน 11.8%
                  </span>
                </div>
              </div>

              <div className="rep-chart-container">
                <svg viewBox="0 0 420 160" style={{ width: '100%', height: 160, display: 'block' }}>
                  {/* Gridlines */}
                  {[
                    { label: '15%', y: 25 },
                    { label: '10%', y: 65 },
                    { label: '5%', y: 105 },
                    { label: '0%', y: 145 },
                  ].map((g) => (
                    <g key={g.label}>
                      <text x="24" y={g.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="Inter, sans-serif">
                        {g.label}
                      </text>
                      <line x1="30" y1={g.y} x2="400" y2={g.y} stroke="#f1f5f9" strokeWidth="1" />
                    </g>
                  ))}

                  {/* Baseline line: 11.8% -> y = 145 - (11.8 / 15.0) * 120 = 145 - 94.4 = 50.6 */}
                  <line x1="45" y1="51" x2="395" y2="51" stroke="#94a3b8" strokeWidth="1.5" />

                  {/* Trend line: decreasing from ~11.5% down to 5.6% */}
                  {/* 5.6% -> y = 145 - (5.6 / 15) * 120 = 100 */}
                  <path
                    d="M 50 53 Q 140 68 220 84 T 330 94 L 385 100"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Dot at Oct with value label */}
                  <circle cx="385" cy="100" r="4.5" fill="#2563eb" />
                  <text x="385" y="90" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f2a5c" fontFamily="Inter, sans-serif">
                    5.6%
                  </text>

                  {/* X-axis labels */}
                  {['พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.'].map((m, idx) => (
                    <text key={m} x={50 + idx * 30.5} y="156" textAnchor="middle" fontSize="9" fill="#94a3b8">
                      {m}
                    </text>
                  ))}
                </svg>
              </div>

              <div className="rep-subnote" style={{ marginTop: 6 }}>
                เฉลี่ย 12 เดือน 7.6% เทียบช่วงฐาน 11.8% · ต.ค. นับถึง 13 ต.ค.
              </div>
            </div>
          </section>
        </>
      )}

      {/* ─── TAB 2: ความแม่นยำพยากรณ์ RPT-01 ─────────────────────────── */}
      {activeTab === 'forecast' && (
        <>
          {/* Card 1: Coverage Ranges plot */}
          <section className="rep-card">
            <div className="rep-card-head">
              <div>
                <span className="rep-card-title">ความครอบคลุมของช่วงพยากรณ์ตามวิธี</span>
                <span className="rep-card-subtitle">coverage · backtest 52 สัปดาห์</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#475569' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} /> ค่าจริง
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 2, height: 12, background: '#166534', display: 'inline-block' }} /> เป้า
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 14, height: 10, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 2, display: 'inline-block' }} /> ยอมรับได้ ±0.05
                </span>
              </div>
            </div>

            {/* Scale headers: 0.80, 0.85, 0.90, 0.95, 1.00 */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px', gap: 12, marginBottom: 8, fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
              <div />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                <span>0.80</span>
                <span>0.85</span>
                <span>0.90</span>
                <span>0.95</span>
                <span>1.00</span>
              </div>
              <div />
            </div>

            {/* Range rows */}
            {FORECAST_RANGES.map((item) => {
              // Scale is from 0.80 to 1.00 (range = 0.20)
              const minVal = 0.80;
              const rangeSpan = 0.20;
              const bandLeftPct = ((item.acceptableMin - minVal) / rangeSpan) * 100;
              const bandWidthPct = ((item.acceptableMax - item.acceptableMin) / rangeSpan) * 100;
              const targetPct = ((item.target - minVal) / rangeSpan) * 100;
              const dotPct = item.actual !== null ? ((item.actual - minVal) / rangeSpan) * 100 : null;

              return (
                <div key={item.method} className="rep-cov-row">
                  <div className="rep-cov-method">{item.method}</div>
                  <div className="rep-cov-track">
                    {/* Tolerance band */}
                    <div
                      className="rep-cov-band"
                      style={{ left: `${bandLeftPct}%`, width: `${bandWidthPct}%` }}
                    />
                    {/* Target line */}
                    <div
                      className="rep-cov-target"
                      style={{ left: `${targetPct}%` }}
                    />
                    {/* Actual dot */}
                    {dotPct !== null && (
                      <div
                        className="rep-cov-dot"
                        style={{ left: `${dotPct}%` }}
                      />
                    )}
                  </div>
                  <div className="rep-cov-val">{item.label}</div>
                </div>
              );
            })}

            <div className="rep-subnote" style={{ marginTop: 12 }}>
              Coverage = สัดส่วนสัปดาห์ที่การใช้จริง ≤ ค่าพยากรณ์ quantile นั้น · ตัวอย่างตาม spec: 52 สัปดาห์ ใช้จริง ≤ P95 50 สัปดาห์ = 0.9615 ผ่าน · N &lt; 26 ตัดลง LOW_N
            </div>
          </section>

          {/* Card 2: Summary by method */}
          <section className="rep-card">
            <div className="rep-card-head">
              <div>
                <span className="rep-card-title">สรุปตามวิธีพยากรณ์</span>
                <span className="rep-card-subtitle">BR-XC-012 · pinball loss · coverage · stock-out rate</span>
              </div>
            </div>

            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>วิธี</th>
                    <th>รายการ</th>
                    <th>N (สัปดาห์)</th>
                    <th>Coverage P90</th>
                    <th>Coverage P95</th>
                    <th>Pinball P50</th>
                    <th>WAPE</th>
                    <th>สต็อกขาด (y &gt; TT)</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {FORECAST_SUMMARY.map((row) => (
                    <tr key={row.method}>
                      <td style={{ fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{row.method}</td>
                      <td>{row.itemsCount}</td>
                      <td>{row.weeksN}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif' }}>{row.coverageP90}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif' }}>{row.coverageP95}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif' }}>{row.pinballP50}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif' }}>{row.wape}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif' }}>{row.stockoutRate}</td>
                      <td>
                        {row.isLowN && (
                          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', marginRight: 6 }}>
                            LOW_N
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: '#64748b' }}>{row.note}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Card 3: Watchlist Table */}
          <section className="rep-card">
            <div className="rep-card-head">
              <div>
                <span className="rep-card-title">รายการที่ควรดู</span>
                <span className="rep-card-subtitle">เทียบเป้าตาม VED (V = P95 · E = P90)</span>
              </div>
            </div>

            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>ยา</th>
                    <th>วิธี</th>
                    <th>เป้า</th>
                    <th>ใช้จริง ≤ quantile</th>
                    <th>Coverage</th>
                    <th>ผล</th>
                  </tr>
                </thead>
                <tbody>
                  {WATCHLIST_DRUGS.map((item) => (
                    <tr key={item.name}>
                      <td style={{ fontWeight: 500 }}>
                        <span className={`ved ved-${item.ved}`} style={{ marginRight: 8 }}>
                          {item.ved}
                        </span>
                        {item.name}
                      </td>
                      <td style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#475569' }}>
                        {item.method}
                      </td>
                      <td style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{item.target}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif' }}>{item.actualOverQuantile}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{item.coverage}</td>
                      <td>
                        {item.status === 'pass' && (
                          <span className="badge st-approved" style={{ fontSize: 11.5 }}>
                            <Icon name="check" style={{ width: 12, height: 12 }} /> ผ่าน
                          </span>
                        )}
                        {item.status === 'warning' && (
                          <span className="badge st-pending" style={{ fontSize: 11.5 }}>
                            <Icon name="alertc" style={{ width: 12, height: 12 }} /> ต่ำกว่าเป้า · ยังอยู่ในช่วงยอมรับ
                          </span>
                        )}
                        {item.status === 'low_n' && (
                          <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: 11.5 }}>
                            <Icon name="minusc" style={{ width: 12, height: 12 }} /> LOW_N
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ─── TAB 3: การยืม RPT-02 · 03 · 04 ───────────────────────────── */}
      {activeTab === 'borrow' && (
        <>
          {/* 4 Borrow KPIs */}
          <section className="rep-kpi-grid">
            {BORROW_KPIS.map((kpi) => (
              <div key={kpi.title} className="rep-kpi-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="rep-kpi-title">{kpi.title}</div>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>{kpi.code}</span>
                </div>
                <div className="rep-kpi-val" style={{ margin: '4px 0' }}>{kpi.value}</div>
                <div className="rep-kpi-desc" style={{ marginTop: 'auto' }}>{kpi.desc}</div>
              </div>
            ))}
          </section>

          {/* 2 Columns: First Response Time vs Lender Reliability */}
          <section className="rep-trend-grid">
            {/* First response time */}
            <div className="rep-card">
              <div className="rep-card-head">
                <div>
                  <span className="rep-card-title">เวลาถึงการตอบรับครั้งแรก</span>
                  <span className="rep-card-subtitle">มัธยฐาน · % ของเวลารอที่อนุญาต</span>
                </div>
              </div>

              <div style={{ padding: '8px 0 16px' }}>
                {FIRST_RESPONSE_TIMES.map((row) => (
                  <div key={row.level} className="rep-resp-row">
                    <div>
                      <span className={`badge ${row.tagCls}`} style={{ width: 'fit-content' }}>
                        {row.level}
                      </span>
                    </div>
                    <div className="rep-resp-bar-wrap">
                      <div className="rep-resp-bar" style={{ width: `${row.pct}%` }} />
                    </div>
                    <div className="rep-resp-label">
                      <strong>{row.actual}</strong> / {row.allowed}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rep-subnote">
                วัดจากเวลาส่งรอบแรกถึงมีผู้ให้ยืมรายแรกตอบรับ · เวลารอที่อนุญาต: เร่งด่วนมาก 120 นาที · เร่งด่วน 360 นาที · ปกติ 2,880 นาที (F-19)
              </div>
            </div>

            {/* Lender Reliability */}
            <div className="rep-card">
              <div className="rep-card-head" style={{ marginBottom: 4 }}>
                <div>
                  <span className="rep-card-title">ความน่าเชื่อถือในฐานะผู้ให้ยืม</span>
                  <span className="rep-card-subtitle"> 12 เดือน</span>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
                ทุกโรงพยาบาลในเขต · ผู้ใช้ระดับโรงพยาบาลเห็นเฉพาะของตัวเอง
              </div>

              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr>
                      <th>โรงพยาบาล</th>
                      <th style={{ textAlign: 'right' }}>ตอบรับ</th>
                      <th style={{ textAlign: 'right' }}>หมดเวลา</th>
                      <th style={{ width: 140 }}>คะแนน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LENDER_RELIABILITIES.map((hosp) => (
                      <tr key={hosp.hospital} style={{ background: hosp.isSelf ? '#f0fdf4' : undefined }}>
                        <td style={{ fontWeight: hosp.isSelf ? 700 : 500, color: hosp.isSelf ? '#166534' : undefined }}>
                          {hosp.hospital}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>{hosp.acceptedRate}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>{hosp.timeoutRate}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ minWidth: 36, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                              {hosp.score}
                            </span>
                            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${hosp.scoreNum * 100}%`, background: '#2563eb', borderRadius: 3 }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rep-subnote" style={{ marginTop: 12 }}>
                คะแนน = อัตราตอบรับ × (1 - อัตราหมดเวลา) · ไม่มีประวัติใช้ค่าเริ่มต้น 0.5 · ใช้เป็น 10% ของ SI
              </div>
            </div>
          </section>
        </>
      )}

      {/* ─── TAB 4: ยาใกล้หมดอายุ RPT-05 · 06 ─────────────────────────── */}
      {activeTab === 'expiry' && (
        <>
          {/* 4 Expiry KPIs */}
          <section className="rep-kpi-grid">
            {EXPIRY_KPIS.map((kpi) => (
              <div key={kpi.title} className="rep-kpi-card">
                <div className="rep-kpi-title">{kpi.title}</div>
                <div className="rep-kpi-val" style={{ margin: '4px 0' }}>{kpi.value}</div>
                <div className="rep-kpi-desc" style={{ marginTop: 'auto' }}>{kpi.desc}</div>
              </div>
            ))}
          </section>

          {/* Released expiry plans */}
          <section className="rep-card">
            <div className="rep-card-head">
              <div>
                <span className="rep-card-title">แผนกระจายยาใกล้หมดอายุที่เราปล่อย</span>
                <span className="rep-card-subtitle">ค่าขนส่งต้องไม่เกิน 20% ของมูลค่า (F-23)</span>
              </div>
            </div>

            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>แผน</th>
                    <th>ยา</th>
                    <th style={{ textAlign: 'right' }}>มูลค่า</th>
                    <th style={{ textAlign: 'right' }}>ค่าขนส่ง</th>
                    <th>สัดส่วนค่าขนส่ง</th>
                    <th>ผล</th>
                  </tr>
                </thead>
                <tbody>
                  {RELEASED_EXPIRY_PLANS.map((plan) => (
                    <tr key={plan.planId}>
                      <td style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{plan.planId}</td>
                      <td>{plan.drug}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>{plan.value}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>{plan.shippingCost}</td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                          <div className="rep-ratio-bar-wrap">
                            {/* Fill: scale is 0 to 40% */}
                            <div
                              className="rep-ratio-fill"
                              style={{
                                width: `${Math.min(100, (plan.shippingRatio / 40) * 100)}%`,
                                background: plan.isUnfavorable ? '#dc2626' : '#2563eb',
                              }}
                            />
                            {/* 20% limit marker */}
                            <div className="rep-ratio-limit-line" title="เกณฑ์ 20%" />
                          </div>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500 }}>
                            {plan.shippingRatioStr}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${plan.statusCls}`} style={{ fontSize: 11.5 }}>
                          {plan.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rep-subnote" style={{ marginTop: 12 }}>
              เส้นตั้งกลางแท่ง = เกณฑ์ 20% (สเกล 0–40%) · ค่าขนส่ง = 300 + 8 บาท/กม. + ห่วงโซ่ความเย็น 500 · แผนที่ไม่คุ้มต้องเลือก 1 ใน 4 ทาง: รวบรวมส่ง / เพิ่มมูลค่า / บริจาคหรือทำลาย / เก็บไว้
            </div>
          </section>

          {/* Repeat expired drugs */}
          <section className="rep-card">
            <div className="rep-card-head">
              <div>
                <span className="rep-card-title">ยาที่หมดอายุซ้ำ</span>
                <span className="rep-card-subtitle"> สำหรับเจ้าหน้าที่พัสดุ</span>
              </div>
            </div>

            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>ยา</th>
                    <th>ล็อตที่เสีย (12 เดือน)</th>
                    <th>มูลค่าที่เสีย</th>
                    <th>ระดับ</th>
                    <th>ข้อเสนอการสั่งซื้อ</th>
                    <th style={{ textAlign: 'right' }}>ประหยัดได้ต่อปี</th>
                  </tr>
                </thead>
                <tbody>
                  {REPEAT_EXPIRED_DRUGS.map((drug) => (
                    <tr key={drug.name}>
                      <td style={{ fontWeight: 600 }}>{drug.name}</td>
                      <td>{drug.lotsLost}</td>
                      <td style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{drug.costLost}</td>
                      <td>
                        {drug.badgeLevel === 'RECOMMEND' ? (
                          <span className="badge" style={{ background: '#ffe4e6', color: '#be123c', fontWeight: 700 }}>
                            RECOMMEND
                          </span>
                        ) : (
                          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                            WATCH
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12.5, color: '#334155' }}>{drug.orderSuggestion}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif', fontWeight: 700, color: '#166534' }}>
                        {drug.yearlySavings}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rep-subnote" style={{ marginTop: 12 }}>
              WATCH เมื่อเสีย ≥ 2 ล็อตใน 12 เดือน · RECOMMEND เมื่อ ≥ 3 ล็อตหรือมูลค่าเกินเกณฑ์ · ยอดสั่งใหม่ = max(ยอดสั่งเฉลี่ย - เศษที่เหลือเฉลี่ย, ใช้ต่อวัน × รอบสั่ง)
            </div>
          </section>
        </>
      )}

      {/* Global Report Footer Links */}
      <footer className="rep-footer-links">
        <span style={{ fontWeight: 600, color: '#475569' }}>รายงานอื่น:</span>
        <a href="?page=incident" className="rep-footer-link">
          สรุปเหตุฉุกเฉิน (หน้าเหตุฉุกเฉิน)
        </a>
        <span aria-hidden="true">·</span>
        <span style={{ color: '#64748b' }}>
          คุณภาพ Agent (เฉพาะ SYSTEM_ADMIN)
        </span>
        <span aria-hidden="true">·</span>
        <span style={{ color: '#64748b' }}>
          ความครอบคลุมการยืนยันผู้จัดยา (DATA_ADMIN)
        </span>
      </footer>
    </div>
  );
}

/** Live reports unless demo mode (`?mock=1`) asks for the fixtures. */
export function ReportsPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  return mockFallbackEnabled() ? <MockReportsPage role={role} /> : <LiveReports role={role} />;
}
