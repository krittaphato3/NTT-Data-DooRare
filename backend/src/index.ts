import { app } from './app.js';
import { config } from './config/env.js';
import { withTransaction } from './db/tx.js';
import { runExpiryJobs } from './modules/expiry/expiry.routes.js';
import { reevaluateAlerts } from './modules/forecasts/forecasts.runs.js';
import { processLegTimers } from './modules/borrow/borrow.flow.js';
import { processEmergencyTimers } from './modules/incidents/emergency.borrow.js';

const server = app.listen(config.port, () => {
  console.log(`[DooRare Backend] Server running on http://0.0.0.0:${config.port}`);
  console.log(`[DooRare Backend] Connecting to Postgres at ${config.db.host}:${config.db.port}/${config.db.database}`);
});

// JOB-04: reminders and timeouts of waiting borrow legs, once a minute (also callable via POST /jobs/borrow-timers).
const timers = setInterval(() => {
  withTransaction(async (client) => {
    await processLegTimers(client);
    await processEmergencyTimers(client); // F3: ask the next hospitals / alert staff once a leg timed out
  }).catch((err) => console.error('[DooRare Backend] borrow timers failed', err));
}, 60_000);
timers.unref();

// JOB-05..07 and plan approval timeouts: every 15 minutes (the near-expiry scan is idempotent, so more often than daily is harmless).
const expiryTimer = setInterval(() => {
  runExpiryJobs().catch((err) => console.error('[DooRare Backend] expiry jobs failed', err));
}, 15 * 60_000);
expiryTimer.unref();

// Stock alerts against the current stock (latest loaded forecast), every 6 hours. A new forecast is loaded by POST /forecasts/runs.
const alertTimer = setInterval(() => {
  reevaluateAlerts().catch((err) => console.error('[DooRare Backend] alert re-evaluation failed', err));
}, 6 * 3_600_000);
alertTimer.unref();

process.on('SIGTERM', () => {
  console.log('[DooRare Backend] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
