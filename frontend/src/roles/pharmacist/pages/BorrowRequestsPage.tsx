import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { homeHrefFor } from '../../../data/navigation';
import { USER } from '../../../data/session';
import { can, HOSPITAL_ADMIN_ROLE, mayActFor } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { useTick } from '../../../lib/time';
import { ReasonDialog } from '../../hospital-admin/components/ReasonDialog';
import { appendAuditEntry } from '../../hospital-admin/data/audit';
import { HOSPITAL_ADMIN_USER } from '../../hospital-admin/data/session';
import { BorrowDrawer } from '../components/BorrowDrawer';
import type { Decision } from '../components/BorrowDrawer';
import { BorrowStatusTiles } from '../components/BorrowStatusTiles';
import { BorrowTable } from '../components/BorrowTable';
import { ObligationTable, ObligationTiles } from '../components/ObligationTable';
import { BORROW_REQUESTS, GROUPS, groupOf, LENDER_QUEUE } from '../data/borrow';
import type { BorrowContext, BorrowRequest, StatusGroup, Urgency } from '../data/borrow';
import { dueLabel, obligationCounts, outstandingOf, RETURN_OBLIGATIONS } from '../data/obligations';
import type { ObligationState, ReturnObligation } from '../data/obligations';
import '../borrow.css';

/** Apply the pharmacist's local approve/reject decision to a pending request. */
function withDecision(r: BorrowRequest, d: Decision): BorrowRequest {
  if (!d) return r;
  return d === 'approve'
    ? { ...r, status: 'IN_PROGRESS', action: 'detail', note: 'อนุมัติแล้ว 19:12 · ส่งรอบแรกแล้ว', banner: { title: 'อนุมัติแล้ว · ส่งรอบแรกแล้ว', text: `ส่งคำขอถึงผู้ให้ยืมตามลำดับ (${r.sendMode}) 19:12 · รอตอบกลับ` }, approvedBy: 'ภก.ณัฐวุฒิ ศรีสุข (PHARMACIST)' }
    : { ...r, status: 'CANCELLED', action: 'detail', note: 'ไม่อนุมัติ 19:12', banner: { title: 'ยกเลิก · ไม่อนุมัติ', text: 'ภก.ณัฐวุฒิ ศรีสุข ไม่อนุมัติ 19:12' } };
}

/**
 * Apply a confirmed escalate-manual (API-F1b-012) to a request: the ladder is exhausted, so one
 * lender outside it is added by hand and the request keeps waiting for a response.
 */
function withEscalation(r: BorrowRequest, esc: Record<string, { reason: string; at: string }>): BorrowRequest {
  const e = esc[r.id];
  if (!e) return r;
  return {
    ...r,
    note: `เพิ่มผู้ให้ยืมด้วยตนเองแล้ว ${e.at}`,
    banner: { title: 'เพิ่มผู้ให้ยืมนอกลำดับแล้ว · รอตอบกลับ', text: `เพิ่มด้วยตนเอง ${e.at} · เหตุผล: ${e.reason}` },
    legs: [
      ...r.legs,
      { hospital: 'ผู้ให้ยืมนอกลำดับ', state: 'WAITING', detail: `เพิ่มด้วยตนเอง ${e.at} · ยังไม่ระบุชื่อโรงพยาบาลใน mock นี้ · รอตอบกลับ` },
    ],
  };
}

/**
 * UI-05 Borrow requests — our hospital as the borrower. UI only: data is mock,
 * approve/reject are local state. Every request needs pharmacist approval before
 * it is sent; an unanswered leg times out and moves to the next lender (SM-1).
 *
 * Phase 2C adds the Hospital Admin view of the return obligations those borrows created
 * (API-XC-003, SM-7) and the two audited actions that belong to it: `waive`
 * (API-XC-005, HOSPITAL_ADMIN only) and `escalate-manual` (API-F1b-012, PHARMACIST +
 * HOSPITAL_ADMIN). The obligations sub-tab is never rendered for another role.
 *
 * `role` gates the write controls through `lib/rbac.ts` and drives the breadcrumb home.
 */
export function BorrowRequestsPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const tick = useTick();
  const [group, setGroup] = useState<StatusGroup | null>(null);
  const [selId, setSelId] = useState('');
  // Detail drawer stays closed until a request is opened from the table.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState<Record<string, Decision>>({});
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState<'all' | Urgency>('all');
  const [context, setContext] = useState<'all' | BorrowContext>('all');
  const [days, setDays] = useState(90);
  /* Creating a manual borrow request is a pharmacist action (§4.1) — hidden when the role lacks it. */
  const mayCreate = mayActFor(role, 'PHARMACIST', 'createBorrowRequest');

  /* ── Phase 2C: return obligations (Hospital Admin) ─────────────────────────── */
  // The sub-tab exists only for HOSPITAL_ADMIN; for every other role the page renders exactly
  // what it rendered before (no extra control, no extra state in the DOM).
  const maySeeObligations = role === 'HOSPITAL_ADMIN';
  const [view, setView] = useState<'requests' | 'obligations'>('requests');
  const [obligations, setObligations] = useState<ReturnObligation[]>(RETURN_OBLIGATIONS);
  const [stateFilter, setStateFilter] = useState<ObligationState | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<ReturnObligation | null>(null);
  const [waiveBanner, setWaiveBanner] = useState<{ id: string; at: string; auditId: string } | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<BorrowRequest | null>(null);
  const [escalations, setEscalations] = useState<Record<string, { reason: string; at: string }>>({});
  /** API-XC-005 grants the waive to HOSPITAL_ADMIN alone; the control is gated on the action. */
  const mayWaive = can(role, 'waiveReturn');
  const showObligations = maySeeObligations && view === 'obligations';
  const actor = role === 'HOSPITAL_ADMIN' ? HOSPITAL_ADMIN_USER.name : USER.name;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = useMemo(
    () => BORROW_REQUESTS.map((r) => withEscalation(withDecision(r, decision[r.id]), escalations)),
    [decision, escalations],
  );
  const inPeriod = all.filter((r) => r.daysAgo <= days);
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, inPeriod.filter((r) => groupOf(r.status) === g.id).length])) as Record<StatusGroup, number>;
  const pendingAll = all.filter((r) => groupOf(r.status) === 'pending').length;

  const obligationCountList = useMemo(() => obligationCounts(obligations), [obligations]);
  const overdueCount = obligationCountList.OVERDUE;
  const obligationRows = stateFilter ? obligations.filter((o) => o.state === stateFilter) : obligations;

  const needle = q.trim().toLowerCase();
  const rows = inPeriod
    .filter((r) => !group || groupOf(r.status) === group)
    .filter((r) => urgency === 'all' || r.urgency === urgency)
    .filter((r) => context === 'all' || r.context === context)
    .filter((r) => !needle || [r.id, r.drug, ...r.lender, ...r.legs.map((l) => l.hospital)].some((t) => t.toLowerCase().includes(needle)));

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };
  const sel = all.find((r) => r.id === selId) ?? all[0];

  /**
   * Confirm a waive (API-XC-005). SM-7 makes it a state change to WAIVED with a reason, so the row
   * is updated, the success banner names the obligation, and one hash-chained audit row is appended
   * (SEC-003) so UI-18 shows it. The audit row is in memory only — a reload restores the fixtures.
   */
  const confirmWaive = (reason: string) => {
    if (!waiveTarget) return;
    const entry = appendAuditEntry({
      action: 'WAIVE',
      entityType: 'return_obligation',
      entityId: waiveTarget.id,
      before: { state: waiveTarget.state, waived_reason: null },
      after: { state: 'WAIVED', waived_reason: reason },
      reason,
      actor: HOSPITAL_ADMIN_USER.name,
      role: HOSPITAL_ADMIN_ROLE,
    });
    setObligations((list) => list.map((o) => (
      o.id === waiveTarget.id
        ? { ...o, state: 'WAIVED', waivedBy: HOSPITAL_ADMIN_USER.name, waivedReason: reason, waivedAt: entry.at }
        : o
    )));
    setWaiveBanner({ id: waiveTarget.id, at: entry.at, auditId: entry.id });
    setWaiveTarget(null);
  };

  /** Confirm an escalate-manual (API-F1b-012): one manual leg after escalation, plus an audit row. */
  const confirmEscalate = (reason: string) => {
    if (!escalateTarget) return;
    const entry = appendAuditEntry({
      action: 'UPDATE',
      entityType: 'borrow_request',
      entityId: escalateTarget.id,
      before: { borrow_status: escalateTarget.status, legs: escalateTarget.legs.length, manual_lender: null },
      after: { borrow_status: escalateTarget.status, legs: escalateTarget.legs.length + 1, manual_lender: 'เพิ่มด้วยตนเอง (นอกลำดับ)' },
      reason,
      actor,
      role,
    });
    setEscalations((m) => ({ ...m, [escalateTarget.id]: { reason, at: entry.at } }));
    setEscalateTarget(null);
  };

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>หน้าหลัก</a> <span aria-hidden="true">›</span> <span aria-current="page">คำขอยืมของเรา</span>
          </nav>
          <h1 className="tr-title">
            คำขอยืมระหว่างโรงพยาบาล <span>/ Borrow requests</span>
          </h1>
          <div style={{ fontSize: 13 }}>รพ.สมุทรปราการ · ข้อมูล ณ 19:11 น. · ทุกคำขอต้องให้เภสัชกรอนุมัติก่อนส่ง · ไม่ตอบในเวลา = ส่งต่อผู้ให้ยืมถัดไปอัตโนมัติ</div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s">
            <Icon name="history" />
            ประวัติ
          </button>
          {mayCreate && (
            <button className="btn btn-p">
              <Icon name="plus" />
              สร้างคำขอยืมเอง <span style={{ fontWeight: 400 }}>UI-10</span>
            </button>
          )}
        </div>
      </section>

      {/* UI-06 (lender queue) is not built yet, so its tab is inert for now. */}
      <section aria-label="มุมมองคำขอยืม" className="dirs">
        <button
          type="button"
          className={`dir ${showObligations ? '' : 'dir-on'}`}
          aria-pressed={showObligations ? 'false' : 'true'}
          onClick={() => setView('requests')}
        >
          <span className="dir-icon" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
            <Icon name="inArrow" className="ic20" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="dir-th">คำขอของเรา</span>
            <span className="dir-en">เราเป็นผู้ยืม · UI-05</span>
          </span>
          <span className="num dir-count">{all.length}</span>
          {pendingAll > 0 && (
            <span className="badge t-amber" style={{ fontWeight: 600 }}>
              รออนุมัติ {pendingAll}
            </span>
          )}
        </button>
        <button className="dir" aria-pressed="false" title="UI-06 คิวตอบคำขอ (ยังไม่เปิดในเวอร์ชันนี้)">
          <span className="dir-icon" style={{ background: '#FFF7ED', color: '#9A3412' }}>
            <Icon name="hand" className="ic20" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="dir-th">คิวตอบคำขอ</span>
            <span className="dir-en">เราเป็นผู้ให้ยืม · UI-06</span>
          </span>
          <span className="num dir-count">{LENDER_QUEUE.total}</span>
          <span className="badge t-amber" style={{ fontWeight: 600 }}>
            รอเราตอบ {LENDER_QUEUE.toAnswer}
          </span>
        </button>
        {/* Return obligations (SM-7, API-XC-003): Hospital Admin only — own-hospital scope. */}
        {maySeeObligations && (
          <button
            type="button"
            className={`dir ${showObligations ? 'dir-on' : ''}`}
            aria-pressed={showObligations ? 'true' : 'false'}
            data-part="obligations-tab"
            onClick={() => setView(showObligations ? 'requests' : 'obligations')}
          >
            <span className="dir-icon" style={{ background: '#F0FDF4', color: '#166534' }}>
              <Icon name="undo" className="ic20" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="dir-th">ภาระการคืน</span>
              <span className="dir-en">เราเป็นผู้ยืม · SM-7 · API-XC-003</span>
            </span>
            <span className="num dir-count">{obligations.length}</span>
            {overdueCount > 0 && (
              <span className="badge t-red" style={{ fontWeight: 600 }}>
                เกินกำหนด {overdueCount}
              </span>
            )}
          </button>
        )}
      </section>

      {showObligations ? (
        <section className="card" style={{ padding: 0 }} data-part="obligations-card">
          <div className="tr-card-head">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h2 className="sec-h">
                ภาระการคืน <span className="en">SM-7 · API-XC-003</span>
              </h2>
              {stateFilter && (
                <button className="link" onClick={() => setStateFilter(null)}>
                  ล้างตัวกรองสถานะ
                </button>
              )}
            </div>
            <ObligationTiles counts={obligationCountList} active={stateFilter} onPick={setStateFilter} />
          </div>
          {waiveBanner && (
            <div
              role="status"
              className="br-banner"
              data-part="obligation-waive-banner"
              style={{ background: '#F0FDF4', borderColor: '#BBF7D0', color: '#166534', margin: '12px 16px 0' }}
            >
              <Icon name="checkc" className="ic20" style={{ color: '#166534' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="br-banner-t">ยกเว้นภาระการคืนแล้ว</span>
                <span className="br-banner-s">
                  {waiveBanner.id} เปลี่ยนสถานะเป็น WAIVED เมื่อ {waiveBanner.at} · บันทึกเหตุผลใน audit log แล้ว{' '}
                  <span className="code">{waiveBanner.auditId}</span> (API-XC-005, SEC-003)
                </span>
              </span>
            </div>
          )}
          <div className="tr-filters">
            <span style={{ fontSize: 12 }}>
              ภาระการคืนของคำขอเรา (เราเป็นผู้ยืม) · เรียงตามความเร่งด่วน: เกินกำหนด → แจ้งเตือนแล้ว → เร็วสุดก่อน
            </span>
            <span style={{ flex: '1 1 0' }} />
            <span style={{ fontSize: 12 }}>
              แจ้งเตือนอัตโนมัติ due−7 และ due−1 วัน <span className="en">FR-XC-003</span>
            </span>
          </div>
          <ObligationTable rows={obligationRows} mayWaive={mayWaive} onWaive={setWaiveTarget} />
        </section>
      ) : (
        <section className="card" style={{ padding: 0 }}>
          <div className="tr-card-head">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h2 className="sec-h">
                สถานะคำขอ <span className="en">SM-1</span>
              </h2>
              {group && (
                <button className="link" onClick={() => setGroup(null)}>
                  ล้างตัวกรองสถานะ
                </button>
              )}
            </div>
            <BorrowStatusTiles counts={counts} active={group} onPick={setGroup} />
          </div>
          <div className="tr-filters">
            <label className="tr-search">
              <Icon name="search" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขคำขอ BR- / ชื่อยา / โรงพยาบาล" aria-label="ค้นหาคำขอยืม" />
            </label>
            <select className={`sel ${urgency !== 'all' ? 'sel-on' : ''}`} aria-label="ความเร่งด่วน" value={urgency} onChange={(e) => setUrgency(e.target.value as 'all' | Urgency)}>
              <option value="all">ความเร่งด่วน: ทั้งหมด</option>
              <option value="CRITICAL">เร่งด่วนมาก</option>
              <option value="URGENT">เร่งด่วน</option>
              <option value="NORMAL">ปกติ</option>
            </select>
            <select className={`sel ${context !== 'all' ? 'sel-on' : ''}`} aria-label="บริบท" value={context} onChange={(e) => setContext(e.target.value as 'all' | BorrowContext)}>
              <option value="all">บริบท: ทั้งหมด</option>
              <option value="STOCK_ALERT">STOCK_ALERT · แจ้งเตือนสต็อก</option>
              <option value="EMERGENCY">EMERGENCY · เหตุฉุกเฉิน</option>
              <option value="MANUAL">MANUAL · สร้างเอง</option>
            </select>
            <select className={`sel ${days !== 90 ? 'sel-on' : ''}`} aria-label="ช่วงเวลา" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={90}>90 วันล่าสุด</option>
              <option value={30}>30 วันล่าสุด</option>
              <option value={7}>7 วันล่าสุด</option>
            </select>
            <span style={{ flex: '1 1 0' }} />
            <span style={{ fontSize: 12 }}>เรียง: ต้องตัดสินใจก่อน → เวลาที่เหลือ</span>
          </div>
          <BorrowTable rows={rows} activeId={drawerOpen ? sel.id : null} tick={tick} onOpen={open} />
        </section>
      )}

      {drawerOpen && (
        <BorrowDrawer
          key={sel.id}
          request={sel}
          tick={tick}
          decision={decision[sel.id]}
          onDecide={(d) => setDecision((m) => ({ ...m, [sel.id]: d }))}
          onEscalate={setEscalateTarget}
          onClose={() => setDrawerOpen(false)}
          role={role}
        />
      )}

      {/* Waive (API-XC-005): a mandatory reason, then WAIVED + an audit row (SEC-003). */}
      {waiveTarget && (
        <ReasonDialog
          title="ยกเว้นภาระการคืน · Waive (API-XC-005)"
          detail={
            <>
              <div>
                <b className="code">{waiveTarget.id}</b> · {waiveTarget.requestId} · {waiveTarget.leg}
              </div>
              <div>
                {waiveTarget.drug} · {waiveTarget.qty} {waiveTarget.unit} · ยังค้างคืน{' '}
                <span className="num">{outstandingOf(waiveTarget)}</span> {waiveTarget.unit} · คู่สัญญา {waiveTarget.creditor}
              </div>
              <div>
                กำหนดคืน {waiveTarget.dueDate} ({dueLabel(waiveTarget.daysLeft)})
              </div>
              <div style={{ marginTop: 8 }}>
                ยืนยันแล้วสถานะจะเปลี่ยนจาก <b>{waiveTarget.state}</b> เป็น <b>WAIVED</b> และเหตุผลจะถูกบันทึกไว้ใน
                audit log (SEC-003) · การยกเว้นเป็นสิทธิ์ของผู้ดูแลโรงพยาบาล (HOSPITAL_ADMIN) เท่านั้น
              </div>
              <div style={{ marginTop: 8, color: '#991B1B' }}>
                ยกเว้นแล้วปิดภาระการคืนนี้ — เปิดคืนกลับไม่ได้
              </div>
            </>
          }
          confirmLabel="ยืนยันการยกเว้น"
          onConfirm={confirmWaive}
          onClose={() => setWaiveTarget(null)}
        />
      )}

      {/* escalate-manual (API-F1b-012): only reachable from an ESCALATED request. */}
      {escalateTarget && (
        <ReasonDialog
          title="เพิ่มผู้ให้ยืมด้วยตนเอง · escalate-manual (API-F1b-012)"
          detail={
            <>
              <div>
                <b className="code">{escalateTarget.id}</b> · {escalateTarget.drug} · {escalateTarget.qty} {escalateTarget.unit}
              </div>
              <div>{escalateTarget.banner.text}</div>
              <div style={{ marginTop: 8 }}>
                สถานะ <b>{escalateTarget.status}</b> — ลำดับผู้ให้ยืมของระบบหมดแล้ว จึงเพิ่มผู้ให้ยืมนอกลำดับได้
                (FR-F1b-011, SM-1) · ระบบจะเพิ่มรอบใหม่และบันทึกไว้ใน audit log
              </div>
            </>
          }
          confirmLabel="ยืนยันเพิ่มผู้ให้ยืม"
          onConfirm={confirmEscalate}
          onClose={() => setEscalateTarget(null)}
        />
      )}
    </>
  );
}
