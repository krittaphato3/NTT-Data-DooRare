import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { useAuth } from '../../../context/AuthContext';
import { homeHrefFor } from '../../../data/navigation';
import { mayActFor } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';
import { AllocationDrawer } from '../components/AllocationDrawer';
import { ManualPlanDialog } from '../components/ManualPlanDialog';
import { cancelPlan, choosePlanOption, decidePlan, objectPlan, sendPoolToAgent } from '../../../services/expiryApi';
import type { ApiPlanOption } from '../../../services/expiryApi';
import { usePoolAndPlans } from '../data/useExpiryF2';
import { COST_LIMIT_PCT, planStatusMeta } from '../data/pool';
import type { AllocationPlan, PlanStatus, PoolLot } from '../data/pool';
import '../pool.css';

type PoolTab = 'pool' | 'plans';

const TABS: { id: PoolTab; label: string; ui: string }[] = [
  { id: 'pool', label: 'คลังกลาง (ถูกกันไว้)', ui: 'UI-08' },
  { id: 'plans', label: 'แผนจัดสรร', ui: 'UI-09' },
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
  const [tab, setTab] = useState<PoolTab>('plans');
  const [selId, setSelId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const data = usePoolAndPlans();
  const live = data.source === 'live';
  const POOL_LOTS = data.pool;
  const POOL_TOTAL_VALUE = POOL_LOTS.reduce((s, l) => s + l.value, 0);
  const [localPlans, setPlans] = useState<AllocationPlan[] | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const allPlans = live ? data.plans : (localPlans ?? data.plans);
  // Default view = plans still in progress; finished ones (completed / cancelled) are history.
  const plans = live && !showFinished ? allPlans.filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED') : allPlans;
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
  const toAgent = (l: PoolLot) => {
    if (!l.live) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    sendPoolToAgent(l.live.uuid)
      .then(({ data: r }) => {
        const a = r.agent;
        const how = a.status === 'OK' ? ` · Agent (${a.model ?? '—'}): ${a.summary ?? ''}` : ` · ใช้สูตร F-22 แทน Agent (${[a.status, ...a.flags].join(', ')})${a.summary ? `: ${a.summary}` : ''}`;
        return planCreated(r.plan.planNo, r.plan.status, how);
      })
      .catch((e: Error) => setActionError(e.message))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pendingMine = plans.filter((p) => p.status === 'PENDING_MY_APPROVAL').length;
  const needDoc = plans.filter((p) => p.status === 'APPROVED' || p.status === 'TRANSPORTING').length;
  const needsDiscussion = plans.filter((p) => p.status === 'NEEDS_DISCUSSION').length;

  const open = (id: string) => {
    setSelId(id);
    setDrawerOpen(true);
  };

  const sel = plans.find((p) => p.id === selId) ?? plans[0];

  const approve = (id: string) => {
    setPlans((prev) =>
      (prev ?? plans).map((p) =>
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
                {t.label} <span className="cnt">{t.id === 'pool' ? POOL_LOTS.length : plans.length}</span>
              </button>
            ))}
            {live && tab === 'plans' && (
              <button type="button" className="tab" aria-pressed={showFinished} onClick={() => setShowFinished((v) => !v)}>
                {showFinished ? 'ซ่อนแผนที่จบแล้ว' : `แสดงแผนที่จบแล้ว (${allPlans.length - plans.length})`}
              </button>
            )}
            <span className="sub" style={{ marginLeft: 6 }}>
              {tab === 'pool'
                ? 'สินค้ายังอยู่ที่ รพ.ต้นทาง · เบิกใช้ไม่ได้จนกว่าจะส่งมอบ'
                : 'กดแถวเพื่อดูสูตร F-22 / F-23 และตัดสินใจ'}
            </span>
          </div>
        </div>

        {tab === 'pool' ? (
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
                {POOL_LOTS.map((l) => (
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
                        {!l.live || l.live.originId !== user?.hospitalId ? (
                          <span className="sub">เจ้าของล็อตเป็นผู้จัดสรร</span>
                        ) : l.live.status === 'ALLOCATED' ? (
                          <span className="sub">ส่วนที่เหลือ {l.live.qtyAvailable.toLocaleString()} {l.unit} จัดสรรได้เมื่อแผนก่อนหน้าส่งถึง</span>
                        ) : l.live.qtyAvailable > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <button className="btn btn-p btn-sm" disabled={!mayPlan || busy} onClick={() => toAgent(l)} title="ส่งข้อมูลล็อตและผู้รับที่โค้ดคำนวณให้ Agent เสนอการแบ่ง · โค้ดตรวจ F-22/F-23 ก่อนบันทึก">
                              <Icon name="sparkle" />
                              {busy ? 'กำลังส่ง…' : 'ให้ Agent จัดสรร'}
                            </button>
                            <button className="btn btn-s btn-sm" disabled={!mayPlan || busy} onClick={() => setManualFor(l)}>
                              สร้างแผนเอง
                            </button>
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
                {plans.map((p) => {
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
              : `รวม ${plans.length} แผน · รอฉันเห็นชอบ ${pendingMine} · ค่าขนส่งคำนวณจาก 300 + 8 บาท/กม. (+500 ค่าความเย็น)`}
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
