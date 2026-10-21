---
title: F1 quantile forecast module (Phase 6a — evaluation report and diagnostics)
date: 2026-10-20
author: sun
ai: buffy
tags: session, ml, forecast, quantile, evaluation, slices, diagnostics, backend
summary: Common-row slices, concentration, TT impact, crossings, gain importance for WEEK + MONTH
---

## Goal

- Phase 6a only: evaluation report/slices/diagnostics from frozen models. No calibration, no retraining,
  no change to artifacts, meta, config selection or existing test reports.

## Done

- Re-scored the frozen WEEK artifact (predictions had been deleted) and saved
  `data/model_predictions_week_{valid,test}.parquet`; every aggregate equals the saved report exactly
  (test 24.1348 / 11.7363 / 7.3171, cov 0.8825 / 0.9418, raw crossing 0.1714).
- New `f1_forecast/evaluation.py` + `cli report --granularity WEEK|MONTH|BOTH`; reads saved row-level
  predictions and baseline predictions only.
- Wrote `reports/evaluation.{md,json}`, `reports/evaluation_slices.csv`, `reports/evaluation_series.csv`
  (no per-granularity JSON, no `evaluation_csv/` directory).
- Every report now opens with a verification table: saved-vs-recomputed all-rows pinball/coverage/WAPE per split.
  All four splits: max abs diff **0.0000**, `all_match: true` (recomputed from the saved parquets).
- 3 new tests; 63 total green (`pytest -q`, exit 0).

## Decisions

- Gate and all diagnostics use the common row set (WEEK 4,648; MONTH 1,992 valid, 1,992 of 1,993 test).
- Slices are all-rows; delta is vs the lowest-P50 baseline in the same slice. <100 rows = low confidence.
- TT definitions are the module's: V→P95, E→P90, D excluded, floored at P50; overstock at 2×TT.
- Crossing gap fraction uses `max(P50, 1)` as the denominator so near-zero P50 does not explode the ratio.
- Volume terciles are per-series total `y` inside the split.

## Files touched

- `backend/models/f1_forecast/{evaluation.py,model.py,cli.py}`, `tests/test_evaluation.py`,
  `reports/evaluation*`, `README.md`, this note, `INDEX.md`, `context/current-task.md`.
- New derived files (gitignored): `data/model_predictions_week_{valid,test}.parquet`.
- Frozen artifacts, `meta.json`, WEEK/MONTH saved reports and `data/**` untouched.

## Findings (short)

- WEEK loses in VED D, HIGH price tier, TERTIARY at P95 and zero-heavy at P95 (small margins, 196–280 rows).
- MONTH loses in HIGH price tier (84 rows, low confidence), zero-heavy (48 rows, low confidence) and at P50
  for SUPPLY item type; tails are much better than every baseline.
- Concentration: top-10 series carry 63 % (WEEK) and 67–75 % (MONTH) of total pinball.
- MONTH gain is dominated by `lag_1m` (57.6 % at P50, 42.5 % at P95); WEEK tops out at 26.7 % / 28.1 %.
- Crossings concentrate in high-volume series (MONTH high tercile 61 %, low 20 %); WEEK high 25 % vs low 18 %.
- TT impact: the narrower model bands raise forecast stock-out rates above seasonal naive (WEEK 8.8 % vs
  5.0 %, MONTH 9.0 % vs 4.4 %) and overstock rates; under-TT THB is lower than seasonal on test weekly
  (232k vs 273k) but higher monthly (239k vs 117k).

## Errors

- `attach_attributes` first excluded the merge keys themselves; keys must always be selected.
- `metrics.evaluate_predictions` measures crossing on fixed bands, so aggregate verification must use
  `model.evaluate_frame` (which reads the raw columns).
- Loaded artifacts hold a plain `lgb.Booster`, not the sklearn wrapper (`booster_`).
- The test label was applied to every test split, so MONTH claimed "re-score of frozen model" although only WEEK
  was re-scored; fixed to provenance per granularity (WEEK re-score / MONTH saved predictions). Re-rendered
  from the saved JSON — only label and the new verification block moved; no metric changed.

## Corrections to the chat summary

- Report outputs are `evaluation.json` / `evaluation_slices.csv` / `evaluation_series.csv` — not
  `evaluation_{WEEK,MONTH}.json` or `reports/evaluation_csv/*.csv` (those paths do not exist).
- MONTH test all-rows pinball is **84.0882 / 37.5302 / 21.8117**; 118.84 / 48.99 / 28.86 is the
  `empirical_quantile` baseline in the same table.
- WEEK test 24.1348 / 11.7363 / 7.3171 stands (verified, max diff 0.0000).

## Next steps

- Phase 6b (after approval): CQR/calibration for both granularities, reusing the saved predictions and this
  report for before/after comparison. Phase 7 not started.
