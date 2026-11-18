import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { Action, RoleCode } from '../../../lib/rbac';
import { withRole } from '../../../data/navigation';
import { fmtTime } from '../../../lib/time';
import { groupMeta, groupOf, LEG_META, tileOf } from '../data/borrow';
import type { BorrowLeg, BorrowRequest, StatusGroup } from '../data/borrow';
import { BorrowStatusBadge, ReturnBadge, UrgencyBadge } from './BorrowBadges';

export type Decision = 'approve' | 'reject' | undefined;

interface BorrowDrawerProps {
  request: BorrowRequest;
  tick: number;
  decision: Decision;
  onDecide: (d: 'approve' | 'reject') => void;
  onClose: () => void;
  /** Opens the escalate-manual confirm dialog (API-F1b-012) for an ESCALATED request. */
  onEscalate: (r: BorrowRequest) => void;
  /** Opens the "send on to the next lender" dialog for a lender that has not answered yet. */
  onSkipLeg?: (r: BorrowRequest, leg: BorrowLeg) => void;
  /** Demo shortcut: this lender accepts the full quantity now (no need to sign in as the lender). Rejects with the API message. */
  onAcceptForLender?: (r: BorrowRequest, leg: BorrowLeg) => Promise<void>;
  /** Saves edited first-round quantities of a request waiting for approval (PATCH /ladder). Rejects with the API message. */
  onEditPlan?: (r: BorrowRequest, legs: { hospitalId: string; qty: number }[]) => Promise<void>;
  /** Opens the cancel confirm dialog for an in-progress request (QA-PHARM-005). */
  onCancel?: (r: BorrowRequest) => void;
  /** Opens the record-return dialog for a request with return obligations (QA-PHARM-005). */
  onRecordReturn?: (r: BorrowRequest) => void;
  /** Calculates the lender ladder and drafts messages for a DRAFT request (API-F1b-004). */
  onPropose?: (r: BorrowRequest) => void;
  /** Role viewing the drawer; every action is gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/** Banner colours per SM-1 group: [background, border, icon colour]. */
const BANNER: Record<StatusGroup, [string, string, string]> = {
  pending: ['#FFFBEB', '#FDE68A', '#92400E'],
  progress: ['#FFFBEB', '#FDE68A', '#92400E'],
  escalated: ['#FEF2F2', '#FECACA', '#991B1B'],
  fulfilled: ['#F0FDF4', '#BBF7D0', '#166534'],
  closed: ['#F8FAFC', '#E2E8F0', '#475569'],
};

/** UI-05 request detail (we are the borrower). Actions are local state only. */
export function BorrowDrawer({ request: r, tick, decision, onDecide, onClose, onEscalate, onSkipLeg, onAcceptForLender, onEditPlan, onCancel, onRecordReturn, onPropose, role = 'PHARMACIST' }: BorrowDrawerProps) {
  const group = groupOf(r.status);

  /** Action each drawer button performs, so a role that may not act sees it disabled with a hint. */
  const gate = (action: Action) => {
    const allowed = mayActFor(role, 'PHARMACIST', action);
    return { allowed, hint: allowed ? undefined : requiredRoleHint(action), action };
  };
  const approve = gate('approveBorrow');
  /* Adding a lender outside the ladder is its own grant (API-F1b-012: PHARMACIST and
     HOSPITAL_ADMIN) — it is no longer borrowed from the approval action. */
  const addLender = gate('escalateManual');
  const recordReturn = gate('updateInventory');
  const skipLeg = gate('approveBorrow');
  const maySkip = r.context !== 'EMERGENCY' && ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED'].includes(r.status);
  const cancelRequest = gate('cancelRequest');
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<{ legId: string; text: string } | null>(null);
  const acceptForLender = (leg: BorrowLeg) => {
    if (!onAcceptForLender || !leg.legId || acceptBusy) return;
    const legId = leg.legId;
    setAcceptBusy(legId);
    setAcceptError(null);
    onAcceptForLender(r, leg)
      .catch((e: Error) => setAcceptError({ legId, text: e.message }))
      .finally(() => setAcceptBusy(null));
  };
  // Editable first-round plan (waiting for approval): one quantity per planned lender, saved before approving.
  const planRows = r.legs.filter((l) => l.plan);
  const planKey = `${r.version ?? 0}:${planRows.map((l) => `${l.plan!.hospitalId}=${l.plan!.qty}`).join(',')}`;
  const initPlan = () => Object.fromEntries(planRows.map((l) => [l.plan!.hospitalId, String(l.plan!.qty)]));
  const [planEdit, setPlanEdit] = useState<Record<string, string>>(initPlan);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  // inputs show only after "ปรับจำนวน"; a reload (saved, or changed elsewhere) closes them with the stored plan
  const [planOpen, setPlanOpen] = useState(false);
  useEffect(() => { setPlanEdit(initPlan()); setPlanError(null); setPlanOpen(false); }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mayEditPlan = r.status === 'PENDING_APPROVAL' && !!onEditPlan && approve.allowed && planRows.length > 0;
  const editingPlan = mayEditPlan && planOpen;
  const closePlan = () => { setPlanEdit(initPlan()); setPlanError(null); setPlanOpen(false); };
  const planDirty = editingPlan && planRows.some((l) => (planEdit[l.plan!.hospitalId] ?? '') !== String(l.plan!.qty));
  const planCheck = (() => {
    if (!planDirty) return null;
    let total = 0;
    let active = 0;
    for (const l of planRows) {
      const raw = (planEdit[l.plan!.hospitalId] ?? '').trim();
      if (!/^\d+$/.test(raw)) return `${l.hospital}: ใส่จำนวนเต็มตั้งแต่ 0 ขึ้นไป`;
      const q = Number(raw);
      if (q > l.plan!.lendable) return `${l.hospital} ให้ยืมได้ไม่เกิน ${l.plan!.lendable.toLocaleString('en-US')} ${r.unit}`;
      total += q;
      if (q > 0) active += 1;
    }
    if (active === 0) return 'ต้องขออย่างน้อย 1 โรงพยาบาล';
    const maxActive = r.parallel ? 3 : 1;
    if (active > maxActive) return r.parallel ? 'ขอพร้อมกันได้ไม่เกิน 3 แห่ง' : 'คำขอนี้ขอทีละแห่ง ใส่จำนวนได้ 1 โรงพยาบาล (ที่เหลือใส่ 0)';
    if (total > r.qty) return `รวมเกินจำนวนที่ต้องยืม (${total.toLocaleString('en-US')} / ${r.qty.toLocaleString('en-US')} ${r.unit})`;
    return null;
  })();
  const planTotal = planRows.reduce((s2, l) => s2 + (Number((planEdit[l.plan!.hospitalId] ?? '').trim()) || 0), 0);
  const savePlan = () => {
    if (!onEditPlan || planCheck || !planDirty || planBusy) return;
    setPlanBusy(true);
    setPlanError(null);
    onEditPlan(r, planRows.map((l) => ({ hospitalId: l.plan!.hospitalId, qty: Number(planEdit[l.plan!.hospitalId]) })))
      .catch((e: Error) => setPlanError(e.message))
      .finally(() => setPlanBusy(false));
  };
  // waiting for approval: "ไม่อนุมัติ" already cancels the request (and records the plan as rejected), so no second button
  const shouldShowCancel = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED'].includes(r.status);
  const cancelCancellableStatus = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'ESCALATED'].includes(r.status);
  const cancelHasMovingLegs = r.legs.some((l) => ['LOADED', 'IN_TRANSIT', 'RECEIVED'].includes(l.rawStatus ?? l.state));
  const cancelDisabled = !cancelRequest.allowed || !cancelCancellableStatus || cancelHasMovingLegs;
  const cancelHint = !cancelRequest.allowed
    ? cancelRequest.hint
    : r.status === 'PARTIALLY_FULFILLED'
      ? 'ไม่สามารถยกเลิกคำขอในสถานะ PARTIALLY_FULFILLED ได้เนื่องจากได้รับยาบางส่วนแล้ว'
      : cancelHasMovingLegs
        ? 'ไม่สามารถยกเลิกคำขอได้เนื่องจากยาถูกจัดขึ้นรถหรืออยู่ระหว่างจัดส่งแล้ว'
        : !cancelCancellableStatus
          ? `ไม่สามารถยกเลิกคำขอในสถานะ ${r.status}`
          : undefined;
  const [bg, border, fg] = BANNER[group];
  const bannerIcon: IconName = group === 'progress' ? 'clock' : groupMeta(group).icon;

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดคำขอยืม">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">คำขอของเรา (เราเป็นผู้ยืม) · Request detail</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
            {r.id}
          </h2>
          <BorrowStatusBadge status={r.status} kit={r.isKit} accepted={tileOf(r) === 'accepted'} />
          <UrgencyBadge urgency={r.urgency} />
          {r.returnState && <ReturnBadge state={r.returnState} />}
        </div>
        {/* At a glance: who asks, which drug, how much, and how much the lenders confirmed so far. */}
        <div className="br-sum">
          <div className="br-sum-who">{r.borrower ?? 'โรงพยาบาลของเรา'} ขอยืม</div>
          <div className="br-drug" style={{ fontSize: 15, fontWeight: 600, color: '#0F2A5C' }}>
            <span className={`ved ved-${r.ved} ved-sm`}>{r.ved}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{r.drug}</span>
            <span className="num br-sum-qty">
              {r.qty.toLocaleString('en-US')} <small>{r.unit}</small>
            </span>
          </div>
          {r.stop && (
            <div className="br-sum-prog">
              <span className="br-bar br-bar-wide" role="img" aria-label={`ตอบรับแล้ว ${r.stop.got} จาก ${r.qty}`}>
                <span style={{ width: `${r.qty ? Math.min(100, Math.round((r.stop.got / r.qty) * 100)) : 0}%` }} />
              </span>
              <span className="num">
                ตอบรับแล้ว {r.stop.got.toLocaleString('en-US')} / {r.qty.toLocaleString('en-US')} {r.unit}
                {r.received ? ` · รับของแล้ว ${r.received.toLocaleString('en-US')}` : ''}
              </span>
            </div>
          )}
        </div>
        <div role="status" className="br-banner" style={{ background: bg, borderColor: border }}>
          <Icon name={bannerIcon} className="ic20" style={{ color: fg }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="br-banner-t">{r.banner.title}</span>
            <span className="br-banner-s">{r.banner.text}</span>
          </span>
          {r.countdownSec !== undefined && <span className="num br-clock">{fmtTime(r.countdownSec - tick)}</span>}
        </div>
      </div>

      <div className="tr-drawer-body">

        <div>
          <h3 className="tr-h3">ขอยืมจาก</h3>
          {r.ladderNote && <div className="sub" style={{ margin: '2px 0 8px' }}>{r.ladderNote}</div>}
          {r.legs.length === 0 ? (
            <div className="sub">ยังไม่ได้ส่งถึงผู้ให้ยืม</div>
          ) : (
            <ol className="br-legs">
              {r.legs.map((l, i) => {
                const m = LEG_META[l.state];
                // every lender still asked is highlighted (a very urgent request asks up to 3 at once)
                const on = l.state === 'WAITING';
                return (
                  <li key={l.hospital}>
                    <span className="br-leg-rail">
                      <span className="num br-leg-dot" style={{ background: on ? '#1D4ED8' : '#F1F5F9', color: on ? '#FFFFFF' : '#475569' }}>
                        {i + 1}
                      </span>
                      {i < r.legs.length - 1 && <span className="br-leg-line" />}
                    </span>
                    <span className="br-leg-body">
                      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                        <b style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>{l.hospital}</b>
                        <span className={`badge t-${m.tone}`} style={{ height: 20, fontSize: 11 }}>
                          {m.label}
                        </span>
                        {onAcceptForLender && maySkip && l.legId && l.state === 'WAITING' && (
                          <button
                            className="btn btn-s"
                            style={{ height: 22, padding: '0 8px', fontSize: 11 }}
                            disabled={!skipLeg.allowed || acceptBusy !== null}
                            title={skipLeg.hint ?? `ให้${l.hospital}ตอบรับเต็มจำนวนเลย (ไม่ต้องสลับไปบัญชีผู้ให้ยืม)`}
                            onClick={() => acceptForLender(l)}
                          >
                            {acceptBusy === l.legId ? 'กำลังตอบรับ…' : 'ตอบรับแทน'}
                          </button>
                        )}
                        {/* The Hospital Priority Score is Agent-internal (rbac.md §3): a role outside
                            the borrow flow sees the proposed lender and its own requested quantity only. */}
                        {/* Si is the Agent's own score (rbac.md §3); a lender added manually outside
                            the ladder has none, so the line is omitted rather than faked. */}
                        
                      </span>
                      {editingPlan && l.plan ? (
                        <span className="sub" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          ขอยืม
                          <input
                            className="sel br-plan-qty"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={l.plan.lendable}
                            step={1}
                            aria-label={`จำนวนที่ขอยืมจาก${l.hospital}`}
                            value={planEdit[l.plan.hospitalId] ?? ''}
                            disabled={planBusy}
                            onChange={(e) => { const v = e.target.value; setPlanEdit((m) => ({ ...m, [l.plan!.hospitalId]: v })); }}
                          />
                          {r.unit} · ให้ยืมได้ไม่เกิน {l.plan.lendable.toLocaleString('en-US')} {r.unit}
                        </span>
                      ) : (
                        <span className="sub" style={{ display: 'block' }}>
                          {l.detail}
                        </span>
                      )}
                      {acceptError && acceptError.legId === l.legId && (
                        <span role="alert" style={{ display: 'block', color: '#B91C1C', fontSize: 12, marginTop: 4 }}>ตอบรับแทนไม่สำเร็จ: {acceptError.text}</span>
                      )}
                      {maySkip && l.legId && l.state === 'WAITING' && (
                        <button className="btn btn-g" style={{ marginTop: 6 }} disabled={!skipLeg.allowed} title={skipLeg.hint ?? 'ยกเลิกคำขอถึงแห่งนี้ แล้วส่งถึงลำดับถัดไปทันที'} onClick={() => onSkipLeg?.(r, l)}>
                          ส่งต่อลำดับถัดไปเลย
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {mayEditPlan && !planOpen && (
            <button className="btn btn-s btn-sm" style={{ margin: '0 0 10px' }} onClick={() => setPlanOpen(true)} title="แก้จำนวนที่จะขอแต่ละโรงพยาบาลก่อนอนุมัติ">
              ปรับจำนวน
            </button>
          )}
          {editingPlan && (
            <div className="br-plan-bar">
              <span className="num">รวมที่จะขอ {planTotal.toLocaleString('en-US')} / {r.qty.toLocaleString('en-US')} {r.unit}</span>
              <button className="btn btn-p btn-sm" disabled={!planDirty || !!planCheck || planBusy} onClick={savePlan}>{planBusy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
              <button className="btn btn-g btn-sm" disabled={planBusy} onClick={closePlan}>ยกเลิก</button>
              <span className="sub" style={{ flexBasis: '100%' }}>ถ้าได้ไม่ครบ ระบบขอส่วนที่เหลือจากแห่งถัดไปเอง</span>
              {(planCheck || planError) && <span role="alert" style={{ flexBasis: '100%', color: '#B91C1C', fontSize: 12 }}>{planCheck ?? `บันทึกไม่สำเร็จ: ${planError}`}</span>}
            </div>
          )}
          {r.agentNote && (
            <div className="br-agent">
              <b style={{ color: '#1D4ED8', fontWeight: 600 }}>{r.agentNote.status === 'OK' ? 'Agent' : r.agentNote.status === 'EDITED' ? 'เภสัชกร' : 'ระบบ'}</b>{r.agentNote.confidence && r.agentNote.status === 'OK' ? <span className="sub"> · ความมั่นใจ {r.agentNote.confidence}</span> : null} · {r.agentNote.text}
            </div>
          )}
        </div>

        <div>
          <h3 className="tr-h3">รายละเอียดคำขอ</h3>
          <dl className="dlr">
            <dt>บริบท</dt>
            <dd>{r.contextLabel}</dd>
            <dt>ขอในครั้งแรก</dt>
            <dd>{r.firstRound}</dd>
            <dt>วิธีขอ</dt>
            <dd>{r.sendMode}</dd>
            <dt>สร้างโดย</dt>
            <dd>{r.createdBy}</dd>
            {r.approvedBy && (
              <>
                <dt>อนุมัติโดย</dt>
                <dd>{r.approvedBy}</dd>
              </>
            )}
          </dl>
        </div>

        {decision ? (
          <div role="status" className="br-banner" style={{ background: '#F8FAFC', borderColor: '#E2E8F0', fontSize: 13, color: '#0F2A5C' }}>
            {decision === 'approve' ? 'อนุมัติแล้ว 19:12 · ระบบส่งคำขอรอบแรกตามลำดับแล้ว' : 'ไม่อนุมัติแล้ว 19:12 · คำขอถูกยกเลิก (CANCELLED)'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {r.status === 'DRAFT' && (
              <button
                className="btn btn-p"
                disabled={!approve.allowed}
                title={approve.hint ?? 'คำนวณลำดับผู้ให้ยืม (Lender Ladder) และร่างข้อความถึงผู้ให้ยืม'}
                onClick={() => onPropose?.(r)}
              >
                คำนวณและเสนอแผนผู้ให้ยืม
              </button>
            )}
            {r.action === 'approve' && (
              <>
                <button
                  className="btn btn-p"
                  disabled={!approve.allowed || editingPlan || planBusy}
                  title={editingPlan ? 'บันทึกหรือยกเลิกการปรับจำนวนก่อน แล้วค่อยอนุมัติ' : approve.hint}
                  onClick={() => onDecide('approve')}
                >
                  อนุมัติและส่ง
                </button>
                <button
                  className="btn btn-g"
                  disabled={!approve.allowed}
                  title={approve.hint}
                  onClick={() => onDecide('reject')}
                >
                  ไม่อนุมัติ
                </button>
              </>
            )}
            {/* escalate-manual is reachable only once the request is ESCALATED (§4.1 escalation
                step, FR-F1b-011) — the ladder has to be exhausted first. */}
            {r.status === 'ESCALATED' && r.isKit && (
              <a className="btn btn-p" data-part="kit-incident-link" href={withRole('?page=incident', role)} style={{ textDecoration: 'none' }} title="ชุดยา (F3) ไม่มีลำดับผู้ให้ยืมให้เพิ่มด้วยมือ ต้องจัดการผ่านเหตุฉุกเฉิน">
                ไปจัดการที่เหตุฉุกเฉิน
              </a>
            )}
            {r.status === 'ESCALATED' && !r.isKit && (
              <button
                className="btn btn-p"
                data-part="escalate-manual"
                disabled={!addLender.allowed}
                title={addLender.hint}
                onClick={() => onEscalate(r)}
              >
                เพิ่มผู้ให้ยืม
              </button>
            )}
            {(r.action === 'recordReturn' || (r.status === 'FULFILLED' && (r.returnState === 'PENDING' || r.returnState === 'OVERDUE'))) && (
              <button
                className="btn btn-p"
                disabled={!recordReturn.allowed}
                title={recordReturn.hint}
                onClick={() => onRecordReturn?.(r)}
              >
                บันทึกการคืน
              </button>
            )}
            {shouldShowCancel && (
              <button
                className="btn btn-g"
                disabled={cancelDisabled}
                title={cancelHint}
                onClick={() => onCancel?.(r)}
              >
                ยกเลิกคำขอ
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
