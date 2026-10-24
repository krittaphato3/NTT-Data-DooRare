import test from 'node:test';
import assert from 'node:assert/strict';
import { submitPharmacistProposalTool } from '../src/modules/ai/tools/clinical/pharmacist.tools.js';
import { query, pool } from '../src/db/client.js';

/**
 * The pharmacist Copilot proposes the F2 actions behind the pool / plan screens: send a pool lot of the region to the allocation agent
 * (POST /pool/{id}/agent-plan) and object to another hospital's plan of the region (POST /allocation-plans/{id}/objection),
 * with the same ownership rules as those routes. Needs the mock DB; nothing is written (proposals only).
 */

test.after(async () => {
  await pool.end();
});

const base = { title: 'F2', description: 'test', summary: {} };

test('pharmacist proposals: SEND_POOL_TO_AGENT targets the agent route for any hospital of the lot region, not for another region', async (t) => {
  const lot = (await query<{ id: string; origin: string; region: string }>(`SELECT pe.id, ne.hospital_id AS origin, pe.region_id AS region FROM pool_entry pe JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id LIMIT 1`)).rows[0];
  if (!lot) return t.skip('no pool entry in the database');
  const sameRegion = (await query<{ id: string }>(`SELECT id FROM hospital WHERE id <> $1 AND region_id = $2 AND active LIMIT 1`, [lot.origin, lot.region])).rows[0];
  const otherRegion = (await query<{ id: string }>(`SELECT id FROM hospital WHERE region_id <> $1 AND active LIMIT 1`, [lot.region])).rows[0];

  for (const hospitalId of [lot.origin, sameRegion?.id].filter((x): x is string => !!x)) {
    const ok = await submitPharmacistProposalTool.execute({ ...base, actionType: 'SEND_POOL_TO_AGENT', targetId: lot.id, payload: {} }, { role: 'PHARMACIST', hospitalId });
    assert.equal(ok.success, true, ok.error);
    assert.deepEqual(ok.proposal?.actionApi, { endpoint: `/api/v1/pool/${lot.id}/agent-plan`, method: 'POST', payload: {} });
  }

  if (otherRegion) {
    const denied = await submitPharmacistProposalTool.execute({ ...base, actionType: 'SEND_POOL_TO_AGENT', targetId: lot.id, payload: {} }, { role: 'PHARMACIST', hospitalId: otherRegion.id });
    assert.match(denied.error ?? '', /another region/);
  }
});

test('pharmacist proposals: OBJECT_ALLOCATION_PLAN needs a reason and a hospital of the region outside the plan', async (t) => {
  const plan = (
    await query<{ id: string; involved: string; outsider: string | null }>(
      `SELECT ap.id, (SELECT pa.hospital_id FROM plan_approval pa WHERE pa.plan_id = ap.id LIMIT 1) AS involved,
              (SELECT h.id FROM hospital h WHERE h.region_id = ap.region_id AND h.active
                  AND NOT EXISTS (SELECT 1 FROM plan_approval pa WHERE pa.plan_id = ap.id AND pa.hospital_id = h.id) LIMIT 1) AS outsider
         FROM allocation_plan ap ORDER BY ap.created_at DESC LIMIT 1`,
    )
  ).rows[0];
  if (!plan?.outsider) return t.skip('no plan with a hospital of its region outside it');

  const ok = await submitPharmacistProposalTool.execute(
    { ...base, actionType: 'OBJECT_ALLOCATION_PLAN', targetId: plan.id, payload: { reason: 'รพ.เราขาดยานี้มากกว่า' } },
    { role: 'PHARMACIST', hospitalId: plan.outsider },
  );
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.proposal?.actionApi, { endpoint: `/api/v1/allocation-plans/${plan.id}/objection`, method: 'POST', payload: { reason: 'รพ.เราขาดยานี้มากกว่า' } });

  const noReason = await submitPharmacistProposalTool.execute({ ...base, actionType: 'OBJECT_ALLOCATION_PLAN', targetId: plan.id, payload: { reason: 'x' } }, { role: 'PHARMACIST', hospitalId: plan.outsider });
  assert.match(noReason.error ?? '', /Invalid proposal payload/);

  const involved = await submitPharmacistProposalTool.execute(
    { ...base, actionType: 'OBJECT_ALLOCATION_PLAN', targetId: plan.id, payload: { reason: 'ไม่เห็นด้วย' } },
    { role: 'PHARMACIST', hospitalId: plan.involved },
  );
  assert.match(involved.error ?? '', /already in this plan/);
});
