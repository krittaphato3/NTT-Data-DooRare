/** Worked examples of the spec (04-rules-formulas.md §9.5). Run: `npm --prefix backend test`. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ceilSafe, chooseLenders, emergencyTimeoutMin, emptyCounts, etaRemainingMin, kitClass, needs, planKits, resolveEta, spread,
} from '../src/core/formulas/emergency.js';
import type { KitInput, Rule } from '../src/core/formulas/emergency.js';

const counts = (red: number, yellow: number, green: number) => ({ ...emptyCounts(), RED: red, YELLOW: yellow, GREEN: green, BLACK: 3, UNKNOWN: 2 });

test('F-26 ETA: reported wins unless unsure; unsure takes the smaller; nothing is invented', () => {
  assert.deepEqual(resolveEta({ reported: 25 }), { minutes: 25, source: 'REPORTED', flags: [] });
  assert.deepEqual(resolveEta({ reported: 25, unsure: true, route: 26 }), { minutes: 25, source: 'REPORTED', flags: [] }, 'route 26, reported 25, unsure -> 25');
  assert.deepEqual(resolveEta({ reported: 40, unsure: true, route: 26 }), { minutes: 26, source: 'ROUTE', flags: [] });
  assert.deepEqual(resolveEta({ reported: 25, unsure: true }), { minutes: 25, source: 'REPORTED', flags: ['ROUTE_UNAVAILABLE'] });
  assert.deepEqual(resolveEta({ route: 26.9 }), { minutes: 26, source: 'ROUTE', flags: [] }, 'floor to whole minutes');
  assert.deepEqual(resolveEta({}), { minutes: null, source: 'UNAVAILABLE', flags: ['ETA_UNAVAILABLE'] }, 'route service down, nothing reported');
  assert.deepEqual(resolveEta({ reported: 0 }), { minutes: null, source: 'UNAVAILABLE', flags: ['ETA_UNAVAILABLE'] }, 'a zero report is not an ETA');
  assert.equal(resolveEta({ reported: 1.5 }).minutes, 1, 'minimum 1');
});

test('F-26 remaining time never goes below 0 and stays null while unavailable', () => {
  const start = new Date('2026-10-22T10:00:00Z');
  assert.equal(etaRemainingMin(25, start, new Date('2026-10-22T10:10:00Z')), 15);
  assert.equal(etaRemainingMin(25, start, new Date('2026-10-22T11:00:00Z')), 0);
  assert.equal(etaRemainingMin(null, start, new Date('2026-10-22T10:10:00Z')), null);
});

test('F-28 timeout: class time capped by the remaining ETA, at least 1 minute', () => {
  const cfg = { critical: 3, supportive: 5 };
  assert.equal(emergencyTimeoutMin('CRITICAL', 2, cfg), 2, 'critical, ETA remaining 2 -> 2');
  assert.equal(emergencyTimeoutMin('CRITICAL', 40, cfg), 3);
  assert.equal(emergencyTimeoutMin('SUPPORTIVE', 40, cfg), 5);
  assert.equal(emergencyTimeoutMin('SUPPORTIVE', 0, cfg), 1, 'ETA elapsed -> 1 minute');
  assert.equal(emergencyTimeoutMin('CRITICAL', 2.9, cfg), 2, 'whole minutes, never later than ETA');
  assert.equal(emergencyTimeoutMin('CRITICAL', null, cfg), 3, 'ETA unavailable: fixed class time');
});

test('ceilSafe ignores binary noise', () => {
  assert.equal(ceilSafe(10 * 0.7), 7);
  assert.equal(ceilSafe(2.5), 3);
  assert.equal(ceilSafe(0), 0);
});

// Spec example: bus crash red 5 / yellow 10 / green 20 with seed rules (Trauma 1 per patient all levels,
// IV Set 1 for red & yellow, Intubation 0.5 per red).
const busRules: Rule[] = [
  { key: 'TRAUMA', triage: 'RED', perPatient: 1, critical: true },
  { key: 'TRAUMA', triage: 'YELLOW', perPatient: 1, critical: false },
  { key: 'TRAUMA', triage: 'GREEN', perPatient: 1, critical: false },
  { key: 'IV', triage: 'RED', perPatient: 1, critical: true },
  { key: 'IV', triage: 'YELLOW', perPatient: 1, critical: false },
  { key: 'INTUBATION', triage: 'RED', perPatient: 0.5, critical: true },
];

test('F-27 bus crash: Trauma Est 35 / Crit 5, IV Est 15 / Crit 5, Intubation Est 3 / Crit 3', () => {
  const lines = needs(counts(5, 10, 20), busRules);
  assert.deepEqual(lines, [
    { key: 'INTUBATION', est: 3, crit: 3 },
    { key: 'IV', est: 15, crit: 5 },
    { key: 'TRAUMA', est: 35, crit: 5 },
  ]);
});

test('F-27 black / unknown patients and zero patients produce no lines', () => {
  assert.deepEqual(needs(counts(0, 0, 0), busRules), []);
  assert.deepEqual(needs({ ...emptyCounts(), BLACK: 9, UNKNOWN: 4 }, busRules), []);
});

test('F-27 fractions accumulate before the ceiling', () => {
  const rules: Rule[] = [
    { key: 'K', triage: 'RED', perPatient: 0.25, critical: true },
    { key: 'K', triage: 'YELLOW', perPatient: 0.05, critical: false },
  ];
  // red 3 -> 0.75, yellow 10 -> 0.5: est ceil(1.25) = 2 (not ceil(.75)+ceil(.5)=2 by luck); crit ceil(.75) = 1
  assert.deepEqual(needs(counts(3, 10, 0), rules), [{ key: 'K', est: 2, crit: 1 }]);
  assert.deepEqual(needs(counts(10, 0, 0), [{ key: 'K', triage: 'RED', perPatient: 0.7, critical: true }]), [{ key: 'K', est: 7, crit: 7 }]);
});

const intubation = (ready: number, loose: Record<string, number>): { kit: KitInput; loose: Record<string, number> } => ({
  kit: { key: 'INTUBATION', est: 8, crit: 4, ready, components: [{ item: 'ET', perKit: 1 }, { item: 'STYLET', perKit: 1 }, { item: 'BLADE', perKit: 1 }, { item: 'SYRINGE', perKit: 1 }] },
  loose,
});

test('F-27 intubation example: Est 8, ready 4, loose stylet 3 -> use 4, pack 3, borrow 1 whole set', () => {
  const { kit, loose } = intubation(4, { ET: 10, STYLET: 3, BLADE: 10, SYRINGE: 10 });
  const plan = planKits([kit], [], loose, 'est');
  assert.deepEqual(plan.kits[0], { key: 'INTUBATION', quantity: 8, useReady: 4, packMax: 3, pack: 3, borrowSet: 1, noRecipe: false, overridden: false });
  assert.equal(plan.looseLeft.STYLET, 0);
  assert.equal(plan.looseLeft.ET, 7);
});

test('F-27 staff may lower the pack count and the reduction becomes borrow quantity; a higher count is rejected', () => {
  const { kit, loose } = intubation(4, { ET: 10, STYLET: 3, BLADE: 10, SYRINGE: 10 });
  const lowered = planKits([kit], [], loose, 'est', { INTUBATION: 1 });
  assert.equal(lowered.kits[0].pack, 1);
  assert.equal(lowered.kits[0].borrowSet, 3);
  assert.equal(lowered.kits[0].overridden, true);
  assert.equal(lowered.looseLeft.STYLET, 2, 'loose stock not packed stays available');
  const raised = planKits([kit], [], loose, 'est', { INTUBATION: 5 });
  assert.equal(raised.kits[0].pack, 3);
  assert.deepEqual(raised.rejectedOverrides, [{ key: 'INTUBATION', requested: 5, max: 3 }]);
});

test('F-27 critical kits get shared components first', () => {
  const kits: KitInput[] = [
    { key: 'B_SUPPORT', est: 3, crit: 0, ready: 0, components: [{ item: 'X', perKit: 1 }] },
    { key: 'A_CRIT', est: 3, crit: 3, ready: 0, components: [{ item: 'X', perKit: 1 }] },
  ];
  const plan = planKits(kits, [], { X: 4 }, 'est');
  const byKey = Object.fromEntries(plan.kits.map((k) => [k.key, k]));
  assert.equal(byKey.A_CRIT.pack, 3);
  assert.equal(byKey.B_SUPPORT.pack, 1);
  assert.equal(byKey.B_SUPPORT.borrowSet, 2);
  assert.equal(plan.kits[0].key, 'A_CRIT', 'critical first');
});

test('F-27 no recipe: nothing is packed, the whole remainder is flagged and borrowed as sets', () => {
  const plan = planKits([{ key: 'ODD', est: 4, crit: 1, ready: 1, components: [] }], [], {}, 'est');
  assert.deepEqual(plan.kits[0], { key: 'ODD', quantity: 4, useReady: 1, packMax: 0, pack: 0, borrowSet: 3, noRecipe: true, overridden: false });
});

test('F-27 a missing single component means the whole set is borrowed, never the component', () => {
  const plan = planKits([{ key: 'K', est: 2, crit: 2, ready: 0, components: [{ item: 'A', perKit: 1 }, { item: 'B', perKit: 2 }] }], [], { A: 5, B: 1 }, 'est');
  assert.equal(plan.kits[0].pack, 0);
  assert.equal(plan.kits[0].borrowSet, 2);
});

test('F-27 extra items use what loose stock is left after packing and borrow the rest', () => {
  const kits: KitInput[] = [{ key: 'K', est: 2, crit: 2, ready: 0, components: [{ item: 'ATROPINE', perKit: 2 }] }];
  const plan = planKits(kits, [{ key: 'ATROPINE', est: 6, crit: 2 }, { key: 'ORS', est: 5, crit: 0 }], { ATROPINE: 7, ORS: 20 }, 'est');
  assert.equal(plan.kits[0].pack, 2, 'packs 2 sets using 4 atropine');
  assert.deepEqual(plan.extras, [
    { key: 'ATROPINE', quantity: 6, useLoose: 3, borrow: 3 },
    { key: 'ORS', quantity: 5, useLoose: 5, borrow: 0 },
  ]);
});

test('F-27 critical-minimum run uses the same algorithm on the critical quantities', () => {
  const { kit, loose } = intubation(4, { ET: 10, STYLET: 3, BLADE: 10, SYRINGE: 10 });
  const crit = planKits([kit], [], loose, 'crit');
  assert.equal(crit.kits[0].quantity, 4);
  assert.equal(crit.kits[0].useReady, 4);
  assert.equal(crit.kits[0].borrowSet, 0);
});

test('F-27 spread counts items inside ready sets as available and reports shortages', () => {
  const lines = spread(
    [{ key: 'K', est: 8, ready: 4, components: [{ item: 'STYLET', perKit: 1 }, { item: 'ET', perKit: 1 }] }],
    [{ key: 'ET', est: 2 }],
    { STYLET: 3, ET: 10 },
  );
  assert.deepEqual(lines, [
    { item: 'ET', need: 10, available: 14, shortage: 0 },
    { item: 'STYLET', need: 8, available: 7, shortage: 1 },
  ]);
});

test('lender choice: in time first (nearest), fastest when nobody can make it, nearest when ETA unknown', () => {
  const cands = [
    { hospitalId: 'c', transitMin: 19 },
    { hospitalId: 'a', transitMin: 11 },
    { hospitalId: 'b', transitMin: 14 },
    { hospitalId: 'n', transitMin: null },
  ];
  assert.deepEqual(chooseLenders(cands, 15, 5), { chosen: [cands[1], cands[2]], mode: 'IN_TIME' });
  assert.deepEqual(chooseLenders(cands, 12, 5).chosen.map((c) => c.hospitalId), ['a']);
  assert.deepEqual(chooseLenders(cands, 5, 5), { chosen: [cands[1]], mode: 'FASTEST_LATE' });
  assert.deepEqual(chooseLenders(cands, 0, 5).mode, 'FASTEST_LATE', 'ETA elapsed');
  assert.deepEqual(chooseLenders(cands, null, 5).chosen.map((c) => c.hospitalId), ['a', 'b', 'c'], 'ETA unknown: nearest three');
  assert.deepEqual(chooseLenders(cands, 100, 2).chosen.map((c) => c.hospitalId), ['a', 'b'], 'capped');
  assert.deepEqual(chooseLenders([], 10, 5).chosen, []);
});

test('kit class follows the critical minimum', () => {
  assert.equal(kitClass(3), 'CRITICAL');
  assert.equal(kitClass(0), 'SUPPORTIVE');
});
