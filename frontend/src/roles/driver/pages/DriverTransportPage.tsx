import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useAuth } from '../../../context/AuthContext';
import { compressImageToBase64 } from '../../../lib/imageCompress';
import { uploadTransportPhoto } from '../../../services/transportApi';
import { SyncBar } from '../../warehouse/components/SyncBar';
import { useTransport } from '../../warehouse/data/useTransport';
import { DRIVER_USER, DRIVER_VEHICLE } from '../data/session';
import { enqueueEvent, listQueue, onQueueChange, syncQueue } from '../data/driverQueue';
import type { QueuedEvent } from '../data/driverQueue';
import { DriverTaskCard } from '../components/DriverTaskCard';
import { DriverTaskDrawer } from '../components/DriverTaskDrawer';
import { DriverPhotoModal } from '../components/DriverPhotoModal';
import type { Shipment } from '../../warehouse/data/transport';
import '../../warehouse/transport.css';

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

type FilterTab = 'active' | 'in_transit' | 'all';

const hhmm = () => new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

/** Shows what the driver already did on this device but the server has not seen yet. */
function withQueue(task: Shipment, queue: QueuedEvent[]): Shipment {
  const mine = queue.filter((e) => e.state === 'pending' && e.taskId === task.taskId).sort((a, b) => a.seq - b.seq);
  if (mine.length === 0) return task;
  const last = mine[mine.length - 1];
  return {
    ...task,
    status: last.toStatus,
    pending: true,
    updatedAt: `${hhmm()} น.`,
    photos: [...task.photos, ...mine.flatMap((e) => e.photos.map(() => ({ stage: e.toStatus === 'ARRIVED' ? ('ARRIVED' as const) : ('LOADED' as const), time: `${hhmm()} น.`, pending: true })))],
  };
}

export function DriverTransportPage() {
  const realOnline = useOnline();
  // Simulated offline toggle for PWA offline resilience testing (NFR-011)
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const online = realOnline && !simulatedOffline;
  const { user } = useAuth();
  const tr = useTransport();
  const live = tr.source === 'live';

  const [queue, setQueue] = useState<QueuedEvent[]>([]);
  useEffect(() => {
    const load = () => void listQueue().then(setQueue).catch(() => undefined);
    load();
    return onQueueChange(load);
  }, []);
  const pendingQueue = queue.filter((e) => e.state === 'pending');

  const tasks = useMemo(() => tr.shipments.map((t) => withQueue(t, queue)), [tr.shipments, queue]);

  const [tab, setTab] = useState<FilterTab>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photo modal state
  const [photoModal, setPhotoModal] = useState<{ open: boolean; taskId: string; stage: 'LOADED' | 'ARRIVED' } | null>(null);

  const queuedCount = pendingQueue.length;

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'LOADED' || t.status === 'IN_TRANSIT' || t.status === 'WAITING_DISPATCH');
  }, [tasks]);

  const inTransitTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'IN_TRANSIT');
  }, [tasks]);

  const displayedTasks = useMemo(() => {
    if (tab === 'active') return activeTasks;
    if (tab === 'in_transit') return inTransitTasks;
    return tasks;
  }, [tab, activeTasks, inTransitTasks, tasks]);

  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null;

  const nextSeq = (t: Shipment) => Math.max(t.lastSeq ?? 0, ...queue.filter((e) => e.taskId === t.taskId).map((e) => e.seq)) + 1;

  /** One status change: straight to the API when online, otherwise into the offline queue. */
  const record = async (t: Shipment, toStatus: 'LOADED' | 'IN_TRANSIT' | 'ARRIVED', opts: { file?: File; note?: string } = {}) => {
    if (!live || !t.taskId) throw new Error('ใช้ข้อมูลตัวอย่างอยู่ บันทึกไม่ได้ · ลองโหลดหน้าใหม่เมื่อเชื่อมต่อระบบได้');
    const photo = opts.file ? await compressImageToBase64(opts.file) : null;
    if (online) {
      const keys = photo ? [(await uploadTransportPhoto(t.taskId, photo)).photoKey] : [];
      await tr.advance(t, toStatus, keys.length ? { photoKeys: keys } : {});
    } else {
      await enqueueEvent({ taskId: t.taskId, taskNo: t.id, seq: nextSeq(t), toStatus, capturedAt: new Date().toISOString(), note: opts.note ?? '', photos: photo ? [photo] : [] });
    }
  };

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Driver advances: LOADED -> IN_TRANSIT
  const handleDepart = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (t) void guarded(() => record(t, 'IN_TRANSIT'));
  };

  // Driver opens arrival photo capture
  const handleArriveWithPhoto = (id: string) => {
    setError(null);
    setPhotoModal({ open: true, taskId: id, stage: 'ARRIVED' });
  };

  // Save captured photo & advance status
  const handleSavePhoto = (stage: 'LOADED' | 'ARRIVED', note: string, file: File) => {
    const t = photoModal && tasks.find((x) => x.id === photoModal.taskId);
    if (!t) return;
    void guarded(async () => {
      await record(t, stage, { file, note });
      setPhotoModal(null);
    });
  };

  const handleSyncAll = () =>
    void guarded(async () => {
      await syncQueue();
      await tr.reload();
    });

  // Signal is back: send what was queued.
  useEffect(() => {
    if (online && live && pendingQueue.length > 0) handleSyncAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, live, pendingQueue.length]);

  const driverName = user?.name ?? DRIVER_USER.name;
  const driverInitial = user?.initial ?? DRIVER_USER.initial;
  const hospitalLabel = user?.hospitalName ?? DRIVER_USER.hospitalLabel;
  const plate = tasks.find((t) => t.vehiclePlate)?.vehiclePlate ?? DRIVER_VEHICLE.plateNumber;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Driver Header Profile Banner */}
      <section
        className="card"
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #0F2A5C 0%, #1E40AF 100%)',
          color: '#FFFFFF',
          borderRadius: 12,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              background: '#FFFFFF',
              color: '#1E40AF',
              display: 'grid',
              placeItems: 'center',
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {driverInitial}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>
                {driverName}
              </h1>
              <span className="badge t-green" style={{ height: 22, fontSize: 11.5, background: '#DCFCE7', color: '#166534' }}>
                พร้อมปฏิบัติงาน (Active)
              </span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 3 }}>
              {DRIVER_VEHICLE.vehicleType} · ทะเบียน <b>{plate}</b> ({hospitalLabel})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-sm"
            style={{
              background: simulatedOffline ? '#FEE2E2' : 'rgba(255, 255, 255, 0.15)',
              color: simulatedOffline ? '#991B1B' : '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}
            onClick={() => setSimulatedOffline((v) => !v)}
            title="จำลองกรณีอับสัญญาณในลานโหลดชั้นใต้ดิน"
          >
            <Icon name={simulatedOffline ? 'wifiOff' : 'truck'} />
            {simulatedOffline ? 'จำลอง: ออฟไลน์อยู่' : 'ทดสอบโหมดออฟไลน์'}
          </button>
          <a
            className="btn btn-sm"
            href="?page=sync&role=driver"
            style={{ background: '#FFFFFF', color: '#1E40AF', textDecoration: 'none' }}
          >
            <Icon name="sync" />
            คิวออฟไลน์ ({queuedCount})
          </a>
        </div>
      </section>

      {tr.source === 'mock' && (
        <section role="status" className="syncbar" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <span className="syncbar-text">โหลดงานขนส่งจริงไม่ได้ ({tr.error}) · กำลังแสดงข้อมูลตัวอย่าง บันทึกสถานะไม่ได้</span>
        </section>
      )}
      {error && !photoModal && (
        <section role="alert" className="syncbar" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
          <span className="syncbar-text">{error}</span>
        </section>
      )}

      {/* Offline Sync Bar (UI-14 PWA requirement) */}
      <SyncBar
        online={online}
        queued={queuedCount}
        onSync={handleSyncAll}
      />

      {/* Quick Summary Metric Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <span className="sub" style={{ fontSize: 12 }}>งานที่ต้องทำ</span>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#1D4ED8', marginTop: 2 }}>
            {activeTasks.length}
          </div>
          <span style={{ fontSize: 11, color: '#475569' }}>รอขึ้นรถ / ระหว่างเดินทาง</span>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <span className="sub" style={{ fontSize: 12 }}>กำลังเดินทาง (In Transit)</span>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#0F2A5C', marginTop: 2 }}>
            {inTransitTasks.length}
          </div>
          <span style={{ fontSize: 11, color: '#475569' }}>อยู่ระหว่างขับส่งมอบ</span>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <span className="sub" style={{ fontSize: 12 }}>รอซิงก์ข้อมูล</span>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, color: queuedCount > 0 ? '#D97706' : '#166534', marginTop: 2 }}>
            {queuedCount}
          </div>
          <span style={{ fontSize: 11, color: '#475569' }}>บันทึกในเครื่อง IndexedDB</span>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <span className="sub" style={{ fontSize: 12 }}>งานทั้งหมด</span>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#475569', marginTop: 2 }}>
            {tasks.length}
          </div>
          <span style={{ fontSize: 11, color: '#475569' }}>ประวัติงานขนส่งของฉัน</span>
        </div>
      </div>

      {/* Main Content Area: Tabs & Task Cards */}
      <section className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 className="sec-h" style={{ margin: 0, fontSize: 17 }}>
              รายการงานขนส่งเวชภัณฑ์ <span className="en">UI-14 Driver Tasks</span>
            </h2>
            <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>
              แสดงเฉพาะงานขนส่งที่มอบหมายให้ {driverName} (SEC-002 Least Privilege)
            </div>
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`chipbtn ${tab === 'active' ? 'chip-on' : ''}`}
              onClick={() => setTab('active')}
            >
              งานที่ต้องทำ
              <span className="chip-n">{activeTasks.length}</span>
            </button>
            <button
              className={`chipbtn ${tab === 'in_transit' ? 'chip-on' : ''}`}
              onClick={() => setTab('in_transit')}
            >
              กำลังเดินทาง
              <span className="chip-n">{inTransitTasks.length}</span>
            </button>
            <button
              className={`chipbtn ${tab === 'all' ? 'chip-on' : ''}`}
              onClick={() => setTab('all')}
            >
              ทั้งหมด
              <span className="chip-n">{tasks.length}</span>
            </button>
          </div>
        </div>

        {/* Task Cards List */}
        {displayedTasks.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 16px',
              color: '#475569',
              background: '#F8FAFC',
              borderRadius: 8,
              border: '1px dashed #CBD5E1',
            }}
          >
            <Icon name="checkc" className="ic20" style={{ width: 32, height: 32, margin: '0 auto 8px', color: '#166534' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0F2A5C' }}>ไม่มีงานค้างในหมวดนี้</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>งานขนส่งทั้งหมดได้รับการบันทึกและส่งมอบเรียบร้อย</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {displayedTasks.map((t) => (
              <DriverTaskCard
                key={t.id}
                shipment={t}
                status={t.status}
                pending={!!t.pending || t.photos.some((p) => p.pending)}
                onOpenDetail={(id) => setSelectedId(id)}
                onDepart={handleDepart}
                onArriveWithPhoto={handleArriveWithPhoto}
              />
            ))}
          </div>
        )}
      </section>

      {/* Task Drawer */}
      {selectedTask && (
        <DriverTaskDrawer
          shipment={selectedTask}
          status={selectedTask.status}
          pending={!!selectedTask.pending || selectedTask.photos.some((p) => p.pending)}
          onClose={() => setSelectedId(null)}
          onDepart={handleDepart}
          onOpenPhotoModal={(stage) => setPhotoModal({ open: true, taskId: selectedTask.id, stage })}
          onSync={handleSyncAll}
        />
      )}

      {/* Photo Capture Modal */}
      {photoModal?.open && (
        <DriverPhotoModal
          taskId={photoModal.taskId}
          stage={photoModal.stage}
          online={online}
          busy={busy}
          error={error}
          onClose={() => setPhotoModal(null)}
          onSavePhoto={handleSavePhoto}
        />
      )}
    </div>
  );
}
