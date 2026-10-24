import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { getPlanAgent, startPlanAgent } from '../../../services/incidentApi';
import type { ApiIncidentDetail, ApiPlan, ApiPlanAgent } from '../../../services/incidentApi';
import { errorText } from './format';

export interface PlanAgentState {
  running: boolean;
  latest: ApiPlanAgent | null;
  stale: boolean;
  error: string | null;
  /** Run id of an assessment that finished while this screen was open (its removals are applied once). */
  fresh: string | null;
  ask: () => void;
}

/**
 * AGT-F3-001 on the plan step: loads the latest assessment, starts one when there is none or the incident changed since (`autoStart`,
 * staff who may edit the plan) and polls while the agent runs in the background.
 */
export function usePlanAgent(incidentId: string | undefined, autoStart: boolean): PlanAgentState {
  const [state, setState] = useState<Omit<PlanAgentState, 'ask'>>({ running: false, latest: null, stale: false, error: null, fresh: null });
  const [version, setVersion] = useState(0);
  const started = useRef<string | null>(null);
  const sawRunning = useRef(false);

  const ask = useCallback(() => {
    if (!incidentId) return;
    setState((s) => ({ ...s, running: true, error: null }));
    sawRunning.current = true;
    startPlanAgent(incidentId)
      .then(() => setVersion((v) => v + 1))
      .catch((e) => setState((s) => ({ ...s, running: false, error: errorText(e) })));
  }, [incidentId]);

  useEffect(() => {
    if (!incidentId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      getPlanAgent(incidentId)
        .then((r) => {
          if (!alive) return;
          const { running, latest, stale } = r.data;
          if (running) sawRunning.current = true;
          const finished = !running && sawRunning.current && latest ? latest.runId : null;
          if (finished) sawRunning.current = false;
          setState((s) => ({ ...s, running, latest, stale, fresh: finished ?? s.fresh }));
          if (running) timer = setTimeout(load, 3000);
          else if (autoStart && (!latest || stale) && started.current !== incidentId) {
            started.current = incidentId;
            ask();
          }
        })
        .catch((e) => { if (alive) setState((s) => ({ ...s, running: false, error: errorText(e) })); });
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [incidentId, version, autoStart, ask]);

  return { ...state, ask };
}

const CONFIDENCE: Record<string, { label: string; cls: string }> = {
  HIGH: { label: 'มั่นใจสูง · HIGH', cls: 'st-approved' },
  MEDIUM: { label: 'มั่นใจปานกลาง · MEDIUM', cls: 'st-pending' },
  LOW: { label: 'มั่นใจต่ำ · LOW', cls: 'st-timeout' },
};

/** Why the agent could not help, from its flags. */
function fallbackReason(a: ApiPlanAgent): string {
  if (a.status === 'SKIPPED' || a.flags.includes('AGENT_DISABLED')) return 'ปิด Agent อยู่ (kill switch)';
  if (a.flags.includes('NO_LLM_CONFIGURED')) return 'ยังไม่ได้ตั้งค่า LLM (ผู้ดูแลระบบตั้งได้ที่หน้าตั้งค่า AI)';
  if (a.flags.includes('LLM_ERROR')) return 'เรียก LLM ไม่สำเร็จหรือเกินเวลา';
  return 'คำตอบของ Agent ไม่ผ่านการตรวจของระบบ 2 ครั้ง';
}

const box = { background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' } as const;

interface CardProps {
  agent: PlanAgentState;
  plan: ApiPlan;
  removed: { key: string; kind: 'kit' | 'extra' }[];
  mayWrite: boolean;
  busy: boolean;
  onRemove: (key: string, kind: 'kit' | 'extra') => void;
  onRestore: (key: string, kind: 'kit' | 'extra') => void;
  onApplyAll: () => void;
}

/** The agent's assessment of the rule plan and its questions to the staff (the prototype's AgentAssessmentCard, on live data). */
export function AgentPlanCard({ agent, plan, removed, mayWrite, busy, onRemove, onRestore, onApplyAll }: CardProps) {
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const a = agent.latest;
  const kindOf = (k: 'KIT' | 'EXTRA') => (k === 'KIT' ? 'kit' : 'extra') as 'kit' | 'extra';
  const isRemoved = (key: string) => removed.some((r) => r.key === key);
  const inPlan = (key: string) => plan.kits.some((k) => k.code === key) || plan.extras.some((e) => e.key === key);
  const removals = a?.status === 'OK' ? a.lines.filter((l) => l.decision === 'REMOVE') : [];
  const questions = a?.status === 'OK' ? a.lines.filter((l) => l.decision === 'ASK') : [];
  const pendingRemovals = removals.filter((l) => inPlan(l.key));
  const conf = a?.confidence ? CONFIDENCE[a.confidence] : undefined;

  return (
    <div className="card" style={{ padding: '14px 16px' }} data-part="agent-plan">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f2a5c', fontSize: 13.5 }}>
          <Icon name="sparkle" className="ic14" style={{ color: '#2563eb' }} />
          <span>Agent ประเมินเหตุการณ์</span>
        </div>
        {agent.running ? (
          <span className="badge st-pending" style={{ height: 20, fontSize: 11 }}>กำลังประเมิน…</span>
        ) : a && a.status !== 'OK' ? (
          <span className="badge st-timeout" style={{ height: 20, fontSize: 11 }}>FALLBACK</span>
        ) : conf ? (
          <span className={`badge ${conf.cls}`} style={{ height: 20, fontSize: 11 }}>{conf.label}</span>
        ) : null}
      </div>

      {a && !agent.running && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
          F3_T1 · {a.model ?? '—'}{a.latencyMs !== null ? ` · ใช้เวลา ${(a.latencyMs / 1000).toFixed(1)} วินาที` : ''} · สถานะ {a.status}
        </div>
      )}

      {agent.running && (
        <div role="status" style={{ fontSize: 12.5, color: '#475569', lineHeight: '19px' }}>
          Agent กำลังอ่านประเภทเหตุและแผนตามกฎ เพื่อตัดรายการที่ไม่เกี่ยวกับเหตุนี้และตั้งคำถามถึงเจ้าหน้าที่ · แผนด้านซ้ายใช้งานได้ระหว่างรอ
        </div>
      )}
      {agent.error && <div role="alert" style={{ fontSize: 12.5, color: '#b91c1c' }}>ขอการประเมินไม่สำเร็จ: {agent.error}</div>}
      {!agent.running && !a && !agent.error && <div style={{ fontSize: 12.5, color: '#94a3b8' }}>ยังไม่ได้ให้ Agent ประเมินแผนนี้</div>}

      {!agent.running && a && a.status !== 'OK' && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>ใช้แผนตามกฎของโรงพยาบาล</div>
          <div style={{ fontSize: 12, color: '#0369a1', lineHeight: '18px' }}>{fallbackReason(a)} · จำนวนยังคำนวณตามกฎเหมือนเดิม · ไม่มีคำถามเพิ่มเติม</div>
          <div style={{ fontSize: 11, color: '#0284c7', marginTop: 6 }}>บันทึกใน agent_run แล้ว</div>
        </div>
      )}

      {!agent.running && a?.status === 'OK' && (
        <>
          {agent.stale && (
            <div style={{ fontSize: 11.5, color: '#92400e', marginBottom: 8 }}>ข้อมูลเหตุหรือจำนวนผู้ป่วยเปลี่ยนหลังการประเมินนี้ · กด “ประเมินใหม่” เพื่อให้ Agent ดูข้อมูลล่าสุด</div>
          )}
          {a.summary && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#334155', lineHeight: '19px' }}>{a.summary}</p>}
          {a.highlights.length > 0 && (
            <ul style={{ margin: '0 0 12px', paddingLeft: 16, fontSize: 12, color: '#475569', lineHeight: '18px' }}>
              {a.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}

          {removals.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0f2a5c' }}>ไม่เกี่ยวกับเหตุนี้ · ตัดออกจากแผน</div>
                {mayWrite && pendingRemovals.length > 1 && (
                  <button type="button" className="btn btn-s btn-sm" style={{ height: 26, fontSize: 11 }} disabled={busy} onClick={onApplyAll}>ตัดทั้งหมด ({pendingRemovals.length})</button>
                )}
              </div>
              {removals.map((l) => (
                <div key={l.key} style={box}>
                  <div style={{ fontSize: 12, color: '#0f2a5c', fontWeight: 600 }}>{l.name}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', margin: '2px 0 6px' }}>{l.reason}</div>
                  {isRemoved(l.key) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#15803d' }}>
                      ตัดออกแล้ว
                      {mayWrite && <button type="button" className="btn btn-s btn-sm" style={{ height: 24, fontSize: 11 }} disabled={busy} onClick={() => onRestore(l.key, kindOf(l.kind))}>คืนเข้าแผน</button>}
                    </div>
                  ) : inPlan(l.key) && mayWrite ? (
                    <button type="button" className="btn btn-p btn-sm" style={{ height: 26, fontSize: 11 }} disabled={busy} onClick={() => onRemove(l.key, kindOf(l.kind))}>ตัดออก</button>
                  ) : (
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>ยังอยู่ในแผน</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {questions.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0f2a5c' }}>คำถามถึงเจ้าหน้าที่</div>
              {questions.map((l) => {
                const gone = isRemoved(l.key);
                return (
                  <div key={l.key} style={box}>
                    <div style={{ fontSize: 11.5, color: '#334155' }}>{l.question}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 6px' }}>{l.name}{l.reason ? ` · ${l.reason}` : ''}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button" className={`btn btn-sm ${gone ? 'btn-p' : 'btn-s'}`} style={{ flex: 1, height: 28, fontSize: 11 }} disabled={!mayWrite || busy}
                        onClick={() => { setKept((m) => ({ ...m, [l.key]: false })); if (!gone) onRemove(l.key, kindOf(l.kind)); }}
                      >
                        ไม่มี · ตัด{l.kind === 'KIT' ? 'ชุด' : 'รายการ'}ออก
                      </button>
                      <button
                        type="button" className={`btn btn-sm ${!gone && kept[l.key] ? 'btn-p' : 'btn-s'}`} style={{ flex: 1, height: 28, fontSize: 11 }} disabled={!mayWrite || busy}
                        onClick={() => { setKept((m) => ({ ...m, [l.key]: true })); if (gone) onRestore(l.key, kindOf(l.kind)); }}
                      >
                        มี · คงไว้ในแผน
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {removals.length === 0 && questions.length === 0 && <div style={{ fontSize: 12, color: '#15803d' }}>Agent เห็นว่าทุกรายการในแผนเกี่ยวกับเหตุนี้</div>}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: '16px' }}>Agent เลือกจากรายการที่โค้ดคำนวณ ไม่เปลี่ยนจำนวน · เจ้าหน้าที่ตรวจและยืนยันแผน (BR-F3-008)</div>
        {mayWrite && !agent.running && (
          <button type="button" className="btn btn-s btn-sm" style={{ height: 26, fontSize: 11, flex: 'none' }} disabled={busy} onClick={agent.ask}>{a ? 'ประเมินใหม่' : 'ให้ Agent ประเมิน'}</button>
        )}
      </div>
    </div>
  );
}

/** The blue line above the plan: who proposed it and what the agent changed (the prototype's PlanReviewStep banner). */
export function AgentPlanBanner({ incident, agent, removedByAgent, questions }: { incident: ApiIncidentDetail; agent: PlanAgentState; removedByAgent: number; questions: number }) {
  const c = incident.counts;
  const total = c.RED + c.YELLOW + c.GREEN + c.BLACK + c.UNKNOWN;
  const where = `“${incident.type ?? 'ไม่ระบุประเภท'}”${incident.location.text ? ` · ${incident.location.text}` : ''}`;
  const patients = `ผู้ป่วย ${total} ราย (แดง ${c.RED} · เหลือง ${c.YELLOW} · เขียว ${c.GREEN}${c.BLACK ? ` · ดำ ${c.BLACK}` : ''}${c.UNKNOWN ? ` · ไม่ทราบระดับ ${c.UNKNOWN}` : ''})`;
  const ok = !agent.running && agent.latest?.status === 'OK';
  const lead = ok ? 'Agent เสนอแผนจากเหตุ' : 'ระบบคำนวณแผนตามกฎจากเหตุ';
  let tail = 'ตรวจรายการด้านล่าง ปรับจำนวนได้ แล้วกดยืนยันแผน';
  if (agent.running) tail = `Agent กำลังประเมินว่ารายการใดเกี่ยวกับเหตุนี้ · ${tail}`;
  else if (ok) tail = `${removedByAgent ? `ตัดรายการที่ไม่เกี่ยวกับเหตุ ${removedByAgent} รายการ · ` : ''}${questions ? `มีคำถามถึงเจ้าหน้าที่ ${questions} ข้อ · ` : ''}${tail}`;
  else if (agent.latest) tail = `Agent ไม่พร้อม ใช้แผนตามกฎ · ${tail}`;
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#1e3a8a', lineHeight: '19px' }}>
      <b>{lead} {where}</b> · {patients}. {tail}
    </div>
  );
}
