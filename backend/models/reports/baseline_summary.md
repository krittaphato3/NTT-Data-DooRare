# Baseline backtest (weekly + monthly)

Phase 2/3 baselines on the mock pack. Each granularity is scored independently; both filters (`all_rows`, `no_stockout_rows`) are always shown.

## WEEK

Generated: 2026-10-19T07:35:15+00:00 (mock data - not real accuracy)

- Panel: 9,339 rows, 173 series, splits {'test': 4691, 'valid': 4648}, 14 walk-forward blocks
- Rows whose target window had a stock-out day: 135 (reported separately as `no_stockout_rows`)
- Metrics are on the raw scale after expm1-inversion conventions; coverage tolerance +/-0.05; LOW_N threshold 26 periods per series

### all_rows

| split | baseline | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | stockout_rate_vs_tt | overstock_rate_vs_tt | under_thb | over_thb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| test | empirical_quantile | 4670 | 33.6207 | 13.5829 | 7.6834 | 0.5163 | 0.8786 | 0.9304 | 67.2413 | 0.0988 | 224.5617 | 0.0000 | 0.0970 | 0.7399 | 370680.1400 | 246603.2900 |
| test | ma_es_residual_quantile | 4670 | 40.6265 | 18.4461 | 11.9512 | 0.5557 | 0.9113 | 0.9550 | 81.2530 | 0.1194 | 344.2886 | 0.0000 | 0.0681 | 0.7105 | 292310.1000 | 240761.9400 |
| test | seasonal_naive | 4648 | 31.5256 | 29.4821 | 25.3072 | 0.5396 | 0.9316 | 0.9675 | 63.0512 | 0.0923 | 717.8305 | 0.0000 | 0.0497 | 0.6451 | 272610.9600 | 229916.1300 |
| valid | empirical_quantile | 4648 | 28.0046 | 13.7427 | 8.1021 | 0.5650 | 0.9004 | 0.9456 | 56.0091 | 0.0833 | 238.3313 | 0.0000 | 0.0755 | 0.7250 | 167967.7200 | 231249.4300 |
| valid | ma_es_residual_quantile | 4648 | 37.3563 | 15.8459 | 10.2910 | 0.5217 | 0.9066 | 0.9548 | 74.7126 | 0.1111 | 342.8505 | 0.0000 | 0.0739 | 0.7177 | 150704.5300 | 230052.9200 |
| valid | seasonal_naive | 4648 | 40.7644 | 33.6248 | 27.8882 | 0.5764 | 0.9426 | 0.9731 | 81.5288 | 0.1213 | 742.6020 | 0.0000 | 0.0408 | 0.6355 | 68188.4300 | 210433.9600 |

### no_stockout_rows

| split | baseline | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | stockout_rate_vs_tt | overstock_rate_vs_tt | under_thb | over_thb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| test | empirical_quantile | 4579 | 33.5548 | 13.6053 | 7.6914 | 0.5169 | 0.8781 | 0.9308 | 67.1096 | 0.0973 | 226.4073 | 0.0000 | 0.0972 | 0.7536 | 360381.8600 | 248827.7400 |
| test | ma_es_residual_quantile | 4579 | 40.5815 | 18.5310 | 12.0251 | 0.5538 | 0.9131 | 0.9557 | 81.1629 | 0.1177 | 347.9623 | 0.0000 | 0.0662 | 0.7238 | 266505.6800 | 242935.9200 |
| test | seasonal_naive | 4557 | 31.2271 | 29.7058 | 25.5652 | 0.5376 | 0.9337 | 0.9686 | 62.4542 | 0.0902 | 727.2769 | 0.0000 | 0.0474 | 0.6565 | 229337.2400 | 232019.5500 |
| valid | empirical_quantile | 4604 | 28.1758 | 13.8294 | 8.1511 | 0.5649 | 0.9007 | 0.9455 | 56.3515 | 0.0834 | 239.7436 | 0.0000 | 0.0756 | 0.7317 | 166495.7600 | 232569.0500 |
| valid | ma_es_residual_quantile | 4604 | 37.5864 | 15.9219 | 10.3303 | 0.5202 | 0.9064 | 0.9546 | 75.1728 | 0.1112 | 344.3254 | 0.0000 | 0.0740 | 0.7243 | 150227.9800 | 231366.1200 |
| valid | seasonal_naive | 4604 | 40.9847 | 33.7137 | 27.9293 | 0.5762 | 0.9427 | 0.9733 | 81.9694 | 0.1213 | 744.4573 | 0.0000 | 0.0404 | 0.6413 | 67768.6700 | 211635.7400 |

### Coverage gate per series

| baseline | split | filter | series judged | LOW_N | all-zero series | pass cov90 | median cov90 | pass cov95 | median cov95 |
|---|---|---|---|---|---|---|---|---|---|
| empirical_quantile | test | all_rows | 165 | 7 | 1 | 0.5758 | 0.8929 | 0.5455 | 0.9286 |
| empirical_quantile | test | no_stockout_rows | 155 | 17 | 1 | 0.5806 | 0.8889 | 0.5677 | 0.9286 |
| empirical_quantile | valid | all_rows | 165 | 0 | 1 | 0.6121 | 0.8929 | 0.5697 | 0.9643 |
| empirical_quantile | valid | no_stockout_rows | 163 | 2 | 1 | 0.5951 | 0.8929 | 0.5706 | 0.963 |
| ma_es_residual_quantile | test | all_rows | 165 | 7 | 1 | 0.6121 | 0.9286 | 0.5333 | 0.9643 |
| ma_es_residual_quantile | test | no_stockout_rows | 155 | 17 | 1 | 0.6387 | 0.9259 | 0.529 | 0.9643 |
| ma_es_residual_quantile | valid | all_rows | 165 | 0 | 1 | 0.7455 | 0.8929 | 0.6364 | 0.9643 |
| ma_es_residual_quantile | valid | no_stockout_rows | 163 | 2 | 1 | 0.7423 | 0.8929 | 0.6442 | 0.9643 |
| seasonal_naive | test | all_rows | 165 | 0 | 1 | 0.4485 | 0.9286 | 0.4242 | 0.9643 |
| seasonal_naive | test | no_stockout_rows | 155 | 10 | 1 | 0.4581 | 0.9286 | 0.4194 | 1.0 |
| seasonal_naive | valid | all_rows | 165 | 0 | 1 | 0.3758 | 0.9643 | 0.3333 | 1.0 |
| seasonal_naive | valid | no_stockout_rows | 163 | 2 | 1 | 0.3681 | 0.9643 | 0.3313 | 1.0 |
## MONTH

Generated: 2026-10-19T07:35:19+00:00 (mock data - not real accuracy)

- Panel: 3,985 rows, 167 series, splits {'test': 1993, 'valid': 1992}, 24 walk-forward blocks
- Rows whose target window had a stock-out day: 211 (reported separately as `no_stockout_rows`)
- Metrics are on the raw scale after expm1-inversion conventions; coverage tolerance +/-0.05; LOW_N threshold 26 periods per series

### all_rows

| split | baseline | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | stockout_rate_vs_tt | overstock_rate_vs_tt | under_thb | over_thb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| test | empirical_quantile | 1992 | 118.8368 | 48.9947 | 28.8585 | 0.5141 | 0.8399 | 0.8876 | 237.6737 | 0.0812 | 710.0596 | 0.0000 | 0.1325 | 0.1448 | 489495.8400 | 24152.2100 |
| test | ma_es_residual_quantile | 1992 | 161.9219 | 65.0946 | 38.2179 | 0.5095 | 0.9071 | 0.9608 | 323.8439 | 0.1106 | 1478.6765 | 0.0000 | 0.0716 | 0.1277 | 240665.6900 | 16644.6900 |
| test | seasonal_naive | 1992 | 98.2284 | 120.4445 | 102.1542 | 0.5477 | 0.9438 | 0.9709 | 196.4568 | 0.0671 | 2802.7746 | 0.0000 | 0.0443 | 0.1373 | 117431.0900 | 19185.0500 |
| valid | empirical_quantile | 1992 | 119.6524 | 75.2932 | 42.3356 | 0.5542 | 0.8805 | 0.9197 | 239.3047 | 0.0793 | 1127.3091 | 0.0000 | 0.0956 | 0.1522 | 404765.6100 | 53688.0600 |
| valid | ma_es_residual_quantile | 1992 | 195.9491 | 73.2113 | 44.0987 | 0.5351 | 0.9096 | 0.9563 | 391.8981 | 0.1298 | 1540.0620 | 0.0000 | 0.0710 | 0.1362 | 351390.9400 | 49709.8200 |
| valid | seasonal_naive | 1992 | 129.9977 | 128.8387 | 109.1150 | 0.5708 | 0.9483 | 0.9704 | 259.9955 | 0.0861 | 2990.8014 | 0.0000 | 0.0438 | 0.1528 | 152955.7200 | 52074.9800 |

### no_stockout_rows

| split | baseline | rows | pinball_0.5 | pinball_0.9 | pinball_0.95 | coverage_0.5 | coverage_0.9 | coverage_0.95 | mae_p50 | wape_p50 | width_p95_p05 | crossing_rate_raw | stockout_rate_vs_tt | overstock_rate_vs_tt | under_thb | over_thb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| test | empirical_quantile | 1898 | 121.6616 | 50.2869 | 29.6998 | 0.5216 | 0.8435 | 0.8872 | 243.3232 | 0.0810 | 729.2256 | 0.0000 | 0.1312 | 0.1492 | 438762.0500 | 22063.4800 |
| test | ma_es_residual_quantile | 1898 | 165.7952 | 66.4160 | 39.1027 | 0.5148 | 0.9099 | 0.9626 | 331.5903 | 0.1103 | 1518.2148 | 0.0000 | 0.0684 | 0.1324 | 130530.7400 | 14537.3200 |
| test | seasonal_naive | 1898 | 100.4989 | 122.5361 | 103.6926 | 0.5458 | 0.9442 | 0.9715 | 200.9979 | 0.0669 | 2858.6109 | 0.0000 | 0.0443 | 0.1413 | 77024.7500 | 16940.7800 |
| valid | empirical_quantile | 1875 | 119.8208 | 76.9113 | 43.1747 | 0.5573 | 0.8816 | 0.9205 | 239.6416 | 0.0788 | 1140.8785 | 0.0000 | 0.0941 | 0.1598 | 355028.2500 | 56306.3700 |
| valid | ma_es_residual_quantile | 1875 | 197.1446 | 74.8708 | 44.7921 | 0.5435 | 0.9115 | 0.9605 | 394.2893 | 0.1296 | 1548.5922 | 0.0000 | 0.0674 | 0.1428 | 152496.0400 | 51537.6500 |
| valid | seasonal_naive | 1875 | 128.4947 | 127.5497 | 107.9403 | 0.5685 | 0.9509 | 0.9723 | 256.9893 | 0.0845 | 2967.9625 | 0.0000 | 0.0408 | 0.1598 | 93469.1500 | 55135.6300 |

### Coverage gate per series

| baseline | split | filter | series judged | LOW_N | all-zero series | pass cov90 | median cov90 | pass cov95 | median cov95 |
|---|---|---|---|---|---|---|---|---|---|
| empirical_quantile | test | all_rows | 0 | 166 | 0 | None | None | None | None |
| empirical_quantile | test | no_stockout_rows | 0 | 166 | 0 | None | None | None | None |
| empirical_quantile | valid | all_rows | 0 | 166 | 0 | None | None | None | None |
| empirical_quantile | valid | no_stockout_rows | 0 | 166 | 0 | None | None | None | None |
| ma_es_residual_quantile | test | all_rows | 0 | 166 | 0 | None | None | None | None |
| ma_es_residual_quantile | test | no_stockout_rows | 0 | 166 | 0 | None | None | None | None |
| ma_es_residual_quantile | valid | all_rows | 0 | 166 | 0 | None | None | None | None |
| ma_es_residual_quantile | valid | no_stockout_rows | 0 | 166 | 0 | None | None | None | None |
| seasonal_naive | test | all_rows | 0 | 166 | 0 | None | None | None | None |
| seasonal_naive | test | no_stockout_rows | 0 | 166 | 0 | None | None | None | None |
| seasonal_naive | valid | all_rows | 0 | 166 | 0 | None | None | None | None |
| seasonal_naive | valid | no_stockout_rows | 0 | 166 | 0 | None | None | None | None |
## Notes

- Baselines are the mandatory comparison set (weekly spec section 7.3): a Phase 4/5 quantile model must beat seasonal naive and MA/ES + residual quantile on pinball loss at P50/P90/P95 with coverage inside the tolerance.
- `crossing_rate_raw` is measured before the monotone fix; metrics use the fixed bands (spec E4).
- `stockout_rate_vs_tt` / `overstock_rate_vs_tt` use Total Target (V: P95, E: P90, D: undefined) and exclude D series from that metric.
- Monthly valid/test hold only 12 periods per series, so every series is `LOW_N` there by the 26-period rule: judge the monthly baseline pooled, not per series.
- MOCK DATA: the pack is synthetic, so these numbers describe the generator, not real accuracy.
