import { useEffect } from 'react';
import type { ApiIncidentSummary } from '../../../services/incidentApi';
import { dateTime, incidentStatusMeta } from './format';

/** Chooses which incident the page shows. Defaults to the newest one still running (or the newest at all). */
export function IncidentPicker({ items, value, onChange }: { items: ApiIncidentSummary[]; value: string | undefined; onChange: (id: string) => void }) {
  useEffect(() => {
    if (value && items.some((i) => i.id === value)) return;
    const first = items.find((i) => i.group === 'active') ?? items[0];
    if (first) onChange(first.id);
  }, [items, value, onChange]);
  if (items.length === 0) return <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>ยังไม่มีเหตุการณ์</div>;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
      เหตุการณ์
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ height: 36, minWidth: 320, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontFamily: 'inherit', fontSize: 12.5 }}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.incidentNo} · {i.type ?? 'เหตุฉุกเฉิน'} · {dateTime(i.createdAt)} · {incidentStatusMeta(i.status).label}
          </option>
        ))}
      </select>
    </label>
  );
}
