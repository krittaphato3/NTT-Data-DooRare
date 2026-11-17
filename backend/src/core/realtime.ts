/**
 * Realtime change feed. One dedicated Postgres connection LISTENs on `doorare_change` (see db/realtime.sql);
 * every NOTIFY payload is a table name, re-emitted to in-process subscribers (the SSE route).
 * Reconnects with a short back-off if the connection drops (database restart, network blip).
 */
import { EventEmitter } from 'node:events';
import pg from 'pg';
import { config } from '../config/env.js';

const CHANNEL = 'doorare_change';
const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open browser tab

let client: pg.Client | null = null;
let retryTimer: NodeJS.Timeout | null = null;

function scheduleReconnect(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, 3000);
  retryTimer.unref();
}

async function connect(): Promise<void> {
  const c = new pg.Client({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });
  c.on('notification', (msg) => {
    if (msg.channel === CHANNEL && msg.payload) bus.emit('change', msg.payload);
  });
  c.on('error', (err) => {
    console.warn('[Realtime] listener error', err.message);
    c.end().catch(() => undefined);
    if (client === c) client = null;
    scheduleReconnect();
  });
  try {
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    client = c;
    console.log('[Realtime] listening for changes');
  } catch (err) {
    console.warn('[Realtime] cannot listen', (err as Error).message);
    c.end().catch(() => undefined);
    scheduleReconnect();
  }
}

export function startRealtime(): void {
  if (!client) void connect();
}

/** Subscribe to table-change signals; returns the unsubscribe function. */
export function onChange(listener: (table: string) => void): () => void {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}
