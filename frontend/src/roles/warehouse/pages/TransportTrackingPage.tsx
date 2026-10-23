import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import { can } from '../../../lib/rbac';
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
import { isOutbound, TILE_ORDER } from '../data/transport';
import type { Shipment, ShipmentKind, TransportStatus } from '../data/transport';
import { useTransport } from '../data/useTransport';
import { createDocument } from '../../../services/documentsApi';
import '../transport.css';

const MOCK_DRIVER = 'คุณสมชาย แก้วกล้า';

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

/**
 * Roles this screen is rendered for. PHARMACIST and HOSPITAL_ADMIN open it read-only
 * (API-F2a-012 lets the pharmacist list tasks; POST status/photos is warehouse/driver only).
 */
export type TransportRole = 'WAREHOUSE_OFFICER' | 'PHARMACIST' | 'HOSPITAL_ADMIN' | 'DRIVER' | 'ER_STAFF';

/**
 * UI-14 Transport tracking. UI only — data is mock, actions are local state.
 * WAREHOUSE_OFFICER and DRIVER operate; PHARMACIST and HOSPITAL_ADMIN are read-only.
 * All roles see only their own hospital's tasks (SEC-002), and DRIVER sees assigned tasks (ASM-44).
 */
export function TransportTrackingPage({ role = 'WAREHOUSE_OFFICER' }: { role?: TransportRole }) {
  const canOperate = can(role, 'transportStatus');
  const isDriver = role === 'DRIVER';
  // Only the pharmacist answers / requests a cancellation (RBAC §4.4); the warehouse never does.
  const tr = useTransport();
  const live = tr.source === 'live';
  // The cancel-with-consent flow has no API yet, so it stays a mock-only control.
  const canCancel = role === 'PHARMACIST' && !live;
  const online = useOnline();
  const [dir, setDir] = useState<Direction>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('dir');
      return q === 'in' ? 'in' : 'out';
    } catch {
      return 'out';
    }
  });
  const [status, setStatus] = useState<TransportStatus | null>(null);
  // Detail drawer: opens on row pick or when deep linked via ?task=... or ?id=...
  const [selId, setSelId] = useState<string | null>(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get('task') || q.get('id');
    } catch {
      return null;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState<boolean>(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return Boolean(q.get('task') || q.get('id'));
    } catch {
      return false;
    }
  });
  const [histOpen, setHistOpen] = useState(false);
  const [synced, setSynced] = useState(false);
  const [receipt, setReceipt] = useState<Record<string, ReceiptState>>({});
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [cancel, setCancel] = useState<Record<string, CancelDecision>>({});
  const [proxy, setProxy] = useState<Record<string, ProxyEntry[]>>({});
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | ShipmentKind>('all');
  const [driver, setDriver] = useState('all');
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const [photoKeys, setPhotoKeys] = useState<Record<string, string[]>>({});

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
    if (live) {
      return { shipment: s, status: s.status, pending: canOperate && !!s.pending, cancelRequested: !!s.cancelRequest && s.status === 'WAITING_DISPATCH' };
    }
    let st = s.status;
    const px = proxy[s.id];
    if (px?.length) st = px[px.length - 1].to;
    if (receipt[s.id] === 'done') st = 'RECEIVED';
    if (cancel[s.id] === 'yes') st = 'CANCELLED';
    return { shipment: s, status: st, pending: canOperate && !!s.pending && !synced, cancelRequested: !!s.cancelRequest && st === 'WAITING_DISPATCH' && cancel[s.id] !== 'no' };
  };

  const all = useMemo(() => tr.shipments.map(effective), [tr.shipments, live, receipt, cancel, synced, proxy]); // eslint-disable-line react-hooks/exhaustive-deps
  const drivers = useMemo(() => [...new Set(tr.shipments.map((s) => s.driver).filter((d): d is string => !!d))].sort(), [tr.shipments]);
  const queued = all.filter((r) => r.pending).length;

  const byDir = all.filter((r) => (dir === 'out' ? isOutbound(r.shipment) : !isOutbound(r.shipment)));
  const counts = Object.fromEntries(TILE_ORDER.map((c) => [c, byDir.filter((r) => r.status === c).length])) as Record<TransportStatus, number>;

  const needle = q.trim().toLowerCase();
  const rows = byDir
    .filter((r) => !status || r.status === status)
    .filter((r) => kind === 'all' || r.shipment.kind === kind)
    .filter((r) => driver === 'all' || r.shipment.driver === driver)
    .filter((r) => live || !isDriver || r.shipment.driver === MOCK_DRIVER)
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
      hint: canOperate ? 'งานที่อนุมัติ/ยืนยันแล้ว · เตรียมของแล้วขึ้นรถ + ถ่ายรูปที่นี่' : 'งานที่ รพ.เราส่งไปให้ รพ.อื่น',
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
    setActError(null);
    if (r.status === 'ARRIVED' && !isOutbound(r.shipment) && receipt[r.shipment.id] !== 'done') setReceipt((m) => ({ ...m, [r.shipment.id]: 'open' }));
    if (r.status === 'LOADED' && r.pending) setSynced(true);
    open(r.shipment.id);
  };

  // Deep-link handler: automatically select task and switch tab direction if URL specifies ?task=... or ?id=...
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const target = q.get('task') || q.get('id');
      if (!target || all.length === 0) return;
      const match = all.find((r) => r.shipment.id === target || r.shipment.taskId === target);
      if (match) {
        setDir(isOutbound(match.shipment) ? 'out' : 'in');
        setSelId(match.shipment.id);
        setDrawerOpen(true);
      }
    } catch {}
  }, [all]);

  const sel = selId ? all.find((r) => r.shipment.id === selId) : undefined;

  /** Live actions: upload a photo for the open task, or advance its status (attaching the uploaded photos). */
  const addPhoto = async (s: Shipment, file: File) => {
    setBusy(true);
    setActError(null);
    try {
      const key = await tr.addPhoto(s, file);
      setPhotoKeys((m) => ({ ...m, [s.id]: [...(m[s.id] ?? []), key] }));
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const advance = async (s: Shipment, to: 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED', extra: { qtyReceived?: number; reason?: string } = {}) => {
    setBusy(true);
    setActError(null);
    try {
      const keys = to === 'LOADED' || to === 'ARRIVED' ? photoKeys[s.id] ?? [] : [];
      await tr.advance(s, to, { ...extra, ...(keys.length ? { photoKeys: keys } : {}) });
      setPhotoKeys((m) => ({ ...m, [s.id]: [] }));
      setReceipt((m) => ({ ...m, [s.id]: undefined }));
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** Issue (or open the existing) borrow / transfer slip, then go to the documents screen. */
  const openSlip = async (s: Shipment) => {
    if (!live || !s.refId) return;
    setBusy(true);
    setActError(null);
    try {
      const res = await createDocument(s.kind === 'F1' ? 'BORROW_SLIP' : 'TRANSFER_SLIP', s.refId);
      const url = new URL(window.location.href);
      url.searchParams.set('page', role === 'ER_STAFF' ? 'documents' : 'docs');
      url.searchParams.set('doc', res.id);
      window.location.href = url.toString();
    } catch (e) {
      setActError((e as Error).message);
      setBusy(false);
    }
  };
  const countedFor = (s: Shipment) => counted[s.id] ?? String(s.qty);

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">ติดตามการขนส่ง</span>
          </nav>
          <h1 className="tr-title">
            ติดตามการขนส่ง <span>/ Transport tracking · UI-14</span>
          </h1>
          <div style={{ fontSize: 13 }}>รพ.สมุทรปราการ · สต็อกต้นทางตัดเมื่อขึ้นรถ (LOADED) ปลายทางรับเข้าเมื่อยืนยันรับ (RECEIVED) · ขั้นตอนขนส่งไม่มี Agent</div>
          {canOperate && (
            <div style={{ fontSize: 12.5, marginTop: 2 }}>
              งานส่งออกเข้าที่นี่เมื่อเภสัชกรอนุมัติ (F1/F2) หรือ WH ยืนยันคำขอเร่งด่วน (F3) · ขั้นตอน: รอขึ้นรถ (เตรียมของ) → ขึ้นรถ + รูป → ถึง{' '}
              <a className="link" href="?role=warehouse&page=kit" style={{ fontSize: 12.5 }}>ไปที่คำขอเร่งด่วน F3</a>
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

      {tr.source === 'mock' && (
        <section role="status" className="syncbar" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <span className="syncbar-text">
            โหลดข้อมูลงานขนส่งจริงไม่ได้ ({tr.error}) · กำลังแสดงข้อมูลตัวอย่าง
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
            {drivers.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span style={{ flex: '1 1 0' }} />
          <span style={{ fontSize: 12 }}>เรียง: ต้องทำก่อน → อัปเดตล่าสุด</span>
        </div>
        <ShipmentTable rows={rows} activeId={drawerOpen && sel ? sel.shipment.id : null} onOpen={open} onAction={onAction} canOperate={canOperate} canCancel={canCancel} isDriver={isDriver} />
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
          onProxy={(to, reason) => (live ? void advance(sel.shipment, to, { reason }) : setProxy((m) => ({ ...m, [sel.shipment.id]: [...(m[sel.shipment.id] ?? []), { to, reason }] })))}
          isDriver={isDriver}
          live={live}
          busy={busy}
          error={actError}
          pendingPhotos={photoKeys[sel.shipment.id]}
          onAddPhoto={(file) => void addPhoto(sel.shipment, file)}
          onAdvance={(to, extra) => void advance(sel.shipment, to, extra)}
          onSlip={() => void openSlip(sel.shipment)}
          onDepart={(id) => {
            setProxy((m) => ({ ...m, [id]: [...(m[id] ?? []), { to: 'IN_TRANSIT', reason: 'คนขับยืนยันออกเดินทาง' }] }));
          }}
          onArrive={(id) => {
            setProxy((m) => ({ ...m, [id]: [...(m[id] ?? []), { to: 'ARRIVED', reason: 'คนขับถึงปลายทางพร้อมรูปถ่าย' }] }));
          }}
        />
      )}
      {histOpen && <AuditHistoryDrawer onClose={() => setHistOpen(false)} items={tr.history} />}
    </>
  );
}
