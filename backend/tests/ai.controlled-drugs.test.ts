import test from 'node:test';
import assert from 'node:assert/strict';
import { getRankedLenderLadderTool, submitPharmacistProposalTool } from '../src/modules/ai/tools/clinical/pharmacist.tools.js';
import { getAntidoteLocatorTool } from '../src/modules/ai/tools/clinical/er.tools.js';
import { query, pool } from '../src/db/client.js';

test.after(async () => {
  await pool.end();
});

async function controlledDrug(): Promise<{ id: string; name: string } | null> {
  const r = await query<{ id: string; generic_name: string }>(
    'SELECT id, generic_name FROM drug_master WHERE is_controlled = true LIMIT 1',
  );
  return r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].generic_name } : null;
}

async function hospitalId(): Promise<string> {
  return (await query<{ id: string }>('SELECT id FROM hospital WHERE active = true ORDER BY id LIMIT 1')).rows[0].id;
}

test('BR-F1b-014: lender ladder refuses a controlled drug', async () => {
  const drug = await controlledDrug();
  if (!drug) return; // no controlled drug in this dataset
  const res = await getRankedLenderLadderTool.execute(
    { drugMasterId: drug.id, quantityNeeded: 5, urgency: 'URGENT' },
    { userId: 'u', role: 'PHARMACIST', hospitalId: await hospitalId() },
  );
  assert.equal(res.success, false);
  assert.match(res.error ?? '', /BR-F1b-014/);
});

test('BR-F1b-014: antidote locator never lists a controlled drug', async () => {
  const drug = await controlledDrug();
  if (!drug) return;
  const res = await getAntidoteLocatorTool.execute(
    { antidoteQuery: drug.name, radiusMinutes: 100000 },
    { userId: 'u', role: 'ER_STAFF', hospitalId: await hospitalId() },
  );
  assert.equal(res.success, true);
  assert.equal((res.data as { hospitals: unknown[] }).hospitals.length, 0);
});

test('BR-F1b-014: borrow proposal for a controlled drug is rejected', async () => {
  const drug = await controlledDrug();
  if (!drug) return;
  const res = await submitPharmacistProposalTool.execute(
    {
      actionType: 'CREATE_BORROW_REQUEST',
      title: 't',
      description: 'd',
      summary: {},
      payload: { drugMasterId: drug.id, quantity: 5, urgency: 'URGENT', items: [{ drugMasterId: drug.id, qtyRequested: 5 }] },
    },
    { userId: 'u', role: 'PHARMACIST', hospitalId: await hospitalId() },
  );
  assert.equal(res.success, false);
});
