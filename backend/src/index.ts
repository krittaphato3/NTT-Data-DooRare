import { app } from './app.js';
import { config } from './config/env.js';
import { withTransaction } from './db/tx.js';
import { runExpiryJobs } from './modules/expiry/expiry.routes.js';
import { processLegTimers } from './modules/borrow/borrow.flow.js';

const server = app.listen(config.port, () => {
  console.log(`[DooRare Backend] Server running on http://0.0.0.0:${config.port}`);
  console.log(`[DooRare Backend] Connecting to Postgres at ${config.db.host}:${config.db.port}/${config.db.database}`);
});

// JOB-04: reminders and timeouts of waiting borrow legs, once a minute (also callable via POST /jobs/borrow-timers).
const timers = setInterval(() => {
  withTransaction((client) => processLegTimers(client)).catch((err) => console.error('[DooRare Backend] borrow timers failed', err));
}, 60_000);
timers.unref();

// JOB-05..07 and plan approval timeouts: every 15 minutes (the near-expiry scan is idempotent, so more often than daily is harmless).
const expiryTimer = setInterval(() => {
  runExpiryJobs().catch((err) => console.error('[DooRare Backend] expiry jobs failed', err));
}, 15 * 60_000);
expiryTimer.unref();

process.on('SIGTERM', () => {
  console.log('[DooRare Backend] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
