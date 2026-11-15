/**
 * Demo engine: shapes stock and creates the F1 (stock alerts -> borrow) and F2 (near-expiry -> pool -> allocation) demo situation.
 * One copy of the logic for both entry points: `npm run db:demo-seed` (scripts/demo-seed.ts, talks to the backend over HTTP) and the
 * /demo buttons (in the backend process, calls the services directly). It only ADDS: it counts what is already there and tops up to the
 * wanted number, so it can run again. See scripts/demo-seed.ts for the long description of what each part does.
 */
import type pg from 'pg';
import { reevaluateAlerts } from '../forecasts/forecasts.runs.js';
import { loadBorrowConfig } from '../borrow/borrow.config.js';
import { loadNeed } from '../borrow/borrow.inputs.js';
import { buildLadder } from '../borrow/borrow.ladder.js';

/** What the engine needs from its surroundings; the two entry points implement it differently. */
export interface SeedHost {
  /** near-expiry scan; resolves with the number of detected lots when known */
  scan(): Promise<{ detected?: number | string }>;
  /** load the forecast files into the database (only called when no forecast run exists) */
  loadForecast(): Promise<void>;
  /** owner pharmacist releases a detected lot to the pool (only used when RELEASE > 0) */
  release?(ownerCode: string, nearExpiryItemId: string): Promise<{ ok: boolean; message?: string; usable?: string[] }>;
}
export interface SeedOptions {
  db: pg.Pool;
  host: SeedHost;
  log: (line: string) => void;
  only?: string[]; // 'f2', 'f1' (default both)
  release?: number; // lots released per scenario (default 0 = all wait for the pharmacist)
  scale?: number; // multiplies the F2 lot counts
  withU?: boolean; // add scenario U
  relaxed?: boolean; // emergency mode: looser drug conditions
}

let db!: pg.Pool;
let host!: SeedHost;
let sink: (line: string) => void = console.log;
let RELEASE = 0;
let SCALE = 1;
let WITH_U = false;
/** dry run (planDemo): the picks run exactly as in a fill but nothing is written; what would be added is collected in dryAdd */
let DRY = false;
/** emergency mode: looser drug conditions (1 lender instead of 2, receivers using >= 1/day, a third of the value thresholds) so something can still be added when the strict pool is used up */
let RELAXED = false;
const dryAdd = { f1: [] as { code: string; sev: string }[], f2: [] as { kind: string; owner: string; canAdd: number }[] };
const DAYS = [35, 60, 45, 75];
const MIN_VALUE_X = Number(process.env.MIN_VALUE_X ?? 8000); // far receivers cost more to reach: approving must not be blocked by the cost check
const MIN_VALUE_A = Number(process.env.MIN_VALUE_A ?? 6000); // THB the receivers can absorb, so that cost < 20 % of value for the auto-approved scenarios

const say = (s = '') => { for (const line of String(s).split('\n')) sink(line); };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const ok = (s: string) => say('  ok  ' + s);
const warn = (s: string) => say('  !!  ' + s);

type Scenario = { kind: 'A' | 'X' | 'U'; owner: string; receivers: string[]; n: number; note: string };
const F2: Scenario[] = [
  { kind: 'X', owner: 'HA', receivers: ['HD', 'HE'], n: 3, note: 'HA -> HD, HE (other network: waits for approval)' },
  { kind: 'X', owner: 'HB', receivers: ['HC', 'HD'], n: 2, note: 'HB -> HC, HD (mixed networks: waits for approval)' },
  { kind: 'X', owner: 'HE', receivers: ['HA', 'HB'], n: 1, note: 'HE -> HA, HB (network B to A: waits for approval)' },
  { kind: 'A', owner: 'HA', receivers: ['HB', 'HC'], n: 3, note: 'HA -> HB, HC (same network: auto-approved)' },
  { kind: 'A', owner: 'HB', receivers: ['HA', 'HC'], n: 2, note: 'HB -> HA, HC (same network: auto-approved)' },
  { kind: 'A', owner: 'HC', receivers: ['HA', 'HB'], n: 2, note: 'HC -> HA, HB (same network: auto-approved)' },
  { kind: 'A', owner: 'HD', receivers: ['HE'], n: 1, note: 'HD -> HE (inside network B: auto-approved)' },
  { kind: 'U', owner: 'HA', receivers: ['HD', 'HE'], n: 1, note: 'HA -> HD, HE (transport cost too high: owner must choose an option first)' },
];
const ALL = ['HA', 'HB', 'HC', 'HD', 'HE'];

/** Drugs every hospital lists with a verified mapping and a forecast; plain stock (no cold chain / blood / controlled). */
const drugsSql = () => `
  SELECT dm.id AS drug_id, dm.generic_name AS name, h.code, hd.id AS hd_id, hd.hospital_id, hd.unit_price_thb::float8 AS price,
         f.u_per_day::float8 AS u, f.total_target::float8 AS target,
         COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = hd.id AND l.expiry_date > current_date), 0)::float8 AS free,
         GREATEST(COALESCE((SELECT avg(qty_used) FROM usage_daily u WHERE u.hospital_drug_id = hd.id AND u.usage_date > current_date - 40), 0), f.u_per_day)::float8 AS use,
         (SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = hd.id AND pack_size_base_units IS NOT NULL LIMIT 1) AS pack
    FROM drug_master dm
    JOIN hospital_drug hd ON hd.drug_master_id = dm.id AND hd.active AND hd.unit_price_thb > 0
    JOIN hospital h ON h.id = hd.hospital_id AND h.active
    JOIN drug_mapping m ON m.hospital_drug_id = hd.id AND m.status = 'VERIFIED'
    JOIN v_latest_forecast f ON f.hospital_drug_id = hd.id AND f.granularity = 'WEEK' AND f.u_per_day >= ${RELAXED ? 1 : 3} AND f.total_target IS NOT NULL
   WHERE NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
     AND NOT EXISTS (SELECT 1 FROM stock_lot l WHERE l.hospital_drug_id = hd.id AND (l.lot_no LIKE 'DEMO-NE-%' OR l.lot_no LIKE 'DEMO-EXP-%'))
     AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
                      WHERE br.borrower_hospital_id = hd.hospital_id AND i.drug_master_id = dm.id AND br.status::text NOT IN ('FULFILLED','CLOSED_UNFULFILLED','CANCELLED'))`;

/** Takes `qty` from the free lots of a hospital drug, earliest expiry first (ledger ISSUE_USAGE, ref_type DEMO_F2_SHAPE). */
async function drain(c: pg.PoolClient, hdId: string, hospitalId: string, qty: number, refType = 'DEMO_F2_SHAPE') {
  let left = Math.ceil(qty);
  const lots = (await c.query(`SELECT id, qty_on_hand - qty_held AS f FROM stock_lot WHERE hospital_drug_id = $1 AND expiry_date > current_date AND qty_on_hand - qty_held > 0 ORDER BY expiry_date, id`, [hdId])).rows;
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(Number(l.f), left);
    await c.query(`INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, occurred_at) VALUES ($1, $2, $3, 'ISSUE_USAGE', $4, now())`, [hospitalId, l.id, -take, refType]);
    await c.query(`UPDATE stock_lot SET qty_on_hand = qty_on_hand - $2, updated_at = now(), version = version + 1 WHERE id = $1`, [l.id, take]);
    left -= take;
  }
}
/** Adds a plain stock lot (IMPORT) that lasts a year. */
async function addStock(c: pg.PoolClient, hdId: string, hospitalId: string, lotNo: string, qty: number, expDays: number, pack: number | null) {
  const id = (await c.query(
    `INSERT INTO stock_lot(hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, pack_size_base_units, qty_on_hand, updated_at)
     VALUES ($1, $2, $3, current_date + $4::int, 'องค์การเภสัชกรรม (ตัวอย่าง)', $5, $6, now()) RETURNING id`, [hospitalId, hdId, lotNo, expDays, pack, Math.ceil(qty)])).rows[0].id;
  await c.query(`INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, occurred_at) VALUES ($1, $2, $3, 'IMPORT', now())`, [hospitalId, id, Math.ceil(qty)]);
}

/**
 * The scan also detects lots that are not part of the scenarios above (the DEMO-NE-* lots of db/demo/02-shape.sql and a few from the
 * history). Their drug is usually well stocked everywhere, so when a pharmacist releases one and presses the round nobody can take it.
 * For each such lot, shape the drug at up to 2 other hospitals (own network first, then the heaviest users) to a few % of their
 * target stock: that is the shortage the Agent can split the lot into. Hospitals that hold a seeded owner lot of that drug are left alone.
 */
async function shortageForOtherLots() {
  say('  shortage for the other waiting lots (so a round finds receivers)');
  const lots = await q(
    `SELECT sl.lot_no, h.code AS owner, h.network_id, hd.drug_master_id AS drug_id, sl.qty_on_hand::float8 AS qty, (sl.expiry_date - current_date) AS days
       FROM near_expiry_item ne
       JOIN stock_lot sl ON sl.id = ne.lot_id
       JOIN hospital h ON h.id = ne.hospital_id
       JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
      WHERE ne.status = 'DETECTED' AND sl.lot_no NOT LIKE 'DEMO-F2%' AND sl.qty_on_hand > 0 AND sl.expiry_date > current_date + 10
      ORDER BY h.code, sl.lot_no`);
  const shaped = new Set<string>(); // hospital drug already cut for another lot of this kind
  let done = 0;
  for (const lot of lots) {
    const cand = await q(
      `SELECT h.code, h.network_id, hd.id AS hd_id, h.id AS hospital_id, f.u_per_day::float8 AS u, f.total_target::float8 AS target,
              COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = hd.id AND l.expiry_date > current_date), 0)::float8 AS free
         FROM hospital_drug hd
         JOIN hospital h ON h.id = hd.hospital_id AND h.active AND h.agent_participation
         JOIN drug_mapping m ON m.hospital_drug_id = hd.id AND m.status = 'VERIFIED'
         JOIN v_latest_forecast f ON f.hospital_drug_id = hd.id AND f.granularity = 'WEEK' AND f.u_per_day >= 2 AND f.total_target IS NOT NULL
        WHERE hd.drug_master_id = $1 AND hd.active AND h.code <> $2
          -- a drug that carries a seeded F2 lot anywhere keeps its planned receivers: shaping it again would add takers (e.g. across networks)
          AND NOT EXISTS (SELECT 1 FROM stock_lot l JOIN hospital_drug x ON x.id = l.hospital_drug_id
                           WHERE x.drug_master_id = hd.drug_master_id AND l.lot_no LIKE 'DEMO-F2%' AND l.qty_on_hand > 0 AND l.expiry_date > current_date)`,
      [lot.drug_id, lot.owner]);
    const pick = cand
      .sort((a, b) => Number(b.network_id === lot.network_id) - Number(a.network_id === lot.network_id) || b.u - a.u)
      .slice(0, 2);
    if (pick.length === 0) { warn(`${lot.lot_no} (${lot.owner}): no other hospital lists this drug with a forecast, nobody can take it`); continue; }
    for (const r of pick) {
      if (shaped.has(r.hd_id)) continue;
      shaped.add(r.hd_id);
      const keep = r.target * 0.05;
      if (r.free <= keep) continue;
      const c = await db.connect();
      try {
        await c.query('BEGIN');
        await drain(c, r.hd_id, r.hospital_id, r.free - keep);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        warn(`${lot.lot_no}: ${(e as Error).message}`);
      } finally {
        c.release();
      }
    }
    done += 1;
    ok(`${lot.lot_no} (${lot.owner}, ${lot.days} days, ${lot.qty} units): short at ${pick.map((r) => r.code).join(', ')}`);
  }
  if (lots.length === 0) ok('none');
  else say(`  ${done}/${lots.length} other lot(s) now have a shortage to land in`);
}

async function f2() {
  say('F2: near-expiry lots, pool and plans');
  const run = String(Number((await q(`SELECT COALESCE(max(substring(lot_no from 'DEMO-F2[AXU]-[A-Z]+([0-9]+)-')::int), 0) AS n FROM stock_lot WHERE lot_no LIKE 'DEMO-F2%'`))[0].n) + 1);
  const used = new Set<string>(); // drugs taken in this run
  const created: { sc: Scenario; lot: string; name: string }[] = [];

  for (const sc of F2) {
    if (sc.kind === 'U' && !WITH_U) continue; // off by default, see WITH_U
    // lots of this scenario that still wait (not yet in a finished state) count as "already there"
    const have = (await q(
      `SELECT count(*)::int AS n FROM stock_lot sl JOIN hospital h ON h.id = sl.hospital_id
        WHERE h.code = $1 AND sl.lot_no LIKE $2 AND sl.qty_on_hand > 0 AND sl.expiry_date > current_date
          AND EXISTS (SELECT 1 FROM near_expiry_item ne WHERE ne.lot_id = sl.id AND ne.status IN ('DETECTED', 'RELEASED_TO_POOL'))`,
      [sc.owner, `DEMO-F2${sc.kind}-${sc.owner}%`]))[0].n as number;
    // a lot not yet scanned counts as there too (fresh seed): handled by the run suffix, so only top up when lots exist
    const want = sc.n * SCALE - have;
    if (want <= 0) { ok(`${sc.kind} ${sc.note}: ${have} lot(s) already there`); continue; }

    const rows = await q(drugsSql());
    const byDrug = new Map<string, any[]>();
    for (const r of rows) (byDrug.get(r.drug_id) ?? byDrug.set(r.drug_id, []).get(r.drug_id)!).push(r);
    // a drug that still carries a seeded owner lot (this run or an earlier one) is not used again; once it is consumed the drug is free for a refill
    const taken = new Set<string>((await q(`SELECT DISTINCT hd.drug_master_id AS id FROM stock_lot l JOIN hospital_drug hd ON hd.id = l.hospital_drug_id WHERE (l.lot_no LIKE 'DEMO-F2A-%' OR l.lot_no LIKE 'DEMO-F2X-%' OR l.lot_no LIKE 'DEMO-F2U-%') AND l.qty_on_hand > 0 AND l.expiry_date > current_date`)).map((r) => r.id));
    const fit = [...byDrug.values()]
      .filter((g) => !used.has(g[0].drug_id) && !taken.has(g[0].drug_id) && [sc.owner, ...sc.receivers].every((c) => g.some((r) => r.code === c)))
      .filter((g) => sc.receivers.every((c) => g.find((r) => r.code === c).u >= (RELAXED ? 1 : 3)))
      // what the receivers can absorb in the shortest lot life, in baht: an auto-approved plan must pass the transport cost check
      // (cost >= 20 % of the value is "uneconomical" and always waits for a click), so network-A scenarios need a high value
      .map((g) => ({ g, val: sc.receivers.reduce((t, c) => { const r = g.find((x) => x.code === c); return t + Math.min(r.target * 0.95, r.u * (DAYS[0] - 3)); }, 0) * g.find((x) => x.code === sc.owner).price }))
      .filter((x) => (sc.kind === 'A' ? x.val >= MIN_VALUE_A / (RELAXED ? 3 : 1) : sc.kind === 'X' ? x.val >= MIN_VALUE_X / (RELAXED ? 3 : 1) : x.val >= 600 && x.val <= 2000))
      .sort((a, b) => (sc.kind !== 'U' ? b.val - a.val : (a.g[0].drug_id + run + sc.owner).localeCompare(b.g[0].drug_id + run + sc.owner)))
      .map((x) => x.g);
    if (fit.length < want) warn(`${sc.kind} ${sc.owner}: only ${fit.length} suitable drug(s) for ${want} lot(s)`);
    if (DRY) {
      const n = Math.min(want, fit.length);
      for (let k = 0; k < n; k++) used.add(fit[k][0].drug_id);
      dryAdd.f2.push({ kind: sc.kind, owner: sc.owner, canAdd: n });
      continue;
    }

    for (let k = 0; k < Math.min(want, fit.length); k++) {
      const g = fit[k];
      used.add(g[0].drug_id);
      const at = (c: string) => g.find((r) => r.code === c);
      const days = DAYS[(have + k) % DAYS.length];
      const lot = `DEMO-F2${sc.kind}-${sc.owner}${run}-${have + k + 1}`;
      const c = await db.connect();
      try {
        await c.query('BEGIN');
        let cap = 0;
        for (const code of ALL) {
          const r = at(code);
          if (!r || code === sc.owner) continue;
          if (sc.receivers.includes(code)) {
            const keep = r.target * 0.05; // receivers are short: only 5 % of the target stock is left
            if (r.free > keep) await drain(c, r.hd_id, r.hospital_id, r.free - keep);
            cap += Math.min(r.target - keep, r.u * (days - 3));
          } else if (r.free < r.target * 1.3) {
            await addStock(c, r.hd_id, r.hospital_id, `DEMO-F2STK-${code}${run}-${have + k + 1}`, r.target * 1.3 - r.free + 1, 365, r.pack); // others are covered: they take nothing
          }
        }
        const o = at(sc.owner);
        const qty = Math.max(20, Math.ceil(o.use * (days - 1) * 1.05 + cap * 0.9));
        await addStock(c, o.hd_id, o.hospital_id, lot, qty, days, o.pack);
        await c.query('COMMIT');
        created.push({ sc, lot, name: o.name });
        ok(`${lot}  ${o.name}  ${qty} units, ${days} days  [${sc.note}]`);
      } catch (e) {
        await c.query('ROLLBACK');
        warn(`${lot}: ${(e as Error).message}`);
      } finally {
        c.release();
      }
    }
  }

  if (DRY) return;

  say('  near-expiry scan');
  const scanned = await host.scan();
  ok(`detected ${scanned.detected ?? '?'} lot(s)`);

  await shortageForOtherLots();

  say('  owner pharmacists release the first lot of each scenario to the pool (the others wait for a live click)');
  for (const sc of F2) {
    const mine = created.filter((x) => x.sc === sc);
    let released = 0;
    for (const m of mine) {
      if (released >= RELEASE) break;
      const item = (await q(`SELECT ne.id FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id WHERE sl.lot_no = $1`, [m.lot]))[0];
      if (!item) { warn(`${m.lot}: not detected by the scan`); continue; }
      if (!host.release) { warn(`${m.lot}: this host cannot release lots to the pool (RELEASE is only for the script)`); break; }
      const r = await host.release(sc.owner, item.id);
      if (!r.ok) { warn(`${m.lot}: release -> ${r.message ?? 'failed'}`); continue; }
      const usable = [...(r.usable ?? [])].sort();
      const expect = [...sc.receivers].sort();
      usable.join() === expect.join() ? ok(`${m.lot}: released, receivers ${usable.join(' ')} as planned`) : warn(`${m.lot}: released, receivers ${usable.join(' ') || 'none'} (planned ${expect.join(' ')})`);
      released += 1;
    }
  }

  const pool = await q(`SELECT h.code, count(*)::int AS n FROM pool_entry pe JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id JOIN hospital h ON h.id = ne.hospital_id
                         WHERE ne.status = 'RELEASED_TO_POOL' AND pe.qty_available > 0 GROUP BY 1 ORDER BY 1`);
  const waiting = await q(`SELECT h.code, count(*)::int AS n FROM near_expiry_item ne JOIN hospital h ON h.id = ne.hospital_id WHERE ne.status = 'DETECTED' GROUP BY 1 ORDER BY 1`);
  say(`\nF2 in the pool (press the round): ${pool.map((r) => `${r.code}=${r.n}`).join(' ') || 'none'}`);
  say(`F2 waiting for a pharmacist decision: ${waiting.map((r) => `${r.code}=${r.n}`).join(' ') || 'none'}`);
}

/** F1 clean start: no half-way data, and the F2 shortages are not an easy way to break the F2 demo. */
/** What a hospital should show on the stock alert page to borrow from (open LOW_STOCK alerts by severity). */
const F1_WANT = { VERY_URGENT: 3, URGENT: 3, NORMAL: 2 };
/** days of cover the shaped stock is cut to: V drug 1.2 d = very urgent, 4 d = urgent; E drug 1.2 d = urgent, 4 d = normal (F-11) */
const F1_COVER = { VERY_URGENT: 1.2, URGENT: 4, NORMAL: 4 };

/**
 * More alerts to borrow from. The F2 shaping leaves only a few borrowable alerts (and none at HD / HE), so this tops every hospital up to
 * F1_WANT open LOW_STOCK alerts by cutting the stock of drugs that (a) no waiting F2 lot of any hospital carries (so the F2 split is not
 * disturbed), (b) have no active alert or request yet and (c) have at least 2 other hospitals that can lend it (stock of lots with more
 * than 180 days left, above their own target). Rows are ledger ISSUE_USAGE with ref_type DEMO_F1_SHAPE.
 */
async function f1MoreAlerts() {
  say('  more alerts to borrow from');
  const open = await q(
    `SELECT h.code, a.severity::text AS sev, count(*)::int AS n FROM stock_alert a JOIN hospital h ON h.id = a.hospital_id
      WHERE a.type = 'LOW_STOCK' AND a.status = 'OPEN' GROUP BY 1, 2`);
  const have = (code: string, sev: string) => Number(open.find((r) => r.code === code && r.sev === sev)?.n ?? 0);
  const usedBy = new Map<string, number>(); // drug -> hospitals already cut for it in this run
  const cut = new Set<string>(); // hospital drugs already cut in this run (their alert only appears at the next evaluation)
  for (const code of ALL) {
    const hospital = (await q(`SELECT id FROM hospital WHERE code = $1`, [code]))[0];
    for (const sev of ['VERY_URGENT', 'URGENT', 'NORMAL'] as const) {
      let need = F1_WANT[sev] - have(code, sev);
      while (need > 0) {
        // V drugs make very urgent / urgent alerts, E drugs make normal ones (and urgent ones, 1.2 d of cover)
        const ved = sev === 'NORMAL' ? "('E','D')" : sev === 'URGENT' ? "('V','E')" : "('V')";
        const rows = await q(
          `SELECT hd.id AS hd_id, dm.id AS drug_id, dm.generic_name AS name, f.ved::text AS ved, f.u_per_day::float8 AS u, f.p50::float8 AS p50,
                  COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = hd.id AND l.expiry_date > current_date), 0)::float8 AS free,
                  (SELECT count(DISTINCT x.hospital_id) FROM hospital_drug x
                     JOIN hospital hx ON hx.id = x.hospital_id AND hx.active AND hx.agent_participation
                     JOIN drug_mapping mx ON mx.hospital_drug_id = x.id AND mx.status = 'VERIFIED'
                     JOIN v_latest_forecast fx ON fx.hospital_drug_id = x.id AND fx.granularity = 'WEEK' AND fx.total_target IS NOT NULL
                    WHERE x.drug_master_id = hd.drug_master_id AND x.active AND x.hospital_id <> hd.hospital_id
                      AND COALESCE((SELECT sum(l.qty_on_hand - l.qty_held) FROM stock_lot l WHERE l.hospital_drug_id = x.id AND l.expiry_date > current_date + 180), 0) - fx.total_target >= fx.total_target * 0.5) AS lenders
             FROM hospital_drug hd
             JOIN drug_master dm ON dm.id = hd.drug_master_id AND NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
             JOIN drug_mapping m ON m.hospital_drug_id = hd.id AND m.status = 'VERIFIED'
             JOIN v_latest_forecast f ON f.hospital_drug_id = hd.id AND f.granularity = 'WEEK' AND f.u_per_day >= 1 AND f.total_target IS NOT NULL AND f.ved::text IN ${ved}
            WHERE hd.hospital_id = $1 AND hd.active
              AND NOT EXISTS (SELECT 1 FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id JOIN hospital_drug x ON x.id = sl.hospital_drug_id
                               WHERE ne.status = 'DETECTED' AND x.drug_master_id = hd.drug_master_id)
              AND NOT EXISTS (SELECT 1 FROM stock_alert a WHERE a.hospital_drug_id = hd.id AND a.granularity = 'WEEK' AND a.status IN ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED') AND a.type = 'LOW_STOCK')
              AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
                               WHERE br.borrower_hospital_id = hd.hospital_id AND i.drug_master_id = dm.id AND br.status::text NOT IN ('FULFILLED','CLOSED_UNFULFILLED','CANCELLED'))`,
          [hospital.id]);
        const pick = rows
          .filter((r) => Number(r.lenders) >= (RELAXED ? 1 : 2) && (usedBy.get(r.drug_id) ?? 0) < 3 && !cut.has(r.hd_id))
          .sort((a, b) => Number(b.lenders) - Number(a.lenders) || (usedBy.get(a.drug_id) ?? 0) - (usedBy.get(b.drug_id) ?? 0) || b.u - a.u)[0];
        if (!pick) { warn(`${code}: no drug left for ${need} more ${sev} alert(s)`); break; }
        if (DRY) {
          usedBy.set(pick.drug_id, (usedBy.get(pick.drug_id) ?? 0) + 1);
          cut.add(pick.hd_id);
          dryAdd.f1.push({ code, sev });
          need -= 1;
          continue;
        }
        // an E drug is urgent below 2 days of cover and normal above it; a V drug is very urgent below 2 days and urgent up to 7
        const days = pick.ved === 'E' && sev === 'URGENT' ? 1.2 : F1_COVER[sev];
        const keep = Math.max(1, Math.min(pick.u * days, pick.p50 * 0.8));
        if (pick.free > keep) {
          const c = await db.connect();
          try {
            await c.query('BEGIN');
            await drain(c, pick.hd_id, hospital.id, pick.free - keep, 'DEMO_F1_SHAPE');
            await c.query('COMMIT');
          } catch (e) {
            await c.query('ROLLBACK');
            warn(`${code} ${pick.name}: ${(e as Error).message}`);
            break;
          } finally {
            c.release();
          }
        }
        usedBy.set(pick.drug_id, (usedBy.get(pick.drug_id) ?? 0) + 1);
        cut.add(pick.hd_id);
        ok(`${code} ${pick.name}: stock ${Math.round(pick.free)} -> ${Math.round(Math.min(pick.free, keep))} (${sev}, ${pick.lenders} lenders)`);
        need -= 1;
      }
    }
  }
}

async function f1() {
  say('\nF1 clean start');
  const ev = await reevaluateAlerts();
  ok(`alerts re-evaluated (${ev.map((e) => `${e.granularity}: opened ${e.alerts.opened}, closed ${e.alerts.closed}`).join('; ') || 'no forecast run found'})`);
  await f1MoreAlerts();
  await reevaluateAlerts(); // the cuts above open the new alerts

  // an alert that says "request created" although its request is finished (history data) is not a start point
  const stray = await q(
    `UPDATE stock_alert a SET status = 'RESOLVED', updated_at = now(), version = version + 1
      WHERE a.status = 'LINKED_TO_REQUEST'
        AND NOT EXISTS (SELECT 1 FROM borrow_request br WHERE br.stock_alert_id = a.id
                         AND br.status::text IN ('DRAFT','PENDING_APPROVAL','APPROVED','IN_PROGRESS','PARTIALLY_FULFILLED','ESCALATED'))
      RETURNING a.id`,
  );
  ok(`${stray.length} stray LINKED_TO_REQUEST alert(s) closed (request already finished)`);

  // borrowing a drug that a seeded F2 lot is meant to land on would fill the receivers' shortage: hide those alerts for 7 days
  const hidden = await q(
    `UPDATE stock_alert a SET status = 'SNOOZED', snoozed_until = now() + interval '7 days', updated_at = now(), version = version + 1
      FROM hospital_drug hd
      WHERE hd.id = a.hospital_drug_id AND a.type = 'LOW_STOCK' AND a.status IN ('OPEN', 'ACKNOWLEDGED')
        AND hd.drug_master_id IN (SELECT x.drug_master_id FROM stock_lot l JOIN hospital_drug x ON x.id = l.hospital_drug_id WHERE l.lot_no LIKE 'DEMO-F2%')
      RETURNING a.id, a.hospital_id`,
  );
  ok(`${hidden.length} LOW_STOCK alert(s) on F2 drugs snoozed for 7 days (borrowing them would fill the F2 receivers)`);

  // the cuts above also shrink lenders: run the real lender filter (F-12: transit time, lendable stock, mapping ...) for every open alert.
  // An alert nobody can serve is a dead end in a live demo, so it is snoozed like the F2 ones.
  const cfg = await loadBorrowConfig(db);
  const open = await q(
    `SELECT a.id, h.id AS hid, h.code, hd.drug_master_id AS did, dm.generic_name AS name, a.severity::text AS sev
       FROM stock_alert a JOIN hospital h ON h.id = a.hospital_id JOIN hospital_drug hd ON hd.id = a.hospital_drug_id JOIN drug_master dm ON dm.id = hd.drug_master_id
      WHERE a.type = 'LOW_STOCK' AND a.status = 'OPEN' ORDER BY 3, 5`);
  let one = 0;
  for (const a of open) {
    let eligible = 0;
    try {
      const need = await loadNeed(db, cfg, a.hid, a.did);
      eligible = (await buildLadder(db, cfg, need, a.hid)).candidates.filter((c) => c.eligible).length;
    } catch (e) {
      warn(`${a.code} ${a.name}: ${(e as Error).message}`);
    }
    if (eligible === 0) {
      await q(`UPDATE stock_alert SET status = 'SNOOZED', snoozed_until = now() + interval '7 days', updated_at = now(), version = version + 1 WHERE id = $1`, [a.id]);
      warn(`${a.code} ${a.name} (${a.sev}): no lender can serve it (transit / stock), snoozed`);
    } else if (eligible === 1) one += 1;
  }
  ok(`lender check on ${open.length} open alert(s): the rest have at least 1 eligible lender (${one} with exactly 1)`);

  const left = await q(
    `SELECT h.code, a.severity::text AS sev, count(*)::int AS n FROM stock_alert a JOIN hospital h ON h.id = a.hospital_id
      WHERE a.type = 'LOW_STOCK' AND a.status = 'OPEN' GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  const by: Record<string, string[]> = {};
  for (const r of left) (by[r.code] ??= []).push(`${r.sev === 'VERY_URGENT' ? 'very urgent' : r.sev.toLowerCase()} ${r.n}`);
  say(`F1 open LOW_STOCK alerts to borrow from: ${Object.entries(by).map(([k, v]) => `${k} [${v.join(', ')}]`).join('  ') || 'none'}`);
}


/** The stock alerts and the F2 receivers need a loaded forecast. */
async function ensureForecast() {
  const loaded = Number((await q(`SELECT count(*)::int AS n FROM forecast_run WHERE status = 'SUCCEEDED'`))[0].n);
  if (loaded > 0) { ok(`forecast already loaded (${loaded} run(s))`); return; }
  try { await host.loadForecast(); } catch (e) { throw new Error(`forecast load failed: ${(e as Error).message}. Is backend/models/artifacts/forecasts present?`); }
  const n = Number((await q(`SELECT count(*)::int AS n FROM forecast_run WHERE status = 'SUCCEEDED'`))[0].n);
  if (n === 0) throw new Error('forecast load returned OK but no forecast run was saved: check backend/models/artifacts/forecasts');
  ok(`forecast loaded (${n} run(s))`);
}

function configure(o: SeedOptions) {
  db = o.db; host = o.host; sink = o.log;
  RELEASE = Math.max(0, o.release ?? 0);
  SCALE = Math.max(1, o.scale ?? 1);
  WITH_U = !!o.withU;
  RELAXED = !!o.relaxed;
}

/** Runs the parts in `only` (default f2 then f1). Not safe to run twice at the same time: the callers hold a lock. */
export async function runDemo(o: SeedOptions): Promise<void> {
  configure(o);
  const only = (o.only ?? ['f2', 'f1']).map((s) => s.trim().toLowerCase());
  say('Forecast');
  await ensureForecast();
  if (only.includes('f2')) await f2();
  if (only.includes('f1')) await f1();
}

/**
 * Read-only: what a run would add. Counts what is there against the targets and then replays the real picks without writing,
 * so `canAdd` is what a fill could really add now (it can be less than `missing`: no drug left that meets the conditions).
 * Not safe next to a running fill (shared state): the caller refuses while one runs.
 */
export async function planDemo(o: Pick<SeedOptions, 'db' | 'scale' | 'withU' | 'relaxed'>) {
  db = o.db; SCALE = Math.max(1, o.scale ?? 1); WITH_U = !!o.withU; RELAXED = !!o.relaxed;
  const forecast = Number((await q(`SELECT count(*)::int AS n FROM forecast_run WHERE status = 'SUCCEEDED'`))[0].n);
  const open = await q(
    `SELECT h.code, a.severity::text AS sev, count(*)::int AS n FROM stock_alert a JOIN hospital h ON h.id = a.hospital_id
      WHERE a.type = 'LOW_STOCK' AND a.status = 'OPEN' GROUP BY 1, 2`);

  dryAdd.f1 = []; dryAdd.f2 = [];
  const keepSink = sink;
  DRY = true; sink = () => undefined;
  try {
    if (forecast > 0) { await f2(); await f1MoreAlerts(); }
  } finally {
    DRY = false; sink = keepSink;
  }

  const f1Rows = ALL.flatMap((code) => (['VERY_URGENT', 'URGENT', 'NORMAL'] as const).map((sev) => {
    const have = Number(open.find((r) => r.code === code && r.sev === sev)?.n ?? 0);
    const missing = Math.max(0, F1_WANT[sev] - have);
    const canAdd = Math.min(missing, dryAdd.f1.filter((x) => x.code === code && x.sev === sev).length);
    return { hospital: code, severity: sev, have, want: F1_WANT[sev], missing, canAdd };
  }));
  const f2Rows = [];
  for (const sc of F2) {
    if (sc.kind === 'U' && !WITH_U) continue;
    const have = Number((await q(
      `SELECT count(*)::int AS n FROM stock_lot sl JOIN hospital h ON h.id = sl.hospital_id
        WHERE h.code = $1 AND sl.lot_no LIKE $2 AND sl.qty_on_hand > 0 AND sl.expiry_date > current_date
          AND EXISTS (SELECT 1 FROM near_expiry_item ne WHERE ne.lot_id = sl.id AND ne.status IN ('DETECTED', 'RELEASED_TO_POOL'))`,
      [sc.owner, `DEMO-F2${sc.kind}-${sc.owner}%`]))[0].n);
    const want = sc.n * SCALE;
    const missing = Math.max(0, want - have);
    const canAdd = Math.min(missing, dryAdd.f2.find((x) => x.kind === sc.kind && x.owner === sc.owner)?.canAdd ?? 0);
    f2Rows.push({ kind: sc.kind, owner: sc.owner, note: sc.note, have, want, missing, canAdd });
  }
  const total = f1Rows.reduce((n, r) => n + r.canAdd, 0) + f2Rows.reduce((n, r) => n + r.canAdd, 0);
  return { forecastLoaded: forecast > 0, f1: f1Rows, f2: f2Rows, canAddTotal: total, nothingToAdd: total === 0 };
}
