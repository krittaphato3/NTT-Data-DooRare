import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useTick } from '../../../lib/time';
import { BorrowDrawer } from '../components/BorrowDrawer';
import type { Decision } from '../components/BorrowDrawer';
import { BorrowStatusTiles } from '../components/BorrowStatusTiles';
import { BorrowTable } from '../components/BorrowTable';
import { BORROW_REQUESTS, GROUPS, groupOf, LENDER_QUEUE } from '../data/borrow';
import type { BorrowContext, BorrowRequest, StatusGroup, Urgency } from '../data/borrow';
import '../borrow.css';

/** Apply the pharmacist's local approve/reject decision to a pending request. */
function withDecision(r: BorrowRequest, d: Decision): BorrowRequest {
  if (!d) return r;
  return d === 'approve'
    ? { ...r, status: 'IN_PROGRESS', action: 'detail', note: 'อนุมัติแล้ว 19:12 · ส่งรอบแรกแล้ว', banner: { title: 'อนุมัติแล้ว · ส่งรอบแรกแล้ว', text: `ส่งคำขอถึงผู้ให้ยืมตามลำดับ (${r.sendMode}) 19:12 · รอตอบกลับ` }, approvedBy: 'ภก.ณัฐวุฒิ ศรีสุข (PHARMACIST)' }
    : { ...r, status: 'CANCELLED', action: 'detail', note: 'ไม่อนุมัติ 19:12', banner: { title: 'ยกเลิก · ไม่อนุมัติ', text: 'ภก.ณัฐวุฒิ ศรีสุข ไม่อนุมัติ 19:12' } };
}

/**
 * UI-05 Borrow requests — our hospital as the borrower. UI only: data is mock,
 * approve/reject are local state. Every request needs pharmacist approval before
 * it is sent; an unanswered leg times out and moves to the next lender (SM-1).
 */
export function BorrowRequestsPage() {
  const tick = useTick();
  const [group, setGroup] = useState<StatusGroup | null>(null);
  const [selId, setSelId] = useState('');
  // Detail drawer stays closed until a request is opened from the table.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState<Record<string, Decision>>({});
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState<'all' | Urgency>('all');
  const [context, setContext] = useState<'all' | BorrowContext>('all');
  const [days, setDays] = useState(90);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = useMemo(() => BORROW_REQUESTS.map((r) => withDecision(r, decision[r.id])), [decision]);
  const inPeriod = all.filter((r) => r.daysAgo <= days);
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, inPeriod.filter((r) => groupOf(r.status) === g.id).length])) as Record<StatusGroup, number>;
  const pendingAll = all.filter((r) => groupOf(r.status) === 'pending').length;

  const needle = q.trim().toLowerCase();
  const rows = inPeriod
    .filter((r) => !group || groupOf(r.status) === group)
    .filter((r) => urgency === 'all' || r.urgency === urgency)
    .filter((r) => context === 'all' || r.context === context)
    .filter((r) => !needle || [r.id, r.drug, ...r.lender, ...r.legs.map((l) => l.hospital)].some((t) => t.toLowerCase().includes(needle)));

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };
  const sel = all.find((r) => r.id === selId) ?? all[0];

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href="/" className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">คำขอยืมของเรา</span>
          </nav>
          <h1 className="tr-title">
            คำขอยืมระหว่างโรงพยาบาล <span>/ Borrow requests</span>
          </h1>
          <div style={{ fontSize: 13 }}>รพ.สมุทรปราการ · ข้อมูล ณ 19:11 น. · ทุกคำขอต้องให้เภสัชกรอนุมัติก่อนส่ง · ไม่ตอบในเวลา = ส่งต่อผู้ให้ยืมถัดไปอัตโนมัติ</div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s">
            <Icon name="history" />
            ประวัติ
          </button>
          <button className="btn btn-p">
            <Icon name="plus" />
            สร้างคำขอยืมเอง <span style={{ fontWeight: 400 }}>UI-10</span>
          </button>
        </div>
      </section>

      {/* UI-06 (lender queue) is not built yet, so its tab is inert for now. */}
      <section aria-label="มุมมองคำขอยืม" className="dirs">
        <button className="dir dir-on" aria-pressed="true">
          <span className="dir-icon" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
            <Icon name="inArrow" className="ic20" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="dir-th">คำขอของเรา</span>
            <span className="dir-en">เราเป็นผู้ยืม · UI-05</span>
          </span>
          <span className="num dir-count">{all.length}</span>
          {pendingAll > 0 && (
            <span className="badge t-amber" style={{ fontWeight: 600 }}>
              รออนุมัติ {pendingAll}
            </span>
          )}
        </button>
        <button className="dir" aria-pressed="false" title="UI-06 คิวตอบคำขอ (ยังไม่เปิดในเวอร์ชันนี้)">
          <span className="dir-icon" style={{ background: '#FFF7ED', color: '#9A3412' }}>
            <Icon name="hand" className="ic20" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="dir-th">คิวตอบคำขอ</span>
            <span className="dir-en">เราเป็นผู้ให้ยืม · UI-06</span>
          </span>
          <span className="num dir-count">{LENDER_QUEUE.total}</span>
          <span className="badge t-amber" style={{ fontWeight: 600 }}>
            รอเราตอบ {LENDER_QUEUE.toAnswer}
          </span>
        </button>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 className="sec-h">
              สถานะคำขอ <span className="en">SM-1</span>
            </h2>
            {group && (
              <button className="link" onClick={() => setGroup(null)}>
                ล้างตัวกรองสถานะ
              </button>
            )}
          </div>
          <BorrowStatusTiles counts={counts} active={group} onPick={setGroup} />
        </div>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขคำขอ BR- / ชื่อยา / โรงพยาบาล" aria-label="ค้นหาคำขอยืม" />
          </label>
          <select className={`sel ${urgency !== 'all' ? 'sel-on' : ''}`} aria-label="ความเร่งด่วน" value={urgency} onChange={(e) => setUrgency(e.target.value as 'all' | Urgency)}>
            <option value="all">ความเร่งด่วน: ทั้งหมด</option>
            <option value="CRITICAL">เร่งด่วนมาก</option>
            <option value="URGENT">เร่งด่วน</option>
            <option value="NORMAL">ปกติ</option>
          </select>
          <select className={`sel ${context !== 'all' ? 'sel-on' : ''}`} aria-label="บริบท" value={context} onChange={(e) => setContext(e.target.value as 'all' | BorrowContext)}>
            <option value="all">บริบท: ทั้งหมด</option>
            <option value="STOCK_ALERT">STOCK_ALERT · แจ้งเตือนสต็อก</option>
            <option value="EMERGENCY">EMERGENCY · เหตุฉุกเฉิน</option>
            <option value="MANUAL">MANUAL · สร้างเอง</option>
          </select>
          <select className={`sel ${days !== 90 ? 'sel-on' : ''}`} aria-label="ช่วงเวลา" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={90}>90 วันล่าสุด</option>
            <option value={30}>30 วันล่าสุด</option>
            <option value={7}>7 วันล่าสุด</option>
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: ต้องตัดสินใจก่อน → เวลาที่เหลือ</span>
        </div>
        <BorrowTable rows={rows} activeId={drawerOpen ? sel.id : null} tick={tick} onOpen={open} />
      </section>

      {drawerOpen && (
        <BorrowDrawer
          key={sel.id}
          request={sel}
          tick={tick}
          decision={decision[sel.id]}
          onDecide={(d) => setDecision((m) => ({ ...m, [sel.id]: d }))}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
