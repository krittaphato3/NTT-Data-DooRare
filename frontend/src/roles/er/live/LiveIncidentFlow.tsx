import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { approvePlan, calculatePlan, createIncident, previewPlan, updateCounts } from '../../../services/incidentApi';
import type { ApiPlan, ApiPlanExtra, ApiPlanKit, ApiSendResult, PlanEdits } from '../../../services/incidentApi';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { FlowStepper } from '../components/flow/FlowStepper';
import type { FlowStepDef } from '../components/flow/FlowStepper';
import { StockCheckStep } from '../components/flow/StockCheckStep';
import { ViewOnlyBanner } from '../components/ViewOnlyBanner';
import { getIncidentAccess } from '../data/access';
import { erHref, readParam } from '../data/navigation';
import type { StockLine } from '../data/stockCheck';
import { EMPTY_INTAKE, LiveIntakeForm, countsOf, intakeTotal } from './IntakeForm';
import type { IntakeState } from './IntakeForm';
import { ErrorNote, IncidentHeader, Warnings } from './IncidentHeader';
import { AddPlanItem } from './AddPlanItem';
import { LiveBorrowConfirm } from './LiveBorrowConfirm';
import { LiveExtrasTable, LiveKitTable, PlanNotes } from './PlanTables';
import { classMeta, errorText, num } from './format';
import { useIncident, useIncidentList } from './hooks';

const STEPS: FlowStepDef[] = [
  { id: 1, label: 'แจ้งเหตุ', hint: 'ER กรอกข้อมูลจากกู้ภัย' },
  { id: 2, label: 'ตรวจแผน', hint: 'ชุดและของนอกชุด · แก้ได้' },
  { id: 3, label: 'ตรวจสต็อก', hint: 'พอหรือขาดอะไร' },
  { id: 4, label: 'ยืนยันคำขอยืม', hint: 'ตรวจรายละเอียดก่อนส่ง' },
  { id: 5, label: 'ส่งแล้ว', hint: 'รอผู้ให้ยืมตอบ' },
];

interface Duplicate {
  id: string;
  incidentNo: string;
  type: string | null;
  location: string | null;
  createdAt: string;
}

/** Stock check rows for the shared step-3 table, from the stored plan. */
function stockLines(plan: ApiPlan): StockLine[] {
  const kits = plan.kits.map((k): StockLine => {
    const c = classMeta(k.class);
    return { name: k.name, kind: 'kit', type: c.label, typeCls: c.cls, unit: 'ชุด', need: k.estimated, have: k.useReady, assemble: k.pack, shortage: k.borrowSet };
  });
  const extras = plan.extras.map((e): StockLine => {
    const c = classMeta(e.class);
    return { name: e.name, kind: 'extra', type: e.blood ? 'โลหิต' : c.label, typeCls: c.cls, unit: e.unit ?? 'หน่วย', need: e.estimated, have: e.useLoose ?? 0, assemble: 0, shortage: e.borrow };
  });
  return [...kits, ...extras];
}

const emptyEdits = (): PlanEdits => ({ packOverrides: {}, removeKits: [], removeExtras: [], setKits: {}, setExtras: {} });

/**
 * ER main flow on one page, on the live API: report the incident → rule-based plan (kits and extra items, staff edit) → approve →
 * stock check → check the urgent requests → send. Nothing is reserved or sent before the staff confirm each step.
 */
export function LiveIncidentFlow({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  const [incidentId, setIncidentId] = useState<string | undefined>(() => readParam('incident'));
  const forceNew = readParam('new') === '1';
  const open = useIncidentList('active', 0);
  const { incident, reload } = useIncident(incidentId, 0);
  const initialIntake = useRef<IntakeState | null>(null);
  const resolving = !incidentId && !forceNew && open.source === 'loading';

  // Coming back to this page without an incident in the URL: carry on with the newest incident that is still being planned.
  useEffect(() => {
    if (incidentId || forceNew || open.source === 'loading') return;
    const unfinished = open.items.find((i) => i.status === 'OPEN' || i.status === 'PLAN_REVIEW' || i.plan?.status === 'READY_FOR_APPROVAL');
    if (unfinished) setIncidentId(unfinished.id);
  }, [open.items, open.source, incidentId, forceNew]);

  // The report can be corrected after the plan was made: the form is filled from the saved incident.
  useEffect(() => {
    if (!incident || initialIntake.current) return;
    const filled: IntakeState = {
      type: incident.type ?? '',
      location: incident.location.text ?? '',
      description: incident.description ?? '',
      counts: { RED: String(incident.counts.RED), YELLOW: String(incident.counts.YELLOW), GREEN: String(incident.counts.GREEN), BLACK: String(incident.counts.BLACK), UNKNOWN: String(incident.counts.UNKNOWN) },
      eta: incident.eta.minutes !== null && incident.eta.remainingMin !== null ? String(Math.max(1, Math.ceil(incident.eta.remainingMin))) : '',
      unsure: incident.eta.unsure,
    };
    initialIntake.current = filled;
    setIntake(filled);
  }, [incident]);
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [intake, setIntake] = useState<IntakeState>(EMPTY_INTAKE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [edits, setEdits] = useState<PlanEdits>(emptyEdits());
  const [preview, setPreview] = useState<ApiPlan | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<ApiSendResult | null>(null);
  const resumed = useRef(false);

  const go = (id: number) => {
    setStep(id);
    setReached((r) => Math.max(r, id));
    setError(null);
  };

  // Reopen an incident at the step it is at.
  useEffect(() => {
    if (!incident || resumed.current) return;
    resumed.current = true;
    const stored = incident.plan?.edits ?? null;
    if (stored) setEdits({ ...emptyEdits(), ...stored });
    let s = 2;
    if (incident.status === 'ACTIVE') s = incident.plan && incident.plan.status === 'READY_FOR_APPROVAL' ? 2 : incident.borrowLines.length > 0 ? 5 : 3;
    if (incident.status === 'CLOSE_REQUESTED' || incident.status === 'RECONCILED' || incident.status === 'CANCELLED') s = 5;
    setStep(s);
    setReached(s);
  }, [incident]);

  const refreshPreview = useCallback(
    async (next: PlanEdits) => {
      if (!incidentId) return;
      setBusy(true);
      setError(null);
      try {
        const r = await previewPlan(incidentId, next);
        setPreview(r.data.plan);
        setEdits(next);
        setNames((prev) => {
          const merged = { ...prev };
          for (const k of r.data.plan.kits) merged[k.code] = k.name;
          for (const e of r.data.plan.extras) merged[e.key] = e.name;
          return merged;
        });
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [incidentId],
  );

  // Entering the plan step: compute the plan (with the edits already made) for staff to review.
  useEffect(() => {
    if (step === 2 && incidentId && incident && !preview) void refreshPreview(edits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, incidentId, incident]);

  const submitIntake = async (ack = false, duplicateOf?: string) => {
    setBusy(true);
    setError(null);
    try {
      const reported = Number(intake.eta);
      const r = await createIncident({
        incidentType: intake.type.trim(),
        description: intake.description.trim() || undefined,
        locationText: intake.location.trim() || undefined,
        counts: countsOf(intake),
        reportedEtaMin: Number.isFinite(reported) && reported > 0 ? Math.floor(reported) : undefined,
        etaUnsure: intake.unsure && reported > 0 ? true : undefined,
        acknowledgeDuplicate: ack || undefined,
        duplicateOf,
      });
      setDuplicates(null);
      resumed.current = true;
      setIncidentId(r.data.id);
      setPreview(null);
      go(2);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const code = (e as { code?: string }).code;
      if (status === 409 && code === 'DUPLICATE_SUSPECTED') {
        // the API lists the close-by incidents in the error details; staff decide whether it is the same event
        const candidates = ((e as { details?: { candidates?: Duplicate[] } }).details?.candidates ?? []) as Duplicate[];
        setDuplicates(candidates);
        return;
      }
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  /** Saves corrections of the report (type, place, text, counts, ETA). Counts / ETA changes make a new plan revision for review. */
  const saveIntake = async () => {
    if (!incident || !initialIntake.current) return;
    const before = initialIntake.current;
    const counts = countsOf(intake);
    const prev = countsOf(before);
    const changedCounts = Object.fromEntries((Object.keys(counts) as (keyof typeof counts)[]).filter((k) => counts[k] !== prev[k]).map((k) => [k, counts[k]]));
    const body: Parameters<typeof updateCounts>[1] = { version: incident.version };
    if (Object.keys(changedCounts).length > 0) body.counts = changedCounts;
    if (intake.eta !== before.eta || intake.unsure !== before.unsure) {
      const v = Number(intake.eta);
      if (Number.isFinite(v) && v > 0) body.reportedEtaMin = Math.floor(v);
      if (intake.unsure !== before.unsure) body.etaUnsure = intake.unsure;
    }
    if (intake.type.trim() !== before.type) body.incidentType = intake.type.trim();
    if (intake.location.trim() !== before.location) body.locationText = intake.location.trim();
    if (intake.description.trim() !== before.description) body.description = intake.description.trim();
    setBusy(true);
    setError(null);
    try {
      if (Object.keys(body).length > 1) {
        await updateCounts(incident.id, body);
        initialIntake.current = null;
        setPreview(null);
        reload();
      }
      go(2);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPlan = async () => {
    if (!incidentId) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await calculatePlan(incidentId, edits);
      await approvePlan(incidentId, stored.data.plan.id as string);
      reload();
      setPreview(null);
      go(3);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const editPack = (k: ApiPlanKit, delta: number) => {
    const max = Math.min(k.packMax ?? k.pack, k.estimated - k.useReady);
    const next = Math.max(0, Math.min(max, k.pack + delta));
    void refreshPreview({ ...edits, packOverrides: { ...edits.packOverrides, [k.code]: next } });
  };
  const removeKit = (k: ApiPlanKit) => {
    const { [k.code]: _drop, ...keep } = edits.packOverrides ?? {};
    void refreshPreview({ ...edits, removeKits: [...new Set([...(edits.removeKits ?? []), k.code])], packOverrides: keep });
  };
  const removeExtra = (e: ApiPlanExtra) => {
    const { [e.key]: _drop, ...keep } = edits.setExtras ?? {};
    void refreshPreview({ ...edits, removeExtras: [...new Set([...(edits.removeExtras ?? []), e.key])], setExtras: keep });
  };
  const setExtraQty = (e: ApiPlanExtra, qty: number) => {
    if (qty === 0) return removeExtra(e);
    void refreshPreview({ ...edits, setExtras: { ...edits.setExtras, [e.key]: qty } });
  };
  // BR-F3-008: a kit or item the rules left out; adding it also undoes an earlier removal of the same line
  const addKit = (code: string, qty: number) =>
    void refreshPreview({ ...edits, removeKits: (edits.removeKits ?? []).filter((c) => c !== code), setKits: { ...edits.setKits, [code]: qty } });
  const addExtra = (drugMasterId: string, qty: number) =>
    void refreshPreview({ ...edits, removeExtras: (edits.removeExtras ?? []).filter((c) => c !== drugMasterId), setExtras: { ...edits.setExtras, [drugMasterId]: qty } });
  const restore = (key: string, kind: 'kit' | 'extra') =>
    void refreshPreview(kind === 'kit' ? { ...edits, removeKits: (edits.removeKits ?? []).filter((c) => c !== key) } : { ...edits, removeExtras: (edits.removeExtras ?? []).filter((c) => c !== key) });

  const dirty = JSON.stringify(edits) !== JSON.stringify(emptyEdits());
  const total = intakeTotal(intake);
  const canSubmit = access.mayWrite && intake.type.trim() !== '' && total > 0 && !busy;
  const pendingNew = incident?.status === 'ACTIVE' && incident.plan?.status === 'READY_FOR_APPROVAL';
  const approvedPlan = incident && incident.approvedPlanId && incident.plan ? incident.plan : null;
  const removed = [...(edits.removeKits ?? []).map((c) => ({ key: c, kind: 'kit' as const })), ...(edits.removeExtras ?? []).map((c) => ({ key: c, kind: 'extra' as const }))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="รับเหตุและวางแผน" />
      {!access.mayWrite && <ViewOnlyBanner />}
      <ErPageHeading
        title={incident ? `รับเหตุและวางแผน · ${incident.incidentNo}` : 'รับเหตุและวางแผน'}
        titleEn="/ Incident → plan → borrow"
        subtitle="UI-11 · UI-12 · กู้ภัยแจ้ง ER กรอกข้อมูล → ระบบคำนวณแผนตามกฎ (Agent ยังไม่เชื่อมต่อ) → ตรวจ/แก้ → ตรวจสต็อก → ส่งคำขอยืม"
      />
      <FlowStepper steps={STEPS} current={step} reached={reached} onGo={go} />
      <ErrorNote message={error} />

      {incident && step > 1 && <IncidentHeader incident={incident} actions={<a className="btn btn-s btn-sm" href={erHref('incidents', { incident: incident.id })}>รายละเอียด / แก้จำนวนผู้ป่วย</a>} />}
      {incident && <Warnings items={incident.warnings.filter((w) => w.code !== 'PLAN_PENDING')} />}

      {resolving && <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>กำลังตรวจสอบเหตุที่ค้างอยู่…</div>}
      {step === 1 && !resolving && (
        <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a5c' }}>ข้อมูลเหตุฉุกเฉิน</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>บันทึกจำนวนตามระดับคัดแยกเท่านั้น ไม่ต้องใส่ชื่อผู้ป่วย · ถ้ายังไม่ทราบระดับ ให้ใส่ในช่อง “ไม่ทราบระดับ”</div>
          </div>
          {incident && <div style={{ fontSize: 12.5, color: '#475569' }}>บันทึกเหตุ {incident.incidentNo} แล้ว · แก้ข้อมูลได้ที่นี่ ถ้าจำนวนผู้ป่วยหรือ ETA เปลี่ยน ระบบจะทำแผนฉบับใหม่ให้ตรวจ</div>}
          <LiveIntakeForm value={intake} onChange={setIntake} disabled={busy || (!!incident && !initialIntake.current)} />
          {duplicates && (
            <div role="alert" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#92400e' }}>
              <b>มีเหตุการณ์ที่แจ้งไว้ที่เดียวกันภายใน 10 นาที — อาจเป็นเหตุเดียวกัน</b>
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <a className="link" href={erHref('incidents', { incident: d.id })}>{d.incidentNo}</a> · {d.type} · {d.location}
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-s btn-sm" onClick={() => setDuplicates(null)}>กลับไปแก้ข้อมูล</button>
                <button type="button" className="btn btn-p btn-sm" disabled={busy} onClick={() => void submitIntake(true, duplicates[0].id)}>เป็นเหตุแยกกัน · บันทึกต่อ</button>
              </div>
            </div>
          )}
          {incident && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>ผู้ป่วยรวม <b style={{ color: '#0f2a5c' }}>{total}</b> ราย</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-s" disabled={busy} onClick={() => go(2)}>ไม่แก้ · ไปตรวจแผน →</button>
                <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!access.mayWrite || busy || !canSubmit} title={access.mayWrite ? undefined : access.writeHint} onClick={() => void saveIntake()}>
                  {busy ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข → ตรวจแผน'}
                </button>
              </div>
            </div>
          )}
          {!incident && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>ผู้ป่วยรวม <b style={{ color: '#0f2a5c' }}>{total}</b> ราย</div>
              <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={!canSubmit} title={access.mayWrite ? undefined : access.writeHint} onClick={() => void submitIntake()}>
                <Icon name="sparkle" className="ic14" />
                {busy ? 'กำลังบันทึก…' : 'บันทึกเหตุและคำนวณแผน'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <>
          {!preview ? (
            <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>{busy ? 'ระบบกำลังคำนวณแผน…' : 'ยังไม่มีแผน'}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 640px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <LiveKitTable plan={preview} editable={access.mayWrite} onPack={editPack} onRemove={removeKit} />
                  <LiveExtrasTable plan={preview} editable={access.mayWrite} onRemove={removeExtra} onSetQty={setExtraQty} />
                  {access.mayWrite && (
                    <AddPlanItem
                      kitsInPlan={preview.kits.map((k) => k.code)}
                      extrasInPlan={preview.extras.map((e) => e.key)}
                      disabled={busy}
                      onAddKit={addKit}
                      onAddDrug={addExtra}
                    />
                  )}
                  {removed.length > 0 && (
                    <div className="card" style={{ padding: '10px 14px', fontSize: 12, color: '#475569', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      เอาออกจากแผนแล้ว:
                      {removed.map((r) => (
                        <button key={`${r.kind}-${r.key}`} type="button" className="btn btn-s btn-sm" onClick={() => restore(r.key, r.kind)}>
                          {names[r.key] ?? r.key} · คืนเข้าแผน
                        </button>
                      ))}
                    </div>
                  )}
                  <PlanNotes plan={preview} />
                </div>
                <div style={{ flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 6 }}>การประเมิน</div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: '18px' }}>
                      ชุดและรายการนอกชุดมาจากกฎต่อผู้ป่วยตามระดับคัดแยก (Preset Kit / incident rules) · ปริมาณทั้งหมดคำนวณโดยโค้ด (F-27) · Agent ยังไม่เชื่อมต่อ จึงไม่มีคำถามหรือคำอธิบายจาก Agent
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>เจ้าหน้าที่ตรวจ เพิ่ม ลดหรือเอาออกได้ก่อนยืนยัน (BR-F3-008)</div>
                  </div>
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 8 }}>สรุปความต้องการ</div>
                    <table className="qt">
                      <tbody>
                        <tr><td>ชุดที่ต้องใช้</td><td className="r"><b>{preview.kits.reduce((n, k) => n + k.estimated, 0)}</b> ชุด</td></tr>
                        <tr><td>ใช้ชุดพร้อมใช้</td><td className="r">{preview.kits.reduce((n, k) => n + k.useReady, 0)} ชุด</td></tr>
                        <tr><td>จัดจากของแยก</td><td className="r">{preview.kits.reduce((n, k) => n + k.pack, 0)} ชุด</td></tr>
                        <tr><td>ยืมทั้งชุด</td><td className="r" style={{ color: '#dc2626', fontWeight: 700 }}>{preview.kits.reduce((n, k) => n + k.borrowSet, 0)} ชุด</td></tr>
                        <tr><td>รายการนอกชุดที่ต้องยืม</td><td className="r" style={{ color: '#dc2626', fontWeight: 700 }}>{preview.extras.filter((e) => e.borrow > 0).length} รายการ</td></tr>
                      </tbody>
                    </table>
                    {dirty && <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 8 }}>มีการแก้แผนโดยเจ้าหน้าที่ · ยังไม่บันทึกจนกว่าจะกดยืนยัน</div>}
                    {pendingNew && <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 8 }}>มีแผนฉบับ {incident?.plan?.revision} รออนุมัติ (หลังจำนวนผู้ป่วยเปลี่ยน)</div>}
                  </div>
                </div>
              </div>
              <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12.5, color: '#475569' }}>
                  {approvedPlan && !pendingNew ? `แผนฉบับที่ ${approvedPlan.revision} อนุมัติแล้ว · ถ้าแก้ ระบบทำฉบับใหม่และจองชุดพร้อมใช้ใหม่` : 'ยืนยันแผนเพื่อให้ระบบจองชุดพร้อมใช้ และสร้างงานแพ็กชุดให้คลัง'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {incident?.status === 'ACTIVE' && !pendingNew && !dirty && <button type="button" className="btn btn-s" onClick={() => go(3)}>ข้ามไปตรวจสต็อก →</button>}
                  <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} disabled={busy || !access.mayApprovePlan || (incident?.status === 'ACTIVE' && !pendingNew && !dirty)} title={access.mayApprovePlan ? undefined : access.writeHint} onClick={() => void confirmPlan()}>
                    {busy ? 'กำลังบันทึก…' : 'ยืนยันแผน →'}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {step === 3 && (incident?.plan ? <StockCheckStep lines={stockLines(incident.plan)} onBack={() => go(2)} onNext={() => go(4)} shortHint="ระบบเลือกโรงพยาบาลผู้ให้ยืมตามเวลาเดินทางและสต็อก ให้เจ้าหน้าที่ตรวจก่อนส่ง" nextLabel="ดูคำขอยืมที่ระบบจัดให้ →" /> : <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: '#64748b' }}>กำลังโหลดแผน…</div>)}

      {step === 4 && incidentId && (
        <LiveBorrowConfirm
          incidentId={incidentId}
          access={access}
          onBack={() => go(3)}
          onSent={(r) => {
            setSent(r);
            reload();
            go(5);
          }}
        />
      )}

      {step === 5 && (
        <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>ส่งคำขอยืมแล้ว</div>
          {sent ? (
            <>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: '22px' }}>
                {sent.created.map((c) => (
                  <li key={c.requestId}>{c.requestNo} · {c.name} × {num(c.qty)} · ส่งถึง {c.legs} โรงพยาบาล{c.late ? ' · ถึงหลัง ETA' : ''}</li>
                ))}
                {sent.increased.map((c) => (
                  <li key={c.requestId}>{c.requestNo} · เพิ่มเป็น {num(c.qty)} · ขอเพิ่ม {c.legs} โรงพยาบาล</li>
                ))}
                {sent.reduced.map((c) => (
                  <li key={c.requestId}>{c.requestNo} · ลดเหลือ {num(c.qty)} (ที่ยืนยันแล้ว {num(c.keptConfirmed)} คงไว้)</li>
                ))}
                {sent.created.length + sent.increased.length + sent.reduced.length === 0 && <li>ไม่มีรายการใหม่ที่ต้องส่ง</li>}
              </ul>
              {sent.warnings.length > 0 && <Warnings items={sent.warnings.map((w) => ({ code: `${w.code}-${w.line}`, message: `${w.line}: ${w.message}` }))} />}
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: '#475569' }}>คำขอของเหตุนี้อยู่ในหน้าติดตามคำขอ</div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-p" href={erHref('track')}>ติดตามคำขอและจัดชุด →</a>
            <a className="btn btn-s" href={erHref('flow', { new: '1' })}>แจ้งเหตุใหม่</a>
          </div>
        </div>
      )}
    </div>
  );
}
