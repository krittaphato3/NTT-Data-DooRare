import { Icon } from '../../../components/common/icons';
import { FEATURE_META, INBOX_STATUS_META } from '../data/inbox';
import type { InboxFeature, InboxStatus } from '../data/inbox';

export function FeatureBadge({ feature, small = false }: { feature: InboxFeature; small?: boolean }) {
  const m = FEATURE_META[feature];
  return (
    <span className={`badge t-${m.tone}`} style={small ? { height: 18, fontSize: 11 } : undefined}>
      {m.label}
    </span>
  );
}

export function InboxStatusBadge({ status }: { status: InboxStatus }) {
  const m = INBOX_STATUS_META[status];
  return (
    <span className={`badge t-${m.tone}`}>
      <Icon name={m.icon} className="ic14" />
      {m.label}
    </span>
  );
}
