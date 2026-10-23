import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStockAndAlertsTool,
  getForecastTrendsTool,
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
