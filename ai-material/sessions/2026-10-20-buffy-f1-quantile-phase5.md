---
title: F1 quantile forecast module (Phase 5 — monthly quantile model)
date: 2026-10-20
author: sun
ai: buffy
tags: session, ml, forecast, quantile, lightgbm, monthly, model, backend
summary: MONTH model (7 quantiles, 167 series); gate passes vs all 3 baselines on test #1
---

## Goal

- Phase 5: monthly LightGBM quantile model — 7 quantiles, valid-only selection, one test evaluation,
  row-level predictions saved for later diagnostics. No Phase 6 work.

## Done

- `model.py`/`cli.py` generalised by granularity (dataset, grid, params, version, artifact, reports,
  common-row gate); `evaluate` writes `data/model_predictions_<gran>_<split>.parquet`.
- Artifact `artifacts/f1-MONTH-2026-08-01-8f70f4a87d1e-r2/` (33 features, `all_history`, sort bands,
  cap 5,000 recorded). 13,446 / 1,992 / 1,993 rows; 166 / 166 / 167 series.
- Test (monthly evaluation #1, common 1,992 rows): pinball 84.08 / 37.48 / 21.77, coverage 0.878 / 0.946,
  WAPE 0.057; beats seasonal naive (98.23), MA/ES (161.92) and empirical (118.84) at P50/P90/P95,
  both filters.
- 60 tests green; WEEK artifact and WEEK reports untouched.

## Decisions

- Grid (12 configs, lr .03/.05 × leaves 7/15/31 × mcs 10/20) selected on valid; every quantile landed on
  `lr = 0.03` and `mcs = 10` (grid minima), leaves 31 for four quantiles — grid-edge limitation recorded.
- Post-processing: sort, because isotonic had a worse coverage score (0.0093 vs 0.0033) despite better P90
  coverage. Same pre-registered rule as WEEK.
- `model_version_revision: 2` added to the config so new artifacts get `-r2`; the frozen WEEK artifact keeps
  its original version string on purpose.
- Gate is computed on the common row set for MONTH; `evaluation.gate.must_beat_baselines` now lists all three.

## Files touched

- `backend/models/{f1_forecast/model.py,f1_forecast/cli.py,config/forecast.yaml,tests/test_model.py}`,
  `reports/model_{train,test,valid}_month.*`, `README.md`, this note, `INDEX.md`, `context/current-task.md`.
- `data/**` untouched. New derived files (gitignored): `data/model_predictions_month_{valid,test}.parquet`.

## Errors

- Grid loop reused the variable `key` (granularity) for `(variant, quantile)` → `model_version` saw a tuple;
  renamed the loop slot. Caught by the smoke run before training.
- The monthly gates need the common row set; each side's own rows differ (1 row: a cold-start series with
  2 history periods has no baseline).
- Raw crossing at monthly level is 36 % (61 % of crossing rows substantive) — sorting hides it, flagged for
  Phase 6.

## Next steps

- Phase 6 (after approval): joint CQR / conformal for both granularities; per-series coverage is still
  unjudgeable monthly (all series LOW_N, 12 periods).
