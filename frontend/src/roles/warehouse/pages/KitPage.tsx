import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { IncidentDrawer, IncidentsTab } from '../components/IncidentsTab';
import { KitStockTab } from '../components/KitStockTab';
import { ReturnsTab } from '../components/ReturnsTab';
import { INCIDENTS, KIT_DEFS, kitLevel, RETURNS } from '../data/f3';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'stock' | 'incidents' | 'returns';

/**
 * F3 kits & incidents for the warehouse officer (UI-13 area). View-only for stock and incidents;
 * the warehouse confirms returns after an incident. Packing and urgent lender confirmations live in
 * the work inbox. UI only: mock data, confirmations are local state.
 */
export function KitPage() {
  const [tab, setTab] = useState<Tab>('stock');
  const [selId, setSelId] = useState<string | null>(null);
  const [got, setGot] = useState<Record<string, number>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lowKits = KIT_DEFS.filter((k) => kitLevel(Math.round((k.ready / k.target) * 100)).label !== 'พร้อมใช้').length;
  const openIncidents = INCIDENTS.filter((i) => i.status === 'OPEN');
  const waitingMe = INCIDENTS.flatMap((i) => i.requests).filter((r) => r.status === 'NEED_CONFIRM').length;
  const pendingReturns = RETURNS.filter((r) => (got[r.id] ?? 0) < r.qty).length;
  const sel = INCIDENTS.find((i) => i.id === selId) ?? null;

  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'stock', label: 'สต็อกเซ็ตพร้อมใช้', n: KIT_DEFS.length, hint: 'ดูอย่างเดียว · เซ็ตที่แพ็กไว้แล้ว + ของแยกชิ้นที่แพ็กเพิ่มได้' },
    { id: 'incidents', label: 'เหตุการณ์', n: INCIDENTS.length, hint: 'ดูอย่างเดียว · เหตุของเราและเหตุที่ รพ.อื่นขอยืมเรา' },
    { id: 'returns', label: 'รับคืนหลังเหตุ', n: pendingReturns, hint: 'ยืนยันส่งคืน/รับคืน/รับเข้าคลัง (ข้อเสนอ · ผู้ยืนยันคือ WH)' },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">เตรียมชุดยา · เหตุฉุกเฉิน</span>
          </nav>
          <h1 className="tr-title">
            เตรียมชุดยา · เหตุฉุกเฉิน <span>/ Kits & incidents · F3</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            รพ.สมุทรปราการ · สต็อกเซ็ตพร้อมใช้ เหตุการณ์ และการรับคืนหลังเหตุ · แพ็กเซ็ตและยืนยันคำขอเร่งด่วนฝั่งผู้ให้อยู่ที่กล่องงานเข้า
          </div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-p" href={whHref('inbox')} style={{ textDecoration: 'none' }}>
            <Icon name="inbox" />
            ไปที่กล่องงานเข้า
          </a>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุป F3">
        <div className={`ib-kpi ${lowKits ? 'ib-kpi-warn' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">เซ็ตที่ควรเติม <span className="en">BELOW TARGET</span></div>
          <div className="ib-kpi-val num">{lowKits} ชนิด</div>
          <div className="ib-kpi-sub">จาก {KIT_DEFS.length} ชนิดชุดยา</div>
        </div>
        <div className="ib-kpi">
          <div className="ib-kpi-label">เหตุที่เปิดอยู่ <span className="en">OPEN INCIDENTS</span></div>
          <div className="ib-kpi-val num">{openIncidents.length} เหตุ</div>
          <div className="ib-kpi-sub">เหตุของเรา {openIncidents.filter((i) => i.own).length} · รพ.อื่น {openIncidents.filter((i) => !i.own).length}</div>
        </div>
        <div className={`ib-kpi ${waitingMe ? 'ib-kpi-crit' : ''}`}>
          <div className="ib-kpi-label">รอเรายืนยัน (ผู้ให้) <span className="en">LENDER</span></div>
          <div className="ib-kpi-val num" style={{ color: waitingMe ? '#B91C1C' : undefined }}>{waitingMe} คำขอ</div>
          <div className="ib-kpi-sub">ยืนยันได้ที่กล่องงานเข้า</div>
        </div>
        <div className="ib-kpi ib-kpi-warn">
          <div className="ib-kpi-label">รอรับคืน/ส่งคืน <span className="en">RETURNS</span></div>
          <div className="ib-kpi-val num">{pendingReturns} รายการ</div>
          <div className="ib-kpi-sub">รวมที่เกินกำหนด {RETURNS.filter((r) => r.status === 'OVERDUE' && (got[r.id] ?? 0) < r.qty).length}</div>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div role="tablist" aria-label="F3" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id ? 'true' : 'false'} className={`tab ${tab === t.id ? 'tab-on' : ''}`} onClick={() => { setTab(t.id); setSelId(null); }}>
                {t.label} <span className="cnt">{t.n}</span>
              </button>
            ))}
            <span className="sub" style={{ marginLeft: 6 }}>{active.hint}</span>
          </div>
        </div>

        {tab === 'stock' && <KitStockTab />}
        {tab === 'incidents' && <IncidentsTab rows={INCIDENTS} activeId={selId} onOpen={setSelId} />}
        {tab === 'returns' && (
          <ReturnsTab rows={RETURNS} got={got} onConfirm={(id, n) => setGot((m) => ({ ...m, [id]: (m[id] ?? 0) + Math.max(0, n) }))} />
        )}
        <div className="tbl-foot">
          <span>เก็บเฉพาะจำนวนผู้บาดเจ็บแยกระดับ ไม่มีข้อมูลที่ระบุตัวผู้ป่วยได้</span>
          <span>สูตรเซ็ตเป็นค่าตั้งต้น รอเจ้าของด้านคลินิกยืนยัน</span>
        </div>
      </section>

      {sel && tab === 'incidents' && <IncidentDrawer key={sel.id} incident={sel} onClose={() => setSelId(null)} />}
    </>
  );
}
