# Phase 4 - weekly quantile model (test) - evaluation #2

Generated: 2026-10-19T08:39:44+00:00 (MOCK DATA - not real accuracy)

- Model: `f1-WEEK-2026-09-14-f455e37770dc`; features 40; postprocess `isotonic`; train window `all_history`
- **This is test evaluation #2**; all choices were frozen on valid before it ran.
- Rows: 4,691 / series 173; raw crossing rate 0.1714 (bands are sorted before scoring)

## Model metrics

| filter | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | crossing_rate_fixed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| all_rows | 4691 | 24.1348 | 11.7363 | 7.3171 | 0.5044 | 0.8825 | 0.9418 | 48.2696 | 0.0712 | 203.8395 | 0.1714 | 0.0000 |
| no_stockout_rows | 4600 | 23.8536 | 11.7492 | 7.3359 | 0.5024 | 0.8824 | 0.9417 | 47.7071 | 0.0695 | 205.6577 | 0.1689 | 0.0000 |

## Gate vs baselines

| filter | baseline | delta P50 | delta P90 | delta P95 | beats |
|---|---|---|---|---|---|
| all_rows | seasonal_naive | -7.3908 | -17.7458 | -17.9901 | True |
| all_rows | ma_es_residual_quantile | -16.4917 | -6.7098 | -4.6341 | True |
| no_stockout_rows | seasonal_naive | -7.3735 | -17.9566 | -18.2293 | True |
| no_stockout_rows | ma_es_residual_quantile | -16.7279 | -6.7818 | -4.6892 | True |

Gate passed: **True**

## Cold-start series (LOW_N)

- series: 7, rows: 43 (all LOW_N: fewer than 26 periods)
- pinball P50/P90/P95: 16.786 / 18.5977 / 16.5083
- coverage P90/P95: 0.6977 / 0.7907

## Notes

- Post-processing: `isotonic` (chosen on valid). Raw crossing is measured before the fix and recomputed on each filter's own rows; the fixed rate is after it.
- Interval width is P95 - P05 (all seven quantiles are trained), matching the baseline table.
- MOCK DATA: these numbers describe the synthetic generator.
