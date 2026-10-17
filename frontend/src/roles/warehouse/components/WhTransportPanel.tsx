import { Icon } from '../../../components/common/icons';
import { STATUS_ROWS, transportStats } from '../data/dashboard';
import { TONE_COLORS } from '../data/tones';
import { WhCta } from './WhCta';

/** Transport status (SM-6) breakdown for the last 7 days. */
export function WhTransportPanel() {
  const t = transportStats();
  return (
    <div className="card cardpad" data-part="transport-status" style={{ flex: '2 1 340px', minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600, color: '#0F2A5C' }}>
        สถานะการขนส่ง <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ Transport</span>
      </h2>
      <div style={{ fontSize: 12, lineHeight: '16px', margin: '2px 0 8px' }}>
        SM-6 · 7 วันล่าสุด · ทั้งหมด <span className="num">{t.total}</span> งาน
      </div>
      <div>
        {STATUS_ROWS.map((s) => {
          const n = t.byStatus(s.code);
          const [bg, fg] = TONE_COLORS[s.tone];
          return (
            <div key={s.code} className="wh-stat">
              <span className="wh-stat-ic" style={{ background: bg, color: fg }}>
                <Icon name={s.icon} className="ic14" />
              </span>
              <span className="wh-stat-label">
                {s.label}
                <span className="code" style={{ display: 'block', fontSize: 10.5, lineHeight: '14px' }}>{s.code}</span>
              </span>
              <span className="num wh-stat-n">{n}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
        {t.pendingSync > 0 ? (
          <span className="badge t-amber">
            <Icon name="sync" className="ic12" />
            รอซิงก์ {t.pendingSync}
          </span>
        ) : (
          <span />
        )}
        <WhCta page="transport" label="ดูทั้งหมด" />
      </div>
    </div>
  );
}
