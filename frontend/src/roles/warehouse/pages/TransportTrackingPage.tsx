import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { AuditHistoryDrawer } from '../components/AuditHistoryDrawer';
import { DirectionTabs } from '../components/DirectionTabs';
import type { Direction, DirectionOption } from '../components/DirectionTabs';
import type { ProxyEntry } from '../components/ProxyStatusPanel';
import { ShipmentDrawer } from '../components/ShipmentDrawer';
import type { CancelDecision, ReceiptState } from '../components/ShipmentDrawer';
import { ShipmentTable } from '../components/ShipmentTable';
import type { ShipmentRowState } from '../components/ShipmentTable';
import { StatusTiles } from '../components/StatusTiles';
import { SyncBar } from '../components/SyncBar';
import { DRIVERS, isOutbound, SHIPMENTS, TILE_ORDER } from '../data/transport';
import type { Shipment, ShipmentKind, TransportStatus } from '../data/transport';
import '../transport.css';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export type TransportRole = 'WAREHOUSE_OFFICER' | 'PHARMACIST';

/**
 * UI-14 Transport tracking. UI only — data is mock, actions are local state.
 * WAREHOUSE_OFFICER operates (status, photos, receipt); PHARMACIST is read-only
 * (API-F2a-012 lets the pharmacist list tasks, POST status/photos is warehouse/driver only).
 * Both see only their own hospital's tasks (SEC-002).
 */
export function TransportTrackingPage({ role = 'WAREHOUSE_OFFICER' }: { role?: TransportRole }) {
  const canOperate = role === 'WAREHOUSE_OFFICER';
  const canCancel = role === 'PHARMACIST';
  const online = useOnline();
  const [dir, setDir] = useState<Direction>('out');
  const [status, setStatus] = useState<TransportStatus | null>(null);
  // Nothing is selected on entry; the detail drawer opens only when a row is picked.
  const [selId, setSelId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [synced, setSynced] = useState(false);
  const [receipt, setReceipt] = useState<Record<string, ReceiptState>>({});
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [cancel, setCancel] = useState<Record<string, CancelDecision>>({});
  const [proxy, setProxy] = useState<Record<string, ProxyEntry[]>>({});
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | ShipmentKind>('all');
  const [driver, setDriver] = useState('all');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (histOpen) setHistOpen(false);
      else setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [histOpen]);

  const effective = (s: Shipment): ShipmentRowState => {
    let st = s.status;
    const px = proxy[s.id];
    if (px?.length) st = px[px.length - 1].to;
    if (receipt[s.id] === 'done') st = 'RECEIVED';
    if (cancel[s.id] === 'yes') st = 'CANCELLED';
    return { shipment: s, status: st, pending: canOperate && !!s.pending && !synced, cancelRequested: !!s.cancelRequest && st === 'WAITING_DISPATCH' && cancel[s.id] !== 'no' };
  };

  const all = useMemo(() => SHIPMENTS.map(effective), [receipt, cancel, synced, proxy]); // eslint-disable-line react-hooks/exhaustive-deps
  const queued = all.filter((r) => r.pending).length;

  const byDir = all.filter((r) => (dir === 'out' ? isOutbound(r.shipment) : !isOutbound(r.shipment)));
  const counts = Object.fromEntries(TILE_ORDER.map((c) => [c, byDir.filter((r) => r.status === c).length])) as Record<TransportStatus, number>;

  const needle = q.trim().toLowerCase();
  const rows = byDir
    .filter((r) => !status || r.status === status)
    .filter((r) => kind === 'all' || r.shipment.kind === kind)
    .filter((r) => driver === 'all' || r.shipment.driver === driver)
    .filter((r) => !needle || [r.shipment.id, r.shipment.ref, r.shipment.drug].some((t) => t.toLowerCase().includes(needle)));

  const outAll = all.filter((r) => isOutbound(r.shipment));
  const inAll = all.filter((r) => !isOutbound(r.shipment));
  const waiting = outAll.filter((r) => r.status === 'WAITING_DISPATCH').length;
  const toReceive = inAll.filter((r) => r.status === 'ARRIVED').length;
  const options: DirectionOption[] = [
    {
      id: 'out',
      label: 'ส่งออกจากเรา',
      count: outAll.length,
      todo: canOperate && waiting ? `รอขึ้นรถ ${waiting}` : '',
      hint: canOperate ? 'เฉพาะงานที่เตรียมเสร็จแล้วจากกล่องงานเข้า · ขึ้นรถ + ถ่ายรูปที่นี่' : 'งานที่ รพ.เราส่งไปให้ รพ.อื่น',
    },
    {
      id: 'in',
      label: 'รับเข้าเรา',
      count: inAll.length,
      todo: canOperate && toReceive ? `รอรับ ${toReceive}` : '',
      hint: canOperate ? 'ของที่ รพ.อื่นส่งมาให้เรา · ยืนยันรับเมื่อของถึง' : 'ของที่ รพ.อื่นส่งมาให้ รพ.เรา',
    },
  ];

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };
  const onAction = (r: ShipmentRowState) => {
    if (r.status === 'ARRIVED' && !isOutbound(r.shipment) && receipt[r.shipment.id] !== 'done') setReceipt((m) => ({ ...m, [r.shipment.id]: 'open' }));
    if (r.status === 'LOADED' && r.pending) setSynced(true);
    open(r.shipment.id);
  };

  const sel = selId ? all.find((r) => r.shipment.id === selId) : undefined;
  const countedFor = (s: Shipment) => counted[s.id] ?? String(s.qty);

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href="/" className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">ติดตามการขนส่ง</span>
          </nav>
          <h1 className="tr-title">
            ติดตามการขนส่ง <span>/ Transport tracking · UI-14</span>
          </h1>
          <div style={{ fontSize: 13 }}>รพ.สมุทรปราการ · สต็อกต้นทางตัดเมื่อขึ้นรถ (LOADED) ปลายทางรับเข้าเมื่อยืนยันรับ (RECEIVED) · ขั้นตอนขนส่งไม่มี Agent</div>
          {canOperate && (
            <div style={{ fontSize: 12.5, marginTop: 2 }}>
              งานส่งออกจะปรากฏที่นี่หลังกด “เตรียมเสร็จ” ในกล่องงานเข้า{' '}
              <a className="link" href="?role=warehouse&page=inbox" style={{ fontSize: 12.5 }}>ไปที่กล่องงานเข้า</a>
            </div>
          )}
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s" onClick={() => setHistOpen(true)}>
            <Icon name="history" />
            ประวัติ
          </button>
          <button className="btn btn-s">
            <Icon name="printer" />
            พิมพ์เอกสาร <span style={{ fontWeight: 400 }}>UI-15</span>
          </button>
        </div>
      </section>

      {canOperate ? (
        <SyncBar online={online} queued={queued} onSync={() => setSynced(true)} />
      ) : (
        <section role="status" className="syncbar" style={{ background: '#EFF6FF', borderColor: '#DBEAFE' }}>
          <span className="syncbar-icon" style={{ color: '#1D4ED8' }}>
            <Icon name="eye" />
          </span>
          <span className="syncbar-text">
            <b>ดูอย่างเดียว</b> · ติดตามงานขนส่งของ รพ.เราเท่านั้น การขึ้นรถ ถ่ายรูป และยืนยันรับของทำโดยเจ้าหน้าที่คลังและคนขับ
          </span>
        </section>
      )}

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <DirectionTabs
            options={options}
            value={dir}
            onChange={(d) => {
              setDir(d);
              setStatus(null);
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 className="sec-h">
              สถานะงานขนส่ง <span className="en">SM-6 · 7 วันล่าสุด</span>
            </h2>
            {status && (
              <button className="link" onClick={() => setStatus(null)}>
                ล้างตัวกรองสถานะ
              </button>
            )}
          </div>
          <StatusTiles counts={counts} active={status} onPick={setStatus} />
        </div>
        <div className="tr-filters">
          <label className="tr-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขงาน TR- / เลขคำขอ / ชื่อยา" aria-label="ค้นหางานขนส่ง" />
          </label>
          <select className={`sel ${kind !== 'all' ? 'sel-on' : ''}`} aria-label="ประเภทงาน" value={kind} onChange={(e) => setKind(e.target.value as 'all' | ShipmentKind)}>
            <option value="all">ประเภท: ทั้งหมด</option>
            <option value="F1">ยืม (BORROW_LEG)</option>
            <option value="F2">โอนยาใกล้หมดอายุ (ALLOCATION_LINE)</option>
          </select>
          <select className={`sel ${driver !== 'all' ? 'sel-on' : ''}`} aria-label="คนขับ" value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="all">คนขับ: ทั้งหมด</option>
            {DRIVERS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: ต้องทำก่อน → อัปเดตล่าสุด</span>
        </div>
        <ShipmentTable rows={rows} activeId={drawerOpen && sel ? sel.shipment.id : null} onOpen={open} onAction={onAction} canOperate={canOperate} canCancel={canCancel} />
      </section>

      {drawerOpen && sel && (
        <ShipmentDrawer
          key={sel.shipment.id}
          shipment={sel.shipment}
          status={sel.status}
          pending={sel.pending}
          receipt={receipt[sel.shipment.id]}
          counted={countedFor(sel.shipment)}
          cancel={cancel[sel.shipment.id]}
          onClose={() => setDrawerOpen(false)}
          onSync={() => setSynced(true)}
          onCounted={(v) => setCounted((m) => ({ ...m, [sel.shipment.id]: v }))}
          onOpenReceipt={() => setReceipt((m) => ({ ...m, [sel.shipment.id]: 'open' }))}
          onConfirmReceipt={() => setReceipt((m) => ({ ...m, [sel.shipment.id]: 'done' }))}
          onUndoReceipt={() => setReceipt((m) => ({ ...m, [sel.shipment.id]: 'open' }))}
          onCancelDecision={(d) => setCancel((m) => ({ ...m, [sel.shipment.id]: d }))}
          canOperate={canOperate}
          canCancel={canCancel}
          proxies={proxy[sel.shipment.id] ?? []}
          onProxy={(to, reason) => setProxy((m) => ({ ...m, [sel.shipment.id]: [...(m[sel.shipment.id] ?? []), { to, reason }] }))}
        />
      )}
      {histOpen && <AuditHistoryDrawer onClose={() => setHistOpen(false)} />}
    </>
  );
}
