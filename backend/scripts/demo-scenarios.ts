/**
 * Demo scenarios: leaves unfinished work for pharmacist, ER, warehouse and driver by calling the real API
 * (so rules, audit, stock holds and notifications are the real ones). Run after db/demo/01-backfill.sql and 02-shape.sql:
 *
 *   API=http://127.0.0.1:3001/api/v1 DB_NAME=doorare npx tsx scripts/demo-scenarios.ts
 *
 * The backend must be running against the same database. Everything it creates is new data (requests BR-*, incidents,
 * near-expiry items, transport tasks); undo = restore the snapshot (`npm run db:restore`).
 */
import pg from 'pg';
import { createPlanFromAgentProposal } from '../src/modules/expiry/matching.js';
import { withTransaction } from '../src/db/tx.js';

const API = process.env.API ?? 'http://127.0.0.1:3001/api/v1';
const db = new pg.Pool({ host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 5442), database: process.env.DB_NAME ?? 'doorare', user: process.env.DB_USER ?? 'doorare', password: process.env.DB_PASSWORD ?? 'doorare_dev' });
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]).toString('base64');
const done: string[] = [];
const warn: string[] = [];
const log = (s: string) => { done.push(s); console.log('  ok  ' + s); };
const skip = (s: string) => { warn.push(s); console.log('  !!  ' + s); };

async function login(email: string): Promise<string> {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'doorare123', otp: '123456' }) });
  const j = (await r.json()) as { token?: string };
  if (!j.token) throw new Error(`login failed for ${email}`);
  return j.token;
}
async function call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(method === 'GET' || method === 'PATCH' ? {} : { 'Idempotency-Key': crypto.randomUUID() }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function must(label: string, p: Promise<{ status: number; json: any }>): Promise<any> {
  const r = await p;
  if (r.status >= 300) throw new Error(`${label}: ${r.status} ${r.json?.code ?? ''} ${r.json?.title ?? r.json?.detail ?? ''}`);
  return r.json;
}
const T: Record<string, string> = {};
const H: Record<string, string> = {};

async function photo(token: string, taskId: string): Promise<string> {
  const r = await must('photo', call(token, 'POST', `/transport-tasks/${taskId}/photos`, { dataBase64: JPEG }));
  return r.photoKey as string;
}
/** the transport task of a leg (created when the lender accepts) */
const taskOfLeg = async (legId: string) => (await q(`SELECT id, version, status::text s FROM transport_task WHERE ref_type = 'BORROW_LEG' AND ref_id = $1 AND status <> 'CANCELLED'`, [legId]))[0];

/** Creates a request for hospital `code` (from a LOW_STOCK alert when one is open, else manual) and proposes it. */
async function newRequest(hosp: string, idx: number, lenders: string[]): Promise<{ id: string; legs: any[]; prop: any } | null> {
  const code = hosp.toUpperCase();
  const t = T['ph' + hosp.toLowerCase()];
  const alerts = await q(
    `SELECT a.id, hd.drug_master_id FROM stock_alert a JOIN hospital_drug hd ON hd.id = a.hospital_drug_id JOIN hospital h ON h.id = a.hospital_id
      WHERE h.code = $1 AND a.type = 'LOW_STOCK' AND a.status = 'OPEN'
        AND EXISTS (SELECT 1 FROM drug_master dm WHERE dm.id = hd.drug_master_id AND NOT dm.is_controlled AND NOT dm.is_cold_chain AND NOT dm.is_blood_product)
        AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id WHERE br.stock_alert_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
                         WHERE br.borrower_hospital_id = a.hospital_id AND i.drug_master_id = hd.drug_master_id AND br.status::text NOT IN ('FULFILLED','CLOSED_UNFULFILLED','CANCELLED'))
      ORDER BY CASE a.severity::text WHEN 'VERY_URGENT' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END, a.days_cover NULLS LAST, a.id OFFSET $2 LIMIT 1`,
    [code, 0],
  );
  if (!alerts[0]) { skip(`${code} request ${idx}: no open LOW_STOCK alert left`); return null; }
  const created = await must('create', call(t, 'POST', '/borrow-requests', { stockAlertId: alerts[0].id }));
  const prop = await must('propose', call(t, 'POST', `/borrow-requests/${created.id}/propose`, {}));
  const ladder = prop.data.proposal.ladder as any[];
  const want = lenders.map((c) => ladder.find((e) => e.code === c && e.lendable > 0)).filter(Boolean);
  if (lenders.length && want.length === lenders.length) {
    const total = prop.data.qtyRequested as number;
    const first = Math.min(want[0].lendable, Math.ceil(total / want.length));
    const legs = want.map((e: any, i: number) => ({ hospitalId: e.hospitalId, qty: Math.max(1, i === 0 ? first : Math.min(e.lendable, total - first)) }));
    const r = await call(t, 'PATCH', `/borrow-requests/${created.id}/ladder`, { legs });
    if (r.status >= 300) skip(`${code} request ${idx}: ladder edit -> ${r.status} ${r.json?.title ?? ''}`);
  } else if (lenders.length) skip(`${code} request ${idx}: wanted lenders ${lenders.join('+')} not all lendable, using the proposed ladder`);
  return { id: created.id, legs: [], prop };
}
async function approve(code: string, id: string): Promise<any[]> {
  const r = await must('approve', call(T['ph' + code], 'POST', `/borrow-requests/${id}/approve`, {}));
  return r.data.legs as any[];
}
const lenderOf = (leg: any) => String(leg.lender?.code ?? leg.lenderCode).toLowerCase();
async function accept(leg: any): Promise<void> {
  const t = T['ph' + lenderOf(leg)];
  let r = await call(t, 'POST', `/borrow-legs/${leg.id}/respond`, { decision: 'ACCEPT' });
  if (r.status === 422) r = await call(t, 'POST', `/borrow-legs/${leg.id}/respond`, { decision: 'PARTIAL', qty: Math.max(1, Math.floor(leg.qtyAsked * 0.6)) });
  if (r.status >= 300) throw new Error(`respond: ${r.status} ${r.json?.title ?? ''}`);
}
async function load(leg: any): Promise<void> {
  const tk = await taskOfLeg(leg.id);
  const wh = T['wh' + lenderOf(leg)];
  const key = await photo(wh, tk.id);
  await must('load', call(wh, 'POST', `/borrow-legs/${leg.id}/load`, { photoKeys: [key] }));
}
async function depart(leg: any): Promise<void> {
  const tk = await taskOfLeg(leg.id);
  await must('depart', call(T['dr' + lenderOf(leg)], 'POST', `/transport-tasks/${tk.id}/status`, { toStatus: 'IN_TRANSIT', version: tk.version }));
}
async function arrive(leg: any): Promise<void> {
  const tk = await taskOfLeg(leg.id);
  const dr = T['dr' + lenderOf(leg)];
  const key = await photo(dr, tk.id);
  await must('arrive', call(dr, 'POST', `/transport-tasks/${tk.id}/status`, { toStatus: 'ARRIVED', version: tk.version, photoKeys: [key] }));
}
async function step(label: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); log(label); } catch (e) { skip(`${label}: ${(e as Error).message}`); }
}

async function main() {
  const used = await q(`SELECT 1 FROM borrow_request WHERE reason LIKE 'DEMO:%' LIMIT 1`);
  if (used.length) throw new Error('scenarios already applied (borrow_request.reason DEMO:). Restore the snapshot first.');
  for (const r of await q(`SELECT code, id FROM hospital`)) H[r.code] = r.id;
  T.sa = await login('system_admin1.region@example.org');
  for (const c of ['ha', 'hb', 'hc', 'hd', 'he']) {
    T['ph' + c] = await login(`pharmacist1.${c}@example.org`);
    T['wh' + c] = await login(`warehouse_officer1.${c}@example.org`);
    T['dr' + c] = await login(`driver1.${c}@example.org`);
  }
  T.erha = await login('er_staff1.ha@example.org');
  T.erhb = await login('er_staff1.hb@example.org');
  T.admha = await login('hospital_admin1.ha@example.org');

  console.log('A. forecasts -> stock alerts, expiry scan');
  await step('forecast run (WEEK + MONTH) loaded, alerts evaluated', async () => { await must('forecast', call(T.sa, 'POST', '/forecasts/runs', {})); });
  await step('near-expiry scan', async () => { await must('scan', call(T.sa, 'POST', '/jobs/near-expiry', {})); });
  const al = await q(`SELECT h.code, a.severity::text, count(*)::int c FROM stock_alert a JOIN hospital h ON h.id = a.hospital_id WHERE a.status = 'OPEN' AND a.type = 'LOW_STOCK' GROUP BY 1, 2 ORDER BY 1, 2`);
  console.log('     open LOW_STOCK alerts:', al.map((r) => `${r.code}/${r.severity}=${r.c}`).join(' '));

  console.log('B. borrow requests');
  const manual = async (code: string, lender: string, idx: number, qty: number): Promise<string | null> => {
    const rows = await q(
      `SELECT dm.id FROM drug_master dm
         JOIN hospital_drug b ON b.drug_master_id = dm.id AND b.active JOIN hospital hb ON hb.id = b.hospital_id AND hb.code = $1
         JOIN hospital_drug l ON l.drug_master_id = dm.id AND l.active JOIN hospital hl ON hl.id = l.hospital_id AND hl.code = $2
        WHERE NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled AND l.ved IN ('V','E')
          AND (SELECT COALESCE(sum(qty_on_hand - qty_held), 0) FROM stock_lot WHERE hospital_drug_id = l.id AND expiry_date > current_date + 60) > $3 * 8
          AND NOT EXISTS (SELECT 1 FROM stock_ledger sl JOIN stock_lot x ON x.id = sl.lot_id WHERE x.hospital_drug_id IN (b.id, l.id) AND sl.ref_type = 'DEMO_SPIKE')
          AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
                           WHERE br.borrower_hospital_id = b.hospital_id AND i.drug_master_id = dm.id AND br.status::text NOT IN ('FULFILLED','CLOSED_UNFULFILLED','CANCELLED'))
        ORDER BY md5(dm.id::text || $4::text) LIMIT 1`,
      [code.toUpperCase(), lender.toUpperCase(), qty, String(idx)],
    );
    if (!rows[0]) { skip(`manual ${code}<-${lender}: no drug with enough lender stock`); return null; }
    const c = await must('create manual', call(T['ph' + code], 'POST', '/borrow-requests', { context: 'MANUAL', items: [{ drugMasterId: rows[0].id, qtyRequested: qty }], reason: `DEMO: ${code.toUpperCase()} ขอยืมจาก ${lender.toUpperCase()}` }));
    await must('propose', call(T['ph' + code], 'POST', `/borrow-requests/${c.id}/propose`, {}));
    const pr = await must('detail', call(T['ph' + code], 'GET', `/borrow-requests/${c.id}`));
    const ladder = pr.data.proposal?.ladder as any[] | undefined;
    const e = ladder?.find((x) => x.code === lender.toUpperCase() && x.lendable > 0);
    if (!e) { skip(`manual ${code}<-${lender}: lender not in ladder`); return c.id; }
    const r = await call(T['ph' + code], 'PATCH', `/borrow-requests/${c.id}/ladder`, { legs: [{ hospitalId: e.hospitalId, qty: Math.min(qty, e.lendable) }] });
    if (r.status >= 300) skip(`manual ${code}<-${lender}: ladder edit ${r.status} ${r.json?.title ?? ''}`);
    return c.id;
  };
  const fresh = async (id: string) => (await must('detail', call(T.sa, 'GET', `/borrow-requests/${id}`))).data;

  // --- HA is the borrower (HB / HC lend). Alerts ordered by urgency.
  let r0: any = null;
  await step('HA R0 very urgent: lender accepted, loaded, departed, ARRIVED -> HA warehouse must receive', async () => {
    r0 = await newRequest('HA', 0, ['HB']); if (!r0) throw new Error('no request');
    const legs = await approve('ha', r0.id); await accept(legs[0]); await load(legs[0]); await depart(legs[0]); await arrive(legs[0]);
  });
  await step('HA R1: lender accepted -> waiting for the lender warehouse to load', async () => {
    const r = await newRequest('HA', 1, ['HB']); if (!r) throw new Error('no request');
    const legs = await approve('ha', r.id); await accept(legs[0]);
  });
  await step('HA R2: HC asked, answer pending in the HC queue', async () => {
    const r = await newRequest('HA', 2, ['HC']); if (!r) throw new Error('no request');
    await approve('ha', r.id);
  });
  await step('HA R3: lender rejected with a reason (HA pharmacist follows up)', async () => {
    const r = await newRequest('HA', 3, ['HB']); if (!r) throw new Error('no request');
    const legs = await approve('ha', r.id);
    await must('reject', call(T['ph' + lenderOf(legs[0])], 'POST', `/borrow-legs/${legs[0].id}/respond`, { decision: 'REJECT', reason: 'DEMO: สต็อกสำรองสำหรับห้องฉุกเฉิน ให้ไม่ได้ช่วงนี้' }));
  });
  await step('HA R4: proposal waiting for the HA pharmacist to approve', async () => { const r = await newRequest('HA', 4, ['HB']); if (!r) throw new Error('no request'); });
  await step('HA R5: draft (created, not proposed yet)', async () => {
    const rows = await q(`SELECT dm.id FROM drug_master dm JOIN hospital_drug b ON b.drug_master_id = dm.id AND b.active JOIN hospital hb ON hb.id = b.hospital_id AND hb.code = 'HA'
      WHERE NOT dm.is_blood_product AND NOT dm.is_controlled AND NOT dm.is_cold_chain AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id WHERE br.borrower_hospital_id = b.hospital_id AND i.drug_master_id = dm.id AND br.status::text NOT IN ('FULFILLED','CLOSED_UNFULFILLED','CANCELLED'))
      ORDER BY md5(dm.id::text || 'draft') LIMIT 1`);
    await must('draft', call(T.phha, 'POST', '/borrow-requests', { context: 'MANUAL', items: [{ drugMasterId: rows[0].id, qtyRequested: 15 }], reason: 'DEMO: ฉบับร่าง ยังไม่ได้ส่ง' }));
  });

  // --- HB / HC borrow from HA (HA is the lender: lender queue, warehouse loading, driver)
  await step('HB manual request: HA accepted, loaded, departed -> HA driver must confirm ARRIVED', async () => {
    const id = await manual('hb', 'ha', 20, 25); if (!id) throw new Error('no request');
    const legs = await approve('hb', id); await accept(legs[0]); await load(legs[0]); await depart(legs[0]);
  });
  await step('HB manual request 2: HA accepted, loaded -> HA driver must depart', async () => {
    const id = await manual('hb', 'ha', 21, 20); if (!id) throw new Error('no request');
    const legs = await approve('hb', id); await accept(legs[0]); await load(legs[0]);
  });
  await step('HC manual request: HA accepted -> HA warehouse must load', async () => {
    const id = await manual('hc', 'ha', 22, 30); if (!id) throw new Error('no request');
    const legs = await approve('hc', id); await accept(legs[0]);
  });
  await step('HB / HC requests from their alerts: approved, waiting in lender queues', async () => {
    for (const c of ['HB', 'HC']) { const r = await newRequest(c, 0, []); if (r) await approve(c.toLowerCase(), r.id); }
  });
  for (const [i, code] of [[0, 'hb'], [1, 'hc'], [2, 'hd']] as const) {
    await step(`${code.toUpperCase()} manual request: waiting in the HA lender queue`, async () => {
      const id = await manual(code, 'ha', i, 40 + 10 * i); if (!id) throw new Error('no request');
      await approve(code, id);
    });
  }
  // completed flows: HA received goods -> return obligation, made overdue below
  for (const [i, lender] of [[10, 'hb'], [11, 'hc']] as const) {
    await step(`HA manual request from ${lender.toUpperCase()}: delivered and received (return obligation)`, async () => {
      const id = await manual('ha', lender, i, 30); if (!id) throw new Error('no request');
      const legs = await approve('ha', id); await accept(legs[0]); await load(legs[0]); await depart(legs[0]); await arrive(legs[0]);
      const tk = await taskOfLeg(legs[0].id);
      void tk;
      await must('receive', call(T.whha, 'POST', `/borrow-legs/${legs[0].id}/receive`, {}));
    });
  }
  await step('return obligations of HA made overdue (due 3 / 8 days ago)', async () => {
    const rows = await q(`SELECT ro.id FROM return_obligation ro WHERE ro.status = 'OPEN' AND ro.debtor_hospital_id = $1 AND ro.due_date > current_date ORDER BY ro.due_date DESC LIMIT 2`, [H.HA]);
    if (!rows.length) throw new Error('no open obligations of HA');
    let d = 3;
    for (const r of rows) { await q(`UPDATE return_obligation SET due_date = current_date - $2::int, status = 'OVERDUE' WHERE id = $1`, [r.id, d]); d += 5; }
  });
  await step('borrow timers job', async () => { await must('timers', call(T.sa, 'POST', '/jobs/borrow-timers', {})); });

  console.log('C. near-expiry lots (pharmacist HA decides, the Agent matches)');
  const items = await q(`SELECT ne.id, sl.lot_no, ne.version FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id WHERE sl.lot_no LIKE 'DEMO-NE-HA%' ORDER BY sl.expiry_date`);
  console.log('     items:', items.map((i) => i.lot_no).join(' '));
  const byLot = (n: string) => items.find((i) => i.lot_no === n);
  const agentPlan = async (itemId: string, lines: { code: string; qty: number }[], origin = 'HA', approval: 'manual' | 'auto' = 'auto'): Promise<string | null> => {
    const pe = (await q(`SELECT id, qty_available::float8 q FROM pool_entry WHERE near_expiry_item_id = $1 ORDER BY released_at DESC LIMIT 1`, [itemId]))[0];
    if (!pe) throw new Error('no pool entry');
    const run = (await q(`INSERT INTO agent_run (agent, task, ref_type, ref_id, hospital_id, status, input_hash, input, output) VALUES ('F2_AGENT','F2_MATCH','pool_entry',$1::uuid,$2,'OK',md5($1::text),'{}','{}') RETURNING id`, [pe.id, H[origin]]))[0];
    const scale = pe.q;
    const was = (await q(`SELECT value FROM config_setting WHERE key = 'network.auto_approve' AND scope = 'GLOBAL'`))[0]?.value;
    if (approval === 'manual') await q(`UPDATE config_setting SET value = 'false'::jsonb WHERE key = 'network.auto_approve' AND scope = 'GLOBAL'`);
    try {
      const out = await withTransaction((c) => createPlanFromAgentProposal(c, pe.id, { agentRunId: run.id, lines: lines.map((l) => ({ receiverHospitalId: H[l.code], qty: Math.max(1, Math.floor(scale * l.qty)) })) }));
      return out ? out.planId : null;
    } finally {
      if (approval === 'manual' && was !== undefined) await q(`UPDATE config_setting SET value = $1::jsonb WHERE key = 'network.auto_approve' AND scope = 'GLOBAL'`, [JSON.stringify(was)]);
    }
  };
  await step('HA1 (18 d) released -> Agent plan waiting for the pharmacist', async () => {
    const it = byLot('DEMO-NE-HA1'); if (!it) throw new Error('item missing (scan found nothing?)');
    await must('release', call(T.phha, 'POST', `/near-expiry/${it.id}/release`, {}));
    if (!(await agentPlan(it.id, [{ code: 'HB', qty: 0.5 }, { code: 'HC', qty: 0.3 }], 'HA', 'manual'))) throw new Error('plan not created');
  });
  await step('HA2 (33 d) released, no match yet -> waiting for the Agent', async () => {
    const it = byLot('DEMO-NE-HA2'); if (!it) throw new Error('item missing');
    await must('release', call(T.phha, 'POST', `/near-expiry/${it.id}/release`, {}));
  });
  await step('HA3 (47 d) kept (review later)', async () => {
    const it = byLot('DEMO-NE-HA3'); if (!it) throw new Error('item missing');
    await must('keep', call(T.phha, 'POST', `/near-expiry/${it.id}/keep`, { reason: 'DEMO: ยังมีอัตราใช้ต่อเนื่อง ขอเก็บไว้ใช้เอง ทบทวนอีกครั้งใน 30 วัน' }));
  });
  await step('HB1 released by the HB pharmacist, Agent plan auto-approved -> goods on the way to HA / HC', async () => {
    const it = (await q(`SELECT ne.id FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id WHERE sl.lot_no = 'DEMO-NE-HB1'`))[0]; if (!it) throw new Error('item missing');
    await must('release', call(T.phhb, 'POST', `/near-expiry/${it.id}/release`, {}));
    if (!(await agentPlan(it.id, [{ code: 'HA', qty: 0.5 }, { code: 'HC', qty: 0.3 }], 'HB', 'auto'))) throw new Error('plan not created');
  });
  console.log('     HA4 / HA5 and the HB + HC lots stay DETECTED (waiting for the pharmacist)');

  console.log('D. ER incidents (HA)');
  const idOf = (j: any) => j?.data?.id ?? j?.id;
  const mkIncident = async (type: string, text: string, counts: Record<string, number>, eta: number, lat: number, lon: number) =>
    idOf(await must('incident', call(T.erha, 'POST', '/incidents', { incidentType: type, description: text, locationText: text, locationLat: lat, locationLon: lon, counts, reportedEtaMin: eta, acknowledgeDuplicate: true })));
  const planAndApprove = async (id: string) => {
    const p = await must('plan', call(T.erha, 'POST', `/incidents/${id}/plan`, {}));
    const planId = p.data?.plan?.id ?? p.data?.planId ?? p.data?.id;
    await must('approve plan', call(T.erha, 'POST', `/incidents/${id}/plan/approve`, { planId }));
  };
  await step('incident 1: bus crash, plan approved, kits borrowed from neighbours, one lender confirmed', async () => {
    const id = await mkIncident('อุบัติเหตุรถโดยสาร', 'ถนนมิตรภาพ กม.24 รถโดยสารชนท้ายรถบรรทุก', { RED: 3, YELLOW: 8, GREEN: 15, BLACK: 0, UNKNOWN: 2 }, 35, 16.4, 102.8);
    await planAndApprove(id);
    const sent = await must('send', call(T.erha, 'POST', `/incidents/${id}/emergency-borrow`, {}));
    console.log('     emergency-borrow sentLegs:', sent.data?.sentLegs, 'requests:', sent.data?.created?.length);
    let confirmed = 0;
    for (const c of ['hb', 'hc', 'hd', 'he']) {
      const list = ((await must('legs', call(T['wh' + c], 'GET', '/emergency-legs?status=pending'))).items ?? []) as any[];
      const first = list.find((l) => l.status === 'SENT');
      if (first) { await must('confirm', call(T['wh' + c], 'POST', `/emergency-legs/${first.id}/confirm`, { decision: 'CONFIRM' })); confirmed += 1; break; }
    }
    if (!confirmed) throw new Error('no lender had a SENT emergency leg');
  });
  await step('incident 2: chemical leak reported, plan waiting for approval', async () => {
    const id = await mkIncident('เหตุสารเคมีรั่ว', 'นิคมอุตสาหกรรม โรงงานสารเคมีรั่ว', { RED: 2, YELLOW: 6, GREEN: 12, BLACK: 0, UNKNOWN: 0 }, 50, 16.6, 102.6);
    await must('plan', call(T.erha, 'POST', `/incidents/${id}/plan`, {}));
  });

  console.log('\nWhat each role finds (via the API)');
  const n = async (who: string, path: string, pick: (j: any) => unknown) => { const r = await call(T[who], 'GET', path); return r.status < 300 ? pick(r.json) : `HTTP ${r.status}`; };
  const rows = [
    ['pharmacist HA  alerts open', await n('phha', '/alerts?status=OPEN&limit=200', (j) => j.items?.length)],
    ['pharmacist HA  borrow requests', await n('phha', '/borrow-requests?status=pending&limit=200', (j) => j.items?.length)],
    ['pharmacist HA  lender queue', await n('phha', '/lender-queue?limit=200', (j) => j.items?.length)],
    ['pharmacist HA  near-expiry', await n('phha', '/near-expiry?limit=200', (j) => j.items?.length)],
    ['pharmacist HA  allocation plans', await n('phha', '/allocation-plans?limit=200', (j) => j.items?.length)],
    ['pharmacist HA  return obligations', await n('phha', '/return-obligations?limit=200', (j) => j.items?.length)],
    ['warehouse HA   transport tasks', await n('whha', '/transport-tasks?limit=200', (j) => j.items?.length)],
    ['warehouse HA   kit tasks', await n('whha', '/kit-tasks?limit=200', (j) => j.items?.length)],
    ['driver HA      transport tasks', await n('drha', '/transport-tasks?limit=200', (j) => j.items?.length)],
    ['ER HA          incidents', await n('erha', '/incidents?limit=200', (j) => j.items?.length)],
  ];
  for (const [k, v] of rows) console.log(`    ${String(k).padEnd(36)} ${v}`);
}
main().then(() => { console.log(`\ndone ${done.length}, skipped ${warn.length}`); return db.end(); }).catch((e) => { console.error(e); process.exit(1); });
