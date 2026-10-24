import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useAuth } from '../../../context/AuthContext';
import { homeHrefFor } from '../../../data/navigation';
import { mayActFor } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { AllocationDrawer } from '../components/AllocationDrawer';
import { ExpiryPipelineStepper } from '../components/ExpiryPipelineStepper';
import { ReasonDialog } from '../../hospital-admin/components/ReasonDialog';
import { useNearExpiry } from '../data/useNearExpiry';
import { ManualPlanDialog } from '../components/ManualPlanDialog';
import { cancelPlan, choosePlanOption, decidePlan, getPoolCandidates, objectPlan, sendPoolToAgent, withdrawNearExpiry } from '../../../services/expiryApi';
import type { ApiPlanOption } from '../../../services/expiryApi';
import { usePoolAndPlans } from '../data/useExpiryF2';
import { COST_LIMIT_PCT, planStatusMeta } from '../data/pool';
import type { AllocationPlan, PlanStatus, PoolLot } from '../data/pool';
import '../pool.css';

type PoolTab = 'pool' | 'plans' | 'approved' | 'history';

/** Plans that are approved and moving, and plans that are over: kept out of the list that still needs a decision. */
const MOVING: PlanStatus[] = ['APPROVED', 'AUTO_APPROVED', 'TRANSPORTING'];
const FINISHED: PlanStatus[] = ['COMPLETED', 'CANCELLED'];
const tabOfPlan = (st: PlanStatus): PoolTab => (MOVING.includes(st) ? 'approved' : FINISHED.includes(st) ? 'history' : 'plans');

const TABS: { id: PoolTab; label: string; ui: string }[] = [
  { id: 'pool', label: 'คลังกลาง (ถูกกันไว้)', ui: 'UI-08' },
  { id: 'plans', label: 'แผนรอเห็นชอบ', ui: 'UI-09' },
  { id: 'approved', label: 'อนุมัติแล้ว · ขนส่ง', ui: 'UI-09' },
  { id: 'history', label: 'จบแล้ว', ui: 'UI-09' },
];


/**
 * UI-08 Central pool + UI-09 Allocation plan review (spec F2a). UI only: mock
 * data; approve / uneconomical decisions are local state. Pool quantities are
 * held (ถูกกันไว้) at the origin hospital until a plan ships them.
 */
/**
 * UI-08 Central pool + UI-09 Allocation plan review. `role` gates every approval through
 * `lib/rbac.ts` and drives the breadcrumb home.
 */
export function PoolAllocationPage({ role = 'PHARMACIST' }: { role?: RoleCode }) {
  const [tab, setTab] = useState<PoolTab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'pool' || t === 'approved' || t === 'history' ? t : 'plans';
  });
  const ne = useNearExpiry();
  const [selId, setSelId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const data = usePoolAndPlans();
  const live = data.source === 'live';
  const POOL_LOTS = data.pool;
  const POOL_TOTAL_VALUE = POOL_LOTS.reduce((s, l) => s + l.value, 0);
  const [localPlans, setPlans] = useState<AllocationPlan[] | null>(null);
  const allPlans = live ? data.plans : (localPlans ?? data.plans);
  // "แผนรอเห็นชอบ" keeps only plans that still need a decision; approved ones move to their own tab, finished ones to history.
  const awaitingPlans = allPlans.filter((p) => !MOVING.includes(p.status) && !FINISHED.includes(p.status));
  const approvedPlans = allPlans.filter((p) => MOVING.includes(p.status));
  const historyPlans = allPlans.filter((p) => FINISHED.includes(p.status));
  const plans = awaitingPlans;
  const tabPlans = tab === 'approved' ? approvedPlans : tab === 'history' ? historyPlans : awaitingPlans;
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** Live: every decision is an API call; the plan is reloaded from the server afterwards. */
  const run = (p: AllocationPlan, call: Promise<unknown>, doneText: string) => {
    setBusy(true);
    setActionError(null);
    call
      .then(() => data.reload())
      .then(() => setDecisions((m) => ({ ...m, [p.id]: doneText })))
      .catch((e: Error) => setActionError(e.message))
      .finally(() => setBusy(false));
  };
  const liveApprove = (p: AllocationPlan) => p.live && run(p, decidePlan(p.live.uuid, 'APPROVED', p.version), 'บันทึกการเห็นชอบแล้ว (audit_log)');
  const liveApproveAll = (p: AllocationPlan, noteText: string, lines?: { receiver: string; qty: number }[]) =>
    p.live && run(p, decidePlan(p.live.uuid, 'APPROVED', p.version, noteText, true, lines), 'บันทึกมติที่ประชุมและปรับปรุงยอดจัดสรรเรียบร้อยแล้ว · เริ่มขั้นตอนขนส่ง (UI-14)');
  const liveReject = (p: AllocationPlan, comment: string) => p.live && run(p, decidePlan(p.live.uuid, 'REJECTED', p.version, comment), 'บันทึกการไม่เห็นชอบแล้ว · แผนเข้าสถานะต้องหารือ');
  const liveOption = (p: AllocationPlan, id: string, label: string) => p.live && run(p, choosePlanOption(p.live.uuid, id as ApiPlanOption, p.version), `บันทึกทางเลือกแล้ว: ${label} (audit_log)`);
  const liveCancel = (p: AllocationPlan, reason: string) => p.live && run(p, cancelPlan(p.live.uuid, reason), 'ส่งคำขอยกเลิกแล้ว · ถ้าเป็นแผนที่อนุมัติแล้วต้องให้อีกฝ่ายยินยอมด้วย');
  const liveObject = (p: AllocationPlan, reason: string) => p.live && run(p, objectPlan(p.live.uuid, reason), 'ยื่นคัดค้านแล้ว · แผนเข้าสถานะต้องหารือ และแจ้งทุก รพ.ในแผน');

  /* F2: the owner pharmacist turns a pool lot into a plan, by the allocation agent or by hand. */
  const { user } = useAuth();
  const mayPlan = mayActFor(role, 'PHARMACIST', 'approveAllocation');
  const [manualFor, setManualFor] = useState<PoolLot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const planCreated = (planNo: string, status: string, detail = '') => {
    setNotice(`สร้างแผน ${planNo} แล้ว · ${status === 'READY_FOR_APPROVAL' ? 'รอ รพ.ที่เกี่ยวข้องเห็นชอบ' : 'อนุมัติอัตโนมัติ (เครือข่ายเดียวกัน) · เริ่มขั้นตอนขนส่ง'}${detail}`);
    setTab('plans');
    return data.reload();
  };
  /* One click = one agent run per selected lot, one after the other (the agent builds one plan per pool lot). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  /* Lots nobody in the region can use before expiry are not worth an agent run: found out up front with the code-side candidate list. */
  const [cands, setCands] = useState<Record<string, { ok: boolean; note: string }>>({});
  const [batch, setBatch] = useState<{ running: boolean; done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<{ lot: string; ok: boolean; skipped?: boolean; text: string }[] | null>(null);
  /* An allocation round covers every lot in the pool (any hospital's); the plan still needs the origin and every receiver to approve. */
  const mineOpen = (l: PoolLot) => !!l.live && l.live.status !== 'ALLOCATED' && l.live.qtyAvailable > 0;
  // Lots with nothing left to match (their plan is already moving) are listed apart, not in the waiting list.
  const waitingLots = POOL_LOTS.filter((l) => !l.live || mineOpen(l));
  const matchedLots = POOL_LOTS.filter((l) => !!l.live && !mineOpen(l));
  useEffect(() => {
    if (!live) return;
    const todo = waitingLots.filter((l) => l.live && mineOpen(l) && !cands[l.live.uuid]);
    if (todo.length === 0) return;
    let stale = false;
    Promise.all(
      todo.map((l) =>
        getPoolCandidates(l.live!.uuid)
          .then(({ data: d }) => {
            const any = d.candidates.some((c) => c.maxQty > 0);
            return [l.live!.uuid, { ok: !d.blocker && any, note: d.blocker ?? (any ? '' : 'ไม่มี รพ.ในเขตที่ใช้ยานี้ได้ทันก่อนหมดอายุ') }] as const;
          })
          .catch(() => [l.live!.uuid, { ok: true, note: '' }] as const),
      ),
    ).then((pairs) => {
      if (stale) return;
      setCands((cur) => ({ ...cur, ...Object.fromEntries(pairs) }));
      // drop the lots that turned out to have no receiver from the selection
      setSelected((cur) => new Set([...cur].filter((id) => pairs.find(([k]) => k === id)?.[1].ok !== false)));
    });
    return () => { stale = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, data.pool]);
  // Pre-select every lot we can allocate, so the common case is a single click.
  useEffect(() => {
    if (seeded || !live || data.pool.length === 0) return;
    setSelected(new Set(data.pool.filter(mineOpen).map((l) => l.live!.uuid)));
    setSeeded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, data.pool, seeded, user?.hospitalId]);
  /** A lot nobody can use: take it back out of the pool so the hospital can use or re-decide it (owner only). */
  const [withdrawTarget, setWithdrawTarget] = useState<PoolLot | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | undefined>(undefined);
  const confirmWithdraw = (reason: string) => {
    const l = withdrawTarget;
    if (!l?.live?.itemId) return;
    setBusy(true);
    setWithdrawError(undefined);
    withdrawNearExpiry(l.live.itemId, reason)
      .then(() => { setWithdrawTarget(null); setNotice(`ถอน ${l.drug} ออกจากคลังกลางแล้ว · กลับไปรอตัดสินใจที่หน้ายาใกล้หมดอายุ`); return data.reload(); })
      .catch((e: Error) => setWithdrawError(e.message))
      .finally(() => setBusy(false));
  };
  const toggleLot = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const runAgentBatch = async (lots: PoolLot[]) => {
    if (lots.length === 0) return;
    setActionError(null);
    setNotice(null);
    setBatchResult(null);
    setBatch({ running: true, done: 0, total: lots.length });
    const results: { lot: string; ok: boolean; skipped?: boolean; text: string }[] = [];
    // Soonest expiry first, then the highest value, so the lots most at risk get first pick of the receivers.
    const ordered = [...lots].sort((x, y) => x.daysLeft - y.daysLeft || y.value - x.value);
    for (const l of ordered) {
      try {
        const pre = await getPoolCandidates(l.live!.uuid).then(({ data: d }) => ({ blocker: d.blocker, any: d.candidates.some((c) => c.maxQty > 0) })).catch(() => null);
        if (pre && (pre.blocker || !pre.any)) {
          results.push({ lot: l.drug, ok: false, skipped: true, text: pre.blocker ?? 'ไม่มี รพ.ในเขตที่ใช้ยานี้ได้ทันก่อนหมดอายุ (ต้องมีรายการยาที่จับคู่แล้วและผลพยากรณ์) · ข้าม ไม่สร้างแผน' });
          setBatch({ running: true, done: results.length, total: lots.length });
          continue;
        }
        const { data: r } = await sendPoolToAgent(l.live!.uuid);
        const a = r.agent;
        const how = a.status === 'OK' ? `Agent (${a.model ?? '—'})` : `สูตร F-22 แทน Agent (${a.status})`;
        results.push({ lot: l.drug, ok: true, text: `แผน ${r.plan.planNo} · ${r.plan.status === 'READY_FOR_APPROVAL' ? 'รอ รพ.ที่เกี่ยวข้องเห็นชอบ' : 'อนุมัติอัตโนมัติ (เครือข่ายเดียวกัน)'} · ${how}${a.summary ? ` — ${a.summary}` : ''}` });
      } catch (e) {
        results.push({ lot: l.drug, ok: false, text: (e as Error).message });
      }
      setBatch({ running: true, done: results.length, total: lots.length });
    }
    setBatch(null);
    setBatchResult(results);
    setSelected(new Set());
    setTab('plans');
    await data.reload();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pendingMine = plans.filter((p) => p.status === 'PENDING_MY_APPROVAL').length;
  const needDoc = approvedPlans.filter((p) => p.status === 'APPROVED' || p.status === 'TRANSPORTING').length;
  const needsDiscussion = plans.filter((p) => p.status === 'NEEDS_DISCUSSION').length;

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };

  const sel = allPlans.find((p) => p.id === selId) ?? tabPlans[0] ?? allPlans[0];

  const approve = (id: string) => {
    setPlans((prev) =>
      (prev ?? allPlans).map((p) =>
        p.id === id
          ? {
              ...p,
              status: 'APPROVED' as PlanStatus,
              approvals: p.approvals.map((a) =>
                a.state === 'WAITING' && a.hospital === 'รพ.สมุทรปราการ'
                  ? { ...a, state: 'APPROVED' as const, at: '13 ต.ค. · 19:22 น.' }
                  : a,
              ),
            }
          : p,
      ),
    );
    setDecisions((m) => ({ ...m, [id]: 'เห็นชอบแผนแล้ว 19:22 น. · ระบบสร้างเอกสารให้พิมพ์ทันที (XC-1)' }));
  };

  const decideUneconomical = (id: string, label: string) => {
    setDecisions((m) => ({ ...m, [id]: `บันทึกตัดสินใจแล้ว: ${label} · 19:22 น. (audit_log)` }));
  };

  return (
    <>
      <section className="pagehead">
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 12, lineHeight: '16px' }}>
            <a href={homeHrefFor(role)} className="link" style={{ fontSize: 12, fontWeight: 400 }}>
              หน้าหลัก
            </a>{' '}
            <span aria-hidden="true">›</span> <span aria-current="page">คลังกลาง · แผนจัดสรร</span>
          </nav>
          <h1 className="tr-title">
            คลังกลาง · แผนจัดสรร <span>/ Central pool · UI-08 · Allocation plans · UI-09</span>
          </h1>
          <div style={{ fontSize: 13 }}>
            เขตสุขภาพที่ 6 · คลังกลางรวมเฉพาะข้อมูล (ถูกกันไว้ = กันออกจากสต็อกใช้งาน) · แผนจัดสรรมาจากการจับคู่ของ Agent ·
            แผนที่ไม่คุ้มค่าขนส่ง (F-23 ≥ {COST_LIMIT_PCT}%) ต้องเลือก 1 ใน 4 ทางก่อนส่ง
          </div>
        </div>
        <div className="pagehead-actions">
          <button className="btn btn-s">
            <Icon name="download" />
            CSV
          </button>
          <button className="btn btn-s">
            <Icon name="fileText" />
            PDF
          </button>
        </div>
      </section>

      <ExpiryPipelineStepper
        current={tab === 'pool' ? 'pool' : 'plans'}
        counts={{ expiry: ne.items.filter((i) => i.status === 'PENDING').length, pool: waitingLots.length, plans: pendingMine, discussion: needsDiscussion }}
        role={role}
        onSelect={(step) => setTab(step)}
      />

      {needsDiscussion > 0 && (
        <section className="pl-alert" role="alert" data-part="discussion-alert">
          <h2>
            ⚠ {needsDiscussion} แผนที่มี รพ. ไม่เห็นด้วย — ต้องหารือก่อนส่งของ <span className="en" style={{ fontWeight: 400 }}>NEEDS_DISCUSSION · ASM-16</span>
          </h2>
          {plans.filter((p) => p.status === 'NEEDS_DISCUSSION').map((p) => {
            const rejected = p.approvals.filter((a) => a.state === 'REJECTED');
            return (
              <div key={p.id} className="pl-alert-row">
                <div className="pl-alert-main">
                  <b>{p.id}</b> · {p.drug} · <span className="num">{p.qty.toLocaleString()} {p.unit}</span>
                  <div className="why">
                    {rejected.length > 0
                      ? rejected.map((a) => `${a.hospital}${a.comment ? ` — "${a.comment}"` : ''}`).join(' · ')
                      : 'มี รพ.ไม่เห็นชอบหรือคัดค้านแผน'}
                    {' '}· รอนัดหารือ {p.approvals.length} รพ.
                  </div>
                </div>
                <button className="btn btn-p btn-sm" onClick={() => { setTab('plans'); open(p.id); }}>
                  ดูแผนและปรับยอดจัดสรร
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* KPI row */}
      <section className="pl-kpis">
        <div className="pl-kpi">
          <div className="pl-kpi-label">
            ในคลังกลาง (ถูกกันไว้) <span className="en">POOL · ASM-12</span>
          </div>
          <div className="pl-kpi-val num">{POOL_LOTS.length} ล็อต</div>
          <div className="pl-kpi-sub num">
            รวม ฿{Math.round(POOL_TOTAL_VALUE).toLocaleString()} · อยู่ในแผน {plans.filter((p) => p.live?.openForApproval).length} แผน
          </div>
        </div>
        <div className="pl-kpi pl-kpi-warn">
          <div className="pl-kpi-label">
            รอฉันเห็นชอบ <span className="en">MY APPROVAL</span>
          </div>
          <div className="pl-kpi-val num">{pendingMine} แผน</div>
          <div className="pl-kpi-sub">{live ? 'ทุก รพ.ที่เกี่ยวข้องต้องเห็นชอบ · เกินกำหนดเข้าสถานะต้องหารือ' : 'AP-2026-000046 ใกล้หมดเวลา 14:30 น.'}</div>
        </div>
        <div className="pl-kpi">
          <div className="pl-kpi-label">
            รอออกเอกสาร <span className="en">XC-1</span>
          </div>
          <div className="pl-kpi-val num">{needDoc} แผน</div>
          <div className="pl-kpi-sub">อนุมัติครบแล้ว ระบบสร้างใบส่งของให้พิมพ์ทันที</div>
        </div>
        <div className="pl-kpi" style={{ borderLeftColor: '#D97706', background: needsDiscussion > 0 ? '#FFFBEB' : '#FFFFFF' }}>
          <div className="pl-kpi-label">
            รอนัดประชุมหารือ <span className="en">NEEDS_DISCUSSION · ASM-16</span>
          </div>
          <div className="pl-kpi-val num" style={{ color: needsDiscussion > 0 ? '#D97706' : undefined }}>{needsDiscussion} แผน</div>
          <div className="pl-kpi-sub">
            {needsDiscussion > 0 ? 'มี รพ. ปฏิเสธยอดจัดสรร · ต้องเจรจาเฉพาะ รพ. ในแผน' : 'ไม่มีแผนที่ติดข้อโต้แย้ง'}
          </div>
        </div>
      </section>

      {(notice || (actionError && !drawerOpen)) && (
        <div className="card" role={actionError && !drawerOpen ? 'alert' : 'status'} style={{ padding: '10px 16px', fontSize: 13, color: actionError && !drawerOpen ? '#B91C1C' : '#0F2A5C' }}>
          {actionError && !drawerOpen ? actionError : notice}
        </div>
      )}

      {batchResult && (
        <section className="card pl-batch" role="status" data-part="agent-batch-result">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b>Agent จัดสรรเสร็จแล้ว · สร้างแผน {batchResult.filter((r) => r.ok).length} แผนจาก {batchResult.length} ล็อต{batchResult.some((r) => r.skipped) ? ` · ข้าม ${batchResult.filter((r) => r.skipped).length} ล็อตที่ไม่มีผู้รับ` : ''}</b>
            <button className="link" onClick={() => setBatchResult(null)}>ปิด</button>
          </div>
          <ul>
            {batchResult.map((r, idx) => (
              <li key={idx} className={r.ok ? '' : r.skipped ? 'pl-batch-skip' : 'pl-batch-err'}>
                <b>{r.lot}</b> — {r.ok ? r.text : r.skipped ? `ข้าม: ${r.text}` : `ไม่สำเร็จ: ${r.text}`}
              </li>
            ))}
          </ul>
          <div className="sub">ทุก รพ.ที่อยู่ในแผนต้องเห็นชอบก่อนส่งของ · ดูและตรวจรายแผนได้ในแท็บแผนจัดสรร</div>
        </section>
      )}

      <section className="card" style={{ padding: 0 }}>
        <div className="tr-card-head">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab ${tab === t.id ? 'tab-on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.id === 'pool' ? 'คลังกลาง · รอจับคู่' : t.label} <span className="cnt">{t.id === 'pool' ? waitingLots.length : t.id === 'approved' ? approvedPlans.length : t.id === 'history' ? historyPlans.length : awaitingPlans.length}</span>
              </button>
            ))}
            <span className="sub" style={{ marginLeft: 6 }}>
              {tab === 'pool'
                ? 'สินค้ายังอยู่ที่ รพ.ต้นทาง · เบิกใช้ไม่ได้จนกว่าจะส่งมอบ'
                : tab === 'plans' ? 'แผนที่ยังรอ รพ. เห็นชอบหรือหารือ · กดแถวเพื่อดูสูตร F-22 / F-23 และตัดสินใจ' : 'กดแถวเพื่อดูรายละเอียดแผน'}
            </span>
          </div>
        </div>

        {tab === 'pool' ? (
          <>
          {live && (() => {
            const mine = waitingLots.filter((l) => mineOpen(l) && cands[l.live!.uuid]?.ok !== false);
            const noReceiver = waitingLots.filter((l) => !!l.live && cands[l.live.uuid]?.ok === false).length;
            const chosen = mine.filter((l) => selected.has(l.live!.uuid));
            return (
              <div className="pl-bulk" data-part="agent-bulk">
                {mine.length > 0 ? (
                  <>
                    <label className="pl-bulk-all">
                      <input
                        type="checkbox"
                        checked={chosen.length === mine.length}
                        ref={(el) => { if (el) el.indeterminate = chosen.length > 0 && chosen.length < mine.length; }}
                        onChange={(e) => setSelected(e.target.checked ? new Set(mine.map((l) => l.live!.uuid)) : new Set())}
                      />
                      เลือกทุกล็อตในรอบนี้ ({mine.length})
                    </label>
                    <button
                      className="btn btn-p"
                      disabled={!mayPlan || chosen.length === 0 || !!batch}
                      title="ส่งล็อตที่เลือกให้ Agent จับคู่ รพ.ผู้รับ · โค้ดตรวจ F-22/F-23 ก่อนบันทึกทุกแผน"
                      onClick={() => void runAgentBatch(chosen)}
                    >
                      <Icon name="sparkle" />
                      {batch ? `กำลังจัดสรร ${batch.done}/${batch.total}…` : `ให้ Agent จัดสรรรอบนี้ ${chosen.length} ล็อต`}
                    </button>
                    <span className="sub">
                      ส่งยาที่ทุก รพ.ปล่อยเข้าคลังกลางไปจับคู่ผู้รับทั้งเขตทีเดียว (เรียงล็อตที่ใกล้หมดอายุก่อน) · ผู้รับคือ รพ.ในเขตที่ใช้ยาตัวนี้ ไม่ต้องเคยปล่อยยาเข้าคลังกลาง · ได้แผนแยกต่อล็อต ทุก รพ.ในแผนต้องเห็นชอบ
                    </span>
                  </>
                ) : (
                  <span className="sub">ไม่มีล็อตที่จัดสรรได้ในรอบนี้</span>
                )}
                {noReceiver > 0 && (
                  <span className="sub" style={{ color: '#92400E' }}>
                    ⚠ {noReceiver} ล็อตไม่มี รพ.ที่ใช้ทันก่อนหมดอายุ จึงไม่รวมในรอบ (เจ้าของล็อตกด "ถอนกลับมาใช้เอง" ในแถวได้)
                  </span>
                )}
              </div>
            );
          })()}
          <div className="ne-tablewrap">
            <table className="tbl pl-tbl" aria-label="คลังกลาง">
              <thead>
                <tr>
                  <th>ล็อต</th>
                  <th>ยา</th>
                  <th style={{ width: 110 }}>จำนวน</th>
                  <th style={{ width: 110, textAlign: 'right' }}>มูลค่า</th>
                  <th style={{ width: 170 }}>หมดอายุ</th>
                  <th>ปล่อยโดย</th>
                  <th style={{ width: 120 }}>สถานะ</th>
                  {live && <th style={{ width: 230 }}>จัดสรร</th>}
                </tr>
              </thead>
              <tbody>
                {waitingLots.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="code" style={{ fontWeight: 600, color: '#1D4ED8' }}>
                        {l.id}
                      </span>
                    </td>
                    <td>
                      <b style={{ color: '#0F2A5C', fontWeight: 600 }}>{l.drug}</b>
                      <div className="sub code">รหัส {l.code}</div>
                    </td>
                    <td className="num" style={{ fontWeight: 600, color: '#0F2A5C' }}>
                      {l.qty} {l.unit}
                    </td>
                    <td style={{ textAlign: 'right' }} className="num">
                      ฿{l.value.toLocaleString()}
                    </td>
                    <td>
                      {l.expiry} <span className="sub num">· เหลือ {l.daysLeft} วัน</span>
                    </td>
                    <td>
                      {l.from}
                      <div className="sub">
                        {l.releasedBy} · {l.releasedAt}
                      </div>
                    </td>
                    <td>
                      <span className="badge t-teal">ถูกกันไว้</span>
                      {l.live?.planNo && <div className="sub code">{l.live.status === 'ALLOCATED' ? 'กำลังขนส่ง' : 'ในแผน'} {l.live.planNo}</div>}
                    </td>
                    {live && (
                      <td>
                        {!l.live ? (
                          <span className="sub">–</span>
                        ) : l.live.status === 'ALLOCATED' ? (
                          <span className="sub">ส่วนที่เหลือ {l.live.qtyAvailable.toLocaleString()} {l.unit} จัดสรรได้เมื่อแผนก่อนหน้าส่งถึง</span>
                        ) : l.live.qtyAvailable > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            {cands[l.live.uuid]?.ok === false ? (
                              <>
                                <span className="badge t-amber" title={cands[l.live.uuid].note}>ไม่มีผู้รับที่ใช้ทัน</span>
                                {l.live.originId === user?.hospitalId && l.live.itemId ? (
                                  <button className="btn btn-s btn-sm" disabled={busy || !mayPlan} onClick={() => { setWithdrawError(undefined); setWithdrawTarget(l); }} title="ถอนออกจากคลังกลาง กลับไปเป็นของ รพ.เรา">
                                    ถอนกลับมาใช้เอง
                                  </button>
                                ) : (
                                  <span className="sub">เจ้าของล็อตถอนกลับได้</span>
                                )}
                              </>
                            ) : (
                            <label className="pl-pick">
                              <input type="checkbox" checked={selected.has(l.live.uuid)} disabled={!!batch} onChange={() => toggleLot(l.live!.uuid)} aria-label={`เลือก ${l.drug} ให้ Agent จัดสรร`} />
                              ให้ Agent จัดสรร
                            </label>
                            )}
                            {l.live.originId === user?.hospitalId && (
                              <button className="link" disabled={!mayPlan || !!batch} onClick={() => setManualFor(l)}>
                                สร้างแผนเอง
                              </button>
                            )}
                            <span className="sub num" style={{ width: '100%' }}>เหลือจัดสรร {l.live.qtyAvailable.toLocaleString()} {l.unit}</span>
                          </div>
                        ) : (
                          <span className="sub">อยู่ในแผนครบจำนวนแล้ว</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matchedLots.length > 0 && (
            <details className="pl-matched" data-part="matched-lots">
              <summary>
                จับคู่แล้ว · อยู่ในแผน ({matchedLots.length} ล็อต) <span className="sub">ไม่ต้องจัดสรรซ้ำ · ส่วนที่เหลือจัดสรรได้เมื่อแผนเดิมส่งถึง</span>
              </summary>
              <div className="ne-tablewrap">
                <table className="tbl pl-tbl" aria-label="ล็อตที่จับคู่แล้ว">
                  <thead>
                    <tr>
                      <th>ล็อต</th>
                      <th>ยา</th>
                      <th style={{ width: 110 }}>จำนวน</th>
                      <th style={{ width: 110, textAlign: 'right' }}>มูลค่า</th>
                      <th style={{ width: 170 }}>หมดอายุ</th>
                      <th>ปล่อยโดย</th>
                      <th style={{ width: 230 }}>แผน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedLots.map((l) => (
                      <tr key={l.id}>
                        <td className="code">{l.code}</td>
                        <td><b>{l.drug}</b></td>
                        <td className="num">{l.qty.toLocaleString()} {l.unit}</td>
                        <td style={{ textAlign: 'right' }} className="num">฿{l.value.toLocaleString()}</td>
                        <td>{l.expiry} <span className="sub num">· เหลือ {l.daysLeft} วัน</span></td>
                        <td>{l.from}</td>
                        <td>
                          {l.live?.planNo ? (
                            <button className="link code" onClick={() => { const pl = allPlans.find((p) => p.id === l.live!.planNo); if (pl) { setTab(tabOfPlan(pl.status)); open(pl.id); } else { setTab('approved'); } }}>
                              {l.live.status === 'ALLOCATED' ? 'กำลังขนส่ง' : 'ในแผน'} {l.live.planNo}
                            </button>
                          ) : <span className="sub">–</span>}
                          {l.live && l.live.qtyAvailable > 0 && <div className="sub">ส่วนที่เหลือ {l.live.qtyAvailable.toLocaleString()} {l.unit} รอแผนเดิมส่งถึง</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          </>
        ) : (
          <div className="ne-tablewrap">
            <table className="tbl pl-tbl" aria-label="แผนจัดสรร">
              <thead>
                <tr>
                  <th>แผน</th>
                  <th>ยา</th>
                  <th>ต้นทาง → ปลายทาง</th>
                  <th style={{ width: 100, textAlign: 'right' }}>มูลค่า</th>
                  <th style={{ width: 190 }}>ค่าขนส่ง / F-23</th>
                  <th style={{ width: 190 }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {tabPlans.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8' }}>
                      {tab === 'plans' ? 'ไม่มีแผนที่รอเห็นชอบ · พร้อมสำหรับรอบจัดสรรถัดไป' : tab === 'approved' ? 'ยังไม่มีแผนที่อนุมัติและอยู่ระหว่างขนส่ง' : 'ยังไม่มีแผนที่จบแล้ว'}
                    </td>
                  </tr>
                )}
                {tabPlans.map((p) => {
                  const meta = planStatusMeta(p.status);
                  return (
                    <tr key={p.id} className={drawerOpen && sel?.id === p.id ? 'r-active' : ''}>
                      <td>
                        <button className="rowbtn" onClick={() => open(p.id)}>
                          <span className="code" style={{ fontWeight: 600, color: '#1D4ED8' }}>
                            {p.id}
                          </span>
                          <div className="sub">v{p.version}</div>
                        </button>
                      </td>
                      <td>
                        <button className="rowbtn" onClick={() => open(p.id)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`ved ved-${p.ved} ved-sm`}>{p.ved}</span>
                            <b style={{ color: '#0F2A5C', fontWeight: 600 }}>{p.drug}</b>
                          </div>
                          <div className="sub num">
                            {p.qty} {p.unit} · Lot {p.lotNo}
                          </div>
                        </button>
                      </td>
                      <td>
                        {p.from} <span aria-hidden="true">→</span> {p.to}
                        <div className="sub num">{p.distanceKm} กม.</div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="num">
                        ฿{p.totalValue.toLocaleString()}
                      </td>
                      <td>
                        <div className="pl-ratio">
                          <div className="pl-ratio-bar">
                            <span
                              style={{
                                width: `${Math.min(100, (p.costRatioPct / 40) * 100)}%`,
                                background: p.economical ? '#2563EB' : '#DC2626',
                              }}
                            />
                            <i title={`เกณฑ์ ${COST_LIMIT_PCT}%`} />
                          </div>
                          <span className="num pl-ratio-num">
                            ฿{p.transportCost.toLocaleString()} · {p.costRatioPct}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${meta.tone}`}>{meta.label}</span>
                        {p.live && !p.live.involved && <span className="badge t-amber" style={{ marginLeft: 4 }}>{p.live.canObject ? 'คัดค้านได้' : 'ดูอย่างเดียว'}</span>}
                        {p.status === 'NEEDS_DISCUSSION' && (
                          <div className="sub" style={{ color: '#D97706', fontWeight: 500, marginTop: 2 }}>
                            ⚠ {live
                              ? `${p.approvals.filter((a) => a.state === 'REJECTED').map((a) => a.hospital).join(', ') || 'มี รพ.'} ไม่เห็นชอบ/คัดค้าน · รอนัดประชุม ${p.approvals.length} รพ.`
                              : 'รพ.บางบ่อ ปฏิเสธยอด · รอนัดประชุม 3 รพ.'}
                          </div>
                        )}
                        {!p.economical && p.status === 'PENDING_MY_APPROVAL' && (
                          <div className="pl-warn-line">⚠ เกินเกณฑ์ {COST_LIMIT_PCT}% · ต้องเลือก 1 ใน 4 ทาง</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="tbl-foot">
          <span>
            {tab === 'pool'
              ? `รวม ${POOL_LOTS.length} ล็อต · ฿${POOL_TOTAL_VALUE.toLocaleString()} · กันออกจากสต็อกใช้งานทั้งหมด (FR-F2a-013)`
              : `รวม ${tabPlans.length} แผน · รอฉันเห็นชอบ ${pendingMine} · ค่าขนส่งคำนวณจาก 300 + 8 บาท/กม. (+500 ค่าความเย็น)`}
          </span>
          <span className="num">JOB-06 · จับคู่โดย Agent</span>
        </div>
      </section>

      {drawerOpen && sel && (
        <AllocationDrawer
          key={sel.id}
          plan={sel}
          role={role}
          decision={decisions[sel.id]}
          onApprove={() => (live ? liveApprove(sel) : approve(sel.id))}
          onApproveAll={(text, updatedLines) => (live ? liveApproveAll(sel, text, updatedLines) : approve(sel.id))}
          onReject={(comment) => liveReject(sel, comment)}
          onUneconomical={(label, id) => (live && id ? liveOption(sel, id, label) : decideUneconomical(sel.id, label))}
          onCancel={(reason) => liveCancel(sel, reason)}
          onObject={(reason) => liveObject(sel, reason)}
          busy={busy}
          error={actionError}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {withdrawTarget && (
        <ReasonDialog
          title="ถอนล็อตออกจากคลังกลาง"
          detail={
            <>
              <div><b>{withdrawTarget.drug}</b> · ล็อต {withdrawTarget.id} · <span className="num">{withdrawTarget.qty.toLocaleString()} {withdrawTarget.unit}</span></div>
              <div style={{ marginTop: 8 }}>ล็อตนี้ไม่มี รพ.ในเขตที่ใช้ทันก่อนหมดอายุ การถอนจะ</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                <li>ปลดการกันสต็อก กลับมาเป็นสต็อกใช้งานของ รพ.เรา</li>
                <li>ส่งล็อตกลับไปรอตัดสินใจที่หน้ายาใกล้หมดอายุ (ปล่อยอีกครั้งหรือเก็บไว้ใช้เองก็ได้)</li>
              </ul>
            </>
          }
          confirmLabel="ถอนกลับมาใช้เอง"
          defaultReason="ไม่มี รพ.ในเขตที่ใช้ทันก่อนหมดอายุ ถอนกลับมาใช้เอง"
          minLength={3}
          {...(withdrawError ? { error: withdrawError } : {})}
          onConfirm={confirmWithdraw}
          onClose={() => setWithdrawTarget(null)}
        />
      )}

      {manualFor?.live && (
        <ManualPlanDialog
          poolId={manualFor.live.uuid}
          lotLabel={`${manualFor.drug} · ${manualFor.id}`}
          onClose={() => setManualFor(null)}
          onCreated={(planNo, status) => {
            setManualFor(null);
            void planCreated(planNo, status);
          }}
        />
      )}
    </>
  );
}
