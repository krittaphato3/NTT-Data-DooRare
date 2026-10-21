---
title: F1 quantile forecast module (Phase 7a — inference CLI + JSON contract)
date: 2026-10-20
author: sun
ai: buffy
tags: session, ml, forecast, quantile, inference, json, backend
summary: predict --granularity WEEK|MONTH writes 173 rows per granularity (167 model + 6 MA_ES fallback for MONTH), parity 0, calibrated WEEK
---

## Goal

- Phase 7a only: Python inference (`f1_forecast/predict.py`) + JSON contract. No Node/`backend/src`, no npm,
  no retraining, no new test evaluation, `data/` read-only.

## Done

- `predict.py`: builds the latest origin with the training builders (`require_target=False`, no splits), scores
  the pinned frozen artifact, applies calibration as configured (WEEK global on / MONTH off), clips ≥ 0, sorts,
  rounds to 3 dp, then derives TT / rop / Q_q(L) / projected on-hand from the stored values.
- `features.build_weekly/build_monthly`: `require_target` flag (default `True`, so training output is unchanged);
  `assign_splits=False` for inference; last origin is no longer dropped when the target is partial.
- `cli.py`: `predict --granularity WEEK|MONTH [--as-of]` + `parity`; structured JSON errors on stderr and exit
  codes 3 NO_MODEL / 4 STALE_INPUT / 5 INSUFFICIENT_DATA / 6 SCHEMA_MISMATCH (0 OK, argparse 2).
- Config: `inference.{model_versions, stale_after_days: 30, min_history_periods: 26, write_csv,
  projected_on_hand_quantiles}`; outputs under `artifacts/forecasts/<model_version>/` (gitignored).
- Outputs: `forecast_WEEK_2026-09-21.json` (origin 2026-09-21, dataEnd 2026-09-30, 173 QUANTILE_LGBM,
  166 OK / 7 COLD_START) and `forecast_MONTH_2026-09-01.json` (origin 2026-09-01, 167 model + 6 MA_ES
  FALLBACK_CLASSICAL, 166 OK / 1 LOW_CONFIDENCE).
- Parity (`reports/parity.json`): WEEK 332 valid rows, max abs diff 0 uncalibrated **and** calibrated;
  MONTH 332 rows, 0 (calibration off).
- `tests/test_predict.py` (20 tests): parity, counts, monotone/non-negative, F-06 TT, F-08 u, ASM-43 Q_q(L),
  projected on-hand, flags, calibration switch, NO_MODEL/STALE_INPUT/SCHEMA_MISMATCH exit codes.
- 92 tests green; `cli validate` 13/13 PASS; `cli features` 77,565 / 17,763 rows as before; model artifacts
  byte-identical (sha256 before == after).
- README: Inference section + exit-code table + definitions; `current-task.md`, this note, `INDEX.md` updated.

## Decisions

- `stale_after_days = 30`: the frozen pack ends 2026-09-30, so FR-F1a-013's 7-day rule (alert suppression)
  would reject every run. Configurable, documented.
- Time-varying inputs (sigma, demand pattern, stock) are computed to `dataEnd`, not to `originUsed`, because
  that is the latest observed state; `periodStart = origin + 1` period can be partly inside the data window.
- MONTH fallback = existing MA/ES point at the origin + VED-class pooled residual std (F-04 fallback), and
  `COLD_START` pooled class quantiles when MA/ES has no point; no silent zeros, every series emitted.
- `LEAD_TIME_QUANTILE_APPROX` lives in a row-level `flags` array (method flag) so it does not pollute the
  `confidenceFlag` precedence that maps to `forecast_result.confidence_flag`.
- No PO arrival dates exist in the pack, so `leadTimeDays` = `standard_lead_time_days`, stated in contract,
  definitions and README instead of inventing an ETA.

## Files touched

- `backend/models/f1_forecast/{predict.py (new), features.py, cli.py, config.py}`,
  `backend/models/config/forecast.yaml`, `backend/models/tests/test_predict.py` (new), `README.md`.
- This note, `ai-material/context/current-task.md`, `ai-material/INDEX.md`.

## Errors

- First band rounding produced `totalTarget`/`leadTimeQuantile` values that did not match `ceil(pXX)` from the
  JSON itself; fixed by rounding the ordered bands to 3 dp first and deriving every downstream field from them.
- `--as-of` in the future raised a pandas parse path; now returns INSUFFICIENT_DATA with the latest origin.

## Next steps

- Phase 7b (awaiting approval): Node endpoints / module reading these JSON files; do not start before sign-off.
