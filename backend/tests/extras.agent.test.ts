import test from 'node:test';
import assert from 'node:assert/strict';
import { maxExtraQty, validateExtras } from '../src/modules/incidents/extras.agent.js';
import type { ExtrasContext } from '../src/modules/incidents/extras.agent.js';

/** AGT-F3 extra-items agent: answer checks (G-01 / G-03 / G-04) and the quantity ceiling. No DB. */

const X = '11111111-1111-4111-8111-111111111111';
const Y = '22222222-2222-4222-8222-222222222222';
const ctx: ExtrasContext = {
  incidentNo: 'INC-1',
  maxQty: 40,
  candidates: [
    { id: X, name: 'Calcium gluconate 10% inj', unit: 'amp', cls: 'CRITICAL', free: 120 },
    { id: Y, name: 'Silver sulfadiazine cream', unit: 'tube', cls: 'SUPPORTIVE', free: 0 },
  ],
};
const answer = (suggestions: { drug_master_id: string; qty: number; rationale?: string }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ task: 'F3_T2_EXTRA_ITEMS', summary_th: 'เหตุสารเคมีรั่ว เตรียมยาเพิ่ม', confidence: 'MEDIUM', incident_no: 'INC-1', suggestions: suggestions.map((s) => ({ rationale: 'ใช้กับผู้ป่วยสัมผัสสาร', ...s })), ...extra });

test('f3 agent: a valid answer passes G-01, G-04 and G-03', () => {
  const r = validateExtras('```json\n' + answer([{ drug_master_id: X, qty: 30 }, { drug_master_id: Y, qty: 12 }]) + '\n```', ctx);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.hits.map((h) => `${h.rule}:${h.ok}`), ['G-01:true', 'G-04:true', 'G-03:true']);
  assert.deepEqual(r.value.suggestions.map((s) => [s.drugMasterId, s.qty]), [[X, 30], [Y, 12]]);
});

test('f3 agent: an empty list is a valid answer (nothing more is needed)', () => {
  const r = validateExtras(answer([]), ctx);
  assert.equal(r.ok, true);
});

test('f3 agent: unknown / duplicate drugs, quantities outside 1..ceiling and schema breaks are rejected', () => {
  const rule = (raw: string) => { const r = validateExtras(raw, ctx); return r.ok ? 'OK' : r.hits.at(-1)?.rule; };
  assert.equal(rule(answer([{ drug_master_id: '33333333-3333-4333-8333-333333333333', qty: 5 }])), 'G-04');
  assert.equal(rule(answer([{ drug_master_id: X, qty: 5 }, { drug_master_id: X, qty: 6 }])), 'G-04');
  assert.equal(rule(answer([{ drug_master_id: X, qty: 41 }])), 'G-03', 'above the ceiling 40');
  assert.equal(rule(answer([{ drug_master_id: X, qty: 0 }])), 'G-03');
  assert.equal(rule(answer([{ drug_master_id: X, qty: 2.5 }])), 'G-03');
  assert.equal(rule(answer([{ drug_master_id: X, qty: 5 }], { approve: true })), 'G-01');
  assert.equal(rule(answer([{ drug_master_id: X, qty: 5 }]).replace('INC-1', 'INC-2')), 'G-01');
  assert.equal(rule(answer(Array.from({ length: 9 }, () => ({ drug_master_id: X, qty: 1 })))), 'G-01', 'more than 8 suggestions');
  assert.equal(rule('เตรียม calcium gluconate'), 'G-01');
});

test('f3 agent: the quantity ceiling follows the patients that need care', () => {
  assert.equal(maxExtraQty({ RED: 2, YELLOW: 3, GREEN: 4 }), 18);
  assert.equal(maxExtraQty({ RED: 0, YELLOW: 1, GREEN: 1 }), 10, 'at least 10');
});
