import { useState } from 'react';
import { applyIncidentUpdate } from '../data/incidentStore';
import type { IncidentRecord } from '../data/incidentStore';
import type { IntakeValues } from '../data/intake';

type Counts = Pick<IntakeValues, 'red' | 'yellow' | 'green' | 'black' | 'unknown'>;

const FIELDS: { key: keyof Counts; label: string; color: string; bg: string; border: string }[] = [
  { key: 'red', label: 'แดง · วิกฤต', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  { key: 'yellow', label: 'เหลือง · เร่งด่วน', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  { key: 'green', label: 'เขียว · ไม่เร่งด่วน', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  { key: 'black', label: 'ดำ · เสียชีวิต', color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' },
  { key: 'unknown', label: 'ไม่ทราบระดับ', color: '#6d28d9', bg: '#f5f3ff', border: '#c4b5fd' },
];

/** Update an incident from the field: more injured, a level changed, a new report. Logged in the incident history. */
export function IncidentUpdateForm({ rec }: { rec: IncidentRecord }) {
  const [counts, setCounts] = useState<Counts>({ red: rec.intake.red, yellow: rec.intake.yellow, green: rec.intake.green, black: rec.intake.black, unknown: rec.intake.unknown });
  const [note, setNote] = useState('');

  const changed = FIELDS.some((f) => (Number(counts[f.key]) || 0) !== (Number(rec.intake[f.key]) || 0)) || note.trim() !== '';

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 2 }}>อัปเดตเหตุการณ์</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>แก้จำนวนตามที่กู้ภัยแจ้งเพิ่ม เช่น ผู้บาดเจ็บเพิ่ม หรือเปลี่ยนระดับ ระบบจะบันทึกประวัติและเตือนให้ Agent ประเมินแผนใหม่</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
        {FIELDS.map((f) => (
          <div key={f.key} style={{ background: f.bg, border: `1px solid ${f.border}`, borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: f.color, marginBottom: 4 }}>{f.label}</div>
            <input
              type="number"
              min={0}
              value={counts[f.key]}
              onChange={(e) => setCounts({ ...counts, [f.key]: e.target.value })}
              style={{ width: '100%', height: 32, textAlign: 'center', fontSize: 16, fontWeight: 700, color: f.color, border: `1px solid ${f.border}`, borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
        ))}
      </div>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="ข้อความเพิ่มเติม เช่น รถตู้อีกคันชน มีผู้บาดเจ็บเพิ่ม"
        style={{ width: '100%', marginTop: 10, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-p"
          disabled={!changed}
          onClick={() => {
            applyIncidentUpdate(rec.id, counts, note);
            setNote('');
          }}
        >
          บันทึกการอัปเดต
        </button>
      </div>
    </div>
  );
}
