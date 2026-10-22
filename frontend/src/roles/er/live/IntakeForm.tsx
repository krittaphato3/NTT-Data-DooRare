import type { TriageLevel } from '../../../services/incidentApi';
import { TRIAGE } from './format';

export interface IntakeState {
  type: string;
  location: string;
  description: string;
  counts: Record<TriageLevel, string>;
  /** ETA from the rescue unit, minutes from now. Empty = not known. */
  eta: string;
  unsure: boolean;
}

export const EMPTY_INTAKE: IntakeState = {
  type: '',
  location: '',
  description: '',
  counts: { RED: '0', YELLOW: '0', GREEN: '0', BLACK: '0', UNKNOWN: '0' },
  eta: '',
  unsure: false,
};

export const INCIDENT_TYPES = ['รถโดยสาร / อุบัติเหตุจราจรหมู่', 'ไฟไหม้โรงงาน', 'สารเคมีรั่วไหล', 'อาคารถล่ม', 'เหตุยิง/ทำร้ายหมู่', 'อุทกภัย / ดินถล่ม', 'อื่น ๆ'];

export const countsOf = (v: IntakeState): Record<TriageLevel, number> => ({
  RED: Number(v.counts.RED) || 0,
  YELLOW: Number(v.counts.YELLOW) || 0,
  GREEN: Number(v.counts.GREEN) || 0,
  BLACK: Number(v.counts.BLACK) || 0,
  UNKNOWN: Number(v.counts.UNKNOWN) || 0,
});

export const intakeTotal = (v: IntakeState): number => Object.values(countsOf(v)).reduce((a, b) => a + b, 0);

const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 } as const;
const input = { width: '100%', height: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 10px', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' } as const;

/** Incident intake (UI-11): type, place, patients per triage level, ETA. Controlled. */
export function LiveIntakeForm({ value, onChange, disabled }: { value: IntakeState; onChange: (v: IntakeState) => void; disabled?: boolean }) {
  const set = <K extends keyof IntakeState>(k: K, v: IntakeState[K]) => onChange({ ...value, [k]: v });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div>
          <label style={label} htmlFor="in-type">ประเภทเหตุ <span style={{ color: '#dc2626' }}>*</span></label>
          <input id="in-type" list="in-types" style={input} value={value.type} disabled={disabled} placeholder="เลือกหรือพิมพ์ประเภทเหตุ" onChange={(e) => set('type', e.target.value)} />
          <datalist id="in-types">
            {INCIDENT_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <label style={label} htmlFor="in-loc">สถานที่เกิดเหตุ</label>
          <input id="in-loc" style={input} value={value.location} disabled={disabled} onChange={(e) => set('location', e.target.value)} />
        </div>
      </div>
      <div>
        <label style={label} htmlFor="in-desc">รายละเอียด</label>
        <textarea id="in-desc" rows={2} value={value.description} disabled={disabled} onChange={(e) => set('description', e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
      <div>
        <div style={{ ...label, marginBottom: 6 }}>จำนวนผู้ป่วยตามระดับคัดแยก <span style={{ fontWeight: 400, color: '#64748b' }}>(ไม่ต้องใส่ชื่อผู้ป่วย)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
          {TRIAGE.map((t) => (
            <div key={t.key} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <label htmlFor={`in-${t.key}`} style={{ display: 'block', fontSize: 11, fontWeight: 600, color: t.color, marginBottom: 4 }}>{t.label}</label>
              <input
                id={`in-${t.key}`}
                type="number"
                min={0}
                value={value.counts[t.key]}
                disabled={disabled}
                onChange={(e) => set('counts', { ...value.counts, [t.key]: e.target.value })}
                style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: t.color, border: `1px solid ${t.border}`, borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              {t.key === 'UNKNOWN' && <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 4, lineHeight: '13px' }}>ยังไม่ทราบจำนวนหรือระดับที่ชัดเจน</div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div>
          <label style={label} htmlFor="in-eta">ETA จากหน่วยกู้ภัย (นาที จากนี้)</label>
          <input id="in-eta" type="number" min={1} style={input} value={value.eta} disabled={disabled} onChange={(e) => set('eta', e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={value.unsure} disabled={disabled} onChange={(e) => set('unsure', e.target.checked)} style={{ accentColor: '#2563eb' }} />
            <span>ไม่แน่ใจ (ถ้ามีเวลาเดินทางจริงจะใช้ค่าที่น้อยกว่า)</span>
          </label>
        </div>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: '#92400e', lineHeight: '17px' }}>
          ระบบนี้ยังไม่ต่อบริการเส้นทางจริง จึงไม่คำนวณเวลาเดินทางเอง ถ้าไม่ใส่ ETA ระบบจะแจ้งเตือน “ไม่สามารถการันตี ETA — ใช้วิทยุสื่อสาร” และไม่ประมาณตัวเลขให้ (F-26)
        </div>
      </div>
    </div>
  );
}
