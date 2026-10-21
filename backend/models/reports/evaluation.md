# Phase 6a - evaluation report (slices, concentration, TT impact, crossings, importance)

Generated: 2026-10-20T02:45:06+00:00

**MOCK DATA - not real accuracy; the pack is synthetic**

## Definitions

- `total_target`: P95 for VED V, P90 for E, none for D, floored at P50
- `stockout_rate`: share of rows with y > TT
- `overstock_rate`: share of rows with origin_stock > 2 x TT
- `under_thb`: sum(max(0, y - TT) * unit_price)
- `over_thb`: mean(max(0, stock - TT)) * mean(price)
- `pinball_contribution`: sum over rows and all seven quantiles
- `coverage_miss`: |cov90 - 0.90| + |cov95 - 0.95|
- `crossing_fraction`: (lower_raw - upper_raw) / max(P50, 1) on crossing rows
- `low_confidence_rows`: 100
- `slice_filter`: all rows; slices are computed on the common row set

# WEEK (weekly) - `f1-WEEK-2026-09-14-f455e37770dc`

## WEEK verification - re-score of the frozen artifact - no refit, artifact and meta.json unchanged

Recomputed from the saved row-level predictions; the frozen report is read, never written.

| split | rows | pinball P50 / P90 / P95 saved -> recomputed | coverage 0.90 / 0.95 saved -> recomputed | max abs diff | matches |
|---|---|---|---|---|---|
| valid | 4648 | 22.1065 -> 22.1065 / 10.5113 -> 10.5113 / 6.6022 -> 6.6022 | 0.8886 -> 0.8886 / 0.9445 -> 0.9445 | 0.0 | True |
| test | 4691 | 24.1348 -> 24.1348 / 11.7363 -> 11.7363 / 7.3171 -> 7.3171 | 0.8825 -> 0.8825 / 0.9418 -> 0.9418 | 0.0 | True |

All splits reproduce their frozen report: **True**.

## WEEK / valid - valid (selection split - coverage is optimistic)

- rows: model 4,648, common 4,648, excluded 0 (0 series)
- gate passed: **True**

### Gate (common rows)

| filter | baseline | pin P50 / P90 / P95 | Δ P50 / P90 / P95 | beats |
|---|---|---|---|---|
| all_rows | seasonal_naive | 22.1065 / 10.5113 / 6.6022 | -18.6579 / -23.1135 / -21.286 | True |
| all_rows | ma_es_residual_quantile | 22.1065 / 10.5113 / 6.6022 | -15.2498 / -5.3346 / -3.6888 | True |
| all_rows | empirical_quantile | 22.1065 / 10.5113 / 6.6022 | -5.8981 / -3.2314 / -1.4999 | True |
| no_stockout_rows | seasonal_naive | 22.2418 / 10.5683 / 6.6419 | -18.7429 / -23.1454 / -21.2874 | True |
| no_stockout_rows | ma_es_residual_quantile | 22.2418 / 10.5683 / 6.6419 | -15.3446 / -5.3536 / -3.6884 | True |
| no_stockout_rows | empirical_quantile | 22.2418 / 10.5683 / 6.6419 | -5.934 / -3.2611 / -1.5092 | True |

### Slices

#### ved

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| D | 280 | 2.62 | 1.28 | 0.83 | 0.9250 | 0.9750 | 0.1451 | empirical_quantile | +0.04 / +0.05 / +0.06 |  |
| E | 2128 | 36.04 | 16.89 | 10.80 | 0.8825 | 0.9403 | 0.0610 | empirical_quantile | -10.73 / -5.41 / -2.34 |  |
| V | 2240 | 11.30 | 5.60 | 3.34 | 0.8897 | 0.9446 | 0.0844 | empirical_quantile | -2.05 / -1.57 / -0.90 |  |

#### price_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| HIGH | 196 | 0.28 | 0.29 | 0.23 | 0.8827 | 0.9643 | 0.7571 | empirical_quantile | +0.00 / -0.01 / +0.02 |  |
| LOW | 2996 | 32.94 | 15.61 | 9.82 | 0.8905 | 0.9383 | 0.0643 | empirical_quantile | -9.03 / -4.36 / -1.94 |  |
| MID | 1456 | 2.75 | 1.39 | 0.83 | 0.8853 | 0.9547 | 0.1464 | empirical_quantile | -0.24 / -1.33 / -0.81 |  |

#### item_type

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| DRUG | 3668 | 25.99 | 12.25 | 7.70 | 0.8931 | 0.9460 | 0.0641 | empirical_quantile | -7.22 / -3.99 / -1.85 |  |
| SUPPLY | 980 | 7.56 | 4.00 | 2.51 | 0.8714 | 0.9388 | 0.0986 | empirical_quantile | -0.94 / -0.41 / -0.19 |  |

#### hospital_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| COMMUNITY | 1708 | 14.68 | 6.64 | 3.98 | 0.8893 | 0.9514 | 0.0736 | empirical_quantile | -2.89 / -1.89 / -0.79 |  |
| SECONDARY | 1960 | 20.88 | 10.58 | 6.47 | 0.8898 | 0.9418 | 0.0648 | empirical_quantile | -5.38 / -3.35 / -1.72 |  |
| TERTIARY | 980 | 37.49 | 17.13 | 11.42 | 0.8847 | 0.9378 | 0.0622 | empirical_quantile | -12.17 / -5.33 / -2.29 |  |

#### is_seasonal

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 4368 | 23.34 | 11.09 | 6.96 | 0.8874 | 0.9441 | 0.0654 | empirical_quantile | -6.16 / -2.96 / -1.31 |  |
| true | 280 | 2.84 | 1.47 | 0.96 | 0.9071 | 0.9500 | 0.3318 | ma_es_residual_quantile | -1.62 / -0.29 / -0.69 |  |

#### zero_heavy

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 4408 | 23.30 | 11.07 | 6.95 | 0.8877 | 0.9433 | 0.0657 | empirical_quantile | -6.22 / -3.41 / -1.58 |  |
| true | 240 | 0.22 | 0.31 | 0.24 | 0.9042 | 0.9667 | 1.0238 | empirical_quantile | -0.00 / -0.01 / +0.02 |  |

#### cold_start

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 4648 | 22.11 | 10.51 | 6.60 | 0.8886 | 0.9445 | 0.0658 | empirical_quantile | -5.90 / -3.23 / -1.50 |  |

### Scale dominance

- series: 166; total pinball: 429176.38
- top-10 share of pinball: **62.83%**

Worst 15 series by pinball contribution:

| series | hospital | item | VED | n | LOW_N | pinball total | share |
|---|---|---|---|---|---|---|---|
| 5a834dda-19d4-44ce-8cc2-33dd3bc28545 | HA | 747132 | E | 28 |  | 60705.5 | 0.1414 |
| f2ee3355-6779-4ce0-b6af-1cf974800626 | HB | 747132 | V | 28 |  | 38520.3 | 0.0898 |
| 62c6b25f-d418-43cd-b3b2-cbc33e9a3c35 | HC | 747132 | E | 28 |  | 30420.7 | 0.0709 |
| afadcc3e-2c2a-4245-8ffe-5a0423c27938 | HA | 210476 | E | 28 |  | 25982.4 | 0.0605 |
| 8dd02feb-2a70-44b4-8c70-e7c9c24b4724 | HA | 231927 | E | 28 |  | 23982.0 | 0.0559 |
| 7e7a4e24-904d-4daa-aeeb-2b178ec7d5f6 | HE | 747132 | E | 28 |  | 22871.2 | 0.0533 |
| 50a857a5-7a7b-4e1a-8c75-0a0def7654c4 | HB | 231927 | E | 28 |  | 21134.1 | 0.0492 |
| bcac655b-3501-4a42-88a3-7854ec7f0d1e | HD | 747132 | E | 28 |  | 19693.9 | 0.0459 |
| 1869e649-58d7-4646-a567-4e24b7b1a895 | HB | 210476 | E | 28 |  | 14170.6 | 0.0330 |
| 8fc1b375-a318-400e-bde7-7c9189e2b91e | HC | 231927 | E | 28 |  | 12166.7 | 0.0283 |
| 02c8ceb7-07ed-49d8-b5d4-ce5d7f7a2d1e | HC | 210476 | E | 28 |  | 9740.3 | 0.0227 |
| c349b1b5-53b7-472a-a4b5-4e965c4eeda8 | HE | 210476 | E | 28 |  | 8781.8 | 0.0205 |
| 1d5fdcfa-764d-43be-9299-bdc206b3c868 | HE | 231927 | V | 28 |  | 8666.7 | 0.0202 |
| d4f513a8-3518-462e-a387-bb48c80418bb | HD | 210476 | E | 28 |  | 7739.2 | 0.0180 |
| 52ed2b1e-8347-4911-bbc8-2ced99499137 | HA | 1140915 | E | 28 |  | 7676.5 | 0.0179 |

Worst 15 series by coverage miss:

| series | hospital | item | VED | n | LOW_N | y sum | cov 0.90 | cov 0.95 | miss |
|---|---|---|---|---|---|---|---|---|---|
| 1869e649-58d7-4646-a567-4e24b7b1a895 | HB | 210476 | E | 28 |  | 151783 | 0.7857 | 0.8214 | 0.2429 |
| 841f54e0-20e7-4e06-9045-1d626ad03625 | HB | 1242065 | V | 28 |  | 42 | 0.7143 | 1.0000 | 0.2357 |
| 757ea306-6ea8-497d-8406-96c76ebde8e9 | HA | 535897 | V | 28 |  | 1656 | 0.7857 | 0.8571 | 0.2071 |
| d4f513a8-3518-462e-a387-bb48c80418bb | HD | 210476 | E | 28 |  | 55067 | 0.7857 | 0.8571 | 0.2071 |
| eb716d4e-8d6d-4f62-9ece-0c1efd513a56 | HA | 666141 | E | 28 |  | 1523 | 0.7857 | 0.8571 | 0.2071 |
| 10eb6101-235a-48c2-a7b5-9c58bb342c5c | HA | SUP-0001 | V | 28 |  | 9839 | 0.8214 | 0.8571 | 0.1714 |
| 429bb5c1-477f-45e6-83c5-c9bfe28595e9 | HA | 670609 | E | 28 |  | 506 | 0.8214 | 0.8571 | 0.1714 |
| 50a857a5-7a7b-4e1a-8c75-0a0def7654c4 | HB | 231927 | E | 28 |  | 197699 | 0.8214 | 0.8571 | 0.1714 |
| 99ae34ec-c3f6-4b90-95be-b5d1c1f06d5d | HD | SUP-0004 | E | 28 |  | 1251 | 0.8214 | 0.8571 | 0.1714 |
| bab9d87d-08ef-4a89-99a5-f776f5c04c21 | HC | 555722 | V | 28 |  | 1996 | 0.8214 | 0.8571 | 0.1714 |
| 3a908883-b6dc-4ef7-93c0-91f1aed2c3a3 | HD | SUP-0007 | E | 28 |  | 2227 | 0.7857 | 0.8929 | 0.1714 |
| bba20f82-19f7-447e-aa63-af93a5bba67c | HC | SUP-0001 | E | 28 |  | 4289 | 0.7857 | 0.8929 | 0.1714 |
| bdadf892-4b0e-4b55-903c-3a6fa58eba81 | HE | SUP-0004 | E | 28 |  | 2169 | 0.7500 | 0.9286 | 0.1714 |
| c8df346d-2972-4882-9885-668dd5b99da6 | HC | 767330 | V | 28 |  | 612 | 0.7857 | 0.8929 | 0.1714 |
| f8676b6d-82f3-478c-8042-a220922cce5c | HD | SUP-0002 | E | 28 |  | 1314 | 0.7500 | 0.9286 | 0.1714 |

### Total Target impact

| filter | method | rows | TT rows | stock-out rate | overstock rate | under THB | over THB |
|---|---|---|---|---|---|---|---|
| all_rows | lgbm_quantile_wk | 4648 | 4368 | 0.0856 | 0.7438 | 172389.73 | 237113.77 |
| all_rows | seasonal_naive | 4648 | 4368 | 0.0408 | 0.6355 | 68188.43 | 210433.96 |
| all_rows | ma_es_residual_quantile | 4648 | 4368 | 0.0739 | 0.7177 | 150704.53 | 230052.92 |
| all_rows | empirical_quantile | 4648 | 4368 | 0.0755 | 0.725 | 167967.72 | 231249.43 |
| no_stockout_rows | lgbm_quantile_wk | 4604 | 4327 | 0.086 | 0.7506 | 171153.94 | 238467.95 |
| no_stockout_rows | seasonal_naive | 4604 | 4327 | 0.0404 | 0.6413 | 67768.67 | 211635.74 |
| no_stockout_rows | ma_es_residual_quantile | 4604 | 4327 | 0.074 | 0.7243 | 150227.98 | 231366.12 |
| no_stockout_rows | empirical_quantile | 4604 | 4327 | 0.0756 | 0.7317 | 166495.76 | 232569.05 |

### Crossing diagnostics

| pair | share | rows | gap median | gap p95 | gap/P50 median | gap/P50 p95 |
|---|---|---|---|---|---|---|
| q05>q10 | 0.0721 | 335 | 0.36 | 121.96 | 0.0077 | 0.065 |
| q10>q25 | 0.0286 | 133 | 0.0 | 11.9 | 0.0033 | 0.0309 |
| q25>q50 | 0.0174 | 81 | 0.0 | 15.59 | 0.001 | 0.0235 |
| q50>q75 | 0.0123 | 57 | 0.01 | 4.94 | 0.0037 | 0.031 |
| q75>q90 | 0.0129 | 60 | 6.85 | 143.96 | 0.0105 | 0.0562 |
| q90>q95 | 0.0467 | 217 | 7.32 | 221.6 | 0.0116 | 0.0571 |

Crossing rate by series-volume tercile:

| tercile | series | rows | any-pair rate | q90>q95 rate | median y |
|---|---|---|---|---|---|
| low | 56 | 1568 | 0.1722 | 0.0 | 5.0 |
| mid | 55 | 1540 | 0.05 | 0.0156 | 48.0 |
| high | 55 | 1540 | 0.2474 | 0.1253 | 338.0 |

## WEEK / test - test (re-score of frozen model, no changes)

- rows: model 4,691, common 4,648, excluded 43 (7 series)
- gate passed: **True**

### Gate (common rows)

| filter | baseline | pin P50 / P90 / P95 | Δ P50 / P90 / P95 | beats |
|---|---|---|---|---|
| all_rows | seasonal_naive | 24.2028 / 11.6728 / 7.2321 | -7.3228 / -17.8093 / -18.0751 | True |
| all_rows | ma_es_residual_quantile | 24.2028 / 11.6728 / 7.2321 | -16.5748 / -6.8403 / -4.7636 | True |
| all_rows | empirical_quantile | 24.2028 / 11.6728 / 7.2321 | -9.5382 / -1.9577 / -0.4765 | True |
| no_stockout_rows | seasonal_naive | 23.9202 / 11.6846 / 7.2494 | -7.3069 / -18.0212 / -18.3158 | True |
| no_stockout_rows | ma_es_residual_quantile | 23.9202 / 11.6846 / 7.2494 | -16.8152 / -6.9152 / -4.8215 | True |
| no_stockout_rows | empirical_quantile | 23.9202 / 11.6846 / 7.2494 | -9.7571 / -1.9693 / -0.4677 | True |

### Slices

#### ved

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| D | 280 | 2.90 | 1.33 | 0.77 | 0.8857 | 0.9679 | 0.1599 | empirical_quantile | +0.10 / +0.05 / -0.02 |  |
| E | 2128 | 37.71 | 17.74 | 10.79 | 0.8806 | 0.9422 | 0.0630 | seasonal_naive | -13.40 / -32.06 / -31.69 |  |
| V | 2240 | 14.04 | 7.20 | 4.66 | 0.8875 | 0.9411 | 0.1018 | seasonal_naive | -2.33 / -5.70 / -6.13 |  |

#### price_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| HIGH | 196 | 0.26 | 0.25 | 0.22 | 0.9337 | 0.9745 | 0.6568 | empirical_quantile | +0.01 / +0.00 / +0.01 |  |
| LOW | 2996 | 35.75 | 17.21 | 10.63 | 0.8795 | 0.9386 | 0.0689 | seasonal_naive | -10.74 / -26.47 / -26.60 |  |
| MID | 1456 | 3.67 | 1.82 | 1.19 | 0.8874 | 0.9485 | 0.1626 | seasonal_naive | -1.25 / -2.35 / -2.91 |  |

#### item_type

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| DRUG | 3668 | 28.73 | 13.85 | 8.58 | 0.8820 | 0.9425 | 0.0696 | seasonal_naive | -8.64 / -21.49 / -21.45 |  |
| SUPPLY | 980 | 7.27 | 3.51 | 2.18 | 0.8929 | 0.9459 | 0.0963 | empirical_quantile | -0.15 / -0.53 / -0.25 |  |

#### hospital_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| COMMUNITY | 1708 | 15.04 | 6.92 | 4.35 | 0.8829 | 0.9409 | 0.0750 | empirical_quantile | -5.79 / -1.92 / -0.69 |  |
| SECONDARY | 1960 | 23.42 | 11.91 | 7.33 | 0.8878 | 0.9495 | 0.0717 | seasonal_naive | -4.47 / -15.42 / -16.32 |  |
| TERTIARY | 980 | 41.73 | 19.49 | 12.05 | 0.8796 | 0.9347 | 0.0676 | empirical_quantile | -12.85 / -0.87 / +0.44 |  |

#### is_seasonal

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 4368 | 25.26 | 12.17 | 7.52 | 0.8878 | 0.9444 | 0.0698 | seasonal_naive | -7.67 / -18.82 / -19.17 |  |
| true | 280 | 7.64 | 3.94 | 2.79 | 0.8286 | 0.9250 | 0.2700 | seasonal_naive | -1.87 / -2.03 / -0.93 |  |

#### zero_heavy

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 4384 | 25.64 | 12.35 | 7.65 | 0.8807 | 0.9423 | 0.0708 | seasonal_naive | -7.75 / -18.88 / -19.16 |  |
| true | 264 | 0.27 | 0.38 | 0.33 | 0.9432 | 0.9583 | 1.0595 | empirical_quantile | +0.00 / +0.01 / +0.01 |  |

#### cold_start

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 4648 | 24.20 | 11.67 | 7.23 | 0.8843 | 0.9432 | 0.0708 | seasonal_naive | -7.32 / -17.81 / -18.08 |  |

### Scale dominance

- series: 166; total pinball: 476829.71
- top-10 share of pinball: **63.22%**

Worst 15 series by pinball contribution:

| series | hospital | item | VED | n | LOW_N | pinball total | share |
|---|---|---|---|---|---|---|---|
| 5a834dda-19d4-44ce-8cc2-33dd3bc28545 | HA | 747132 | E | 28 |  | 74179.3 | 0.1556 |
| f2ee3355-6779-4ce0-b6af-1cf974800626 | HB | 747132 | V | 28 |  | 58407.6 | 0.1225 |
| 8dd02feb-2a70-44b4-8c70-e7c9c24b4724 | HA | 231927 | E | 28 |  | 28782.5 | 0.0604 |
| 62c6b25f-d418-43cd-b3b2-cbc33e9a3c35 | HC | 747132 | E | 28 |  | 28017.3 | 0.0588 |
| afadcc3e-2c2a-4245-8ffe-5a0423c27938 | HA | 210476 | E | 28 |  | 21754.8 | 0.0456 |
| 7e7a4e24-904d-4daa-aeeb-2b178ec7d5f6 | HE | 747132 | E | 28 |  | 21669.3 | 0.0454 |
| 619709b5-5048-4d7f-a6a3-0dd7ccc09a93 | HD | 231927 | E | 28 |  | 18560.2 | 0.0389 |
| bcac655b-3501-4a42-88a3-7854ec7f0d1e | HD | 747132 | E | 28 |  | 17470.5 | 0.0366 |
| 02c8ceb7-07ed-49d8-b5d4-ce5d7f7a2d1e | HC | 210476 | E | 28 |  | 16863.9 | 0.0354 |
| 50a857a5-7a7b-4e1a-8c75-0a0def7654c4 | HB | 231927 | E | 28 |  | 15766.5 | 0.0331 |
| 8fc1b375-a318-400e-bde7-7c9189e2b91e | HC | 231927 | E | 28 |  | 14176.3 | 0.0297 |
| 1d5fdcfa-764d-43be-9299-bdc206b3c868 | HE | 231927 | V | 28 |  | 10780.2 | 0.0226 |
| 1869e649-58d7-4646-a567-4e24b7b1a895 | HB | 210476 | E | 28 |  | 9923.2 | 0.0208 |
| 52ed2b1e-8347-4911-bbc8-2ced99499137 | HA | 1140915 | E | 28 |  | 8234.3 | 0.0173 |
| c349b1b5-53b7-472a-a4b5-4e965c4eeda8 | HE | 210476 | E | 28 |  | 8207.7 | 0.0172 |

Worst 15 series by coverage miss:

| series | hospital | item | VED | n | LOW_N | y sum | cov 0.90 | cov 0.95 | miss |
|---|---|---|---|---|---|---|---|---|---|
| 444c83b4-583a-4da5-9254-000c7d2e53bd | HC | 1140915 | V | 28 |  | 15126 | 0.7500 | 0.7857 | 0.3143 |
| 7f895482-410a-4150-8bc0-079d51a7497a | HA | 339390 | E | 28 |  | 1357 | 0.7143 | 0.8929 | 0.2429 |
| c5354ca8-0895-4685-9fce-46b185daea79 | HD | 770061 | V | 28 |  | 79 | 0.7857 | 0.8571 | 0.2071 |
| d1a36d3f-9e8d-4c68-b49c-04c6b0d348ed | HE | 747533 | E | 28 |  | 1022 | 0.8214 | 0.8214 | 0.2071 |
| 08b90056-5bb5-4c41-9a4d-4cd635816195 | HE | SUP-0005 | V | 28 |  | 5496 | 0.7500 | 0.8929 | 0.2071 |
| 32b6f22b-b7d8-4b7f-be1f-e8b627f89aff | HC | 768789 | V | 28 |  | 204 | 0.7500 | 0.8929 | 0.2071 |
| 3a908883-b6dc-4ef7-93c0-91f1aed2c3a3 | HD | SUP-0007 | E | 28 |  | 2252 | 0.8214 | 0.8571 | 0.1714 |
| 492eccea-bd53-4fe5-a65b-f7947a7086bf | HE | 535897 | V | 28 |  | 584 | 0.8214 | 0.8571 | 0.1714 |
| 4bdf53a5-4514-4dbd-ae4d-2da5a32f7549 | HA | SUP-0003 | D | 28 |  | 1441 | 0.8214 | 0.8571 | 0.1714 |
| 6eb8a5d2-b468-46b1-b300-a726e836b51f | HC | 694507 | V | 28 |  | 5663 | 0.7500 | 0.9286 | 0.1714 |
| 1996af90-eca4-44f5-9e8b-dcb133641704 | HC | 763354 | V | 28 |  | 179 | 1.0000 | 1.0000 | 0.1500 |
| 60d5e283-57a6-4147-9cc5-30d20fa75671 | HB | 810845 | V | 28 |  | 217 | 1.0000 | 1.0000 | 0.1500 |
| 7bd1ba34-ece9-4135-9b13-1e06dfc5d054 | HB | 762264 | V | 28 |  | 0 | 1.0000 | 1.0000 | 0.1500 |
| f025e84b-31ab-4e0e-855d-3fbf11efe7b8 | HE | SUP-0001 | E | 28 |  | 2817 | 1.0000 | 1.0000 | 0.1500 |
| 2416ea63-5874-4f6f-a826-c05de1d2f6c3 | HD | 666141 | V | 28 |  | 301 | 0.8214 | 0.8929 | 0.1357 |

### Total Target impact

| filter | method | rows | TT rows | stock-out rate | overstock rate | under THB | over THB |
|---|---|---|---|---|---|---|---|
| all_rows | lgbm_quantile_wk | 4648 | 4368 | 0.0884 | 0.7434 | 232464.83 | 250714.55 |
| all_rows | seasonal_naive | 4648 | 4368 | 0.0497 | 0.6451 | 272610.96 | 229916.13 |
| all_rows | ma_es_residual_quantile | 4648 | 4368 | 0.0673 | 0.7099 | 292246.51 | 242678.76 |
| all_rows | empirical_quantile | 4648 | 4368 | 0.0968 | 0.7395 | 370578.06 | 248563.75 |
| no_stockout_rows | lgbm_quantile_wk | 4557 | 4280 | 0.0883 | 0.7575 | 222383.92 | 253018.3 |
| no_stockout_rows | seasonal_naive | 4557 | 4280 | 0.0474 | 0.6565 | 229337.24 | 232019.55 |
| no_stockout_rows | ma_es_residual_quantile | 4557 | 4280 | 0.0654 | 0.7234 | 266442.09 | 244912.59 |
| no_stockout_rows | empirical_quantile | 4557 | 4280 | 0.097 | 0.7533 | 360279.78 | 250849.45 |

### Crossing diagnostics

| pair | share | rows | gap median | gap p95 | gap/P50 median | gap/P50 p95 |
|---|---|---|---|---|---|---|
| q05>q10 | 0.0837 | 389 | 0.15 | 75.72 | 0.007 | 0.0506 |
| q10>q25 | 0.0359 | 167 | 0.01 | 8.35 | 0.0053 | 0.0579 |
| q25>q50 | 0.0159 | 74 | 0.0 | 79.44 | 0.0019 | 0.0433 |
| q50>q75 | 0.0136 | 63 | 0.05 | 22.17 | 0.0103 | 0.0578 |
| q75>q90 | 0.017 | 79 | 6.93 | 53.09 | 0.0152 | 0.1607 |
| q90>q95 | 0.0426 | 198 | 14.83 | 310.07 | 0.0179 | 0.0864 |

Crossing rate by series-volume tercile:

| tercile | series | rows | any-pair rate | q90>q95 rate | median y |
|---|---|---|---|---|---|
| low | 56 | 1568 | 0.1875 | 0.0019 | 6.0 |
| mid | 55 | 1540 | 0.0747 | 0.0247 | 54.0 |
| high | 55 | 1540 | 0.2474 | 0.1019 | 337.0 |

## WEEK feature importance (gain)

### P50 - top-10 share 26.69% (n=40 features)

| feature | gain | share |
|---|---|---|
| roll_mean_4w | 417539.36 | 0.2669 |
| stockout_days_4w | 363560.72 | 0.2324 |
| weeks_since_last_nonzero | 249247.84 | 0.1593 |
| lag_1w | 115909.33 | 0.0741 |
| roll_mean_26w | 89016.34 | 0.0569 |
| roll_zero_share_13 | 83220.73 | 0.0532 |
| item_te_mean | 61102.06 | 0.0391 |
| lag_2w | 41972.36 | 0.0268 |
| roll_mean_13w | 31817.32 | 0.0203 |
| roll_std_26w | 19763.76 | 0.0126 |
| lag_4w | 15273.21 | 0.0098 |
| lag_3w | 9913.4 | 0.0063 |
| lag_52w | 8196.57 | 0.0052 |
| log_unit_price | 7670.73 | 0.0049 |
| roll_std_13w | 6314.44 | 0.0040 |

### P95 - top-10 share 28.09% (n=40 features)

| feature | gain | share |
|---|---|---|
| lag_1w | 21108.53 | 0.2809 |
| lag_2w | 18022.77 | 0.2398 |
| roll_mean_4w | 15754.13 | 0.2097 |
| lag_3w | 4344.4 | 0.0578 |
| stockout_days_4w | 2516.3 | 0.0335 |
| roll_std_4w | 1275.0 | 0.0170 |
| lag_52w | 1227.39 | 0.0163 |
| roll_std_13w | 1144.49 | 0.0152 |
| weeks_since_last_nonzero | 1137.29 | 0.0151 |
| roll_std_26w | 1071.39 | 0.0143 |
| roll_mean_13w | 1052.24 | 0.0140 |
| item_te_mean | 923.28 | 0.0123 |
| lag_4w | 651.77 | 0.0087 |
| woy_sin | 598.92 | 0.0080 |
| log_unit_price | 581.78 | 0.0077 |


# MONTH (monthly) - `f1-MONTH-2026-08-01-8f70f4a87d1e-r2`

## MONTH verification - saved row-level predictions - no re-score, no model change

Recomputed from the saved row-level predictions; the frozen report is read, never written.

| split | rows | pinball P50 / P90 / P95 saved -> recomputed | coverage 0.90 / 0.95 saved -> recomputed | max abs diff | matches |
|---|---|---|---|---|---|
| valid | 1992 | 95.5894 -> 95.5894 / 43.7996 -> 43.7996 / 29.477 -> 29.477 | 0.9001 -> 0.9001 / 0.9468 -> 0.9468 | 0.0 | True |
| test | 1993 | 84.0882 -> 84.0882 / 37.5302 -> 37.5302 / 21.8117 -> 21.8117 | 0.8776 -> 0.8776 / 0.9453 -> 0.9453 | 0.0 | True |

All splits reproduce their frozen report: **True**.

## MONTH / valid - valid (selection split - coverage is optimistic)

- rows: model 1,992, common 1,992, excluded 0 (0 series)
- gate passed: **True**

### Gate (common rows)

| filter | baseline | pin P50 / P90 / P95 | Δ P50 / P90 / P95 | beats |
|---|---|---|---|---|
| all_rows | seasonal_naive | 95.5894 / 43.7996 / 29.477 | -34.4083 / -85.0391 / -79.638 | True |
| all_rows | ma_es_residual_quantile | 95.5894 / 43.7996 / 29.477 | -100.3597 / -29.4117 / -14.6217 | True |
| all_rows | empirical_quantile | 95.5894 / 43.7996 / 29.477 | -24.063 / -31.4936 / -12.8586 | True |
| no_stockout_rows | seasonal_naive | 96.3253 / 44.4938 / 29.6692 | -32.1694 / -83.0559 / -78.2711 | True |
| no_stockout_rows | ma_es_residual_quantile | 96.3253 / 44.4938 / 29.6692 | -100.8193 / -30.377 / -15.1229 | True |
| no_stockout_rows | empirical_quantile | 96.3253 / 44.4938 / 29.6692 | -23.4955 / -32.4175 / -13.5055 | True |

### Slices

#### ved

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| D | 120 | 6.85 | 3.28 | 2.18 | 0.9417 | 0.9583 | 0.0865 | empirical_quantile | +0.63 / -0.11 / -0.04 |  |
| E | 912 | 161.33 | 76.02 | 50.67 | 0.9013 | 0.9507 | 0.0610 | empirical_quantile | -37.02 / -51.48 / -20.83 |  |
| V | 960 | 44.22 | 18.26 | 12.75 | 0.8938 | 0.9417 | 0.0725 | empirical_quantile | -14.84 / -16.43 / -6.89 |  |

#### price_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| HIGH | 84 | 1.23 | 0.90 | 0.63 | 0.9286 | 0.9643 | 0.5976 | empirical_quantile | +0.15 / -0.07 / -0.08 | yes |
| LOW | 1284 | 144.13 | 65.87 | 44.33 | 0.8956 | 0.9455 | 0.0627 | empirical_quantile | -33.89 / -46.77 / -18.78 |  |
| MID | 624 | 8.41 | 4.17 | 2.80 | 0.9054 | 0.9471 | 0.0932 | seasonal_naive | -1.01 / -14.06 / -12.47 |  |

#### item_type

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| DRUG | 1572 | 115.50 | 52.95 | 35.64 | 0.8957 | 0.9440 | 0.0633 | empirical_quantile | -30.33 / -39.46 / -16.13 |  |
| SUPPLY | 420 | 21.07 | 9.56 | 6.42 | 0.9167 | 0.9571 | 0.0640 | seasonal_naive | +2.04 / -25.65 / -24.73 |  |

#### hospital_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| COMMUNITY | 732 | 69.33 | 30.01 | 18.93 | 0.9098 | 0.9454 | 0.0782 | empirical_quantile | -2.44 / -18.54 / -8.99 |  |
| SECONDARY | 840 | 85.09 | 35.29 | 22.62 | 0.8929 | 0.9524 | 0.0590 | seasonal_naive | -24.57 / -84.58 / -76.69 |  |
| TERTIARY | 420 | 162.36 | 84.84 | 61.56 | 0.8976 | 0.9381 | 0.0594 | empirical_quantile | -55.68 / -45.82 / -9.64 |  |

#### is_seasonal

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 1872 | 100.57 | 46.02 | 30.96 | 0.8996 | 0.9450 | 0.0628 | empirical_quantile | -22.97 / -31.94 / -12.78 |  |
| true | 120 | 17.94 | 9.21 | 6.38 | 0.9083 | 0.9750 | 0.2108 | seasonal_naive | -5.84 / -2.34 / -0.40 |  |

#### zero_heavy

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 1944 | 97.93 | 44.86 | 30.19 | 0.9007 | 0.9470 | 0.0633 | empirical_quantile | -24.66 / -32.27 / -13.17 |  |
| true | 48 | 0.94 | 0.96 | 0.53 | 0.8750 | 0.9375 | 1.0166 | empirical_quantile | +0.06 / -0.08 / -0.15 | yes |

#### cold_start

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 1992 | 95.59 | 43.80 | 29.48 | 0.9001 | 0.9468 | 0.0633 | empirical_quantile | -24.06 / -31.49 / -12.86 |  |

### Scale dominance

- series: 166; total pinball: 816900.57
- top-10 share of pinball: **74.96%**

Worst 15 series by pinball contribution:

| series | hospital | item | VED | n | LOW_N | pinball total | share |
|---|---|---|---|---|---|---|---|
| 5a834dda-19d4-44ce-8cc2-33dd3bc28545 | HA | 747132 | E | 12 | yes | 178306.7 | 0.2183 |
| 62c6b25f-d418-43cd-b3b2-cbc33e9a3c35 | HC | 747132 | E | 12 | yes | 93526.6 | 0.1145 |
| f2ee3355-6779-4ce0-b6af-1cf974800626 | HB | 747132 | V | 12 | yes | 88366.6 | 0.1082 |
| 7e7a4e24-904d-4daa-aeeb-2b178ec7d5f6 | HE | 747132 | E | 12 | yes | 64827.3 | 0.0794 |
| bcac655b-3501-4a42-88a3-7854ec7f0d1e | HD | 747132 | E | 12 | yes | 52833.9 | 0.0647 |
| afadcc3e-2c2a-4245-8ffe-5a0423c27938 | HA | 210476 | E | 12 | yes | 40224.6 | 0.0492 |
| 8dd02feb-2a70-44b4-8c70-e7c9c24b4724 | HA | 231927 | E | 12 | yes | 37034.7 | 0.0453 |
| 619709b5-5048-4d7f-a6a3-0dd7ccc09a93 | HD | 231927 | E | 12 | yes | 19364.9 | 0.0237 |
| 50a857a5-7a7b-4e1a-8c75-0a0def7654c4 | HB | 231927 | E | 12 | yes | 19345.2 | 0.0237 |
| 8fc1b375-a318-400e-bde7-7c9189e2b91e | HC | 231927 | E | 12 | yes | 18529.1 | 0.0227 |
| 02c8ceb7-07ed-49d8-b5d4-ce5d7f7a2d1e | HC | 210476 | E | 12 | yes | 16491.3 | 0.0202 |
| c349b1b5-53b7-472a-a4b5-4e965c4eeda8 | HE | 210476 | E | 12 | yes | 14964.2 | 0.0183 |
| 1d5fdcfa-764d-43be-9299-bdc206b3c868 | HE | 231927 | V | 12 | yes | 13263.4 | 0.0162 |
| d4f513a8-3518-462e-a387-bb48c80418bb | HD | 210476 | E | 12 | yes | 11500.9 | 0.0141 |
| 1869e649-58d7-4646-a567-4e24b7b1a895 | HB | 210476 | E | 12 | yes | 9514.8 | 0.0116 |

Worst 15 series by coverage miss:

| series | hospital | item | VED | n | LOW_N | y sum | cov 0.90 | cov 0.95 | miss |
|---|---|---|---|---|---|---|---|---|---|
| 58298201-2e00-40e0-b45f-28908eaec259 | HE | 767330 | V | 12 | yes | 876 | 0.6667 | 0.7500 | 0.4333 |
| 6eb8a5d2-b468-46b1-b300-a726e836b51f | HC | 694507 | V | 12 | yes | 9841 | 0.7500 | 0.7500 | 0.3500 |
| df106cf8-58a3-4a20-86c5-959ee240958e | HB | 1140915 | E | 12 | yes | 37159 | 0.6667 | 0.9167 | 0.2667 |
| 06c366dd-5e0d-4d91-b249-afcef2ad3797 | HC | 762264 | E | 12 | yes | 45 | 0.7500 | 0.8333 | 0.2667 |
| 1d5fdcfa-764d-43be-9299-bdc206b3c868 | HE | 231927 | V | 12 | yes | 216005 | 0.7500 | 0.8333 | 0.2667 |
| 2e5b83f4-f4b3-4001-ab90-aaafa10879bd | HC | 654828 | V | 12 | yes | 1664 | 0.7500 | 0.8333 | 0.2667 |
| c1ae6cfc-65a3-438d-bd5d-27e8b83ac2f5 | HD | 1140915 | E | 12 | yes | 13771 | 0.7500 | 0.8333 | 0.2667 |
| c5124e6f-86ff-44ba-b063-a5417b6f1fdc | HC | 670609 | E | 12 | yes | 450 | 0.7500 | 0.8333 | 0.2667 |
| e5cbf7f3-2973-432b-bdfd-01efd3fb453f | HA | 768789 | V | 12 | yes | 697 | 0.7500 | 0.8333 | 0.2667 |
| a704064d-baae-4411-b09a-15ae5841c4c9 | HB | SUP-0005 | E | 12 | yes | 17503 | 0.7500 | 1.0000 | 0.2000 |
| d318c25f-9333-438d-8065-c0162ec67a61 | HC | 770061 | V | 12 | yes | 269 | 0.7500 | 1.0000 | 0.2000 |
| e8682a11-7987-4937-ba79-5cf2dabcf353 | HB | SUP-0001 | E | 12 | yes | 10057 | 0.7500 | 0.9167 | 0.1833 |
| 039b8787-6e38-491b-928a-173780d719c2 | HA | 762650 | V | 12 | yes | 110 | 0.8333 | 0.8333 | 0.1833 |
| 15f30bd0-b223-4aca-a191-8b0e63423194 | HD | 810845 | V | 12 | yes | 183 | 0.8333 | 0.8333 | 0.1833 |
| 190ed160-fed2-426f-880b-081e614fe218 | HB | 749225 | V | 12 | yes | 493 | 0.8333 | 0.8333 | 0.1833 |

### Total Target impact

| filter | method | rows | TT rows | stock-out rate | overstock rate | under THB | over THB |
|---|---|---|---|---|---|---|---|
| all_rows | lgbm_quantile_mo | 1992 | 1872 | 0.078 | 0.1571 | 173104.42 | 60795.77 |
| all_rows | seasonal_naive | 1992 | 1872 | 0.0438 | 0.1528 | 152955.72 | 52074.98 |
| all_rows | ma_es_residual_quantile | 1992 | 1872 | 0.071 | 0.1362 | 351390.94 | 49709.82 |
| all_rows | empirical_quantile | 1992 | 1872 | 0.0956 | 0.1522 | 404765.61 | 53688.06 |
| no_stockout_rows | lgbm_quantile_mo | 1875 | 1765 | 0.0731 | 0.1649 | 103191.6 | 63560.73 |
| no_stockout_rows | seasonal_naive | 1875 | 1765 | 0.0408 | 0.1598 | 93469.15 | 55135.63 |
| no_stockout_rows | ma_es_residual_quantile | 1875 | 1765 | 0.0674 | 0.1428 | 152496.04 | 51537.65 |
| no_stockout_rows | empirical_quantile | 1875 | 1765 | 0.0941 | 0.1598 | 355028.25 | 56306.37 |

### Crossing diagnostics

| pair | share | rows | gap median | gap p95 | gap/P50 median | gap/P50 p95 |
|---|---|---|---|---|---|---|
| q05>q10 | 0.114 | 227 | 2.63 | 482.13 | 0.0149 | 0.0842 |
| q10>q25 | 0.0607 | 121 | 8.58 | 338.32 | 0.0141 | 0.0553 |
| q25>q50 | 0.0382 | 76 | 7.0 | 216.65 | 0.0121 | 0.0576 |
| q50>q75 | 0.0552 | 110 | 14.7 | 192.83 | 0.018 | 0.074 |
| q75>q90 | 0.0643 | 128 | 27.61 | 516.23 | 0.0187 | 0.068 |
| q90>q95 | 0.121 | 241 | 18.73 | 801.57 | 0.0182 | 0.1022 |

Crossing rate by series-volume tercile:

| tercile | series | rows | any-pair rate | q90>q95 rate | median y |
|---|---|---|---|---|---|
| low | 56 | 672 | 0.192 | 0.0357 | 29.0 |
| mid | 55 | 660 | 0.303 | 0.0591 | 221.0 |
| high | 55 | 660 | 0.5939 | 0.2697 | 1495.0 |

## MONTH / test - test (saved row-level predictions, no re-score)

- rows: model 1,993, common 1,992, excluded 1 (1 series)
- gate passed: **True**

### Gate (common rows)

| filter | baseline | pin P50 / P90 / P95 | Δ P50 / P90 / P95 | beats |
|---|---|---|---|---|
| all_rows | seasonal_naive | 84.0792 / 37.4751 / 21.7661 | -14.1492 / -82.9694 / -80.3881 | True |
| all_rows | ma_es_residual_quantile | 84.0792 / 37.4751 / 21.7661 | -77.8427 / -27.6195 / -16.4518 | True |
| all_rows | empirical_quantile | 84.0792 / 37.4751 / 21.7661 | -34.7576 / -11.5196 / -7.0924 | True |
| no_stockout_rows | seasonal_naive | 85.6863 / 38.2454 / 22.1463 | -14.8126 / -84.2907 / -81.5463 | True |
| no_stockout_rows | ma_es_residual_quantile | 85.6863 / 38.2454 / 22.1463 | -80.1089 / -28.1706 / -16.9564 | True |
| no_stockout_rows | empirical_quantile | 85.6863 / 38.2454 / 22.1463 | -35.9753 / -12.0415 / -7.5535 | True |

### Slices

#### ved

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| D | 120 | 6.48 | 2.96 | 1.88 | 0.9083 | 0.9833 | 0.0822 | empirical_quantile | -0.76 / -0.68 / -0.28 |  |
| E | 912 | 135.13 | 62.03 | 34.16 | 0.8761 | 0.9441 | 0.0526 | seasonal_naive | -22.31 / -142.99 / -139.74 |  |
| V | 960 | 45.29 | 18.46 | 12.48 | 0.8760 | 0.9427 | 0.0773 | seasonal_naive | -7.97 / -32.38 / -29.29 |  |

#### price_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| HIGH | 84 | 0.79 | 0.68 | 0.48 | 0.9405 | 1.0000 | 0.4730 | empirical_quantile | +0.04 / +0.03 / +0.02 | yes |
| LOW | 1284 | 126.29 | 55.95 | 32.34 | 0.8614 | 0.9369 | 0.0567 | seasonal_naive | -21.27 / -124.11 / -119.19 |  |
| MID | 624 | 8.43 | 4.41 | 2.87 | 0.9038 | 0.9567 | 0.0935 | seasonal_naive | -1.33 / -9.19 / -11.17 |  |

#### item_type

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| DRUG | 1572 | 100.60 | 44.63 | 25.90 | 0.8798 | 0.9466 | 0.0570 | seasonal_naive | -18.03 / -100.74 / -96.06 |  |
| SUPPLY | 420 | 22.24 | 10.70 | 6.30 | 0.8714 | 0.9429 | 0.0670 | seasonal_naive | +0.37 / -16.45 / -21.72 |  |

#### hospital_tier

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| COMMUNITY | 732 | 52.70 | 22.51 | 14.09 | 0.8798 | 0.9385 | 0.0611 | seasonal_naive | -10.52 / -53.05 / -49.01 |  |
| SECONDARY | 840 | 81.57 | 35.41 | 21.10 | 0.8762 | 0.9524 | 0.0582 | seasonal_naive | -11.06 / -77.86 / -74.18 |  |
| TERTIARY | 420 | 143.79 | 67.69 | 36.47 | 0.8786 | 0.9452 | 0.0546 | seasonal_naive | -26.64 / -145.32 / -147.49 |  |

#### is_seasonal

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 1872 | 88.49 | 39.27 | 22.73 | 0.8771 | 0.9455 | 0.0570 | seasonal_naive | -14.92 / -88.18 / -85.48 |  |
| true | 120 | 15.23 | 9.55 | 6.67 | 0.8917 | 0.9500 | 0.1918 | seasonal_naive | -2.17 / -1.72 / -0.97 |  |

#### zero_heavy

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 1944 | 86.14 | 38.38 | 22.29 | 0.8771 | 0.9444 | 0.0574 | seasonal_naive | -14.49 / -85.02 / -82.37 |  |
| true | 48 | 0.58 | 0.68 | 0.47 | 0.9167 | 1.0000 | 1.0376 | empirical_quantile | +0.01 / +0.06 / -0.04 | yes |

#### cold_start

| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | Δ P50 / P90 / P95 | low-conf |
|---|---|---|---|---|---|---|---|---|---|---|
| false | 1992 | 84.08 | 37.48 | 21.77 | 0.8780 | 0.9458 | 0.0574 | seasonal_naive | -14.15 / -82.97 / -80.39 |  |

### Scale dominance

- series: 166; total pinball: 667623.79
- top-10 share of pinball: **67.35%**

Worst 15 series by pinball contribution:

| series | hospital | item | VED | n | LOW_N | pinball total | share |
|---|---|---|---|---|---|---|---|
| 5a834dda-19d4-44ce-8cc2-33dd3bc28545 | HA | 747132 | E | 12 | yes | 128365.2 | 0.1923 |
| f2ee3355-6779-4ce0-b6af-1cf974800626 | HB | 747132 | V | 12 | yes | 90213.3 | 0.1351 |
| 7e7a4e24-904d-4daa-aeeb-2b178ec7d5f6 | HE | 747132 | E | 12 | yes | 37217.7 | 0.0557 |
| 62c6b25f-d418-43cd-b3b2-cbc33e9a3c35 | HC | 747132 | E | 12 | yes | 37208.0 | 0.0557 |
| 50a857a5-7a7b-4e1a-8c75-0a0def7654c4 | HB | 231927 | E | 12 | yes | 33403.4 | 0.0500 |
| 8dd02feb-2a70-44b4-8c70-e7c9c24b4724 | HA | 231927 | E | 12 | yes | 32665.4 | 0.0489 |
| bcac655b-3501-4a42-88a3-7854ec7f0d1e | HD | 747132 | E | 12 | yes | 27514.8 | 0.0412 |
| afadcc3e-2c2a-4245-8ffe-5a0423c27938 | HA | 210476 | E | 12 | yes | 24982.8 | 0.0374 |
| 8fc1b375-a318-400e-bde7-7c9189e2b91e | HC | 231927 | E | 12 | yes | 19582.0 | 0.0293 |
| 619709b5-5048-4d7f-a6a3-0dd7ccc09a93 | HD | 231927 | E | 12 | yes | 18477.6 | 0.0277 |
| 1869e649-58d7-4646-a567-4e24b7b1a895 | HB | 210476 | E | 12 | yes | 18286.4 | 0.0274 |
| 02c8ceb7-07ed-49d8-b5d4-ce5d7f7a2d1e | HC | 210476 | E | 12 | yes | 15734.1 | 0.0236 |
| d4f513a8-3518-462e-a387-bb48c80418bb | HD | 210476 | E | 12 | yes | 14573.9 | 0.0218 |
| c349b1b5-53b7-472a-a4b5-4e965c4eeda8 | HE | 210476 | E | 12 | yes | 11892.4 | 0.0178 |
| 1d5fdcfa-764d-43be-9299-bdc206b3c868 | HE | 231927 | V | 12 | yes | 11440.9 | 0.0171 |

Worst 15 series by coverage miss:

| series | hospital | item | VED | n | LOW_N | y sum | cov 0.90 | cov 0.95 | miss |
|---|---|---|---|---|---|---|---|---|---|
| 50a857a5-7a7b-4e1a-8c75-0a0def7654c4 | HB | 231927 | E | 12 | yes | 367947 | 0.5833 | 0.8333 | 0.4333 |
| d4f513a8-3518-462e-a387-bb48c80418bb | HD | 210476 | E | 12 | yes | 101827 | 0.5833 | 0.8333 | 0.4333 |
| 1869e649-58d7-4646-a567-4e24b7b1a895 | HB | 210476 | E | 12 | yes | 278488 | 0.6667 | 0.8333 | 0.3500 |
| 256b7403-e0b9-4080-a6a5-dd1979306eda | HE | 1140915 | E | 12 | yes | 22995 | 0.7500 | 0.7500 | 0.3500 |
| 2e5b83f4-f4b3-4001-ab90-aaafa10879bd | HC | 654828 | V | 12 | yes | 1688 | 0.7500 | 0.7500 | 0.3500 |
| 4bac1c70-055f-437b-8fc2-7085bb951488 | HD | 555722 | V | 12 | yes | 1883 | 0.6667 | 0.8333 | 0.3500 |
| 62387542-c8f1-4c89-9522-2c5a4c46e0be | HC | 535897 | V | 12 | yes | 1449 | 0.6667 | 0.8333 | 0.3500 |
| d77759c0-a6b6-4936-b691-4cb639557365 | HA | SUP-0005 | V | 12 | yes | 29739 | 0.6667 | 0.8333 | 0.3500 |
| 40fcfd45-df8e-461d-9522-199da6b3433d | HE | 770061 | V | 12 | yes | 194 | 0.7500 | 0.8333 | 0.2667 |
| 492eccea-bd53-4fe5-a65b-f7947a7086bf | HE | 535897 | V | 12 | yes | 1034 | 0.7500 | 0.8333 | 0.2667 |
| 5aec574f-c430-4de6-b02a-04c907111c03 | HB | 763354 | V | 12 | yes | 601 | 0.7500 | 0.8333 | 0.2667 |
| a704064d-baae-4411-b09a-15ae5841c4c9 | HB | SUP-0005 | E | 12 | yes | 17352 | 0.7500 | 0.8333 | 0.2667 |
| c5124e6f-86ff-44ba-b063-a5417b6f1fdc | HC | 670609 | E | 12 | yes | 409 | 0.7500 | 0.8333 | 0.2667 |
| fa88959a-95b6-4761-8a5e-902c7d58914f | HE | 694507 | V | 12 | yes | 7807 | 0.7500 | 0.8333 | 0.2667 |
| fd01f924-8adc-4794-9501-af3fecd26dbe | HE | 578054 | V | 12 | yes | 9973 | 0.7500 | 0.8333 | 0.2667 |

### Total Target impact

| filter | method | rows | TT rows | stock-out rate | overstock rate | under THB | over THB |
|---|---|---|---|---|---|---|---|
| all_rows | lgbm_quantile_mo | 1992 | 1872 | 0.0897 | 0.1501 | 239425.34 | 24490.22 |
| all_rows | seasonal_naive | 1992 | 1872 | 0.0443 | 0.1373 | 117431.09 | 19185.05 |
| all_rows | ma_es_residual_quantile | 1992 | 1872 | 0.0716 | 0.1277 | 240665.69 | 16644.69 |
| all_rows | empirical_quantile | 1992 | 1872 | 0.1325 | 0.1448 | 489495.84 | 24152.21 |
| no_stockout_rows | lgbm_quantile_mo | 1898 | 1783 | 0.0875 | 0.1548 | 188228.13 | 22342.44 |
| no_stockout_rows | seasonal_naive | 1898 | 1783 | 0.0443 | 0.1413 | 77024.75 | 16940.78 |
| no_stockout_rows | ma_es_residual_quantile | 1898 | 1783 | 0.0684 | 0.1324 | 130530.74 | 14537.32 |
| no_stockout_rows | empirical_quantile | 1898 | 1783 | 0.1312 | 0.1492 | 438762.05 | 22063.48 |

### Crossing diagnostics

| pair | share | rows | gap median | gap p95 | gap/P50 median | gap/P50 p95 |
|---|---|---|---|---|---|---|
| q05>q10 | 0.1079 | 215 | 2.05 | 362.99 | 0.0124 | 0.0695 |
| q10>q25 | 0.0577 | 115 | 4.18 | 412.62 | 0.0139 | 0.0695 |
| q25>q50 | 0.0397 | 79 | 8.53 | 275.77 | 0.0134 | 0.0805 |
| q50>q75 | 0.0643 | 128 | 20.16 | 108.5 | 0.0222 | 0.0868 |
| q75>q90 | 0.0628 | 125 | 22.71 | 702.19 | 0.0144 | 0.0766 |
| q90>q95 | 0.113 | 225 | 25.48 | 765.37 | 0.0214 | 0.1006 |

Crossing rate by series-volume tercile:

| tercile | series | rows | any-pair rate | q90>q95 rate | median y |
|---|---|---|---|---|---|
| low | 56 | 672 | 0.2009 | 0.0402 | 27.0 |
| mid | 55 | 660 | 0.2848 | 0.0545 | 216.5 |
| high | 55 | 660 | 0.6121 | 0.2455 | 1476.5 |

## MONTH feature importance (gain)

### P50 - top-10 share 57.55% (n=33 features)

| feature | gain | share |
|---|---|---|
| lag_1m | 97690.83 | 0.5755 |
| roll_mean_3m | 16560.48 | 0.0976 |
| months_since_last_nonzero | 15598.7 | 0.0919 |
| lag_2m | 9873.52 | 0.0582 |
| item_te_mean | 4751.19 | 0.0280 |
| lag_12m | 4142.33 | 0.0244 |
| roll_mean_6m | 3145.07 | 0.0185 |
| roll_mean_12m | 2792.07 | 0.0164 |
| log_unit_price | 1574.55 | 0.0093 |
| stockout_days_1m | 1457.59 | 0.0086 |
| month_sin | 1332.83 | 0.0079 |
| roll_std_6m | 1319.17 | 0.0078 |
| roll_std_3m | 1310.36 | 0.0077 |
| roll_std_12m | 1291.89 | 0.0076 |
| month_cos | 1285.66 | 0.0076 |

### P95 - top-10 share 42.51% (n=33 features)

| feature | gain | share |
|---|---|---|
| lag_1m | 8332.58 | 0.4251 |
| lag_2m | 1622.12 | 0.0827 |
| roll_mean_3m | 1272.19 | 0.0649 |
| lag_12m | 957.48 | 0.0488 |
| roll_std_12m | 815.26 | 0.0416 |
| item_te_mean | 780.64 | 0.0398 |
| roll_std_3m | 702.43 | 0.0358 |
| roll_std_6m | 697.04 | 0.0356 |
| roll_mean_12m | 589.38 | 0.0301 |
| lag_6m | 496.98 | 0.0254 |
| month_cos | 494.12 | 0.0252 |
| log_unit_price | 447.65 | 0.0228 |
| lag_3m | 404.77 | 0.0206 |
| roll_mean_6m | 375.54 | 0.0192 |
| month_sin | 369.78 | 0.0189 |

