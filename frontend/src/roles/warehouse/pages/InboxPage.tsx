import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useTick } from '../../../lib/time';
import { InboxDrawer } from '../components/InboxDrawer';
import { RequestsTable } from '../components/RequestsTable';
import { REQUESTS, URGENT_SECONDS } from '../data/inbox';
import type { InboxFeature, RequestItem } from '../data/inbox';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';

type Tab = 'open' | 'answered';

function mmss(s: number): string {
  const v = Math.max(0, s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(v / 60))}:${p(v % 60)}`;
}

/**
 * Requests to confirm — the one place the warehouse answers every request to send goods out
 * (F1 / F2 / F3). Confirm → a transport task starts at "กำลังเตรียมของ"; decline → back to the
 * pharmacist. UI only: state is local mock.
 */
export function InboxPage() {
  const tick = useTick();
  const urgentLeft = mmss(URGENT_SECONDS - tick);
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<RequestItem[]>(REQUESTS);
  const [selId, setSelId] = useState<string | null>(null);
  const [declineFirst, setDeclineFirst] = useState(false);
  const [feature, setFeature] = useState<'all' | InboxFeature>('all');
  const [q, setQ] = useState('');
  const [created, setCreated] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openItems = items.filter((r) => r.status === 'NEW');
  const answered = items.filter((r) => r.status !== 'NEW');
  const urgent = openItems.filter((r) => r.urgent).length;
  const count = (f: InboxFeature) => openItems.filter((r) => r.feature === f).length;

  const needle = q.trim().toLowerCase();
  const rows = (tab === 'open' ? openItems : answered)
    .filter((r) => feature === 'all' || r.feature === feature)
    .filter((r) => !needle || [r.id, r.ref, r.drug].some((t) => t.toLowerCase().includes(needle)))
    .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const sel = items.find((r) => r.id === selId) ?? null;

  const patch = (id: string, change: Partial<RequestItem>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const confirm = (id: string) => {
    const n = created + 1;
    setCreated(n);
    patch(id, { status: 'CONFIRMED', transportId: `TR-2026-0003${44 + n}` });
  };
  const open = (id: string, declining = false) => {
    setDeclineFirst(declining);
    setSelId(id);
  };

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">คำขอรอยืนยัน</span>
          </nav>
          <h1 className="tr-title">
            คำขอรอยืนยัน <span>/ Requests to confirm</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            รพ.สมุทรปราการ · คำขอให้คลังส่งของออก ทั้ง F1 ยืม, F2 โอนยาใกล้หมดอายุ และ F3 ฉุกเฉิน · กดยืนยันที่นี่ที่เดียว แล้วงานไปต่อที่ติดตามการขนส่ง
          </div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
            <Icon name="truck" />
            ติดตามการขนส่ง
          </a>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุปคำขอ">
        <div className="ib-kpi ib-kpi-warn">
          <div className="ib-kpi-label">รอยืนยัน <span className="en">NEW</span></div>
          <div className="ib-kpi-val num">{openItems.length} คำขอ</div>
          <div className="ib-kpi-sub num">F1 {count('F1')} · F2 {count('F2')} · F3 {count('F3')}</div>
        </div>
        <div className={`ib-kpi ${urgent ? 'ib-kpi-crit' : ''}`}>
          <div className="ib-kpi-label">เร่งด่วน F3 <span className="en">URGENT</span></div>
          <div className="ib-kpi-val num" style={{ color: urgent ? '#B91C1C' : undefined }}>{urgent} คำขอ</div>
          <div className="ib-kpi-sub">
            {urgent ? (
              <>เหลือ <span className="ib-timer" style={{ color: '#B91C1C' }}>{urgentLeft}</span> · ฝั่งผู้ให้</>
            ) : (
              'ไม่มีคำขอเร่งด่วนค้าง'
            )}
          </div>
        </div>
        <div className="ib-kpi ib-kpi-ok">
          <div className="ib-kpi-label">ยืนยันแล้ว <span className="en">→ TRANSPORT</span></div>
          <div className="ib-kpi-val num">{items.filter((r) => r.status === 'CONFIRMED').length} คำขอ</div>
          <div className="ib-kpi-sub">ส่งต่อไปติดตามการขนส่งแล้ว</div>
        </div>
        <div className="ib-kpi">
          <div className="ib-kpi-label">ส่งกลับเภสัชกร <span className="en">DECLINED</span></div>
          <div className="ib-kpi-val num">{items.filter((r) => r.status === 'DECLINED').length} คำขอ</div>
          <div className="ib-kpi-sub">เตรียมไม่ได้ · เภสัชกรตัดสินใจต่อ</div>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div role="tablist" aria-label="สถานะคำขอ" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <button type="button" role="tab" aria-selected={tab === 'open' ? 'true' : 'false'} className={`tab ${tab === 'open' ? 'tab-on' : ''}`} onClick={() => setTab('open')}>
              รอยืนยัน <span className="cnt">{openItems.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'answered' ? 'true' : 'false'} className={`tab ${tab === 'answered' ? 'tab-on' : ''}`} onClick={() => setTab('answered')}>
              ตอบแล้ว <span className="cnt">{answered.length}</span>
            </button>
            <span className="sub" style={{ marginLeft: 6 }}>
              {tab === 'open' ? 'กด “ยืนยัน” ในแถวได้เลย · F3 เร่งด่วนอยู่บนสุด' : 'ยืนยันแล้วไปดูต่อที่ติดตามการขนส่ง · ปฏิเสธแล้วส่งกลับเภสัชกร'}
            </span>
          </div>
        </div>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขคำขอ / ชื่อยา" aria-label="ค้นหาคำขอ" />
          </label>
          <select className={`sel ${feature !== 'all' ? 'sel-on' : ''}`} aria-label="Feature" value={feature} onChange={(e) => setFeature(e.target.value as 'all' | InboxFeature)}>
            <option value="all">Feature: ทั้งหมด</option>
            <option value="F1">F1 ยืม</option>
            <option value="F2">F2 โอนใกล้หมดอายุ</option>
            <option value="F3">F3 ฉุกเฉิน</option>
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: เร่งด่วนก่อน</span>
        </div>

        <RequestsTable rows={rows} activeId={selId} urgentLeft={urgentLeft} onOpen={(id) => open(id)} onConfirm={confirm} onDecline={(id) => open(id, true)} />
        <div className="tbl-foot">
          <span>แสดง <span className="num">{rows.length}</span> คำขอ</span>
          <span>เห็นเฉพาะคำขอของ รพ.สมุทรปราการ · ถ้าเตรียมไม่ได้ ส่งกลับให้เภสัชกรตัดสินใจ</span>
        </div>
      </section>

      {sel && (
        <InboxDrawer
          key={`${sel.id}-${declineFirst}`}
          item={sel}
          urgentLeft={urgentLeft}
          startDeclining={declineFirst}
          onClose={() => setSelId(null)}
          onConfirm={() => confirm(sel.id)}
          onDecline={(reason) => patch(sel.id, { status: 'DECLINED', declineReason: reason })}
        />
      )}
    </>
  );
}
