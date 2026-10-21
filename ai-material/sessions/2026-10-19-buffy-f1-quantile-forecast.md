---
title: F1 quantile forecast module (Phase 0 + Phase 1)
date: 2026-10-19
author: sun
ai: buffy
tags: session, ml, forecast, quantile, lightgbm, data-quality, backend
summary: backend/models Python module; config + read-only data validation (13 checks, 18 tests)
---

## Goal

- F1 quantile demand-forecast module (WEEK + MONTH): Phase 0 (env/config/CLI) and Phase 1 (loading,
  validation, series inventory) only. Target = forward dispensed usage; no DB writes.

## Done

- New `backend/models/`: `config/forecast.yaml` (paths, quantiles, splits, gates, expectations),
  `f1_forecast/{config,schema,data_loader,clean,validate_data,cli}.py`, `tests/`, `requirements.txt`,
  `README.md`, `backend/.dockerignore`. Venv `.venv` at repo root; lightgbm 4.7.0 on Python 3.13.
- `cli validate` = 13 checks, all PASS: 191 listings − 3 blood − 15 Min-Max = 173 series; 188 daily series /
  661,411 rows reconcile with the pack; 7 cold-start series (test-only, 43 rows); weekly matrix 77,565 rows,
  splits 68,226/4,648/4,691; monthly build projects exactly 17,763 rows; 23,991 stock-out days (3.57%).
- `pytest -q` 18 passed. Reports: `backend/models/reports/data_quality.{json,_summary.md}`.

## Decisions

- 7 quantiles, only P50/P90/P95 map to `forecast_result`; venv at repo root (`../../.venv/bin/python`).
- `is_high_alert`/`is_controlled` also resolved via the `gp_id` fallback (F1b/F2 need them).

## Files touched

- Added `backend/models/**`, `backend/.dockerignore`, this note, `INDEX.md` row, `context/current-task.md`.
  `data/**` untouched (read-only).

## Errors

- `df[tuple]` is one column key, not a list → wrap in `list()`; `REPO_ROOT` needed one more `.parent`;
  target windows are `[origin, +6]` / `[+7, +13]` (caught by the 300-row spot check); `covid_phase` mixes
  types → read as `string`.

## Next steps

- Phase 2 (baselines, walk-forward backtest, metrics) after approval, re-reading the matching
  `specification/` sections (F-03/F-04/F-24). Monthly `forecast_backtest` needs granularity columns before
  monthly results can be persisted (separate schema task).
