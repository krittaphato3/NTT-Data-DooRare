/**
 * Demo scenario F2 (near-expiry -> regional pool -> allocation round): adds fresh near-expiry lots that other hospitals can really use,
 * so the whole F2 flow can be shown on top of an already prepared demo database (it does not need `demo-scenarios.ts` to be unused).
 *
 *   API=http://127.0.0.1:3001/api/v1 DB_HOST=127.0.0.1 DB_PORT=5442 npx tsx scripts/demo-f2.ts
 *
 * What it does (everything is new data, rules/audit/notifications are the real ones because the decisions go through the API):
 *   1. for each owner hospital (HOSPITALS, default HA,HB,HC) it picks drugs that at least two other hospitals of the region could use
 *      (verified mapping, forecast with usage, shortfall) and adds LOTS_PER_HOSPITAL (default 2) stock lots named DEMO-F2-<code><run>-<k>
 *      that expire in 35 / 60 days (stock lot + IMPORT ledger row, the same way db/demo/02-shape.sql adds its lots; each lot holds what the owner uses before expiry plus what the receivers can absorb, so part of it can really be released);
 *   2. runs the near-expiry scan (the lots become DETECTED = "waiting for the pharmacist");
 *   3. the owner pharmacist RELEASES a lot of each hospital through the API (it enters the pool) and the script checks it against
 *      `GET /pool/:id/candidates`; a lot nobody can use is withdrawn again and the next lot is tried; the lots not released stay
 *      DETECTED so the release / keep decision can be shown live.
 * The allocation round itself (the Agent) is left for the demo: open "คลังกลาง" and press the round button.
 *
 * Start-only mode for a live walk-through: CLEAN=1 first withdraws what still sits in the pool and cancels the plans that are not moving yet
 * (through the API, history is kept); KEEP_DETECTED=HA makes those hospitals release nothing, so their lots wait for the pharmacist and
 * the pool is filled only by the other hospitals. The round, the plans and the approvals are then done by hand in the UI.
 *
 * Needs a direct database connection (to add the stock lots) and the backend running against the same database. Safe to run several
 * times: every run uses a new lot suffix. Env: API, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, HOSPITALS, LOTS_PER_HOSPITAL, RELEASE (default 1 = release the first lot).
 */
import pg from 'pg';

const API = process.env.API ?? 'http://127.0.0.1:3001/api/v1';
const HOSPITALS = (process.env.HOSPITALS ?? 'HA,HB,HC').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const LOTS = Math.max(1, Number(process.env.LOTS_PER_HOSPITAL ?? 2));
const RELEASE = Math.max(0, Number(process.env.RELEASE ?? 1));
const DAYS = [35, 60, 45, 75];
const CLEAN = process.env.CLEAN === '1';
const KEEP_DETECTED = (process.env.KEEP_DETECTED ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(DB_HOST) && process.env.CONFIRM_HOST !== DB_HOST) {
  console.error(`refusing to write to the shared database ${DB_HOST}: set CONFIRM_HOST=${DB_HOST} to confirm`);
  process.exit(1);
}
const db = new pg.Pool({ host: DB_HOST, port: Number(process.env.DB_PORT ?? 5442), database: process.env.DB_NAME ?? 'doorare', user: process.env.DB_USER ?? 'doorare', password: process.env.DB_PASSWORD ?? 'doorare_dev' });
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const ok = (s: string) => console.log('  ok  ' + s);
const warn = (s: string) => console.log('  !!  ' + s);

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

/**
 * Drugs of `code` that at least two other hospitals of the region could really absorb (verified mapping, forecast, shortfall):
 * `absorb` = what they can use before the first lot expires (min of shortfall and usage x days left), so the lot is sized to be matched.
 */
const CANDIDATES = `
  WITH recv AS (
    SELECT hd.drug_master_id, h.code, f.u_per_day, f.total_target,
           COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = hd.id AND l.expiry_date > current_date), 0)
           + COALESCE((SELECT sum(o.qty) FROM incoming_order o WHERE o.hospital_drug_id = hd.id AND o.status = 'OPEN' AND o.expected_date >= current_date), 0) AS stock
      FROM hospital_drug hd
      JOIN hospital h ON h.id = hd.hospital_id AND h.active AND h.agent_participation
      JOIN drug_mapping m ON m.hospital_drug_id = hd.id AND m.status = 'VERIFIED'
      JOIN v_latest_forecast f ON f.hospital_drug_id = hd.id AND f.granularity = 'WEEK'
     WHERE hd.active AND f.u_per_day > 0 AND f.total_target IS NOT NULL
  ), absorb AS (
    SELECT d.id AS hd_id,
           count(*) FILTER (WHERE r.total_target - r.stock >= 5)::int AS receivers,
           COALESCE(sum(LEAST(GREATEST(r.total_target - r.stock, 0), r.u_per_day * ($2::int - 3))) FILTER (WHERE r.total_target - r.stock >= 5), 0) AS cap
      FROM hospital_drug d JOIN hospital o ON o.id = d.hospital_id AND o.code = $1
      LEFT JOIN recv r ON r.drug_master_id = d.drug_master_id AND r.code <> o.code
     WHERE d.active GROUP BY d.id
  )
  SELECT d.id AS hospital_drug_id, d.hospital_id, dm.generic_name AS name, a.receivers,
         a.cap::float8 AS cap,
         GREATEST(COALESCE((SELECT avg(qty_used) FROM usage_daily u WHERE u.hospital_drug_id = d.id AND u.usage_date > current_date - 40), 0),
                  COALESCE((SELECT f.u_per_day FROM v_latest_forecast f WHERE f.hospital_drug_id = d.id AND f.granularity = 'WEEK' ORDER BY f.period_start DESC NULLS LAST LIMIT 1), 0))::float8 AS owner_use,
         (SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = d.id AND pack_size_base_units IS NOT NULL LIMIT 1) AS pack
    FROM hospital_drug d
    JOIN absorb a ON a.hd_id = d.id AND a.receivers >= 2
    JOIN drug_master dm ON dm.id = d.drug_master_id AND NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
   WHERE d.active AND d.unit_price_thb > 0
     AND NOT EXISTS (SELECT 1 FROM stock_lot l WHERE l.hospital_drug_id = d.id AND (l.lot_no LIKE 'DEMO-NE-%' OR l.lot_no LIKE 'DEMO-EXP-%'))
     AND NOT EXISTS (SELECT 1 FROM stock_lot l WHERE l.hospital_drug_id = d.id AND l.lot_no LIKE 'DEMO-F2-%' AND l.expiry_date > current_date AND l.qty_on_hand > 0)
   ORDER BY a.cap DESC, md5(d.id::text || $3::text)
   LIMIT $4`;

/** Empties the pool side of F2 through the API: open plans are cancelled, lots still in the pool are withdrawn by their owners. */
async function clean() {
  console.log('0. clean start (plans not moving yet are cancelled, pool lots withdrawn; history is kept)');
  const tokens: Record<string, string> = {};
  const as = async (code: string) => (tokens[code] ??= await login(`pharmacist1.${code.toLowerCase()}@example.org`));
  const plans = await q(`SELECT p.id, h.code FROM allocation_plan p JOIN pool_entry pe ON pe.id = p.pool_entry_id
                           JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id JOIN hospital h ON h.id = ne.hospital_id
                          WHERE p.status IN ('READY_FOR_APPROVAL', 'NEEDS_DISCUSSION')`);
  for (const p of plans) {
    const r = await call(await as(p.code), 'POST', `/allocation-plans/${p.id}/cancel`, { reason: 'DEMO: เริ่มรอบเดโมใหม่' });
    r.status < 300 ? ok(`plan ${p.id.slice(0, 8)} cancelled`) : warn(`plan ${p.id.slice(0, 8)}: cancel -> ${r.status} ${r.json?.title ?? ''}`);
  }
  const items = await q(`SELECT ne.id, h.code FROM near_expiry_item ne JOIN hospital h ON h.id = ne.hospital_id WHERE ne.status = 'RELEASED_TO_POOL'`);
  for (const it of items) {
    const r = await call(await as(it.code), 'POST', `/near-expiry/${it.id}/withdraw`, { reason: 'DEMO: เริ่มรอบเดโมใหม่' });
    r.status < 300 ? ok(`pool lot of ${it.code} withdrawn`) : warn(`${it.code} ${it.id.slice(0, 8)}: withdraw -> ${r.status} ${r.json?.title ?? ''}`);
  }
}

async function main() {
  const t = await call('', 'GET', '/health');
  if (t.status >= 500) throw new Error(`backend not reachable at ${API}`);
  if (CLEAN) await clean();
  const run = String(Number((await q(`SELECT COALESCE(max(substring(lot_no from 'DEMO-F2-[A-Z]+([0-9]+)-')::int), 0) AS n FROM stock_lot WHERE lot_no LIKE 'DEMO-F2-%'`))[0].n) + 1);
  console.log(`F2 demo run ${run}: hospitals ${HOSPITALS.join(',')}, ${LOTS} lot(s) each`);

  console.log('1. new near-expiry lots');
  const created: { code: string; lot: string; name: string; receivers: number }[] = [];
  for (const code of HOSPITALS) {
    const picks = await q(CANDIDATES, [code, DAYS[0], run + code, LOTS]);
    if (picks.length < LOTS) warn(`${code}: only ${picks.length} drug(s) with 2+ possible receivers`);
    for (const [i, p] of picks.entries()) {
      const days = DAYS[i % DAYS.length];
      const lot = `DEMO-F2-${code}${run}-${i + 1}`;
      // the owner keeps what it uses before expiry (FEFO), the rest is what the receivers can absorb: that part can be released and matched
      const qty = Math.max(20, Math.ceil(p.owner_use * (days - 1) * 1.05 + p.cap * 0.9));
      await db.query('BEGIN');
      try {
        const row = (await db.query(
          `INSERT INTO stock_lot(hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, pack_size_base_units, qty_on_hand, updated_at)
           VALUES ($1, $2, $3, current_date + $4::int, 'องค์การเภสัชกรรม (ตัวอย่าง)', $5, $6, now()) RETURNING id`,
          [p.hospital_id, p.hospital_drug_id, lot, days, p.pack, qty],
        )).rows[0];
        await db.query(`INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, occurred_at) VALUES ($1, $2, $3, 'IMPORT', now())`, [p.hospital_id, row.id, qty]);
        await db.query('COMMIT');
        created.push({ code, lot, name: p.name, receivers: p.receivers });
        ok(`${lot}  ${p.name}  ${qty} units, ${days} days, ${p.receivers} possible receivers`);
      } catch (e) {
        await db.query('ROLLBACK');
        warn(`${lot}: ${(e as Error).message}`);
      }
    }
  }
  if (!created.length && !CLEAN) throw new Error('no lot was created');

  console.log('2. near-expiry scan');
  const sa = await login('system_admin1.region@example.org');
  const scan = await call(sa, 'POST', '/jobs/near-expiry', {});
  if (scan.status >= 300) throw new Error(`scan failed: ${scan.status} ${scan.json?.title ?? ''}`);
  ok(`detected ${scan.json?.detected ?? '?'} lot(s)`);

  console.log('3. owner pharmacists release lots that have real receivers (the rest wait for a live decision)');
  const tokens: Record<string, string> = {};
  for (const code of HOSPITALS) {
    const mine = created.filter((c) => c.code === code);
    // clean start: the lots that were already waiting (earlier demo data) can be used too, so no new stock is needed
    if (CLEAN && !KEEP_DETECTED.includes(code)) {
      const old = await q(`SELECT sl.lot_no, dm.generic_name AS name FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id JOIN hospital h ON h.id = ne.hospital_id
                             JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id JOIN drug_master dm ON dm.id = hd.drug_master_id
                            WHERE h.code = $1 AND ne.status = 'DETECTED' ORDER BY ne.created_at`, [code]);
      mine.push(...old.map((o) => ({ code, lot: o.lot_no, name: o.name, receivers: 0 })));
    }
    let released = 0;
    for (const c of mine) {
      const item = (await q(`SELECT ne.id FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id WHERE sl.lot_no = $1`, [c.lot]))[0];
      if (!item) { warn(`${c.lot}: not detected by the scan (outside the near-expiry threshold?)`); continue; }
      if (released >= RELEASE || KEEP_DETECTED.includes(code)) { ok(`${c.lot}: left DETECTED (waiting for the pharmacist)`); continue; }
      tokens[code] ??= await login(`pharmacist1.${code.toLowerCase()}@example.org`);
      const r = await call(tokens[code], 'POST', `/near-expiry/${item.id}/release`, {});
      if (r.status >= 300) { warn(`${c.lot}: release -> ${r.status} ${r.json?.title ?? r.json?.detail ?? ''}`); continue; }
      const pe = (await q(`SELECT id FROM pool_entry WHERE near_expiry_item_id = $1 ORDER BY released_at DESC LIMIT 1`, [item.id]))[0];
      const cand = await call(tokens[code], 'GET', `/pool/${pe.id}/candidates`);
      const usable = ((cand.json?.data?.candidates ?? []) as { hospital: { code: string }; maxQty: number }[]).filter((x) => x.maxQty > 0);
      if (!usable.length) {
        const w = await call(tokens[code], 'POST', `/near-expiry/${item.id}/withdraw`, { reason: 'DEMO: ไม่มี รพ.ในเขตที่ใช้ทันก่อนหมดอายุ' });
        warn(`${c.lot}: no receiver can use it -> withdrawn (${w.status}), trying the next lot`);
        continue;
      }
      released += 1;
      ok(`${c.lot}: released to the pool, ${usable.length} receiver(s) ${usable.map((x) => `${x.hospital.code}<=${x.maxQty}`).join(' ')}`);
    }
    if (mine.length && !released && RELEASE > 0 && !KEEP_DETECTED.includes(code)) warn(`${code}: no lot with receivers this run`);
  }

  const pool = await q(`SELECT count(*)::int AS n FROM pool_entry pe JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id WHERE ne.status = 'RELEASED_TO_POOL' AND pe.qty_available > 0`);
  const waiting = await q(`SELECT h.code, count(*)::int AS n FROM near_expiry_item ne JOIN hospital h ON h.id = ne.hospital_id WHERE ne.status = 'DETECTED' GROUP BY 1 ORDER BY 1`);
  console.log(`\nPool lots waiting for the allocation round: ${pool[0].n}`);
  console.log('Near-expiry lots waiting for a pharmacist decision: ' + (waiting.map((r) => `${r.code}=${r.n}`).join(' ') || 'none'));
}
main().then(() => db.end()).catch((e) => { console.error(e); process.exit(1); });
