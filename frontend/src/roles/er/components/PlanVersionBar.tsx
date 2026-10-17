import { INCIDENT_HEADER } from '../data/incident';

/** Plan version / approver line under the incident card. */
export function PlanVersionBar() {
  return (
    <div
      style={{
        background: '#f1f5f9',
        borderRadius: 8,
        padding: '8px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 11.5,
        color: '#475569',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <div>
        <span
          style={{
            background: '#e2e8f0',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'Inter, monospace',
            fontWeight: 600,
            color: '#0f2a5c',
            marginRight: 6,
          }}
        >
          {INCIDENT_HEADER.versionHistory.version} · {INCIDENT_HEADER.versionHistory.time}
        </span>
        {INCIDENT_HEADER.versionHistory.summary}
      </div>
      <div style={{ color: '#64748b' }}>{INCIDENT_HEADER.versionHistory.approver}</div>
    </div>
  );
}
