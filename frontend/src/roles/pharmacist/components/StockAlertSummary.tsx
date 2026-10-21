import { ALERT_SUMMARY, SUMMARY_ACCENT } from '../data/stockAlerts';
import type { SummaryCard } from '../data/stockAlerts';

/**
 * Five summary cards above the queue: the four `alert_type` counts plus the
 * near-expiry cross-reference (UI-07). Informational only — filters live in the toolbar.
 *
 * Design: a bold Thai title followed by the code in small uppercase muted text
 * (rendered as two elements so they never touch), and a left accent border
 * instead of an icon tile. No English gloss is rendered on screen.
 */
export function StockAlertSummary({ cards = ALERT_SUMMARY }: { cards?: SummaryCard[] }) {
  return (
    <section aria-label="สรุปการแจ้งเตือน" className="sa-cards" data-part="stock-alert-summary">
      {cards.map((c) => {
        const body = (
          <>
            <div className="sa-card-head">
              <span className="sa-card-title">{c.labelTh}</span>
              {c.code && <span className="sa-card-code">{c.code}</span>}
            </div>
            <div className="num sa-card-num">{c.count}</div>
            <div className="sa-card-sub">{c.subTh}</div>
          </>
        );
        const accent = { borderLeft: `4px solid ${SUMMARY_ACCENT[c.tone]}` };
        return c.href ? (
          <a key={c.key} className="card sa-card" href={c.href} style={accent} onClick={(e) => e.preventDefault()}>
            {body}
          </a>
        ) : (
          <div key={c.key} className="card sa-card" style={accent}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
