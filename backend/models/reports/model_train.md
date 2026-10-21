# Phase 4 - weekly quantile model training

Generated: 2026-10-19T08:54:37+00:00 (MOCK DATA - not real accuracy)

- Model version: `f1-WEEK-2026-09-14-f455e37770dc` (feature hash `f455e37770dc`)
- Features: 40 used; constant columns dropped: none
- Training window: `all_history` (2017-09-25 -> 2025-08-04, 68,226 rows)
- Variant valid pinball (sum over the seven quantiles): `{'last_24_months': 102.2204, 'all_history': 92.5613}`
- Post-processing: `isotonic` (width ratio 0.9901)
- Grid: {"learning_rate": [0.03, 0.05], "num_leaves": [15, 31, 63], "min_child_samples": [20, 50]} (selected on valid only)

## Selection

| quantile | learning_rate | num_leaves | min_child_samples | valid pinball | best iteration |
|---|---|---|---|---|---|
| 0.05 | 0.05 | 15 | 20 | 6.0399 | 1090 |
| 0.1 | 0.03 | 15 | 50 | 10.5067 | 2484 |
| 0.25 | 0.03 | 15 | 20 | 18.1916 | 3976 |
| 0.5 | 0.03 | 31 | 50 | 22.1105 | 1959 |
| 0.75 | 0.03 | 15 | 50 | 18.5069 | 2952 |
| 0.9 | 0.05 | 15 | 20 | 10.586 | 1350 |
| 0.95 | 0.03 | 15 | 20 | 6.6197 | 1302 |

## Post-processing choice (valid only)

| variant | cov P90 | cov P95 | coverage score | width P95-P05 | raw crossing | fixed crossing |
|---|---|---|---|---|---|---|
| sort | 0.8881 | 0.9445 | 0.0174 | 189.5364 | 0.1566 | 0.0 |
| isotonic | 0.8886 | 0.9445 | 0.0169 | 187.6604 | 0.1566 | 0.0 |

Rule: coverage inside tolerance, strictly better coverage score, width ratio <= max_width_ratio (tolerance 0.05, width ratio <= 1.05); width ratio 0.9901; chosen **isotonic**

## Valid metrics

| filter | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | crossing_rate_fixed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| all_rows | 4648 | 22.1065 | 10.5113 | 6.6022 | 0.5239 | 0.8886 | 0.9445 | 44.2130 | 0.0658 | 187.6604 | 0.1566 | 0.0000 |
| no_stockout_rows | 4604 | 22.2418 | 10.5683 | 6.6419 | 0.5235 | 0.8886 | 0.9444 | 44.4837 | 0.0658 | 188.6152 | 0.1566 | 0.0000 |

## Gate (valid)

| filter | baseline | delta P50 | delta P90 | delta P95 | beats |
|---|---|---|---|---|---|
| all_rows | seasonal_naive | -18.6579 | -23.1135 | -21.286 | True |
| all_rows | ma_es_residual_quantile | -15.2498 | -5.3346 | -3.6888 | True |
| no_stockout_rows | seasonal_naive | -18.7429 | -23.1454 | -21.2874 | True |
| no_stockout_rows | ma_es_residual_quantile | -15.3446 | -5.3536 | -3.6884 | True |

Gate passed: **True**

## All grid results (valid)

| variant | quantile | learning_rate | num_leaves | min_child_samples | valid pinball | best iteration |
|---|---|---|---|---|---|---|
| all_history | 0.05 | 0.05 | 15 | 20 | 6.0399 | 1090 |
| all_history | 0.05 | 0.03 | 15 | 20 | 6.2211 | 1954 |
| all_history | 0.05 | 0.05 | 31 | 50 | 6.264 | 610 |
| all_history | 0.05 | 0.05 | 15 | 50 | 6.4308 | 661 |
| all_history | 0.05 | 0.03 | 31 | 50 | 6.5115 | 924 |
| all_history | 0.05 | 0.03 | 15 | 50 | 6.52 | 995 |
| all_history | 0.05 | 0.03 | 31 | 20 | 6.5389 | 856 |
| all_history | 0.05 | 0.05 | 63 | 20 | 6.5943 | 483 |
| all_history | 0.05 | 0.05 | 31 | 20 | 6.6619 | 541 |
| all_history | 0.05 | 0.05 | 63 | 50 | 6.7379 | 464 |
| all_history | 0.05 | 0.03 | 63 | 50 | 6.8435 | 736 |
| all_history | 0.05 | 0.03 | 63 | 20 | 6.9556 | 764 |
| all_history | 0.1 | 0.03 | 15 | 50 | 10.5067 | 2484 |
| all_history | 0.1 | 0.03 | 15 | 20 | 10.536 | 1983 |
| all_history | 0.1 | 0.05 | 15 | 50 | 10.5588 | 1103 |
| all_history | 0.1 | 0.03 | 31 | 20 | 10.5697 | 1164 |
| all_history | 0.1 | 0.03 | 31 | 50 | 10.5913 | 1096 |
| all_history | 0.1 | 0.05 | 31 | 50 | 10.6685 | 811 |
| all_history | 0.1 | 0.05 | 15 | 20 | 10.6977 | 1521 |
| all_history | 0.1 | 0.05 | 31 | 20 | 10.8775 | 759 |
| all_history | 0.1 | 0.05 | 63 | 20 | 10.8882 | 423 |
| all_history | 0.1 | 0.03 | 63 | 50 | 11.0074 | 665 |
| all_history | 0.1 | 0.05 | 63 | 50 | 11.1871 | 389 |
| all_history | 0.1 | 0.03 | 63 | 20 | 11.2588 | 661 |
| all_history | 0.25 | 0.03 | 15 | 20 | 18.1916 | 3976 |
| all_history | 0.25 | 0.05 | 31 | 50 | 18.2937 | 1876 |
| all_history | 0.25 | 0.05 | 63 | 50 | 18.3356 | 888 |
| all_history | 0.25 | 0.05 | 15 | 50 | 18.3534 | 1968 |
| all_history | 0.25 | 0.03 | 63 | 50 | 18.4152 | 1354 |
| all_history | 0.25 | 0.03 | 63 | 20 | 18.431 | 1226 |
| all_history | 0.25 | 0.05 | 31 | 20 | 18.4759 | 1275 |
| all_history | 0.25 | 0.03 | 15 | 50 | 18.4795 | 3233 |
| all_history | 0.25 | 0.03 | 31 | 20 | 18.5255 | 1695 |
| all_history | 0.25 | 0.03 | 31 | 50 | 18.5489 | 1340 |
| all_history | 0.25 | 0.05 | 15 | 20 | 18.6836 | 1639 |
| all_history | 0.25 | 0.05 | 63 | 20 | 18.6858 | 494 |
| all_history | 0.5 | 0.03 | 31 | 50 | 22.1105 | 1959 |
| all_history | 0.5 | 0.03 | 31 | 20 | 22.2298 | 1596 |
| all_history | 0.5 | 0.05 | 15 | 20 | 22.2993 | 2724 |
| all_history | 0.5 | 0.05 | 15 | 50 | 22.3284 | 1979 |
| all_history | 0.5 | 0.03 | 15 | 20 | 22.426 | 3189 |
| all_history | 0.5 | 0.03 | 15 | 50 | 22.4605 | 3547 |
| all_history | 0.5 | 0.05 | 31 | 50 | 22.5434 | 841 |
| all_history | 0.5 | 0.03 | 63 | 20 | 22.59 | 957 |
| all_history | 0.5 | 0.03 | 63 | 50 | 22.6163 | 754 |
| all_history | 0.5 | 0.05 | 63 | 20 | 22.6453 | 770 |
| all_history | 0.5 | 0.05 | 31 | 20 | 22.6678 | 794 |
| all_history | 0.5 | 0.05 | 63 | 50 | 22.6764 | 523 |
| all_history | 0.75 | 0.03 | 15 | 50 | 18.5069 | 2952 |
| all_history | 0.75 | 0.05 | 63 | 20 | 18.5093 | 616 |
| all_history | 0.75 | 0.03 | 31 | 20 | 18.5712 | 1159 |
| all_history | 0.75 | 0.03 | 31 | 50 | 18.5968 | 1916 |
| all_history | 0.75 | 0.05 | 15 | 50 | 18.6362 | 1646 |
| all_history | 0.75 | 0.05 | 15 | 20 | 18.7809 | 1498 |
| all_history | 0.75 | 0.03 | 15 | 20 | 18.8416 | 2111 |
| all_history | 0.75 | 0.03 | 63 | 20 | 18.8945 | 318 |
| all_history | 0.75 | 0.03 | 63 | 50 | 18.8959 | 882 |
| all_history | 0.75 | 0.05 | 31 | 20 | 19.0675 | 814 |
| all_history | 0.75 | 0.05 | 31 | 50 | 19.068 | 531 |
| all_history | 0.75 | 0.05 | 63 | 50 | 19.1059 | 550 |
| all_history | 0.9 | 0.05 | 15 | 20 | 10.586 | 1350 |
| all_history | 0.9 | 0.03 | 31 | 20 | 10.7253 | 530 |
| all_history | 0.9 | 0.05 | 31 | 20 | 10.92 | 339 |
| all_history | 0.9 | 0.05 | 63 | 20 | 10.9259 | 270 |
| all_history | 0.9 | 0.03 | 63 | 20 | 10.9783 | 568 |
| all_history | 0.9 | 0.03 | 31 | 50 | 11.1074 | 648 |
| all_history | 0.9 | 0.03 | 63 | 50 | 11.1372 | 720 |
| all_history | 0.9 | 0.03 | 15 | 20 | 11.2282 | 822 |
| all_history | 0.9 | 0.05 | 63 | 50 | 11.2591 | 459 |
| all_history | 0.9 | 0.03 | 15 | 50 | 11.2679 | 1308 |
| all_history | 0.9 | 0.05 | 15 | 50 | 11.3286 | 695 |
| all_history | 0.9 | 0.05 | 31 | 50 | 11.4499 | 309 |
| all_history | 0.95 | 0.03 | 15 | 20 | 6.6197 | 1302 |
| all_history | 0.95 | 0.05 | 31 | 20 | 6.7864 | 791 |
| all_history | 0.95 | 0.03 | 15 | 50 | 6.8199 | 1688 |
| all_history | 0.95 | 0.03 | 31 | 20 | 6.8488 | 1082 |
| all_history | 0.95 | 0.05 | 31 | 50 | 6.8758 | 579 |
| all_history | 0.95 | 0.05 | 15 | 20 | 6.9055 | 1484 |
| all_history | 0.95 | 0.03 | 63 | 20 | 6.9655 | 829 |
| all_history | 0.95 | 0.03 | 63 | 50 | 6.9655 | 687 |
| all_history | 0.95 | 0.03 | 31 | 50 | 6.99 | 1231 |
| all_history | 0.95 | 0.05 | 63 | 20 | 7.0291 | 446 |
| all_history | 0.95 | 0.05 | 63 | 50 | 7.0531 | 369 |
| all_history | 0.95 | 0.05 | 15 | 50 | 7.1459 | 1482 |
| last_24_months | 0.05 | 0.05 | 15 | 50 | 7.9263 | 610 |
| last_24_months | 0.05 | 0.03 | 15 | 50 | 8.3428 | 916 |
| last_24_months | 0.05 | 0.03 | 15 | 20 | 8.5341 | 976 |
| last_24_months | 0.05 | 0.03 | 63 | 50 | 8.5591 | 794 |
| last_24_months | 0.05 | 0.05 | 31 | 50 | 8.6118 | 481 |
| last_24_months | 0.05 | 0.05 | 15 | 20 | 8.6696 | 533 |
| last_24_months | 0.05 | 0.03 | 31 | 50 | 8.6993 | 807 |
| last_24_months | 0.05 | 0.05 | 31 | 20 | 8.7314 | 493 |
| last_24_months | 0.05 | 0.03 | 31 | 20 | 8.8576 | 794 |
| last_24_months | 0.05 | 0.03 | 63 | 20 | 9.5541 | 714 |
| last_24_months | 0.05 | 0.05 | 63 | 50 | 10.5924 | 374 |
| last_24_months | 0.05 | 0.05 | 63 | 20 | 11.5716 | 382 |
| last_24_months | 0.1 | 0.03 | 15 | 20 | 11.6379 | 944 |
| last_24_months | 0.1 | 0.05 | 15 | 20 | 12.1091 | 534 |
| last_24_months | 0.1 | 0.03 | 15 | 50 | 12.1337 | 819 |
| last_24_months | 0.1 | 0.05 | 15 | 50 | 12.2025 | 498 |
| last_24_months | 0.1 | 0.05 | 31 | 20 | 12.2895 | 458 |
| last_24_months | 0.1 | 0.05 | 31 | 50 | 12.8098 | 421 |
| last_24_months | 0.1 | 0.03 | 31 | 20 | 13.2126 | 700 |
| last_24_months | 0.1 | 0.03 | 31 | 50 | 13.3075 | 672 |
| last_24_months | 0.1 | 0.05 | 63 | 50 | 13.7172 | 393 |
| last_24_months | 0.1 | 0.03 | 63 | 20 | 14.0412 | 637 |
| last_24_months | 0.1 | 0.05 | 63 | 20 | 14.1846 | 379 |
| last_24_months | 0.1 | 0.03 | 63 | 50 | 14.4436 | 615 |
| last_24_months | 0.25 | 0.03 | 31 | 20 | 19.7095 | 503 |
| last_24_months | 0.25 | 0.03 | 15 | 20 | 19.8096 | 640 |
| last_24_months | 0.25 | 0.05 | 15 | 50 | 19.8734 | 334 |
| last_24_months | 0.25 | 0.05 | 63 | 20 | 19.9047 | 278 |
| last_24_months | 0.25 | 0.05 | 15 | 20 | 19.9935 | 370 |
| last_24_months | 0.25 | 0.03 | 15 | 50 | 20.1285 | 548 |
| last_24_months | 0.25 | 0.03 | 31 | 50 | 20.1881 | 488 |
| last_24_months | 0.25 | 0.03 | 63 | 20 | 20.5603 | 459 |
| last_24_months | 0.25 | 0.05 | 31 | 50 | 20.7283 | 283 |
| last_24_months | 0.25 | 0.05 | 63 | 50 | 20.7519 | 264 |
| last_24_months | 0.25 | 0.05 | 31 | 20 | 20.7753 | 274 |
| last_24_months | 0.25 | 0.03 | 63 | 50 | 21.0156 | 458 |
| last_24_months | 0.5 | 0.03 | 15 | 50 | 24.1799 | 1244 |
| last_24_months | 0.5 | 0.05 | 15 | 50 | 24.3205 | 974 |
| last_24_months | 0.5 | 0.03 | 63 | 20 | 24.4332 | 301 |
| last_24_months | 0.5 | 0.05 | 31 | 50 | 24.678 | 416 |
| last_24_months | 0.5 | 0.03 | 63 | 50 | 24.7035 | 575 |
| last_24_months | 0.5 | 0.05 | 63 | 50 | 24.7993 | 304 |
| last_24_months | 0.5 | 0.05 | 63 | 20 | 24.9712 | 245 |
| last_24_months | 0.5 | 0.03 | 31 | 50 | 25.0343 | 526 |
| last_24_months | 0.5 | 0.03 | 31 | 20 | 25.3061 | 355 |
| last_24_months | 0.5 | 0.05 | 31 | 20 | 25.3198 | 223 |
| last_24_months | 0.5 | 0.05 | 15 | 20 | 25.5035 | 840 |
| last_24_months | 0.5 | 0.03 | 15 | 20 | 25.8254 | 1156 |
| last_24_months | 0.75 | 0.03 | 31 | 20 | 20.0674 | 349 |
| last_24_months | 0.75 | 0.03 | 15 | 50 | 20.3202 | 793 |
| last_24_months | 0.75 | 0.03 | 63 | 50 | 20.3223 | 461 |
| last_24_months | 0.75 | 0.03 | 31 | 50 | 20.3945 | 529 |
| last_24_months | 0.75 | 0.05 | 63 | 50 | 20.4423 | 306 |
| last_24_months | 0.75 | 0.03 | 15 | 20 | 20.443 | 615 |
| last_24_months | 0.75 | 0.05 | 31 | 50 | 20.5765 | 320 |
| last_24_months | 0.75 | 0.05 | 63 | 20 | 20.6702 | 274 |
| last_24_months | 0.75 | 0.03 | 63 | 20 | 20.741 | 346 |
| last_24_months | 0.75 | 0.05 | 31 | 20 | 20.8091 | 373 |
| last_24_months | 0.75 | 0.05 | 15 | 20 | 21.0553 | 291 |
| last_24_months | 0.75 | 0.05 | 15 | 50 | 21.1406 | 469 |
| last_24_months | 0.9 | 0.03 | 63 | 50 | 11.5969 | 494 |
| last_24_months | 0.9 | 0.03 | 15 | 20 | 11.6181 | 1068 |
| last_24_months | 0.9 | 0.03 | 31 | 20 | 11.6247 | 678 |
| last_24_months | 0.9 | 0.03 | 63 | 20 | 11.6293 | 446 |
| last_24_months | 0.9 | 0.03 | 31 | 50 | 11.6398 | 631 |
| last_24_months | 0.9 | 0.03 | 15 | 50 | 11.6631 | 852 |
| last_24_months | 0.9 | 0.05 | 63 | 20 | 11.6644 | 255 |
| last_24_months | 0.9 | 0.05 | 15 | 20 | 11.7169 | 450 |
| last_24_months | 0.9 | 0.05 | 31 | 20 | 11.834 | 362 |
| last_24_months | 0.9 | 0.05 | 15 | 50 | 12.1804 | 657 |
| last_24_months | 0.9 | 0.05 | 63 | 50 | 12.267 | 279 |
| last_24_months | 0.9 | 0.05 | 31 | 50 | 12.3381 | 412 |
| last_24_months | 0.95 | 0.03 | 31 | 50 | 7.1025 | 619 |
| last_24_months | 0.95 | 0.03 | 15 | 20 | 7.1441 | 937 |
| last_24_months | 0.95 | 0.03 | 63 | 50 | 7.1587 | 631 |
| last_24_months | 0.95 | 0.03 | 15 | 50 | 7.1876 | 1032 |
| last_24_months | 0.95 | 0.03 | 63 | 20 | 7.2458 | 579 |
| last_24_months | 0.95 | 0.05 | 31 | 50 | 7.2809 | 407 |
| last_24_months | 0.95 | 0.03 | 31 | 20 | 7.3252 | 849 |
| last_24_months | 0.95 | 0.05 | 15 | 50 | 7.3282 | 566 |
| last_24_months | 0.95 | 0.05 | 15 | 20 | 7.3451 | 618 |
| last_24_months | 0.95 | 0.05 | 63 | 50 | 7.3535 | 367 |
| last_24_months | 0.95 | 0.05 | 31 | 20 | 7.5662 | 452 |
| last_24_months | 0.95 | 0.05 | 63 | 20 | 7.801 | 334 |

## Notes

- The test split is not read here; `evaluate --split test` is run once after selection.
- Context flags come from the Phase 3 canonical (known-at-origin) rebuild.
- MOCK DATA: these numbers describe the synthetic generator.
