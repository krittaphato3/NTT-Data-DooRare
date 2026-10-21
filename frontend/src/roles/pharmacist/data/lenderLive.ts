/** Maps `GET /lender-queue` onto the UI-06 shapes (request row, FEFO lot options, lendable-stock box). */
import { fmtThaiDate, fmtThaiTime } from '../../warehouse/data/transportLive';
import type { ApiLenderItem, ApiLegStatus, ApiUrgency } from '../../../services/borrowApi';
import type { BorrowRequest, BRStatus, BRUrgency, LendableStock, LotOption } from './lender';

const STATUS: Record<ApiLegStatus, BRStatus> = {
  PENDING: 'waiting', SENT: 'waiting', ACCEPTED: 'accepted', PARTIAL: 'partial', LOADED: 'loaded', IN_TRANSIT: 'in_transit', RECEIVED: 'accepted',
  REJECTED: 'declined', TIMED_OUT: 'timeout', CANCELLED: 'declined',
};
const URGENCY: Record<ApiUrgency, { key: BRUrgency; label: string }> = {
  VERY_URGENT: { key: 'critical', label: 'เร่งด่วนมาก' },
  URGENT: { key: 'urgent', label: 'เร่งด่วน' },
  NORMAL: { key: 'normal', label: 'ปกติ' },
};
const VED_LABEL = { V: 'Vital', E: 'Essential', D: 'Desirable' } as const;
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });

export interface LenderView {
  request: BorrowRequest;
  lots: LotOption[];
  stock: LendableStock | null;
}

export function lenderItemToView(i: ApiLenderItem, now = Date.now()): LenderView {
  const u = URGENCY[i.urgency];
  const sent = i.sentAt ? new Date(i.sentAt).getTime() : null;
  const deadline = i.deadlineAt ? new Date(i.deadlineAt).getTime() : null;
  const pct = sent && deadline && deadline > sent ? Math.min(100, Math.max(0, Math.round(((now - sent) / (deadline - sent)) * 100))) : undefined;
  const lots: LotOption[] = (i.lots ?? []).map((l) => ({
    lotId: l.lotNo,
    uuid: l.lotId,
    expDate: fmtThaiDate(l.expiryDate),
    daysLeft: l.daysLeft,
    qty: l.free,
    fefoEligible: l.lendable,
    note: l.lendable ? 'FEFO · อายุ > 180 วัน' : 'อายุ ≤ 180 วัน · ให้ยืมไม่ได้',
  }));
  const onHand = (i.lots ?? []).reduce((s, l) => s + l.free, 0);
  const stock: LendableStock | null =
    i.lendable === undefined
      ? null
      : {
          current: onHand,
          maxLendable: i.lendable,
          afterLend: Math.max(0, onHand - i.qtyAsked),
          explanation: `max(0, ล็อต > 180 วัน ${n(i.usableForLending ?? 0)} − Total Target ${n(i.ownTarget ?? 0)}) = ${n(i.lendable)}`,
        };
  return {
    request: {
      id: i.requestNo,
      legId: i.id,
      drug: i.drug.name,
      ved: 'E',
      vedLabel: VED_LABEL.E,
      qty: i.qtyAsked,
      unit: i.drug.baseUnit,
      requester: i.borrower.name,
      receivedDate: fmtThaiTime(i.sentAt),
      urgency: u.key,
      urgencyLabel: u.label,
      status: STATUS[i.status],
      trigger: 'STOCK_ALERT',
      round: i.round,
      ...(i.remainingSec !== null ? { deadlineSecs: i.remainingSec, deadlineLabel: `ตอบภายใน ${fmtThaiTime(i.deadlineAt)} น.` } : {}),
      ...(pct !== undefined && i.status === 'SENT' ? { deadlinePct: pct } : {}),
      message: i.messageText ?? '',
    },
    lots,
    stock,
  };
}
