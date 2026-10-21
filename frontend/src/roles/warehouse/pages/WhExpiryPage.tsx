import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { EXPIRY_KPIS, fefoUsable, NEAR_EXPIRY_ITEMS } from '../../pharmacist/data/nearExpiry';
import type { NearExpiryStatus } from '../../pharmacist/data/nearExpiry';
import { ALLOCATION_PLANS, planStatusMeta, POOL_LOTS, POOL_TOTAL_VALUE } from '../../pharmacist/data/pool';
import { ViewOnlyNote } from '../components/ViewOnlyNote';
import { whHref } from '../data/routes';
import '../transport.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'mine' | 'pool' | 'plans' | 'rules';

const STATUS: Record<NearExpiryStatus, { label: string; tone: string }> = {
  PENDING: { label: 'รอเภสัชกรตรวจ', tone: 't-amber' },
  RELEASED: { label: 'ปล่อยเข้าคลังกลางแล้ว', tone: 't-teal' },
  ALLOCATED: { label: 'อยู่ในแผนจัดสรร', tone: 't-blue' },
  KEPT: { label: 'เก็บไว้ใช้เอง', tone: 't-grey' },
  EXPIRED: { label: 'หมดอายุ', tone: 't-red' },
  TRANSFERRED: { label: 'โอนให้ รพ.อื่นแล้ว', tone: 't-green' },
  DISMISSED: { label: 'ปิดรายการ', tone: 't-grey' },
};
const REPEAT = { WATCH: { label: 'เฝ้าระวัง', tone: 't-amber' }, RECOMMEND: { label: 'แนะนำลดสั่ง', tone: 't-red' } } as const;
const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;

/** WH view of near-expiry (F2): our lots, the central pool, allocation plans and repeat-expiry rules (RBAC 👁). */
export function WhExpiryPage() {
  const [tab, setTab] = useState<Tab>('mine');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const has = (...t: string[]) => !needle || t.some((x) => x.toLowerCase().includes(needle));

  const mine = NEAR_EXPIRY_ITEMS.filter((i) => has(i.drug, i.lot, i.code));
  const pool = POOL_LOTS.filter((l) => has(l.drug, l.id, l.code, l.from));
  const plans = ALLOCATION_PLANS.filter((p) => has(p.id, p.drug, p.from, p.to));
  const rules = NEAR_EXPIRY_ITEMS.filter((i) => has(i.drug, i.code));

  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'mine', label: 'ล็อตของ รพ.เรา', n: NEAR_EXPIRY_ITEMS.length, hint: 'ล็อตใกล้หมดอายุ · เภสัชกรเป็นผู้ตรวจและปล่อยเข้าคลังกลาง' },
    { id: 'pool', label: 'คลังกลาง', n: POOL_LOTS.length, hint: 'ถูกกันไว้ = ของยังอยู่ที่ รพ.ต้นทางจนกว่าจะขึ้นรถ' },
    { id: 'plans', label: 'แผนจัดสรร', n: ALLOCATION_PLANS.length, hint: 'Agent จับคู่ · เภสัชกรอนุมัติ · อนุมัติแล้วงานเข้ากล่องงานเข้า' },
    { id: 'rules', label: 'เกณฑ์ตรวจหมดอายุซ้ำ', n: NEAR_EXPIRY_ITEMS.length, hint: 'เกณฑ์ต่อตัวยา (ASM-14) และการตรวจจับยาที่หมดอายุซ้ำ (F2b)' },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">ยาใกล้หมดอายุ</span>
          </nav>
          <h1 className="tr-title">
            ยาใกล้หมดอายุ <span>/ Near-expiry (F2) · ดูอย่างเดียว</span>
          </h1>
          <div style={{ fontSize: 13 }}>รพ.สมุทรปราการ · ล็อตใกล้หมดอายุ คลังกลาง แผนจัดสรร และเกณฑ์ตรวจหมดอายุซ้ำ</div>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุป F2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {EXPIRY_KPIS.map((k) => (
          <div key={k.en} className="ib-kpi" style={{ borderLeftColor: k.accent, background: k.accentBg }}>
            <div className="ib-kpi-label">{k.label} <span className="en">{k.en}</span></div>
            <div className="ib-kpi-val num">{k.value}</div>
            <div className="ib-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div role="tablist" aria-label="F2" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id ? 'true' : 'false'} className={`tab ${tab === t.id ? 'tab-on' : ''}`} onClick={() => setTab(t.id)}>
                {t.label} <span className="cnt">{t.n}</span>
              </button>
            ))}
            <span className="sub" style={{ marginLeft: 6 }}>{active.hint}</span>
          </div>
        </div>
        <ViewOnlyNote>WH ดูอย่างเดียว · ตั้งเกณฑ์ ปล่อยล็อต อนุมัติแผน และเลือกทางออกเมื่อขนส่งไม่คุ้มเป็นของเภสัชกร · ราคา/มูลค่าในคลังกลางแสดงเฉพาะที่เห็นได้</ViewOnlyNote>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ยา / ล็อต / รพ." aria-label="ค้นหา" />
          </label>
          <span style={{ flex: '1 1 0' }} />
          {tab === 'pool' && <span style={{ fontSize: 12 }}>รวมในคลังกลาง {POOL_LOTS.length} ล็อต · {baht(POOL_TOTAL_VALUE)}</span>}
        </div>

        <div className="scroll-x">
          {tab === 'mine' && (
            <table className="tbl kt-tbl" aria-label="ล็อตใกล้หมดอายุของ รพ.เรา">
              <thead>
                <tr>
                  <th>ยา · ล็อต</th>
                  <th style={{ width: 120 }}>จำนวน</th>
                  <th style={{ width: 170 }}>หมดอายุ</th>
                  <th style={{ width: 130 }}>ใช้ทันก่อนหมด</th>
                  <th style={{ width: 200 }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className={`ved ved-${i.ved} ved-sm`} style={{ marginRight: 6 }}>{i.ved}</span>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{i.drug}</span>
                      <span className="sub code" style={{ display: 'block' }}>ล็อต {i.lot} · {i.id}</span>
                    </td>
                    <td className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{i.qty} <span className="sub">{i.unit}</span></td>
                    <td>
                      <span className="num">{i.expiry}</span>
                      <span className="sub" style={{ display: 'block' }}>เหลือ {i.daysLeft} วัน · เกณฑ์ {i.thresholdDays} วัน</span>
                    </td>
                    <td className="num">{fefoUsable(i)} {i.unit}</td>
                    <td>
                      <span className={`badge ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
                      {i.repeatFlag && <span className={`badge ${REPEAT[i.repeatFlag].tone}`} style={{ marginLeft: 4 }}>{REPEAT[i.repeatFlag].label}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'pool' && (
            <table className="tbl kt-tbl" aria-label="คลังกลาง">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>ล็อต</th>
                  <th>ยา</th>
                  <th style={{ width: 120 }}>จำนวน</th>
                  <th style={{ width: 170 }}>หมดอายุ</th>
                  <th style={{ width: 220 }}>รพ.เจ้าของ</th>
                  <th style={{ width: 120 }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pool.map((l) => (
                  <tr key={l.id}>
                    <td className="code" style={{ fontWeight: 600, color: '#1D4ED8' }}>{l.id}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{l.drug}</span>
                      <span className="sub code" style={{ display: 'block' }}>รหัส {l.code}</span>
                    </td>
                    <td className="num" style={{ color: '#0F2A5C', fontWeight: 600 }}>{l.qty} <span className="sub">{l.unit}</span></td>
                    <td className="num" style={{ fontSize: 12.5 }}>{l.expiry}<span className="sub" style={{ display: 'block' }}>เหลือ {l.daysLeft} วัน</span></td>
                    <td style={{ fontSize: 12.5 }}>{l.from}<span className="sub" style={{ display: 'block' }}>{l.releasedBy} · {l.releasedAt}</span></td>
                    <td><span className="badge t-teal">ถูกกันไว้</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'plans' && (
            <table className="tbl kt-tbl" aria-label="แผนจัดสรร">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>แผน</th>
                  <th>ยา · จำนวน</th>
                  <th style={{ width: 230 }}>เส้นทาง</th>
                  <th style={{ width: 150 }}>ค่าขนส่ง/มูลค่า</th>
                  <th style={{ width: 230 }}>การอนุมัติ (เภสัชกร)</th>
                  <th style={{ width: 150 }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const m = planStatusMeta(p.status);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="code" style={{ fontWeight: 600, color: '#1D4ED8' }}>{p.id}</span>
                        <span className="sub" style={{ display: 'block' }}>v{p.version} · Agent {p.agent.confidence}</span>
                      </td>
                      <td>
                        <span className={`ved ved-${p.ved} ved-sm`} style={{ marginRight: 6 }}>{p.ved}</span>
                        <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{p.drug}</span>
                        <span className="num" style={{ display: 'block', fontSize: 12.5 }}>{p.qty} {p.unit} · ล็อต {p.lotNo}</span>
                      </td>
                      <td style={{ fontSize: 12.5, color: '#0F2A5C' }}>
                        {p.from} → {p.to}
                        <span className="sub" style={{ display: 'block' }}>{p.distanceKm} กม.{p.coldChain ? ' · Cold chain' : ''}</span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        <span className="num">{baht(p.transportCost)}</span> / <span className="num">{baht(p.totalValue)}</span>
                        <span className={`sub`} style={{ display: 'block', color: p.economical ? undefined : '#B91C1C' }}>{p.costRatioPct}% {p.economical ? '' : '· ไม่คุ้ม'}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.approvals.map((a) => (
                          <div key={a.hospital}>
                            {a.hospital} · {a.state === 'APPROVED' ? 'อนุมัติแล้ว' : a.state === 'WAITING' ? 'รออนุมัติ' : 'ปฏิเสธ'}
                          </div>
                        ))}
                      </td>
                      <td><span className={`badge ${m.tone}`}>{m.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {tab === 'rules' && (
            <table className="tbl kt-tbl" aria-label="เกณฑ์ตรวจหมดอายุซ้ำ">
              <thead>
                <tr>
                  <th>ยา</th>
                  <th style={{ width: 160 }}>เกณฑ์ใกล้หมดอายุ</th>
                  <th style={{ width: 150 }}>อัตราใช้/วัน</th>
                  <th style={{ width: 170 }}>หมดอายุซ้ำ (F2b)</th>
                  <th>ประวัติล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className={`ved ved-${i.ved} ved-sm`} style={{ marginRight: 6 }}>{i.ved}</span>
                      <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{i.drug}</span>
                    </td>
                    <td className="num">{i.thresholdDays} วัน</td>
                    <td className="num">{i.usagePerDay}</td>
                    <td>{i.repeatFlag ? <span className={`badge ${REPEAT[i.repeatFlag].tone}`}>{REPEAT[i.repeatFlag].label}</span> : <span className="sub">ปกติ</span>}</td>
                    <td className="sub" style={{ fontSize: 12 }}>{i.history[0]?.text ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="tbl-foot">
          <span>เห็นเฉพาะข้อมูลของ รพ.สมุทรปราการ และคลังกลางของเขต</span>
          <span>อัปเดตล่าสุด 02:30 น.</span>
        </div>
      </section>
    </>
  );
}
