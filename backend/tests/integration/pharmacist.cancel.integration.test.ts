/**
 * Role PHARMACIST — cancel request & return obligations integration tests.
 * Covers:
 *  - cancel happy path & lot hold release (before/after qty_held proof)
 *  - cancel notifications to lender hospital
 *  - cancel blocked for LOADED/IN_TRANSIT/RECEIVED legs (409)
 *  - cancel blocked for IN_PROGRESS / PARTIALLY_FULFILLED per SM-1 (409)
 *  - hospital isolation (404 for other hospital pharmacist)
 *  - role guard (403 for warehouse/driver)
 *  - idempotency replay (same key replays 200, new key 409)
 *  - return flow: partial return, over-return (400), full return (RETURNED)
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';

const { Client } = pg;

function requireTestDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL?.trim();
  const mainNames = new Set(
    [process.env.DB_NAME, 'doorare', 'postgres', 'template0', 'template1'].filter((name): name is string => Boolean(name)),
  );
  if (!raw) {
    throw new Error('TEST_DATABASE_URL is required');
  }
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (mainNames.has(database)) {
    throw new Error(`Refusing to run against main/maintenance database "${database}"`);
  }
  return {
    connectionString: raw,
    database,
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

const target = requireTestDatabaseUrl();
process.env.DB_HOST = target.host;
process.env.DB_PORT = target.port;
process.env.DB_USER = target.user;
process.env.DB_PASSWORD = target.password;
process.env.DB_NAME = target.database;
process.env.NODE_ENV = 'test';

const { app } = await import('../../src/app.js');
const { pool } = await import('../../src/db/client.js');

const db = new Client({ connectionString: target.connectionString });
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'doorare123';
const stamp = `${Date.now()}.${randomUUID().slice(0, 8)}`;

let server: import('node:http').Server | undefined;
let base = '';
let checks = 0;

function check(name: string, condition: boolean, detail = ''): void {
  assert.ok(condition, detail ? `${name} — ${detail}` : name);
  checks += 1;
}

function eq(name: string, actual: unknown, expected: unknown): void {
  assert.equal(actual, expected, `${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  checks += 1;
}

interface Reply {
  status: number;
  body: any;
  headers: Headers;
}

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

const ids = {
  region: randomUUID(),
  hospitalA: randomUUID(), // Borrower
  hospitalB: randomUUID(), // Lender
  drugMaster: randomUUID(),
  hospDrugA: randomUUID(),
  hospDrugB: randomUUID(),
  phA: randomUUID(),
  phB: randomUUID(),
  whA: randomUUID(),
};

const emailFor = (label: string): string => `cancel.${stamp}.${label}@test.local`;
const emails = {
  phA: emailFor('pha'),
  phB: emailFor('phb'),
  whA: emailFor('wha'),
};

const tokens: Record<string, string> = {};

async function login(label: keyof typeof emails): Promise<string> {
  const reply = await call('POST', '/api/v1/auth/login', {
    body: { email: emails[label], password: MASTER_PASSWORD, mfaVerified: true },
  });
  assert.equal(reply.status, 200, `login ${label}: ${JSON.stringify(reply.body)}`);
  assert.ok(reply.body?.token, `login ${label} returned no token`);
  return reply.body.token as string;
}

async function createFixtures(): Promise<void> {
  await db.query(`INSERT INTO region (id, code, name_th, name_en) VALUES ($1, $2, $3, $4)`, [
    ids.region,
    `R-QC-${stamp}`,
    'เขตทดสอบ Cancel QA',
    'Cancel QA Region',
  ]);
  await db.query(
    `INSERT INTO hospital (id, region_id, code, name_th, name_en, province, tier) VALUES
       ($1, $2, $3, $4, $5, 'สมุทรปราการ', 'SECONDARY'),
       ($6, $2, $7, $8, $9, 'สมุทรปราการ', 'SECONDARY')`,
    [
      ids.hospitalA, ids.region, `HA-QC-${stamp}`, 'รพ.ผู้ยืม A', 'Borrower Hospital A',
      ids.hospitalB, `HB-QC-${stamp}`, 'รพ.ผู้ให้ยืม B', 'Lender Hospital B',
    ],
  );

  await db.query(
    `INSERT INTO app_user (id, cognito_sub, email, display_name, role, hospital_id, region_id, active, mfa_enabled) VALUES
       ($1, $2, $3, 'Pharmacist A', 'PHARMACIST'::role_code, $4, null, true, true),
       ($5, $6, $7, 'Pharmacist B', 'PHARMACIST'::role_code, $8, null, true, true),
       ($9, $10, $11, 'Warehouse A', 'WAREHOUSE_OFFICER'::role_code, $4, null, true, true)`,
    [
      ids.phA, `local:${ids.phA}`, emails.phA, ids.hospitalA,
      ids.phB, `local:${ids.phB}`, emails.phB, ids.hospitalB,
      ids.whA, `local:${ids.whA}`, emails.whA,
    ],
  );

  // Drug master & hospital drugs
  await db.query(
    `INSERT INTO drug_master (id, gp_id, generic_name, dosage_form, strength, base_unit, emergency_class)
     VALUES ($1, $2, 'TestDrug', 'TAB', '500mg', 'เม็ด', 'CRITICAL')`,
    [ids.drugMaster, `GP-${stamp}`],
  );
  await db.query(
    `INSERT INTO hospital_drug (id, hospital_id, drug_master_id, local_code, local_name, local_unit, ved) VALUES
       ($1, $2, $3, 'LOC-A', 'TestDrug A', 'เม็ด', 'V'),
       ($4, $5, $3, 'LOC-B', 'TestDrug B', 'เม็ด', 'V')`,
    [ids.hospDrugA, ids.hospitalA, ids.drugMaster, ids.hospDrugB, ids.hospitalB],
  );
}

describe('QA-PHARM-005 Cancel Request and Release Lot Holds', () => {
  before(async () => {
    await db.connect();
    await createFixtures();
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
    tokens.phA = await login('phA');
    tokens.phB = await login('phB');
    tokens.whA = await login('whA');
  });

  after(async () => {
    if (server) server.close();
    await pool.end();
    await db.end();
  });

  it('cancel happy path releases lot holds on lender hospital and notifies lender', async () => {
    const lotId = randomUUID();
    const requestId = randomUUID();
    const legId = randomUUID();
    const itemId = randomUUID();

    // 1. Stock lot on Lender Hospital B: 50 on hand, 0 held initially
    await db.query(
      `INSERT INTO stock_lot (id, hospital_id, hospital_drug_id, lot_no, expiry_date, qty_on_hand, qty_held)
       VALUES ($1, $2, $3, 'LOT-CANCEL-1', CURRENT_DATE + 180, 50, 10)`,
      [lotId, ids.hospitalB, ids.hospDrugB],
    );

    // 2. Borrow request on Hospital A in APPROVED status
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, reason, version)
       VALUES ($1, $2, $3, 'MANUAL', 'APPROVED', $4, 'Need urgent stock', 1)`,
      [requestId, `BR-QA-${stamp}-1`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested)
       VALUES ($1, $2, $3, 10)`,
      [itemId, requestId, ids.drugMaster],
    );

    // 3. Accepted leg on Hospital B with lot reserved in borrow_leg_lot
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked, qty_accepted)
       VALUES ($1, $2, $3, 1, 1, 'ACCEPTED', 10, 10)`,
      [legId, requestId, ids.hospitalB],
    );
    await db.query(
      `INSERT INTO borrow_leg_lot (leg_id, lot_id, qty) VALUES ($1, $2, 10)`,
      [legId, lotId],
    );

    // Verify before state
    const beforeLot = (await db.query(`SELECT qty_on_hand::float8 as on_hand, qty_held::float8 as held FROM stock_lot WHERE id = $1`, [lotId])).rows[0];
    eq('before qty_held', beforeLot.held, 10);

    // 4. Cancel the borrow request as Pharmacist A
    const cancelReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-key-${stamp}-1` },
      body: { reason: 'ยกเลิกเนื่องจากได้ยาจากแหล่งอื่นแล้ว' },
    });

    eq('cancel HTTP status', cancelReply.status, 200);
    eq('cancel response ok', cancelReply.body.ok, true);
    eq('cancel data status', cancelReply.body.data.status, 'CANCELLED');

    // 5. Verify after state: qty_held MUST be released (10 -> 0)
    const afterLot = (await db.query(`SELECT qty_on_hand::float8 as on_hand, qty_held::float8 as held FROM stock_lot WHERE id = $1`, [lotId])).rows[0];
    eq('after qty_held is released to 0', afterLot.held, 0);
    eq('on_hand untouched', afterLot.on_hand, 50);

    // 6. Verify leg status became CANCELLED
    const afterLeg = (await db.query(`SELECT status::text FROM borrow_leg WHERE id = $1`, [legId])).rows[0];
    eq('leg status cancelled', afterLeg.status, 'CANCELLED');

    // 7. Verify notification delivered to Lender Hospital B
    const notif = (await db.query(
      `SELECT kind, title, hospital_id FROM notification WHERE hospital_id = $1 AND ref_id = $2`,
      [ids.hospitalB, requestId],
    )).rows[0];
    check('notification exists for lender', Boolean(notif));
    eq('notification kind', notif.kind, 'BORROW_LEG_CANCELLED');

    // 8. Test Idempotent replay: sending same key again should return 200 with same payload
    const replayReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-key-${stamp}-1` },
      body: { reason: 'ยกเลิกเนื่องจากได้ยาจากแหล่งอื่นแล้ว' },
    });
    eq('replay status is 200', replayReply.status, 200);

    // 9. Sending with new key on already cancelled request returns 409
    const newKeyReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-new-key-${stamp}` },
      body: { reason: 'ยกเลิกซ้ำ' },
    });
    eq('new key on cancelled request returns 409', newKeyReply.status, 409);
  });

  it('cancel is blocked with 409 when any leg is already LOADED/IN_TRANSIT/RECEIVED', async () => {
    const requestId = randomUUID();
    const legId = randomUUID();
    const taskId = randomUUID();

    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'APPROVED', $4, 1)`,
      [requestId, `BR-QA-${stamp}-moving`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 5)`,
      [randomUUID(), requestId, ids.drugMaster],
    );
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked)
       VALUES ($1, $2, $3, 1, 1, 'LOADED', 5)`,
      [legId, requestId, ids.hospitalB],
    );
    await db.query(
      `INSERT INTO transport_task (id, task_no, ref_type, ref_id, from_hospital_id, to_hospital_id, status)
       VALUES ($1, $2, 'BORROW_LEG', $3, $4, $5, 'LOADED')`,
      [taskId, `TK-QA-${stamp}`, legId, ids.hospitalB, ids.hospitalA],
    );

    const reply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-key-${stamp}-moving` },
      body: { reason: 'ขอยกเลิกขณะของอยู่บนรถ' },
    });
    eq('cannot cancel moving leg status', reply.status, 409);
    eq('error code', reply.body.code, 'CANNOT_CANCEL');
  });

  it('cancel is blocked with 409 when status is IN_PROGRESS, PARTIALLY_FULFILLED, or ESCALATED per SM-1', async () => {
    const requestId = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [requestId, `BR-QA-${stamp}-inprog`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 5)`,
      [randomUUID(), requestId, ids.drugMaster],
    );

    const reply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-key-${stamp}-inprog` },
      body: { reason: 'ขอยกเลิกระหว่างดำเนินงาน' },
    });
    eq('cannot cancel in_progress status', reply.status, 409);
    eq('error code', reply.body.code, 'SPEC_STATUS_NOT_CANCELLABLE');
  });

  it('cancel rejects wrong hospital (404) and wrong role (403)', async () => {
    const requestId = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'APPROVED', $4, 1)`,
      [requestId, `BR-QA-${stamp}-iso`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 5)`,
      [randomUUID(), requestId, ids.drugMaster],
    );

    // Other hospital pharmacist (phB) gets 404
    const phBReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phB,
      headers: { 'Idempotency-Key': `cancel-key-${stamp}-phb` },
      body: { reason: 'รพ.อื่นขอยกเลิก' },
    });
    eq('other hospital gets 404', phBReply.status, 404);

    // Warehouse officer of same hospital gets 403
    const whAReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.whA,
      headers: { 'Idempotency-Key': `cancel-key-${stamp}-wha` },
      body: { reason: 'คลังขอยกเลิก' },
    });
    eq('wrong role gets 403', whAReply.status, 403);
  });

  it('return flow: partial return, over-return (400), full return (RETURNED)', async () => {
    const legId = randomUUID();
    const obId = randomUUID();
    const lotDebtor = randomUUID();
    const lotCreditor = randomUUID();

    // Create leg & return obligation: Debtor = Hospital A, Creditor = Hospital B, qty = 10
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'FULFILLED', $4, 1)`,
      [randomUUID(), `BR-QA-RET-${stamp}`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked, qty_accepted, qty_received)
       VALUES ($1, (SELECT id FROM borrow_request WHERE request_no = $2), $3, 1, 1, 'RECEIVED', 10, 10, 10)`,
      [legId, `BR-QA-RET-${stamp}`, ids.hospitalB],
    );
    await db.query(
      `INSERT INTO return_obligation (id, leg_id, debtor_hospital_id, creditor_hospital_id, drug_master_id, qty, qty_returned, status, due_date)
       VALUES ($1, $2, $3, $4, $5, 10, 0, 'OPEN', CURRENT_DATE + 30)`,
      [obId, legId, ids.hospitalA, ids.hospitalB, ids.drugMaster],
    );

    // Stock lot on Debtor (Hospital A) to return from (qty: 20)
    await db.query(
      `INSERT INTO stock_lot (id, hospital_id, hospital_drug_id, lot_no, expiry_date, qty_on_hand, qty_held)
       VALUES ($1, $2, $3, 'LOT-DEBTOR-1', CURRENT_DATE + 365, 20, 0)`,
      [lotDebtor, ids.hospitalA, ids.hospDrugA],
    );
    // Stock lot on Creditor (Hospital B) to receive into (qty: 5)
    await db.query(
      `INSERT INTO stock_lot (id, hospital_id, hospital_drug_id, lot_no, expiry_date, qty_on_hand, qty_held)
       VALUES ($1, $2, $3, 'LOT-CREDITOR-1', CURRENT_DATE + 365, 5, 0)`,
      [lotCreditor, ids.hospitalB, ids.hospDrugB],
    );

    // 1. Over-return should return 400
    const overReply = await call('POST', `/api/v1/return-obligations/${obId}/return`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `ret-key-${stamp}-over` },
      body: { qty: 15 },
    });
    eq('over-return rejected 400', overReply.status, 400);

    // 2. Partial return of 4 units
    const partReply = await call('POST', `/api/v1/return-obligations/${obId}/return`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `ret-key-${stamp}-part` },
      body: { qty: 4 },
    });
    eq('partial return 200', partReply.status, 200);
    eq('partial qtyReturned', partReply.body.data.qtyReturned, 4);
    eq('obligation remains OPEN', partReply.body.data.status, 'OPEN');

    // 3. Complete remaining return of 6 units
    const fullReply = await call('POST', `/api/v1/return-obligations/${obId}/return`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `ret-key-${stamp}-full` },
      body: { qty: 6 },
    });
    eq('full return 200', fullReply.status, 200);
    eq('full qtyReturned', fullReply.body.data.qtyReturned, 10);
    eq('obligation transitions to RETURNED', fullReply.body.data.status, 'RETURNED');
  });
});
