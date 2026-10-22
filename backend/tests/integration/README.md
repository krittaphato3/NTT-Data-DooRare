# Integration tests

Regression suite for the Step 8 Admin API (`/config`, `/agent/kill-switch`, `/users`, `/audit-log`).
It starts the Express app in-process on an ephemeral port, creates its own fixtures, and uses
`node:test` + `node:assert/strict` only — no new dependencies.

`npm --prefix backend test` still runs only the fast unit tests and needs no database.

## Safety

The suite refuses to run unless `TEST_DATABASE_URL` is set explicitly and names a database that is
**not** the main one (`DB_NAME`, default `doorare`) or a PostgreSQL maintenance database
(`postgres`, `template0`, `template1`). It never calls `db:reset`, never drops a database, and only
writes inside the database named by the URL. It also fails fast, before any fixture, if the database
is missing any object this suite needs — including the v1.5 objects (`app_user_role`, `login_event`,
`app_user.mfa_enabled/last_login_at/last_seen_at`, `audit_log.reason/agent_run_id`,
`hospital.province/tier`). A stale copy is rejected with the exact missing list.

## Create a disposable copy

```bash
# 1. create an empty database on the same Postgres instance (host port 5442)
createdb -h 127.0.0.1 -p 5442 -U doorare doorare_step8

# 2a. schema only, using the PG 16 client inside the container
#     (a host pg_dump 18 emits `transaction_timeout`, which PG 16 rejects)
docker exec doorare-db pg_dump -U doorare -s doorare \
  | psql -h 127.0.0.1 -p 5442 -U doorare -d doorare_step8

# 2b. or apply the schema file directly
psql -h 127.0.0.1 -p 5442 -U doorare -d doorare_step8 -v ON_ERROR_STOP=1 -f db/schema.sql
```

A schema-only copy is enough. Mock data is fine too: fixtures use a timestamp + random suffix for
region/hospital codes, e-mails and UUIDs, so they never collide with seeded users or with an earlier
run, and the config assertions pick a catalogue key that the target database does not override rather
than assuming an empty `config_setting`.

## Run

```bash
TEST_DATABASE_URL=postgres://doorare:doorare_dev@127.0.0.1:5442/doorare_step8 \
  npm --prefix backend run test:integration
```

The login password comes from `MASTER_PASSWORD` (default `doorare123`, same as the demo auth).

## What it covers

- Auth matrix: 401 without a token, 403 for PH / WH / ER / DR and for HA on SYSTEM_ADMIN routes.
- `GET /config`: 81-key catalogue, HOSPITAL → REGION → GLOBAL → file-default resolution, HA isolation
  between hospitals, filters, read-only and restricted keys, `If-Match`.
- `PUT /config`: validation, scope escalation 403, read-only 422, unknown key 404, version conflict.
- `POST /agent/kill-switch`: SYSTEM_ADMIN only, single global `agent.enabled`, audit rows.
- `GET /users` scope/filters/cursor; `POST /users` idempotent replay, SoD, grant limits;
  `PATCH /users/{id}` roles/primary swap, deactivation invalidating a live session, LAST_ADMIN and
  SELF_LOCKOUT guards.
- `GET /audit-log`: HA vs SA scoping, filters, cursor paging, `includeContext`, chain verify, and the
  append-only trigger (`UPDATE` / `DELETE` rejected).
- Performance probe: when `login_event + audit_log` has at least 100,000 rows, prints
  `EXPLAIN (FORMAT TEXT)` (no `ANALYZE`, reads only) for the audit-log and users queries; otherwise
  it prints the per-table counts and skips.
- The mock dataset has only ~3k login events, so open the gate explicitly for a measurement run:
  `PERF_SEED_LOGIN_EVENTS=100000` inserts that many labelled `login_event` rows (`perf.seed@test.local`)
  before EXPLAIN and deletes them again in a `finally` block. Nothing else changes.

## Re-runs

Each run uses a fresh timestamp/UUID namespace, so tests never depend on previous runs. `app_user`
rows cannot be deleted (DB trigger), so the test database accumulates harmless users, hospitals and
audit rows; recreate the copy when you want a clean slate. The global kill switch is restored to
`true` at the end of a successful run.
