import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { DRUGS, MAPPING_META, TYPE_META } from '../data/drugs';
import type { DrugRow, ItemType, MappingStatus } from '../data/drugs';
import { ViewOnlyNote } from '../components/ViewOnlyNote';
import { whHref } from '../data/routes';
import '../transport.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'master' | 'mapping';

const mapStatus = (d: DrugRow): MappingStatus => d.mapping?.status ?? 'UNMATCHED';
const typeOf = (d: DrugRow): ItemType => d.master?.type ?? 'DRUG';
const nameOf = (d: DrugRow) => (d.master ? `${d.master.name} ${d.master.strength} ${d.master.form}`.trim() : d.localName);

/** WH view of the drug master and suggested code mapping (RBAC 👁). Verify / edit / import are the pharmacist's. */
export function WhDrugsPage() {
  const [tab, setTab] = useState<Tab>('master');
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | ItemType>('all');
  const [status, setStatus] = useState<'all' | MappingStatus>('all');
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
  const match = (d: DrugRow) => !needle || [d.localCode, d.localName, d.tmtId, d.gpId, d.master?.name ?? ''].some((t) => t.toLowerCase().includes(needle));
  const master = DRUGS.filter(match)
    .filter((d) => type === 'all' || typeOf(d) === type)
    .filter((d) => flag === 'all' || (flag === 'cold' && d.master?.cold) || (flag === 'critical' && d.master?.emergency === 'CRITICAL') || (flag === 'high' && d.master?.highAlert));
  const mapping = DRUGS.filter(match).filter((d) => status === 'all' || mapStatus(d) === status);
  const verified = DRUGS.filter((d) => mapStatus(d) === 'VERIFIED').length;
  const sel = DRUGS.find((d) => d.localCode === selCode) ?? null;

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
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">ข้อมูลยา · รหัสยา</span>
          </nav>
          <h1 className="tr-title">
            ข้อมูลยา · รหัสยา <span>/ Drug master & mapping · ดูอย่างเดียว</span>
          </h1>
          <div style={{ fontSize: 13 }}>รพ.สมุทรปราการ · รายการยา/เวชภัณฑ์จาก HIS และการจับคู่รหัสมาตรฐาน (TMT สำหรับยา · รายการกลางสำหรับเวชภัณฑ์/เลือด)</div>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุปข้อมูลยา">
        {kpi('รายการทั้งหมด', 'ITEMS', `${DRUGS.length} รายการ`, `ยา ${DRUGS.filter((d) => typeOf(d) === 'DRUG').length} · เวชภัณฑ์ ${DRUGS.filter((d) => typeOf(d) === 'SUPPLY').length} · เลือด ${DRUGS.filter((d) => typeOf(d) === 'BLOOD').length}`)}
        {kpi('ยืนยันรหัสแล้ว', 'VERIFIED', `${verified} รายการ`, `${Math.round((verified / DRUGS.length) * 100)}% ของรายการ`, 'ib-kpi-ok')}
        {kpi('รอยืนยัน / ยังไม่จับคู่', 'PENDING', `${DRUGS.length - verified} รายการ`, 'เภสัชกรเป็นผู้ยืนยัน (Verify)', 'ib-kpi-warn')}
        {kpi('Cold chain', 'COLD', `${DRUGS.filter((d) => d.master?.cold).length} รายการ`, 'ต้องควบคุมอุณหภูมิระหว่างขนส่ง')}
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div role="tablist" aria-label="ข้อมูลยา" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <button type="button" role="tab" aria-selected={tab === 'master' ? 'true' : 'false'} className={`tab ${tab === 'master' ? 'tab-on' : ''}`} onClick={() => setTab('master')}>
              ข้อมูลยา <span className="cnt">{DRUGS.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'mapping' ? 'true' : 'false'} className={`tab ${tab === 'mapping' ? 'tab-on' : ''}`} onClick={() => setTab('mapping')}>
              การจับคู่รหัส <span className="cnt">{DRUGS.length}</span>
            </button>
            <span className="sub" style={{ marginLeft: 6 }}>
              {tab === 'master' ? 'ชื่อ รหัส หน่วย flag cold chain / critical-support' : 'Suggested mapping · TMT / รายการกลาง · คะแนนความมั่นใจ'}
            </span>
          </div>
        </div>
        <ViewOnlyNote>WH ดูอย่างเดียว · แก้ข้อมูลยา Verify รหัส และนำเข้าบัญชียาจาก HIS เป็นของเภสัชกร · ใช้ตรวจชื่อ/หน่วย/Cold chain ตอนเตรียมของ</ViewOnlyNote>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อยา / รหัส HIS / TMT" aria-label="ค้นหายา" />
          </label>
          {tab === 'master' ? (
            <>
              <select className={`sel ${type !== 'all' ? 'sel-on' : ''}`} aria-label="ประเภท" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="all">ประเภท: ทั้งหมด</option>
                <option value="DRUG">ยา (TMT)</option>
                <option value="SUPPLY">เวชภัณฑ์</option>
                <option value="BLOOD">เลือด</option>
              </select>
              <select className={`sel ${flag !== 'all' ? 'sel-on' : ''}`} aria-label="flag" value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)}>
                <option value="all">Flag: ทั้งหมด</option>
                <option value="cold">Cold chain</option>
                <option value="critical">Critical (ฉุกเฉิน)</option>
                <option value="high">High alert</option>
              </select>
            </>
          ) : (
            <select className={`sel ${status !== 'all' ? 'sel-on' : ''}`} aria-label="สถานะ" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">สถานะ: ทั้งหมด</option>
              {(Object.keys(MAPPING_META) as MappingStatus[]).map((s) => (
                <option key={s} value={s}>{MAPPING_META[s].label}</option>
              ))}
            </select>
          )}
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>TMT id/ชื่อ เป็นข้อมูลจริง · ราคา/หน่วยเป็นข้อมูลตัวอย่าง</span>
        </div>

        <div className="scroll-x">
          {tab === 'master' ? (
            <table className="tbl kt-tbl" aria-label="ข้อมูลยา">
              <thead>
                <tr>
                  <th>ชื่อ (ใน HIS)</th>
                  <th style={{ width: 150 }}>ประเภท</th>
                  <th style={{ width: 120 }}>รหัส HIS</th>
                  <th style={{ width: 130 }}>หน่วย</th>
                  <th style={{ width: 80 }}>VED/ABC</th>
                  <th style={{ width: 230 }}>Flag</th>
                </tr>
              </thead>
              <tbody>
                {master.map((d) => (
                  <tr key={d.localCode}>
                    <td>
                      <button className="rowbtn" onClick={() => setSelCode(d.localCode)} style={{ textAlign: 'left' }}>
                        <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{d.localName}</span>
                        <span className="sub" style={{ display: 'block' }}>{d.master ? `มาตรฐาน: ${nameOf(d)}` : 'ยังไม่จับคู่กับรายการมาตรฐาน'}</span>
                      </button>
                    </td>
                    <td><span className={`badge ${TYPE_META[typeOf(d)].tone}`}>{TYPE_META[typeOf(d)].label}</span></td>
                    <td className="code">{d.localCode}</td>
                    <td className="num" style={{ fontSize: 12.5 }}>{d.unit}{d.master && d.master.baseUnit !== d.unit ? <span className="sub"> (ฐาน {d.master.baseUnit})</span> : null}</td>
                    <td><span className={`ved ved-${d.ved} ved-sm`}>{d.ved}</span> <span className="sub">{d.abc}</span></td>
                    <td style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {d.master?.cold && <span className="badge t-blue" style={{ height: 18, fontSize: 11 }}>Cold chain</span>}
                      {d.master?.emergency === 'CRITICAL' && <span className="badge t-red" style={{ height: 18, fontSize: 11 }}>Critical</span>}
                      {d.master?.highAlert && <span className="badge t-orange" style={{ height: 18, fontSize: 11 }}>High alert</span>}
                      {d.master?.blood && <span className="badge t-red" style={{ height: 18, fontSize: 11 }}>เลือด</span>}
                      {!d.master?.cold && d.master?.emergency !== 'CRITICAL' && !d.master?.highAlert && !d.master?.blood && <span className="sub">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="tbl kt-tbl" aria-label="การจับคู่รหัส">
              <thead>
                <tr>
                  <th>รายการใน HIS</th>
                  <th style={{ width: 230 }}>รหัสมาตรฐาน</th>
                  <th style={{ width: 150 }}>วิธีจับคู่</th>
                  <th style={{ width: 140 }}>ความมั่นใจ</th>
                  <th style={{ width: 150 }}>สถานะ</th>
                  <th style={{ width: 170 }}>หน่วย/แพ็ก</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((d) => {
                  const st = mapStatus(d);
                  const conf = d.mapping?.confidence ?? null;
                  return (
                    <tr key={d.localCode}>
                      <td>
                        <button className="rowbtn" onClick={() => setSelCode(d.localCode)} style={{ textAlign: 'left' }}>
                          <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{d.localName}</span>
                          <span className="sub code" style={{ display: 'block' }}>{d.localCode}</span>
                        </button>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {d.master ? (
                          <>
                            <span className="code" style={{ color: '#0F2A5C' }}>{d.master.type === 'DRUG' ? `TMT ${d.tmtId} · GP ${d.gpId}` : d.master.internalCode}</span>
                            <span className="sub" style={{ display: 'block' }}>{nameOf(d)}</span>
                          </>
                        ) : (
                          <span className="sub">—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{d.mapping?.method === 'CENTRAL_LIST' ? 'รายการกลาง' : 'TMT'}<span className="sub" style={{ display: 'block' }}>โดย {d.mapping?.suggestedBy ?? '—'}</span></td>
                      <td>
                        {conf !== null ? (
                          <>
                            <span className="num" style={{ fontWeight: 600, color: conf >= 0.85 ? '#166534' : conf >= 0.6 ? '#92400E' : '#B91C1C' }}>{Math.round(conf * 100)}%</span>
                            <div className="wh-bar" style={{ marginTop: 4 }}><span style={{ width: `${Math.round(conf * 100)}%`, background: conf >= 0.85 ? '#166534' : conf >= 0.6 ? '#D97706' : '#B91C1C' }} /></div>
                          </>
                        ) : (
                          <span className="sub">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${MAPPING_META[st].tone}`}>{MAPPING_META[st].label}</span>
                        {d.mapping?.verifiedAt && <span className="sub" style={{ display: 'block' }}>{d.mapping.verifiedAt}</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {d.mapping?.basePerPack ? <>{d.mapping.packUnit} = <span className="num">{d.mapping.basePerPack}</span> {d.master?.baseUnit}</> : <span className="sub">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="tbl-foot">
          <span>แสดง <span className="num">{tab === 'master' ? master.length : mapping.length}</span> รายการ</span>
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
              <span className={`badge ${TYPE_META[typeOf(sel)].tone}`}>{TYPE_META[typeOf(sel)].label}</span>
              <span className={`badge ${MAPPING_META[mapStatus(sel)].tone}`}>{MAPPING_META[mapStatus(sel)].label}</span>
              {sel.master?.cold && <span className="badge t-blue">Cold chain</span>}
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
              <h3 className="tr-h3" style={{ marginBottom: 6 }}>รายการมาตรฐาน</h3>
              {sel.master ? (
                <dl className="dlr">
                  <dt>ชื่อ</dt>
                  <dd>{nameOf(sel)}</dd>
                  <dt>{sel.master.type === 'DRUG' ? 'TMT / GP' : 'รหัสกลาง'}</dt>
                  <dd className="code">{sel.master.type === 'DRUG' ? `${sel.tmtId} / ${sel.gpId}` : sel.master.internalCode}</dd>
                  <dt>หน่วยฐาน</dt>
                  <dd>{sel.master.baseUnit}</dd>
                  <dt>ประเภทฉุกเฉิน</dt>
                  <dd>{sel.master.emergency === 'CRITICAL' ? 'Critical (timeout 3 นาที)' : 'Supportive (timeout 5 นาที)'}</dd>
                </dl>
              ) : (
                <div className="sub">ยังไม่จับคู่กับรายการมาตรฐาน</div>
              )}
            </div>
            {sel.mapping && (
              <div className="tr-box">
                <h3 className="tr-h3" style={{ marginBottom: 6 }}>การจับคู่</h3>
                <dl className="dlr">
                  <dt>วิธี</dt>
                  <dd>{sel.mapping.method === 'CENTRAL_LIST' ? 'เลือกจากรายการกลาง' : 'TMT (ระบบแนะนำ)'}</dd>
                  <dt>ความมั่นใจ</dt>
                  <dd className="num">{sel.mapping.confidence !== null ? `${Math.round(sel.mapping.confidence * 100)}%` : '—'}</dd>
                  <dt>แพ็ก</dt>
                  <dd>{sel.mapping.basePerPack ? `${sel.mapping.packUnit} = ${sel.mapping.basePerPack} ${sel.master?.baseUnit ?? ''}` : '—'}</dd>
                  <dt>ผู้ผลิต</dt>
                  <dd>{sel.mapping.manufacturer || '—'}</dd>
                </dl>
              </div>
            )}
            {sel.candidates.length > 0 && (
              <div>
                <h3 className="tr-h3">ตัวเลือกที่ระบบแนะนำ <span className="en">รอเภสัชกรยืนยัน</span></h3>
                <ul className="kt-list">
                  {sel.candidates.map((c) => (
                    <li key={c.tmt}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: '#0F2A5C', fontSize: 13 }}>{c.name || c.tmt}</span>
                        <span className="sub code" style={{ display: 'block' }}>TMT {c.tmt}</span>
                      </div>
                      <span className="num" style={{ fontWeight: 600 }}>{Math.round(c.score * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
