/**
 * Step 8 Admin API — integration regression suite (API-AD-001..004, -006, -007 + PATCH /users).
 *
 * One command:  TEST_DATABASE_URL=postgres://doorare:doorare_dev@127.0.0.1:5442/doorare_step8 \
 *                 npm --prefix backend run test:integration
 *
 * Safety: this file refuses to run without TEST_DATABASE_URL and refuses a database whose name is the
 * main database (`DB_NAME`, default `doorare`) or a PostgreSQL maintenance database. It never resets or
 * recreates a database; it only writes inside the database named by the URL.
 *
 * The target must already have the DooRare schema. Create a copy once (PG 16 client in the container;
 * a host pg_dump 18 emits `transaction_timeout`, which PG 16 rejects):
 *
 *   createdb -h 127.0.0.1 -p 5442 -U doorare doorare_step8
 *   docker exec doorare-db pg_dump -U doorare -s doorare | \
 *     psql -h 127.0.0.1 -p 5442 -U doorare -d doorare_step8
 *
 * Re-runs are tolerated: fixtures are namespaced per run (fresh region/hospitals/users) and `app_user`
 * rows can never be deleted (DB trigger), so the test database accumulates harmless rows. The global
 * kill switch is restored to `true` at the end.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';

const { Client } = pg;

// ---------------------------------------------------------------- safety guard (runs at import time)
interface Target {
  connectionString: string;
  database: string;
  host: string;
  port: string;
  user: string;
  password: string;
}

function requireTestDatabaseUrl(): Target {
  const raw = process.env.TEST_DATABASE_URL?.trim();
  const mainNames = new Set(
    [process.env.DB_NAME, 'doorare', 'postgres', 'template0', 'template1'].filter((name): name is string => Boolean(name)),
  );
  if (!raw) {
    throw new Error(
      [
        'TEST_DATABASE_URL is required (the integration suite never guesses a database). Example:',
        '  TEST_DATABASE_URL=postgres://doorare:doorare_dev@127.0.0.1:5442/doorare_step8 \\',
        '    npm --prefix backend run test:integration',
        'See backend/tests/integration/README.md for creating the copy.',
      ].join('\n'),
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL (expected postgres://user:password@host:port/database)');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`TEST_DATABASE_URL must use the postgres:// scheme (got ${url.protocol}//)`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('TEST_DATABASE_URL must name a database (…/doorare_step8)');
  if (mainNames.has(database)) {
    throw new Error(
      `Refusing to run the integration suite against "${database}": that is the main or a maintenance database.\n` +
        'Point TEST_DATABASE_URL at a disposable copy, e.g. doorare_step8.',
    );
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
// Point the application at the test database BEFORE importing it: config/env.ts reads process.env once.
process.env.DB_HOST = target.host;
process.env.DB_PORT = target.port;
process.env.DB_USER = target.user;
process.env.DB_PASSWORD = target.password;
process.env.DB_NAME = target.database;
process.env.NODE_ENV = 'test';

const { app } = await import('../../src/app.js');
const { pool } = await import('../../src/db/client.js');

// ---------------------------------------------------------------- harness
const db = new Client({ connectionString: target.connectionString });
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'doorare123';
// Timestamp + random suffix: fixtures never collide with seed data or with another run in the same millisecond.
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
  sa: randomUUID(),
  haA: randomUUID(),
  haB: randomUUID(),
  ph: randomUUID(),
  wh: randomUUID(),
  dr: randomUUID(),
  er: randomUUID(),
  invited: randomUUID(),
};

const emailFor = (label: string): string => `it.${stamp}.${label}@test.local`;
const emails = {
  sa: emailFor('sa'),
  haA: emailFor('ha.a'),
  haB: emailFor('ha.b'),
  ph: emailFor('ph'),
  wh: emailFor('wh'),
  dr: emailFor('dr'),
  er: emailFor('er'),
  invited: emailFor('invited'),
};

const tokens: Record<string, string> = {};
const state = { newUserId: '', newUserEmail: '' };

async function login(label: keyof typeof emails): Promise<string> {
  const reply = await call('POST', '/auth/login', {
    body: { email: emails[label], password: MASTER_PASSWORD, mfaVerified: true },
  });
  assert.equal(reply.status, 200, `login ${label}: ${JSON.stringify(reply.body)}`);
  assert.ok(reply.body?.token, `login ${label} returned no token`);
  return reply.body.token as string;
}

async function createFixtures(): Promise<void> {
  await db.query(`INSERT INTO region (id, code, name_th, name_en) VALUES ($1, $2, $3, $4)`, [
    ids.region,
    `R-IT-${stamp}`,
    'เขตทดสอบ integration',
    'Integration Region',
  ]);
  await db.query(
    `INSERT INTO hospital (id, region_id, code, name_th, name_en, province, tier) VALUES
       ($1, $2, $3, $4, $5, $6, 'SECONDARY'), ($7, $2, $8, $9, $10, $6, 'COMMUNITY')`,
    [
      ids.hospitalA,
      ids.region,
      `HA-IT-${stamp}`,
      'โรงพยาบาล integration เอ',
      'Integration Hospital A',
      'สมุทรปราการ',
      ids.hospitalB,
      `HB-IT-${stamp}`,
      'โรงพยาบาล integration บี',
      'Integration Hospital B',
    ],
  );

  const users: Array<[string, string, string, string, string | null, string | null]> = [
    [ids.sa, emails.sa, 'ผู้ดูแลระบบ integration', 'SYSTEM_ADMIN', null, null],
    [ids.haA, emails.haA, 'ผู้ดูแล รพ. เอ integration', 'HOSPITAL_ADMIN', ids.hospitalA, ids.region],
    [ids.haB, emails.haB, 'ผู้ดูแล รพ. บี integration', 'HOSPITAL_ADMIN', ids.hospitalB, ids.region],
    [ids.ph, emails.ph, 'เภสัชกร integration', 'PHARMACIST', ids.hospitalA, ids.region],
    [ids.wh, emails.wh, 'เจ้าหน้าที่คลัง integration', 'WAREHOUSE_OFFICER', ids.hospitalA, null],
    [ids.dr, emails.dr, 'คนขับ integration', 'DRIVER', ids.hospitalA, null],
    [ids.er, emails.er, 'เจ้าหน้าที่ ER integration', 'ER_STAFF', ids.hospitalA, null],
    [ids.invited, emails.invited, 'ผู้ใช้รอตอบรับ integration', 'PHARMACIST', ids.hospitalA, null],
  ];
  for (const [id, email, name, role, hospitalId, regionId] of users) {
    await db.query(
      `INSERT INTO app_user (id, cognito_sub, email, display_name, role, hospital_id, region_id, mfa_enabled, active)
       VALUES ($1, $2, $3, $4, $5::role_code, $6, $7, $8, true)`,
      [id, `local:${id}`, email, name, role, hospitalId, regionId, role === 'SYSTEM_ADMIN' || role === 'HOSPITAL_ADMIN'],
    );
  }
  // A second role exercises `requireRole`'s `allRoles` union (PHARMACIST + DATA_ADMIN is allowed by the SoD trigger).
  await db.query(`INSERT INTO app_user_role (user_id, role) VALUES ($1, 'DATA_ADMIN') ON CONFLICT DO NOTHING`, [ids.ph]);

  const settings: Array<[string, string, unknown]> = [
    ['return.default_days', 'GLOBAL', 30],
    ['return.default_days', `HOSPITAL:${ids.hospitalA}`, 45],
    ['borrow.max_parallel', 'GLOBAL', 3],
    ['borrow.max_parallel', `REGION:${ids.region}`, 4],
    ['agent.enabled', 'GLOBAL', true],
  ];
  for (const [key, scope, value] of settings) {
    await db.query(
      `INSERT INTO config_setting (key, scope, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (key, scope) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, scope, JSON.stringify(value)],
    );
  }
}

/** Objects this suite needs. v1.5 tables/columns are listed explicitly so an old copy fails here, not in a fixture. */
const REQUIRED_OBJECTS: Array<{ label: string; relation?: string; column?: [string, string] }> = [
  { label: 'app_user', relation: 'public.app_user' },
  { label: 'audit_log', relation: 'public.audit_log' },
  { label: 'config_setting', relation: 'public.config_setting' },
  { label: 'hospital', relation: 'public.hospital' },
  { label: 'region', relation: 'public.region' },
  { label: 'app_user_role (v1.5)', relation: 'public.app_user_role' },
  { label: 'login_event (v1.5)', relation: 'public.login_event' },
  { label: 'app_user.mfa_enabled (v1.5)', column: ['app_user', 'mfa_enabled'] },
  { label: 'app_user.last_login_at (v1.5)', column: ['app_user', 'last_login_at'] },
  { label: 'app_user.last_seen_at (v1.5)', column: ['app_user', 'last_seen_at'] },
  { label: 'audit_log.reason (v1.5)', column: ['audit_log', 'reason'] },
  { label: 'audit_log.agent_run_id (v1.5)', column: ['audit_log', 'agent_run_id'] },
  { label: 'hospital.province (v1.5)', column: ['hospital', 'province'] },
  { label: 'hospital.tier (v1.5)', column: ['hospital', 'tier'] },
];

async function assertSchema(): Promise<void> {
  const result = await db.query(
    `SELECT o.label
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS o(label, relation, tbl, col)
      WHERE (relation <> '' AND to_regclass(o.relation) IS NULL)
         OR (relation = '' AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public' AND c.table_name = o.tbl AND c.column_name = o.col))`,
    [
      REQUIRED_OBJECTS.map((o) => o.label),
      REQUIRED_OBJECTS.map((o) => o.relation ?? ''),
      REQUIRED_OBJECTS.map((o) => o.column?.[0] ?? ''),
      REQUIRED_OBJECTS.map((o) => o.column?.[1] ?? ''),
    ],
  );
  const missing = result.rows.map((row) => row.label as string);
  if (missing.length) {
    throw new Error(
      [
        `Database "${target.database}" does not have the current DooRare schema v1.5. Missing: ${missing.join(', ')}.`,
        'This suite never creates or resets a database. Point it at a copy of a database built from db/schema.sql v1.5:',
        `  createdb -h ${target.host} -p ${target.port} -U ${target.user} ${target.database}`,
        `  docker exec -i doorare-db psql -U ${target.user} -d ${target.database} -f /docker-entrypoint-initdb.d/01-schema.sql`,
        `  docker exec -w /mock/csv doorare-db psql -U ${target.user} -d ${target.database} -f /mock/load.sql  # optional mock data`,
        'See backend/tests/integration/README.md.',
      ].join('\n'),
    );
  }
}

// ---------------------------------------------------------------- suites
describe('Step 8 admin API', () => {
  before(async () => {
    try {
      await db.connect();
      await assertSchema();
      await createFixtures();

      await new Promise<void>((resolve, reject) => {
        server = app.listen(0, () => resolve());
        server.once('error', reject);
      });
      base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/v1`;

      tokens.sa = await login('sa');
      tokens.haA = await login('haA');
      tokens.haB = await login('haB');
      tokens.ph = await login('ph');
      tokens.wh = await login('wh');
      tokens.dr = await login('dr');
      tokens.er = await login('er');
    } catch (error) {
      // node:test cancels the child tests without printing a hook error; make the cause visible.
      console.error('[integration] setup failed:', error);
      throw error;
    }
  });

  after(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await pool.end().catch(() => undefined);
    await db.end().catch(() => undefined);
    console.log(`\n[integration] checks passed: ${checks}`);
  });

  it('health endpoint reports the test database', async () => {
    const reply = await call('GET', '/health');
    eq('health 200', reply.status, 200);
    eq('health ok', reply.body?.ok, true);
  });

  it('rejects missing or wrong tokens and wrong roles', async () => {
    for (const path of ['/config', '/users', '/audit-log']) {
      eq(`401 GET ${path} without token`, (await call('GET', path)).status, 401);
    }
    eq('401 POST /agent/kill-switch without token', (await call('POST', '/agent/kill-switch', { body: { enabled: false } })).status, 401);

    for (const [role, token] of [
      ['PHARMACIST', tokens.ph],
      ['WAREHOUSE_OFFICER', tokens.wh],
      ['ER_STAFF', tokens.er],
      ['DRIVER', tokens.dr],
    ] as const) {
      eq(`403 GET /config as ${role}`, (await call('GET', '/config', { token })).status, 403);
      eq(`403 GET /users as ${role}`, (await call('GET', '/users', { token })).status, 403);
      eq(`403 GET /audit-log as ${role}`, (await call('GET', '/audit-log', { token })).status, 403);
    }
    eq(
      '403 POST /users as PHARMACIST',
      (await call('POST', '/users', { token: tokens.ph, body: {}, headers: { 'Idempotency-Key': 'k1' } })).status,
      403,
    );
    eq(
      '403 POST /agent/kill-switch as HOSPITAL_ADMIN',
      (await call('POST', '/agent/kill-switch', { token: tokens.haA, body: { enabled: false, reason: 'x' } })).status,
      403,
    );
    eq('403 GET /audit-log/verify as HOSPITAL_ADMIN', (await call('GET', '/audit-log/verify', { token: tokens.haA })).status, 403);
  });

  it('config: catalogue, effective scope resolution and HA isolation', async () => {
    const configA = await call('GET', '/config', { token: tokens.haA });
    eq('200 GET /config as HA', configA.status, 200);
    eq('catalogue size', configA.body.items?.length, 81);
    const byKey = new Map<string, any>((configA.body.items ?? []).map((item: any) => [item.key, item]));
    eq('HA effective hospital override', byKey.get('return.default_days')?.value, 45);
    eq('HA effective hospital scope', byKey.get('return.default_days')?.scope, 'HOSPITAL');
    eq('HA effective region override', byKey.get('borrow.max_parallel')?.value, 4);
    eq('HA effective region scope', byKey.get('borrow.max_parallel')?.scope, 'REGION');
    // The mock dataset configures most catalogue keys. Pick a key it does not configure so this
    // asserts the fallback path instead of whatever the seed data happens to set.
    const configured = new Set<string>(
      (await db.query(`SELECT DISTINCT key FROM config_setting`)).rows.map((row) => row.key as string),
    );
    const fallbackItem = (configA.body.items ?? []).find(
      (item: any) => item.scope === 'DEFAULT' && !configured.has(item.key),
    );
    check('a catalogue key without a config_setting row exists', Boolean(fallbackItem));
    eq('HA effective fallback scope', fallbackItem?.scope, 'DEFAULT');
    check('HA effective fallback value is present', fallbackItem?.value !== undefined && fallbackItem?.value !== null);
    eq('read-only key flagged', byKey.get('forecast.cv_threshold')?.readOnly, true);
    eq('read-only key not editable', byKey.get('forecast.cv_threshold')?.editable, false);
    eq('restricted key not editable by HA', byKey.get('borrow.score.w_time')?.editable, false);
    eq('normal key editable by HA', byKey.get('return.default_days')?.editable, true);
    check(
      'no key is returned without group/type/description',
      (configA.body.items ?? []).every((item: any) => item.group && item.type && item.description),
    );

    const configB = await call('GET', '/config', { token: tokens.haB });
    const returnB = (configB.body.items ?? []).find((item: any) => item.key === 'return.default_days');
    eq('HA B does not see H-A override', returnB?.value, 30);
    eq('HA B scope is global', returnB?.scope, 'GLOBAL');

    const saConfigA = await call('GET', `/config?hospitalId=${ids.hospitalA}`, { token: tokens.sa });
    eq('SA can read effective values for a hospital', (saConfigA.body.items ?? []).find((i: any) => i.key === 'return.default_days')?.value, 45);

    const groupBorrow = await call('GET', '/config?group=borrow', { token: tokens.haA });
    check('group filter works', groupBorrow.body.items.length > 0 && groupBorrow.body.items.every((i: any) => i.group === 'borrow'));
    const scopeGlobal = await call('GET', '/config?scope=GLOBAL', { token: tokens.sa });
    check('scope filter works', scopeGlobal.body.items.length > 0 && scopeGlobal.body.items.every((i: any) => i.scope === 'GLOBAL'));
    const keyFilter = await call('GET', '/config?key=return.default_days', { token: tokens.haA });
    eq('key filter works', keyFilter.body.items.length, 1);
  });

  it('config: guarded writes and optimistic lock', async () => {
    const putOk = await call('PUT', '/config/return.default_days', { token: tokens.haA, body: { value: 60, reason: 'integration' } });
    eq('HA PUT hospital scope 200', putOk.status, 200);
    eq('HA PUT returns hospital scope', putOk.body.data?.scope, `HOSPITAL:${ids.hospitalA}`);
    eq('HA PUT effective value', putOk.body.data?.effectiveValue, 60);
    const dbReturn = await db.query(`SELECT value FROM config_setting WHERE key='return.default_days' AND scope=$1`, [
      `HOSPITAL:${ids.hospitalA}`,
    ]);
    eq('DB row updated', dbReturn.rows[0]?.value, 60);
    const afterPut = await call('GET', '/config?key=return.default_days', { token: tokens.haA });
    eq('GET sees the new value', afterPut.body.items[0].value, 60);
    const updatedAt = afterPut.body.items[0].updatedAt;

    eq(
      'HA PUT restricted key 403',
      (await call('PUT', '/config/borrow.score.w_time', { token: tokens.haA, body: { value: 0.5, reason: 'x' } })).status,
      403,
    );
    const readOnlyPut = await call('PUT', '/config/forecast.cv_threshold', { token: tokens.haA, body: { value: 0.4, reason: 'x' } });
    eq('PUT read-only key 422', readOnlyPut.status, 422);
    eq('PUT read-only code', readOnlyPut.body.code, 'CONFIG_READ_ONLY');
    eq(
      'HA PUT global scope 403',
      (await call('PUT', '/config/return.default_days', { token: tokens.haA, body: { value: 61, scope: 'GLOBAL', reason: 'x' } })).status,
      403,
    );
    eq(
      'HA PUT other hospital scope 403',
      (
        await call('PUT', '/config/return.default_days', {
          token: tokens.haA,
          body: { value: 61, scope: `HOSPITAL:${ids.hospitalB}`, reason: 'x' },
        })
      ).status,
      403,
    );
    eq('PUT without reason 400', (await call('PUT', '/config/return.default_days', { token: tokens.haA, body: { value: 61 } })).status, 400);
    eq('PUT unknown key 404', (await call('PUT', '/config/not.a.key', { token: tokens.haA, body: { value: 1, reason: 'x' } })).status, 404);
    eq(
      'PUT wrong type 400',
      (await call('PUT', '/config/return.default_days', { token: tokens.haA, body: { value: 'abc', reason: 'x' } })).status,
      400,
    );
    eq(
      'PUT below min 400',
      (await call('PUT', '/config/return.default_days', { token: tokens.haA, body: { value: 0, reason: 'x' } })).status,
      400,
    );
    eq(
      'PUT stale If-Match 409',
      (
        await call('PUT', '/config/return.default_days', {
          token: tokens.haA,
          body: { value: 62, reason: 'x' },
          headers: { 'If-Match': '2000-01-01T00:00:00.000Z' },
        })
      ).status,
      409,
    );
    eq(
      'PUT matching If-Match 200',
      (
        await call('PUT', '/config/return.default_days', {
          token: tokens.haA,
          body: { value: 62, reason: 'x' },
          headers: { 'If-Match': updatedAt },
        })
      ).status,
      200,
    );

    const saGlobal = await call('PUT', '/config/borrow.max_parallel', { token: tokens.sa, body: { value: 5, reason: 'global tune' } });
    eq('SA PUT global 200', saGlobal.status, 200);
    eq('SA PUT global scope', saGlobal.body.data?.scope, 'GLOBAL');
    const saRegion = await call('PUT', '/config/borrow.max_parallel', {
      token: tokens.sa,
      body: { value: 6, scope: `REGION:${ids.region}`, reason: 'region tune' },
    });
    eq('SA PUT region 200', saRegion.status, 200);
    const regionEffective = await call('GET', '/config?key=borrow.max_parallel', { token: tokens.haA });
    eq('region override still wins over global', regionEffective.body.items[0].value, 6);
    eq(
      'SA PUT unknown hospital scope 400',
      (
        await call('PUT', '/config/return.default_days', {
          token: tokens.sa,
          body: { value: 1, scope: `HOSPITAL:${randomUUID()}`, reason: 'x' },
        })
      ).status,
      400,
    );
  });

  it('kill switch: SYSTEM_ADMIN only, single global agent.enabled', async () => {
    const killOff = await call('POST', '/agent/kill-switch', { token: tokens.sa, body: { enabled: false, reason: 'integration drill' } });
    eq('kill switch off 200', killOff.status, 200);
    eq('kill switch response', killOff.body.data?.enabled, false);
    const killRow = await db.query(`SELECT value FROM config_setting WHERE key='agent.enabled' AND scope='GLOBAL'`);
    eq('kill switch persisted', killRow.rows[0]?.value, false);
    const killView = await call('GET', '/config?key=agent.enabled', { token: tokens.sa });
    eq('kill switch visible in config', killView.body.items[0].value, false);
    eq('kill switch without reason 400', (await call('POST', '/agent/kill-switch', { token: tokens.sa, body: { enabled: true } })).status, 400);
    eq(
      'kill switch non-boolean 400',
      (await call('POST', '/agent/kill-switch', { token: tokens.sa, body: { enabled: 'yes', reason: 'x' } })).status,
      400,
    );
    eq(
      'kill switch restored 200',
      (await call('POST', '/agent/kill-switch', { token: tokens.sa, body: { enabled: true, reason: 'restore' } })).status,
      200,
    );
  });

  it('users: list respects hospital scope, filters and paging', async () => {
    const usersA = await call('GET', '/users?limit=200', { token: tokens.haA });
    eq('200 GET /users as HA', usersA.status, 200);
    check('HA sees only own hospital', usersA.body.items.every((u: any) => u.hospital?.id === ids.hospitalA));
    check(
      'HA never sees system/region accounts',
      usersA.body.items.every((u: any) => !u.roles.some((r: any) => ['SYSTEM_ADMIN', 'REGION_ADMIN'].includes(r.code))),
    );
    const invited = usersA.body.items.find((u: any) => u.email === emails.invited);
    eq('INVITED status derived', invited?.status, 'INVITED');
    eq('roles carry isPrimary', usersA.body.items.find((u: any) => u.email === emails.ph)?.roles[0].isPrimary, true);
    check('loginCount present', Number.isInteger(usersA.body.items[0]?.loginCount));
    check('isOnline present', typeof usersA.body.items[0]?.isOnline === 'boolean');

    const usersB = await call('GET', '/users', { token: tokens.haB });
    check('HA B sees only B', usersB.body.items.length > 0 && usersB.body.items.every((u: any) => u.hospital?.id === ids.hospitalB));
    const allUsers = await call('GET', '/users?limit=200', { token: tokens.sa });
    check('SA sees system admin', allUsers.body.items.some((u: any) => u.primaryRole === 'SYSTEM_ADMIN'));
    const invitedOnly = await call('GET', '/users?status=INVITED', { token: tokens.haA });
    check('status filter INVITED', invitedOnly.body.items.length > 0 && invitedOnly.body.items.every((u: any) => u.status === 'INVITED'));
    const drivers = await call('GET', '/users?role=DRIVER', { token: tokens.haA });
    check('role filter DRIVER', drivers.body.items.length > 0 && drivers.body.items.every((u: any) => u.roles.some((r: any) => r.code === 'DRIVER')));
    eq('q filter', (await call('GET', `/users?q=${encodeURIComponent(emails.ph)}`, { token: tokens.haA })).body.items.length, 1);

    const page1 = await call('GET', '/users?limit=2', { token: tokens.haA });
    eq('page 1 size', page1.body.items.length, 2);
    check('page 1 has cursor', Boolean(page1.body.nextCursor));
    const page2 = await call('GET', `/users?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`, { token: tokens.haA });
    check('page 2 distinct', page2.body.items.every((u: any) => !page1.body.items.some((p: any) => p.id === u.id)));
  });

  it('users: invite with idempotency and role guards', async () => {
    const newEmail = emailFor('new');
    eq(
      'POST /users without Idempotency-Key 400',
      (await call('POST', '/users', { token: tokens.haA, body: { name: 'x', email: newEmail, roles: ['PHARMACIST'], reason: 'x' } })).status,
      400,
    );

    const key = `create-${stamp}`;
    const created = await call('POST', '/users', {
      token: tokens.haA,
      headers: { 'Idempotency-Key': key },
      body: { name: 'ผู้ใช้ใหม่ integration', email: newEmail, roles: ['PHARMACIST'], reason: 'integration create' },
    });
    eq('HA create 201', created.status, 201);
    eq('created status INVITED', created.body.data?.status, 'INVITED');
    eq('created hospital', created.body.data?.hospital?.id, ids.hospitalA);
    const newId = created.body.id as string;
    const createdRoles = await db.query(`SELECT role::text AS role FROM app_user_role WHERE user_id=$1`, [newId]);
    eq('created role rows', createdRoles.rows.map((r) => r.role).sort().join(','), 'PHARMACIST');
    const historyOpen = await db.query(`SELECT count(*)::int AS n FROM app_user_role_history WHERE user_id=$1 AND valid_to IS NULL`, [newId]);
    eq('one open history period', historyOpen.rows[0].n, 1);

    const replay = await call('POST', '/users', {
      token: tokens.haA,
      headers: { 'Idempotency-Key': key },
      body: { name: 'ผู้ใช้ใหม่ integration', email: newEmail, roles: ['PHARMACIST'], reason: 'integration create' },
    });
    eq('idempotent replay status', replay.status, 201);
    eq('idempotent replay header', replay.headers.get('idempotent-replay'), 'true');
    const dupCount = await db.query(`SELECT count(*)::int AS n FROM app_user WHERE email=$1`, [newEmail]);
    eq('idempotency created one user', dupCount.rows[0].n, 1);

    eq(
      'same key different body 422',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': key },
          body: { name: 'other', email: emailFor('other'), roles: ['PHARMACIST'], reason: 'x' },
        })
      ).status,
      422,
    );
    eq(
      'duplicate email 409',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': `dup-${stamp}` },
          body: { name: 'dup', email: newEmail, roles: ['PHARMACIST'], reason: 'x' },
        })
      ).status,
      409,
    );
    eq(
      'HA cannot grant SYSTEM_ADMIN 403',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': `sa-${stamp}` },
          body: { name: 'x', email: emailFor('sa-grant'), roles: ['SYSTEM_ADMIN'], reason: 'x' },
        })
      ).status,
      403,
    );
    eq(
      'HA cannot create in another hospital 403',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': `hb-${stamp}` },
          body: { name: 'x', email: emailFor('hb'), roles: ['PHARMACIST'], hospitalId: ids.hospitalB, reason: 'x' },
        })
      ).status,
      403,
    );
    eq(
      'separation of duties 422',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': `sod-${stamp}` },
          body: { name: 'x', email: emailFor('sod'), roles: ['HOSPITAL_ADMIN', 'PHARMACIST'], reason: 'x' },
        })
      ).status,
      422,
    );
    eq(
      'invalid email 400',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': `bad-${stamp}` },
          body: { name: 'x', email: 'not-an-email', roles: ['PHARMACIST'], reason: 'x' },
        })
      ).status,
      400,
    );
    eq(
      'empty roles 400',
      (
        await call('POST', '/users', {
          token: tokens.haA,
          headers: { 'Idempotency-Key': `empty-${stamp}` },
          body: { name: 'x', email: emailFor('empty'), roles: [], reason: 'x' },
        })
      ).status,
      400,
    );

    const multi = await call('POST', '/users', {
      token: tokens.sa,
      headers: { 'Idempotency-Key': `multi-${stamp}` },
      body: { name: 'เภสัช multi', email: emailFor('multi'), roles: ['PHARMACIST', 'DATA_ADMIN'], hospitalId: ids.hospitalA, reason: 'multi role' },
    });
    eq('SA multi-role create 201', multi.status, 201);
    eq('multi-role count', multi.body.data?.roles.length, 2);

    const saUser = await call('POST', '/users', {
      token: tokens.sa,
      headers: { 'Idempotency-Key': `sys-${stamp}` },
      body: { name: 'ผู้ดูแลระบบสอง', email: emailFor('sa2'), roles: ['SYSTEM_ADMIN'], reason: 'second sysadmin' },
    });
    eq('SA creates SYSTEM_ADMIN 201', saUser.status, 201);
    eq('SYSTEM_ADMIN has no hospital', saUser.body.data?.hospital, null);

    state.newUserId = newId;
    state.newUserEmail = newEmail;
  });

  it('users: patch, roles, deactivate and lockout guards', async () => {
    const newId = state.newUserId;
    const profile = await call('PATCH', `/users/${newId}`, { token: tokens.haA, body: { name: 'ผู้ใช้ใหม่ แก้ไข', phone: '0200000000' } });
    eq('profile-only PATCH 200 without reason', profile.status, 200);
    eq('profile updated', profile.body.data?.name, 'ผู้ใช้ใหม่ แก้ไข');

    eq(
      'role change without reason 400',
      (await call('PATCH', `/users/${newId}`, { token: tokens.haA, body: { roles: ['PHARMACIST', 'DATA_ADMIN'] } })).status,
      400,
    );
    const addRole = await call('PATCH', `/users/${newId}`, {
      token: tokens.haA,
      body: { roles: ['PHARMACIST', 'DATA_ADMIN'], reason: 'add data admin' },
    });
    eq('add role 200', addRole.status, 200);
    eq('role added', addRole.body.data?.roles.length, 2);
    const roleRows = await db.query(`SELECT role::text AS role FROM app_user_role WHERE user_id=$1`, [newId]);
    eq('app_user_role after add', roleRows.rows.map((r) => r.role).sort().join(','), 'DATA_ADMIN,PHARMACIST');

    const swapPrimary = await call('PATCH', `/users/${newId}`, {
      token: tokens.haA,
      body: { roles: ['PHARMACIST', 'DATA_ADMIN'], primaryRole: 'DATA_ADMIN', reason: 'swap primary' },
    });
    eq('primary swap 200', swapPrimary.status, 200);
    eq('primary swapped', swapPrimary.body.data?.primaryRole, 'DATA_ADMIN');
    eq('old role kept', swapPrimary.body.data?.roles.map((r: any) => r.code).sort().join(','), 'DATA_ADMIN,PHARMACIST');
    const primaryRow = await db.query(`SELECT role::text AS role FROM app_user WHERE id=$1`, [newId]);
    eq('DB primary role', primaryRow.rows[0].role, 'DATA_ADMIN');
    const closedHist = await db.query(
      `SELECT count(*)::int AS n FROM app_user_role_history WHERE user_id=$1 AND role='PHARMACIST' AND valid_to IS NOT NULL`,
      [newId],
    );
    check('old primary history period closed', closedHist.rows[0].n >= 1);

    const loggedIn = await call('POST', '/auth/login', {
      body: { email: state.newUserEmail, password: MASTER_PASSWORD, mfaVerified: true },
    });
    eq('created user can log in', typeof loggedIn.body?.token, 'string');
    const newToken = loggedIn.body.token as string;
    eq('new user can call /me', (await call('GET', '/me', { token: newToken })).status, 200);
    const suspend = await call('PATCH', `/users/${newId}`, { token: tokens.haA, body: { active: false, reason: 'suspend test' } });
    eq('deactivate 200', suspend.status, 200);
    eq('deactivated status', suspend.body.data?.status, 'SUSPENDED');
    eq('deactivated session rejected', (await call('GET', '/me', { token: newToken })).status, 401);
    const reactivate = await call('PATCH', `/users/${newId}`, { token: tokens.haA, body: { active: true, reason: 'reactivate test' } });
    eq('reactivate 200', reactivate.status, 200);
    eq('reactivated status', reactivate.body.data?.status, 'ACTIVE');

    eq(
      'email collision on PATCH 409',
      (await call('PATCH', `/users/${newId}`, { token: tokens.haA, body: { email: emails.ph, reason: 'x' } })).status,
      409,
    );
    eq(
      'HA cannot grant SYSTEM_ADMIN via PATCH 403',
      (await call('PATCH', `/users/${newId}`, { token: tokens.haA, body: { roles: ['SYSTEM_ADMIN'], reason: 'x' } })).status,
      403,
    );
    const haBUser = (await call('GET', '/users?limit=200', { token: tokens.haB })).body.items[0];
    eq('HA A cannot patch B user', (await call('PATCH', `/users/${haBUser.id}`, { token: tokens.haA, body: { name: 'x' } })).status, 404);
    eq('HA A cannot patch SA user', (await call('PATCH', `/users/${ids.sa}`, { token: tokens.haA, body: { name: 'x' } })).status, 404);
    eq(
      'unknown user 404',
      (await call('PATCH', '/users/99999999-9999-4999-8999-999999999999', { token: tokens.haA, body: { name: 'x' } })).status,
      404,
    );
    eq('self deactivate 409', (await call('PATCH', `/users/${ids.haA}`, { token: tokens.haA, body: { active: false, reason: 'x' } })).status, 409);
    eq('SA self deactivate 409', (await call('PATCH', `/users/${ids.sa}`, { token: tokens.sa, body: { active: false, reason: 'x' } })).status, 409);

    const lastAdmin = await call('PATCH', `/users/${ids.haB}`, { token: tokens.sa, body: { active: false, reason: 'x' } });
    eq('last hospital admin 409', lastAdmin.status, 409);
    eq('last hospital admin code', lastAdmin.body.code, 'LAST_ADMIN');

    const secondAdminB = await call('POST', '/users', {
      token: tokens.sa,
      headers: { 'Idempotency-Key': `hab2-${stamp}` },
      body: {
        name: 'ผู้ดูแล บี สอง',
        email: emailFor('ha.b2'),
        roles: ['HOSPITAL_ADMIN'],
        hospitalId: ids.hospitalB,
        reason: 'second admin',
      },
    });
    eq('second hospital admin created', secondAdminB.status, 201);

    eq(
      'SA can deactivate with a second admin present',
      (await call('PATCH', `/users/${ids.haB}`, { token: tokens.sa, body: { active: false, reason: 'rotate' } })).status,
      200,
    );
    eq(
      'reactivate first admin',
      (await call('PATCH', `/users/${ids.haB}`, { token: tokens.sa, body: { active: true, reason: 'restore' } })).status,
      200,
    );
  });

  it('audit-log: scoping, filters, paging and chain verify', async () => {
    const auditA = await call('GET', '/audit-log?limit=200', { token: tokens.haA });
    eq('200 GET /audit-log as HA', auditA.status, 200);
    check(
      'HA audit is scoped',
      auditA.body.items.every(
        (row: any) => row.hospital?.id === ids.hospitalA || (row.entityType === 'hospital' && row.entityId === ids.hospitalA),
      ),
    );
    check('HA audit has own config row', auditA.body.items.some((row: any) => row.action === 'CONFIG_UPDATED'));
    check('HA audit has no other hospital row', !auditA.body.items.some((row: any) => row.hospital?.id === ids.hospitalB));
    check(
      'audit actor resolved',
      auditA.body.items.some((row: any) => row.actor?.name === 'ผู้ดูแล รพ. เอ integration'),
    );
    check('audit ip captured', auditA.body.items.some((row: any) => typeof row.ip === 'string' && row.ip.length > 0));
    check('audit hashes present', auditA.body.items.every((row: any) => typeof row.rowHash === 'string' && row.rowHash.length === 64));

    const auditSA = await call('GET', '/audit-log?limit=200', { token: tokens.sa });
    check('SA audit sees SYSTEM_ADMIN actions', auditSA.body.items.some((row: any) => row.actor?.role === 'SYSTEM_ADMIN'));
    const filteredAction = await call('GET', '/audit-log?action=AGENT_KILL_SWITCH_OFF', { token: tokens.sa });
    check(
      'action filter works',
      filteredAction.body.items.length >= 1 && filteredAction.body.items.every((r: any) => r.action === 'AGENT_KILL_SWITCH_OFF'),
    );
    const filteredEntity = await call('GET', '/audit-log?entityType=app_user', { token: tokens.sa });
    check(
      'entityType filter works',
      filteredEntity.body.items.length >= 1 && filteredEntity.body.items.every((r: any) => r.entityType === 'app_user'),
    );
    const filteredRole = await call('GET', '/audit-log?role=HOSPITAL_ADMIN', { token: tokens.sa });
    check(
      'role filter works',
      filteredRole.body.items.length >= 1 && filteredRole.body.items.every((r: any) => r.actor?.role === 'HOSPITAL_ADMIN'),
    );
    const search = await call('GET', '/audit-log?q=USER_', { token: tokens.sa });
    check(
      'q filter works',
      search.body.items.length >= 1 &&
        search.body.items.every(
          (r: any) => r.action.includes('USER_') || r.entityType.includes('USER_') || (r.reason ?? '').includes('USER_'),
        ),
    );
    eq('from tomorrow is empty', (await call('GET', '/audit-log?from=2099-01-01', { token: tokens.sa })).body.items.length, 0);
    eq('invalid date 400', (await call('GET', '/audit-log?from=not-a-date', { token: tokens.sa })).status, 400);
    const noContext = await call('GET', '/audit-log?includeContext=false&limit=5', { token: tokens.sa });
    check('includeContext=false omits ip', noContext.body.items.every((row: any) => row.ip === undefined));
    const auditPage1 = await call('GET', '/audit-log?limit=2', { token: tokens.sa });
    const auditPage2 = await call('GET', `/audit-log?limit=2&cursor=${encodeURIComponent(auditPage1.body.nextCursor)}`, { token: tokens.sa });
    check('audit cursor paging distinct', auditPage2.body.items.every((row: any) => !auditPage1.body.items.some((p: any) => p.id === row.id)));

    const verify = await call('GET', '/audit-log/verify', { token: tokens.sa });
    eq('audit verify 200', verify.status, 200);
    eq('audit chain intact', verify.body.data?.intact, true);
    eq('audit chain problems', verify.body.data?.problems, 0);
  });

  it('audit-log: every write is audited and the log is append-only', async () => {
    const actions = await db.query(`SELECT action, count(*)::int AS n FROM audit_log GROUP BY action`);
    const actionMap: Record<string, number> = Object.fromEntries(actions.rows.map((r) => [r.action, r.n]));
    for (const expected of [
      'CONFIG_UPDATED',
      'AGENT_KILL_SWITCH_OFF',
      'AGENT_KILL_SWITCH_ON',
      'USER_CREATED',
      'USER_UPDATED',
      'USER_ROLES_CHANGED',
      'USER_SUSPENDED',
      'USER_ACTIVATED',
    ]) {
      check(`audit action ${expected}`, (actionMap[expected] ?? 0) >= 1);
    }
    const chain = await db.query(`SELECT audit_chain_verify()::int AS problems`);
    eq('DB chain verify 0', chain.rows[0].problems, 0);
    const openPeriods = await db.query(
      `SELECT count(*)::int AS n FROM app_user_role_history h
        WHERE h.valid_to IS NULL
          AND NOT EXISTS (SELECT 1 FROM app_user_role r WHERE r.user_id = h.user_id AND r.role = h.role)`,
    );
    eq('no history period open for a removed role', openPeriods.rows[0].n, 0);

    await assert.rejects(
      db.query(`UPDATE audit_log SET action = 'TAMPERED' WHERE id = (SELECT max(id) FROM audit_log)`),
      /append-only/,
      'UPDATE audit_log must be rejected',
    );
    checks += 1;
    await assert.rejects(
      db.query(`DELETE FROM audit_log WHERE id = (SELECT max(id) FROM audit_log)`),
      /append-only/,
      'DELETE audit_log must be rejected',
    );
    checks += 1;
  });

  it('performance: prints EXPLAIN plans when the database is large enough', async () => {
    // The mock dataset only has ~3k login events, so the gate can be opened explicitly for a measurement run:
    //   PERF_SEED_LOGIN_EVENTS=100000 npm run test:integration
    // Seeded rows are labelled and removed again, even when EXPLAIN throws.
    const seedEmail = 'perf.seed@test.local';
    const seedRows = Number(process.env.PERF_SEED_LOGIN_EVENTS ?? 0);
    if (Number.isFinite(seedRows) && seedRows > 0) {
      await db.query(
        `INSERT INTO login_event (email, occurred_at, success, ip, device, browser)
         SELECT $1, now() - (g || ' seconds')::interval, true, '10.0.0.1'::inet, 'perf', 'perf'
           FROM generate_series(1, $2::int) g`,
        [seedEmail, Math.floor(seedRows)],
      );
      console.log(`[integration] seeded ${Math.floor(seedRows)} synthetic login_event rows for EXPLAIN`);
    }
    try {
      const counts = await db.query(
        `SELECT (SELECT count(*) FROM login_event)::bigint AS login_events,
                (SELECT count(*) FROM audit_log)::bigint AS audit_rows`,
      );
      const loginEvents = Number(counts.rows[0]?.login_events ?? 0);
      const auditRows = Number(counts.rows[0]?.audit_rows ?? 0);
      console.log(`[integration] rows: login_event=${loginEvents} audit_log=${auditRows}`);
      if (loginEvents + auditRows < 100_000) {
        console.log('[integration] EXPLAIN skipped: login_event + audit_log < 100000 rows (set PERF_SEED_LOGIN_EVENTS to measure)');
        return;
      }

      const auditSql = `
        SELECT a.id, a.occurred_at, a.actor_id, a.actor_role, a.hospital_id, a.action, a.entity_type, a.entity_id,
               a.before, a.after, a.reason, a.agent_run_id, a.request_id, a.prev_hash, a.row_hash,
               u.display_name AS actor_name, u.email AS actor_email,
               h.code AS hospital_code, h.name_th AS hospital_name,
               c.ip::text AS ip, c.user_agent
          FROM audit_log a
          LEFT JOIN app_user u ON u.id = a.actor_id
          LEFT JOIN hospital h ON h.id = a.hospital_id
          LEFT JOIN audit_log_context c ON c.audit_id = a.id
         WHERE (a.hospital_id = $1 OR (a.entity_type = 'hospital' AND a.entity_id = $1))
         ORDER BY a.occurred_at DESC, a.id DESC
         LIMIT $2 OFFSET $3`;
      const usersSql = `
        SELECT u.id, u.email, u.display_name, u.phone, u.active, u.mfa_enabled, u.last_login_at, u.last_seen_at, u.created_at,
               u.role::text AS primary_role, u.hospital_id, u.region_id,
               COALESCE((SELECT array_agg(ur.role::text ORDER BY ur.role::text) FROM app_user_role ur WHERE ur.user_id = u.id), '{}') AS roles,
               (SELECT count(*) FROM login_event le WHERE le.user_id = u.id)::int AS login_count,
               h.code AS hospital_code, h.name_th AS hospital_name,
               r.code AS region_code, r.name_th AS region_name
          FROM app_user u
          LEFT JOIN hospital h ON h.id = u.hospital_id
          LEFT JOIN region r ON r.id = u.region_id
         WHERE u.hospital_id = $1
           AND NOT EXISTS (SELECT 1 FROM app_user_role x WHERE x.user_id = u.id AND x.role IN ('SYSTEM_ADMIN','REGION_ADMIN'))
         ORDER BY u.created_at DESC, u.id
         LIMIT $2 OFFSET $3`;
      const params = [ids.hospitalA, 51, 0];
      for (const [label, sql] of [
        ['GET /audit-log (HA scope)', auditSql],
        ['GET /users (HA scope)', usersSql],
      ] as const) {
        const plan = await db.query(`EXPLAIN (FORMAT TEXT) ${sql}`, params);
        console.log(`\n[integration] EXPLAIN ${label}`);
        for (const row of plan.rows) console.log(`  ${row['QUERY PLAN']}`);
      }
    } finally {
      if (seedRows > 0) {
        const removed = await db.query(`DELETE FROM login_event WHERE email = $1`, [seedEmail]);
        console.log(`[integration] removed ${removed.rowCount} synthetic login_event rows`);
      }
    }
  });
});
