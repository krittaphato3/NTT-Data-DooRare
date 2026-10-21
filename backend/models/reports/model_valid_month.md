# Phase 5 - monthly quantile model (valid) - evaluation #1

Generated: 2026-10-20T02:03:26+00:00 (MOCK DATA - not real accuracy)

- Model: `f1-MONTH-2026-08-01-8f70f4a87d1e-r2`; features 33; postprocess `sort`; train window `all_history`

- Rows: 1,992 / series 166; raw crossing rate 0.3619 (bands are fixed before scoring)
- Series without any row in this split: 7 (inference must use a fallback: COLD_START / MA_ES)

## Model metrics

| filter | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | crossing_rate_fixed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| all_rows | 1992 | 95.5894 | 43.7996 | 29.4770 | 0.5256 | 0.9001 | 0.9468 | 191.1789 | 0.0633 | 921.5270 | 0.3619 | 0.0000 |
| no_stockout_rows | 1875 | 96.3253 | 44.4938 | 29.6692 | 0.5253 | 0.9040 | 0.9499 | 192.6505 | 0.0633 | 916.2623 | 0.3627 | 0.0000 |

## Gate vs baselines (common row set, 1992 rows)

| filter | baseline | delta P50 | delta P90 | delta P95 | beats |
|---|---|---|---|---|---|
| all_rows | seasonal_naive | -34.4083 | -85.0391 | -79.638 | True |
| all_rows | ma_es_residual_quantile | -100.3597 | -29.4117 | -14.6217 | True |
| all_rows | empirical_quantile | -24.063 | -31.4936 | -12.8586 | True |
| no_stockout_rows | seasonal_naive | -32.1694 | -83.0559 | -78.2711 | True |
| no_stockout_rows | ma_es_residual_quantile | -100.8193 | -30.377 | -15.1229 | True |
| no_stockout_rows | empirical_quantile | -23.4955 | -32.4175 | -13.5055 | True |

Gate passed: **True**

## Cold-start series (LOW_N)

- none

## Notes

- Post-processing: `sort` (chosen on valid). Raw crossing is measured before the fix and recomputed on each filter's own rows; the fixed rate is after it.
- Interval width is P95 - P05 (all seven quantiles are trained), matching the baseline table.
- MOCK DATA: these numbers describe the synthetic generator.
