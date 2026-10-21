# Phase 6b - split-conformal calibration decision (valid only)

Generated: 2026-10-20T03:02:02+00:00

**MOCK DATA - not real accuracy; the pack is synthetic**

Method: `s = log1p(y) - log1p(q_tau)` on the final post-processed bands; `delta_tau` = empirical quantile of `s` at `ceil((n+1)*tau)/n`; calibrated band `= expm1(log1p(q_tau) + delta_tau)`, clipped at 0, then sorted per row.

Pre-registered rule (check half only): coverage error strictly decreases, mean width ratio <= 1.10, pinball P50 <= +1 % and P90/P95 <= +3 %. Global is preferred unless tercile cuts the coverage error by >= 20 %.

# WEEK (weekly) - `f1-WEEK-2026-09-14-f455e37770dc`

- calibrate: 2025-08-18 .. 2025-11-17 (14 periods, 2,324 rows)
- gap: 2025-11-24
- check: 2025-12-01 .. 2026-02-23 (13 periods, 2,158 rows)
- tercile feasible: **True** (bucket rows {'low': 784, 'mid': 770, 'high': 770}, need >= 500)

| variant | cov .90 off -> cal | cov .95 off -> cal | coverage error | width ratio | pinball ratio .5/.9/.95 | passes |
|---|---|---|---|---|---|---|
| off | 0.8911 -> 0.8911 | 0.9444 -> 0.9444 | 0.0145 -> 0.0145 | 1.0000 | 1.0000/1.0000/1.0000 | - |
| global | 0.8911 -> 0.8990 | 0.9444 -> 0.9513 | 0.0145 -> 0.0024 | 1.0925 | 0.9998/1.0117/1.0072 | True |
| tercile | 0.8911 -> 0.9018 | 0.9444 -> 0.9486 | 0.0145 -> 0.0032 | 1.1359 | 1.0045/1.0223/1.0220 | False |

**Decision: enabled = True, variant = `global`** - only global satisfies the pre-registered rule.

## WEEK / test - calibrated test evaluation (new)

- rows 4,648; width 204.9323 -> 220.6487; WAPE P50 0.0708 -> 0.0709

| tau | coverage before -> after | pinball before -> after |
|---|---|---|
| 0.05 | 0.1059 -> 0.1018 | 7.3049 -> 7.1974 |
| 0.1 | 0.1444 -> 0.1336 | 12.0996 -> 12.1424 |
| 0.25 | 0.2810 -> 0.2803 | 20.5920 -> 20.5942 |
| 0.5 | 0.5077 -> 0.5069 | 24.2028 -> 24.2137 |
| 0.75 | 0.7352 -> 0.7352 | 19.4839 -> 19.4839 |
| 0.9 | 0.8843 -> 0.8965 | 11.6728 -> 11.6301 |
| 0.95 | 0.9432 -> 0.9516 | 7.2321 -> 7.2028 |

| Total Target metric | before | after |
|---|---|---|
| stock-out rate (nominal 0.0744) | 0.0884 | 0.0760 |
| overstock rate (2x TT) | 0.7434 | 0.7390 |
| under-TT THB | 232464.83 | 210237.63 |
| over-TT THB | 250714.55 | 249536.53 |

Crossing: frozen raw 0.17, shipped 0.0, calibrated pre-sort 0.0972, post-sort 0.0.

| filter | baseline | pinball P50/P90/P95 | delta | beats |
|---|---|---|---|---|
| all_rows | seasonal_naive | 24.2137/11.6301/7.2028 | -7.3119/-17.852/-18.1044 | True |
| all_rows | ma_es_residual_quantile | 24.2137/11.6301/7.2028 | -16.5639/-6.883/-4.7929 | True |
| all_rows | empirical_quantile | 24.2137/11.6301/7.2028 | -9.5273/-2.0004/-0.5058 | True |
| no_stockout_rows | seasonal_naive | 23.9314/11.6342/7.2158 | -7.2957/-18.0716/-18.3494 | True |
| no_stockout_rows | ma_es_residual_quantile | 23.9314/11.6342/7.2158 | -16.804/-6.9656/-4.8551 | True |
| no_stockout_rows | empirical_quantile | 23.9314/11.6342/7.2158 | -9.7459/-2.0197/-0.5013 | True |

Valid was also used for early stopping, so valid residuals are slightly optimistic and the shift may under-correct. No parameter was adjusted after seeing test.

# MONTH (monthly) - `f1-MONTH-2026-08-01-8f70f4a87d1e-r2`

- calibrate: 2024-08-01 .. 2025-01-01 (6 periods, 996 rows)
- gap: 2025-02-01
- check: 2025-03-01 .. 2025-07-01 (5 periods, 830 rows)
- tercile feasible: **False** (bucket rows {'low': 336, 'mid': 330, 'high': 330}, need >= 500)

| variant | cov .90 off -> cal | cov .95 off -> cal | coverage error | width ratio | pinball ratio .5/.9/.95 | passes |
|---|---|---|---|---|---|---|
| off | 0.9108 -> 0.9108 | 0.9470 -> 0.9470 | 0.0139 -> 0.0139 | 1.0000 | 1.0000/1.0000/1.0000 | - |
| global | 0.9108 -> 0.9145 | 0.9470 -> 0.9494 | 0.0139 -> 0.0151 | 1.0731 | 0.9897/1.0089/0.9988 | False |

**Decision: enabled = False, variant = `off`** - no variant satisfies the pre-registered rule on the check half.

No test evaluation was run for this granularity.

