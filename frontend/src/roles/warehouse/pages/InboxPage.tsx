import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useTick } from '../../../lib/time';
import { InboxDrawer } from '../components/InboxDrawer';
import type { InboxSelection } from '../components/InboxDrawer';
import { InboundTable, OutboundTable, PackTable } from '../components/InboxTables';
import { INBOUND, OUTBOUND, PACKS, URGENT_SECONDS } from '../data/inbox';
import type { InboxFeature, InboxStatus, OutboundItem, PackTask } from '../data/inbox';
import { whHref } from '../data/routes';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';

type Tab = 'out' | 'in' | 'pack';

function mmss(s: number): string {
  const v = Math.max(0, s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(v / 60))}:${p(v % 60)}`;
}

/**
 * Work inbox: everything the warehouse must prepare (or expect) from every feature — F1 borrow,
 * F2 near-expiry allocation, F3 emergency. Confirming + marking ready turns an outbound item into
 * a transport task (shown on Transport tracking). UI only: state is local mock.
 */
export function InboxPage() {
  const tick = useTick();
  const urgentLeft = mmss(URGENT_SECONDS - tick);
  const [tab, setTab] = useState<Tab>('out');
  const [out, setOut] = useState<OutboundItem[]>(OUTBOUND);
  const [packs, setPacks] = useState<PackTask[]>(PACKS);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [selId, setSelId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [feature, setFeature] = useState<'all' | InboxFeature>('all');
  const [status, setStatus] = useState<'all' | InboxStatus>('all');
  const [created, setCreated] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = [...out, ...packs];
  const count = (s: InboxStatus) => all.filter((x) => x.status === s).length;
  const urgentOpen = out.filter((o) => o.urgent && o.status === 'NEW').length;
  const newByFeature = (f: InboxFeature) =>
    out.filter((o) => o.feature === f && o.status === 'NEW').length + (f === 'F3' ? packs.filter((p) => p.status === 'NEW').length : 0);

  const needle = q.trim().toLowerCase();
  const hit = (...t: string[]) => !needle || t.some((x) => x.toLowerCase().includes(needle));
  const outRows = out.filter((o) => (feature === 'all' || o.feature === feature) && (status === 'all' || o.status === status) && hit(o.id, o.ref, o.drug));
  const packRows = packs.filter((p) => (feature === 'all' || feature === 'F3') && (status === 'all' || p.status === status) && hit(p.id, p.kit, p.kitEn, p.incident));
  const inRows = INBOUND.filter((i) => (feature === 'all' || i.feature === feature) && hit(i.id, i.ref, i.drug));

  const sel: InboxSelection | null = (() => {
    const o = out.find((x) => x.id === selId);
    if (o) return { kind: 'out', item: o };
    const p = packs.find((x) => x.id === selId);
    return p ? { kind: 'pack', item: p } : null;
  })();

  const patch = (id: string, change: Partial<OutboundItem & PackTask>) => {
    setOut((l) => l.map((x) => (x.id === id ? { ...x, ...change } : x)));
    setPacks((l) => l.map((x) => (x.id === id ? { ...x, ...change } : x)));
  };

  const tabs: { id: Tab; label: string; n: number; hint: string }[] = [
    { id: 'out', label: 'ต้องเตรียมส่งออก', n: out.length, hint: 'F1 · F2 · F3 ที่อนุมัติ/ตอบรับแล้ว · ยืนยันและเตรียมเสร็จแล้วจะไปอยู่ที่ติดตามการขนส่ง' },
    { id: 'in', label: 'ของที่กำลังจะเข้า', n: INBOUND.length, hint: 'รับรู้ล่วงหน้า · ไปยืนยันรับที่ติดตามการขนส่งเมื่อของถึง' },
    { id: 'pack', label: 'เตรียมชุดยา F3', n: packs.length, hint: 'งานแพ็กเซ็ตจากแผนที่ ER อนุมัติ' },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={whHref('dashboard')} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">กล่องงานเข้า</span>
          </nav>
          <h1 className="tr-title">
            กล่องงานเข้า <span>/ Work inbox · ทุก feature</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            รพ.สมุทรปราการ · งานที่คลังต้องเตรียมหรือรับ จาก F1 ยืม, F2 โอนยาใกล้หมดอายุ, F3 ฉุกเฉิน · ยืนยันแล้วจึงขึ้นหน้าติดตามการขนส่ง
          </div>
        </div>
        <div className="pagehead-actions">
          <a className="btn btn-s" href={whHref('transport')} style={{ textDecoration: 'none' }}>
            <Icon name="truck" />
            ติดตามการขนส่ง
          </a>
        </div>
      </section>

      <section className="ib-kpis" aria-label="สรุปกล่องงานเข้า">
        <div className="ib-kpi ib-kpi-warn">
          <div className="ib-kpi-label">รอยืนยันเตรียม <span className="en">NEW</span></div>
          <div className="ib-kpi-val num">{count('NEW')} งาน</div>
          <div className="ib-kpi-sub num">F1 {newByFeature('F1')} · F2 {newByFeature('F2')} · F3 {newByFeature('F3')}</div>
        </div>
        <div className="ib-kpi">
          <div className="ib-kpi-label">กำลังเตรียม <span className="en">PREPARING</span></div>
          <div className="ib-kpi-val num">{count('PREPARING')} งาน</div>
          <div className="ib-kpi-sub">หยิบและเตรียมของอยู่</div>
        </div>
        <div className="ib-kpi ib-kpi-ok">
          <div className="ib-kpi-label">เตรียมเสร็จ <span className="en">READY → TRANSPORT</span></div>
          <div className="ib-kpi-val num">{count('READY')} งาน</div>
          <div className="ib-kpi-sub">สร้างงานขนส่งแล้ว รอขึ้นรถ</div>
        </div>
        <div className={`ib-kpi ${urgentOpen ? 'ib-kpi-crit' : ''}`}>
          <div className="ib-kpi-label">เร่งด่วน F3 <span className="en">URGENT</span></div>
          <div className="ib-kpi-val num" style={{ color: urgentOpen ? '#B91C1C' : undefined }}>{urgentOpen} งาน</div>
          <div className="ib-kpi-sub">
            {urgentOpen ? (
              <>
                เหลือ <span className="ib-timer" style={{ color: '#B91C1C' }}>{urgentLeft}</span> · ฝั่งผู้ให้
              </>
            ) : (
              'ไม่มีคำขอเร่งด่วนค้าง'
            )}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id ? 'true' : 'false'} className={`tab ${tab === t.id ? 'tab-on' : ''}`} onClick={() => setTab(t.id)}>
                {t.label} <span className="cnt">{t.n}</span>
              </button>
            ))}
            <span className="sub" style={{ marginLeft: 6 }}>{active.hint}</span>
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
          {tab !== 'in' && (
            <select className={`sel ${status !== 'all' ? 'sel-on' : ''}`} aria-label="สถานะ" value={status} onChange={(e) => setStatus(e.target.value as 'all' | InboxStatus)}>
              <option value="all">สถานะ: ทั้งหมด</option>
              <option value="NEW">รอยืนยันเตรียม</option>
              <option value="PREPARING">กำลังเตรียม</option>
              <option value="READY">เตรียมเสร็จ</option>
              <option value="DECLINED">เตรียมไม่ได้</option>
            </select>
          )}
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: เร่งด่วนก่อน → ใหม่ล่าสุด</span>
        </div>

        {tab === 'out' && <OutboundTable rows={outRows} activeId={selId} urgentLeft={urgentLeft} onOpen={setSelId} />}
        {tab === 'pack' && <PackTable rows={packRows} activeId={selId} onOpen={setSelId} />}
        {tab === 'in' && <InboundTable rows={inRows} />}
        <div className="tbl-foot">
          <span>
            แสดง <span className="num">{tab === 'out' ? outRows.length : tab === 'pack' ? packRows.length : inRows.length}</span> งาน
          </span>
          <span>เห็นเฉพาะงานของ รพ.สมุทรปราการ · ถ้าเตรียมไม่ได้ ส่งกลับให้เภสัชกรตัดสินใจ</span>
        </div>
      </section>

      {sel && tab !== 'in' && (
        <InboxDrawer
          key={sel.item.id}
          sel={sel}
          urgentLeft={urgentLeft}
          picked={picked}
          onTogglePick={(id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onClose={() => setSelId(null)}
          onConfirm={() => patch(sel.item.id, { status: 'PREPARING' })}
          onDecline={(reason) => patch(sel.item.id, { status: 'DECLINED', declineReason: reason })}
          onReady={() => {
            if (sel.kind === 'out') {
              const n = created + 1;
              setCreated(n);
              patch(sel.item.id, { status: 'READY', transportId: `TR-2026-0003${41 + n}` });
            } else {
              patch(sel.item.id, { status: 'READY' });
            }
          }}
        />
      )}
    </>
  );
}
