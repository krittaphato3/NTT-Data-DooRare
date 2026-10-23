import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Directory holding the Python inference output (`artifacts/forecasts/<modelVersion>/forecast_*.json`).
 *
 * `FORECASTS_DIR` wins when set (Docker: mount the models output as a volume — the image does not ship
 * `backend/models/`). Otherwise try the layout from `backend/`, the repo root, and the module location, in
 * that order, so both `npm --prefix backend start` and a repo-root start work without configuration.
 */
function resolveForecastsDir(): string {
  if (process.env.FORECASTS_DIR) return path.resolve(process.env.FORECASTS_DIR);
  const candidates = [
    path.resolve(process.cwd(), 'models/artifacts/forecasts'),
    path.resolve(process.cwd(), 'backend/models/artifacts/forecasts'),
    path.resolve(process.cwd(), '../models/artifacts/forecasts'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

/** `backend/models` (Python F1 module), for the scheduled predict job. `FORECAST_MODELS_DIR` wins when set. */
function resolveModelsDir(): string {
  if (process.env.FORECAST_MODELS_DIR) return path.resolve(process.env.FORECAST_MODELS_DIR);
  const candidates = [path.resolve(process.cwd(), 'models'), path.resolve(process.cwd(), 'backend/models'), path.resolve(process.cwd(), '../models')];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'f1_forecast'))) ?? candidates[0];
}

/** Python for the job: `FORECAST_PYTHON`, else the repo-root venv (same convention as models/scripts/run_all.sh), else `python3`. */
function resolvePython(modelsDir: string): string {
  if (process.env.FORECAST_PYTHON) return process.env.FORECAST_PYTHON;
  const venv = path.resolve(modelsDir, '../../.venv/bin/python');
  return fs.existsSync(venv) ? venv : 'python3';
}

/** Directory holding the raw pack CSVs (Option B: export DB tables into here before predict). */
function resolvePackCsvDir(): string {
  if (process.env.FORECAST_PACK_CSV_DIR) return path.resolve(process.env.FORECAST_PACK_CSV_DIR);
  const candidates = [
    path.resolve(process.cwd(), 'data/DooRare-F1-Monthly-Pack/csv'),
    path.resolve(process.cwd(), '../data/DooRare-F1-Monthly-Pack/csv'),
    path.resolve(process.cwd(), '../../data/DooRare-F1-Monthly-Pack/csv'),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

const modelsDir = resolveModelsDir();
const packCsvDir = resolvePackCsvDir();

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || (process.env.DB_HOST === 'db' ? 5432 : 5442)),
    database: process.env.DB_NAME || 'doorare',
    user: process.env.DB_USER || 'doorare',
    password: process.env.DB_PASSWORD || 'doorare_dev',
  },
  security: {
    masterPassword: process.env.MASTER_PASSWORD || 'doorare123',
    demoOtp: process.env.DEMO_OTP || '123456',
    idleTimeoutMinutes: 30, // SEC-001
  },
  uploads: {
    /** Local disk store for transport photos (the spec uses S3 presigned URLs; there is no S3 in this stack). */
    dir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
    maxPhotoBytes: 1.5 * 1024 * 1024, // spec UI-14: compressed to <= 1.5 MB
  },
  forecasts: {
    /** JSON fallback source; the DB is always tried first. */
    dir: resolveForecastsDir(),
    /** Inputs older than this are flagged `meta.stale` (FR-F1a-013 keeps 7 d for alert suppression). */
    staleAfterDays: Number(process.env.FORECASTS_STALE_AFTER_DAYS || 30),
    /**
     * Scheduled predict job (every `intervalDays`): python `predict` for WEEK + MONTH, then load the JSON into the DB and
     * re-evaluate alerts. Off unless FORECAST_JOB_ENABLED=true. It never trains. `pythonStaleAfterDays` lifts the model's
     * own STALE_INPUT limit (F1_STALE_AFTER_DAYS) so predicting on older input keeps working.
     */
    job: {
      enabled: process.env.FORECAST_JOB_ENABLED === 'true',
      intervalDays: Number(process.env.FORECAST_JOB_INTERVAL_DAYS || 3),
      modelsDir,
      packCsvDir,
      /** Option B: export latest usage_daily and stock_snapshot from DB before predicting (default true). */
      exportFromDb: process.env.FORECAST_JOB_EXPORT_DB !== 'false',
      python: resolvePython(modelsDir),
      pythonStaleAfterDays: Number(process.env.FORECAST_JOB_STALE_AFTER_DAYS || 3650),
      timeoutMs: Number(process.env.FORECAST_JOB_TIMEOUT_MS || 15 * 60_000),
    },
  },
};
