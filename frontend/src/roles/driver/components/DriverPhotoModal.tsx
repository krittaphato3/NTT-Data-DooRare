import { useState } from 'react';
import { Icon } from '../../../components/common/icons';

interface DriverPhotoModalProps {
  taskId: string;
  stage: 'LOADED' | 'ARRIVED';
  online: boolean;
  onClose: () => void;
  onSavePhoto: (stage: 'LOADED' | 'ARRIVED', note: string) => void;
}

export function DriverPhotoModal({ taskId, stage, online, onClose, onSavePhoto }: DriverPhotoModalProps) {
  const [photoAdded, setPhotoAdded] = useState(true);
  const [note, setNote] = useState('');
  const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const stageLabel = stage === 'LOADED' ? 'ขึ้นรถแล้ว (LOADED)' : 'ถึงปลายทาง (ARRIVED)';

  return (
    <div className="nav-scrim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#FFFFFF',
          borderRadius: 12,
          boxShadow: '0 8px 30px rgba(15, 42, 92, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span className="sub" style={{ fontSize: 12 }}>บันทึกรูปถ่ายหลักฐาน · UI-14</span>
            <h2 className="sec-h" style={{ fontSize: 16, margin: 0 }}>
              ถ่ายรูปยืนยัน: <span className="code" style={{ color: '#1D4ED8' }}>{taskId}</span>
            </h2>
          </div>
          <button className="icbtn" onClick={onClose} aria-label="ปิด">
            <Icon name="x" />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* PDPA Privacy Guardrail Notice (SEC-006 / ASM-27) */}
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#92400E', lineHeight: '18px' }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Icon name="shield" className="ic14" />
              ข้อกำหนดความเป็นส่วนตัว (PDPA / SEC-006)
            </div>
            ถ่ายเฉพาะกล่องพัสดุ ฉลากยา ล็อตยา หรือเทอร์โมมิเตอร์ตู้แช่ <b>ห้ามถ่ายติดใบหน้าบุคคลหรือเอกสารที่มีชื่อผู้ป่วย</b>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span>ขั้นตอนที่บันทึก: <b>{stageLabel}</b></span>
            <span className="num" style={{ color: '#475569' }}>เวลา: {nowTime} น.</span>
          </div>

          {/* Photo Preview Box */}
          <div
            style={{
              border: '2px dashed #94A3B8',
              borderRadius: 8,
              padding: 16,
              background: '#F8FAFC',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 180,
              gap: 8,
            }}
          >
            {photoAdded ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 80, height: 80, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'grid', placeItems: 'center', color: '#1D4ED8' }}>
                  <Icon name="camera" className="ic20" style={{ width: 36, height: 36 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>
                  {stage === 'LOADED' ? 'photo_cargo_loaded_01.jpg' : 'photo_dock_arrival_01.jpg'}
                </div>
                <div style={{ fontSize: 11.5, color: '#475569' }}>
                  ขนาด 840 KB (บีบอัดอัตโนมัติ ≤ 1.5 MB ตาม NFR-011)
                </div>
                {!online && (
                  <span className="badge t-amber" style={{ fontSize: 11 }}>
                    <Icon name="sync" className="ic12" />
                    จะบันทึกในเครื่อง (รอซิงก์เมื่อมีสัญญาณ)
                  </span>
                )}
              </div>
            ) : (
              <div>
                <button
                  className="btn btn-s"
                  onClick={() => setPhotoAdded(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="camera" />
                  เปิดกล้อง / เลือกรูปถ่าย
                </button>
                <div className="sub" style={{ marginTop: 6, fontSize: 11 }}>
                  รองรับ JPEG, PNG (ไม่เกิน 10 รูปต่องาน)
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#0F2A5C', marginBottom: 4 }}>
              บันทึกเพิ่มเติม (ไม่บังคับ)
            </label>
            <input
              type="text"
              className="inp"
              placeholder="เช่น หมายเลขกล่องแช่เย็น, สภาพพัสดุเรียบร้อยดี"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ padding: '12px 18px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-s" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn btn-p"
            disabled={!photoAdded}
            onClick={() => onSavePhoto(stage, note)}
          >
            <Icon name="check" />
            บันทึกรูปและอัปเดตสถานะ
          </button>
        </div>
      </div>
    </div>
  );
}
