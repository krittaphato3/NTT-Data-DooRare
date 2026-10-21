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
  forecasts: {
    /** JSON fallback source; the DB is always tried first. */
    dir: resolveForecastsDir(),
    /** Inputs older than this are flagged `meta.stale` (FR-F1a-013 keeps 7 d for alert suppression). */
    staleAfterDays: Number(process.env.FORECASTS_STALE_AFTER_DAYS || 30),
  },
};
