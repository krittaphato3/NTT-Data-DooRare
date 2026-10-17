import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { SyncBar } from '../../warehouse/components/SyncBar';
import { DRIVER_USER, DRIVER_VEHICLE } from '../data/session';
import { isAssignedToDriver } from '../data/driverTasks';
import { DriverTaskCard } from '../components/DriverTaskCard';
import { DriverTaskDrawer } from '../components/DriverTaskDrawer';
import { DriverPhotoModal } from '../components/DriverPhotoModal';
import { SHIPMENTS } from '../../warehouse/data/transport';
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

export function DriverTransportPage() {
  const realOnline = useOnline();
  // Simulated offline toggle for PWA offline resilience testing (NFR-011)
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const online = realOnline && !simulatedOffline;

  const [tasks, setTasks] = useState<Shipment[]>(() => {
    // Pick tasks assigned to current driver or tasks relevant to driver
    const driverTasks = SHIPMENTS.filter((s) => isAssignedToDriver(s, DRIVER_USER.name));
    return driverTasks.length > 0 ? driverTasks : SHIPMENTS.slice(0, 4);
  });

  const [tab, setTab] = useState<FilterTab>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  // Photo modal state
  const [photoModal, setPhotoModal] = useState<{ open: boolean; taskId: string; stage: 'LOADED' | 'ARRIVED' } | null>(null);

  // Calculate pending items
  const queuedCount = useMemo(() => {
    if (synced) return 0;
    return tasks.reduce((acc, t) => acc + (t.pending ? 1 : 0) + t.photos.filter((p) => p.pending).length, 0);
  }, [tasks, synced]);

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

  // Driver advances: LOADED -> IN_TRANSIT
  const handleDepart = (id: string) => {
    const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const newTimes = [...t.times];
        newTimes[2] = `${nowTime} · ${DRIVER_USER.name} ออกเดินทาง`;
        return {
          ...t,
          status: 'IN_TRANSIT',
          updatedAt: `${nowTime} น.`,
          updatedBy: `${DRIVER_USER.name} (คนขับ)`,
          times: newTimes,
          pending: !online,
        };
      })
    );
  };

  // Driver opens arrival photo capture
  const handleArriveWithPhoto = (id: string) => {
    setPhotoModal({ open: true, taskId: id, stage: 'ARRIVED' });
  };

  // Save captured photo & advance status
  const handleSavePhoto = (stage: 'LOADED' | 'ARRIVED', note: string) => {
    if (!photoModal) return;
    const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== photoModal.taskId) return t;
        const newPhotos = [
          ...t.photos,
          {
            stage,
            time: `${nowTime} น.`,
            pending: !online,
          },
        ];
        const newTimes = [...t.times];
        let nextStatus = t.status;
        if (stage === 'ARRIVED') {
          nextStatus = 'ARRIVED';
          newTimes[3] = `${nowTime} · ${DRIVER_USER.name} + รูป ${note ? `(${note})` : ''}`;
        }
        return {
          ...t,
          status: nextStatus,
          photos: newPhotos,
          times: newTimes,
          updatedAt: `${nowTime} น.`,
          updatedBy: `${DRIVER_USER.name} (คนขับ)`,
          pending: !online || t.pending,
        };
      })
    );

    setPhotoModal(null);
  };

  const handleSyncAll = () => {
    setSynced(true);
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        pending: false,
        photos: t.photos.map((p) => ({ ...p, pending: false })),
      }))
    );
  };

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
            {DRIVER_USER.initial}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>
                {DRIVER_USER.name}
              </h1>
              <span className="badge t-green" style={{ height: 22, fontSize: 11.5, background: '#DCFCE7', color: '#166534' }}>
                พร้อมปฏิบัติงาน (Active)
              </span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 3 }}>
              {DRIVER_VEHICLE.vehicleType} · ทะเบียน <b>{DRIVER_VEHICLE.plateNumber}</b> ({DRIVER_USER.hospitalLabel})
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
              แสดงเฉพาะงานขนส่งที่มอบหมายให้ {DRIVER_USER.name} (SEC-002 Least Privilege)
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
                pending={!synced && (!!t.pending || t.photos.some((p) => p.pending))}
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
          pending={!synced && (!!selectedTask.pending || selectedTask.photos.some((p) => p.pending))}
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
          onClose={() => setPhotoModal(null)}
          onSavePhoto={handleSavePhoto}
        />
      )}
    </div>
  );
}
