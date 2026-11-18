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

/** One line per asked lender: how much we asked, what they answered. The last segment is reused in the table note. */
function legDetail(l: ApiBorrowLeg, unit: string): string {
  const base = `ขอยืม ${n(l.qtyAsked)} ${unit}${l.round > 1 ? ' (ขอต่อเพราะแห่งก่อนหน้าไม่พอ)' : ''}`;
  const got = `ตอบรับ ${n(l.qtyAccepted ?? 0)} ${unit}`;
  switch (l.status) {
    case 'SENT': return `${base} · ส่ง ${hh(l.sentAt)}${l.remindedAt ? ` · เตือนแล้ว ${hh(l.remindedAt)}` : ''} · ต้องตอบภายใน ${hh(l.deadlineAt)}`;
    case 'ACCEPTED': return `${base} · ${got} · ${hh(l.respondedAt)}`;
    case 'PARTIAL': return `${base} · ให้ได้บางส่วน ${n(l.qtyAccepted ?? 0)} ${unit} · ${hh(l.respondedAt)}`;
    case 'LOADED': case 'IN_TRANSIT': return `${base} · ${got} · กำลังขนส่ง`;
    case 'RECEIVED': return `${base} · ${got} · รับของแล้ว ${n(l.qtyReceived ?? 0)} ${unit}`;
    case 'REJECTED': return `${base} · ปฏิเสธ ${hh(l.respondedAt)}${l.rejectReason ? ` · ${l.rejectReason}` : ''}`;
    case 'TIMED_OUT': return `${base} · ไม่ตอบภายใน ${hh(l.deadlineAt)}`;
    case 'CANCELLED': return `${base} · ยกเลิก${l.rejectReason === 'STOP_RULE' ? ' (ได้ครบแล้ว ไม่ต้องขอที่นี่)' : l.rejectReason === 'SKIPPED_BY_BORROWER' ? ' (ส่งต่อแห่งถัดไปแล้ว)' : ''}`;
    default: return base;
  }
}

function banner(r: ApiBorrowRequest, waiting: ApiBorrowLeg | undefined, waitingCount = waiting ? 1 : 0): { title: string; text: string } {
  const unit = r.drug.baseUnit;
  switch (r.status) {
    case 'DRAFT': return { title: 'ร่างคำขอ', text: 'ยังไม่ได้เสนอแผนผู้ให้ยืม' };
    case 'PENDING_APPROVAL': return { title: 'รอเภสัชกรอนุมัติก่อนส่ง', text: `ร่างข้อความถึงผู้ให้ยืมแล้ว` };
    case 'APPROVED': case 'IN_PROGRESS': case 'PARTIALLY_FULFILLED':
      return waiting
        ? waitingCount > 1
          ? { title: `รอ ${waitingCount} แห่งตอบพร้อมกัน`, text: `แห่งที่ไม่ตอบภายใน ${hh(waiting.deadlineAt)} ระบบจะขอแห่งถัดไปแทนให้เอง` }
          : { title: `รอ ${waiting.lender.name} ตอบ`, text: `ถ้าไม่ตอบภายใน ${hh(waiting.deadlineAt)} ระบบจะขอแห่งถัดไปให้เอง${waiting.remindedAt ? ` · เตือนแล้ว ${hh(waiting.remindedAt)}` : ''}` }
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
  const unit = r.drug.baseUnit;
  const ed = r.proposal?.edited;
  if (ed) {
    // the pharmacist changed the quantities: the agent's / rules' reasoning was about the old plan, so do not show it as current
    const now = (r.proposal?.ladder ?? []).filter((e) => e.qtyPlanned > 0).map((e) => `${e.name} ${n(e.qtyPlanned)} ${unit}`).join(', ');
    const was = ed.original.map((o) => `${o.name} ${n(o.qty)} ${unit}`).join(', ');
    return { code: 'F1_T2', text: `เภสัชกรแก้แผนเอง: ขอ ${now} · เดิม${a?.status === 'OK' ? ' Agent' : 'ระบบ'}เสนอ ${was} · ข้อความถึงผู้ให้ยืมร่างใหม่ตามจำนวนที่แก้แล้ว`, status: 'EDITED', model: a?.model ?? null };
  }
  if (a?.status === 'OK' && a.summary) {
    const nameOf = (code: string) => r.proposal?.ladder.find((e) => e.code === code)?.name ?? code;
    return { code: 'F1_T2', text: `${a.summary}${a.priorityAfter.length ? ` · ถ้าแห่งแรกไม่พอ ขอต่อ: ${a.priorityAfter.map(nameOf).join(' → ')}` : ''} · เภสัชกรตรวจและอนุมัติก่อนส่ง`, model: a.model, confidence: a.confidence, status: 'OK' };
  }
  return { code: 'F1_T2', text: ruleReason(r), status: a?.status ?? 'SKIPPED', model: a?.model ?? null };
}

/**
 * Without the agent: why the code ranked the lenders this way, written from the ladder's own numbers (lendable stock, transit
 * time, reliability score of F-14..F-18). Nothing is invented: every figure comes from the stored plan.
 */
function ruleReason(r: ApiBorrowRequest): string {
  const ladder = r.proposal?.ladder ?? [];
  const unit = r.drug.baseUnit;
  if (!ladder.length) return 'ไม่มีโรงพยาบาลที่ให้ยืมได้ตามเกณฑ์ · เภสัชกรตรวจก่อนดำเนินการต่อ';
  const first = ladder.filter((e) => e.qtyPlanned > 0);
  const rest = ladder.filter((e) => e.qtyPlanned <= 0);
  const why = (e: (typeof ladder)[number]) => {
    const parts = [
      e.lendable >= e.qtyPlanned ? `ให้ยืมได้ครบ ${n(e.qtyPlanned)} ${unit}` : `ให้ยืมได้ ${n(e.lendable)} ${unit}`,
      `เดินทาง ${n(Math.round(e.transitMin))} นาที`,
    ];
    if (e.parts.reliability >= 0.8) parts.push('ตอบรับตรงเวลาบ่อย');
    return parts.join(' ');
  };
  const lead = first.length
    ? first.length === 1
      ? `เลือก ${first[0].name} เป็นอันดับ 1 เพราะ${why(first[0])}`
      : `ขอพร้อมกัน ${first.length} แห่งในรอบแรก: ${first.map((e) => `${e.name} (${why(e)})`).join(', ')}`
    : '';
  const backup = rest.length
    ? `สำรอง${rest.map((e) => `อันดับ ${e.rank} คือ ${e.name} (ให้ยืมได้ ≤ ${n(e.lendable)} ${unit})`).join(' และ')} จะขอเมื่อแห่งก่อนหน้าให้ไม่พอ`
    : '';
  return [lead, backup, 'เภสัชกรตรวจและอนุมัติก่อนส่ง'].filter(Boolean).join(' · ');
}

export function borrowRequestToView(r: ApiBorrowRequest, now = Date.now(), returnState?: ReturnState): BorrowRequest {
  const unit = r.drug.baseUnit;
  const activeLegs = r.legs.filter((l) => l.status !== 'CANCELLED');
  // legs still waiting for an answer (several at once when very urgent); the earliest deadline drives the countdown
  const waitingLegs = r.legs.filter((l) => l.status === 'SENT').sort((a, b) => (a.remainingSec ?? Infinity) - (b.remainingSec ?? Infinity));
  const waiting = waitingLegs[0];
  const asked = new Set(r.legs.map((l) => l.lender.id));
  const ladder = r.proposal?.ladder ?? [];
  const reserve = ladder.filter((e) => !asked.has(e.hospitalId));
  const open = ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED'].includes(r.status);
  const shown = r.status === 'PENDING_APPROVAL' ? ladder : open ? reserve : [];
  // lenders needed to cover what is still missing, asking in ladder order (the rest are spare)
  let covered = r.status === 'PENDING_APPROVAL' ? 0 : r.stop?.effective ?? 0;
  // after approval, once the stop rule is met nobody else will be asked: the remaining rows are spare only
  const enoughNow = r.status !== 'PENDING_APPROVAL' && !!r.stop?.met;
  const proposed: BorrowLeg[] = shown.map((e) => {
    const needed = covered < r.qtyRequested;
    covered += e.lendable;
    const first = r.status === 'PENDING_APPROVAL' && e.qtyPlanned > 0;
    const tail = first
      ? `จะขอยืม ${n(e.qtyPlanned)} ${unit}`
      : enoughNow
        ? 'สำรอง · ไม่ต้องขอแล้ว (ได้ตอบรับพอแล้ว)'
        : `${needed ? 'ขอต่อถ้าแห่งก่อนหน้าไม่พอ' : 'สำรอง'} · ให้ยืมได้ไม่เกิน ${n(e.lendable)} ${unit}`;
    return { hospital: e.name, si: e.si, state: 'NOT_SENT', detail: tail, ...(r.status === 'PENDING_APPROVAL' ? { plan: { hospitalId: e.hospitalId, lendable: Math.floor(e.lendable), qty: e.qtyPlanned } } : {}) };
  });
  const ladderNote = ladder.length && (r.status === 'PENDING_APPROVAL' || open)
    ? (() => {
        let c = r.status === 'PENDING_APPROVAL' ? 0 : r.stop?.effective ?? 0;
        let k = 0;
        for (const e of shown) { if (c >= r.qtyRequested) break; c += e.lendable; k += 1; }
        const spare = shown.length - k;
        const spareText = spare > 0 ? ` · มีสำรอง ${spare} แห่ง` : '';
        // nothing more to ask: enough is confirmed already (stop rule), the rest of the ladder is spare only
        if (r.status !== 'PENDING_APPROVAL' && r.stop?.met) return `ได้ตอบรับพอแล้ว ไม่ต้องขอเพิ่ม${spareText}`;
        const how = r.proposal?.parallel ? 'ขอพร้อมกันได้สูงสุด 3 แห่ง' : 'ขอทีละแห่ง';
        return `${how} จนได้ครบ ${n(r.qtyRequested)} ${unit}${spareText} · แห่งไหนปฏิเสธหรือไม่ตอบ ระบบขอแห่งถัดไปให้เอง`;
      })()
    : undefined;
  const legs: BorrowLeg[] = r.legs.length
    ? [...r.legs.map((l) => ({ hospital: l.lender.name, legId: l.id, ...(l.si !== null ? { si: l.si } : {}), state: LEG[l.status], rawStatus: l.status, detail: legDetail(l, unit) })), ...proposed]
    : proposed;
  const stop = r.stop && r.status !== 'DRAFT'
    ? {
        got: r.stop.effective,
        target: r.stop.threshold,
        remaining: `คงต้องการ (borrow_remaining) ${n(r.stop.remaining)} ${unit} · ถ้าได้บางส่วน ระบบขอส่วนที่เหลือจากลำดับถัดไป`,
        ...(r.proposal ? { formula: `${r.proposal.need.ved === 'V' ? 'V: หยุดเมื่อได้ ≥ 90% ของรอบแรก' : 'E: หยุดเมื่อได้ ≥ ปริมาณใช้ปกติ'} = ${n(r.stop.threshold)}` } : {}),
      }
    : undefined;
  // Nobody left to answer and the stop rule is not met: the server only escalates once the confirmed goods arrive
  // (borrow.flow advanceRequest), so say the shortfall now instead of a plain "กำลังดำเนินการ".
  const noLenderLeft = ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED'].includes(r.status) && !!r.stop && !r.stop.met && r.stop.remaining > 0 && r.legs.length > 0 && !r.legs.some((l) => l.status === 'SENT' || l.status === 'PENDING');
  const firstSent = r.legs.filter((l) => l.round === 1);
  // first-round quantity as planned now (it may have been edited) or as really sent; the stored column is the original
  const firstQty = r.status === 'PENDING_APPROVAL' && ladder.length
    ? ladder.reduce((s, e) => s + e.qtyPlanned, 0)
    : firstSent.length ? firstSent.reduce((s, l) => s + l.qtyAsked, 0) : (r.firstRoundQty ?? r.qtyRequested);
  const sendMode = r.proposal ? (r.proposal.parallel ? 'ส่งพร้อมกันได้สูงสุด 3 แห่ง' : 'ส่งทีละแห่ง') : firstSent.length > 1 ? `ส่งพร้อมกัน ${firstSent.length} แห่ง` : 'ส่งทีละแห่ง';
  const lender =
    activeLegs.length > 0
      ? [...new Set(activeLegs.map((l) => l.lender.name))].slice(0, 2)
      : r.proposal && r.proposal.ladder.length
        ? [`ลำดับ ${r.proposal.ladder.length} แห่ง · ขอแห่งแรก`, ...(() => { const firsts = r.proposal.ladder.filter((e) => e.qtyPlanned > 0).map((e) => e.name); return firsts.length ? firsts.slice(0, 2) : [r.proposal.ladder[0].name]; })()]
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
    borrower: r.borrower.name,
    received: r.legs.reduce((s, l) => s + (l.qtyReceived ?? 0), 0),
    urgency: URGENCY[r.urgency],
    status: r.status,
    ...(returnState ? { returnState } : {}),
    ...(waiting?.remainingSec != null ? { countdownSec: waiting.remainingSec } : {}),
    ...(stop ? { stop } : {}),
    note: waiting ? `รอ ${waitingLegs.length > 1 ? `${waitingLegs.length} แห่ง` : waiting.lender.name} · ${legDetail(waiting, unit).split(' · ').slice(-1)[0]}` : r.status === 'ESCALATED' ? `ยังขาด ${n(r.stop?.remaining ?? 0)} · แจ้งผู้ดูแลแล้ว` : noLenderLeft ? `ยังขาด ${n(r.stop!.remaining)} · ไม่มีผู้ให้ยืมเหลือ · เพิ่มผู้ให้ยืมได้เมื่อรับของที่ตอบรับแล้ว` : r.status === 'PENDING_APPROVAL' ? 'ร่างข้อความแล้ว · รออนุมัติ' : r.status === 'FULFILLED' ? `ครบ ${n(r.qtyFulfilled)}` : r.status === 'CANCELLED' ? (r.reason ?? 'ยกเลิก') : 'กำลังดำเนินการ',
    action: r.status === 'PENDING_APPROVAL' ? 'approve' : r.status === 'ESCALATED' && r.drug.kind !== 'KIT' ? 'addLender' : (returnState === 'PENDING' || returnState === 'OVERDUE') ? 'recordReturn' : 'detail',
    banner: banner(r, waiting, waitingLegs.length),
    contextLabel: r.context === 'STOCK_ALERT' ? 'จากแจ้งเตือนสต็อก' : r.context === 'EMERGENCY' ? 'เหตุฉุกเฉิน' : 'สร้างเอง',
    firstRound: `${n(firstQty)} ${unit}`,
    ...(r.proposal?.parallel ? { parallel: true } : {}),
    sendMode: sendMode.replace('ส่ง', 'ขอ'),
    createdBy: `${r.createdBy} · ${fmtThaiTime(r.createdAt, new Date(now))}`,
    ...(r.approvedBy ? { approvedBy: `${r.approvedBy} (PHARMACIST)` } : {}),
    legs,
    ...(ladderNote ? { ladderNote } : {}),
    ...(r.drug.kind === 'KIT' ? { isKit: true } : {}),
    ...(r.status === 'PENDING_APPROVAL' ? { agentNote: agentNoteOf(r) } : {}),
  };
}
