import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Icon } from '../../../components/common/icons';
import { InboundTable } from '../components/InboundTable';
import { InboxDrawer } from '../components/InboxDrawer';
import { RequestsTable } from '../components/RequestsTable';
import { INBOUND_TASKS, OUTBOUND_TASKS } from '../data/inbox';
import type { InboxFeature, InboundTask, RequestItem } from '../data/inbox';
import { whHref } from '../data/routes';
import { useTransport } from '../data/useTransport';
import { HOSPITALS } from '../data/transport';
import { mockFallbackEnabled } from '../../../services/dataSource';
import '../transport.css';
import '../dashboard.css';
import '../inbox.css';

type Tab = 'out' | 'in';

/**
 * Work inbox: everything F1 / F2 / F3 asks of the warehouse in one place.
 *  - ส่งออก: goods we pack for other hospitals. WH confirms "ยืนยันจะแพ็ก", then prepares and loads it on
 *    Transport tracking. (Tasks that are completed / received or cancelled disappear automatically).
 *  - รับเข้า: goods other hospitals are sending us, linked to Transport tracking (รับเข้าเรา).
 */
export function InboxPage() {
  const { user } = useAuth();
  const tr = useTransport();
  const isLive = tr.source === 'live';

  const [tab, setTab] = useState<Tab>('out');
  const [selId, setSelId] = useState<string | null>(null);
  const [declineFirst, setDeclineFirst] = useState(false);
  const [feature, setFeature] = useState<'all' | InboxFeature>('all');
  const [q, setQ] = useState('');

  // Acknowledged packs saved in localStorage per hospital
  const storageKey = `doorare_wh_packed_${user?.hospitalId || 'default'}`;
  const declineKey = `doorare_wh_declined_${user?.hospitalId || 'default'}`;

  const [packedIds, setPackedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [declinedMap, setDeclinedMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(declineKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isDemo = mockFallbackEnabled();

  // Outbound items: from live transport tasks (excluding completed RECEIVED and CANCELLED)
  const items: RequestItem[] = useMemo(() => {
    if (!isLive) return isDemo ? OUTBOUND_TASKS : [];

    return tr.shipments
      .filter((s) => s.outbound && s.status !== 'RECEIVED' && s.status !== 'CANCELLED')
      .map((s) => {
        const isDeclined = Boolean(declinedMap[s.id]);
        const isConfirmed =
          !isDeclined &&
          (packedIds.has(s.id) ||
            s.status === 'LOADED' ||
            s.status === 'IN_TRANSIT' ||
            s.status === 'ARRIVED');

        return {
          id: s.id,
          feature: (s.kind as InboxFeature) || 'F1',
          ref: s.ref || s.id,
          drug: s.drug,
          qty: s.qty,
          unit: s.unit || 'ชิ้น',
          to: s.to,
          requestedBy: HOSPITALS[s.to] ? `รพ.${HOSPITALS[s.to]}` : s.to,
          due: s.kind === 'F1' ? 'ส่งภายใน 2 ชม.' : 'ส่งภายในวันนี้',
          urgent: s.ref.includes('INC') || s.ref.includes('EMERGENCY'),
          status: isDeclined ? 'DECLINED' : isConfirmed ? 'CONFIRMED' : 'NEW',
          declineReason: declinedMap[s.id],
          pick: s.pick ?? (s.lotCode ? [{ lot: s.lotCode, expiry: s.expiry || '–', daysLeft: 180, qty: s.qty }] : []),
          note: s.kind === 'F1' ? 'F1 ยืม · ล็อตที่ให้ยืมต้องอายุ > 180 วัน (FEFO)' : 'F2 โอนยาใกล้หมดอายุ',
          transportId: s.id,
        };
      });
  }, [isLive, tr.shipments, packedIds, declinedMap]);

  // Inbound items: from live transport tasks
  const inTasks: InboundTask[] = useMemo(() => {
    if (!isLive) return isDemo ? INBOUND_TASKS : [];

    return tr.shipments
      .filter((s) => !s.outbound && s.status !== 'RECEIVED' && s.status !== 'CANCELLED')
      .map((s) => {
        let stage = 'รพ.ต้นทางกำลังเตรียมของ';
        if (s.status === 'LOADED') stage = 'ของขึ้นรถแล้ว · รอออกเดินทาง';
        else if (s.status === 'IN_TRANSIT') stage = 'อยู่ระหว่างเดินทาง';
        else if (s.status === 'ARRIVED') stage = 'ถึงปลายทางแล้ว · รอยืนยันรับ';

        return {
          id: s.id,
          feature: (s.kind as InboxFeature) || 'F1',
          ref: s.ref || s.id,
          drug: s.drug,
          qty: s.qty,
          unit: s.unit || 'ชิ้น',
          from: s.from,
          status: acked.has(s.id) || s.status !== 'WAITING_DISPATCH' ? 'ACKED' : 'NEW',
          stage,
          eta: s.status === 'ARRIVED' ? 'ถึงแล้ว' : 'ตามรอบรถ',
          transportId: s.id,
        };
      });
  }, [isLive, tr.shipments, acked]);

  const confirm = (id: string) => {
    setPackedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const decline = (id: string, reason: string) => {
    setDeclinedMap((prev) => {
      const next = { ...prev, [id]: reason };
      try {
        localStorage.setItem(declineKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const waiting = items.filter((r) => r.status === 'NEW');
  const needle = q.trim().toLowerCase();
  const hit = (...t: string[]) => !needle || t.some((x) => x.toLowerCase().includes(needle));

  const outRows = items
    .filter((r) => (feature === 'all' || r.feature === feature) && hit(r.id, r.ref, r.drug))
    .sort((a, b) => Number(b.status === 'NEW') - Number(a.status === 'NEW'));

  const inRows = inTasks.filter((i) => (feature === 'all' || i.feature === feature) && hit(i.id, i.ref, i.drug));
  const toReceive = inTasks.filter((i) => i.stage.startsWith('ถึงปลายทาง')).length;
  const toAck = inTasks.filter((i) => i.status === 'NEW' && !acked.has(i.id)).length;

  const sel = items.find((r) => r.id === selId) ?? null;

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
            {user?.hospitalName ?? 'รพ.สมุทรปราการ'} · งานของคลัง: ของที่เราต้องแพ็กส่งให้ รพ.อื่น และของที่ รพ.อื่นกำลังส่งมาให้เรา
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
        <div className={`ib-kpi ${waiting.length ? 'ib-kpi-warn' : 'ib-kpi-ok'}`}>
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
          <div className="ib-kpi-val num">{inRows.length} รายการ</div>
          <div className="ib-kpi-sub">รอรับทราบ {toAck} · ถึงแล้วรอยืนยันรับ {toReceive}</div>
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
              รับเข้า (จาก รพ.อื่น) <span className="cnt">{inRows.length}</span>
              {toAck > 0 && <span className="badge t-blue" style={{ fontWeight: 600, height: 20, fontSize: 11 }}>รอรับทราบ {toAck}</span>}
              {toReceive > 0 && <span className="badge t-green" style={{ fontWeight: 600, height: 20, fontSize: 11 }}>ถึงแล้ว {toReceive}</span>}
            </button>
            <span className="sub" style={{ marginLeft: 6 }}>
              {tab === 'out' ? 'กด “ยืนยันจะแพ็ก” แล้วไปเตรียมของ/ขึ้นรถที่ติดตามการขนส่ง · เมื่อส่งของเสร็จแล้วงานจะปิดและหายไป' : 'ของที่กำลังส่งมาให้เรา · คลิกเพื่อไปยืนยันรับของที่หน้าติดตามการขนส่ง (รับเข้า)'}
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
            hideDecline={true}
            onOpen={(id) => open(id)}
            onConfirm={confirm}
          />
        ) : (
          <InboundTable rows={inRows} acked={acked} onAck={(id) => setAcked((s) => new Set(s).add(id))} />
        )}
        <div className="tbl-foot">
          <span>แสดง <span className="num">{tab === 'out' ? outRows.length : inRows.length}</span> รายการ</span>
          <span>เห็นเฉพาะงานของ {user?.hospitalName ?? 'รพ.เรา'} · เมื่อส่งมอบและรับเสร็จสิ้น งานจะออกจากกล่องงานเข้า</span>
        </div>
      </section>

      {sel && tab === 'out' && (
        <InboxDrawer
          key={`${sel.id}-${declineFirst}`}
          item={sel}
          urgentLeft="—"
          startDeclining={declineFirst}
          kicker="กล่องงานเข้า · ยืนยันแล้วไปขึ้นรถที่ติดตามการขนส่ง"
          confirmLabel="ยืนยันจะแพ็ก"
          hideDecline={true}
          onClose={() => setSelId(null)}
          onConfirm={() => confirm(sel.id)}
          onDecline={(reason) => decline(sel.id, reason)}
        />
      )}
    </>
  );
}
