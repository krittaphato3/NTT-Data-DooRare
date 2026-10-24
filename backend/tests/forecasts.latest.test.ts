import test from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../src/db/client.js';
import { forecastsService } from '../src/modules/forecasts/forecasts.service.js';

/**
 * `GET /forecasts` lists every series once, at its newest period. `v_latest_forecast` keeps one row per period, so after a second
 * predict run the stock-alert screen (UI-02) showed each drug twice. Needs the mock DB; the probe rows are removed afterwards.
 */

test.after(async () => {
  await pool.end();
});

test('forecasts: a series with two predicted periods is listed once, at the newest period', async () => {
  const hd = (await query<{ id: string; hospital_id: string; ved: string }>(`SELECT id, hospital_id, ved::text AS ved FROM hospital_drug WHERE active ORDER BY local_code LIMIT 1`)).rows[0];
  const runId = (await query<{ id: string }>(`INSERT INTO forecast_run (status, model_version, notes) VALUES ('SUCCEEDED', 'TEST-LATEST-PERIOD', 'test probe') RETURNING id`)).rows[0].id;
  try {
    for (const [period, p50] of [['2026-10-12', 100], ['2026-10-19', 140]] as const) {
      await query(
        `INSERT INTO forecast_result (run_id, hospital_id, hospital_drug_id, granularity, period_start, method, ved, u_per_day, lead_time_days, p50, total_target)
         VALUES ($1, $2, $3, 'WEEK', $4, 'MA_ES', $5::ved_class, 10, 3, $6, 500)`,
        [runId, hd.hospital_id, hd.id, period, hd.ved, p50],
      );
    }
    assert.equal(Number((await query(`SELECT count(*) AS n FROM v_latest_forecast WHERE hospital_drug_id = $1`, [hd.id])).rows[0].n), 2, 'the view keeps one row per period');

    const list = await forecastsService.list({ granularity: 'WEEK', limit: '200' }, hd.hospital_id);
    const rows = (list.items as { hospitalDrugId: string; p50: number | null }[]).filter((i) => i.hospitalDrugId === hd.id);
    assert.equal(rows.length, 1, 'one row per drug');
    assert.equal(rows[0].p50, 140, 'the newest period');
  } finally {
    await query(`DELETE FROM forecast_result WHERE run_id = $1`, [runId]);
    await query(`DELETE FROM forecast_run WHERE id = $1`, [runId]);
  }
});
