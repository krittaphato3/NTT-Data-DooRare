import { INCIDENT_LIST } from '../data/incident';

/** Incident selector pills (open / summarised / cancelled). */
export function IncidentPills() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {INCIDENT_LIST.map((inc) => (
        <div
          key={inc.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 12.5,
            fontWeight: inc.active ? 600 : 400,
            background: inc.active ? '#ffffff' : '#f8fafc',
            border: inc.active ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            color: inc.active ? '#0f2a5c' : '#64748b',
            boxShadow: inc.active ? '0 1px 3px rgba(37,99,235,0.1)' : 'none',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontFamily: 'Inter, monospace', fontWeight: 600 }}>{inc.id}</span>
          <span className={`badge ${inc.statusCls}`} style={{ height: 18, fontSize: 11, padding: '0 6px' }}>
            {inc.status}
          </span>
          <span>{inc.label}</span>
        </div>
      ))}
    </div>
  );
}
