/**
 * Demo seed (one entry point for the whole demo). Part 1: F2 (near-expiry -> regional pool -> allocation round -> approval).
 *
 *   npm run db:reset && (backend running on the same DB) && npm run db:demo-seed          # ONLY=f2 is the default for now
 *
 * What F2 gets (lots are DETECTED = "waiting for the pharmacist", a few are already released to the pool):
 *   A  owner HA / HB / HC, receivers only inside network A  -> the plan is AUTO_APPROVED, goods start moving
 *   X  receivers include network B (HD / HE)                -> the plan waits for a click ("แผนรอเห็นชอบ")
 * To make the outcome predictable each chosen drug is shaped: the intended receivers are cut to a few % of their target stock,
 * every other hospital is topped up above its target, so the Agent's split (rules F-22, the LLM is not needed) can only go
 * to the intended receivers. Shaping rows are ledger rows with ref_type DEMO_F2_SHAPE; lots are named DEMO-F2<kind>-<owner><run>-<k>.
 *
 * Part 2 (ONLY=f1, runs after f2 in the default): clean start for F1 (stock alerts -> borrow). It re-evaluates the alerts (the F2 shaping
 * creates shortages), closes stray LINKED_TO_REQUEST alerts whose request is already finished, and SNOOZES (7 days) the LOW_STOCK alerts
 * on drugs that carry a seeded DEMO-F2 lot, so that borrowing them cannot fill the F2 receivers' shortage. Snoozed alerts re-open after 7 days.
 * It then adds borrowable alerts (stock cut of drugs no waiting F2 lot carries, rows ref_type DEMO_F1_SHAPE, target per hospital: 3 very urgent / 3 urgent / 2 normal when drugs allow)
 * and runs the real lender filter on every open alert: one nobody can serve (transit / stock) is snoozed too.
 *
 * The forecast (stock alerts, F2 receivers) is loaded by the script itself when the DB has none (same call as db:scenarios).
 * Safe to run again (tops up to the wanted number of unused lots per scenario). Local DB only unless CONFIRM_HOST=<DB_HOST>.
 * A third kind, U (transport cost >= 20 % of value: the owner must pick an option before approval), is off by default: WITH_U=1 to add it.
 * Env: API, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, ONLY (f2,f1 = default), WITH_U (1 = add scenario U), RELEASE (lots released per scenario, default 0 = every lot starts waiting for the pharmacist), SCALE (multiplies the lot counts, default 1).

 * The logic itself lives in src/modules/demo/demo.engine.ts (shared with the /demo buttons); this file only connects it to a running backend over HTTP.
 */
import pg from 'pg';
import { runDemo, type SeedHost } from '../src/modules/demo/demo.engine.js';

const API = process.env.API ?? 'http://127.0.0.1:3001/api/v1';
const ONLY = (process.env.ONLY ?? 'f2,f1').split(',').map((s) => s.trim().toLowerCase());
const RELEASE = Math.max(0, Number(process.env.RELEASE ?? 0));
const SCALE = Math.max(1, Number(process.env.SCALE ?? 1));
const WITH_U = process.env.WITH_U === '1'; // scenario U (transport cost too high, owner must pick an option): off by default, a side path for the main demo

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(DB_HOST) && process.env.CONFIRM_HOST !== DB_HOST) {
  console.error(`refusing to write to the shared database ${DB_HOST}: set CONFIRM_HOST=${DB_HOST} to confirm`);
  process.exit(1);
}
const db = new pg.Pool({ host: DB_HOST, port: Number(process.env.DB_PORT ?? 5442), database: process.env.DB_NAME ?? 'doorare', user: process.env.DB_USER ?? 'doorare', password: process.env.DB_PASSWORD ?? 'doorare_dev' });

async function login(email: string): Promise<string> {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'doorare123', otp: '123456' }) });
  const j = (await r.json()) as { token?: string };
  if (!j.token) throw new Error(`login failed for ${email}`);
  return j.token;
}
async function call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

/** Same steps as the buttons, but as a user of the running backend (login + REST calls). */
const tokens: Record<string, string> = {};
const host: SeedHost = {
  async scan() {
    const sa = await login('system_admin1.region@example.org');
    const scan = await call(sa, 'POST', '/jobs/near-expiry', {});
    if (scan.status >= 300) throw new Error(`scan failed: ${scan.status} ${scan.json?.title ?? ''}`);
    return { detected: scan.json?.detected };
  },
  async loadForecast() {
    const admin = await login('system_admin1.region@example.org');
    const r = await call(admin, 'POST', '/forecasts/runs', {});
    if (r.status >= 300) throw new Error(`${r.status}: ${JSON.stringify(r.json)?.slice(0, 200)}`);
  },
  async release(owner, itemId) {
    tokens[owner] ??= await login(`pharmacist1.${owner.toLowerCase()}@example.org`);
    const r = await call(tokens[owner], 'POST', `/near-expiry/${itemId}/release`, {});
    if (r.status >= 300) return { ok: false, message: `${r.status} ${r.json?.title ?? r.json?.detail ?? ''}` };
    const pe = (await db.query(`SELECT id FROM pool_entry WHERE near_expiry_item_id = $1 ORDER BY released_at DESC LIMIT 1`, [itemId])).rows[0];
    const cand = await call(tokens[owner], 'GET', `/pool/${pe.id}/candidates`);
    const usable = ((cand.json?.data?.candidates ?? []) as { hospital: { code: string }; maxQty: number }[]).filter((x) => x.maxQty > 0).map((x) => x.hospital.code);
    return { ok: true, usable };
  },
};

async function main() {
  const h = await call('', 'GET', '/health');
  if (h.status >= 500) throw new Error(`backend not reachable at ${API}`);
  await runDemo({ db, host, log: console.log, only: ONLY, release: RELEASE, scale: SCALE, withU: WITH_U });
}
// the imported backend code holds its own DB pool: end it explicitly
main().then(async () => { await db.end(); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
