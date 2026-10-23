import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import type { RoleCode } from '../../../lib/rbac';
import { dismissRepeatExpiry, getReport, getValue, listRepeatExpiry } from '../../../services/expiryApi';
import type { ApiReport, ApiRepeatFlag, ApiValue } from '../../../services/expiryApi';
import { onLoadFailure, onLoadSuccess } from '../../../services/dataSource';
import '../reports.css';

type Tab = 'value' | 'forecast' | 'borrow' | 'expiry';
const TABS: { id: Tab; title: string }[] = [
  { id: 'value', title: 'มูลค่า' },
  { id: 'forecast', title: 'ความแม่นยำพยากรณ์' },
  { id: 'borrow', title: 'การยืม' },
  { id: 'expiry', title: 'ยาใกล้หมดอายุ' },
];
const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;

function Table({ report }: { report: ApiReport | null }) {
  if (!report) return <div className="sub">กำลังโหลด…</div>;
  return (
    <div className="scroll-x">
      <table className="tbl" aria-label={report.name}>
        <thead><tr>{report.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={i}>{report.columns.map((c) => <td key={c.key} className="num">{typeof r[c.key] === 'number' ? Number(r[c.key]).toLocaleString('en-US') : (r[c.key] ?? '–')}</td>)}</tr>
          ))}
          {report.rows.length === 0 && <tr><td colSpan={report.columns.length} style={{ textAlign: 'center', padding: 20 }}>ไม่มีข้อมูลในช่วงนี้</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** UI-19 on the live API: value (`GET /value`), borrowing and expiry reports (`GET /reports/{id}`), repeated-expiry flags. Forecast accuracy has no API yet. */
export function LiveReports({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [tab, setTab] = useState<Tab>('value');
  const [months, setMonths] = useState(12);
  const [value, setValue] = useState<ApiValue | null>(null);
  const [borrow, setBorrow] = useState<ApiReport | null>(null);
  const [waste, setWaste] = useState<ApiReport | null>(null);
  const [flags, setFlags] = useState<ApiRepeatFlag[]>([]);

  const loadFlags = () => listRepeatExpiry().then((r) => setFlags(r.items)).catch(() => setFlags([]));
  useEffect(() => {
    Promise.all([getValue(months), getReport('borrow_activity', months), getReport('expiry_waste', months)])
      .then(([v, b, w]) => {
        onLoadSuccess('reports');
        setValue(v);
        setBorrow(b);
        setWaste(w);
      })
      .catch((e) => onLoadFailure('reports', e, null, null));
    void loadFlags();
  }, [months]);

  const t = value?.totals;
  return (
    <div className="rep-container">
      <section className="pagehead">
        <div style={{ width: '100%' }}>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px', marginBottom: 4 }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">รายงานมูลค่า</span>
          </nav>
          <h1 className="tr-title">รายงานมูลค่า <span>/ Reports · Value · UI-19</span></h1>
          <div style={{ fontSize: 13 }}>ข้อมูลจากฐานข้อมูลของ รพ.เรา · ช่วง {months} เดือนล่าสุด</div>
        </div>
        <div className="pagehead-actions">
          <select className="sel" aria-label="ช่วงเวลา" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={3}>3 เดือน</option>
            <option value={6}>6 เดือน</option>
            <option value={12}>12 เดือน</option>
            <option value={24}>24 เดือน</option>
          </select>
        </div>
      </section>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={`tab ${tab === x.id ? 'tab-on' : ''}`} onClick={() => setTab(x.id)}>{x.title}</button>
        ))}
      </div>

      {tab === 'value' && (
        <section className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {[
              ['มูลค่ายาที่โอนก่อนหมดอายุ', t ? baht(t.transferredValueThb) : '–', `${t?.completedPlans ?? 0} แผนที่ส่งมอบครบ`],
              ['ค่าขนส่งของแผนเหล่านั้น', t ? baht(t.transportCostThb) : '–', 'จากแผนที่ส่งมอบครบแล้ว'],
              ['มูลค่าสุทธิที่เลี่ยงการสูญเสีย', t ? baht(t.netSavedThb) : '–', 'โอน − ค่าขนส่ง'],
              ['มูลค่ายาหมดอายุจริง', t ? baht(t.expiredWriteOffThb) : '–', 'ล็อตที่หมดอายุทั้งที่ยังมีของ'],
              ['วันขาดสต็อกรวม (รายการ-วัน)', t ? t.stockoutItemDays.toLocaleString('en-US') : '–', 'จากบันทึกรายเดือน'],
            ].map(([a, b, c]) => (
              <div key={a} className="card" style={{ padding: 12 }}>
                <div className="sub">{a}</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#0F2A5C' }}>{b}</div>
                <div className="sub">{c}</div>
              </div>
            ))}
          </div>
          <h3 className="tr-h3" style={{ marginTop: 16 }}>รายเดือน</h3>
          <Table report={value ? { ok: true, id: 'value', name: 'มูลค่ารายเดือน', generatedAt: '', columns: [{ key: 'period', label: 'เดือน' }, { key: 'transferred', label: 'โอนก่อนหมดอายุ (บาท)' }, { key: 'writeoff', label: 'หมดอายุจริง (บาท)' }, { key: 'stockout', label: 'วันขาดสต็อก' }], rows: value.byMonth.map((m) => ({ period: m.period.slice(0, 7), transferred: m.transferredValueThb, writeoff: m.expiredWriteOffThb, stockout: m.stockoutItemDays })) } : null} />
        </section>
      )}
      {tab === 'forecast' && (
        <section className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#1D4ED8' }}>
            <Icon name="chart" className="ic24" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#0F2A5C' }}>
            ความแม่นยำโมเดลพยากรณ์ (RPT-01 · F-19)
          </h3>
          <p style={{ margin: '0 auto 16px', maxWidth: 480, fontSize: 13, lineHeight: '20px', color: '#64748B' }}>
            ยังไม่มีข้อมูลตัวชี้วัดความแม่นยำ (Pinball loss, Coverage P90/P95, WAPE) จากระบบหลังบ้าน
            ระบบจะแสดงผลการประเมินหลังจากงานพยากรณ์รอบสัปดาห์ (JOB-01) เก็บประวัติย้อนหลังครบ 12 สัปดาห์
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94A3B8', background: '#F8FAFC', padding: '6px 14px', borderRadius: 999, border: '1px solid #E2E8F0' }}>
            <Icon name="hourglass" className="ic16" />
            <span>รอการประเมินผลรอบสัปดาห์ถัดไป</span>
          </div>
        </section>
      )}
      {tab === 'borrow' && <section className="card" style={{ padding: 16 }}><Table report={borrow} /></section>}
      {tab === 'expiry' && (
        <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 className="tr-h3">มูลค่ายาหมดอายุต่อเดือน <span className="en">RPT-05</span></h3>
            <Table report={waste} />
          </div>
          <div>
            <h3 className="tr-h3">ยาที่หมดอายุซ้ำ <span className="en">RPT-06 · F-25</span></h3>
            {flags.length === 0 ? <div className="sub">ไม่มียาที่เข้าเกณฑ์หมดอายุซ้ำ</div> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {flags.map((f) => (
                  <li key={f.id} className="card" style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span className={`badge ${f.level === 'RECOMMEND' ? 't-red' : 't-amber'}`}>{f.level}</span>
                    <b style={{ color: '#0F2A5C' }}>{f.drug.name}</b>
                    <span className="sub num">{f.lots12m} ล็อตใน 12 เดือน · {f.valueThb12m !== null ? baht(f.valueThb12m) : '–'}</span>
                    {f.suggestion && 'newOrder' in f.suggestion && <span className="sub num">แนะนำสั่งรอบละ {String(f.suggestion.newOrder)} (ลด {String(f.suggestion.reduction)}) · ประหยัด ~{baht(Number(f.suggestion.expectedSavingsThb))}/ปี</span>}
                    <button className="btn btn-g btn-sm" style={{ marginLeft: 'auto' }} onClick={() => dismissRepeatExpiry(f.id).then(loadFlags)}><Icon name="x" /> ปิด 90 วัน</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
