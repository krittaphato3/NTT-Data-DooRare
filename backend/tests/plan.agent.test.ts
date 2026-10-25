import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPlan, validateNarrative } from '../src/modules/incidents/plan.agent.js';
import type { NarrativeContext, PlanLine } from '../src/modules/incidents/plan.agent.js';
import type { ChatMessage, ILLMProvider, LLMResponse } from '../src/modules/ai/providers/types.js';

/** AGT-F3-001 plan agent: answer checks (G-01 / G-04 / G-CRIT / G-03), the retry and the fallback. No DB. */

const EPI = '11111111-1111-4111-8111-111111111111';
const line = (key: string, kind: 'KIT' | 'EXTRA', name: string, estimated: number, critical: number): PlanLine => ({
  key, kind, name, unit: kind === 'KIT' ? 'ชุด' : 'amp', cls: critical > 0 ? 'CRITICAL' : 'SUPPORTIVE', estimated, critical, ready: 0, useReady: 0, pack: 0, borrow: estimated,
});
const ctx: NarrativeContext = {
  incidentNo: 'INC-1',
  lines: [line('TRAUMA_RESUS', 'KIT', 'ชุดช่วยชีวิตผู้บาดเจ็บ', 4, 3), line('BURN', 'KIT', 'ชุดแผลไฟไหม้', 9, 0), line(EPI, 'EXTRA', 'Epinephrine 1 mg/1 mL', 12, 12)],
  allowedNumbers: new Set([0, 1, 3, 4, 9, 12]),
};
const answer = (lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ task: 'F3_T1_PLAN_NARRATIVE', incident_no: 'INC-1', summary_th: 'รถบัสคว่ำ ผู้ป่วยแดง 3 ราย บาดเจ็บจากแรงกระแทก', confidence: 'HIGH', highlights_th: ['ต้องยืมชุดช่วยชีวิต 4 ชุด'], lines, ...extra });

class Scripted implements ILLMProvider {
  readonly providerType = 'CUSTOM' as const;
  readonly seen: ChatMessage[][] = [];
  constructor(private readonly script: (LLMResponse | Error)[]) {}
  async chat(messages: ChatMessage[]): Promise<LLMResponse> {
    this.seen.push([...messages]);
    const next = this.script.shift();
    if (!next) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    return next;
  }
  async testConnection() { return { success: true, latencyMs: 0, message: 'ok', modelId: 'scripted' }; }
}
const reply = (content: string): LLMResponse => ({ content, model: 'scripted', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });

test('f3 plan agent: keep / remove / ask on plan lines passes every check', () => {
  const r = validateNarrative('```json\n' + answer([
    { key: 'TRAUMA_RESUS', decision: 'KEEP' },
    { key: 'BURN', decision: 'ASK', reason_th: 'รายงานไม่ได้ระบุไฟไหม้', question_th: 'มีผู้ป่วยแผลไหม้หรือไม่' },
    { key: EPI, decision: 'KEEP', reason_th: 'ผู้ป่วยแดงต้องใช้' },
  ]) + '\n```', ctx);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.hits.map((h) => `${h.rule}:${h.ok}`), ['G-01:true', 'G-04:true', 'G-CRIT:true', 'G-03:true']);
  assert.deepEqual(r.value.lines.map((l) => [l.key, l.decision]), [['TRAUMA_RESUS', 'KEEP'], ['BURN', 'ASK'], [EPI, 'KEEP']]);
  assert.equal(r.value.lines[1].question, 'มีผู้ป่วยแผลไหม้หรือไม่');
});

test('f3 plan agent: a line without a critical minimum may be removed', () => {
  const r = validateNarrative(answer([{ key: 'BURN', decision: 'REMOVE', reason_th: 'ไม่มีเพลิงไหม้ในเหตุนี้' }]), ctx);
  assert.equal(r.ok, true);
});

test('f3 plan agent: unknown keys, removing a critical line, invented numbers and schema breaks are rejected', () => {
  const rule = (raw: string) => { const r = validateNarrative(raw, ctx); return r.ok ? 'OK' : r.hits.at(-1)?.rule; };
  assert.equal(rule(answer([{ key: 'CHEST_TUBE', decision: 'REMOVE', reason_th: 'ไม่ต้องใช้' }])), 'G-04', 'not a line of this plan');
  assert.equal(rule(answer([{ key: 'BURN', decision: 'KEEP' }, { key: 'BURN', decision: 'REMOVE', reason_th: 'x ซ้ำ' }])), 'G-04');
  assert.equal(rule(answer([{ key: 'TRAUMA_RESUS', decision: 'REMOVE', reason_th: 'ไม่ต้องใช้' }])), 'G-CRIT', 'critical minimum 3');
  assert.equal(rule(answer([{ key: 'BURN', decision: 'KEEP' }], { summary_th: 'ควรเตรียมเพิ่มเป็น 20 ชุด' })), 'G-03', '20 is not in the data');
  assert.equal(rule(answer([{ key: 'BURN', decision: 'ASK', reason_th: 'ไม่แน่ใจ' }])), 'G-01', 'ASK needs a question');
  assert.equal(rule(answer([{ key: 'BURN', decision: 'REMOVE' }])), 'G-01', 'REMOVE needs a reason');
  assert.equal(rule(answer([{ key: 'BURN', decision: 'DROP', reason_th: 'x' }])), 'G-01');
  assert.equal(rule(answer([], { qty: 5 })), 'G-01', 'extra field');
  assert.equal(rule(answer([], { incident_no: 'INC-2' })), 'G-01');
  assert.equal(rule('ไม่ใช่ JSON'), 'G-01');
});

test('f3 plan agent: a rejected answer is retried once with the reason, then accepted', async () => {
  const provider = new Scripted([
    reply(answer([{ key: 'TRAUMA_RESUS', decision: 'REMOVE', reason_th: 'ไม่ต้องใช้' }])),
    reply(answer([{ key: 'BURN', decision: 'REMOVE', reason_th: 'ไม่มีเพลิงไหม้' }])),
  ]);
  const basis = { hash: 'h', context: ctx, data: { incident_no: 'INC-1' } };
  const r = await assessPlan(basis, 5, provider);
  assert.equal(r.status, 'OK');
  assert.equal(r.steps, 2);
  assert.match(provider.seen[1].at(-1)!.content ?? '', /G-CRIT/);
  assert.deepEqual(r.value?.lines.map((l) => [l.key, l.decision]), [['BURN', 'REMOVE']]);
});

test('f3 plan agent: two bad answers or an LLM error fall back to the rule plan', async () => {
  const basis = { hash: 'h', context: ctx, data: { incident_no: 'INC-1' } };
  const bad = await assessPlan(basis, 5, new Scripted([reply('{}'), reply('{}')]));
  assert.equal(bad.status, 'FALLBACK');
  assert.deepEqual(bad.flags, ['AGENT_FALLBACK']);
  const down = await assessPlan(basis, 5, new Scripted([new Error('503 from provider')]));
  assert.equal(down.status, 'FALLBACK');
  assert.ok(down.flags.includes('LLM_ERROR'));
});
