import type { IntakeValues } from '../data/intake';

interface IntakeFieldsProps {
  value: IntakeValues;
  onChange: (next: IntakeValues) => void;
}

/** Incident intake fields (type, place, triage counts, ETA). Controlled; used by the modal and the flow page. */
export function IntakeFields({ value, onChange }: IntakeFieldsProps) {
  const set = <K extends keyof IntakeValues>(key: K, v: IntakeValues[K]) => onChange({ ...value, [key]: v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
            ประเภทเหตุ <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            value={value.category}
            onChange={(e) => set('category', e.target.value)}
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
            value={value.location}
            onChange={(e) => set('location', e.target.value)}
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
          value={value.detail}
          onChange={(e) => set('detail', e.target.value)}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>แดง · วิกฤต</div>
            <input
              type="number"
              value={value.red}
              onChange={(e) => set('red', e.target.value)}
              style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#b91c1c', border: '1px solid #f87171', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#b45309', marginBottom: 4 }}>เหลือง · เร่งด่วน</div>
            <input
              type="number"
              value={value.yellow}
              onChange={(e) => set('yellow', e.target.value)}
              style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#b45309', border: '1px solid #fbbf24', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>เขียว · ไม่เร่งด่วน</div>
            <input
              type="number"
              value={value.green}
              onChange={(e) => set('green', e.target.value)}
              style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#15803d', border: '1px solid #4ade80', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>ดำ · เสียชีวิต</div>
            <input
              type="number"
              value={value.black}
              onChange={(e) => set('black', e.target.value)}
              style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#334155', border: '1px solid #94a3b8', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6d28d9', marginBottom: 4 }}>ไม่ทราบระดับ</div>
            <input
              type="number"
              min={0}
              value={value.unknown}
              onChange={(e) => set('unknown', e.target.value)}
              style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#6d28d9', border: '1px solid #a78bfa', borderRadius: 6, fontFamily: 'inherit' }}
            />
            <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 4, lineHeight: '13px' }}>ยังไม่ทราบจำนวนหรือระดับที่ชัดเจน</div>
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
            value={value.eta}
            onChange={(e) => set('eta', e.target.value)}
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
              checked={value.unsureEta}
              onChange={(e) => set('unsureEta', e.target.checked)}
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
  );
}
