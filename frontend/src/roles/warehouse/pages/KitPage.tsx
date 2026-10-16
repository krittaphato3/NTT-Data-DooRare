import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { IncidentDrawer, IncidentsTab } from '../components/IncidentsTab';
import { PackTab } from '../components/PackTab';
import { ReturnsTab } from '../components/ReturnsTab';
import { INCIDENTS, KIT_DEFS, kitLevel, PACK_TASKS, RETURNS } from '../data/f3';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'pack' | 'incidents' | 'returns';

/**
 * F3 kits & incidents for the warehouse officer, about OUR OWN incidents: pack sets from the
 * ER-approved plan (see ready-set stock), follow incidents (view-only), and confirm returns after an
 * incident. Requests from other hospitals (urgent lender) are answered in "คำขอรอยืนยัน".
 * UI only: mock data, confirmations are local state.
 */
export function KitPage() {
  const [tab, setTab] = useState<Tab>('pack');
  const [selId, setSelId] = useState<string | null>(null);
  const [got, setGot] = useState<Record<string, number>>({});
  const [packed, setPacked] = useState<ReadonlySet<string>>(new Set());
  const [kits, setKits] = useState(KIT_DEFS);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lowKits = kits.filter((k) => kitLevel(Math.round((k.ready / k.target) * 100)).label !== 'พร้อมใช้').length;
  const packWaiting = PACK_TASKS.filter((p) => !packed.has(p.id)).length;
  const openIncidents = INCIDENTS.filter((i) => i.status === 'OPEN');
  const pendingReturns = RETURNS.filter((r) => (got[r.id] ?? 0) < r.qty).length;
  const sel = INCIDENTS.find((i) => i.id === selId) ?? null;

  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'pack', label: 'แพ็กชุดยา', n: packWaiting, hint: 'เหตุของ รพ.เรา · ดูสต็อกเซ็ตพร้อมใช้ แล้วแพ็กตามแผนที่ ER อนุมัติ' },
    { id: 'incidents', label: 'เหตุการณ์', n: INCIDENTS.length, hint: 'ดูอย่างเดียว · เหตุของเราและเหตุที่ รพ.อื่นขอยืมเรา (ตอบคำขอที่คำขอรอยืนยัน)' },
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
            รพ.สมุทรปราการ · สต็อกเซ็ตพร้อมใช้ เหตุการณ์ และการรับคืนหลังเหตุ · ใช้กับเหตุของ รพ.เราเท่านั้น · คำขอจาก รพ.อื่นให้ตอบที่ “คำขอรอยืนยัน”
          </div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-s" href={whHref('inbox')} style={{ textDecoration: 'none' }}>
            <Icon name="inbox" />
            คำขอรอยืนยัน
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
        <div className={`ib-kpi ${packWaiting ? 'ib-kpi-warn' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">งานแพ็กรอทำ <span className="en">PACK TASKS</span></div>
          <div className="ib-kpi-val num">{packWaiting} งาน</div>
          <div className="ib-kpi-sub">จากแผนที่ ER อนุมัติ · เหตุ INC-2026-0007</div>
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

        {tab === 'pack' && (
          <PackTab
            kits={kits}
            done={packed}
            onConfirm={(id) => {
              const t = PACK_TASKS.find((x) => x.id === id)!;
              setPacked((s) => new Set(s).add(id));
              setKits((l) => l.map((k) => (k.key === t.kitKey ? { ...k, ready: Math.min(k.target, k.ready + t.qty) } : k)));
            }}
          />
        )}
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
