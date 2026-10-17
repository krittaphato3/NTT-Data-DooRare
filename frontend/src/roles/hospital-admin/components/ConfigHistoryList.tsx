import { Icon } from '../../../components/common/icons';
import { ROLE_LABEL } from '../../../lib/rbac';
import type { ConfigChange } from '../data/config';
import { SCOPE_META } from '../data/config';

interface ConfigHistoryListProps {
  items: ConfigChange[];
  /** When set, only this key's changes are listed (per-row history). */
  keyFilter?: string;
}

/** Audited change history (SEC-003): key, scope, old → new, actor, time, reason. */
export function ConfigHistoryList({ items, keyFilter }: ConfigHistoryListProps) {
  const rows = keyFilter ? items.filter((c) => c.key === keyFilter) : items;

  if (rows.length === 0) {
    return (
      <div className="ha-state">
        <Icon name="history" className="ic20" />
        <div className="ha-state-title">ยังไม่มีประวัติการแก้ไข</div>
        <div className="ha-state-text">
          {keyFilter ? 'คีย์นี้ยังไม่เคยถูกแก้ไขจากค่าเริ่มต้น' : 'ยังไม่มีการแก้ไขค่าตั้งต้นของโรงพยาบาล'}
        </div>
      </div>
    );
  }

  return (
    <ol className="ha-hist">
      {rows.map((c) => (
        <li key={`${c.at}-${c.key}`}>
          <span className="num" style={{ minWidth: 96, color: '#0F2A5C' }}>
            {c.at}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span className="code">{c.key}</span>
              <span className={`badge ${SCOPE_META[c.scope].tone} ha-badge`}>{SCOPE_META[c.scope].labelTh}</span>
            </span>
            <span style={{ display: 'block', fontSize: 13, color: '#0F2A5C' }}>
              <span className="num">{c.from}</span> → <span className="num" style={{ fontWeight: 600 }}>{c.to}</span>
            </span>
            <span style={{ display: 'block', fontSize: 12.5, lineHeight: '18px' }}>{c.reason}</span>
            <span className="ha-hint">
              {c.actor} · {ROLE_LABEL[c.role]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
