import { Icon } from '../../../components/common/icons';
import { STATUS_META } from '../data/transport';
import type { TransportStatus } from '../data/transport';

export function StatusBadge({ status }: { status: TransportStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`badge t-${m.tone}`} title={status}>
      <Icon name={m.icon} className="ic14" />
      {m.label}
    </span>
  );
}
