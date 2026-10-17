import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { DRIVER_USER, DRIVER_VEHICLE } from '../data/session';
import { COLD_CHAIN_GUIDELINE, EMERGENCY_CONTACTS, INITIAL_OFFLINE_EVENTS } from '../data/driverTasks';
import type { DriverOfflineEvent } from '../data/driverTasks';

export function DriverSyncPage() {
  const [events, setEvents] = useState<DriverOfflineEvent[]>(INITIAL_OFFLINE_EVENTS);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [syncedAll, setSyncedAll] = useState(false);

  const pendingCount = syncedAll ? 0 : events.filter((e) => !e.applied).length;

  const handleManualSync = () => {
    setSyncedAll(true);
    setEvents((prev) =>
      prev.map((e) => ({
        ...e,
        applied: true,
        receivedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น. (ซิงก์สำเร็จ)',
      }))
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page Header */}
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href="?page=transport&role=driver" className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              งานขนส่งของฉัน
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">คิวออฟไลน์ & รถขนส่ง</span>
          </nav>
          <h1 className="tr-title">
            คิวออฟไลน์ & ยานพาหนะ <span>/ Offline Queue & Vehicle Status · NFR-011</span>
          </h1>
          <div style={{ fontSize: 13, color: '#475569' }}>
            ระบบจัดเก็บข้อมูลในเครื่องเมื่อไม่มีสัญญาณ และซิงก์อัตโนมัติแบบ Idempotent เมื่อกลับมาออนไลน์ (FR-F2a-016)
          </div>
        </div>

        <div className="pagehead-actions">
          <button
            className="btn btn-s"
            onClick={() => setIsSimulatedOffline((v) => !v)}
            style={{
              borderColor: isSimulatedOffline ? '#DC2626' : undefined,
              color: isSimulatedOffline ? '#DC2626' : undefined,
            }}
          >
            <Icon name={isSimulatedOffline ? 'wifiOff' : 'sync'} />
            {isSimulatedOffline ? 'โหมด: จำลองออฟไลน์' : 'ทดสอบตัดสัญญาณ'}
          </button>
          <button
            className="btn btn-p"
            disabled={pendingCount === 0 || isSimulatedOffline}
            onClick={handleManualSync}
          >
            <Icon name="sync" />
            บังคับซิงก์ข้อมูล ({pendingCount})
          </button>
        </div>
      </section>

      {/* Network & Local Storage Quota Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {/* Offline Queue Quota Monitor (NFR-011) */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="sec-h" style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="box" className="ic16" />
              โควตาพื้นที่ในเครื่อง (IndexedDB)
            </h2>
            <span className="badge t-blue" style={{ fontSize: 11 }}>NFR-011</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span>รูปถ่ายหลักฐานในคิว</span>
                <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>
                  {syncedAll ? '0' : '2'} / 50 รูป (สูงสุด 200 MB)
                </span>
              </div>
              <div className="bar">
                <span style={{ width: syncedAll ? '0%' : '4%', background: '#1D4ED8' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span>ประวัติเหตุการณ์สถานะ (Events)</span>
                <span className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>
                  {events.length} / 200 รายการ
                </span>
              </div>
              <div className="bar">
                <span style={{ width: `${(events.length / 200) * 100}%`, background: '#166534' }} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#475569', background: '#F8FAFC', padding: '8px 10px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              ℹ️ ระบบจะใช้เวลาบันทึกจริงจากเครื่องคนขับ (<span className="code">captured_at</span>) และป้องกันข้อมูลซ้ำซ้อนผ่าน <span className="code">client_event_id</span>
            </div>
          </div>
        </div>

        {/* Assigned Vehicle & Cold Chain Protocol */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="sec-h" style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="truck" className="ic16" />
              ข้อมูลยานพาหนะ & มาตรฐานความเย็น
            </h2>
            <span className="badge t-green" style={{ fontSize: 11 }}>ผ่านการตรวจสภาพ</span>
          </div>

          <dl className="dlr" style={{ fontSize: 12.5 }}>
            <dt>คนขับ</dt>
            <dd style={{ fontWeight: 600, color: '#0F2A5C' }}>{DRIVER_USER.name}</dd>
            <dt>ทะเบียนรถ</dt>
            <dd><b className="num">{DRIVER_VEHICLE.plateNumber}</b></dd>
            <dt>ประเภทรถ</dt>
            <dd>{DRIVER_VEHICLE.vehicleType}</dd>
            <dt>ระบบความเย็น</dt>
            <dd>{DRIVER_VEHICLE.coolingSpec}</dd>
            <dt>เกณฑ์เวลาสูงสุด</dt>
            <dd>
              <b style={{ color: '#1E40AF' }}>ไม่เกิน {COLD_CHAIN_GUIDELINE.maxTransitHours} ชม. ({COLD_CHAIN_GUIDELINE.tempRange})</b>
            </dd>
          </dl>
        </div>
      </div>

      {/* Offline Event Batch Log Table */}
      <section className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <div>
            <h2 className="sec-h" style={{ margin: 0, fontSize: 16 }}>
              ประวัติรายการบันทึกสถานะ <span className="en">POST /api/v1/transport-tasks/:id/events:sync</span>
            </h2>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
              ลำดับเหตุการณ์ที่บันทึกจากหน้าเครื่องคนขับและการตอบสนองจากเซิร์ฟเวอร์
            </div>
          </div>
          {pendingCount > 0 && !syncedAll && (
            <span className="badge t-amber">
              <Icon name="sync" className="ic12" />
              รอส่งเซิร์ฟเวอร์ {pendingCount} รายการ
            </span>
          )}
        </div>

        <div className="scroll-x">
          <table className="tbl" aria-label="ประวัติการซิงก์ออฟไลน์">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Client Event ID</th>
                <th style={{ width: 130 }}>งานขนส่ง</th>
                <th style={{ width: 120 }}>สถานะที่เปลี่ยน</th>
                <th style={{ width: 160 }}>เวลาที่บันทึก (Device)</th>
                <th style={{ width: 180 }}>เวลาที่เซิร์ฟเวอร์รับ</th>
                <th style={{ width: 100 }}>ผลการซิงก์</th>
                <th>หมายเหตุ / รูป</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.clientEventId}>
                  <td>
                    <span className="code" style={{ fontSize: 12, color: '#1D4ED8' }}>
                      {ev.clientEventId}
                    </span>
                  </td>
                  <td>
                    <span className="code" style={{ fontWeight: 600 }}>
                      {ev.taskId}
                    </span>
                  </td>
                  <td>
                    <span className="badge t-blue" style={{ fontSize: 11 }}>
                      {ev.toStatus}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    <span className="num">{ev.capturedAt}</span>
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    <span className="num" style={{ color: ev.applied ? '#166534' : '#D97706' }}>
                      {ev.receivedAt}
                    </span>
                  </td>
                  <td>
                    {ev.applied ? (
                      <span className="badge t-green" style={{ fontSize: 11 }}>
                        <Icon name="check" className="ic12" />
                        APPLIED
                      </span>
                    ) : (
                      <span className="badge t-amber" style={{ fontSize: 11 }}>
                        <Icon name="sync" className="ic12" />
                        QUEUED
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: '#475569' }}>
                    {ev.note}
                    {ev.photoKeys.length > 0 && (
                      <span className="badge t-grey" style={{ marginLeft: 6, fontSize: 11 }}>
                        📷 {ev.photoKeys.length} รูป
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Emergency Contacts Directory */}
      <section className="card" style={{ padding: '16px 20px' }}>
        <h2 className="sec-h" style={{ margin: '0 0 12px 0', fontSize: 16 }}>
          เบอร์โทรศัพท์ฉุกเฉิน & ลานรับส่งยา <span className="en">Emergency Hospital Docks Directory</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {EMERGENCY_CONTACTS.map((c) => (
            <div
              key={c.name}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{c.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <a
                  href={`tel:${c.tel.replace(/[^0-9]/g, '')}`}
                  className="link"
                  style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}
                >
                  📞 {c.tel}
                </a>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{c.time}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
