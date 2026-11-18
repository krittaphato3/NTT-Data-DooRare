import { Icon } from '../../../components/common/icons';
import { groupMeta, groupOf, RETURN_META, STATUS_META, URGENCY_META } from '../data/borrow';
import type { BorrowStatus, ReturnState, Urgency } from '../data/borrow';

/** `kit`: an F3 kit request never needs a lender added by hand, so ESCALATED reads as a hand-over to the admin. */
/** `accepted`: a lender confirmed (same rule as the "ตอบรับแล้ว" tile), so the badge says so instead of "กำลังขอยืม". */
export function BorrowStatusBadge({ status, kit = false, accepted = false }: { status: BorrowStatus; kit?: boolean; accepted?: boolean }) {
  if (accepted && (status === 'APPROVED' || status === 'IN_PROGRESS')) {
    return (
      <span className="badge t-green" title={status}>
        <Icon name="checkc" className="ic14" />
        ตอบรับแล้ว · รอขนส่ง
      </span>
    );
  }
  const g = groupMeta(groupOf(status));
  return (
    <span className={`badge t-${g.tone}`} title={status}>
      <Icon name={g.icon} className="ic14" />
      {kit && status === 'ESCALATED' ? 'ส่งต่อผู้ดูแล' : STATUS_META[status].label}
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
