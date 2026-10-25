import test from 'node:test';
import assert from 'node:assert/strict';
import { narrativeBasis } from '../src/modules/incidents/plan.agent.js';
import type { IncidentRow } from '../src/modules/incidents/incidents.shared.js';
import { query, pool } from '../src/db/client.js';

/** AGT-F3-001 input: the rule plan of a real incident (mock DB) becomes the agent's lines, its allowed numbers and a stable hash. */

test.after(async () => {
  await pool.end();
});

test('f3 plan agent: the basis lists the rule plan lines with their numbers and hashes the same way twice', async (t) => {
  const incident = (await query<IncidentRow>(`SELECT * FROM incident i WHERE EXISTS (SELECT 1 FROM incident_patient_count c WHERE c.incident_id = i.id) ORDER BY created_at DESC LIMIT 1`)).rows[0];
  if (!incident) return t.skip('no incident with patient counts in the database');

  const a = await narrativeBasis(pool, incident);
  const b = await narrativeBasis(pool, incident);
  assert.equal(a.hash, b.hash);
  assert.equal(a.context.incidentNo, incident.incident_no);
  assert.ok(a.context.lines.length > 0, 'the rule plan has lines');
  for (const l of a.context.lines) {
    assert.ok(a.context.allowedNumbers.has(l.estimated), `${l.name}: estimated ${l.estimated} may be quoted`);
    assert.ok(l.critical <= l.estimated);
  }
  const lines = (a.data.plan_lines as { key: string }[]).map((l) => l.key);
  assert.deepEqual(lines, a.context.lines.map((l) => l.key));
  assert.equal('location' in a.data, false, 'the location text is not sent to the LLM');
});
