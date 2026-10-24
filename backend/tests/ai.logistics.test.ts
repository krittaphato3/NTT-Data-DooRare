import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFefoPickListTool,
  checkColdChainComplianceTool,
  getKitPackingChecklistTool,
  verifyBatchBarcodeTool,
  submitWarehouseConfirmationProposalTool,
  parseGs1Barcode,
  warehouseTools,
} from '../src/modules/ai/tools/logistics/warehouse.tools.js';
import { query, pool } from '../src/db/client.js';

test.after(async () => {
  await pool.end();
});

// --- TOOL CONFIGURATION & RBAC TESTS ---

test('warehouseTools collection contains exactly 5 tools with expected names and roles', () => {
  assert.equal(warehouseTools.length, 5, 'Must export exactly 5 warehouse tools');

  const names = warehouseTools.map((t) => t.name);
  assert.deepEqual(names, [
    'get_fefo_pick_list',
    'check_cold_chain_compliance',
    'get_kit_packing_checklist',
    'verify_batch_barcode',
    'submit_warehouse_confirmation_proposal',
  ]);

  assert.deepEqual(getFefoPickListTool.allowedRoles, ['WAREHOUSE_OFFICER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN']);
  assert.deepEqual(checkColdChainComplianceTool.allowedRoles, ['WAREHOUSE_OFFICER', 'DRIVER', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN']);
  assert.deepEqual(getKitPackingChecklistTool.allowedRoles, ['WAREHOUSE_OFFICER', 'ER_STAFF', 'SYSTEM_ADMIN']);
  assert.deepEqual(verifyBatchBarcodeTool.allowedRoles, ['WAREHOUSE_OFFICER', 'SYSTEM_ADMIN']);
  assert.deepEqual(submitWarehouseConfirmationProposalTool.allowedRoles, ['WAREHOUSE_OFFICER', 'SYSTEM_ADMIN']);
});

test('Parameter schema validation: valid and invalid inputs across all 5 tools', () => {
  // 1. get_fefo_pick_list
  assert.equal(getFefoPickListTool.parameters.safeParse({ hospitalDrugId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }).success, true);
  assert.equal(getFefoPickListTool.parameters.safeParse({ drugCode: 'DRUG-01', quantityNeeded: 10, excludeHeld: false }).success, true);
  assert.equal(getFefoPickListTool.parameters.safeParse({ hospitalDrugId: 'not-a-uuid' }).success, false);
  assert.equal(getFefoPickListTool.parameters.safeParse({ quantityNeeded: -5 }).success, false);

  // 2. check_cold_chain_compliance
  assert.equal(checkColdChainComplianceTool.parameters.safeParse({ taskId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }).success, true);
  assert.equal(checkColdChainComplianceTool.parameters.safeParse({
    temperatureLogs: [{ recordedAt: '2026-10-24T00:00:00Z', temperatureC: 4.5 }],
    thresholdMin: 2,
    thresholdMax: 8,
  }).success, true);
  assert.equal(checkColdChainComplianceTool.parameters.safeParse({ taskId: 'not-a-uuid' }).success, false);
  assert.equal(checkColdChainComplianceTool.parameters.safeParse({ temperatureLogs: [{ recordedAt: 'abc', temperatureC: 'high' }] }).success, false);

  // 3. get_kit_packing_checklist
  assert.equal(getKitPackingChecklistTool.parameters.safeParse({ kitTaskId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }).success, true);
  assert.equal(getKitPackingChecklistTool.parameters.safeParse({ kitTypeId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }).success, true);
  assert.equal(getKitPackingChecklistTool.parameters.safeParse({ incidentId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }).success, true);
  assert.equal(getKitPackingChecklistTool.parameters.safeParse({ kitTaskId: 'invalid' }).success, false);

  // 4. verify_batch_barcode
  assert.equal(verifyBatchBarcodeTool.parameters.safeParse({ barcode: '(01)08851234567890(17)261231(10)LOT123' }).success, true);
  assert.equal(verifyBatchBarcodeTool.parameters.safeParse({ barcode: 'LOCAL123', expectedLotNo: 'LOCAL123' }).success, true);
  assert.equal(verifyBatchBarcodeTool.parameters.safeParse({}).success, false); // barcode required
  assert.equal(verifyBatchBarcodeTool.parameters.safeParse({ barcode: '123', hospitalDrugId: 'not-a-uuid' }).success, false);

  // 5. submit_warehouse_confirmation_proposal
  assert.equal(
    submitWarehouseConfirmationProposalTool.parameters.safeParse({
      actionType: 'CONFIRM_DISPATCH',
      title: 'Dispatch confirmation',
      description: 'Loaded on truck',
      summary: { taskNo: 'T-001' },
      targetId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      payload: { version: 1 },
    }).success,
    true,
  );
  assert.equal(
    submitWarehouseConfirmationProposalTool.parameters.safeParse({
      actionType: 'UNKNOWN_ACTION',
      title: 'Invalid',
      description: 'Invalid',
      summary: {},
      targetId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    }).success,
    false,
  );
  assert.equal(
    submitWarehouseConfirmationProposalTool.parameters.safeParse({
      actionType: 'CONFIRM_DISPATCH',
      title: 'Missing targetId',
      description: 'Missing targetId',
      summary: {},
    }).success,
    false,
  );
});

// --- PARSER TESTS: parseGs1Barcode ---

test('parseGs1Barcode: parses parenthesised GS1 barcode string', () => {
  const input = '(01)08851234567890(17)261231(10)BATCH99';
  const result = parseGs1Barcode(input);
  assert.equal(result.detectedStandard, 'GS1');
  assert.equal(result.gtin, '08851234567890');
  assert.equal(result.expiryDate, '2026-12-31');
  assert.equal(result.lotNo, 'BATCH99');
});

test('parseGs1Barcode: parses unparenthesised GS1 stream with and without GS separator', () => {
  // With GS delimiter (\x1d) separating variable AI 10 from next AI
  const streamWithGs = '010885123456789010LOT456\x1d17260815';
  const res1 = parseGs1Barcode(streamWithGs);
  assert.equal(res1.detectedStandard, 'GS1');
  assert.equal(res1.gtin, '08851234567890');
  assert.equal(res1.lotNo, 'LOT456');
  assert.equal(res1.expiryDate, '2026-08-15');

  // Without GS delimiter when AI 10 is at the end of the string
  const streamAtEnd = '01088512345678901726081510FINALBATCH';
  const res2 = parseGs1Barcode(streamAtEnd);
  assert.equal(res2.detectedStandard, 'GS1');
  assert.equal(res2.gtin, '08851234567890');
  assert.equal(res2.expiryDate, '2026-08-15');
  assert.equal(res2.lotNo, 'FINALBATCH');
});

test('parseGs1Barcode: handles day 00 as last day of month', () => {
  // February in a non-leap year 2025: 250200 -> 2025-02-28
  const febNonLeap = '(01)08851234567890(17)250200(10)FEB25';
  const resFeb = parseGs1Barcode(febNonLeap);
  assert.equal(resFeb.expiryDate, '2025-02-28');

  // February in leap year 2024: 240200 -> 2024-02-29
  const febLeap = '(01)08851234567890(17)240200(10)FEB24';
  const resLeap = parseGs1Barcode(febLeap);
  assert.equal(resLeap.expiryDate, '2024-02-29');

  // April (30 days): 260400 -> 2026-04-30
  const apr = '(01)08851234567890(17)260400(10)APR26';
  assert.equal(parseGs1Barcode(apr).expiryDate, '2026-04-30');
});

test('parseGs1Barcode: strips symbology prefixes (]C1, ]d2, ]e0)', () => {
  const prefix1 = ']C101088512345678901726081510LOT101';
  const res1 = parseGs1Barcode(prefix1);
  assert.equal(res1.detectedStandard, 'GS1');
  assert.equal(res1.gtin, '08851234567890');
  assert.equal(res1.lotNo, 'LOT101');

  const prefix2 = ']d2(01)08851234567890(17)261231(10)LOTDM';
  const res2 = parseGs1Barcode(prefix2);
  assert.equal(res2.detectedStandard, 'GS1');
  assert.equal(res2.lotNo, 'LOTDM');
});

test('parseGs1Barcode: falls back to LOCAL standard on non-GS1 strings or garbage', () => {
  const local = parseGs1Barcode('LOT-A-98765');
  assert.equal(local.detectedStandard, 'LOCAL');
  assert.equal(local.lotNo, 'LOT-A-98765');
  assert.equal(local.gtin, undefined);
  assert.equal(local.expiryDate, undefined);

  const empty = parseGs1Barcode('');
  assert.equal(empty.detectedStandard, 'LOCAL');
  assert.equal(empty.lotNo, '');
});

// --- TOOL 1: get_fefo_pick_list TESTS ---

test('getFefoPickListTool: requires hospitalId for non-admin', async () => {
  const res = await getFefoPickListTool.execute(
    { drugCode: 'SOME_DRUG' },
    { role: 'WAREHOUSE_OFFICER', hospitalId: null },
  );
  assert.equal(res.success, false);
  assert.match(res.error || '', /hospitalId is required/i);
});

test('getFefoPickListTool: requires hospitalDrugId or drugCode', async () => {
  const res = await getFefoPickListTool.execute(
    {},
    { role: 'SYSTEM_ADMIN' },
  );
  assert.equal(res.success, false);
  assert.match(res.error || '', /Either hospitalDrugId or drugCode/i);
});

test('getFefoPickListTool: FEFO greedy allocation, held stock exclusion, and expired lot handling', async () => {
  // Find a hospital that has stock lots
  const lotQuery = await query<{
    hospital_id: string;
    hospital_drug_id: string;
    local_code: string;
  }>(
    `SELECT sl.hospital_id, sl.hospital_drug_id, hd.local_code
       FROM stock_lot sl
       JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
      WHERE sl.qty_on_hand > 0
      LIMIT 1`,
  );

  if (lotQuery.rows.length === 0) {
    // If no data, test basic structure
    return;
  }

  const { hospital_id, hospital_drug_id, local_code } = lotQuery.rows[0];

  // 1. Normal FEFO pick list
  const res = await getFefoPickListTool.execute(
    { hospitalDrugId: hospital_drug_id, quantityNeeded: 5, excludeHeld: true },
    { role: 'WAREHOUSE_OFFICER', hospitalId: hospital_id },
  );

  assert.equal(res.success, true);
  const data = res.data as {
    quantityNeeded: number;
    totalAvailable: number;
    totalPicked: number;
    shortfall: number;
    lots: Array<{
      lotNo: string;
      expiryDate: string;
      daysToExpiry: number;
      isExpired: boolean;
      availableQty: number;
      recommendedPickQty: number;
    }>;
  };

  assert.ok(Array.isArray(data.lots));
  assert.equal(data.totalPicked <= 5, true);

  // Check FEFO sorting: expiry dates should be non-decreasing
  for (let i = 1; i < data.lots.length; i++) {
    assert.equal(data.lots[i].expiryDate >= data.lots[i - 1].expiryDate, true);
  }

  // Check that expired lots have recommendedPickQty === 0
  for (const l of data.lots) {
    if (l.isExpired) {
      assert.equal(l.recommendedPickQty, 0);
    }
  }

  // Check search by drugCode as well
  const codeRes = await getFefoPickListTool.execute(
    { drugCode: local_code },
    { role: 'WAREHOUSE_OFFICER', hospitalId: hospital_id },
  );
  assert.equal(codeRes.success, true);
});

test('getFefoPickListTool: tenant isolation blocks accessing another hospital drug', async () => {
  const twoHospDrugs = await query<{ id: string; hospital_id: string }>(
    'SELECT id, hospital_id FROM hospital_drug LIMIT 2',
  );

  if (twoHospDrugs.rows.length >= 2 && twoHospDrugs.rows[0].hospital_id !== twoHospDrugs.rows[1].hospital_id) {
    const res = await getFefoPickListTool.execute(
      { hospitalDrugId: twoHospDrugs.rows[1].id },
      { role: 'WAREHOUSE_OFFICER', hospitalId: twoHospDrugs.rows[0].hospital_id },
    );
    assert.equal(res.success, false);
    assert.match(res.error || '', /Permission denied/i);

    // SYSTEM_ADMIN bypasses
    const adminRes = await getFefoPickListTool.execute(
      { hospitalDrugId: twoHospDrugs.rows[1].id },
      { role: 'SYSTEM_ADMIN', hospitalId: null },
    );
    assert.equal(adminRes.success, true);
  }
});

// --- TOOL 2: check_cold_chain_compliance TESTS ---

test('checkColdChainComplianceTool: validates thresholds and requires input', async () => {
  // thresholdMin >= thresholdMax
  const invalidThreshold = await checkColdChainComplianceTool.execute(
    {
      temperatureLogs: [{ recordedAt: '2026-10-24T00:00:00Z', temperatureC: 5 }],
      thresholdMin: 8,
      thresholdMax: 2,
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(invalidThreshold.success, false);
  assert.match(invalidThreshold.error || '', /thresholdMin.*must be strictly less/i);

  // Missing both taskId and temperatureLogs
  const missingInput = await checkColdChainComplianceTool.execute(
    {},
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(missingInput.success, false);
  assert.match(missingInput.error || '', /Either taskId or temperatureLogs/i);
});

test('checkColdChainComplianceTool: boundaries 2.0 and 8.0 are COMPLIANT, 1.9 is BREACH_LOW, 8.1 is BREACH_HIGH', async () => {
  // Exactly at boundary
  const compliantRes = await checkColdChainComplianceTool.execute(
    {
      temperatureLogs: [
        { recordedAt: '2026-10-24T01:00:00Z', temperatureC: 2.0 },
        { recordedAt: '2026-10-24T02:00:00Z', temperatureC: 5.0 },
        { recordedAt: '2026-10-24T03:00:00Z', temperatureC: 8.0 },
      ],
      thresholdMin: 2.0,
      thresholdMax: 8.0,
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(compliantRes.success, true);
  const dataCompliant = compliantRes.data as any;
  assert.equal(dataCompliant.status, 'COMPLIANT');
  assert.equal(dataCompliant.breachCount, 0);
  assert.equal(dataCompliant.min, 2.0);
  assert.equal(dataCompliant.max, 8.0);
  assert.equal(dataCompliant.avg, 5.0);

  // Low breach: 1.9°C
  const lowRes = await checkColdChainComplianceTool.execute(
    {
      temperatureLogs: [
        { recordedAt: '2026-10-24T01:00:00Z', temperatureC: 1.9 },
        { recordedAt: '2026-10-24T02:00:00Z', temperatureC: 4.0 },
      ],
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(lowRes.success, true);
  const dataLow = lowRes.data as any;
  assert.equal(dataLow.status, 'BREACH_LOW');
  assert.equal(dataLow.breachCount, 1);
  assert.equal(dataLow.breaches[0].direction, 'LOW');
  assert.equal(dataLow.breaches[0].deviation, 0.1);

  // High breach: 8.1°C
  const highRes = await checkColdChainComplianceTool.execute(
    {
      temperatureLogs: [
        { recordedAt: '2026-10-24T01:00:00Z', temperatureC: 8.1 },
        { recordedAt: '2026-10-24T02:00:00Z', temperatureC: 6.0 },
      ],
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(highRes.success, true);
  const dataHigh = highRes.data as any;
  assert.equal(dataHigh.status, 'BREACH_HIGH');
  assert.equal(dataHigh.breachCount, 1);
  assert.equal(dataHigh.breaches[0].direction, 'HIGH');
  assert.equal(dataHigh.breaches[0].deviation, 0.1);

  // Both breaches present: status must be BREACH_HIGH and both listed
  const dualRes = await checkColdChainComplianceTool.execute(
    {
      temperatureLogs: [
        { recordedAt: '2026-10-24T01:00:00Z', temperatureC: 1.5 },
        { recordedAt: '2026-10-24T02:00:00Z', temperatureC: 9.2 },
      ],
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(dualRes.success, true);
  const dataDual = dualRes.data as any;
  assert.equal(dataDual.status, 'BREACH_HIGH');
  assert.equal(dataDual.breachCount, 2);
  assert.equal(dataDual.breaches.some((b: any) => b.direction === 'LOW'), true);
  assert.equal(dataDual.breaches.some((b: any) => b.direction === 'HIGH'), true);
});

test('checkColdChainComplianceTool: handles empty logs as NO_DATA', async () => {
  const res = await checkColdChainComplianceTool.execute(
    { temperatureLogs: [] },
    { role: 'WAREHOUSE_OFFICER', hospitalId: 'dummy' },
  );
  assert.equal(res.success, true);
  const data = res.data as any;
  assert.equal(data.status, 'NO_DATA');
  assert.equal(data.readingCount, 0);
  assert.equal(data.min, null);
});

test('checkColdChainComplianceTool: DRIVER ownership and tenant isolation on transport_task', async () => {
  const taskRow = (await query<{
    id: string;
    from_hospital_id: string;
    to_hospital_id: string;
    driver_id: string | null;
  }>('SELECT id, from_hospital_id, to_hospital_id, driver_id FROM transport_task LIMIT 1')).rows[0];

  if (!taskRow) return;

  // Unrelated hospital
  const foreignRes = await checkColdChainComplianceTool.execute(
    { taskId: taskRow.id },
    { role: 'WAREHOUSE_OFFICER', hospitalId: '00000000-0000-0000-0000-000000000001' },
  );
  assert.equal(foreignRes.success, false);
  assert.match(foreignRes.error || '', /not found or not permitted/i);

  // DRIVER role: cannot read if driver_id does not match
  const driverRes = await checkColdChainComplianceTool.execute(
    { taskId: taskRow.id },
    {
      role: 'DRIVER',
      hospitalId: taskRow.from_hospital_id,
      userId: '00000000-0000-0000-0000-000000000002',
    },
  );
  assert.equal(driverRes.success, false);
  assert.match(driverRes.error || '', /not found or not permitted/i);

  // SYSTEM_ADMIN bypasses
  const adminRes = await checkColdChainComplianceTool.execute(
    { taskId: taskRow.id },
    { role: 'SYSTEM_ADMIN', hospitalId: null },
  );
  assert.equal(adminRes.success, true);
});

// --- TOOL 3: get_kit_packing_checklist TESTS ---

test('getKitPackingChecklistTool: requires hospitalId for non-admin and at least one parameter', async () => {
  const noHosp = await getKitPackingChecklistTool.execute(
    { kitTypeId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' },
    { role: 'WAREHOUSE_OFFICER', hospitalId: null },
  );
  assert.equal(noHosp.success, false);
  assert.match(noHosp.error || '', /hospitalId is required/i);

  const noParams = await getKitPackingChecklistTool.execute(
    {},
    { role: 'SYSTEM_ADMIN', hospitalId: null },
  );
  assert.equal(noParams.success, false);
  assert.match(noParams.error || '', /At least one of/i);
});

test('getKitPackingChecklistTool: checks readiness (READY, PARTIAL, MISSING_ITEMS) and components', async () => {
  const ktRow = (await query<{ id: string }>('SELECT id FROM kit_type LIMIT 1')).rows[0];
  const hospRow = (await query<{ id: string }>('SELECT id FROM hospital LIMIT 1')).rows[0];

  if (!ktRow || !hospRow) return;

  const res = await getKitPackingChecklistTool.execute(
    { kitTypeId: ktRow.id },
    { role: 'WAREHOUSE_OFFICER', hospitalId: hospRow.id },
  );

  assert.equal(res.success, true);
  const data = res.data as any;
  assert.ok(data.checklists);
  const checklist = Array.isArray(data.checklists) ? data.checklists[0] : data.checklists;
  assert.ok(['READY', 'PARTIAL', 'MISSING_ITEMS'].includes(checklist.readiness));
  assert.equal(checklist.targetQty, 1);
  assert.ok(Array.isArray(checklist.components));
});

// --- TOOL 4: verify_batch_barcode TESTS ---

test('verifyBatchBarcodeTool: requires hospitalId for non-admin', async () => {
  const res = await verifyBatchBarcodeTool.execute(
    { barcode: 'LOCAL_LOT_123' },
    { role: 'WAREHOUSE_OFFICER', hospitalId: null },
  );
  assert.equal(res.success, false);
  assert.match(res.error || '', /hospitalId is required/i);
});

test('verifyBatchBarcodeTool: LOT_NOT_FOUND, MATCH_FOUND, DRUG_MISMATCH, and expectedLotNo mismatch', async () => {
  const hospRow = (await query<{ id: string }>('SELECT id FROM hospital LIMIT 1')).rows[0];
  if (!hospRow) return;

  // 1. Non-existent lot
  const notFoundRes = await verifyBatchBarcodeTool.execute(
    { barcode: 'DEFINITELY_NOT_EXISTING_LOT_999999' },
    { role: 'WAREHOUSE_OFFICER', hospitalId: hospRow.id },
  );
  assert.equal(notFoundRes.success, true);
  const notFoundData = notFoundRes.data as any;
  assert.equal(notFoundData.matchStatus, 'LOT_NOT_FOUND');
  assert.equal(notFoundData.gtinVerified, false);

  // 2. Existing lot test
  const existingLot = (await query<{
    lot_no: string;
    hospital_id: string;
    hospital_drug_id: string;
  }>(
    `SELECT sl.lot_no, sl.hospital_id, sl.hospital_drug_id
       FROM stock_lot sl
      WHERE sl.qty_on_hand > 0
      LIMIT 1`,
  )).rows[0];

  if (!existingLot) return;

  // Scanned as GS1
  const gs1Barcode = `(01)08851234567890(17)261231(10)${existingLot.lot_no}`;
  const matchRes = await verifyBatchBarcodeTool.execute(
    { barcode: gs1Barcode, expectedLotNo: existingLot.lot_no },
    { role: 'WAREHOUSE_OFFICER', hospitalId: existingLot.hospital_id },
  );
  assert.equal(matchRes.success, true);
  const matchData = matchRes.data as any;
  assert.ok(['MATCH_FOUND', 'EXPIRED_LOT'].includes(matchData.matchStatus));
  assert.equal(matchData.lotMatchesExpected, true);
  assert.equal(matchData.detectedStandard, 'GS1');

  // expectedLotNo mismatch
  const mismatchLotRes = await verifyBatchBarcodeTool.execute(
    { barcode: existingLot.lot_no, expectedLotNo: 'DIFFERENT_LOT' },
    { role: 'WAREHOUSE_OFFICER', hospitalId: existingLot.hospital_id },
  );
  assert.equal(mismatchLotRes.success, true);
  assert.equal((mismatchLotRes.data as any).lotMatchesExpected, false);

  // DRUG_MISMATCH: pass another hospitalDrugId
  const anotherDrug = (await query<{ id: string }>(
    'SELECT id FROM hospital_drug WHERE hospital_id = $1 AND id != $2 LIMIT 1',
    [existingLot.hospital_id, existingLot.hospital_drug_id],
  )).rows[0];

  if (anotherDrug) {
    const drugMismatchRes = await verifyBatchBarcodeTool.execute(
      { barcode: existingLot.lot_no, hospitalDrugId: anotherDrug.id },
      { role: 'WAREHOUSE_OFFICER', hospitalId: existingLot.hospital_id },
    );
    assert.equal(drugMismatchRes.success, true);
    assert.equal((drugMismatchRes.data as any).matchStatus, 'DRUG_MISMATCH');
  }
});

// --- TOOL 5: submit_warehouse_confirmation_proposal TESTS ---

test('submitWarehouseConfirmationProposalTool: requires hospitalId for non-admin', async () => {
  const res = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'CONFIRM_DISPATCH',
      title: 'Dispatch',
      description: 'Test',
      summary: {},
      targetId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      payload: { version: 1 },
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: null },
  );
  assert.equal(res.success, false);
  assert.match(res.error || '', /hospitalId is required/i);
});

test('submitWarehouseConfirmationProposalTool: CONFIRM_DISPATCH produces whitelisted endpoint, method, and toStatus: LOADED', async () => {
  const task = (await query<{ id: string; from_hospital_id: string }>(
    'SELECT id, from_hospital_id FROM transport_task LIMIT 1',
  )).rows[0];

  if (!task) return;

  const res = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'CONFIRM_DISPATCH',
      title: 'Confirm Dispatch for Shipment',
      description: 'Shipment loaded onto truck',
      summary: { task: task.id },
      targetId: task.id,
      payload: { version: 1, temperatureC: 4.5, unauthorizedField: 'shouldBeDropped' },
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: task.from_hospital_id },
  );

  assert.equal(res.success, true);
  assert.ok(res.proposal);
  const p = res.proposal;
  assert.equal(p.type, 'CONFIRM_DISPATCH');
  assert.equal(p.actionApi.endpoint, `/api/v1/transport-tasks/${task.id}/status`);
  assert.equal(p.actionApi.method, 'POST');
  assert.equal(p.actionApi.payload.version, 1);
  assert.equal(p.actionApi.payload.temperatureC, 4.5);
  assert.equal(p.actionApi.payload.toStatus, 'LOADED');
  assert.equal((p.actionApi.payload as any).unauthorizedField, undefined, 'Extra payload fields must be dropped');
});

test('submitWarehouseConfirmationProposalTool: CONFIRM_RECEIPT produces whitelisted endpoint, method, and toStatus: RECEIVED', async () => {
  const task = (await query<{ id: string; to_hospital_id: string }>(
    'SELECT id, to_hospital_id FROM transport_task LIMIT 1',
  )).rows[0];

  if (!task) return;

  const res = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'CONFIRM_RECEIPT',
      title: 'Confirm Receipt for Shipment',
      description: 'Shipment received at destination pharmacy',
      summary: { task: task.id },
      targetId: task.id,
      payload: { version: 2, qtyReceived: 10 },
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: task.to_hospital_id },
  );

  assert.equal(res.success, true);
  assert.ok(res.proposal);
  const p = res.proposal;
  assert.equal(p.type, 'CONFIRM_RECEIPT');
  assert.equal(p.actionApi.endpoint, `/api/v1/transport-tasks/${task.id}/status`);
  assert.equal(p.actionApi.method, 'POST');
  assert.equal(p.actionApi.payload.toStatus, 'RECEIVED');
  assert.equal(p.actionApi.payload.qtyReceived, 10);
});

test('submitWarehouseConfirmationProposalTool: RECORD_RETURN produces whitelisted endpoint and validates qty', async () => {
  const ro = (await query<{ id: string; debtor_hospital_id: string }>(
    'SELECT id, debtor_hospital_id FROM return_obligation LIMIT 1',
  )).rows[0];

  if (!ro) return;

  const res = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'RECORD_RETURN',
      title: 'Record Return',
      description: 'Physical return of borrowed units',
      summary: {},
      targetId: ro.id,
      payload: { qty: 5 },
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: ro.debtor_hospital_id },
  );

  assert.equal(res.success, true);
  assert.ok(res.proposal);
  assert.equal(res.proposal.actionApi.endpoint, `/api/v1/return-obligations/${ro.id}/return`);
  assert.equal(res.proposal.actionApi.method, 'POST');
  assert.equal(res.proposal.actionApi.payload.qty, 5);

  // Missing or non-positive qty fails
  const invalidRes = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'RECORD_RETURN',
      title: 'Invalid Return',
      description: 'Negative qty',
      summary: {},
      targetId: ro.id,
      payload: { qty: -1 },
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: ro.debtor_hospital_id },
  );
  assert.equal(invalidRes.success, false);
  assert.match(invalidRes.error || '', /Invalid proposal payload/i);
});

test('submitWarehouseConfirmationProposalTool: CONFIRM_KIT_PACKED produces whitelisted endpoint', async () => {
  const kpt = (await query<{ id: string; hospital_id: string }>(
    'SELECT id, hospital_id FROM kit_pack_task LIMIT 1',
  )).rows[0];

  if (!kpt) return;

  const res = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'CONFIRM_KIT_PACKED',
      title: 'Confirm Kit Packed',
      description: 'Packed complete emergency kit',
      summary: {},
      targetId: kpt.id,
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: kpt.hospital_id },
  );

  assert.equal(res.success, true);
  assert.ok(res.proposal);
  assert.equal(res.proposal.actionApi.endpoint, `/api/v1/kit-tasks/${kpt.id}/confirm`);
  assert.equal(res.proposal.actionApi.method, 'POST');
});

test('submitWarehouseConfirmationProposalTool: targetId hospital ownership check prevents foreign modifications', async () => {
  const task = (await query<{ id: string }>(
    'SELECT id FROM transport_task LIMIT 1',
  )).rows[0];

  if (!task) return;

  const res = await submitWarehouseConfirmationProposalTool.execute(
    {
      actionType: 'CONFIRM_DISPATCH',
      title: 'Foreign Dispatch',
      description: 'Unauthorized access attempt',
      summary: {},
      targetId: task.id,
      payload: { version: 1 },
    },
    { role: 'WAREHOUSE_OFFICER', hospitalId: '00000000-0000-0000-0000-000000000001' },
  );

  assert.equal(res.success, false);
  assert.match(res.error || '', /Permission denied/i);
});
