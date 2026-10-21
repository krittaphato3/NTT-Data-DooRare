/** Rows of the dashboard "request status" panel built from the live borrow requests (ours) and the lender queue (asked of us). */
import type { BorrowRequest as OwnRequest } from './borrow';
import type { ReqRow } from './dashboard';
import type { BorrowRequest as LenderRow } from './lender';

const UG = { CRITICAL: { ug: 'critical', ugLabel: 'เร่งด่วนมาก' }, URGENT: { ug: 'urgent', ugLabel: 'เร่งด่วน' }, NORMAL: { ug: 'normal', ugLabel: 'ปกติ' } } as const;
const ST_TH: Record<ReqRow['st'], [string, string]> = {
  pending: ['รอดำเนินการ', 'Pending'], approved: ['อนุมัติแล้ว', 'Approved'], transit: ['กำลังจัดส่ง', 'In Transit'], delivered: ['ส่งถึงแล้ว', 'Delivered'], rejected: ['ปฏิเสธ/ยกเลิก', 'Rejected'], timeout: ['หมดเวลา/ส่งต่อ', 'Timeout'],
};
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });

/** Our request ("คำขอที่ฉันขอ"). */
export function ownRequestToRow(r: OwnRequest, me: string): ReqRow {
  const st: ReqRow['st'] =
    r.status === 'PENDING_APPROVAL' || r.status === 'DRAFT' ? 'pending'
    : r.status === 'FULFILLED' ? 'delivered'
    : r.status === 'CANCELLED' || r.status === 'CLOSED_UNFULFILLED' ? 'rejected'
    : r.status === 'ESCALATED' ? 'timeout'
    : 'approved';
  const [stTh, stEn] = ST_TH[st];
  return {
    id: r.id,
    drug: r.drug,
    qty: n(r.qty),
    unit: r.unit,
    from: r.lender[r.lender.length - 1] ?? '—',
    to: me,
    ...UG[r.urgency],
    st,
    stTh,
    stEn,
    ...(r.countdownSec !== undefined ? { secs: r.countdownSec } : {}),
    note: r.note,
    action: r.action === 'approve' ? 'ตรวจและอนุมัติ' : r.action === 'addLender' ? 'เพิ่มผู้ให้ยืม' : 'ดูรายละเอียด',
    actionPrimary: r.action === 'approve' || r.action === 'addLender',
  };
}

/** A request asked of us ("คำขอที่ขอจากเรา"). */
export function lenderRowToRow(r: LenderRow, me: string): ReqRow {
  const st: ReqRow['st'] =
    r.status === 'waiting' ? 'pending'
    : r.status === 'accepted' || r.status === 'partial' ? 'approved'
    : r.status === 'loaded' || r.status === 'in_transit' ? 'transit'
    : r.status === 'received' ? 'delivered'
    : r.status === 'timeout' ? 'timeout'
    : 'rejected';
  const [stTh, stEn] = ST_TH[st];
  const ug = r.urgency === 'critical' ? UG.CRITICAL : r.urgency === 'urgent' ? UG.URGENT : UG.NORMAL;
  return {
    id: r.id,
    drug: r.drug,
    qty: n(r.qty),
    unit: r.unit,
    from: me,
    to: r.requester,
    ...ug,
    st,
    stTh,
    stEn,
    ...(r.deadlineSecs !== undefined ? { secs: r.deadlineSecs } : {}),
    ...(st === 'transit' ? { step: r.status === 'loaded' ? 1 : 2 } : {}),
    note: r.status === 'waiting' ? (r.deadlineLabel ?? '') : '',
    action: st === 'pending' ? 'พิจารณา' : 'ดู',
    actionPrimary: st === 'pending',
  };
}
