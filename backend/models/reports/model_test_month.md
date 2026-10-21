# Phase 5 - monthly quantile model (test) - evaluation #1

Generated: 2026-10-20T02:03:30+00:00 (MOCK DATA - not real accuracy)

- Model: `f1-MONTH-2026-08-01-8f70f4a87d1e-r2`; features 33; postprocess `sort`; train window `all_history`
- **This is monthly test evaluation #1**; all choices were frozen on valid before it ran.
- Rows: 1,993 / series 167; raw crossing rate 0.3653 (bands are fixed before scoring)
- Series without any row in this split: 6 (inference must use a fallback: COLD_START / MA_ES)

## Model metrics

| filter | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | crossing_rate_fixed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| all_rows | 1993 | 84.0882 | 37.5302 | 21.8117 | 0.5008 | 0.8776 | 0.9453 | 168.1763 | 0.0575 | 748.2805 | 0.3653 | 0.0000 |
| no_stockout_rows | 1899 | 85.6949 | 38.3028 | 22.1940 | 0.5066 | 0.8805 | 0.9458 | 171.3897 | 0.0571 | 769.3303 | 0.3649 | 0.0000 |

## Gate vs baselines (common row set, 1992 rows)

| filter | baseline | delta P50 | delta P90 | delta P95 | beats |
|---|---|---|---|---|---|
| all_rows | seasonal_naive | -14.1492 | -82.9694 | -80.3881 | True |
| all_rows | ma_es_residual_quantile | -77.8427 | -27.6195 | -16.4518 | True |
| all_rows | empirical_quantile | -34.7576 | -11.5196 | -7.0924 | True |
| no_stockout_rows | seasonal_naive | -14.8126 | -84.2907 | -81.5463 | True |
| no_stockout_rows | ma_es_residual_quantile | -80.1089 | -28.1706 | -16.9564 | True |
| no_stockout_rows | empirical_quantile | -35.9753 | -12.0415 | -7.5535 | True |

Gate passed: **True**

## Cold-start series (LOW_N)

- none

## Notes

- Post-processing: `sort` (chosen on valid). Raw crossing is measured before the fix and recomputed on each filter's own rows; the fixed rate is after it.
- Interval width is P95 - P05 (all seven quantiles are trained), matching the baseline table.
- MOCK DATA: these numbers describe the synthetic generator.
