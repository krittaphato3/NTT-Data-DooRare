import { useEffect, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { RoleCode } from '../../../lib/rbac';
import { ErBreadcrumb } from '../components/ErBreadcrumb';
import { ErPageHeading } from '../components/ErPageHeading';
import { BorrowConfirmStep } from '../components/flow/BorrowConfirmStep';
import { FlowStepper } from '../components/flow/FlowStepper';
import type { FlowStepDef } from '../components/flow/FlowStepper';
import { PlanReviewStep } from '../components/flow/PlanReviewStep';
import { SentStep } from '../components/flow/SentStep';
import { StockCheckStep } from '../components/flow/StockCheckStep';
import { IntakeFields } from '../components/IntakeFields';
import { getIncidentAccess } from '../data/access';
import { EXTRA_DRUGS, PRESET_KITS } from '../data/incident';
import { getIncident, nextIncidentId, nextRequestNo, nowHHmm, saveIncident } from '../data/incidentStore';
import type { IncidentRecord, SentBatch } from '../data/incidentStore';
import { DEFAULT_INTAKE, effectiveEtaMin, triageTotal } from '../data/intake';
import type { IntakeValues } from '../data/intake';
import { erHref, readParam } from '../data/navigation';
import { buildStockCheck, planBorrowRequests } from '../data/stockCheck';

const STEPS: FlowStepDef[] = [
  { id: 1, label: 'แจ้งเหตุ', hint: 'ER กรอกข้อมูลจากกู้ภัย' },
  { id: 2, label: 'ตรวจแผนของ Agent', hint: 'ชุดและของนอกชุด · แก้ได้' },
  { id: 3, label: 'ตรวจสต็อก', hint: 'พอหรือขาดอะไร' },
  { id: 4, label: 'ยืนยันคำขอยืม', hint: 'ตรวจรายละเอียดก่อนส่ง' },
  { id: 5, label: 'ส่งแล้ว', hint: 'รอผู้ให้ยืมตอบ' },
];

/**
 * ER main flow on one page: report the incident → Agent proposes kits and extra items → staff check
 * and edit → confirm → stock check → review the borrow requests the Agent drafted → send.
 * State lives here so every step reads the same plan.
 */
export function IncidentFlowPage({ role = 'ER_STAFF' }: { role?: RoleCode }) {
  const access = getIncidentAccess(role);
  // `?incident=` reopens a saved incident at its step; without it this is a new incident.
  const [existing] = useState(() => {
    const id = readParam('incident');
    return id ? getIncident(id) : undefined;
  });
  const stale = !!existing?.planStale;
  const [incidentId, setIncidentId] = useState<string | undefined>(existing?.id);
  const [createdAt] = useState(existing?.createdAt ?? nowHHmm());
  const [step, setStep] = useState(stale ? 2 : existing?.step ?? 1);
  const [reached, setReached] = useState(existing?.reached ?? 1);
  const [intake, setIntake] = useState<IntakeValues>(existing?.intake ?? DEFAULT_INTAKE);
  const [runId, setRunId] = useState(stale ? 1 : 0);
  const [agentReady, setAgentReady] = useState(!!existing && !stale);
  const [kits, setKits] = useState(existing?.kits ?? PRESET_KITS);
  const [burnKitOption, setBurnKitOption] = useState<'none' | 'add'>(existing?.burnKitOption ?? 'none');
  const [prcOption, setPrcOption] = useState<'4' | '6'>(existing?.prcOption ?? '4');
  const [edited, setEdited] = useState(existing?.edited ?? false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set(existing?.excluded));
  const [note, setNote] = useState(existing?.note ?? '');
  const [batches, setBatches] = useState<SentBatch[]>(existing?.batches ?? []);
  // Request numbers are fixed for this visit so sending hospital by hospital keeps the same ids.
  const [baseNo] = useState(nextRequestNo);

  // Save the incident whenever the flow changes so it shows up on the incident list and survives a reload.
  useEffect(() => {
    if (!incidentId) return;
    const prev = getIncident(incidentId);
    const rec: IncidentRecord = {
      id: incidentId,
      createdAt,
      status: batches.length > 0 ? 'sent' : 'planning',
      step: Math.min(step, 5),
      reached,
      intake,
      kits,
      edited,
      burnKitOption,
      prcOption,
      excluded: [...excluded],
      note,
      batches,
      updates: prev?.updates ?? [],
      planStale: false,
      seed: prev?.seed,
    };
    saveIncident(rec);
  }, [incidentId, createdAt, step, reached, intake, kits, edited, burnKitOption, prcOption, excluded, note, batches]);

  // The Agent "thinks" for a moment each time the incident is submitted.
  useEffect(() => {
    if (runId === 0) return;
    setAgentReady(false);
    const t = setTimeout(() => setAgentReady(true), 1200);
    return () => clearTimeout(t);
  }, [runId]);

  const go = (id: number) => {
    setStep(id);
    setReached((r) => Math.max(r, id));
  };

  const etaMin = effectiveEtaMin(intake);
  const lines = buildStockCheck(kits, EXTRA_DRUGS);
  const requests = planBorrowRequests(lines, etaMin, baseNo);
  const sentKeys = new Set(batches.flatMap((b) => b.requests.flatMap((r) => r.lenders.map((l) => `${r.id}|${l.name}`))));
  const total = triageTotal(intake);
  const canSubmit = access.mayWrite && intake.location.trim() !== '' && total > 0;

  const updateAssembleQty = (index: number, delta: number) => {
    setEdited(true);
    setKits((prev) =>
      prev.map((k, i) => {
        if (i !== index) return k;
        const next = Math.max(0, Math.min(k.maxAssemble, k.assembleFromParts + delta));
        return { ...k, assembleFromParts: next, borrowFullKit: Math.max(0, k.estimated - k.readyInStock - next) };
      })
    );
  };

  /** Send the checked, not-yet-sent items to the given hospitals (one batch per hospital). */
  const sendTo = (hospitals: string[]) => {
    const at = nowHHmm();
    const fresh: SentBatch[] = [];
    for (const name of [...new Set(hospitals)]) {
      const reqs = requests
        .filter((r) => r.lenders.some((l) => l.name === name) && !excluded.has(`${r.id}|${name}`) && !sentKeys.has(`${r.id}|${name}`))
        .map((r) => ({ ...r, lenders: r.lenders.filter((l) => l.name === name) }));
      if (reqs.length) fresh.push({ at, note, requests: reqs });
    }
    if (fresh.length === 0) return;
    const next = [...batches, ...fresh];
    setBatches(next);
    setNote('');
    // Everything checked has gone out: finish.
    const nowSent = new Set(next.flatMap((b) => b.requests.flatMap((r) => r.lenders.map((l) => `${r.id}|${l.name}`))));
    const left = requests.some((r) => r.lenders.some((l) => !excluded.has(`${r.id}|${l.name}`) && !nowSent.has(`${r.id}|${l.name}`)));
    if (!left) go(5);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErBreadcrumb role={role} label="รับเหตุและวางแผน" />
      <ErPageHeading
        title={incidentId ? `รับเหตุและวางแผน · ${incidentId}` : 'รับเหตุและวางแผน'}
        titleEn="/ Incident → plan → borrow"
        subtitle="UI-11 · UI-12 · กู้ภัยแจ้ง ER กรอกข้อมูล → Agent เสนอแผน → ตรวจ/แก้ → ตรวจสต็อก → ส่งคำขอยืม"
      />
      <FlowStepper steps={STEPS} current={step} reached={reached} onGo={go} />

      {step === 1 && (
        <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2a5c' }}>ข้อมูลเหตุฉุกเฉิน</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>บันทึกจำนวนตามระดับคัดแยกเท่านั้น ไม่ต้องใส่ชื่อผู้ป่วย · ถ้ายังไม่ทราบระดับ ให้ใส่ในช่อง “ไม่ทราบระดับ”</div>
          </div>
          <IntakeFields value={intake} onChange={setIntake} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              ผู้ป่วยรวม <b style={{ color: '#0f2a5c' }}>{total}</b> ราย · แผนจะคิดตาม ETA {etaMin} นาที
            </div>
            <button
              type="button"
              className="btn btn-p"
              style={{ fontWeight: 600 }}
              disabled={!canSubmit}
              title={access.mayWrite ? undefined : access.writeHint}
              onClick={() => {
                if (!incidentId) setIncidentId(nextIncidentId());
                setRunId((n) => n + 1);
                go(2);
              }}
            >
              <Icon name="sparkle" className="ic14" />
              ส่งให้ Agent ประเมิน
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <PlanReviewStep
          ready={agentReady}
          intake={intake}
          kits={kits}
          edited={edited}
          burnKitOption={burnKitOption}
          prcOption={prcOption}
          access={access}
          onAssembleChange={updateAssembleQty}
          onBurnKit={(o) => {
            setBurnKitOption(o);
            setEdited(true);
          }}
          onPrc={(o) => {
            setPrcOption(o);
            setEdited(true);
          }}
          onBack={() => go(1)}
          onConfirm={() => go(3)}
        />
      )}

      {step === 3 && <StockCheckStep lines={lines} onBack={() => go(2)} onNext={() => go(4)} />}

      {step === 4 && (
        <BorrowConfirmStep
          requests={requests}
          etaMin={etaMin}
          excluded={excluded}
          note={note}
          access={access}
          onToggle={(key) =>
            setExcluded((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          onNote={setNote}
          onBack={() => go(3)}
          sentKeys={sentKeys}
          onSendHospital={(name) => sendTo([name])}
          onSendAll={() => sendTo(requests.flatMap((r) => r.lenders.map((l) => l.name)))}
        />
      )}

      {step === 5 && batches.length > 0 && <SentStep batches={batches} trackHref={erHref('track')} onNew={() => window.location.assign(erHref('flow'))} />}
    </div>
  );
}
