/** Maps `GET /borrow-requests` onto the BorrowRequest shape the UI-05 screen renders. */
import { fmtThaiTime } from '../../warehouse/data/transportLive';
import type { ApiBorrowLeg, ApiBorrowRequest, ApiUrgency } from '../../../services/borrowApi';
import type { ApiReturnObligation } from '../../../services/returnsApi';
import type { BorrowLeg, BorrowRequest, LegState, ReturnState, Urgency } from './borrow';

const URGENCY: Record<ApiUrgency, Urgency> = { VERY_URGENT: 'CRITICAL', URGENT: 'URGENT', NORMAL: 'NORMAL' };
const LEG: Record<ApiBorrowLeg['status'], LegState> = {
  PENDING: 'NOT_SENT', SENT: 'WAITING', ACCEPTED: 'ACCEPTED', PARTIAL: 'ACCEPTED', LOADED: 'ACCEPTED', IN_TRANSIT: 'ACCEPTED', RECEIVED: 'ACCEPTED',
  REJECTED: 'DECLINED', TIMED_OUT: 'TIMED_OUT', CANCELLED: 'NOT_SENT',
};
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });
const hh = (iso: string | null) => (iso ? fmtThaiTime(iso) : '');

function legDetail(l: ApiBorrowLeg, unit: string): string {
  const base = `รอบ ${l.round} · ขอ ${n(l.qtyAsked)} ${unit}`;
  switch (l.status) {
    case 'SENT': return `${base} · ส่ง ${hh(l.sentAt)}${l.remindedAt ? ` · เตือน 50% ${hh(l.remindedAt)} ✓` : ''} · หมดเวลา ${hh(l.deadlineAt)}`;
    case 'ACCEPTED': return `${base} · ตอบรับ ${n(l.qtyAccepted ?? 0)} · ${hh(l.respondedAt)}`;
    case 'PARTIAL': return `${base} · ตอบรับบางส่วน ${n(l.qtyAccepted ?? 0)} · ${hh(l.respondedAt)}`;
    case 'LOADED': case 'IN_TRANSIT': return `${base} · ตอบรับ ${n(l.qtyAccepted ?? 0)} · กำลังขนส่ง`;
    case 'RECEIVED': return `${base} · ตอบรับ ${n(l.qtyAccepted ?? 0)} · รับแล้ว ${n(l.qtyReceived ?? 0)}`;
    case 'REJECTED': return `${base} · ปฏิเสธ ${hh(l.respondedAt)}${l.rejectReason ? ` · ${l.rejectReason}` : ''}`;
    case 'TIMED_OUT': return `${base} · หมดเวลา ${hh(l.deadlineAt)}`;
    case 'CANCELLED': return `${base} · ยกเลิก${l.rejectReason === 'STOP_RULE' ? ' (ได้ครบตามกฎหยุดแล้ว)' : ''}`;
    default: return base;
  }
}

function banner(r: ApiBorrowRequest, waiting: ApiBorrowLeg | undefined): { title: string; text: string } {
  const unit = r.drug.baseUnit;
  switch (r.status) {
    case 'DRAFT': return { title: 'ร่างคำขอ', text: 'ยังไม่ได้เสนอแผนผู้ให้ยืม' };
    case 'PENDING_APPROVAL': return { title: 'รอเภสัชกรอนุมัติก่อนส่ง', text: `ร่างข้อความถึงผู้ให้ยืมแล้ว · ${r.proposal?.parallel ? 'เร่งด่วนมาก ส่งพร้อมกันได้ ≤ 3 แห่ง' : 'ส่งทีละแห่ง'}` };
    case 'APPROVED': case 'IN_PROGRESS': case 'PARTIALLY_FULFILLED':
      return waiting
        ? { title: `รอ ${waiting.lender.name} ตอบ (รอบ ${waiting.round})`, text: `หมดเวลา ${hh(waiting.deadlineAt)} → ระบบส่งต่อลำดับถัดไปอัตโนมัติ${waiting.remindedAt ? ` · เตือน 50% แล้ว ${hh(waiting.remindedAt)}` : ''}` }
        : { title: 'ผู้ให้ยืมตอบรับแล้ว · รอการขนส่ง', text: `ยืนยันแล้ว ${n(r.stop?.effective ?? 0)} ${unit} จาก ${n(r.qtyRequested)}` };
    case 'ESCALATED': return { title: 'ลำดับผู้ให้ยืมหมดแล้ว · ส่งต่อผู้ดูแล', text: `ได้ ${n(r.stop?.effective ?? 0)} ${unit} · ยังขาด ${n(r.stop?.remaining ?? 0)} ${unit} · แจ้งผู้ดูแลแล้ว` };
    case 'FULFILLED': return { title: 'ได้ครบแล้ว', text: `รับครบ ${n(r.qtyFulfilled)} ${unit} · ต้องคืนเป็นยาตัวเดิมจำนวนเท่ากัน` };
    case 'CLOSED_UNFULFILLED': return { title: 'ปิด · ไม่ได้ยา', text: 'ผู้ดูแลปิดคำขอ' };
    case 'CANCELLED': return { title: 'ยกเลิก', text: r.reason ?? 'คำขอถูกยกเลิก' };
  }
}

/** Return state of a request from the obligations we owe for it (SM-7): overdue beats pending, all settled = returned. */
export function returnStateOf(requestNo: string, obligations: ApiReturnObligation[]): ReturnState | undefined {
  const mine = obligations.filter((o) => o.requestNo === requestNo);
  if (mine.length === 0) return undefined;
  if (mine.some((o) => o.status === 'OVERDUE' || (o.pastDue && ['OPEN', 'REMINDED'].includes(o.status)))) return 'OVERDUE';
  if (mine.every((o) => o.status === 'RETURNED' || o.status === 'WAIVED')) return 'RETURNED';
  return 'PENDING';
}

/** The pharmacist's note under the legs: what the lender-selection agent chose (AGT-F1), or why the rules were used. */
function agentNoteOf(r: ApiBorrowRequest): NonNullable<BorrowRequest['agentNote']> {
  const a = r.proposal?.agent;
  if (a?.status === 'OK' && a.summary) {
    return { code: 'F1_T2', text: `${a.summary}${a.priorityAfter.length ? ` · ถ้ารอบแรกไม่พอ ขอต่อ: ${a.priorityAfter.join(' → ')}` : ''} · เภสัชกรตรวจและอนุมัติก่อนส่ง`, model: a.model, confidence: a.confidence, status: 'OK' };
  }
  const why = a?.status === 'SKIPPED' ? 'ปิด Agent อยู่' : a?.flags.includes('NO_LLM_CONFIGURED') ? 'ยังไม่ได้ตั้งค่า LLM' : a ? 'Agent ตอบไม่ได้หรือไม่ผ่านการตรวจ' : 'ไม่ได้ใช้ Agent';
  return { code: 'F1_T2', text: `${why} — ใช้ลำดับตามคะแนน Si และข้อความแม่แบบ · เภสัชกรตรวจและอนุมัติก่อนส่ง`, status: a?.status ?? 'SKIPPED', model: a?.model ?? null };
}

export function borrowRequestToView(r: ApiBorrowRequest, now = Date.now(), returnState?: ReturnState): BorrowRequest {
  const unit = r.drug.baseUnit;
  const activeLegs = r.legs.filter((l) => l.status !== 'CANCELLED');
  const waiting = r.legs.find((l) => l.status === 'SENT');
  const proposed: BorrowLeg[] = (r.status === 'PENDING_APPROVAL' && r.proposal ? r.proposal.ladder : []).map((e) => ({
    hospital: e.name,
    si: e.si,
    state: 'NOT_SENT',
    detail: `${e.qtyPlanned > 0 ? `ลำดับ ${e.rank} · รอบแรก ขอ ${n(e.qtyPlanned)} ${unit}` : `ลำดับ ${e.rank} · ส่งต่อถ้ารอบแรกได้ไม่ครบ`}${e.rationale ? ` · Agent: ${e.rationale}` : ''}`,
  }));
  const legs: BorrowLeg[] = r.legs.length
    ? r.legs.map((l) => ({ hospital: l.lender.name, ...(l.si !== null ? { si: l.si } : {}), state: LEG[l.status], rawStatus: l.status, detail: legDetail(l, unit) }))
    : proposed;
  const stop = r.stop && r.status !== 'DRAFT'
    ? {
        got: r.stop.effective,
        target: r.stop.threshold,
        remaining: `คงต้องการ (borrow_remaining) ${n(r.stop.remaining)} ${unit} · ถ้าได้บางส่วน ระบบขอส่วนที่เหลือจากลำดับถัดไป`,
        ...(r.proposal ? { formula: `${r.proposal.need.ved === 'V' ? 'V: หยุดเมื่อได้ ≥ 90% ของรอบแรก' : 'E: หยุดเมื่อได้ ≥ ปริมาณใช้ปกติ'} = ${n(r.stop.threshold)}` } : {}),
      }
    : undefined;
  const firstSent = r.legs.filter((l) => l.round === 1);
  const sendMode = r.proposal ? (r.proposal.parallel ? 'ส่งพร้อมกัน ≤ 3 แห่ง' : 'ส่งทีละแห่ง') : firstSent.length > 1 ? `ส่งพร้อมกัน ${firstSent.length} แห่ง` : 'ส่งทีละแห่ง';
  const lender =
    activeLegs.length > 0
      ? [...new Set(activeLegs.map((l) => l.lender.name))].slice(0, 2)
      : r.proposal && r.proposal.ladder.length
        ? [`ลำดับ ${r.proposal.ladder.length} แห่ง · รอบแรก`, r.proposal.ladder[0].name]
        : ['—'];
  const age = Math.max(0, Math.floor((now - new Date(r.createdAt).getTime()) / 86_400_000));
  return {
    id: r.requestNo,
    uuid: r.id,
    version: r.version,
    context: r.context,
    createdAt: fmtThaiTime(r.createdAt, new Date(now)),
    daysAgo: age,
    ved: r.drug.ved ?? 'E',
    drug: r.drug.name,
    qty: r.qtyRequested,
    unit,
    lender,
    urgency: URGENCY[r.urgency],
    status: r.status,
    ...(returnState ? { returnState } : {}),
    ...(waiting?.remainingSec != null ? { countdownSec: waiting.remainingSec } : {}),
    ...(stop ? { stop } : {}),
    note: waiting ? `รอ ${waiting.lender.name} · ${legDetail(waiting, unit).split(' · ').slice(-1)[0]}` : r.status === 'ESCALATED' ? `ยังขาด ${n(r.stop?.remaining ?? 0)} · แจ้งผู้ดูแลแล้ว` : r.status === 'PENDING_APPROVAL' ? 'ร่างข้อความแล้ว · รออนุมัติ' : r.status === 'FULFILLED' ? `ครบ ${n(r.qtyFulfilled)}` : r.status === 'CANCELLED' ? (r.reason ?? 'ยกเลิก') : 'กำลังดำเนินการ',
    action: r.status === 'PENDING_APPROVAL' ? 'approve' : r.status === 'ESCALATED' && r.drug.kind !== 'KIT' ? 'addLender' : (returnState === 'PENDING' || returnState === 'OVERDUE') ? 'recordReturn' : 'detail',
    banner: banner(r, waiting),
    contextLabel: r.context === 'STOCK_ALERT' ? 'STOCK_ALERT · จากแจ้งเตือนสต็อก' : r.context === 'EMERGENCY' ? 'EMERGENCY · เหตุฉุกเฉิน' : 'MANUAL · สร้างเอง (UI-10)',
    firstRound: `${n(r.firstRoundQty ?? r.qtyRequested)} ${unit}${r.rValue !== null ? ` · R = ${r.rValue}` : ''}`,
    sendMode,
    createdBy: `${r.createdBy} · ${fmtThaiTime(r.createdAt, new Date(now))}`,
    ...(r.approvedBy ? { approvedBy: `${r.approvedBy} (PHARMACIST)` } : {}),
    legs,
    ...(r.drug.kind === 'KIT' ? { isKit: true } : {}),
    ...(r.status === 'PENDING_APPROVAL' ? { agentNote: agentNoteOf(r) } : {}),
  };
}
