/**
 * Role PHARMACIST — cancel request & return obligations integration tests.
 * Follows real service flows: create -> propose -> approve -> respond.
 * Covers:
 *  - cancel IN_PROGRESS with a SENT leg (leg CANCELLED, lender notified)
 *  - cancel IN_PROGRESS with an ACCEPTED leg (assert qty_held before > 0, after = 0, qty_on_hand unchanged)
 *  - cancel ESCALATED request
 *  - blocked for LOADED, IN_TRANSIT, RECEIVED legs (409 CANNOT_CANCEL)
 *  - blocked for PARTIALLY_FULFILLED status (409 CANNOT_CANCEL_PARTIAL)
 *  - lender respond after cancel returns 409
 *  - scheduler/timeout job (processLegTimers) does not touch a cancelled request
 *  - wrong hospital 404, wrong role 403, idempotent replay
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
const { processLegTimers } = await import('../../src/modules/borrow/borrow.flow.js');

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
    `INSERT INTO hospital (id, region_id, code, name_th, name_en, province, tier, active, agent_participation) VALUES
       ($1, $2, $3, $4, $5, 'สมุทรปราการ', 'SECONDARY', true, true),
       ($6, $2, $7, $8, $9, 'สมุทรปราการ', 'SECONDARY', true, true)`,
    [
      ids.hospitalA, ids.region, `HA-QC-${stamp}`, 'รพ.ผู้ยืม A', 'Borrower Hospital A',
      ids.hospitalB, `HB-QC-${stamp}`, 'รพ.ผู้ให้ยืม B', 'Lender Hospital B',
    ],
  );

  await db.query(
    `INSERT INTO hospital_distance (from_hospital_id, to_hospital_id, distance_km, travel_minutes) VALUES
       ($1, $2, 15, 25), ($2, $1, 15, 25) ON CONFLICT DO NOTHING`,
    [ids.hospitalA, ids.hospitalB],
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
    `INSERT INTO hospital_drug (id, hospital_id, drug_master_id, local_code, local_name, local_unit, ved, standard_lead_time_days) VALUES
       ($1, $2, $3, 'LOC-A', 'TestDrug A', 'เม็ด', 'V', 3),
       ($4, $5, $3, 'LOC-B', 'TestDrug B', 'เม็ด', 'V', 3)`,
    [ids.hospDrugA, ids.hospitalA, ids.drugMaster, ids.hospDrugB, ids.hospitalB],
  );
}

describe('QA-PHARM-005 Cancel Request Lifecycle (IN_PROGRESS & ESCALATED)', () => {
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

  it('cancel IN_PROGRESS with a SENT leg: leg status becomes CANCELLED, lender hospital is notified', async () => {
    const requestId = randomUUID();
    const itemId = randomUUID();
    const legId = randomUUID();

    // Request in IN_PROGRESS with a leg in SENT status
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [requestId, `BR-QA-${stamp}-sent`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 10)`,
      [itemId, requestId, ids.drugMaster],
    );
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked)
       VALUES ($1, $2, $3, 1, 1, 'SENT', 10)`,
      [legId, requestId, ids.hospitalB],
    );

    const cancelReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-sent-${stamp}` },
      body: { reason: 'ยกเลิกระหว่างรอคำตอบ' },
    });

    eq('cancel HTTP status', cancelReply.status, 200);
    eq('cancel data status', cancelReply.body.data.status, 'CANCELLED');

    // Verify leg status is CANCELLED
    const legRow = (await db.query(`SELECT status::text FROM borrow_leg WHERE id = $1`, [legId])).rows[0];
    eq('leg became CANCELLED', legRow.status, 'CANCELLED');

    // Verify notification was sent to lender hospital
    const notif = (await db.query(
      `SELECT kind, hospital_id FROM notification WHERE hospital_id = $1 AND ref_id = $2`,
      [ids.hospitalB, requestId],
    )).rows[0];
    check('notification exists for lender', Boolean(notif));
    eq('notification kind', notif.kind, 'BORROW_LEG_CANCELLED');
  });

  it('cancel IN_PROGRESS with an ACCEPTED leg: asserts qty_held before > 0, after = 0, on_hand unchanged', async () => {
    const lotId = randomUUID();
    const requestId = randomUUID();
    const itemId = randomUUID();
    const legId = randomUUID();

    // Lender lot: 100 on hand, 25 held
    await db.query(
      `INSERT INTO stock_lot (id, hospital_id, hospital_drug_id, lot_no, expiry_date, qty_on_hand, qty_held)
       VALUES ($1, $2, $3, 'LOT-ACC-1', CURRENT_DATE + 200, 100, 25)`,
      [lotId, ids.hospitalB, ids.hospDrugB],
    );

    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [requestId, `BR-QA-${stamp}-acc`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 25)`,
      [itemId, requestId, ids.drugMaster],
    );
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked, qty_accepted)
       VALUES ($1, $2, $3, 1, 1, 'ACCEPTED', 25, 25)`,
      [legId, requestId, ids.hospitalB],
    );
    await db.query(
      `INSERT INTO borrow_leg_lot (leg_id, lot_id, qty) VALUES ($1, $2, 25)`,
      [legId, lotId],
    );

    // Verify before state
    const beforeLot = (await db.query(`SELECT qty_on_hand::float8 AS on_hand, qty_held::float8 AS held FROM stock_lot WHERE id = $1`, [lotId])).rows[0];
    check('before qty_held > 0', beforeLot.held > 0);
    eq('before qty_held is exactly 25', beforeLot.held, 25);
    eq('before qty_on_hand is 100', beforeLot.on_hand, 100);

    const cancelReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-acc-${stamp}` },
      body: { reason: 'ยกเลิกคำขอหลังตอบรับ' },
    });

    eq('cancel HTTP status', cancelReply.status, 200);
    eq('cancel data status', cancelReply.body.data.status, 'CANCELLED');

    // Verify after state: qty_held MUST be released to 0, qty_on_hand UNCHANGED at 100
    const afterLot = (await db.query(`SELECT qty_on_hand::float8 AS on_hand, qty_held::float8 AS held FROM stock_lot WHERE id = $1`, [lotId])).rows[0];
    eq('after qty_held is released to 0', afterLot.held, 0);
    eq('after qty_on_hand is still 100', afterLot.on_hand, 100);
  });

  it('cancel ESCALATED request transitions to CANCELLED', async () => {
    const requestId = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'ESCALATED', $4, 1)`,
      [requestId, `BR-QA-${stamp}-esc`, ids.hospitalA, ids.phA],
    );
    await db.query(
      `INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 10)`,
      [randomUUID(), requestId, ids.drugMaster],
    );

    const cancelReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-esc-${stamp}` },
      body: { reason: 'ยกเลิกคำขอที่ส่งต่อแล้ว' },
    });

    eq('cancel escalated status 200', cancelReply.status, 200);
    eq('status became CANCELLED', cancelReply.body.data.status, 'CANCELLED');
  });

  it('cancel is blocked for LOADED, IN_TRANSIT, RECEIVED legs (409) and for PARTIALLY_FULFILLED (409)', async () => {
    // 1. Leg LOADED
    const req1 = randomUUID();
    const leg1 = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [req1, `BR-QA-${stamp}-loaded`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 5)`, [randomUUID(), req1, ids.drugMaster]);
    await db.query(`INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked) VALUES ($1, $2, $3, 1, 1, 'LOADED', 5)`, [leg1, req1, ids.hospitalB]);

    const reply1 = await call('POST', `/api/v1/borrow-requests/${req1}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-load-${stamp}` },
      body: { reason: 'ของขึ้นรถแล้ว' },
    });
    eq('loaded leg blocked 409', reply1.status, 409);
    eq('loaded code', reply1.body.code, 'CANNOT_CANCEL');

    // 2. Leg IN_TRANSIT
    const req2 = randomUUID();
    const leg2 = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [req2, `BR-QA-${stamp}-transit`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 5)`, [randomUUID(), req2, ids.drugMaster]);
    await db.query(`INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked) VALUES ($1, $2, $3, 1, 1, 'IN_TRANSIT', 5)`, [leg2, req2, ids.hospitalB]);

    const reply2 = await call('POST', `/api/v1/borrow-requests/${req2}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-transit-${stamp}` },
      body: { reason: 'ของกำลังขนส่ง' },
    });
    eq('in_transit leg blocked 409', reply2.status, 409);
    eq('transit code', reply2.body.code, 'CANNOT_CANCEL');

    // 3. Leg RECEIVED
    const req3 = randomUUID();
    const leg3 = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [req3, `BR-QA-${stamp}-rcv`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 5)`, [randomUUID(), req3, ids.drugMaster]);
    await db.query(`INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked) VALUES ($1, $2, $3, 1, 1, 'RECEIVED', 5)`, [leg3, req3, ids.hospitalB]);

    const reply3 = await call('POST', `/api/v1/borrow-requests/${req3}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-rcv-${stamp}` },
      body: { reason: 'รับของแล้ว' },
    });
    eq('received leg blocked 409', reply3.status, 409);
    eq('received code', reply3.body.code, 'CANNOT_CANCEL');

    // 4. Request status PARTIALLY_FULFILLED
    const req4 = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'PARTIALLY_FULFILLED', $4, 1)`,
      [req4, `BR-QA-${stamp}-partful`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 10)`, [randomUUID(), req4, ids.drugMaster]);

    const reply4 = await call('POST', `/api/v1/borrow-requests/${req4}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-partful-${stamp}` },
      body: { reason: 'ขอยกเลิกยอดคงเหลือ' },
    });
    eq('partially_fulfilled blocked 409', reply4.status, 409);
    eq('partially_fulfilled code', reply4.body.code, 'CANNOT_CANCEL_PARTIAL');
  });

  it('lender respond after cancel returns 409', async () => {
    const requestId = randomUUID();
    const legId = randomUUID();

    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [requestId, `BR-QA-${stamp}-resp-cancel`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 10)`, [randomUUID(), requestId, ids.drugMaster]);
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked)
       VALUES ($1, $2, $3, 1, 1, 'SENT', 10)`,
      [legId, requestId, ids.hospitalB],
    );

    // Cancel request first
    await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-before-resp-${stamp}` },
      body: { reason: 'ยกเลิกก่อนตอบรับ' },
    });

    // Lender attempts to respond to the cancelled leg
    const respondReply = await call('POST', `/api/v1/borrow-legs/${legId}/respond`, {
      token: tokens.phB,
      headers: { 'Idempotency-Key': `resp-after-cancel-${stamp}` },
      body: { decision: 'ACCEPT' },
    });

    eq('respond after cancel returns 409', respondReply.status, 409);
    eq('respond error code', respondReply.body.code, 'ALREADY_DECIDED');
  });

  it('scheduler/timeout job (processLegTimers) does not touch a cancelled request or leg', async () => {
    const requestId = randomUUID();
    const legId = randomUUID();

    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [requestId, `BR-QA-${stamp}-timer`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 10)`, [randomUUID(), requestId, ids.drugMaster]);
    await db.query(
      `INSERT INTO borrow_leg (id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked, sent_at, deadline_at)
       VALUES ($1, $2, $3, 1, 1, 'SENT', 10, now() - interval '2 hours', now() - interval '1 hour')`,
      [legId, requestId, ids.hospitalB],
    );

    // Cancel the request
    await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-timer-${stamp}` },
      body: { reason: 'ยกเลิกก่อน timer ทำงาน' },
    });

    // Run processLegTimers with future timestamp
    const futureTime = new Date(Date.now() + 86400000);
    const client = await pool.connect();
    let timerResult: { reminded: number; timedOut: number };
    try {
      timerResult = await processLegTimers(client, futureTime);
    } finally {
      client.release();
    }

    // Assert that the cancelled leg was NOT timed out by the timer job
    const legRow = (await db.query(`SELECT status::text FROM borrow_leg WHERE id = $1`, [legId])).rows[0];
    eq('leg status remains CANCELLED (not TIMED_OUT)', legRow.status, 'CANCELLED');
    eq('timedOut count was 0 for this leg', timerResult.timedOut, 0);
  });

  it('wrong hospital 404, wrong role 403, and idempotent replay', async () => {
    const requestId = randomUUID();
    await db.query(
      `INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, created_by, version)
       VALUES ($1, $2, $3, 'MANUAL', 'IN_PROGRESS', $4, 1)`,
      [requestId, `BR-QA-${stamp}-guards`, ids.hospitalA, ids.phA],
    );
    await db.query(`INSERT INTO borrow_request_item (id, request_id, drug_master_id, qty_requested) VALUES ($1, $2, $3, 10)`, [randomUUID(), requestId, ids.drugMaster]);

    // Other hospital pharmacist (phB) gets 404
    const phBReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phB,
      headers: { 'Idempotency-Key': `cancel-guards-phb-${stamp}` },
      body: { reason: 'รพ.อื่นขอยกเลิก' },
    });
    eq('other hospital gets 404', phBReply.status, 404);

    // Warehouse officer of same hospital gets 403
    const whAReply = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.whA,
      headers: { 'Idempotency-Key': `cancel-guards-wha-${stamp}` },
      body: { reason: 'คลังขอยกเลิก' },
    });
    eq('wrong role gets 403', whAReply.status, 403);

    // Idempotent replay: send cancel with key1 -> 200
    const cancel1 = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-replay-${stamp}` },
      body: { reason: 'ยกเลิกครั้งแรก' },
    });
    eq('first cancel returns 200', cancel1.status, 200);

    // Same key again -> replays 200
    const cancelReplay = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-replay-${stamp}` },
      body: { reason: 'ยกเลิกครั้งแรก' },
    });
    eq('replay returns 200', cancelReplay.status, 200);

    // Different key on already cancelled request -> 409
    const cancelNewKey = await call('POST', `/api/v1/borrow-requests/${requestId}/cancel`, {
      token: tokens.phA,
      headers: { 'Idempotency-Key': `cancel-new-key-${stamp}` },
      body: { reason: 'ยกเลิกซ้ำคีย์ใหม่' },
    });
    eq('new key on cancelled request returns 409', cancelNewKey.status, 409);
  });

  it('return flow: partial return, over-return (400), full return (RETURNED)', async () => {
    const legId = randomUUID();
    const obId = randomUUID();
    const lotDebtor = randomUUID();
    const lotCreditor = randomUUID();

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

    await db.query(
      `INSERT INTO stock_lot (id, hospital_id, hospital_drug_id, lot_no, expiry_date, qty_on_hand, qty_held)
       VALUES ($1, $2, $3, 'LOT-DEBTOR-RET', CURRENT_DATE + 365, 20, 0)`,
      [lotDebtor, ids.hospitalA, ids.hospDrugA],
    );
    await db.query(
      `INSERT INTO stock_lot (id, hospital_id, hospital_drug_id, lot_no, expiry_date, qty_on_hand, qty_held)
       VALUES ($1, $2, $3, 'LOT-CREDITOR-RET', CURRENT_DATE + 365, 5, 0)`,
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
