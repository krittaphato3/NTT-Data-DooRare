---
title: F1 quantile forecast module (Phase 7a Step 0 + Phase 7b read API)
date: 2026-10-20
author: sun
ai: buffy
tags: session, ml, forecast, api, backend, json, express
summary: JSON contract text fixed for per-granularity scaling; Node read API for forecasts with DB-then-JSON fallback
---

## Goal

- Step 0: make the forecast JSON `definitions` match the code (per-granularity ASM-43 scaling), prove the
  MONTH divisor, document the `dataEnd` stock caveat. No model/artifact changes.
- Phase 7b: read-only Node API for forecasts (API-F1a-001 list, API-F1a-002 detail).

## Done

- Step 0: `definitions.leadTimeQuantile` now says WEEK band × L/7, MONTH band × L/30, spec's L-switch
  approximated and always flagged; `definitions.projectedOnHand` documents that `stockOnHand` is at `dataEnd`
  (mid-week ⇒ WEEK projections slightly pessimistic). README + 3 tests updated; JSON regenerated.
- MONTH proof: 70 rows with L ≤ 7; sample `HA/763354` p95 108.0, L 7 → `leadTimeQuantile` 26 = ceil(108×7/30).
  Code already used /30 for MONTH — no bug, regression test added.
- 18 frozen artifact files byte-identical (sha256), calibration.json unchanged; pytest 94 passed.
- 7b: `backend/src/modules/forecasts/{types,repository,service,controller,routes}.ts`, mounted at
  `/api/v1/forecasts`; `config/env.ts` gains `forecasts.dir` (`FORECASTS_DIR`, else cwd candidates) and
  `staleAfterDays: 30`. Reuses `requireAuth` / `requireRole` / `scopeHospitalId`, `HttpError` + `errorHandler`.
- DB first (`v_latest_forecast` + joins + `forecast_result` history + WEEK `forecast_backtest`), JSON fallback
  chosen by `originUsed` then `modelVersion`, cached by mtime. `meta.source` + `meta.dbError` disclose it.
- `npm --prefix backend ci` and `npm --prefix backend run build` pass; smoke script (compiled service, no
  Postgres, no server) shows list/filters, detail, 404, 400s. `POST /forecasts/runs` left out (write/job).
- `backend/README.md` created (API section, env, Docker volume note, field table, MOCK DATA caveat).

## Decisions

- `POST /forecasts/runs` omitted: triggering a run is a write/job, not read-only.
- Detail `version: null` (no version column) instead of a fake `0`; `history`/`backtest` empty on JSON.
- No confidence-based filtering or alert derivation in the API; flags are returned verbatim.
- Cursor = base64url offset (limit+1 query detects the next page).

## Files touched

- `backend/src/modules/forecasts/*` (new), `backend/src/config/env.ts`, `backend/src/app.ts`,
  `backend/README.md` (new), `backend/models/f1_forecast/predict.py` (text only),
  `backend/models/tests/test_predict.py`, `backend/models/README.md`, regenerated forecast JSON.
- This note, `context/current-task.md`, `INDEX.md`.

## Errors

- First `tsc` run: `readJsonForecast` used `{file, payload}` while the type expected `{path, payload}`, and the
  cache returned `cached.payload` instead of `cached.file.payload` — fixed, build green.
- Piping the smoke script through `head` produced a false exit 1 (EPIPE); redirect to a file and check `$?`.

## Next steps

- Persist forecast JSON into `forecast_run` / `forecast_result` (writer) so the DB path is exercised; SQL is
  untested against a live DB here (Postgres not started).
- Frontend wiring for API-F1a-001/002; `POST /forecasts/runs` when a job runner exists.
