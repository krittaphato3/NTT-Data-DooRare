/** Worked examples of the spec (04-rules-formulas.md §9.2). Run: `npm --prefix backend test`. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateRound, borrowQty, borrowRemaining, dailyUsage, hardFilterFailure, leadTimeDays, lendableStock, normalUseQty, priorityScore, rankBySi,
  raiseUrgency, requiredQty, round, roundParts, scoreFulfill, scoreReliability, scoreStockSafety, scoreTime, stopMet, stopThreshold, timeoutPlan, urgencyFor, windowMaxDays,
} from '../src/core/formulas/borrow.js';

const close = (actual: number, expected: number, digits = 4) => assert.equal(round(actual, digits), expected);

test('F-08 lead time and daily usage', () => {
  const today = new Date('2026-10-20T00:00:00Z');
  assert.equal(leadTimeDays(new Date('2026-10-23T00:00:00Z'), today, 5), 3);
  assert.equal(leadTimeDays(null, today, 5), 5);
  assert.equal(leadTimeDays(new Date('2026-10-10T00:00:00Z'), today, 5), 5, 'an overdue PO falls back to the standard lead time');
  assert.equal(leadTimeDays(new Date('2026-10-20T06:00:00Z'), today, 5), 1, 'L is at least 1');
  assert.equal(dailyUsage(70, 300, 3), 10, 'P50_week 70 -> u = 10/day');
  assert.equal(dailyUsage(70, 300, 10), 10, 'L > 7 uses P50_month / 30');
});

test('F-09 example A (REGULAR V): R = 41.43, stock 15 -> borrow 27', () => {
  const r = requiredQty({ pattern: 'REGULAR', u: 10, leadDays: 3, sigma: 4, z: 1.65, quantileOverLead: null });
  close(r, 41.4315, 4);
  assert.equal(round(r, 2), 41.43);
  assert.equal(borrowQty(r, 15, 0), 27);
});

test('F-09 example B (INTERMITTENT V): R = 38 from the quantile, borrow 23', () => {
  const r = requiredQty({ pattern: 'INTERMITTENT', u: 10, leadDays: 3, sigma: 12, z: 1.65, quantileOverLead: 38 });
  assert.equal(r, 38);
  assert.equal(borrowQty(r, 15, 0), 23);
  assert.equal(round(10 * 3 + 1.65 * 12 * Math.sqrt(3), 2), 64.29, 'the classical formula would over-request');
});

test('BR-F1b-004: nothing to borrow when stock + incoming cover R', () => {
  assert.equal(borrowQty(30, 25, 5), 0);
  assert.equal(borrowQty(30, 40, 0), 0);
});

test('F-10 window and F-11 urgency', () => {
  assert.equal(windowMaxDays(15, 10), 1.5);
  assert.equal(windowMaxDays(0, 10), 0);
  assert.equal(windowMaxDays(15, 0), 365);
  assert.equal(urgencyFor('V', 1.5), 'VERY_URGENT');
  assert.equal(urgencyFor('V', 2), 'VERY_URGENT');
  assert.equal(urgencyFor('V', 5), 'URGENT');
  assert.equal(urgencyFor('V', 7), 'URGENT');
  assert.equal(urgencyFor('V', 8), 'NORMAL');
  assert.equal(urgencyFor('E', 2), 'URGENT');
  assert.equal(urgencyFor('E', 3), 'NORMAL');
  assert.equal(urgencyFor('D', 0), 'NORMAL');
  assert.equal(raiseUrgency('NORMAL'), 'URGENT');
  assert.equal(raiseUrgency('URGENT'), 'VERY_URGENT');
  assert.equal(raiseUrgency('VERY_URGENT'), 'VERY_URGENT', 'never above VERY_URGENT');
});

test('F-13 lendable stock: usable 120, target 94 -> 26', () => {
  assert.equal(lendableStock(120, 94), 26);
  assert.equal(lendableStock(50, 94), 0);
});

test('F-14..F-18 Si of the four worked lenders; order B, C, E, D', () => {
  const need = 120;
  const windowMin = 36 * 60;
  const lender = (transitH: number, lendable: number, stock: number, u: number, approval: number | null, timeout: number | null) => {
    const qtyLend = Math.min(lendable, need);
    const parts = {
      time: scoreTime(transitH * 60, windowMin),
      fulfill: scoreFulfill(lendable, need),
      stockSafety: scoreStockSafety(stock, qtyLend, u),
      reliability: scoreReliability(approval, timeout),
    };
    return { parts, si: priorityScore(parts), transitMin: transitH * 60 };
  };
  const B = lender(4, 80, 200, 10, 0.9, 0.1);
  const C = lender(5, 60, 150, 12, null, null);
  const E = lender(8, 40, 90, 8, 0.7, 0.2);
  const D = lender(30, 100, 300, 15, 0.8, 0.05);
  assert.deepEqual(roundParts(B.parts), { time: 0.8889, fulfill: 0.6667, stockSafety: 0.4, reliability: 0.81 });
  assert.deepEqual(roundParts(C.parts), { time: 0.8611, fulfill: 0.5, stockSafety: 0.25, reliability: 0.5 });
  assert.deepEqual(roundParts(E.parts), { time: 0.7778, fulfill: 0.3333, stockSafety: 0.2083, reliability: 0.56 });
  assert.deepEqual(roundParts(D.parts), { time: 0.1667, fulfill: 0.8333, stockSafety: 0.4444, reliability: 0.76 });
  assert.equal(B.si, 0.7357);
  assert.equal(C.si, 0.62);
  assert.equal(E.si, 0.5348);
  assert.equal(D.si, 0.4599);
  const ranked = rankBySi([
    { id: 'D', hospitalId: 'd', ...D }, { id: 'B', hospitalId: 'b', ...B }, { id: 'E', hospitalId: 'e', ...E }, { id: 'C', hospitalId: 'c', ...C },
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ['B', 'C', 'E', 'D']);
});

test('F-17 u_lender = 0 gives stock safety 1; ties break on transit then id', () => {
  assert.equal(scoreStockSafety(100, 10, 0), 1);
  const tie = rankBySi([{ si: 0.5, transitMin: 30, hospitalId: 'b' }, { si: 0.5, transitMin: 20, hospitalId: 'z' }, { si: 0.5, transitMin: 20, hospitalId: 'a' }]);
  assert.deepEqual(tie.map((t) => t.hospitalId), ['a', 'z', 'b']);
});

test('F-12 hard filter reasons', () => {
  const ok = { transitMin: 30, windowMaxMin: 120, lendable: 10, coldChain: false, lenderColdChainCapable: false, boxMinutes: 360, controlled: false, lenderActive: true, lenderAgentParticipation: true, mappingVerified: true, hasTotalTarget: true };
  assert.equal(hardFilterFailure(ok), null);
  assert.equal(hardFilterFailure({ ...ok, transitMin: null }), 'NO_DISTANCE');
  assert.equal(hardFilterFailure({ ...ok, transitMin: 2400 }), 'TRANSIT_TOO_LONG');
  assert.equal(hardFilterFailure({ ...ok, lendable: 0 }), 'NO_LENDABLE_STOCK');
  assert.equal(hardFilterFailure({ ...ok, controlled: true }), 'CONTROLLED_DRUG');
  assert.equal(hardFilterFailure({ ...ok, coldChain: true }), 'COLD_CHAIN');
  assert.equal(hardFilterFailure({ ...ok, coldChain: true, lenderColdChainCapable: true }), null);
  assert.equal(hardFilterFailure({ ...ok, windowMaxMin: 1000, coldChain: true, lenderColdChainCapable: true, transitMin: 400 }), 'COLD_CHAIN', 'beyond box validity (6 h = 360 min)');
  assert.equal(hardFilterFailure({ ...ok, hasTotalTarget: false }), 'NO_TOTAL_TARGET');
  assert.equal(hardFilterFailure({ ...ok, mappingVerified: false }), 'MAPPING_NOT_VERIFIED');
});

test('F-21 round allocation: B(80), C(60), need 120', () => {
  const ranked = [{ hospitalId: 'B', lendable: 80 }, { hospitalId: 'C', lendable: 60 }, { hospitalId: 'E', lendable: 40 }];
  assert.deepEqual(allocateRound(ranked, 120, true), [{ hospitalId: 'B', qty: 80 }, { hospitalId: 'C', qty: 40 }]);
  assert.deepEqual(allocateRound(ranked, 120, false), [{ hospitalId: 'B', qty: 80 }], 'sequential asks the first lender only');
  assert.deepEqual(allocateRound(ranked, 50, true), [{ hospitalId: 'B', qty: 50 }], 'never above the need');
  assert.equal(allocateRound(ranked, 500, true, 2).length, 2, 'at most maxParallel lenders');
});

test('F-20 stop rules: V needs 90 % of round 1, E needs normal use', () => {
  const vThreshold = stopThreshold('V', 120, 0);
  assert.equal(vThreshold, 108);
  assert.equal(stopMet(100, vThreshold), false, 'B 80 + C 20 = 100 < 108 -> continue');
  assert.equal(borrowRemaining(120, 0, 0, 100), 20, 'remaining 20 goes to the next lender');
  assert.equal(stopMet(120, vThreshold), true);
  // E: u = 8, L = 3, stock 10, sigma 3, Z 1.28 -> first request 21, stop threshold 14
  const r = requiredQty({ pattern: 'REGULAR', u: 8, leadDays: 3, sigma: 3, z: 1.28, quantileOverLead: null });
  assert.equal(borrowQty(r, 10, 0), 21);
  const normalUse = normalUseQty(8, 3, 10, 0);
  assert.equal(normalUse, 14);
  assert.equal(stopThreshold('E', 21, normalUse), 14);
  assert.equal(stopThreshold('D', 5, 0), Infinity);
});

test('F-19 timeout: very urgent, stock 15, u 10 -> 120 min, reminder at 60', () => {
  const t = timeoutPlan('VERY_URGENT', 15, 10);
  assert.equal(t.effectiveMin, 120);
  assert.equal(t.reminderAfterMin, 60);
  assert.equal(t.autoEscalate, false);
  const short = timeoutPlan('NORMAL', 1, 10);
  assert.equal(round(short.effectiveMin, 1), 144, 'capped by the remaining stock window (0.1 day)');
  assert.equal(timeoutPlan('URGENT', 0, 10).autoEscalate, true, 'no stock left escalates at once');
  assert.equal(timeoutPlan('NORMAL', 5, 0).effectiveMin, 2880, 'u = 0 keeps the table value');
});
