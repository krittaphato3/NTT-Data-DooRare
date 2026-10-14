import { Icon } from '../../../components/common/icons';
import { ALERT_SUMMARY, SUMMARY_TONE } from '../data/stockAlerts';
import type { SummaryTone } from '../data/stockAlerts';

/** Count colour per card tone (kept off the shared KPI palette so the mood reads at a glance). */
const NUM_COLOR: Record<SummaryTone, string> = {
  crit: '#B91C1C',
  warn: '#92400E',
  blue: '#1E40AF',
  grey: '#475569',
  teal: '#115E59',
};

/**
 * Five summary cards above the queue: the four `alert_type` counts plus the
 * near-expiry cross-reference (UI-07). Informational only — filters live in the toolbar.
 */
export function StockAlertSummary() {
  return (
    <section aria-label="สรุปการแจ้งเตือน / Alert summary" className="sa-cards" data-part="stock-alert-summary">
      {ALERT_SUMMARY.map((c) => {
        const tone = SUMMARY_TONE[c.tone];
        const body = (
          <>
            <div className="sa-card-top">
              <span className="sa-card-title">
                {c.labelTh}
                <span className="en">{c.labelEn}</span>
              </span>
              <span className="sev" style={{ width: 32, height: 32, background: tone.bg, color: tone.fg }} aria-hidden="true">
                <Icon name={c.icon} />
              </span>
            </div>
            <div className="num sa-card-num" style={{ color: NUM_COLOR[c.tone] }}>{c.count}</div>
            <div className="sa-card-sub">
              {c.subTh}
              <span className="en">{c.subEn}</span>
            </div>
          </>
        );
        return c.href ? (
          <a key={c.key} className="card sa-card" href={c.href} onClick={(e) => e.preventDefault()}>
            {body}
          </a>
        ) : (
          <div key={c.key} className="card sa-card">
            {body}
          </div>
        );
      })}
    </section>
  );
}
