import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStockAndAlertsTool,
  getForecastTrendsTool,
  getRankedLenderLadderTool,
  getNearExpiryPoolStatusTool,
} from '../src/modules/ai/tools/clinical/pharmacist.tools.js';
import { ToolRegistry } from '../src/modules/ai/tools/registry.js';
import { query, pool } from '../src/db/client.js';

test.after(async () => {
  await pool.end();
});

test('getStockAndAlertsTool: configuration and role validation', () => {
  assert.equal(getStockAndAlertsTool.name, 'get_stock_and_alerts');
  assert.deepEqual(getStockAndAlertsTool.allowedRoles, ['PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN']);
  
  // Zod schema checks
  const parsed = getStockAndAlertsTool.parameters.safeParse({ status: 'OPEN' });
  assert.equal(parsed.success, true);

  const invalid = getStockAndAlertsTool.parameters.safeParse({ hospitalDrugId: 'invalid-uuid' });
  assert.equal(invalid.success, false);
});

test('getStockAndAlertsTool: execution requires hospitalId for non-admin', async () => {
  const res = await getStockAndAlertsTool.execute(
    { status: 'OPEN' },
    { role: 'PHARMACIST', hospitalId: undefined },
  );
  assert.equal(res.success, false);
  assert.match(res.error || '', /hospitalId is required/);
});

test('getStockAndAlertsTool: executes query scoped to hospital', async () => {
  // Query a real hospital from database
  const hospRow = (await query('SELECT id FROM hospital WHERE active = true LIMIT 1')).rows[0];
  assert.ok(hospRow, 'Hospital fixture exists');

  const res = await getStockAndAlertsTool.execute(
    { status: 'ALL' },
    { role: 'PHARMACIST', hospitalId: hospRow.id },
  );
  assert.equal(res.success, true);
  assert.ok(res.data);
  const data = res.data as { count: number; items: any[] };
  assert.equal(typeof data.count, 'number');
  assert.ok(Array.isArray(data.items));
});

test('getStockAndAlertsTool: blocks accessing another hospital drug', async () => {
  const drugs = (await query('SELECT id, hospital_id FROM hospital_drug LIMIT 2')).rows;
  if (drugs.length >= 2 && drugs[0].hospital_id !== drugs[1].hospital_id) {
    const res = await getStockAndAlertsTool.execute(
      { hospitalDrugId: drugs[1].id },
      { role: 'PHARMACIST', hospitalId: drugs[0].hospital_id },
    );
    assert.equal(res.success, false);
    assert.match(res.error || '', /Permission denied/);
  }
});

test('getForecastTrendsTool: configuration and role validation', () => {
  assert.equal(getForecastTrendsTool.name, 'get_forecast_trends');
  assert.deepEqual(getForecastTrendsTool.allowedRoles, ['PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN']);

  const invalid = getForecastTrendsTool.parameters.safeParse({});
  assert.equal(invalid.success, false, 'hospitalDrugId is required');
});

test('getForecastTrendsTool: tenant isolation blocks foreign hospital drug', async () => {
  const drugs = (await query('SELECT id, hospital_id FROM hospital_drug LIMIT 2')).rows;
  if (drugs.length >= 2 && drugs[0].hospital_id !== drugs[1].hospital_id) {
    const res = await getForecastTrendsTool.execute(
      { hospitalDrugId: drugs[1].id, granularity: 'WEEK' },
      { role: 'PHARMACIST', hospitalId: drugs[0].hospital_id },
    );
    assert.equal(res.success, false);
    assert.match(res.error || '', /Permission denied/);
  }
});

test('getRankedLenderLadderTool: configuration and role validation', () => {
  assert.equal(getRankedLenderLadderTool.name, 'get_ranked_lender_ladder');
  assert.deepEqual(getRankedLenderLadderTool.allowedRoles, ['PHARMACIST', 'SYSTEM_ADMIN']);

  const parsed = getRankedLenderLadderTool.parameters.safeParse({ urgency: 'VERY_URGENT' });
  assert.equal(parsed.success, true);

  const invalid = getRankedLenderLadderTool.parameters.safeParse({ quantityNeeded: -5 });
  assert.equal(invalid.success, false);
});

test('getRankedLenderLadderTool: generates candidate ladder on-demand', async () => {
  const hosp = (await query('SELECT id FROM hospital WHERE active = true LIMIT 1')).rows[0];
  const res = await getRankedLenderLadderTool.execute(
    { urgency: 'URGENT', quantityNeeded: 10 },
    { role: 'PHARMACIST', hospitalId: hosp.id },
  );
  assert.equal(res.success, true);
  assert.ok(res.data);
  const data = res.data as { candidateCount: number; candidates: any[] };
  assert.equal(typeof data.candidateCount, 'number');
  assert.ok(Array.isArray(data.candidates));
});

test('getRankedLenderLadderTool: tenant isolation blocks foreign borrow request', async () => {
  const requests = (await query('SELECT id, borrower_hospital_id FROM borrow_request LIMIT 2')).rows;
  if (requests.length >= 2 && requests[0].borrower_hospital_id !== requests[1].borrower_hospital_id) {
    const res = await getRankedLenderLadderTool.execute(
      { requestId: requests[1].id },
      { role: 'PHARMACIST', hospitalId: requests[0].borrower_hospital_id },
    );
    assert.equal(res.success, false);
    assert.match(res.error || '', /Permission denied/);
  }
});

test('getNearExpiryPoolStatusTool: configuration and role validation', () => {
  assert.equal(getNearExpiryPoolStatusTool.name, 'get_near_expiry_pool_status');
  assert.deepEqual(getNearExpiryPoolStatusTool.allowedRoles, ['PHARMACIST', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN']);

  const parsed = getNearExpiryPoolStatusTool.parameters.safeParse({ status: 'DETECTED', limit: 10 });
  assert.equal(parsed.success, true);
});

test('getNearExpiryPoolStatusTool: executes query scoped to hospital', async () => {
  const hosp = (await query('SELECT id FROM hospital WHERE active = true LIMIT 1')).rows[0];
  const res = await getNearExpiryPoolStatusTool.execute(
    { status: 'ALL' },
    { role: 'PHARMACIST', hospitalId: hosp.id },
  );
  assert.equal(res.success, true);
  assert.ok(res.data);
  const data = res.data as { itemCount: number; items: any[] };
  assert.equal(typeof data.itemCount, 'number');
  assert.ok(Array.isArray(data.items));
});

test('getNearExpiryPoolStatusTool: blocks accessing another hospital near-expiry pool', async () => {
  const hosps = (await query('SELECT id FROM hospital WHERE active = true LIMIT 2')).rows;
  if (hosps.length >= 2) {
    const res = await getNearExpiryPoolStatusTool.execute(
      { hospitalId: hosps[1].id },
      { role: 'PHARMACIST', hospitalId: hosps[0].id },
    );
    assert.equal(res.success, false);
    assert.match(res.error || '', /Permission denied/);
  }
});
