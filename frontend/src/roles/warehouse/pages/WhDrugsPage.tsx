import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { TYPE_META } from '../data/drugs';
import { useHospitalDrugs } from '../data/useHospitalDrugs';
import { useAuth } from '../../../context/AuthContext';
import type { DrugRow, ItemType } from '../data/drugs';
import { ViewOnlyNote } from '../components/ViewOnlyNote';
import { whHref } from '../data/routes';
import '../transport.css';
import '../inbox.css';
import '../kit.css';

const typeOf = (d: DrugRow): ItemType => d.master?.type ?? 'DRUG';
const nameOf = (d: DrugRow) => (d.master ? `${d.master.name} ${d.master.strength} ${d.master.form}`.trim() : d.localName);

/** WH view of the drug master (RBAC 👁). Editing drug data / code mapping is the pharmacist's, so mapping is not shown here. */
export function WhDrugsPage({ homeHref = whHref('dashboard') }: { homeHref?: string }) {
  const { drugs: DRUGS, source, error } = useHospitalDrugs();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | ItemType>('all');
  const [flag, setFlag] = useState<'all' | 'cold' | 'critical' | 'high'>('all');
  const [selCode, setSelCode] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelCode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const needle = q.trim().toLowerCase();
  const rows = DRUGS.filter((d) => !needle || [d.localCode, d.localName, d.master?.name ?? ''].some((t) => t.toLowerCase().includes(needle)))
    .filter((d) => type === 'all' || typeOf(d) === type)
    .filter((d) => flag === 'all' || (flag === 'cold' && d.master?.cold) || (flag === 'critical' && d.master?.emergency === 'CRITICAL') || (flag === 'high' && d.master?.highAlert));
  const sel = DRUGS.find((d) => d.localCode === selCode) ?? null;
  const n = (pred: (d: DrugRow) => boolean) => DRUGS.filter(pred).length;

  const kpi = (label: string, en: string, val: string, sub: string, cls = '') => (
    <div className={`ib-kpi ${cls}`}>
      <div className="ib-kpi-label">{label} <span className="en">{en}</span></div>
      <div className="ib-kpi-val num">{val}</div>
      <div className="ib-kpi-sub">{sub}</div>
    </div>
  );

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHref} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">ข้อมูลยา</span>
          </nav>
          <h1 className="tr-title">
            ข้อมูลยา <span>/ Drug master · ดูอย่างเดียว</span>
          </h1>
          <div style={{ fontSize: 13 }}>{user?.hospitalName ?? 'รพ.สมุทรปราการ'} · รายการยา/เวชภัณฑ์/เลือดจาก HIS · ชื่อ รหัส หน่วย และ flag ที่ต้องรู้ตอนเตรียมของ</div>
        </div>
      </section>

      {source === 'mock' && (
        <section role="status" className="syncbar" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <span className="syncbar-text">โหลดข้อมูลยาจริงไม่ได้ ({error}) · กำลังแสดงข้อมูลตัวอย่าง</span>
        </section>
      )}

      <section className="ib-kpis" aria-label="สรุปข้อมูลยา">
        {kpi('รายการทั้งหมด', 'ITEMS', `${DRUGS.length} รายการ`, `ยา ${n((d) => typeOf(d) === 'DRUG')} · เวชภัณฑ์ ${n((d) => typeOf(d) === 'SUPPLY')} · เลือด ${n((d) => typeOf(d) === 'BLOOD')}`)}
        {kpi('Cold chain', 'COLD', `${n((d) => !!d.master?.cold)} รายการ`, 'ต้องควบคุมอุณหภูมิระหว่างเก็บ/ขนส่ง', 'ib-kpi-warn')}
        {kpi('Critical (ฉุกเฉิน)', 'CRITICAL', `${n((d) => d.master?.emergency === 'CRITICAL')} รายการ`, 'คำขอเร่งด่วนต้องยืนยันภายใน 3 นาที')}
        {kpi('High alert', 'HIGH ALERT', `${n((d) => !!d.master?.highAlert)} รายการ`, 'ยาที่ต้องระวังเป็นพิเศษ')}
      </section>

      <section className="card" style={{ padding: 0 }}>
        <ViewOnlyNote>WH ดูอย่างเดียว · แก้ข้อมูลยา ราคา หน่วย flag และนำเข้าบัญชียาจาก HIS เป็นของเภสัชกร</ViewOnlyNote>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อยา / รหัส HIS" aria-label="ค้นหายา" />
          </label>
          <select className={`sel ${type !== 'all' ? 'sel-on' : ''}`} aria-label="ประเภท" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">ประเภท: ทั้งหมด</option>
            <option value="DRUG">ยา</option>
            <option value="SUPPLY">เวชภัณฑ์</option>
            <option value="BLOOD">เลือด</option>
          </select>
          <select className={`sel ${flag !== 'all' ? 'sel-on' : ''}`} aria-label="flag" value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)}>
            <option value="all">Flag: ทั้งหมด</option>
            <option value="cold">Cold chain</option>
            <option value="critical">Critical (ฉุกเฉิน)</option>
            <option value="high">High alert</option>
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>ข้อมูลตัวอย่าง จาก mock ของโปรเจกต์</span>
        </div>

        <div className="scroll-x">
          <table className="tbl kt-tbl" aria-label="ข้อมูลยา">
            <thead>
              <tr>
                <th>ชื่อ (ใน HIS)</th>
                <th style={{ width: 130 }}>ประเภท</th>
                <th style={{ width: 120 }}>รหัส HIS</th>
                <th style={{ width: 140 }}>หน่วย</th>
                <th style={{ width: 90 }}>VED/ABC</th>
                <th style={{ width: 230 }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.localCode} className={selCode === d.localCode ? 'r-active' : ''}>
                  <td>
                    <button className="rowbtn" onClick={() => setSelCode(d.localCode)} style={{ textAlign: 'left' }}>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{d.localName}</span>
                      <span className="sub" style={{ display: 'block' }}>{d.master ? `ชื่อมาตรฐาน: ${nameOf(d)}` : 'ยังไม่มีข้อมูลมาตรฐาน'}</span>
                    </button>
                  </td>
                  <td><span className={`badge ${TYPE_META[typeOf(d)].tone}`}>{typeOf(d) === 'DRUG' ? 'ยา' : typeOf(d) === 'SUPPLY' ? 'เวชภัณฑ์' : 'เลือด'}</span></td>
                  <td className="code">{d.localCode}</td>
                  <td className="num" style={{ fontSize: 12.5 }}>{d.unit}{d.master && d.master.baseUnit !== d.unit ? <span className="sub"> (ฐาน {d.master.baseUnit})</span> : null}</td>
                  <td><span className={`ved ved-${d.ved} ved-sm`}>{d.ved}</span> <span className="sub">{d.abc}</span></td>
                  <td>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {d.master?.cold && <span className="badge t-blue" style={{ height: 18, fontSize: 11 }}>Cold chain</span>}
                      {d.master?.emergency === 'CRITICAL' && <span className="badge t-red" style={{ height: 18, fontSize: 11 }}>Critical</span>}
                      {d.master?.highAlert && <span className="badge t-orange" style={{ height: 18, fontSize: 11 }}>High alert</span>}
                      {d.master?.blood && <span className="badge t-red" style={{ height: 18, fontSize: 11 }}>เลือด</span>}
                      {!d.master?.cold && d.master?.emergency !== 'CRITICAL' && !d.master?.highAlert && !d.master?.blood && <span className="sub">—</span>}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28 }}>ไม่พบรายการ</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>แสดง <span className="num">{rows.length}</span> รายการ</span>
          <span>เห็นเฉพาะรายการของ รพ.สมุทรปราการ</span>
        </div>
      </section>

      {sel && (
        <aside className="tr-drawer" aria-label="รายละเอียดยา">
          <div className="tr-drawer-head">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="sub">ข้อมูลยา · ดูอย่างเดียว</span>
              <button className="icbtn" aria-label="ปิด / Close" onClick={() => setSelCode(null)}>
                <Icon name="x" />
              </button>
            </div>
            <h2 style={{ margin: 0, fontSize: 18, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>{sel.localName}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className={`badge ${TYPE_META[typeOf(sel)].tone}`}>{typeOf(sel) === 'DRUG' ? 'ยา' : typeOf(sel) === 'SUPPLY' ? 'เวชภัณฑ์' : 'เลือด'}</span>
              {sel.master?.cold && <span className="badge t-blue">Cold chain</span>}
              {sel.master?.emergency === 'CRITICAL' && <span className="badge t-red">Critical</span>}
              {sel.master?.highAlert && <span className="badge t-orange">High alert</span>}
            </div>
          </div>
          <div className="tr-drawer-body">
            <div className="tr-box">
              <h3 className="tr-h3" style={{ marginBottom: 6 }}>ข้อมูลในโรงพยาบาล</h3>
              <dl className="dlr">
                <dt>รหัส HIS</dt>
                <dd className="code">{sel.localCode}</dd>
                <dt>หน่วย</dt>
                <dd>{sel.unit}</dd>
                <dt>VED / ABC</dt>
                <dd>{sel.ved} / {sel.abc}</dd>
              </dl>
            </div>
            <div className="tr-box">
              <h3 className="tr-h3" style={{ marginBottom: 6 }}>ข้อมูลมาตรฐาน</h3>
              {sel.master ? (
                <dl className="dlr">
                  <dt>ชื่อ</dt>
                  <dd>{nameOf(sel)}</dd>
                  <dt>หน่วยฐาน</dt>
                  <dd>{sel.master.baseUnit}</dd>
                  <dt>ประเภทฉุกเฉิน</dt>
                  <dd>{sel.master.emergency === 'CRITICAL' ? 'Critical (timeout 3 นาที)' : 'Supportive (timeout 5 นาที)'}</dd>
                  <dt>Cold chain</dt>
                  <dd>{sel.master.cold ? 'ใช่ · ต้องควบคุมอุณหภูมิ' : 'ไม่'}</dd>
                </dl>
              ) : (
                <div className="sub">ยังไม่มีข้อมูลมาตรฐานสำหรับรายการนี้</div>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
