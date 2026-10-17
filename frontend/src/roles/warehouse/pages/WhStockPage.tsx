import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { AGENT_SUMMARY } from '../../pharmacist/data/dashboard';
import {
  ALERT_ROWS, ALERT_STATUS_META, ALERT_SUMMARY, ALERT_TYPE_META, NOTE_TONE_COLOR, PHARMACY_CONTEXT, QUEUE_ROWS, SEVERITY_META,
} from '../../pharmacist/data/stockAlerts';
import type { Severity, StockAlertRow } from '../../pharmacist/data/stockAlerts';
import { ViewOnlyNote } from '../components/ViewOnlyNote';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'stock' | 'alerts' | 'agent';

const METHOD: Record<string, string> = { MA_ES: 'MA / ES', QUANTILE_LGBM: 'Quantile', MIN_MAX: 'Min-Max', COLD_START: 'Cold start' };
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, urgent: 1, normal: 2 };
const KPI_CLS: Record<string, string> = { crit: 'ib-kpi-crit', warn: 'ib-kpi-warn', blue: '', grey: '', teal: '' };

function Target({ r }: { r: StockAlertRow }) {
  if (r.predict === null || r.totalTarget === null) {
    return r.min !== undefined ? (
      <span className="num">Min {r.min} · Max {r.max}</span>
    ) : (
      <span className="sub">—</span>
    );
  }
  return (
    <span className="num">
      <b style={{ color: '#0F2A5C' }}>{r.predict}</b> / {r.totalTarget}
    </span>
  );
}

/** WH stock, forecast & Agent view (RBAC 👁): the same numbers the pharmacist sees, without any action. */
export function WhStockPage() {
  const [tab, setTab] = useState<Tab>('stock');
  const [q, setQ] = useState('');
  const [alertOnly, setAlertOnly] = useState<'all' | 'alert' | 'none'>('all');
  const [ved, setVed] = useState<'all' | 'V' | 'E' | 'D'>('all');

  const needle = q.trim().toLowerCase();
  const rows = ALERT_ROWS.filter((r) => (ved === 'all' || r.ved === ved) && (alertOnly === 'all' || (alertOnly === 'alert') === (r.alert !== null)) && (!needle || [r.drug, r.code].some((t) => t.toLowerCase().includes(needle))));
  const queue = [...QUEUE_ROWS].sort((a, b) => SEVERITY_ORDER[a.alert!.severity] - SEVERITY_ORDER[b.alert!.severity]);
  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'stock', label: 'สต็อกและผลทำนาย', n: ALERT_ROWS.length, hint: 'คงเหลือ · Predict (P50) / Total Target (P90–P95) · วิธีพยากรณ์' },
    { id: 'alerts', label: 'การแจ้งเตือน', n: QUEUE_ROWS.length, hint: 'แจ้งเตือนสต็อกต่ำ/เกิน · เภสัชกรเป็นผู้รับทราบและสร้างคำขอ' },
    { id: 'agent', label: 'แผนและสรุปของ Agent', n: 2, hint: 'Agent เสนอเท่านั้น · เภสัชกรอนุมัติ' },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">สต็อก · ผลทำนาย · Agent</span>
          </nav>
          <h1 className="tr-title">
            สต็อก · ผลทำนาย · Agent <span>/ Stock, forecast & Agent · ดูอย่างเดียว</span>
          </h1>
          <div style={{ fontSize: 13 }}>{PHARMACY_CONTEXT.subtitle}</div>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุปแจ้งเตือน">
        {ALERT_SUMMARY.slice(0, 4).map((c) => (
          <div key={c.key} className={`ib-kpi ${KPI_CLS[c.tone]}`}>
            <div className="ib-kpi-label">{c.labelTh} {c.code && <span className="en">{c.code}</span>}</div>
            <div className="ib-kpi-val num">{c.count} รายการ</div>
            <div className="ib-kpi-sub">{c.subTh}</div>
          </div>
        ))}
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div role="tablist" aria-label="สต็อกและ Agent" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id ? 'true' : 'false'} className={`tab ${tab === t.id ? 'tab-on' : ''}`} onClick={() => setTab(t.id)}>
                {t.label} <span className="cnt">{t.n}</span>
              </button>
            ))}
            <span className="sub" style={{ marginLeft: 6 }}>{active.hint}</span>
          </div>
        </div>
        <ViewOnlyNote>WH ดูได้อย่างเดียว · การรับทราบ/เลื่อนเตือน/สร้างคำขอยืมเป็นของเภสัชกร · ใช้เตรียมของล่วงหน้าเมื่อยาใกล้ขาดหรือมีคำขอยืม</ViewOnlyNote>

        {tab === 'stock' && (
          <>
            <div className="tr-filters">
              <label className="tr-search">
                <Icon name="search" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อยา / รหัส HIS" aria-label="ค้นหายา" />
              </label>
              <select className={`sel ${ved !== 'all' ? 'sel-on' : ''}`} aria-label="VED" value={ved} onChange={(e) => setVed(e.target.value as typeof ved)}>
                <option value="all">VED: ทั้งหมด</option>
                <option value="V">V (วิกฤต)</option>
                <option value="E">E (จำเป็น)</option>
                <option value="D">D (ทั่วไป)</option>
              </select>
              <select className={`sel ${alertOnly !== 'all' ? 'sel-on' : ''}`} aria-label="แจ้งเตือน" value={alertOnly} onChange={(e) => setAlertOnly(e.target.value as typeof alertOnly)}>
                <option value="all">แจ้งเตือน: ทั้งหมด</option>
                <option value="alert">มีแจ้งเตือน</option>
                <option value="none">ไม่มีแจ้งเตือน</option>
              </select>
              <span style={{ flex: '1 1 0' }} />
              <span style={{ fontSize: 12 }}>Predict / Total Target · หน่วยตามหน่วยจ่ายฐาน</span>
            </div>
            <div className="scroll-x">
              <table className="tbl kt-tbl" aria-label="สต็อกและผลทำนาย">
                <thead>
                  <tr>
                    <th>ยา</th>
                    <th style={{ width: 120 }}>คงเหลือ</th>
                    <th style={{ width: 110 }}>ใช้ได้อีก</th>
                    <th style={{ width: 100 }}>ใช้/วัน</th>
                    <th style={{ width: 170 }}>Predict / Target</th>
                    <th style={{ width: 160 }}>วิธีพยากรณ์</th>
                    <th style={{ width: 200 }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={`ved ved-${r.ved} ved-sm`} style={{ marginRight: 6 }}>{r.ved}</span>
                        <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                        <span className="sub code" style={{ display: 'block' }}>รหัส {r.code} · ABC {r.abc}</span>
                      </td>
                      <td className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{r.onHand} <span className="sub">{r.unit}</span></td>
                      <td className="num" style={{ color: r.daysLeft < 3 ? '#B91C1C' : '#0F2A5C', fontWeight: 600 }}>{r.daysLeft} วัน</td>
                      <td className="num">{r.dailyUse}</td>
                      <td>
                        <Target r={r} />
                        <span style={{ display: 'block', fontSize: 11.5, color: NOTE_TONE_COLOR[r.noteTone] }}>{r.note}</span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {r.method ? METHOD[r.method] : '—'}
                        {r.lowConfidence && <span className="badge t-red" style={{ marginLeft: 6, height: 18, fontSize: 11 }}>ไม่มั่นใจ</span>}
                      </td>
                      <td>
                        {r.alert ? (
                          <>
                            <span className={`badge ${ALERT_TYPE_META[r.alert.type].cls}`}>{ALERT_TYPE_META[r.alert.type].th}</span>
                            <span className={`badge ${ALERT_STATUS_META[r.alert.status].cls}`} style={{ marginLeft: 4 }}>{ALERT_STATUS_META[r.alert.status].labelTh}</span>
                            {r.alert.brNo && <span className="code" style={{ display: 'block', fontSize: 11 }}>{r.alert.brNo}</span>}
                          </>
                        ) : (
                          <span className="sub">ไม่มีแจ้งเตือน</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>ไม่พบรายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'alerts' && (
          <div className="scroll-x">
            <table className="tbl kt-tbl" aria-label="การแจ้งเตือนสต็อก">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>ความเร่งด่วน</th>
                  <th>ยา</th>
                  <th style={{ width: 170 }}>ประเภท</th>
                  <th style={{ width: 150 }}>สถานะ</th>
                  <th style={{ width: 150 }}>คำขอยืม</th>
                  <th style={{ width: 90 }}>เวลา</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => {
                  const a = r.alert!;
                  return (
                    <tr key={r.id}>
                      <td><span className={`badge ${SEVERITY_META[a.severity].cls}`}>{SEVERITY_META[a.severity].labelTh}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.drug}</span>
                        <span className="sub" style={{ display: 'block' }}>คงเหลือ {r.onHand} {r.unit} · ใช้ได้อีก {r.daysLeft} วัน</span>
                      </td>
                      <td><span className={`badge ${ALERT_TYPE_META[a.type].cls}`}>{ALERT_TYPE_META[a.type].th}</span></td>
                      <td><span className={`badge ${ALERT_STATUS_META[a.status].cls}`}>{ALERT_STATUS_META[a.status].labelTh}</span></td>
                      <td className="code">{a.brNo ?? '—'}</td>
                      <td className="num">{a.time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'agent' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <section className="agent-card" aria-label="สรุปประจำวันจาก Agent" style={{ margin: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1D4ED8', fontSize: 14, fontWeight: 600 }}>
                  <Icon name="sparkle" />
                  {AGENT_SUMMARY.title}
                </span>
                <span className={`badge ${AGENT_SUMMARY.confCls}`}>{AGENT_SUMMARY.conf}</span>
              </div>
              <div className="sub" style={{ marginTop: 4 }}>{AGENT_SUMMARY.meta}</div>
              <p style={{ margin: '8px 0', fontSize: 14, lineHeight: '23px', color: '#0F2A5C' }}>{AGENT_SUMMARY.text}</p>
              <div className="sub" style={{ marginBottom: 4 }}>ยาที่เสี่ยง (at_risk)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {AGENT_SUMMARY.risk.map((x) => (
                  <span key={x} className="badge" style={{ background: '#FFFFFF', border: '1px solid #DBEAFE', color: '#0F2A5C' }}>{x}</span>
                ))}
                {AGENT_SUMMARY.flags.map((f) => (
                  <span key={f} className="badge t-red code">{f}</span>
                ))}
              </div>
            </section>
            <section className="agent-card" aria-label="แผนที่ Agent เสนอ" style={{ margin: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1D4ED8', fontSize: 14, fontWeight: 600 }}>
                  <Icon name="sparkle" />
                  แผนที่ Agent เสนอ <span className="en">Agent suggestion</span>
                </span>
                <span className="badge t-amber">รอเภสัชกรอนุมัติ</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
                ขอยืม Insulin Glargine pen <span className="num">120</span> หน่วย: รพ.บางพลี 80 + รพ.บางบ่อ 40
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '20px', color: '#475569' }}>
                เหตุผล: คงเหลือ 18 ด้าม ใช้เฉลี่ย 12/วัน → พอใช้ 1.5 วัน ต่ำกว่า Predict 7 วัน · ทั้งสองแห่งมีสต็อกเกินเกณฑ์ปลอดภัยและส่งถึงได้ภายในวันนี้
              </p>
              <div className="sub" style={{ marginTop: 8 }}>
                ตัวเลขทั้งหมดคำนวณโดยระบบ (ไม่ใช่ LLM) · ถ้าเภสัชกรอนุมัติและ รพ.อื่นตอบรับ งานจะเข้ากล่องงานเข้าของ WH ให้เตรียมของ
              </div>
            </section>
          </div>
        )}
        <div className="tbl-foot">
          <span>เห็นเฉพาะข้อมูลของ รพ.สมุทรปราการ · ไม่แสดงสต็อกของ รพ.อื่น</span>
          <span>พยากรณ์รอบ 01:00 น. · สต็อกจาก HIS 06:10 น.</span>
        </div>
      </section>
    </>
  );
}
