import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { Scenario } from '../data/scenario';
import type { IncidentAccess } from '../data/access';

interface ScenarioBannersProps {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  access: IncidentAccess;
  /** S1 "ดูของที่ยังไม่ถึง": jump to the emergency-borrow view. */
  onViewBorrow: () => void;
}

/** Banners / cards for the special states S1 (patients arrived), S2 (no ETA), S3 (all refused), S5 (NO_RECIPE). */
export function ScenarioBanners({ scenario, setScenario, access, onViewBorrow }: ScenarioBannersProps) {
  const { mayWrite, writeHint } = access;
  const [customEta, setCustomEta] = useState('');

  return (
    <>
      {scenario === 's1' && (
        <div
          style={{
            background: '#b91c1c',
            color: '#ffffff',
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="tri" className="ic18" style={{ color: '#ffffff', flex: 'none' }} />
            <div style={{ fontSize: 13, lineHeight: '19px', fontWeight: 500 }}>
              ผู้ป่วยถึงโรงพยาบาลแล้ว · คำขอที่ยังไม่มีผู้ยืนยันใช้เวลารอ 1 นาที · ของที่ยืนยันแล้ว 2 รายการยังอยู่ระหว่างทาง (Intubation Set ถึง 19:44, Tranexamic acid ถึงราว 19:50)
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: '#ffffff',
              color: '#b91c1c',
              border: 'none',
              fontWeight: 700,
              fontSize: 12,
              padding: '6px 14px',
              flex: 'none',
            }}
            onClick={() => onViewBorrow()}
          >
            ดูของที่ยังไม่ถึง
          </button>
        </div>
      )}

      {/* ─── S2 Banner: หา ETA ไม่ได้ (ETA_UNAVAILABLE) ─────────────── */}
      {scenario === 's2' && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 500px' }}>
            <Icon name="tri" className="ic18" style={{ color: '#ea580c', flex: 'none' }} />
            <div style={{ fontSize: 12.5, color: '#9a3412', lineHeight: '18px' }}>
              ไม่สามารถคำนวณ ETA — ใช้วิทยุสื่อสาร · บริการเดินทางไม่ตอบกลับใน 3 วินาที (ลองซ้ำแล้ว) และไม่มี ETA จากหน่วยกู้ภัย · ระบบคิดผู้ให้ยืมตามเวลาเดินทางไม่ได้ ให้เลือกการโทรศัพท์/วิทยุ · เวลาเฉลี่ย 3/5 นาที/ครั้ง · แจ้ง ER และเภสัชกรแล้ว
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <span style={{ fontSize: 12, color: '#9a3412', fontWeight: 600 }}>ใส่ ETA เอง</span>
            <input
              type="text"
              placeholder=""
              value={customEta}
              disabled={!mayWrite}
              onChange={(e) => setCustomEta(e.target.value)}
              style={{
                width: 50,
                height: 30,
                border: '1px solid #fdba74',
                borderRadius: 6,
                padding: '0 6px',
                textAlign: 'center',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
            <span style={{ fontSize: 12, color: '#9a3412' }}>นาที</span>
            <button
              type="button"
              className="btn btn-p btn-sm"
              style={{ height: 30, fontSize: 12 }}
              disabled={!mayWrite}
              title={mayWrite ? undefined : writeHint}
              onClick={() => alert('บันทึก ETA แล้ว')}
            >
              บันทึก
            </button>
          </div>
        </div>
      )}

      {/* ─── S3 Card: ทุกโรงพยาบาลปฏิเสธ ──────────────────────────── */}
      {scenario === 's3' && (
        <div
          style={{
            background: '#ffffff',
            border: '1.5px solid #ef4444',
            borderRadius: 10,
            padding: '14px 18px',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
            ไม่มีโรงพยาบาลใดให้ Tranexamic acid ได้
          </div>
          <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 12 }}>
            รพ.พระสมุทรเจดีย์ฯ ปฏิเสธ · รพ.บางพลี หมดเวลา · รพ.บางเสาธง ปฏิเสธ · ยังขาด 8 AMP · แจ้งหัวหน้าเวร ER และเภสัชกรแล้ว
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-p btn-sm"
              disabled={!mayWrite}
              title={mayWrite ? undefined : writeHint}
            >
              เพิ่มผู้ให้ยืมเอง
            </button>
            <button type="button" className="btn btn-s btn-sm">
              โทรคลังเขต
            </button>
            <button
              type="button"
              className="btn btn-g btn-sm"
              onClick={() => setScenario('normal')}
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}

      {/* ─── S5 Card: ชุดที่ยังไม่มีสูตร (NO_RECIPE) ───────────────── */}
      {scenario === 's5' && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: 10,
            padding: '14px 18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Burn Kit</span>
              <span className="badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', height: 18, fontSize: 10.5 }}>
                NO_RECIPE
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>ประมาณการ 6</div>
          </div>
          <div style={{ fontSize: 12, color: '#78350f', lineHeight: '18px' }}>
            ยังไม่มีสูตรส่วนประกอบของชุดนี้ ระบบจัดกระจายและเช็คสต็อกให้ไม่ได้ · จัดการเองโดยเภสัชกร หรือเพิ่มสูตรในหน้าตั้งค่าชุด (ต้องนำเข้าเข้าทางการคลังอนุมัติ)
          </div>
        </div>
      )}
    </>
  );
}
