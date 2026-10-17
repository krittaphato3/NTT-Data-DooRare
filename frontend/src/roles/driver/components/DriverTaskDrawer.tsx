import { Icon } from '../../../components/common/icons';
import { fmtQty, HOSPITALS, STEP_ORDER, STEPS } from '../../warehouse/data/transport';
import type { Shipment, TransportStatus } from '../../warehouse/data/transport';
import { StatusBadge } from '../../warehouse/components/StatusBadge';
import { COLD_CHAIN_GUIDELINE, EMERGENCY_CONTACTS } from '../data/driverTasks';

interface DriverTaskDrawerProps {
  shipment: Shipment;
  status: TransportStatus;
  pending: boolean;
  onClose: () => void;
  onDepart: (id: string) => void;
  onOpenPhotoModal: (stage: 'LOADED' | 'ARRIVED') => void;
  onSync: () => void;
}

export function DriverTaskDrawer({
  shipment: s,
  status,
  pending,
  onClose,
  onDepart,
  onOpenPhotoModal,
  onSync,
}: DriverTaskDrawerProps) {
  const idx = status === 'CANCELLED' ? -1 : STEP_ORDER.indexOf(status);

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดงานขนส่งสำหรับคนขับ" style={{ zIndex: 900 }}>
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">งานขนส่งของฉัน · UI-14 Driver PWA</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 700, color: '#0F2A5C' }}>
            {s.id}
          </h2>
          <StatusBadge status={status} />
          <span className={`badge ${s.kind === 'F1' ? 't-blue' : 't-teal'}`}>
            {s.kind === 'F1' ? 'ยืม (F1)' : 'โอนยาใกล้หมดอายุ (F2)'}
          </span>
          {s.coldChain && <span className="badge t-blue">❄️ Cold chain 2–8°C</span>}
          {pending && <span className="badge t-amber">รอซิงก์</span>}
        </div>

        <div style={{ fontSize: 13.5, color: '#0F2A5C', marginTop: 2 }}>
          <b>{HOSPITALS[s.from]}</b> → <b>{HOSPITALS[s.to]}</b> · <span className="code">{s.ref}</span>
        </div>
      </div>

      <div className="tr-drawer-body">
        {/* Step-by-Step Delivery Stepper (SM-6) */}
        <div>
          <h3 className="tr-h3">
            ขั้นตอนการขนส่ง <span className="en">SM-6 Transport Lifecycle</span>
          </h3>
          <ol className="stepper">
            {STEPS.map((st, i) => {
              const done = i < idx || status === 'RECEIVED';
              const cur = i === idx && status !== 'RECEIVED';
              const sub = s.times[i] || (cur ? 'ขั้นปัจจุบัน' : status === 'CANCELLED' ? '—' : 'ยังไม่ถึง');
              return (
                <li key={st.code}>
                  <span className="step-rail">
                    <span
                      className="step-dot"
                      style={{
                        background: done ? '#1D4ED8' : cur ? '#FFFFFF' : '#F1F5F9',
                        color: done ? '#FFFFFF' : cur ? '#1D4ED8' : '#475569',
                        boxShadow: cur ? '0 0 0 2px #1D4ED8' : 'none',
                      }}
                    >
                      <Icon name={done ? 'check' : st.icon} className="ic14" />
                    </span>
                    <span
                      className="step-line"
                      style={{ background: i < STEPS.length - 1 ? (done ? '#1D4ED8' : '#E2E8F0') : 'transparent' }}
                    />
                  </span>
                  <span className="step-body">
                    <span className="step-label" style={{ color: done || cur ? '#0F2A5C' : '#475569', fontWeight: cur ? 600 : 400 }}>
                      {st.label} <span className="code" style={{ fontSize: 10.5 }}>{st.code}</span>
                    </span>
                    <span className="step-sub">{sub}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Cargo Summary Box */}
        <div className="tr-box">
          <h3 className="tr-h3" style={{ marginBottom: 8 }}>
            ข้อมูลเวชภัณฑ์ที่ขนส่ง
          </h3>
          <dl className="dlr">
            <dt>รายการยา</dt>
            <dd style={{ fontWeight: 600, color: '#0F2A5C' }}>{s.drug}</dd>
            <dt>จำนวน</dt>
            <dd>
              <b className="num">{fmtQty(s.qty)}</b> {s.unit}
            </dd>
            <dt>ล็อตยา</dt>
            <dd><span className="code">{s.lot}</span></dd>
            <dt>การควบคุมความเย็น</dt>
            <dd>{s.coldChain ? '❄️ ต้องควบคุมอุณหภูมิ 2–8°C ตลอดการเดินทาง' : 'อุณหภูมิห้องปกติ (< 30°C)'}</dd>
            <dt>เอกสารอ้างอิง</dt>
            <dd className="code">{s.ref}</dd>
          </dl>

          {s.coldChain && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12.5, color: '#1E40AF' }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{COLD_CHAIN_GUIDELINE.title}</div>
              เวลาเดินทางสูงสุด: <b>{COLD_CHAIN_GUIDELINE.maxTransitHours} ชั่วโมง</b> · ตรวจสอบเทอร์โมมิเตอร์ก่อนออกเดินทางและเมื่อถึงปลายทาง
            </div>
          )}
        </div>

        {/* Contact Docks */}
        <div className="tr-box">
          <h3 className="tr-h3" style={{ marginBottom: 8 }}>
            จุดติดต่อลานรับส่งยา
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: 12.5 }}>
            <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <span className="sub" style={{ fontSize: 11.5 }}>ต้นทาง: {HOSPITALS[s.from]}</span>
              <div style={{ fontWeight: 600, color: '#0F2A5C', marginTop: 2 }}>
                คลังกลาง รพ.สมุทรปราการ (ชั้น 1 อาคารเภสัชกรรม)
              </div>
              <div style={{ color: '#475569', marginTop: 2 }}>โทร: 02-701-8132 ต่อ 104</div>
            </div>
            <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <span className="sub" style={{ fontSize: 11.5 }}>ปลายทาง: {HOSPITALS[s.to]}</span>
              <div style={{ fontWeight: 600, color: '#0F2A5C', marginTop: 2 }}>
                จุดรับเวชภัณฑ์ คลังยา {HOSPITALS[s.to]}
              </div>
              <div style={{ color: '#475569', marginTop: 2 }}>โทร: {EMERGENCY_CONTACTS.find(c => c.name.includes(HOSPITALS[s.to]))?.tel || '02-xxx-xxxx'}</div>
            </div>
          </div>
        </div>

        {/* Photo Evidence Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <h3 className="tr-h3" style={{ margin: 0 }}>
              รูปถ่ายหลักฐาน <span className="en">{s.photos.length} / 10 · บีบอัด ≤ 1.5 MB</span>
            </h3>
            <span className="sub" style={{ fontSize: 11.5 }}>PDPA: ห้ามถ่ายติดใบหน้า</span>
          </div>

          <div className="photo-grid">
            {s.photos.map((ph, i) => {
              const pend = !!ph.pending && pending;
              return (
                <div key={i} className="ph" role="img" aria-label={`รูปขั้น ${ph.stage} เวลา ${ph.time}`}>
                  <Icon name="camera" className="ic20" />
                  <span className="code" style={{ fontSize: 10 }}>{ph.stage}</span>
                  <span className="num" style={{ fontSize: 10.5 }}>{ph.time}</span>
                  {pend && <span className="badge t-amber ph-pend">รอซิงก์</span>}
                </div>
              );
            })}

            {s.photos.length < 10 && (status === 'LOADED' || status === 'IN_TRANSIT') && (
              <button
                className="ph ph-add"
                aria-label="ถ่ายหรือเพิ่มรูป"
                onClick={() => onOpenPhotoModal(status === 'LOADED' ? 'LOADED' : 'ARRIVED')}
              >
                <Icon name="plus" className="ic20" />
                <span>เพิ่มรูป</span>
              </button>
            )}
          </div>
        </div>

        {/* Offline Queue Information */}
        {pending && (
          <div className="queue-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>
                คิวในเครื่อง (IndexedDB) · รอซิงก์
              </span>
              <button className="btn btn-s btn-sm" onClick={onSync}>
                ซิงก์ตอนนี้
              </button>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: '18px', marginTop: 4 }}>
              มีรูปถ่ายและสถานะที่บันทึกขณะไม่มีสัญญาณ ระบบจะส่งขึ้นเซิร์ฟเวอร์อัตโนมัติเมื่อกลับมาออนไลน์
            </div>
          </div>
        )}

        {/* Driver Milestone Action Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {status === 'LOADED' && (
            <button className="btn btn-p" onClick={() => onDepart(s.id)}>
              <Icon name="truck" />
              ยืนยันออกเดินทาง (IN_TRANSIT)
            </button>
          )}

          {status === 'IN_TRANSIT' && (
            <button className="btn btn-p" onClick={() => onOpenPhotoModal('ARRIVED')}>
              <Icon name="camera" />
              ถึงปลายทาง + ถ่ายรูป (ARRIVED)
            </button>
          )}

          <a
            className="btn btn-s"
            href={`?page=docs&role=driver`}
            style={{ textDecoration: 'none' }}
          >
            <Icon name="printer" />
            {s.kind === 'F1' ? 'ดูใบยืม (BORROW_SLIP)' : 'ดูใบโอน (TRANSFER_SLIP)'}
          </a>
        </div>
      </div>
    </aside>
  );
}
