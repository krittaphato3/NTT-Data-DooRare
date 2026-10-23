/**
 * Role PHARMACIST — Audit Log (spec §5.2 viewAudit: own) integration tests.
 * Covers:
 *  - pharmacist sees only own-hospital audit rows
 *  - pharmacist passing another hospitalId gets 403 (or only own rows)
 *  - other hospital's audit row ID returns 404 on detail endpoint
 *  - write attempts (POST, PUT, DELETE) are rejected (404/405/403)
 *  - HOSPITAL_ADMIN and AUDITOR can view audit log
 *  - WAREHOUSE_OFFICER remains rejected (403)
 *  - PHARMACIST remains blocked from GET /api/v1/config (403) and GET /api/v1/users (403)
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
  hospitalA: randomUUID(),
  hospitalB: randomUUID(),
  phA: randomUUID(),
  phB: randomUUID(),
  haA: randomUUID(),
  aud: randomUUID(),
  whA: randomUUID(),
};

const emailFor = (label: string): string => `audit.${stamp}.${label}@test.local`;
const emails = {
  phA: emailFor('pha'),
  phB: emailFor('phb'),
  haA: emailFor('haa'),
  aud: emailFor('aud'),
  whA: emailFor('wha'),
};

const tokens: Record<string, string> = {};

let auditIdA: number;
let auditIdB: number;

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
    `R-AUD-${stamp}`,
    'เขตทดสอบ Audit QA',
    'Audit QA Region',
  ]);

  await db.query(
    `INSERT INTO hospital (id, region_id, code, name_th, name_en, province, tier, active)
     VALUES ($1, $3, $4, 'รพ.สมุทรปราการ Audit Test', 'Samut Prakan Audit Test', 'สมุทรปราการ', 'SECONDARY', true),
            ($2, $3, $5, 'รพ.บางพลี Audit Test', 'Bang Phli Audit Test', 'สมุทรปราการ', 'COMMUNITY', true)`,
    [ids.hospitalA, ids.hospitalB, ids.region, `HA-${stamp.slice(0, 6)}`, `HB-${stamp.slice(0, 6)}`],
  );

  const users: Array<[string, string, string, string, string | null]> = [
    [ids.phA, emails.phA, 'เภสัชกร รพ.เอ', 'PHARMACIST', ids.hospitalA],
    [ids.phB, emails.phB, 'เภสัชกร รพ.บี', 'PHARMACIST', ids.hospitalB],
    [ids.haA, emails.haA, 'ผู้ดูแล รพ.เอ', 'HOSPITAL_ADMIN', ids.hospitalA],
    [ids.aud, emails.aud, 'ผู้ตรวจสอบระบบ', 'AUDITOR', null],
    [ids.whA, emails.whA, 'เจ้าหน้าที่คลัง รพ.เอ', 'WAREHOUSE_OFFICER', ids.hospitalA],
  ];

  for (const [id, email, name, role, hospitalId] of users) {
    await db.query(
      `INSERT INTO app_user (id, cognito_sub, email, display_name, role, hospital_id, region_id, mfa_enabled, active)
       VALUES ($1, $2, $3, $4, $5::role_code, $6, $7, true, true)`,
      [id, `local:${id}`, email, name, role, hospitalId, ids.region],
    );
  }

  // Insert audit rows for Hospital A and Hospital B
  const resA = await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, hospital_id, action, entity_type, entity_id, before, after, reason)
     VALUES ($1, 'PHARMACIST', $2, 'CONFIG_UPDATED', 'hospital_config', $2, '{"val": 1}'::jsonb, '{"val": 2}'::jsonb, 'ปรับเกณฑ์ รพ.เอ')
     RETURNING id`,
    [ids.phA, ids.hospitalA],
  );
  auditIdA = resA.rows[0].id;

  const resB = await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, hospital_id, action, entity_type, entity_id, before, after, reason)
     VALUES ($1, 'PHARMACIST', $2, 'CONFIG_UPDATED', 'hospital_config', $2, '{"val": 10}'::jsonb, '{"val": 20}'::jsonb, 'ปรับเกณฑ์ รพ.บี')
     RETURNING id`,
    [ids.phB, ids.hospitalB],
  );
  auditIdB = resB.rows[0].id;
}

describe('QA-PHARM Spec 5.2 Audit Log Alignment (PHARMACIST viewAudit: own)', () => {
  before(async () => {
    await db.connect();
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;

    await createFixtures();

    tokens.phA = await login('phA');
    tokens.phB = await login('phB');
    tokens.haA = await login('haA');
    tokens.aud = await login('aud');
    tokens.whA = await login('whA');
  });

  after(async () => {
    if (server) await new Promise((res) => server!.close(res));
    await db.end();
    await pool.end();
  });

  it('1. Pharmacist sees only own-hospital audit rows', async () => {
    const res = await call('GET', '/api/v1/audit-log?limit=200', { token: tokens.phA });
    eq('status 200', res.status, 200);
    check('returns items array', Array.isArray(res.body.items));
    check('has own hospital audit row', res.body.items.some((row: any) => row.id === String(auditIdA)));
    check('does NOT have other hospital audit row', !res.body.items.some((row: any) => row.id === String(auditIdB)));
    check(
      'all items belong to own hospital',
      res.body.items.every((row: any) => !row.hospital || row.hospital.id === ids.hospitalA),
    );
  });

  it('2. Pharmacist passing another hospitalId is rejected (403)', async () => {
    const res = await call('GET', `/api/v1/audit-log?hospitalId=${ids.hospitalB}`, { token: tokens.phA });
    eq('status 403', res.status, 403);
    eq('code FORBIDDEN', res.body.code, 'FORBIDDEN');
  });

  it('3. Other hospital audit row returns 404, own audit row returns 200', async () => {
    // phA querying own audit row
    const resOwn = await call('GET', `/api/v1/audit-log/${auditIdA}`, { token: tokens.phA });
    eq('own audit detail 200', resOwn.status, 200);
    eq('own audit detail id matches', resOwn.body.id, String(auditIdA));
    eq('own audit detail action', resOwn.body.data?.action, 'CONFIG_UPDATED');

    // phA querying other hospital's audit row -> 404 (SEC-002)
    const resOther = await call('GET', `/api/v1/audit-log/${auditIdB}`, { token: tokens.phA });
    eq('other hospital audit detail 404', resOther.status, 404);
  });

  it('4. Write attempts are rejected', async () => {
    const postRes = await call('POST', '/api/v1/audit-log', { token: tokens.phA, body: { action: 'HACK' } });
    eq('POST rejected (404 no write route)', postRes.status, 404);

    const putRes = await call('PUT', `/api/v1/audit-log/${auditIdA}`, { token: tokens.phA, body: { reason: 'TAMPER' } });
    eq('PUT rejected (404 no write route)', putRes.status, 404);

    const delRes = await call('DELETE', `/api/v1/audit-log/${auditIdA}`, { token: tokens.phA });
    eq('DELETE rejected (404 no write route)', delRes.status, 404);
  });

  it('5. HOSPITAL_ADMIN and AUDITOR behavior is unchanged; WAREHOUSE_OFFICER is 403', async () => {
    const resHa = await call('GET', '/api/v1/audit-log?limit=50', { token: tokens.haA });
    eq('HOSPITAL_ADMIN 200', resHa.status, 200);
    check('HA has own audit row', resHa.body.items.some((row: any) => row.id === String(auditIdA)));

    const resAud = await call('GET', '/api/v1/audit-log?limit=50', { token: tokens.aud });
    eq('AUDITOR 200', resAud.status, 200);

    const resWh = await call('GET', '/api/v1/audit-log', { token: tokens.whA });
    eq('WAREHOUSE_OFFICER 403', resWh.status, 403);
  });

  it('6. Pharmacist remains blocked from /config (403) and /users (403)', async () => {
    const configRes = await call('GET', '/api/v1/config', { token: tokens.phA });
    eq('pharmacist GET /config 403', configRes.status, 403);

    const usersRes = await call('GET', '/api/v1/users', { token: tokens.phA });
    eq('pharmacist GET /users 403', usersRes.status, 403);
  });
});
