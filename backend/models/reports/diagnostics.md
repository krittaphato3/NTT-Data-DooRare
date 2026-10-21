# Phase 6b - series diagnostics (frozen predictions, no changes)

Generated: 2026-10-20T03:05:30+00:00

**MOCK DATA - not real accuracy; the pack is synthetic**

Common row set, frozen row-level predictions. LOW_N uses `evaluation.low_n_threshold = 26`.

# WEEK (weekly) - `f1-WEEK-2026-09-14-f455e37770dc`

## WEEK / valid

- rows 4,648; series 166 (0 LOW_N, 166 judged)

### A1 win rate vs the best baseline (per series)

| tau | win rate | win rate (judged) | ties | median ratio | p10 | p90 |
|---|---|---|---|---|---|---|
| 0.5 | 0.4819 | 0.4819 | 0 | 1.0008 | 0.8390 | 1.0769 |
| 0.9 | 0.4639 | 0.4639 | 0 | 1.0196 | 0.8386 | 1.1930 |
| 0.95 | 0.3916 | 0.3916 | 0 | 1.0392 | 0.8296 | 1.3353 |

### A2 scale-free pinball (per-series pinball / series mean y, median across series)

| method | median | p10 | p90 |
|---|---|---|---|
| model | 0.3827 | 0.1420 | 1.2573 |
| seasonal_naive | 0.6839 | 0.2064 | 1.8444 |
| ma_es_residual_quantile | 0.5521 | 0.1742 | 1.4974 |
| empirical_quantile | 0.4007 | 0.1436 | 1.3909 |

### A3 Total-Target stock-out rate vs nominal

Nominal = (2240 V x 0.05 + 2128 E x 0.10) / 4368 = **0.0744**

| method | stock-out rate | delta vs nominal |
|---|---|---|
| model | 0.0856 | +0.0112 |
| seasonal_naive | 0.0408 | -0.0336 |
| ma_es_residual_quantile | 0.0739 | -0.0005 |
| empirical_quantile | 0.0755 | +0.0011 |

### A4 coverage by train-volume tercile

| bucket | series | rows | model .90 | model .95 | seasonal_naive .90 | seasonal_naive .95 | ma_es_residual_quantile .90 | ma_es_residual_quantile .95 | empirical_quantile .90 | empirical_quantile .95 |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 56 | 1568 | 0.8903 | 0.9509 | 0.9305 | 0.9681 | 0.9043 | 0.9522 | 0.9107 | 0.9509 |
| mid | 55 | 1540 | 0.8883 | 0.9474 | 0.9474 | 0.9734 | 0.9123 | 0.9565 | 0.8935 | 0.9390 |
| high | 55 | 1540 | 0.8870 | 0.9351 | 0.9500 | 0.9779 | 0.9032 | 0.9558 | 0.8968 | 0.9468 |

Buckets with no rows: none (cold-start series have no baseline on the common row set).

## WEEK / test

- rows 4,648; series 166 (0 LOW_N, 166 judged)

### A1 win rate vs the best baseline (per series)

| tau | win rate | win rate (judged) | ties | median ratio | p10 | p90 |
|---|---|---|---|---|---|---|
| 0.5 | 0.5060 | 0.5060 | 0 | 0.9983 | 0.8401 | 1.0888 |
| 0.9 | 0.4398 | 0.4398 | 0 | 1.0351 | 0.8160 | 1.1989 |
| 0.95 | 0.3675 | 0.3675 | 0 | 1.0499 | 0.8173 | 1.2806 |

### A2 scale-free pinball (per-series pinball / series mean y, median across series)

| method | median | p10 | p90 |
|---|---|---|---|
| model | 0.3684 | 0.1364 | 1.0876 |
| seasonal_naive | 0.5897 | 0.1813 | 1.7574 |
| ma_es_residual_quantile | 0.5393 | 0.1698 | 1.6137 |
| empirical_quantile | 0.4053 | 0.1414 | 1.3462 |

### A3 Total-Target stock-out rate vs nominal

Nominal = (2240 V x 0.05 + 2128 E x 0.10) / 4368 = **0.0744**

| method | stock-out rate | delta vs nominal |
|---|---|---|
| model | 0.0884 | +0.0140 |
| seasonal_naive | 0.0497 | -0.0247 |
| ma_es_residual_quantile | 0.0673 | -0.0071 |
| empirical_quantile | 0.0968 | +0.0224 |

### A4 coverage by train-volume tercile

| bucket | series | rows | model .90 | model .95 | seasonal_naive .90 | seasonal_naive .95 | ma_es_residual_quantile .90 | ma_es_residual_quantile .95 | empirical_quantile .90 | empirical_quantile .95 |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 56 | 1568 | 0.8941 | 0.9503 | 0.9228 | 0.9585 | 0.9094 | 0.9585 | 0.8999 | 0.9407 |
| mid | 55 | 1540 | 0.8805 | 0.9370 | 0.9325 | 0.9688 | 0.9065 | 0.9526 | 0.8617 | 0.9221 |
| high | 55 | 1540 | 0.8779 | 0.9422 | 0.9396 | 0.9753 | 0.9201 | 0.9565 | 0.8753 | 0.9292 |

Buckets with no rows: none (cold-start series have no baseline on the common row set).

# MONTH (monthly) - `f1-MONTH-2026-08-01-8f70f4a87d1e-r2`

## MONTH / valid

- rows 1,992; series 166 (166 LOW_N, 0 judged)

### A1 win rate vs the best baseline (per series)

| tau | win rate | win rate (judged) | ties | median ratio | p10 | p90 |
|---|---|---|---|---|---|---|
| 0.5 | 0.4277 | - | 0 | 1.0313 | 0.7520 | 1.3377 |
| 0.9 | 0.4639 | - | 0 | 1.0215 | 0.6854 | 1.4721 |
| 0.95 | 0.3855 | - | 0 | 1.1117 | 0.7517 | 1.6349 |

### A2 scale-free pinball (per-series pinball / series mean y, median across series)

| method | median | p10 | p90 |
|---|---|---|---|
| model | 0.2248 | 0.0901 | 0.7124 |
| seasonal_naive | 0.4199 | 0.1226 | 1.6087 |
| ma_es_residual_quantile | 0.3700 | 0.1332 | 1.2888 |
| empirical_quantile | 0.2524 | 0.0942 | 1.0322 |

### A3 Total-Target stock-out rate vs nominal

Nominal = (960 V x 0.05 + 912 E x 0.10) / 1872 = **0.0744**

| method | stock-out rate | delta vs nominal |
|---|---|---|
| model | 0.0780 | +0.0036 |
| seasonal_naive | 0.0438 | -0.0306 |
| ma_es_residual_quantile | 0.0710 | -0.0034 |
| empirical_quantile | 0.0956 | +0.0212 |

### A4 coverage by train-volume tercile

| bucket | series | rows | model .90 | model .95 | seasonal_naive .90 | seasonal_naive .95 | ma_es_residual_quantile .90 | ma_es_residual_quantile .95 | empirical_quantile .90 | empirical_quantile .95 |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 56 | 672 | 0.8929 | 0.9464 | 0.9152 | 0.9405 | 0.8839 | 0.9345 | 0.8571 | 0.9092 |
| mid | 55 | 660 | 0.9197 | 0.9576 | 0.9561 | 0.9833 | 0.9167 | 0.9652 | 0.8848 | 0.9167 |
| high | 55 | 660 | 0.8879 | 0.9364 | 0.9742 | 0.9879 | 0.9288 | 0.9697 | 0.9000 | 0.9333 |

Buckets with no rows: none (cold-start series have no baseline on the common row set).

## MONTH / test

- rows 1,992; series 166 (166 LOW_N, 0 judged)

### A1 win rate vs the best baseline (per series)

| tau | win rate | win rate (judged) | ties | median ratio | p10 | p90 |
|---|---|---|---|---|---|---|
| 0.5 | 0.4036 | - | 0 | 1.0565 | 0.7732 | 1.3471 |
| 0.9 | 0.4699 | - | 0 | 1.0203 | 0.6901 | 1.5489 |
| 0.95 | 0.4458 | - | 0 | 1.0551 | 0.7423 | 1.7248 |

### A2 scale-free pinball (per-series pinball / series mean y, median across series)

| method | median | p10 | p90 |
|---|---|---|---|
| model | 0.2203 | 0.0922 | 0.6398 |
| seasonal_naive | 0.3950 | 0.1061 | 1.3325 |
| ma_es_residual_quantile | 0.3359 | 0.1304 | 1.0134 |
| empirical_quantile | 0.2505 | 0.0906 | 0.9313 |

### A3 Total-Target stock-out rate vs nominal

Nominal = (960 V x 0.05 + 912 E x 0.10) / 1872 = **0.0744**

| method | stock-out rate | delta vs nominal |
|---|---|---|
| model | 0.0897 | +0.0153 |
| seasonal_naive | 0.0443 | -0.0301 |
| ma_es_residual_quantile | 0.0716 | -0.0028 |
| empirical_quantile | 0.1325 | +0.0581 |

### A4 coverage by train-volume tercile

| bucket | series | rows | model .90 | model .95 | seasonal_naive .90 | seasonal_naive .95 | ma_es_residual_quantile .90 | ma_es_residual_quantile .95 | empirical_quantile .90 | empirical_quantile .95 |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 56 | 672 | 0.8988 | 0.9524 | 0.9330 | 0.9643 | 0.9152 | 0.9494 | 0.8482 | 0.9033 |
| mid | 55 | 660 | 0.8803 | 0.9515 | 0.9439 | 0.9727 | 0.9000 | 0.9621 | 0.8515 | 0.8848 |
| high | 55 | 660 | 0.8545 | 0.9333 | 0.9545 | 0.9758 | 0.9061 | 0.9712 | 0.8197 | 0.8742 |

Buckets with no rows: none (cold-start series have no baseline on the common row set).

