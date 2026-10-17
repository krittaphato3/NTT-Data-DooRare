import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { InboundTable } from '../components/InboundTable';
import { InboxDrawer } from '../components/InboxDrawer';
import { RequestsTable } from '../components/RequestsTable';
import { INBOUND_TASKS, OUTBOUND_TASKS } from '../data/inbox';
import type { InboxFeature, RequestItem } from '../data/inbox';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';

type Tab = 'out' | 'in';

/**
 * Work inbox: everything F1 / F2 / F3 asks of the warehouse in one place.
 *  - ส่งออก: goods we pack for other hospitals. WH confirms "ยืนยันจะแพ็ก", then prepares and loads it on
 *    Transport tracking. (F3 urgent requests from other hospitals are answered on the Emergency page.)
 *  - รับเข้า: goods other hospitals are sending us. Heads-up only; WH confirms receipt when they arrive.
 * UI only: state is local mock.
 */
export function InboxPage() {
  const [tab, setTab] = useState<Tab>('out');
  const [items, setItems] = useState<RequestItem[]>(OUTBOUND_TASKS);
  const [selId, setSelId] = useState<string | null>(null);
  const [declineFirst, setDeclineFirst] = useState(false);
  const [feature, setFeature] = useState<'all' | InboxFeature>('all');
  const [q, setQ] = useState('');
  const [created, setCreated] = useState(0);
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const waiting = items.filter((r) => r.status === 'NEW');
  const needle = q.trim().toLowerCase();
  const hit = (...t: string[]) => !needle || t.some((x) => x.toLowerCase().includes(needle));
  const outRows = [...items]
    .filter((r) => (feature === 'all' || r.feature === feature) && hit(r.id, r.ref, r.drug))
    .sort((a, b) => Number(b.status === 'NEW') - Number(a.status === 'NEW'));
  const inRows = INBOUND_TASKS.filter((i) => (feature === 'all' || i.feature === feature) && hit(i.id, i.ref, i.drug));
  const toReceive = INBOUND_TASKS.filter((i) => i.stage.startsWith('ถึงปลายทาง')).length;
  const toAck = INBOUND_TASKS.filter((i) => i.status === 'NEW' && !acked.has(i.id)).length;
  const sel = items.find((r) => r.id === selId) ?? null;

  const patch = (id: string, change: Partial<RequestItem>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const confirm = (id: string) => {
    const n = created + 1;
    setCreated(n);
    patch(id, { status: 'CONFIRMED', transportId: `TR-2026-0003${45 + n}` });
  };
  const open = (id: string, declining = false) => {
    setDeclineFirst(declining);
    setSelId(id);
  };

  const count = (f: InboxFeature) => waiting.filter((r) => r.feature === f).length;

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">กล่องงานเข้า</span>
          </nav>
          <h1 className="tr-title">
            กล่องงานเข้า <span>/ Work inbox · F1 · F2 · F3</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            รพ.สมุทรปราการ · งานของคลังจากทุก feature: ของที่เราต้องแพ็กส่งให้ รพ.อื่น และของที่ รพ.อื่นกำลังส่งมาให้เรา
          </div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-s" href={whHref('kit')} style={{ textDecoration: 'none' }}>
            <Icon name="siren" />
            Emergency (F3)
          </a>
          <a className="btn btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
            <Icon name="truck" />
            ติดตามการขนส่ง
          </a>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุปกล่องงานเข้า">
        <div className="ib-kpi ib-kpi-warn">
          <div className="ib-kpi-label">รอยืนยันจะแพ็ก <span className="en">TO PACK</span></div>
          <div className="ib-kpi-val num">{waiting.length} งาน</div>
          <div className="ib-kpi-sub num">F1 {count('F1')} · F2 {count('F2')} · F3 {count('F3')}</div>
        </div>
        <div className="ib-kpi ib-kpi-ok">
          <div className="ib-kpi-label">ยืนยันแล้ว <span className="en">→ TRANSPORT</span></div>
          <div className="ib-kpi-val num">{items.filter((r) => r.status === 'CONFIRMED').length} งาน</div>
          <div className="ib-kpi-sub">ส่งต่อไปติดตามการขนส่งแล้ว</div>
        </div>
        <div className="ib-kpi">
          <div className="ib-kpi-label">ของที่จะรับเข้า <span className="en">INCOMING</span></div>
          <div className="ib-kpi-val num">{INBOUND_TASKS.length} รายการ</div>
          <div className="ib-kpi-sub">รอรับทราบ {toAck} · ถึงแล้วรอยืนยันรับ {toReceive}</div>
        </div>
        <div className="ib-kpi">
          <div className="ib-kpi-label">ส่งกลับเภสัชกร <span className="en">DECLINED</span></div>
          <div className="ib-kpi-val num">{items.filter((r) => r.status === 'DECLINED').length} งาน</div>
          <div className="ib-kpi-sub">เตรียมไม่ได้ · เภสัชกรตัดสินใจต่อ</div>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div role="tablist" aria-label="ทิศทาง" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <button type="button" role="tab" aria-selected={tab === 'out' ? 'true' : 'false'} className={`tab ${tab === 'out' ? 'tab-on' : ''}`} onClick={() => setTab('out')}>
              ส่งออก (แพ็กให้ รพ.อื่น) <span className="cnt">{items.length}</span>
              {waiting.length > 0 && <span className="badge t-amber" style={{ fontWeight: 600, height: 20, fontSize: 11 }}>รอยืนยัน {waiting.length}</span>}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'in' ? 'true' : 'false'} className={`tab ${tab === 'in' ? 'tab-on' : ''}`} onClick={() => setTab('in')}>
              รับเข้า (จาก รพ.อื่น) <span className="cnt">{INBOUND_TASKS.length}</span>
              {toAck > 0 && <span className="badge t-blue" style={{ fontWeight: 600, height: 20, fontSize: 11 }}>รอรับทราบ {toAck}</span>}
              {toReceive > 0 && <span className="badge t-green" style={{ fontWeight: 600, height: 20, fontSize: 11 }}>ถึงแล้ว {toReceive}</span>}
            </button>
            <span className="sub" style={{ marginLeft: 6 }}>
              {tab === 'out' ? 'กด “ยืนยันจะแพ็ก” แล้วไปเตรียมของ/ขึ้นรถที่ติดตามการขนส่ง · F3 เร่งด่วนจาก รพ.อื่นตอบที่หน้า Emergency' : 'กด “รับทราบ” แล้วงานจะไปอยู่ที่ติดตามการขนส่ง (รับเข้า) · ยืนยันรับของเมื่อของถึง'}
            </span>
          </div>
        </div>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขงาน / เลขคำขอ / ชื่อยา" aria-label="ค้นหางานเข้า" />
          </label>
          <select className={`sel ${feature !== 'all' ? 'sel-on' : ''}`} aria-label="Feature" value={feature} onChange={(e) => setFeature(e.target.value as 'all' | InboxFeature)}>
            <option value="all">Feature: ทั้งหมด</option>
            <option value="F1">F1 ยืม</option>
            <option value="F2">F2 โอนใกล้หมดอายุ</option>
            <option value="F3">F3 ฉุกเฉิน</option>
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: รอยืนยันก่อน</span>
        </div>

        {tab === 'out' ? (
          <RequestsTable
            rows={outRows}
            activeId={selId}
            urgentLeft="—"
            confirmLabel="ยืนยันจะแพ็ก"
            caption="งานส่งออก"
            onOpen={(id) => open(id)}
            onConfirm={confirm}
            onDecline={(id) => open(id, true)}
          />
        ) : (
          <InboundTable rows={inRows} acked={acked} onAck={(id) => setAcked((s) => new Set(s).add(id))} />
        )}
        <div className="tbl-foot">
          <span>แสดง <span className="num">{tab === 'out' ? outRows.length : inRows.length}</span> รายการ</span>
          <span>เห็นเฉพาะงานของ รพ.สมุทรปราการ · ถ้าเตรียมไม่ได้ ส่งกลับให้เภสัชกรตัดสินใจ</span>
        </div>
      </section>

      {sel && tab === 'out' && (
        <InboxDrawer
          key={`${sel.id}-${declineFirst}`}
          item={sel}
          urgentLeft="—"
          startDeclining={declineFirst}
          kicker="กล่องงานเข้า · ยืนยันแล้วงานไปที่ติดตามการขนส่ง"
          confirmLabel="ยืนยันจะแพ็ก"
          onClose={() => setSelId(null)}
          onConfirm={() => confirm(sel.id)}
          onDecline={(reason) => patch(sel.id, { status: 'DECLINED', declineReason: reason })}
        />
      )}
    </>
  );
}
