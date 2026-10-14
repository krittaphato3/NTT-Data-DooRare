---
title: DB schema v1.4 (spec gaps fixed)
date: 2026-10-14
author: Alongkorn
ai: claude
tags: session, database, schema, postgres
summary: Spec schema.sql patched to v1.4 in db/, tested on PG16 with mock data
---

## Goal

- Read DooRare spec + mock zip; fix schema gaps before FastAPI backend.

## Done

- Branch `feature/database-schema` (from transport-tracking).
- `db/schema.sql` = spec v1.3 + v1.4 patch (header lists changes).
  - G1 columns: granularity (forecast_result, stock_alert), incident type/ETA, borrow_leg.request_item_id, hospital/drug flags, document versioning.
  - G2: RLS on 5 tables; audit chain via `audit_chain_head` + `audit_chain_verify()`.
  - G3 enums: mapping DEPRECATED, alert_type +3, forecast_granularity, eta_source.
- Tested in postgres:16: schema applies (63 tables), mock CSV (1.4M rows) loads, RLS counts match, 1600 concurrent audit inserts → chain intact.

- Added `db` service to docker-compose (container `doorare-db`, port 5442, volume `doorare_pgdata`), `scripts/db.sh`, npm `db:*`; mock in `db/mock/` (CSV gitignored). `db:reset` loads 48 tables, counts match.

## Decisions

- Keep triage BLACK; no kit rules for BLACK.
- Stack: FastAPI per spec (`apps/api` later).
- New columns nullable/defaulted so v1.3 mock data still loads.
- Audit chain order = commit order, not id; verify walks prev_hash.
- Frontend mock data left untouched.

## Files touched

- `db/schema.sql`, `db/mock/*`, `docker-compose.yml`, `scripts/db.sh`, `package.json`, `.gitignore`, runbook.

## Errors

- Advisory lock alone still forked audit chain (id assigned before trigger) → replaced by head table.

## Next steps

- Backfill mock for new columns (generate.py), add "today" seed (live shipments/requests/agent_run).
- Update `DooRare-Schema.md`; scaffold `apps/api`.
- Mock hospital names ("โรงพยาบาลตัวอย่าง เอ") differ from frontend names.
