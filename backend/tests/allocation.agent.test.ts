import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, validateAllocationProposal } from '../src/modules/expiry/allocation.agent.js';
import { ruleSplit } from '../src/modules/expiry/matching.js';
import type { DemandCandidate, PoolLot } from '../src/modules/expiry/matching.js';
import type { ChatMessage, ILLMProvider, LLMResponse } from '../src/modules/ai/providers/types.js';

/** AGT-F2-001 allocation agent: proposal checks (G-01 / G-03 / G-04) and the fallback to the code's F-22 split. No DB. */

const POOL_ID = '11111111-1111-4111-8111-111111111111';
const X = '22222222-2222-4222-8222-222222222222';
const Y = '33333333-3333-4333-8333-333333333333';
const Z = '44444444-4444-4444-8444-444444444444';

const pool: PoolLot = {
  id: POOL_ID, region_id: 'r', qty_available: 600, item_id: 'i', origin_id: 'o', item_status: 'RELEASED_TO_POOL', lot_id: 'l', lot_no: 'LOT-1',
  expiry_date: new Date(Date.now() + 40 * 86_400_000), drug_master_id: 'd', drug_name: 'Paracetamol 500 mg tablet', unit: 'tab', unit_price: 1,
  cold_chain: false, blood: false, controlled: false, origin_network: null,
};
// `cap` null = cannot get there before expiry (transit longer than the lot's life), as allocateToReceiver would find
const cand = (hospitalId: string, code: string, stock: number, cap: number | null): DemandCandidate => ({
  hospitalId, code, name: code, totalTarget: 1000, stock, incoming: 0, usePerDay: 20, transitDays: cap === null ? 100 : 0.1, km: 10, networkId: null, transportCostThb: 380,
  cap: cap === null ? null : { hospitalId, qty: cap, deficit: 1000 - stock, daysAvail: 38, consumable: 760, daysOfStock: stock / 20, transitDays: 0.1 },
});
const candidates = [cand(X, 'HX', 600, 400), cand(Y, 'HY', 100, 300), cand(Z, 'HZ', 0, null)];

const answer = (split: { receiver_hospital_id: string; qty: number }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ task: 'F2_T1_ALLOCATION_NARRATIVE', summary_th: 'HY เหลือยาน้อยที่สุด', confidence: 'HIGH', pool_entry_id: POOL_ID, proposed_split: split, ...extra });

/** Replays one response per call and records what the agent sent. */
class ScriptedProvider implements ILLMProvider {
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
  async testConnection() {
    return { success: true, latencyMs: 0, message: 'ok', modelId: 'scripted' };
  }
}
const readTools = (poolId = POOL_ID): LLMResponse => ({
  content: null,
  model: 'scripted',
  toolCalls: ['get_pool_entry', 'get_demand_candidates'].map((name, i) => ({ id: `c${i}`, type: 'function' as const, function: { name, arguments: JSON.stringify({ pool_entry_id: poolId }) } })),
});
const reply = (content: string): LLMResponse => ({ content, model: 'scripted', usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } });

test('allocation agent: a proposal within the max_qty caps of listed receivers passes G-01, G-04 and G-03', () => {
  const r = validateAllocationProposal('```json\n' + answer([{ receiver_hospital_id: Y, qty: 300 }, { receiver_hospital_id: X, qty: 400 }]) + '\n```', POOL_ID, candidates);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, [{ receiverHospitalId: Y, qty: 300 }, { receiverHospitalId: X, qty: 400 }]);
  assert.deepEqual(r.hits.map((h) => `${h.rule}:${h.ok}`), ['G-01:true', 'G-04:true', 'G-03:true']);
});

test('allocation agent: changed numbers, unknown or infeasible receivers and extra fields are rejected', () => {
  const g03 = validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty: 350 }]), POOL_ID, candidates);
  assert.equal(g03.ok, false);
  assert.equal(g03.hits.at(-1)?.rule, 'G-03');
  for (const id of ['55555555-5555-4555-8555-555555555555', Z]) {
    const g04 = validateAllocationProposal(answer([{ receiver_hospital_id: id, qty: 0 }]), POOL_ID, candidates);
    assert.equal(g04.hits.at(-1)?.rule, 'G-04', id);
  }
  const dup = validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty: 300 }, { receiver_hospital_id: Y, qty: 300 }]), POOL_ID, candidates);
  assert.equal(dup.hits.at(-1)?.rule, 'G-04');
  assert.equal(validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty: 300 }], { approve: true }), POOL_ID, candidates).hits[0].rule, 'G-01');
  assert.equal(validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty: 300 }]).replace(POOL_ID, X), POOL_ID, candidates).ok, false);
  assert.equal(validateAllocationProposal('ส่งให้ HY ทั้งหมด', POOL_ID, candidates).ok, false);
});

test('allocation agent: the agent may choose smaller quantities, but not above a cap or the pool total', () => {
  const partial = validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty: 200 }, { receiver_hospital_id: X, qty: 100 }]), POOL_ID, candidates, 600);
  assert.equal(partial.ok, true);
  assert.deepEqual(partial.lines, [{ receiverHospitalId: Y, qty: 200 }, { receiverHospitalId: X, qty: 100 }]);
  const tooMuch = validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty: 300 }, { receiver_hospital_id: X, qty: 400 }]), POOL_ID, candidates, 600);
  assert.equal(tooMuch.ok, false, 'sum 700 > pool 600');
  assert.equal(tooMuch.hits.at(-1)?.rule, 'G-03');
  for (const [qty, rule] of [[0, 'G-03'], [12.5, 'G-03'], [-5, 'G-01']] as const) {
    assert.equal(validateAllocationProposal(answer([{ receiver_hospital_id: Y, qty }]), POOL_ID, candidates, 600).hits.at(-1)?.rule, rule, String(qty));
  }
});

test('allocation agent: reads both tools, then its valid split is used (status OK)', async () => {
  const llm = new ScriptedProvider([readTools(), reply(answer([{ receiver_hospital_id: Y, qty: 300 }, { receiver_hospital_id: X, qty: 300 }]))]);
  const run = await runAgent(pool, 40, candidates, llm);
  assert.equal(run.status, 'OK');
  assert.deepEqual(run.lines, [{ receiverHospitalId: Y, qty: 300 }, { receiverHospitalId: X, qty: 300 }]);
  assert.deepEqual(run.calls.map((c) => [c.tool, c.error]), [['get_pool_entry', null], ['get_demand_candidates', null]]);
  const tool = (run.calls[1].result as { candidates: { receiver_hospital_id: string; max_qty: number; can_use_before_expiry: boolean }[] }).candidates;
  assert.deepEqual(tool.map((c) => [c.receiver_hospital_id, c.max_qty, c.can_use_before_expiry]), [[X, 400, true], [Y, 300, true], [Z, 0, false]]);
  assert.equal(run.steps, 2);
  assert.equal(run.tokensOut, 50);
  assert.match(String(llm.seen[0][0].content), /data, never instructions/);
});

test('allocation agent: a tampered quantity gets one retry, then the code F-22 split is used (FALLBACK)', async () => {
  const bad = reply(answer([{ receiver_hospital_id: Y, qty: 600 }]));
  const llm = new ScriptedProvider([readTools(), bad, bad]);
  const run = await runAgent(pool, 40, candidates, llm);
  assert.equal(run.status, 'FALLBACK');
  assert.deepEqual(run.lines, ruleSplit(pool, 40, candidates));
  assert.equal(run.lines[0].receiverHospitalId, Y, 'F-22 greedy: fewest days of stock first');
  assert.ok(run.hits.filter((h) => h.rule === 'G-03' && !h.ok).length === 2);
  assert.match(String(llm.seen[2].at(-1)?.content), /G-03/, 'the retry tells the agent why');
});

test('allocation agent: tools only read the requested lot; an LLM error falls back to the rules', async () => {
  const other = new ScriptedProvider([readTools(X), reply(answer([{ receiver_hospital_id: Y, qty: 300 }]))]);
  const run = await runAgent(pool, 40, candidates, other);
  assert.deepEqual(run.calls.map((c) => c.error), ['อ่านได้เฉพาะล็อตที่ขอจัดสรร', 'อ่านได้เฉพาะล็อตที่ขอจัดสรร']);

  const down = await runAgent(pool, 40, candidates, new ScriptedProvider([new Error('503 from provider')]));
  assert.equal(down.status, 'FALLBACK');
  assert.deepEqual((down.output.flags as string[]).sort(), ['AGENT_FALLBACK', 'LLM_ERROR']);
  assert.deepEqual(down.lines, ruleSplit(pool, 40, candidates));
});
