import { useState } from 'react';
import { Icon } from '../../../components/common/icons';

interface IntakeModalProps {
  /** ER writes the incident; other roles open it read-only (no save / merge buttons). */
  mayWrite: boolean;
  onClose: () => void;
  /** Called after "บันทึกเหตุและคำนวณแผน". */
  onSaved: () => void;
}

/** UI-11 intake form: record a mass-casualty incident (type, place, triage counts, ETA). */
export function IntakeModal({ mayWrite, onClose, onSaved }: IntakeModalProps) {
  const [intakeCategory, setIntakeCategory] = useState('รถโดยสาร / อุบัติเหตุจราจรหมู่');
  const [intakeLocation, setIntakeLocation] = useState('ถ.เทพารักษ์ กม.12 ขาออก');
  const [intakeDetail, setIntakeDetail] = useState('รถตู้ชนท้ายรถบัสที่คว่ำ มีผู้บาดเจ็บเพิ่ม');
  const [triageRed, setTriageRed] = useState('2');
  const [triageYellow, setTriageYellow] = useState('3');
  const [triageGreen, setTriageGreen] = useState('4');
  const [triageBlack, setTriageBlack] = useState('0');
  const [intakeEta, setIntakeEta] = useState('20');
  const [unsureEta, setUnsureEta] = useState(true);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={() => onClose()}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: 12,
          padding: '20px 24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f2a5c' }}>
              แจ้งเหตุฉุกเฉินหมู่
            </h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              บันทึกจำนวนตามระดับคัดแยกเท่านั้น ไม่ต้องใส่ชื่อผู้ป่วย
            </div>
          </div>
          <button
            type="button"
            className="icbtn"
            onClick={() => onClose()}
          >
            <Icon name="x" className="ic14" />
          </button>
        </div>

        {/* Duplicate Detection Alert */}
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 12, color: '#92400e', lineHeight: '18px', marginBottom: 8 }}>
            อาจเป็นเหตุเดียวกับ INC-2026-000015 · แจ้งเมื่อ 6 นาทีที่ก่อน ห่างจากจุดนี้ 180 ม. (เกณฑ์ 10 นาที / 500 ม.) · รถโดยสารคว่ำ ถ.เทพารักษ์ กม.12
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {mayWrite && (
              <button
                type="button"
                className="btn btn-p btn-sm"
                style={{ fontSize: 11.5 }}
                onClick={() => onClose()}
              >
                รวมกับเหตุเดิม (อัปเดตจำนวน)
              </button>
            )}
            <button
              type="button"
              className="btn btn-s btn-sm"
              style={{ fontSize: 11.5 }}
            >
              เป็นเหตุใหม่
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                ประเภทเหตุ <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={intakeCategory}
                onChange={(e) => setIntakeCategory(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0 8px',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                }}
              >
                <option value="รถโดยสาร / อุบัติเหตุจราจรหมู่">รถโดยสาร / อุบัติเหตุจราจรหมู่</option>
                <option value="ไฟไหม้โรงงาน">ไฟไหม้โรงงาน</option>
                <option value="สารเคมีรั่วไหล">สารเคมีรั่วไหล</option>
                <option value="อาคารถล่ม">อาคารถล่ม</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                สถานที่เกิดเหตุ <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                value={intakeLocation}
                onChange={(e) => setIntakeLocation(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0 10px',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              รายละเอียด
            </label>
            <textarea
              rows={2}
              value={intakeDetail}
              onChange={(e) => setIntakeDetail(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12.5,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Triage Inputs */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              จำนวนผู้ป่วยตามระดับคัดแยก
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>แดง · วิกฤต</div>
                <input
                  type="number"
                  value={triageRed}
                  onChange={(e) => setTriageRed(e.target.value)}
                  style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#b91c1c', border: '1px solid #f87171', borderRadius: 6, fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#b45309', marginBottom: 4 }}>เหลือง · เร่งด่วน</div>
                <input
                  type="number"
                  value={triageYellow}
                  onChange={(e) => setTriageYellow(e.target.value)}
                  style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#b45309', border: '1px solid #fbbf24', borderRadius: 6, fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>เขียว · ไม่เร่งด่วน</div>
                <input
                  type="number"
                  value={triageGreen}
                  onChange={(e) => setTriageGreen(e.target.value)}
                  style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#15803d', border: '1px solid #4ade80', borderRadius: 6, fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>ดำ · เสียชีวิต</div>
                <input
                  type="number"
                  value={triageBlack}
                  onChange={(e) => setTriageBlack(e.target.value)}
                  style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#334155', border: '1px solid #94a3b8', borderRadius: 6, fontFamily: 'inherit' }}
                />
              </div>
            </div>
          </div>

          {/* ETA Comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                ETA จากหน่วยกู้ภัย (นาที)
              </label>
              <input
                type="number"
                value={intakeEta}
                onChange={(e) => setIntakeEta(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={unsureEta}
                  onChange={(e) => setUnsureEta(e.target.checked)}
                  style={{ accentColor: '#2563eb' }}
                />
                <span>ไม่แน่ใจ (ให้ระบบเทียบกับเดินทางจริง)</span>
              </label>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2a5c', lineHeight: '17px' }}>
                เดินทางจริงตอนนี้ 22 นาที (Amazon Location Service - เดินรถเหตุจริง)
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                ไม่แน่ใจ → ใช้ค่าที่น้อยกว่า = 20 นาที
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
          <button
            type="button"
            className="btn btn-s"
            onClick={() => onClose()}
          >
            ยกเลิก
          </button>
          {mayWrite && (
            <button
              type="button"
              className="btn btn-p"
              style={{ background: '#b91c1c', border: 'none', fontWeight: 600 }}
              onClick={() => {
                onSaved();
              }}
            >
              บันทึกเหตุและคำนวณแผน
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
