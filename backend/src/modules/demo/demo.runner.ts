import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../db/client.js';
import { systemAuditContext } from '../../core/audit.js';
import { runExpiryJobs } from '../expiry/expiry.routes.js';
import { loadForecastRuns } from '../forecasts/forecasts.runs.js';
import { DemoService, type DemoOperationResult } from './demo.service.js';
import { planDemo, runDemo, type SeedHost } from './demo.engine.js';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', 'db'];

/** The demo buttons write to whole tables: only on a local database, or when DEMO_TOOLS_ENABLED=1 says so on purpose. */
export function demoToolsGuard(_req: Request, res: Response, next: NextFunction) {
  const host = process.env.DB_HOST || '127.0.0.1';
  if (process.env.DEMO_TOOLS_ENABLED === '1' || LOCAL_HOSTS.includes(host)) return next();
  res.status(403).json({ success: false, message: `demo tools are off for database ${host} (set DEMO_TOOLS_ENABLED=1 to allow)` });
}

/** The engine calls the services directly: no login, no HTTP. */
const inProcessHost: SeedHost = {
  async scan() {
    const r = await runExpiryJobs();
    return { detected: (r as Record<string, number>).detected ?? JSON.stringify(r) };
  },
  async loadForecast() {
    await loadForecastRuns(systemAuditContext(), 'BOTH');
  },
};

const LOCK_KEY = 74_210_001; // pg advisory lock: one fill at a time on this database, also across backend processes
let running: string | null = null;

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409 });
}

/** Read-only: what a fill would add. */
export async function planFill(relaxed = true) {
  if (running) throw conflict(`กำลังทำงานอยู่ (${running}) รอให้เสร็จก่อน`);
  running = 'ดูก่อน';
  try {
    return await planDemo({ db: pool, relaxed });
  } finally {
    running = null;
  }
}

/** Tops the demo situation up (F1 alerts to borrow from, F2 near-expiry lots). Only adds; running it again finds nothing missing. */
export async function runFill(parts: ('f1' | 'f2')[], label: string, relaxed = true): Promise<DemoOperationResult> {
  if (running) throw conflict(`กำลังทำงานอยู่ (${running}) รอให้เสร็จก่อน`);
  running = label;
  const lock = await pool.connect();
  const logs: string[] = [];
  const stamp = () => new Date().toISOString().substring(11, 19);
  const push = (l: string) => { if (l.trim()) logs.push(`[${stamp()}] ${l.trimEnd()}`); };
  try {
    const got = (await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY])).rows[0].ok as boolean;
    if (!got) throw conflict('อีกโปรเซสกำลังเติมข้อมูลอยู่ รอให้เสร็จก่อน');
    push(`INFO: ${label}${relaxed ? ' (ผ่อนเงื่อนไขเลือกยา)' : ''}`);
    let success = true;
    try {
      await runDemo({ db: pool, host: inProcessHost, log: push, only: parts, relaxed });
    } catch (e) {
      success = false;
      push(`ERROR: ${(e as Error).message}`);
    }
    const stats = await DemoService.getStats();
    return { success, message: success ? label : `${label} ไม่สำเร็จ ดู log`, logs, stats };
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    lock.release();
    running = null;
  }
}
