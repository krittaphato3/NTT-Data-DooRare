---
title: F1 quantile forecast module (Phase 6b — series diagnostics + conformal calibration)
date: 2026-10-20
author: sun
ai: buffy
tags: session, ml, forecast, quantile, calibration, conformal, diagnostics, backend
summary: Per-series win rates, scale-free/TT/tercile diagnostics; WEEK global conformal enabled, MONTH disabled
---

## Goal

- Phase 6b only: series-level diagnostics on the frozen predictions + split-conformal calibration decision.
  No retraining, no writes into frozen artifacts, decisions on valid only, test scored once.

## Done

- `f1_forecast/calibration.py` (fit/apply/save/load, pre-registered rule, config switch),
  `f1_forecast/diagnostics.py` (A1–A4 + calibration study), `cli diagnose|calibrate`, 9 new tests.
- Reports: `reports/diagnostics.{md,json}` + `diagnostics_series.csv`; `reports/calibration.{md,json}` +
  `calibration_{check,test}.csv`. Params at `artifacts/calibration/<model_version>/calibration.json`.
- Frozen artifacts byte-identical before/after (sha256 of all 18 files compared).
- **WEEK**: global passes on the valid check half (coverage error 0.0145 -> 0.0024, width x1.093, pinball
  +1.2 % at P90); tercile rejected on width (x1.136). Test (look #3, "calibrated test evaluation (new)"):
  coverage 0.884/0.943 -> 0.897/0.952, width +7.7 %, TT stock-out 0.0884 -> 0.0760 (nominal 0.0744),
  gate still beats all three baselines. **MONTH**: global raised the coverage error (0.0139 -> 0.0151) and
  tercile is infeasible (336/330/330 < 500 rows) -> disabled, no test look.
- Key diagnostic: WEEK test win rate vs best baseline is only 50.6/44.0/36.8 % of series (P50/P90/P95);
  MONTH 40.4/47.0/44.6 %. Model beats nominal stock-out (0.0884/0.0897 vs 0.0744) and is weakest in the
  high-volume coverage tercile (MONTH 0.855/0.933).

## Decisions

- Boundary rule: METH picked global; tercile needs >=20 % less coverage error, width cap 10 %.
- Calibration offsets left as a global shift; MONTH left uncalibrated rather than "something".

## Files touched

- `backend/models/f1_forecast/{calibration,diagnostics,cli}.py`, `tests/test_calibration.py`,
  `config/forecast.yaml` (calibration block), `README.md`, reports above, this note, `INDEX.md`,
  `context/current-task.md`. `data/**` read-only.

## Errors

- Test fixture used `dtype={...}` on `DataFrame` (TypeError) -> cast in the frame instead.
- Crossing "before" must come from `raw_qXX`, not the shipped sorted bands; fixed before the test look.

## Next steps

- Phase 7 (inference CLI + Node module) after approval; MONTH calibration stays off unless a per-series
  approach is scoped.
