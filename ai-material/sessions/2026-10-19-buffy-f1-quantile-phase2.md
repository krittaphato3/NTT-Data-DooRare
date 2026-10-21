---
title: F1 quantile forecast module (Phase 2 — baselines, backtest, metrics)
date: 2026-10-19
author: sun
ai: buffy
tags: session, ml, forecast, quantile, baselines, backtest, metrics, backend
summary: WEEK baselines + walk-forward harness + F-24 metrics; MA/ES P90 coverage 0.911
---

## Goal

- Phase 2 only, weekly: F-24 metrics, F-03/F-04 baselines, granularity-agnostic backtest.

## Done

- `f1_forecast/{metrics,baselines,backtest}.py`, `clean.period_totals`/`next_period_start`, CLI `backtest`;
  39 tests green, 4 s run.
- Causal baselines: MA/ES + F-04 1-step residual quantile (`z*std` fallback, P99 winsorise), seasonal naive
  (lag 52), empirical trailing quantile. Panel 9,339 rows / 173 series / 14 blocks / 135 stock-out rows.
- Reports: `reports/baseline_metrics.{json,md}`, `baseline_metrics_by_series.csv`; predictions
  `data/baseline_predictions_week.parquet` (gitignored).
- No baseline dominates. Test pinball P50/P90/P95: seasonal 31.5/29.5/25.3, MA/ES 40.6/18.4/12.0,
  empirical 33.6/13.6/7.7. MA/ES P90 coverage 0.911 pooled, but 61 % (test) / 75 % (valid) of series inside
  ±0.05 — Phase 6 target.

## Decisions

- F-04 residuals are 1-step-ahead (`y_k − P50_{k−1}`); same-period gave 0.80 coverage.
- Baselines predict raw usage; only MA/ES trains winsorised. Block cutoffs count train history; only
  valid/test are scored.
- All-zero and LOW_N series excluded from the coverage pass rate, counted separately.

## Files touched

- Added three modules + four test files, reports, this note, `INDEX.md` row, `current-task.md`; edited
  `clean.py`, `cli.py`, `config/forecast.yaml`, `README.md`, `conftest.py`. `data/**` untouched.

## Errors

- `seasonal_naive.week_lag` KeyError (keys are `weekly_lag`/`monthly_lag`); duplicate `history_periods`
  broke `to_parquet`; `winsorise min_periods=8` blanked cold-start rows; removed dead `clean.target_window`
  + stray `numpy` import.

## Next steps

- Phase 3: weekly feature rebuild (no-lookahead ctx flags) + monthly matrix.
