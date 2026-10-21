/**
 * API-F1a-003 `POST /forecasts/runs`. There is no Python worker behind the API, so a "run" loads the newest inference
 * output (`models/artifacts/forecasts/<version>/forecast_<GRANULARITY>_<origin>.json`, the Phase 7a contract) into
 * `forecast_run` / `forecast_result` and then evaluates the alerts. Loading the same model version + period twice
 * does not duplicate rows; alerts are still re-evaluated against current stock.
 */
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { oneOf } from '../../core/pagination.js';
import { bodyObject } from '../../core/validate.js';
import { withTransaction } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import { evaluateAlerts } from '../alerts/alerts.evaluate.js';
import type { EvaluateResult, Granularity } from '../alerts/alerts.evaluate.js';
import { forecastsRepository } from './forecasts.repository.js';

const METHOD: Record<string, string> = { QUANTILE_LGBM: 'QUANTILE_LGBM', MA_ES: 'MA_ES', FALLBACK_CLASSICAL: 'MA_ES', MIN_MAX: 'MIN_MAX', COLD_START: 'COLD_START' };
const num = (v: unknown): number | null => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

export interface RunSummary {
  granularity: Granularity;
  runId: string;
  modelVersion: string;
  periodStart: string | null;
  dataEnd: string;
  loaded: boolean;
  items: number;
  skipped: number;
  alerts: EvaluateResult;
}

async function runOne(req: Request, granularity: Granularity): Promise<RunSummary> {
  const file = forecastsRepository.readJsonForecast(granularity);
  if (!file) throw new HttpError(404, 'NOT_FOUND', `ไม่พบไฟล์ผลพยากรณ์ ${granularity} (รัน predict ก่อน)`);
  const { payload } = file;
  const period = (payload.rows[0]?.periodStart as string | undefined) ?? null;

  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`forecast-run-${granularity}`]);
    const existing = (
      await client.query(
        `SELECT r.id FROM forecast_run r
          WHERE r.model_version = $1 AND r.status = 'SUCCEEDED'
            AND EXISTS (SELECT 1 FROM forecast_result f WHERE f.run_id = r.id AND f.granularity = $2::forecast_granularity AND f.period_start IS NOT DISTINCT FROM $3::date)
          ORDER BY r.started_at DESC LIMIT 1`,
        [payload.modelVersion, granularity, period],
      )
    ).rows[0];

    let runId: string;
    let items = 0;
    let skipped = 0;
    if (existing) {
      runId = existing.id;
      items = Number((await client.query(`SELECT count(*)::int AS n FROM forecast_result WHERE run_id = $1 AND granularity = $2::forecast_granularity`, [runId, granularity])).rows[0].n);
    } else {
      runId = (await client.query(`INSERT INTO forecast_run (status, model_version, notes) VALUES ('RUNNING', $1, $2) RETURNING id`, [payload.modelVersion, `${granularity} ${period} from ${file.path}`])).rows[0].id;
      let fallback = 0;
      for (const row of payload.rows) {
        const listing = await client.query(`SELECT 1 FROM hospital_drug WHERE id = $1 AND hospital_id = $2`, [row.hospitalDrugId, row.hospitalId]);
        if (!listing.rowCount || !METHOD[row.method]) {
          skipped += 1;
          continue;
        }
        if (METHOD[row.method] !== 'QUANTILE_LGBM') fallback += 1;
        await client.query(
          `INSERT INTO forecast_result (run_id, hospital_id, hospital_drug_id, granularity, period_start, method, ved, abc, u_per_day, sigma_per_day, lead_time_days,
                                        demand_pattern, lead_time_quantile, p50, p90, p95, total_target, rop, confidence_flag, coverage_ok)
           VALUES ($1, $2, $3, $4::forecast_granularity, $5::date, $6::forecast_method, $7::ved_class, $8::abc_class, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [runId, row.hospitalId, row.hospitalDrugId, granularity, row.periodStart, METHOD[row.method], row.ved, row.abc ?? null, num(row.uPerDay) ?? 0, num(row.sigmaPerDay), num(row.leadTimeDays) ?? 1,
           row.demandPattern ?? 'REGULAR', num(row.leadTimeQuantile), num(row.p50), num(row.p90), num(row.p95), num(row.totalTarget), num(row.rop), row.confidenceFlag ?? null, row.coverageOk ?? null],
        );
        items += 1;
      }
      await client.query(`UPDATE forecast_run SET status = 'SUCCEEDED', finished_at = now(), n_items = $2, n_fallback = $3 WHERE id = $1`, [runId, items, fallback]);
    }

    const alerts = await evaluateAlerts(client, runId, granularity);
    await writeAudit(client, auditContext(req), {
      action: 'FORECAST_RUN',
      entityType: 'forecast_run',
      entityId: runId,
      after: { granularity, modelVersion: payload.modelVersion, periodStart: period, loaded: !existing, items, alerts },
    });
    return { granularity, runId, modelVersion: payload.modelVersion, periodStart: period, dataEnd: payload.dataEnd, loaded: !existing, items, skipped, alerts };
  });
}

export async function triggerForecastRuns(req: Request) {
  const body = bodyObject(req.body ?? {});
  const which = oneOf(body.granularity, ['WEEK', 'MONTH', 'BOTH'] as const, 'granularity') ?? 'BOTH';
  const list: Granularity[] = which === 'BOTH' ? ['WEEK', 'MONTH'] : [which];
  const runs: RunSummary[] = [];
  for (const g of list) runs.push(await runOne(req, g));
  return { ok: true, jobId: runs[0].runId, status: 'SUCCEEDED', runs };
}
