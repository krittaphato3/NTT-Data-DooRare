import test from 'node:test';
import assert from 'node:assert/strict';
import { applySelection, selectLenders, validateLenderSelection } from '../src/modules/borrow/borrow.agent.js';
import type { SelectionContext, SelectionInput } from '../src/modules/borrow/borrow.agent.js';
import type { LadderEntry } from '../src/modules/borrow/borrow.ladder.js';
import type { ChatMessage, ILLMProvider, LLMResponse } from '../src/modules/ai/providers/types.js';

/** AGT-F1 lender-selection agent: proposal checks (G-01 / G-03 / G-04 / G-05), ladder re-ordering and the fallback to the Si ladder. No DB. */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const parts = { time: 0.8, fulfill: 1, stockSafety: 0.9, reliability: 0.7 };
const entry = (hospitalId: string, code: string, rank: number, lendable: number, qtyPlanned = 0): LadderEntry =>
  ({ hospitalId, code, name: code, eligible: true, failure: null, listingId: null, transitMin: 30, usableForLending: lendable, totalTarget: 100, lendable, stock: 500, uLender: 5, approvalRate: 0.9, timeoutRate: 0.05, parts, si: 0.9 - rank / 10, rank, qtyPlanned }) as LadderEntry;
const ladder = [entry(A, 'HA', 1, 120, 100), entry(B, 'HB', 2, 80), entry(C, 'HC', 3, 300)];
const ctx: SelectionContext = { requestNo: 'BR-1', ladder, borrowQty: 100, parallel: false, maxParallel: 3, allowedNumbers: [120, 2] };
const input: SelectionInput = { ...ctx, drug: 'Paracetamol', unit: 'tab', requester: 'รพ.X', urgency: 'URGENT', deadlineMin: 120, need: { stock: 10, u: 5, required: 100, ved: 'E' } };

const answer = (first: { lender_hospital_id: string; qty: number; rationale?: string; message_th?: string }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ task: 'F1_T2_LENDER_SELECTION', summary_th: 'HC ครบจำนวนและเชื่อถือได้', confidence: 'HIGH', request_no: 'BR-1', first_round: first.map((f) => ({ rationale: 'ตอบรับเร็ว', ...f })), ...extra });

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

test('f1 agent: a valid first round passes G-01, G-04 and G-03; its message is kept', () => {
  const r = validateLenderSelection('```json\n' + answer([{ lender_hospital_id: C, qty: 100, message_th: 'ขอยืม Paracetamol 100 เม็ด กรุณาตอบภายใน 120 นาที' }], { priority_after: [A] }) + '\n```', ctx);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.hits.map((h) => `${h.rule}:${h.ok}`), ['G-01:true', 'G-04:true', 'G-03:true']);
  assert.equal(r.value.picks[0].message, 'ขอยืม Paracetamol 100 เม็ด กรุณาตอบภายใน 120 นาที');
  assert.deepEqual(r.value.priorityAfter, [A]);
});

test('f1 agent: unknown / duplicate lenders, too many legs, above lendable or above the borrow quantity are rejected', () => {
  const rule = (raw: string, c = ctx) => { const r = validateLenderSelection(raw, c); return r.ok ? 'OK' : r.hits.at(-1)?.rule; };
  assert.equal(rule(answer([{ lender_hospital_id: '55555555-5555-4555-8555-555555555555', qty: 10 }])), 'G-04');
  assert.equal(rule(answer([{ lender_hospital_id: A, qty: 10 }, { lender_hospital_id: A, qty: 10 }], {}), { ...ctx, parallel: true }), 'G-04');
  assert.equal(rule(answer([{ lender_hospital_id: A, qty: 50 }, { lender_hospital_id: C, qty: 50 }])), 'G-03', 'sequential = one lender');
  assert.equal(rule(answer([{ lender_hospital_id: B, qty: 90 }])), 'G-03', 'above lendable 80');
  assert.equal(rule(answer([{ lender_hospital_id: C, qty: 150 }])), 'G-03', 'above the borrow quantity 100');
  assert.equal(rule(answer([{ lender_hospital_id: C, qty: 12.5 }])), 'G-03');
  assert.equal(rule(answer([{ lender_hospital_id: A, qty: 60 }, { lender_hospital_id: C, qty: 60 }]), { ...ctx, parallel: true }), 'G-03', 'sum 120 > 100');
  assert.equal(rule(answer([{ lender_hospital_id: A, qty: 60 }, { lender_hospital_id: C, qty: 40 }]), { ...ctx, parallel: true }), 'OK');
  assert.equal(rule(answer([{ lender_hospital_id: C, qty: 10 }], { approve: true })), 'G-01');
  assert.equal(rule(answer([{ lender_hospital_id: C, qty: 10 }]).replace('BR-1', 'BR-2')), 'G-01');
  assert.equal(rule('ส่งให้ HC'), 'G-01');
});

test('f1 agent: a message quoting a number the code did not give is replaced by the template, the plan stays', () => {
  const r = validateLenderSelection(answer([{ lender_hospital_id: C, qty: 100, message_th: 'ขอ 999 เม็ด ภายใน 120 นาที' }]), ctx);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.picks[0].message, null);
  assert.ok(r.hits.some((h) => h.rule === 'G-05'));
});

test('f1 agent: applySelection puts the picks first, then priority_after, then the rest by Si, with the chosen quantities', () => {
  const sel = { summary: 's', confidence: 'HIGH', picks: [{ hospitalId: C, qty: 100, rationale: 'r', message: null }], priorityAfter: [B] };
  const out = applySelection(ladder, sel);
  assert.deepEqual(out.map((e) => [e.code, e.rank, e.qtyPlanned]), [['HC', 1, 100], ['HB', 2, 0], ['HA', 3, 0]]);
});

test('f1 agent: a valid answer is used (OK) and the lenders list is in the prompt', async () => {
  const llm = new Scripted([reply(answer([{ lender_hospital_id: C, qty: 100, message_th: 'ขอยืม 100 เม็ด ตอบภายใน 120 นาที' }], { priority_after: [A] }))]);
  const r = await selectLenders(input, llm);
  assert.equal(r.run.status, 'OK');
  assert.equal(r.info.picks[0].code, 'HC');
  assert.deepEqual(r.ladder.map((e) => e.code), ['HC', 'HA', 'HB']);
  assert.equal(r.ladder[0].qtyPlanned, 100);
  assert.equal(r.messages[C], 'ขอยืม 100 เม็ด ตอบภายใน 120 นาที');
  assert.deepEqual(r.info.priorityAfter, ['HA']);
  const user = JSON.parse(String(llm.seen[0][1].content));
  assert.equal(user.lenders.length, 3);
  assert.equal(user.lenders[2].covers_all, true);
});

test('f1 agent: a bad answer gets one retry telling why, then the Si ladder is kept (FALLBACK)', async () => {
  const bad = reply(answer([{ lender_hospital_id: B, qty: 90 }]));
  const llm = new Scripted([bad, bad]);
  const r = await selectLenders(input, llm);
  assert.equal(r.run.status, 'FALLBACK');
  assert.deepEqual(r.ladder, ladder, 'the code ladder is returned untouched');
  assert.deepEqual(r.messages, {});
  assert.match(String(llm.seen[1].at(-1)?.content), /G-03/);
});

test('f1 agent: an LLM error falls back to the Si ladder', async () => {
  const r = await selectLenders(input, new Scripted([new Error('503 from provider')]));
  assert.equal(r.run.status, 'FALLBACK');
  assert.deepEqual(r.run.flags.sort(), ['AGENT_FALLBACK', 'LLM_ERROR']);
  assert.deepEqual(r.ladder, ladder);
});
