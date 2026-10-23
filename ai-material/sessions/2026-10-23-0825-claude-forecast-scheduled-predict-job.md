---
title: Forecast scheduled predict job (Option A + Option B dynamic DB export)
date: 2026-10-23
author: alongkorn
ai: claude
tags: session, backend, forecast, scheduler, export, aws-prep, f1
summary: Option B completed: Postgres usage & snapshot streaming export -> predict up to 21 Oct
---

## Goal

- Option A: Scheduled F1 predict job every 3 days on existing data, portable to AWS.
- Option B: Automatically export live usage and stock snapshots from PostgreSQL (to 2026-10-21) into the model's CSV pack before inference so predictions remain current without retraining.

## Done

- Branch: `feature/forecast-scheduled-predict` (cut from `feature/backend-api`).
- **Option B Implementation (`forecasts.export.ts`):**
  - Streams `usage_daily` (676,378 rows) and `stock_snapshot` (676,378 rows) from PostgreSQL via native `COPY TO STDOUT` using `pg-copy-streams`.
  - Atomic write via temporary files; total export time is **~1.1s** for both tables.
- **Job Orchestration (`forecasts.job.ts`):**
  - Order: Export from DB (if `FORECAST_JOB_EXPORT_DB=true`) -> Python predict WEEK + MONTH -> load JSON into `forecast_run` / `forecast_result` -> re-evaluate alerts -> log `FORECAST_JOB` to `audit_log`.
  - End-to-end run succeeds in ~6.8 seconds total.
  - Advance WEEK origin from 2026-09-21 to **2026-10-12** (predicting week 2026-10-19 to 2026-10-25).
  - Loaded fresh weekly run (`loaded: true`), updated 24 alerts, and closed 2 resolved alerts against actual October stock.
- **Model Compatibility (`predict.py`):**
  - `F1_STALE_AFTER_DAYS` env override prevents STALE_INPUT aborts on older data boundaries (+ unit test).
  - Frozen model artifacts untouched; inference handles 173 series without retraining.
- **Config & Triggers:**
  - `FORECAST_JOB_ENABLED` (default false): opt-in timer in `index.ts` (hourly due check, survives server restarts).
  - `FORECAST_JOB_EXPORT_DB` (default true when job runs): toggles DB export.
  - `POST /api/v1/jobs/forecast-predict` (SYSTEM_ADMIN): manual / AWS EventBridge Scheduler trigger.

## Decisions

- Use `pg-copy-streams` for zero-overhead streaming directly from Postgres, avoiding memory spikes.
- Atomic file replacement (`.tmp` -> `.csv`) ensures concurrent readers never observe partially written files.
- Keep `FORECAST_JOB_ENABLED=false` as default so teammates pulling `backend-api` are not forced to run Python in background.
- Keep audit-driven due calculation (`max(occurred_at) FROM audit_log WHERE action = 'FORECAST_JOB'`) so restarts don't push the 3-day schedule out.

## Files touched

- `backend/src/modules/forecasts/forecasts.export.ts` (new)
- `backend/src/modules/forecasts/forecasts.job.ts`
- `backend/src/modules/forecasts/forecasts.runs.ts`
- `backend/src/modules/forecasts/forecasts.routes.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`
- `backend/src/index.ts`
- `backend/package.json` (added `pg-copy-streams`, `@types/pg-copy-streams`)
- `backend/models/f1_forecast/predict.py`
- `backend/models/tests/test_predict.py`

## Verification

- `npm --prefix backend run build` clean.
- `npm --prefix backend test` (48 unit tests pass).
- Real Python predict WEEK and MONTH exit code 0.
- Real end-to-end job verified against live Postgres container `doorare-db` (audit row appended, alert counts verified).

## Next steps

- AWS deployment: package this job into a container image for Lambda or ECS Fargate; configure AWS EventBridge Scheduler to call `POST /api/v1/jobs/forecast-predict`.
