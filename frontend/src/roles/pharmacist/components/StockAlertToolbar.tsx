import { Icon } from '../../../components/common/icons';
import { ALERT_TABS, SEVERITY_FILTERS, SORT_OPTIONS, VED_FILTERS } from '../data/stockAlerts';
import type { AlertTabKey, Severity, SortMode, Ved } from '../data/stockAlerts';

interface StockAlertToolbarProps {
  tab: AlertTabKey;
  onTab: (tab: AlertTabKey) => void;
  /** Row count per tab key, rendered in the tab bubble. */
  tabCounts: Record<AlertTabKey, number>;
  search: string;
  onSearch: (v: string) => void;
  severity: 'all' | Severity;
  onSeverity: (v: 'all' | Severity) => void;
  /** Severity bubble counts for the active tab. */
  severityCounts: Record<'all' | Severity, number>;
  ved: Ved | null;
  onVed: (v: Ved | null) => void;
  sort: SortMode;
  onSort: (v: SortMode) => void;
}

/** Tabs + search/filter/sort bar for the alert queue (UI-02). */
export function StockAlertToolbar({
  tab,
  onTab,
  tabCounts,
  search,
  onSearch,
  severity,
  onSeverity,
  severityCounts,
  ved,
  onVed,
  sort,
  onSort,
}: StockAlertToolbarProps) {
  return (
    <div data-part="stock-alert-filters">
      <div className="sa-tabs" role="tablist" aria-label="มุมมองการแจ้งเตือน">
        {ALERT_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={`tab ${tab === t.key ? 'tab-on' : ''}`}
            aria-selected={tab === t.key ? 'true' : 'false'}
            onClick={() => onTab(t.key)}
          >
            {t.labelTh} <span className="cnt">{tabCounts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="sa-toolbar">
        <label className="sa-search">
          <Icon name="search" className="ic14" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="ชื่อยา / รหัส HIS"
            aria-label="ค้นหายา / รหัส HIS"
          />
        </label>

        <div className="sa-chips" role="group" aria-label="กรองตามระดับความเร่งด่วน">
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`sa-chip ${severity === f.key ? 'sa-chip-on' : ''}`}
              aria-pressed={severity === f.key}
              onClick={() => onSeverity(f.key)}
            >
              {f.labelTh}
              <span className="cnt">{severityCounts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="sa-chips" role="group" aria-label="กรองตาม VED">
          {VED_FILTERS.map((v) => (
            <button
              key={v}
              type="button"
              className={`sa-chip sa-ved-chip ${ved === v ? 'sa-chip-on' : ''}`}
              aria-pressed={ved === v}
              title={v === 'V' ? 'Vital' : v === 'E' ? 'Essential' : 'Desirable'}
              onClick={() => onVed(ved === v ? null : v)}
            >
              {v}
            </button>
          ))}
        </div>

        <span style={{ flex: '1 1 0' }} />

        <label className="sa-sort-label">
          <span className="srt">เรียงตาม</span>
          <select className="sa-sort" value={sort} onChange={(e) => onSort(e.target.value as SortMode)} aria-label="เรียงลำดับรายการ">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
