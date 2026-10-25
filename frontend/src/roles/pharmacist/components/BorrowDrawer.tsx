import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';
import { mayActFor, maySeePeerStock, requiredRoleHint } from '../../../lib/rbac';
import type { Action, RoleCode } from '../../../lib/rbac';
import { withRole } from '../../../data/navigation';
import { fmtTime } from '../../../lib/time';
import { groupMeta, groupOf, LEG_META } from '../data/borrow';
import type { BorrowLeg, BorrowRequest, StatusGroup } from '../data/borrow';
import { BorrowStatusBadge, ReturnBadge, UrgencyBadge } from './BorrowBadges';
import { StopBar } from './BorrowTable';

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
  /** Opens the cancel confirm dialog for an in-progress request (QA-PHARM-005). */
  onCancel?: (r: BorrowRequest) => void;
  /** Opens the record-return dialog for a request with return obligations (QA-PHARM-005). */
  onRecordReturn?: (r: BorrowRequest) => void;
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
export function BorrowDrawer({ request: r, tick, decision, onDecide, onClose, onEscalate, onSkipLeg, onCancel, onRecordReturn, role = 'PHARMACIST' }: BorrowDrawerProps) {
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
  const shouldShowCancel = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED'].includes(r.status);
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
  const activeLeg = r.legs.findIndex((l) => l.state === 'WAITING');

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดคำขอยืม">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">คำขอของเรา (เราเป็นผู้ยืม) · Request detail · UI-05</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
            {r.id}
          </h2>
          <BorrowStatusBadge status={r.status} kit={r.isKit} />
          <UrgencyBadge urgency={r.urgency} />
          <span className="badge t-grey code">{r.context}</span>
          {r.returnState && <ReturnBadge state={r.returnState} />}
        </div>
        <div className="br-drug" style={{ fontSize: 15, fontWeight: 600, color: '#0F2A5C' }}>
          <span className={`ved ved-${r.ved} ved-sm`}>{r.ved}</span>
          <span>
            {r.drug} · {r.qty} {r.unit}
          </span>
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
        <dl className="dlr">
          <dt>บริบท</dt>
          <dd>{r.contextLabel}</dd>
          <dt>จำนวนรอบแรก</dt>
          <dd>{r.firstRound}</dd>
          <dt>วิธีส่ง</dt>
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

        {r.stop && (
          <div className="tr-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <h3 className="tr-h3" style={{ margin: 0 }}>
                กฎหยุด <span className="en">F-20</span>
              </h3>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F2A5C' }}>
                ได้ยืนยัน <span className="num">{r.stop.got} / {r.stop.target}</span>
              </span>
            </div>
            <StopBar got={r.stop.got} target={r.stop.target} />
            {r.stop.formula && <div style={{ fontSize: 12.5, lineHeight: '18px', color: '#0F2A5C' }}>{r.stop.formula}</div>}
            <div style={{ fontSize: 12.5, lineHeight: '18px' }}>{r.stop.remaining}</div>
          </div>
        )}

        <div>
          <h3 className="tr-h3">
            ลำดับผู้ให้ยืมและรอบการขอ <span className="en">Legs · {r.sendMode}</span>
          </h3>
          {r.ladderNote && <div className="sub" style={{ margin: '2px 0 8px' }}>{r.ladderNote}</div>}
          {r.legs.length === 0 ? (
            <div className="sub">ยังไม่ได้ส่งถึงผู้ให้ยืม</div>
          ) : (
            <ol className="br-legs">
              {r.legs.map((l, i) => {
                const m = LEG_META[l.state];
                const on = i === activeLeg;
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
                        {/* The Hospital Priority Score is Agent-internal (rbac.md §3): a role outside
                            the borrow flow sees the proposed lender and its own requested quantity only. */}
                        {/* Si is the Agent's own score (rbac.md §3); a lender added manually outside
                            the ladder has none, so the line is omitted rather than faked. */}
                        {maySeePeerStock(role) && l.si !== undefined && (
                          <span className="code" style={{ marginLeft: 'auto' }}>
                            Si {l.si.toFixed(4)}
                          </span>
                        )}
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {l.detail}
                      </span>
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
          {r.agentNote && (
            <div className="br-agent">
              <b style={{ color: '#1D4ED8', fontWeight: 600 }}>Agent ({r.agentNote.code})</b>{r.agentNote.model && r.agentNote.status === 'OK' ? <span className="sub"> · {r.agentNote.model}{r.agentNote.confidence ? ` · ความมั่นใจ ${r.agentNote.confidence}` : ''}</span> : null} · {r.agentNote.text}
            </div>
          )}
        </div>

        {decision ? (
          <div role="status" className="br-banner" style={{ background: '#F8FAFC', borderColor: '#E2E8F0', fontSize: 13, color: '#0F2A5C' }}>
            {decision === 'approve' ? 'อนุมัติแล้ว 19:12 · ระบบส่งคำขอรอบแรกตามลำดับแล้ว' : 'ไม่อนุมัติแล้ว 19:12 · คำขอถูกยกเลิก (CANCELLED)'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {r.action === 'approve' && (
              <>
                <button
                  className="btn btn-p"
                  disabled={!approve.allowed}
                  title={approve.hint}
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
