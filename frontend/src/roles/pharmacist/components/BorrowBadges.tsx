import { Icon } from '../../../components/common/icons';
import { groupMeta, groupOf, RETURN_META, STATUS_META, URGENCY_META } from '../data/borrow';
import type { BorrowStatus, ReturnState, Urgency } from '../data/borrow';

export function BorrowStatusBadge({ status }: { status: BorrowStatus }) {
  const g = groupMeta(groupOf(status));
  return (
    <span className={`badge t-${g.tone}`} title={status}>
      <Icon name={g.icon} className="ic14" />
      {STATUS_META[status].label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const m = URGENCY_META[urgency];
  return (
    <span className={`badge ${m.cls}`}>
      <Icon name={m.icon} className="ic14" />
      {m.label}
    </span>
  );
}

export function ReturnBadge({ state }: { state: ReturnState }) {
  const m = RETURN_META[state];
  return (
    <span className={`badge t-${m.tone}`} style={{ height: 20, fontSize: 11 }}>
      คืน: {m.label}
    </span>
  );
}
