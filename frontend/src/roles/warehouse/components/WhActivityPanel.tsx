import { AUDIT_HISTORY } from '../data/transport';
import { mockFallbackEnabled } from '../../../services/dataSource';
import type { HistoryRow } from '../data/useTransport';

/** Latest transport activity (reuses the audit history rows of the transport page). */
export function WhActivityPanel({ history }: { history?: HistoryRow[] }) {
  const rows = history ?? (mockFallbackEnabled() ? AUDIT_HISTORY : []);
  return (
    <div className="card cardpad" data-part="activity" style={{ flex: '1 1 380px', minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
        กิจกรรมล่าสุด <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Recent activity</span>
      </h2>
      <div style={{ marginTop: 8 }}>
        {rows.slice(0, 8).map((h) => (
          <div key={h.code + h.t} className="wh-act">
            <span className="num" style={{ fontSize: 12, color: '#0F2A5C' }}>{h.t}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#0F2A5C', fontWeight: 500 }}>{h.who}</span>
                <span className={`badge t-${h.tone}`} style={{ height: 18, fontSize: 11 }}>{h.role}</span>
              </span>
              <span style={{ display: 'block', fontSize: 12.5, lineHeight: '18px' }}>{h.text}</span>
              <span className="code" style={{ fontSize: 10.5 }}>{h.code}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
