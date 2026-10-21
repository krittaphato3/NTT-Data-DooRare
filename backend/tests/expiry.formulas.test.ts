/** Worked examples of the spec (04-rules-formulas.md §9.4). Run: `npm --prefix backend test`. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateToReceiver, costCheck, fefoUsable, greedyOrder, isNearExpiry, releasable, remainingDays, repeatLevel, reductionPlan, splitLot, transportCost,
} from '../src/core/formulas/expiry.js';

const model = { base: 300, perKm: 8, coldChainSurcharge: 500, ratioMax: 0.2 };

test('F-22 remaining days and near-expiry rule', () => {
  assert.equal(remainingDays(new Date('2027-01-18'), new Date('2026-10-20')), 90);
  assert.equal(isNearExpiry(90, 180), true);
  assert.equal(isNearExpiry(181, 180), false);
  assert.equal(isNearExpiry(0, 180), false, 'an expired lot cannot be released');
});

test('F-22 example: lot 500, 90 d, transit 1 d, handling 1 d, receiver u 10, TT 300, stock 120 -> alloc 180', () => {
  const a = allocateToReceiver({ hospitalId: 'r', totalTarget: 300, stock: 120, incoming: 0, usePerDay: 10, transitDays: 1 }, 90, 500);
  assert.ok(a);
  assert.equal(a.deficit, 180);
  assert.equal(a.daysAvail, 88);
  assert.equal(a.consumable, 880);
  assert.equal(a.qty, 180);
  assert.equal(a.qty / 10, 18, 'consumed in 18 days');
});

test('F-22 edge cases: u = 0 not feasible, nothing usable in time, remainder stays in the pool', () => {
  assert.equal(allocateToReceiver({ hospitalId: 'r', totalTarget: 300, stock: 0, incoming: 0, usePerDay: 0, transitDays: 1 }, 90, 500), null);
  assert.equal(allocateToReceiver({ hospitalId: 'r', totalTarget: 300, stock: 0, incoming: 0, usePerDay: 10, transitDays: 5 }, 6, 500), null, 'days_avail 0');
  const split = splitLot(
    [
      { hospitalId: 'a', totalTarget: 300, stock: 120, incoming: 0, usePerDay: 10, transitDays: 1 },
      { hospitalId: 'b', totalTarget: 200, stock: 50, incoming: 0, usePerDay: 5, transitDays: 0.5 },
    ],
    500,
    90,
  );
  assert.deepEqual(split.lines.map((l) => [l.hospitalId, l.qty]), [['b', 150], ['a', 180]], 'fewest days of stock first (b: 10 d, a: 12 d)');
  assert.equal(split.remainder, 170);
});

test('F-22 greedy order: fewest days of stock, tie shorter transit', () => {
  const order = greedyOrder([
    { hospitalId: 'x', totalTarget: 0, stock: 100, incoming: 0, usePerDay: 10, transitDays: 2 },
    { hospitalId: 'y', totalTarget: 0, stock: 50, incoming: 0, usePerDay: 5, transitDays: 1 },
    { hospitalId: 'z', totalTarget: 0, stock: 10, incoming: 0, usePerDay: 5, transitDays: 3 },
  ]).map((r) => r.hospitalId);
  assert.deepEqual(order, ['z', 'y', 'x'], 'x and y both have 10 days of stock; y is closer');
});

test('F-22 FEFO helper of the near-expiry drawer', () => {
  assert.equal(fefoUsable(125, 0.3), 37);
  assert.equal(releasable(60, 125, 0.3), 23);
  assert.equal(releasable(10, 400, 1), 0);
});

test('F-23 example: 180 x 25 THB, 50 km -> 700 THB = 15.6 % economical; cold chain 1,200 = 26.7 % uneconomical', () => {
  const value = 180 * 25;
  const cost = transportCost(50, false, model);
  assert.equal(cost, 700);
  assert.deepEqual(costCheck(cost, value, 0.2), { ratio: 0.1556, uneconomical: false });
  const cold = transportCost(50, true, model);
  assert.equal(cold, 1200);
  assert.deepEqual(costCheck(cold, value, 0.2), { ratio: 0.2667, uneconomical: true });
  assert.deepEqual(costCheck(100, 0, 0.2), { ratio: null, uneconomical: true }, 'value 0 is uneconomical');
});

test('F-25 example: lots 400 / 300 / 500 left, order 2,000 per 120 d, u 13/day, cost 12 THB -> new order 1,600, saves 14,400 THB/year', () => {
  const lv = repeatLevel({ leftovers: [400, 300, 500].map((q) => ({ qty: q, unitCost: 12 })), watchCount: 2, recommendCount: 3, recommendValueThb: 10000 });
  assert.equal(lv.level, 'RECOMMEND');
  assert.equal(lv.lots, 3);
  const plan = reductionPlan({ orderQtyAvg: 2000, orderCycleDays: 120, usePerDay: 13, unitCost: 12, avgLeftover: 400 });
  assert.deepEqual(plan, { newOrder: 1600, reduction: 400, cyclesPerYear: 3, expectedSavingsThb: 14400 });
  assert.equal(reductionPlan({ orderQtyAvg: null, orderCycleDays: null, usePerDay: 13, unitCost: 12, avgLeftover: 400 }), null, 'no order history -> no number');
  assert.equal(reductionPlan({ orderQtyAvg: 1000, orderCycleDays: 100, usePerDay: 20, unitCost: 1, avgLeftover: 50 }), null, 'usage already covers the order');
});

test('F-25 levels', () => {
  const l = (n: number, unit = 1) => repeatLevel({ leftovers: Array.from({ length: n }, () => ({ qty: 10, unitCost: unit })), watchCount: 2, recommendCount: 3, recommendValueThb: 10000 }).level;
  assert.equal(l(1), null);
  assert.equal(l(2), 'WATCH');
  assert.equal(l(3), 'RECOMMEND');
  assert.equal(l(2, 600), 'RECOMMEND', 'lost value >= threshold');
});
