/**
 * Scheduled F1 predict job (default every 3 days, see `config.forecasts.job`).
 *
 * 1. `python -m f1_forecast.cli predict --granularity WEEK|MONTH` (inference only, NEVER trains; frozen artifacts).
 * 2. Load the newest JSON of each granularity into `forecast_run` / `forecast_result` and re-evaluate alerts
 *    (`loadForecastRuns`, idempotent: same model version + period is not duplicated).
 * 3. One `FORECAST_JOB` audit row per run; `runDueForecastJob` uses it so a restart does not reset the 3-day clock.
 *
 * If predict fails (or the input is unchanged) the previous JSON is still loaded, so alerts keep being evaluated.
 * Everything here is a plain function with no HTTP: a Lambda / EventBridge target can call `runForecastJob` as is.
 */
import { execFile } from 'node:child_process';
import { systemAuditContext, writeAudit } from '../../core/audit.js';
import { config } from '../../config/env.js';
import { query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Granularity } from '../alerts/alerts.evaluate.js';
import { loadForecastRuns } from './forecasts.runs.js';
import type { RunSummary } from './forecasts.runs.js';
import { exportForecastPackFromDb } from './forecasts.export.js';
import type { ForecastExportResult } from './forecasts.export.js';

const GRANULARITIES: Granularity[] = ['WEEK', 'MONTH'];
const EXIT_NAMES: Record<number, string> = { 3: 'NO_MODEL', 4: 'STALE_INPUT', 5: 'INSUFFICIENT_DATA', 6: 'SCHEMA_MISMATCH' };

export interface PredictStep {
  granularity: Granularity;
  ok: boolean;
  exitCode: number | null;
  reason: string | null;
  seconds: number;
}

export interface ForecastJobResult {
  ok: boolean;
  startedAt: string;
  exportResult?: ForecastExportResult;
  predict: PredictStep[];
  loaded: RunSummary[];
  loadError: string | null;
}

let running = false;

function runPredict(granularity: Granularity): Promise<PredictStep> {
  const { python, modelsDir, pythonStaleAfterDays, timeoutMs } = config.forecasts.job;
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(
      python,
      ['-m', 'f1_forecast.cli', 'predict', '--granularity', granularity],
      { cwd: modelsDir, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, F1_STALE_AFTER_DAYS: String(pythonStaleAfterDays) } },
      (error, _stdout, stderr) => {
        const seconds = Math.round((Date.now() - started) / 100) / 10;
        if (!error) return resolve({ granularity, ok: true, exitCode: 0, reason: null, seconds });
        const exitCode = typeof error.code === 'number' ? error.code : null;
        const detail = (stderr || error.message || '').toString().trim().split('\n').slice(-3).join(' ').slice(0, 300);
        resolve({ granularity, ok: false, exitCode, reason: `${exitCode !== null ? EXIT_NAMES[exitCode] ?? `exit ${exitCode}` : 'spawn/timeout'}: ${detail}`, seconds });
      },
    );
  });
}

/** Runs the job once. Never throws: a failure is reported in the result and in the audit row. Skips when one is already running. */
export async function runForecastJob(): Promise<ForecastJobResult | { skipped: true }> {
  if (running) return { skipped: true };
  running = true;
  const startedAt = new Date().toISOString();
  try {
    let exportResult: ForecastExportResult | undefined;
    if (config.forecasts.job.exportFromDb) {
      exportResult = await exportForecastPackFromDb();
      if (!exportResult.ok) {
        console.warn('[DooRare Backend] forecast pack export had issues:', exportResult.error);
      }
    }

    const predict: PredictStep[] = [];
    for (const g of GRANULARITIES) predict.push(await runPredict(g)); // sequential: each loads the whole matrix

    let loaded: RunSummary[] = [];
    let loadError: string | null = null;
    try {
      loaded = await loadForecastRuns(systemAuditContext(), 'BOTH'); // newest JSON on disk, fresh or previous
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }

    const result: ForecastJobResult = { ok: (!exportResult || exportResult.ok) && predict.every((p) => p.ok) && !loadError, startedAt, exportResult, predict, loaded, loadError };
    await withTransaction(async (client) => {
      await writeAudit(client, systemAuditContext(), {
        action: 'FORECAST_JOB',
        entityType: 'forecast_job',
        after: {
          ok: result.ok,
          export: exportResult ? { ok: exportResult.ok, seconds: exportResult.totalSeconds, tables: exportResult.tables } : null,
          predict,
          loadError,
          loaded: loaded.map((r) => ({ granularity: r.granularity, modelVersion: r.modelVersion, periodStart: r.periodStart, loaded: r.loaded, items: r.items })),
        },
      });
    });
    return result;
  } finally {
    running = false;
  }
}

/** Timer entry: runs the job only when the last `FORECAST_JOB` audit row is older than `intervalDays` (or there is none). */
export async function runDueForecastJob(): Promise<ForecastJobResult | { skipped: true } | null> {
  const last = (await query<{ last: Date | null }>(`SELECT max(occurred_at) AS last FROM audit_log WHERE action = 'FORECAST_JOB'`)).rows[0]?.last;
  const dueMs = config.forecasts.job.intervalDays * 86_400_000;
  if (last && Date.now() - new Date(last).getTime() < dueMs) return null;
  return runForecastJob();
}
