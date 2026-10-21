/** Reads `config_setting` (GLOBAL scope, optionally overridden by `HOSPITAL:<id>`), falling back to a code default. */
import type { Db } from '../db/tx.js';

export async function getSetting<T>(db: Db, key: string, fallback: T, hospitalId?: string | null): Promise<T> {
  const scopes = hospitalId ? [`HOSPITAL:${hospitalId}`, 'GLOBAL'] : ['GLOBAL'];
  const result = await db.query<{ scope: string; value: T }>(
    `SELECT scope, value FROM config_setting WHERE key = $1 AND scope = ANY($2::text[])`,
    [key, scopes],
  );
  for (const scope of scopes) {
    const row = result.rows.find((r) => r.scope === scope);
    if (row) return row.value;
  }
  return fallback;
}
