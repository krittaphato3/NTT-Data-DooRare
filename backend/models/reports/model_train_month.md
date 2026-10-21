# Phase 5 - monthly quantile model training

Generated: 2026-10-20T02:02:05+00:00 (MOCK DATA - not real accuracy)

- Model version: `f1-MONTH-2026-08-01-8f70f4a87d1e-r2` (feature hash `8f70f4a87d1e`)
- Tree cap: `n_estimators = 5000` with early stopping (100 rounds) on valid
- Features: 33 used; constant columns dropped: ['ctx_flu_peak', 'ctx_dengue_peak']
- Training window: `all_history` (2017-10-01 -> 2024-06-01, 13,446 rows)
- Variant valid pinball (sum over the seven quantiles): `{'all_history': 416.2097}`
- Post-processing: `sort` (width ratio 0.9828)
- Grid: {"learning_rate": [0.03, 0.05], "num_leaves": [7, 15, 31], "min_child_samples": [10, 20]} (selected on valid only)

## Selection

| quantile | learning_rate | num_leaves | min_child_samples | valid pinball | best iteration |
|---|---|---|---|---|---|
| 0.05 | 0.03 | 7 | 10 | 35.1029 | 1530 |
| 0.1 | 0.03 | 7 | 10 | 49.2031 | 1370 |
| 0.25 | 0.03 | 15 | 10 | 82.859 | 1345 |
| 0.5 | 0.03 | 31 | 10 | 97.7216 | 329 |
| 0.75 | 0.03 | 31 | 10 | 77.2636 | 443 |
| 0.9 | 0.03 | 31 | 10 | 44.7249 | 536 |
| 0.95 | 0.03 | 31 | 10 | 29.3346 | 518 |

## Post-processing choice (valid only)

| variant | cov P90 | cov P95 | coverage score | width P95-P05 | raw crossing | fixed crossing |
|---|---|---|---|---|---|---|
| sort | 0.9001 | 0.9468 | 0.0033 | 921.527 | 0.3619 | 0.0 |
| isotonic | 0.9021 | 0.9428 | 0.0093 | 905.6984 | 0.3619 | 0.0 |

Rule: coverage inside tolerance, strictly better coverage score, width ratio <= max_width_ratio (tolerance 0.05, width ratio <= 1.05); width ratio 0.9828; chosen **sort**

## Valid metrics

| filter | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | crossing_rate_fixed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| all_rows | 1992 | 95.5894 | 43.7996 | 29.4770 | 0.5256 | 0.9001 | 0.9468 | 191.1789 | 0.0633 | 921.5270 | 0.3619 | 0.0000 |
| no_stockout_rows | 1875 | 96.3253 | 44.4938 | 29.6692 | 0.5253 | 0.9040 | 0.9499 | 192.6505 | 0.0633 | 916.2623 | 0.3627 | 0.0000 |

## Gate (valid) (common row set, 1992 rows)

| filter | baseline | delta P50 | delta P90 | delta P95 | beats |
|---|---|---|---|---|---|
| all_rows | seasonal_naive | -34.4083 | -85.0391 | -79.638 | True |
| all_rows | ma_es_residual_quantile | -100.3597 | -29.4117 | -14.6217 | True |
| all_rows | empirical_quantile | -24.063 | -31.4936 | -12.8586 | True |
| no_stockout_rows | seasonal_naive | -32.1694 | -83.0559 | -78.2711 | True |
| no_stockout_rows | ma_es_residual_quantile | -100.8193 | -30.377 | -15.1229 | True |
| no_stockout_rows | empirical_quantile | -23.4955 | -32.4175 | -13.5055 | True |

Gate passed: **True**

## All grid results (valid)

| variant | quantile | learning_rate | num_leaves | min_child_samples | valid pinball | best iteration |
|---|---|---|---|---|---|---|
| all_history | 0.05 | 0.03 | 7 | 10 | 35.1029 | 1530 |
| all_history | 0.05 | 0.05 | 31 | 10 | 35.7148 | 580 |
| all_history | 0.05 | 0.05 | 7 | 10 | 36.0748 | 783 |
| all_history | 0.05 | 0.03 | 7 | 20 | 36.1181 | 1126 |
| all_history | 0.05 | 0.05 | 15 | 10 | 36.4411 | 641 |
| all_history | 0.05 | 0.03 | 15 | 10 | 36.805 | 1092 |
| all_history | 0.05 | 0.03 | 31 | 10 | 36.9896 | 946 |
| all_history | 0.05 | 0.05 | 7 | 20 | 37.4391 | 794 |
| all_history | 0.05 | 0.05 | 15 | 20 | 37.7972 | 733 |
| all_history | 0.05 | 0.03 | 15 | 20 | 37.8297 | 1002 |
| all_history | 0.05 | 0.05 | 31 | 20 | 37.8671 | 572 |
| all_history | 0.05 | 0.03 | 31 | 20 | 39.1691 | 888 |
| all_history | 0.1 | 0.03 | 7 | 10 | 49.2031 | 1370 |
| all_history | 0.1 | 0.05 | 7 | 20 | 49.2065 | 1064 |
| all_history | 0.1 | 0.05 | 7 | 10 | 49.2282 | 1066 |
| all_history | 0.1 | 0.03 | 7 | 20 | 49.2319 | 1512 |
| all_history | 0.1 | 0.03 | 15 | 10 | 49.4891 | 1084 |
| all_history | 0.1 | 0.03 | 31 | 10 | 49.6828 | 921 |
| all_history | 0.1 | 0.03 | 15 | 20 | 50.0142 | 1372 |
| all_history | 0.1 | 0.05 | 15 | 10 | 50.2727 | 744 |
| all_history | 0.1 | 0.05 | 15 | 20 | 50.6759 | 849 |
| all_history | 0.1 | 0.05 | 31 | 10 | 52.1385 | 577 |
| all_history | 0.1 | 0.05 | 31 | 20 | 53.764 | 520 |
| all_history | 0.1 | 0.03 | 31 | 20 | 54.0146 | 810 |
| all_history | 0.25 | 0.03 | 15 | 10 | 82.859 | 1345 |
| all_history | 0.25 | 0.03 | 7 | 20 | 83.4399 | 2968 |
| all_history | 0.25 | 0.03 | 15 | 20 | 83.5215 | 652 |
| all_history | 0.25 | 0.05 | 7 | 20 | 83.6236 | 1302 |
| all_history | 0.25 | 0.03 | 7 | 10 | 83.8494 | 1264 |
| all_history | 0.25 | 0.05 | 31 | 20 | 83.9832 | 389 |
| all_history | 0.25 | 0.05 | 15 | 10 | 84.0184 | 852 |
| all_history | 0.25 | 0.03 | 31 | 10 | 85.2434 | 636 |
| all_history | 0.25 | 0.03 | 31 | 20 | 85.37 | 831 |
| all_history | 0.25 | 0.05 | 7 | 10 | 87.1628 | 1386 |
| all_history | 0.25 | 0.05 | 15 | 20 | 88.667 | 900 |
| all_history | 0.25 | 0.05 | 31 | 10 | 88.8311 | 392 |
| all_history | 0.5 | 0.03 | 31 | 10 | 97.7216 | 329 |
| all_history | 0.5 | 0.03 | 15 | 20 | 101.5931 | 790 |
| all_history | 0.5 | 0.05 | 31 | 10 | 101.7552 | 322 |
| all_history | 0.5 | 0.03 | 7 | 20 | 101.8964 | 766 |
| all_history | 0.5 | 0.03 | 31 | 20 | 103.3854 | 420 |
| all_history | 0.5 | 0.03 | 15 | 10 | 103.5182 | 908 |
| all_history | 0.5 | 0.05 | 15 | 10 | 103.5631 | 459 |
| all_history | 0.5 | 0.03 | 7 | 10 | 104.3596 | 1195 |
| all_history | 0.5 | 0.05 | 15 | 20 | 105.1043 | 445 |
| all_history | 0.5 | 0.05 | 31 | 20 | 106.0723 | 275 |
| all_history | 0.5 | 0.05 | 7 | 10 | 108.2318 | 1148 |
| all_history | 0.5 | 0.05 | 7 | 20 | 108.7512 | 581 |
| all_history | 0.75 | 0.03 | 31 | 10 | 77.2636 | 443 |
| all_history | 0.75 | 0.05 | 31 | 20 | 78.8664 | 214 |
| all_history | 0.75 | 0.05 | 31 | 10 | 78.8898 | 237 |
| all_history | 0.75 | 0.05 | 15 | 20 | 79.5459 | 310 |
| all_history | 0.75 | 0.03 | 31 | 20 | 80.4615 | 353 |
| all_history | 0.75 | 0.03 | 15 | 20 | 81.04 | 462 |
| all_history | 0.75 | 0.05 | 15 | 10 | 81.5877 | 235 |
| all_history | 0.75 | 0.03 | 7 | 20 | 82.1824 | 863 |
| all_history | 0.75 | 0.03 | 15 | 10 | 82.1847 | 478 |
| all_history | 0.75 | 0.03 | 7 | 10 | 82.9372 | 845 |
| all_history | 0.75 | 0.05 | 7 | 20 | 84.9693 | 993 |
| all_history | 0.75 | 0.05 | 7 | 10 | 87.0741 | 867 |
| all_history | 0.9 | 0.03 | 31 | 10 | 44.7249 | 536 |
| all_history | 0.9 | 0.03 | 15 | 10 | 46.2894 | 829 |
| all_history | 0.9 | 0.05 | 31 | 10 | 46.3577 | 301 |
| all_history | 0.9 | 0.05 | 15 | 10 | 47.1535 | 771 |
| all_history | 0.9 | 0.05 | 31 | 20 | 47.7338 | 327 |
| all_history | 0.9 | 0.03 | 15 | 20 | 48.937 | 484 |
| all_history | 0.9 | 0.03 | 31 | 20 | 49.0622 | 482 |
| all_history | 0.9 | 0.05 | 7 | 20 | 49.9607 | 907 |
| all_history | 0.9 | 0.05 | 15 | 20 | 50.6748 | 491 |
| all_history | 0.9 | 0.05 | 7 | 10 | 51.0464 | 1266 |
| all_history | 0.9 | 0.03 | 7 | 10 | 53.4049 | 1513 |
| all_history | 0.9 | 0.03 | 7 | 20 | 53.7592 | 377 |
| all_history | 0.95 | 0.03 | 31 | 10 | 29.3346 | 518 |
| all_history | 0.95 | 0.05 | 15 | 10 | 30.0346 | 314 |
| all_history | 0.95 | 0.05 | 31 | 20 | 31.2919 | 303 |
| all_history | 0.95 | 0.03 | 15 | 10 | 31.708 | 540 |
| all_history | 0.95 | 0.05 | 31 | 10 | 31.899 | 381 |
| all_history | 0.95 | 0.03 | 15 | 20 | 32.4948 | 518 |
| all_history | 0.95 | 0.05 | 7 | 20 | 32.7233 | 316 |
| all_history | 0.95 | 0.03 | 31 | 20 | 33.0709 | 517 |
| all_history | 0.95 | 0.03 | 7 | 10 | 33.1207 | 545 |
| all_history | 0.95 | 0.05 | 7 | 10 | 33.3129 | 409 |
| all_history | 0.95 | 0.03 | 7 | 20 | 33.6279 | 552 |
| all_history | 0.95 | 0.05 | 15 | 20 | 33.8029 | 308 |

## Notes

- The test split is not read here; `evaluate --split test` is run once after selection.
- Context flags come from the Phase 3 canonical (known-at-origin) rebuild.
- MOCK DATA: these numbers describe the synthetic generator.
