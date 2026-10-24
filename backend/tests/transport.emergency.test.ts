import test from 'node:test';
import assert from 'node:assert/strict';
import { transportRepository } from '../src/modules/transport/transport.repository.js';
import { mapTask } from '../src/modules/transport/transport.service.js';
import { query, pool } from '../src/db/client.js';
import type { AuthSessionUser } from '../src/modules/auth/auth.types.js';

/**
 * A transport task for a leg of an F3 emergency borrow request is flagged `emergency` (the warehouse inbox shows it as F3),
 * while kind stays F1 (same borrow slip and transport flow). Needs the mock DB.
 */

test.after(async () => {
  await pool.end();
});

test('transport task: emergency follows the borrow request context, kind stays F1', async (t) => {
  const rows = (
    await query<{ id: string; context: string }>(
      `SELECT DISTINCT ON (br.context) tt.id, br.context::text AS context
         FROM transport_task tt
         JOIN borrow_leg bl ON tt.ref_type = 'BORROW_LEG' AND bl.id = tt.ref_id
         JOIN borrow_request br ON br.id = bl.request_id
        ORDER BY br.context, tt.created_at DESC`,
    )
  ).rows;
  if (!rows.length) return t.skip('no borrow transport task in the database');

  const user = { hospitalId: null, role: 'SYSTEM_ADMIN' } as unknown as AuthSessionUser;
  for (const r of rows) {
    const view = mapTask((await transportRepository.getById(pool, r.id))!, user, [], []);
    assert.equal(view.kind, 'F1');
    assert.equal(view.emergency, r.context === 'EMERGENCY', `${r.context} task`);
  }
});
