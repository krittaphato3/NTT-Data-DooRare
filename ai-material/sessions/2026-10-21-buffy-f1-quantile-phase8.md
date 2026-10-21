---
title: F1 quantile forecast module (Phase 8 — closing, scripts + docs only)
date: 2026-10-21
author: sun
ai: buffy
tags: session, ml, forecast, quantile, docs, scripts, verification, backend
summary: run_all.sh (no training) green; README completed; DoD checklist and API evidence printed
---

## Goal

- Phase 8 closing only: one-command verification script, complete README, DoD evidence. No model work,
  no retraining, no new test evaluations. No commits/pushes.

## Done

- `backend/models/scripts/run_all.sh` (new, executable): validate → features → `evaluate --split valid
  --no-report` (WEEK + MONTH, from the saved artifacts) → `predict WEEK` → `predict MONTH` → `pytest`.
  Deliberately contains no `train`. Real run exit 0: 13/13 checks, 7/7 build checks, gates pass, 173 rows
  per granularity, 94 tests. Output kept in `/tmp/run_all.out` (not committed).
- README (`backend/models/README.md`): status rows 7–8 updated, `scripts/run_all.sh` in Install/Commands,
  new *Config keys* table, *Model versioning*, *Calibration (split conformal)*, Layout line for `scripts/`,
  and the Limitations list extended with high-volume under-coverage, per-series win rates, constant monthly
  ctx flags, grid-edge selection, `incoming` timing, ASM-43 approximation, untested SQL path, no DB ingestion.
- Evidence printed in chat: openapi envelope/nested fields the API does not produce (`version`, `minLevel`,
  `maxLevel`, `borrowQty`, DB-path `p05/p10/p25/p75`, `stockOnHand/incoming/projectedOnHand`, `originUsed/dataEnd/calibration`, JSON-path names, `history/backtest`), smoke JSON for list (2 filters) / detail /
  404 / 400 / `LOW_CONFIDENCE`, and mounted routes vs `x-roles` (API-F1a-001/002; -003 absent).
- DoD checklist printed PASS/PARTIAL/NOT DONE with an evidence file per item.

## Decisions

- `evaluate` uses the **valid** split with `--no-report`: proves the saved artifact still scores without a
  fourth test look and without rewriting predictions/reports.
- `run_all.sh` uses `pytest` without an extra `-q` (pytest.ini already adds it); `-q -q` hid the
  "94 passed" summary.
- README keeps the OpenAPI envelope as-is: the spec's `ForecastDetail`/`ForecastList` are generic
  (`additionalProperties: true`), so the field-level contract is documented per item, not re-specified.

## Files touched

- `backend/models/scripts/run_all.sh` (new), `backend/models/README.md`, this note,
  `ai-material/context/current-task.md`, `ai-material/INDEX.md` (regenerated).
- No change to `data/`, model artifacts, calibration, `backend/src`, or the forecast JSON schema.

## Errors

- First smoke run from `/tmp` failed 404: `FORECASTS_DIR` falls back to `process.cwd()` candidates, so the
  compiled service must be run from the repo root (or with `FORECASTS_DIR` set).
- `pytest -q` (addopts already `-q`) printed dots only, no summary — use plain `pytest`.

## Next steps

- Persist the forecast JSON into `forecast_run`/`forecast_result` (writer) and exercise the SQL path against
  a live Postgres; add `granularity` to `forecast_backtest` for monthly history.
- Frontend wiring for API-F1a-001/002; `POST /forecasts/runs` when a job runner exists.
