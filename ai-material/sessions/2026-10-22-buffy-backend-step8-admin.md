---
title: Backend step 8 - Admin APIs (config, users, audit log, kill switch)
date: 2026-10-22
author: alongkorn
ai: buffy
tags: session, backend, admin, config, users, audit, rbac, step8, detailed
summary: Admin-role APIs only (matrix roles); config catalogue + read-only spec keys, user invite/edit/deactivate, audit query and chain verify; 48 unit tests and 165 integration checks green, re-verified against generated mock data
---

## Goal

- Step 8 (Admin) backend only, branch `feature/backend-step8-admin`. No frontend wiring, no schema change, no new dependency, no `core/settings.ts` change.

## Done

- `GET /config` (81-key hand-written catalogue: 46 backend-read + 35 spec-only read-only), `PUT /config/{key}` (type/min/max, reason, optional `If-Match`, scope enforcement).
- `POST /agent/kill-switch` (single GLOBAL `agent.enabled`).
- `GET /users`, `POST /users` (idempotent), `PATCH /users/{id}` (roles/primaryRole/scope/active).
- `GET /audit-log` (filters, cursor, HA scoping + own-hospital `entity_type='hospital'` rows), `GET /audit-log/verify` (`audit_chain_verify()`).
- Mounted in `app.ts`; unit + scratch HTTP checks.

## Decisions

- Roles exactly as matrix §2: config/audit/users = HOSPITAL_ADMIN+SYSTEM_ADMIN; kill-switch and `/audit-log/verify` = SYSTEM_ADMIN only. No REGION_ADMIN/AUDITOR.
- Read-only keys are visible with file defaults; PUT → 422 `CONFIG_READ_ONLY` (no backend reader yet).
- Restricted prefixes (`borrow.score.*`, `ved.z.*`, `agent.*`) → 403 for HOSPITAL_ADMIN (§23).
- Omitted PUT scope: HA → own hospital; SA → GLOBAL (never infer an existing region/hospital row).
- Users: INVITED derived (active + never logged in); `local:<uuid>` cognito_sub, no password/e-mail; SoD validated before the trigger; last-admin + self-lockout guards; deactivation is `active:false`.

## Files touched

- New `backend/src/modules/admin/{admin.types,config.catalogue,config.rules,config.service,config.routes,users.rules,users.service,users.routes,audit.service,audit.routes}.ts`
- New `backend/tests/admin.rules.test.ts`; changed `backend/src/app.ts`.

## Verification

- `npm --prefix backend run build` 0; `npm --prefix backend test` 48/48 (11 new).
- Integration suite `npm --prefix backend run test:integration`: 165 checks, 0 failures, on DB `doorare_step8` rebuilt from `db/schema.sql` v1.5 + generated mock data (44 users, 5 hospitals, 2 931 login events). Assertions cover 401/403 matrix, scope isolation, idempotent replay, audit rows and chain = 0. (The original scratch script was `/tmp/step8-check.mjs`.)

## Errors

- `pg_dump` 18 emitted `transaction_timeout`, rejected by PG16 → applied `db/schema.sql` via the container instead.
- Stale node listener on :3101 masked a rebuild (checks hit old code) → kill by `lsof -ti tcp:3101`.
- SA PUT without scope initially reused the only existing row (a REGION override) → changed to explicit GLOBAL default.

## Repeatable verification (follow-up)

- Moved the scratch suite into `backend/tests/integration/admin.integration.test.ts` (`node:test` + `assert/strict`, no new deps). It runs the app in-process on an ephemeral port and needs `TEST_DATABASE_URL`; it refuses the main DB / maintenance DBs and a database without the DooRare schema, and never resets anything.
- `npm --prefix backend run test:integration` (script added to `backend/package.json`); `npm test` still runs only `tests/*.test.ts` (48 unit tests, no DB needed — verified with a bogus DB host).
- 164 checks (a superset of the original 160: `/health`, `UPDATE`/`DELETE audit_log` rejected, plus non-empty assertions on the audit filters) and 11 `node:test` cases; fixtures are per-run (fresh region/hospitals/users, `cognito_sub = local:<uuid>`) so consecutive runs pass; global kill switch restored.
- Optional EXPLAIN block prints plans for the audit-log and users queries when `login_event + audit_log >= 100000`; exercised once with 100k synthetic `login_event` rows (then deleted), otherwise logs the counts and skips.
- `backend/tests/integration/README.md` documents the pg_dump copy (`docker exec doorare-db pg_dump -s` to avoid the host v18 `transaction_timeout`), the run command and the re-run behaviour.

## Re-verification against mock data (same day, follow-up)

- **Main DB was not updated.** `db/schema.sql` and `db/mock/` have no tracked diff; the live `doorare` is still schema **v1.4** (65 tables, no `app_user_role` / `login_event` / `vehicle` / `v_transport_item`; `app_user` lacks `mfa_enabled`/`last_login_at`/`last_seen_at`, `audit_log` lacks `reason`/`agent_run_id`, `hospital` lacks `province`/`tier`/`bed_count`/`address`/`phone`) and is **empty** (0 users/hospitals/regions/config/audit). `db/mock/csv` was also absent; the generator fails on the system Python 3.9 (`bisect.insort(..., key=)` needs 3.10+).
- Created a literal `pg_dump` copy of main: suite rejected it with the new v1.5 preflight (`province does not exist` before the preflight was added). **Classification: schema drift, not a Step 8 bug.**
- Rebuilt `doorare_step8` from `db/schema.sql` v1.5, generated mock CSVs with Python 3.12 (`db/mock/csv`, gitignored, 1 523 168 rows), loaded via `/mock/load.sql` + `views.sql` (10.7 s).
- Mock run failure: `expiry.plan_approval_timeout_h` scope `GLOBAL` vs expected `DEFAULT` — **test fixture assumption**, not a Step 8 bug (the mock configures that key). Fixed by picking any catalogue key with no `config_setting` row; fixtures also get a random suffix in `stamp`.
- Final: 11/11 tests, 165 checks, twice consecutively on the mock copy; integration preflight on a v1.4 copy lists the 9 missing v1.5 objects and exits 1 before fixtures.
- Perf: mock has only ~3k login events, so added opt-in `PERF_SEED_LOGIN_EVENTS=100000` (labelled rows, removed in `finally`). Run printed both EXPLAIN plans (login_event 102 955 / audit_log 51); audit_log stays small, so its plan is not representative of production volume.

## Known gaps

- Runtime lookups in `core/settings.ts` still ignore REGION (display only in `/config`).
- `app_user` has no version column → user PATCH is last-write-wins.
- No agent runtime consumes `agent.enabled`; SA console still mocks 5 switches.
- `agent.model_id` is the only agent key added; other `agent.*` keys stay out (not read, not requested).
- Catalogue duplicates `config-defaults.yaml` by hand; keep both in sync.

## Next

- Frontend wiring of HA screens / SA tabs (separate request); add REGION to `getSetting` when approved.
