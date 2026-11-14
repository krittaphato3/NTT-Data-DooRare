---
title: Database reset, forecast artifact generation, and role demo scenarios
date: 2026-10-22
author: krittaphat
ai: zcode
tags: session, db, reset, demo, scenarios, forecasts, docker
summary: Pulled latest feature/backend-api branch, added forecast artifact generation helper, mounted forecasts into backend container, executed db reset and demo scenarios.
---

## Goal

- Pull the latest `feature/backend-api` branch from remote.
- Execute database reset (`npm run db:reset`), recreate schema, load base mock data, 01-backfill, and 02-shape.
- Execute scenario generation script (`npm run db:scenarios`) to populate live demo work for Pharmacist, ER, Warehouse, and Driver roles.

## Done

1. **Pull & Branch Tracking**:
   - Pulled latest changes from `origin/feature/backend-api` (up to commit `c297aa7` with demo accounts and route guards).
   - Set up and checked out local tracking branch `feature/backend-api`.

2. **Forecast Artifacts Generation & Docker Mount**:
   - Identified that `npm run db:scenarios` expects F1 forecast JSON contracts (`forecast_WEEK_*.json` and `forecast_MONTH_*.json`) in order to evaluate stock alerts and compute lender stock safety / Total Target.
   - Built `backend/scripts/generate-forecast-artifacts.ts` to compute standard F1 weekly and monthly quantiles from historical database usage (`F-06`, `F-08`, `F-09`).
   - Mounted `./backend/models/artifacts/forecasts` into `doorare-backend` in `docker-compose.yml` so the backend container can read forecast files.
   - Added automatic forecast generation in `scripts/db.sh` when artifacts are not present.

3. **Database Reset & Scenarios Execution**:
   - Performed clean `npm run db:reset` (rebuilt `doorare_pgdata`, re-applied `schema.sql`, loaded ~1.4M rows of base mock CSV, applied `01-backfill.sql` and `02-shape.sql`).
   - Ran `npm run db:scenarios`:
     - Forecast run (WEEK + MONTH) loaded and stock alerts evaluated (HA/NORMAL=2, HA/URGENT=4, HA/VERY_URGENT=3, HB/NORMAL=2, HC/URGENT=1).
     - Near-expiry scan executed.
     - Borrow requests created and progressed across stages (very urgent arrived, waiting to load, pending response, rejected, proposal waiting approval, draft, manual requests).
     - Near-expiry lots processed with agent plan and review.
     - ER incidents initialized (Bus crash plan approved and emergency borrow kits confirmed; chemical leak awaiting approval).

4. **Verification**:
   - Backend unit tests: 48/48 passed (`npm --prefix backend test`).
   - Frontend production build: passed cleanly (`npm --prefix frontend run build`).
   - Backend health endpoint: HTTP 200 with 44 users connected.

## Decisions

- Maintained the single database model with `db:reset` and `db:scenarios` as standard reproduction commands.
- Mounted forecast artifacts directory as read-only volume in Docker compose to keep development and container behavior unified.

## Files Touched

- `docker-compose.yml`
- `scripts/db.sh`
- `backend/package.json`
- `backend/scripts/generate-forecast-artifacts.ts`
- `ai-material/sessions/2026-10-22-zcode-db-reset-and-scenarios.md`

## Next Steps

- Test role flows on web UI via http://localhost:8080 (or `npm run dev:frontend` at :5173).
