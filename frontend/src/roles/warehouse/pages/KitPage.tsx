import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useTick } from '../../../lib/time';
import { InboxDrawer } from '../components/InboxDrawer';
import { IncidentDrawer, IncidentsTab } from '../components/IncidentsTab';
import { PackTab } from '../components/PackTab';
import { RequestsTable } from '../components/RequestsTable';
import { ReturnsTab } from '../components/ReturnsTab';
import { INCIDENTS, KIT_DEFS, kitLevel, PACK_TASKS, RETURNS } from '../data/f3';
import { REQUESTS, URGENT_SECONDS } from '../data/inbox';
import type { RequestItem } from '../data/inbox';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';
import '../kit.css';

type Tab = 'urgent' | 'pack' | 'incidents' | 'returns';

function mmss(s: number): string {
  const v = Math.max(0, s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(v / 60))}:${p(v % 60)}`;
}

/**
 * F3 for the warehouse officer.
 *  - คำขอเร่งด่วน: the only place WH decides — confirm / decline a request from another hospital
 *    that is in an emergency (WH is the lender). For F1/F2 the pharmacist decides, not WH.
 *  - แพ็กชุดยา / เหตุการณ์ / รับคืน: our own incidents.
 * UI only: mock data, state is local.
 */
export function KitPage() {
  const tick = useTick();
  const urgentLeft = mmss(URGENT_SECONDS - tick);
  const [tab, setTab] = useState<Tab>('urgent');
  const [incId, setIncId] = useState<string | null>(null);
  const [got, setGot] = useState<Record<string, number>>({});
  const [packed, setPacked] = useState<ReadonlySet<string>>(new Set());
  const [kits, setKits] = useState(KIT_DEFS);
  const [reqs, setReqs] = useState<RequestItem[]>(REQUESTS);
  const [reqId, setReqId] = useState<string | null>(null);
  const [declineFirst, setDeclineFirst] = useState(false);
  const [created, setCreated] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIncId(null);
        setReqId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openReqs = reqs.filter((r) => r.status === 'NEW');
  const lowKits = kits.filter((k) => kitLevel(Math.round((k.ready / k.target) * 100)).label !== 'พร้อมใช้').length;
  const packWaiting = PACK_TASKS.filter((p) => !packed.has(p.id)).length;
  const openIncidents = INCIDENTS.filter((i) => i.status === 'OPEN');
  const pendingReturns = RETURNS.filter((r) => (got[r.id] ?? 0) < r.qty).length;
  const selInc = INCIDENTS.find((i) => i.id === incId) ?? null;
  const selReq = reqs.find((r) => r.id === reqId) ?? null;

  const patch = (id: string, change: Partial<RequestItem>) => setReqs((l) => l.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const confirm = (id: string) => {
    const n = created + 1;
    setCreated(n);
    patch(id, { status: 'CONFIRMED', transportId: `TR-2026-0003${45 + n}` });
  };
  const openReq = (id: string, declining = false) => {
    setDeclineFirst(declining);
    setReqId(id);
  };

  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'urgent', label: 'คำขอเร่งด่วนจาก รพ.อื่น', n: openReqs.length, hint: 'รพ.อื่นเกิดเหตุและขอยืมของเรา · WH ยืนยัน/ปฏิเสธ (F1/F2 เภสัชกรเป็นผู้ตัดสิน)' },
    { id: 'pack', label: 'แพ็กชุดยา', n: packWaiting, hint: 'เหตุของ รพ.เรา · แพ็กตามแผนที่ ER อนุมัติ' },
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
            เตรียมชุดยา · เหตุฉุกเฉิน <span>/ Emergency (F3)</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            รพ.สมุทรปราการ · ตอบคำขอเร่งด่วนจาก รพ.อื่น (เราเป็นผู้ให้) · แพ็กชุดยาและดูแลเหตุของ รพ.เรา · เมื่อยืนยันแล้วงานส่งไปต่อที่ติดตามการขนส่ง
          </div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
            <Icon name="truck" />
            ติดตามการขนส่ง
          </a>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุป F3">
        <div className={`ib-kpi ${openReqs.length ? 'ib-kpi-crit' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">คำขอเร่งด่วนรอยืนยัน <span className="en">LENDER</span></div>
          <div className="ib-kpi-val num" style={{ color: openReqs.length ? '#B91C1C' : undefined }}>{openReqs.length} คำขอ</div>
          <div className="ib-kpi-sub">
            {openReqs.length ? (
              <>เหลือ <span className="ib-timer" style={{ color: '#B91C1C' }}>{urgentLeft}</span> · ฝั่งผู้ให้</>
            ) : (
              'ไม่มีคำขอค้าง'
            )}
          </div>
        </div>
        <div className={`ib-kpi ${packWaiting ? 'ib-kpi-warn' : 'ib-kpi-ok'}`}>
          <div className="ib-kpi-label">งานแพ็กรอทำ <span className="en">PACK TASKS</span></div>
          <div className="ib-kpi-val num">{packWaiting} งาน</div>
          <div className="ib-kpi-sub">เซ็ตที่ควรเติม {lowKits} ชนิด</div>
        </div>
        <div className="ib-kpi">
          <div className="ib-kpi-label">เหตุที่เปิดอยู่ <span className="en">OPEN INCIDENTS</span></div>
          <div className="ib-kpi-val num">{openIncidents.length} เหตุ</div>
          <div className="ib-kpi-sub">เหตุของเรา {openIncidents.filter((i) => i.own).length} · รพ.อื่น {openIncidents.filter((i) => !i.own).length}</div>
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
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id ? 'true' : 'false'} className={`tab ${tab === t.id ? 'tab-on' : ''}`} onClick={() => { setTab(t.id); setIncId(null); setReqId(null); }}>
                {t.label} <span className="cnt">{t.n}</span>
              </button>
            ))}
            <span className="sub" style={{ marginLeft: 6 }}>{active.hint}</span>
          </div>
        </div>

        {tab === 'urgent' && (
          <RequestsTable
            rows={[...reqs].sort((a, b) => Number(b.status === 'NEW') - Number(a.status === 'NEW'))}
            activeId={reqId}
            urgentLeft={urgentLeft}
            onOpen={(id) => openReq(id)}
            onConfirm={confirm}
            onDecline={(id) => openReq(id, true)}
          />
        )}
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
        {tab === 'incidents' && <IncidentsTab rows={INCIDENTS} activeId={incId} onOpen={setIncId} />}
        {tab === 'returns' && (
          <ReturnsTab rows={RETURNS} got={got} onConfirm={(id, n) => setGot((m) => ({ ...m, [id]: (m[id] ?? 0) + Math.max(0, n) }))} />
        )}
        <div className="tbl-foot">
          <span>เก็บเฉพาะจำนวนผู้บาดเจ็บแยกระดับ ไม่มีข้อมูลที่ระบุตัวผู้ป่วยได้</span>
          <span>สูตรเซ็ตเป็นค่าตั้งต้น รอเจ้าของด้านคลินิกยืนยัน</span>
        </div>
      </section>

      {tab === 'incidents' && selInc && <IncidentDrawer key={selInc.id} incident={selInc} onClose={() => setIncId(null)} />}
      {tab === 'urgent' && selReq && (
        <InboxDrawer
          key={`${selReq.id}-${declineFirst}`}
          item={selReq}
          urgentLeft={urgentLeft}
          startDeclining={declineFirst}
          onClose={() => setReqId(null)}
          onConfirm={() => confirm(selReq.id)}
          onDecline={(reason) => patch(selReq.id, { status: 'DECLINED', declineReason: reason })}
        />
      )}
    </>
  );
}
