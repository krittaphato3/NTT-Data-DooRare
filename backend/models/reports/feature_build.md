# Feature build (Phase 3)

Generated: 2026-10-21T00:02:36+00:00

## Weekly rebuild vs committed matrix

- rows: committed 77,565 / rebuilt 77,565 / joined 77,565
- rows only in the committed file: 0; only in the rebuild: 0
- columns compared: 44; exact: 44; value mismatches: 0

| column | mismatches | share | max abs diff |
|---|---|---|---|
| hospital_code | 0 | 0.0 | None |
| item_code | 0 | 0.0 | None |
| y_target | 0 | 0.0 | 0.0 |
| split | 0 | 0.0 | None |
| lag_1w | 0 | 0.0 | 0.0 |
| lag_2w | 0 | 0.0 | 0.0 |
| lag_3w | 0 | 0.0 | 0.0 |
| lag_4w | 0 | 0.0 | 0.0 |
| lag_8w | 0 | 0.0 | 0.0 |
| lag_13w | 0 | 0.0 | 0.0 |
| lag_26w | 0 | 0.0 | 0.0 |
| lag_52w | 0 | 0.0 | 0.0 |
| roll_mean_4w | 0 | 0.0 | 0.0 |
| roll_std_4w | 0 | 0.0 | 5.25e-10 |
| roll_mean_13w | 0 | 0.0 | 4e-12 |
| roll_std_13w | 0 | 0.0 | 7.5e-11 |
| roll_mean_26w | 0 | 0.0 | 4e-12 |
| roll_std_26w | 0 | 0.0 | 5.3e-11 |
| roll_zero_share_13 | 0 | 0.0 | 0.0 |
| weeks_since_last_nonzero | 0 | 0.0 | 0.0 |
| stockout_days_4w | 0 | 0.0 | 0.0 |
| item_te_mean | 0 | 0.0 | 2e-12 |
| woy_sin | 0 | 0.0 | 0.0 |
| woy_cos | 0 | 0.0 | 0.0 |
| month_sin | 0 | 0.0 | 0.0 |
| month_cos | 0 | 0.0 | 0.0 |
| is_songkran_week | 0 | 0.0 | 0.0 |
| is_newyear_week | 0 | 0.0 | 0.0 |
| long_weekend_days | 0 | 0.0 | 0.0 |
| ctx_covid | 0 | 0.0 | 0.0 |
| ctx_flu_peak | 0 | 0.0 | 0.0 |
| ctx_dengue_peak | 0 | 0.0 | 0.0 |
| ctx_pm25 | 0 | 0.0 | 0.0 |
| ctx_fiscal_year_end | 0 | 0.0 | 0.0 |
| ctx_flood | 0 | 0.0 | 0.0 |
| ctx_seven_dangerous_days | 0 | 0.0 | 0.0 |
| price_tier | 0 | 0.0 | None |
| ved | 0 | 0.0 | None |
| abc | 0 | 0.0 | None |
| item_type | 0 | 0.0 | None |
| hospital_tier | 0 | 0.0 | None |
| is_cold_chain | 0 | 0.0 | 0.0 |
| log_unit_price | 0 | 0.0 | 0.0 |
| is_seasonal | 0 | 0.0 | 0.0 |

## Context flags: known_at_origin vs committed (target week)

| flag | committed=1 | rebuilt=1 | disagreements | share | committed-only (leak) | rebuilt-only |
|---|---|---|---|---|---|---|
| ctx_covid | 57,645 | 57,147 | 498 | 0.00642 | 498 | 0 |
| ctx_flu_peak | 7,166 | 5,333 | 1,833 | 0.023632 | 1,833 | 0 |
| ctx_dengue_peak | 7,138 | 5,478 | 1,660 | 0.021401 | 1,660 | 0 |
| ctx_pm25 | 20,252 | 18,592 | 1,660 | 0.021401 | 1,660 | 0 |
| ctx_fiscal_year_end | 14,153 | 12,493 | 1,660 | 0.021401 | 1,660 | 0 |
| ctx_flood | 3,486 | 2,988 | 498 | 0.00642 | 498 | 0 |
| ctx_seven_dangerous_days | 5,644 | 2,158 | 3,486 | 0.044943 | 3,486 | 0 |

### Alternative reading: event active at the origin (current context, not target period)

| flag | committed=1 | active-at-origin=1 | disagreements | share | committed-only | active-only |
|---|---|---|---|---|---|---|
| ctx_covid | 57,645 | 57,479 | 166 | 0.00214 | 166 | 0 |
| ctx_flu_peak | 7,166 | 6,827 | 3,327 | 0.042893 | 1,833 | 1,494 |
| ctx_dengue_peak | 7,138 | 6,973 | 3,155 | 0.040676 | 1,660 | 1,495 |
| ctx_pm25 | 20,252 | 20,086 | 3,154 | 0.040663 | 1,660 | 1,494 |
| ctx_fiscal_year_end | 14,153 | 13,987 | 3,154 | 0.040663 | 1,660 | 1,494 |
| ctx_flood | 3,486 | 3,486 | 996 | 0.012841 | 498 | 498 |
| ctx_seven_dangerous_days | 5,644 | 5,146 | 6,474 | 0.083465 | 3,486 | 2,988 |

## Monthly matrix

- rows: 17,763; series in scope: 173; series with at least one row: 167
- origin months: 2017-10-01 -> 2026-08-01

| split | rows | series | first origin | last origin |
|---|---|---|---|---|
| embargo | 332 | 166 | 2024-07-01 | 2025-08-01 |
| test | 1,993 | 167 | 2025-09-01 | 2026-08-01 |
| train | 13,446 | 166 | 2017-10-01 | 2024-06-01 |
| valid | 1,992 | 166 | 2024-08-01 | 2025-07-01 |

### Monthly context flags (known_at_origin vs pack target-month variant)

| flag | pack-variant=1 | known-at-origin=1 | disagreements | share |
|---|---|---|---|---|
| ctx_covid | 13,447 | 12,285 | 1,162 | 0.065417 |
| ctx_flu_peak | 1,495 | 0 | 1,495 | 0.084164 |
| ctx_dengue_peak | 1,494 | 0 | 1,494 | 0.084107 |
| ctx_pm25 | 4,482 | 2,988 | 1,494 | 0.084107 |
| ctx_fiscal_year_end | 2,989 | 1,495 | 1,494 | 0.084107 |
| ctx_flood | 996 | 498 | 498 | 0.028036 |
| ctx_seven_dangerous_days | 4,482 | 1,494 | 2,988 | 0.168215 |

## Expectation checks

- PASS `weekly_rows`: actual `77565` vs expected `77565`
- PASS `weekly_split_counts`: actual `{'train': 68226, 'test': 4691, 'valid': 4648}` vs expected `{'train': 68226, 'valid': 4648, 'test': 4691}`
- PASS `weekly_reconciliation_exact`: actual `{'mismatches': 0, 'joined': 77565}` vs expected `{'mismatches': 0, 'joined': 77565}`
- PASS `monthly_rows`: actual `17763` vs expected `17763`
- PASS `monthly_series_in_scope`: actual `173` vs expected `173`
- PASS `monthly_origin_range`: actual `['2017-10-01', '2026-08-01']` vs expected `['2017-10-01', '2026-08-01']`
- PASS `monthly_split_months`: actual `['2024-07', '2025-08']` vs expected `['2024-07', '2025-08']`

## Notes

- `lag_1w` / `lag_1m` is the origin period itself (the reference builder's convention), so the forecast instant is the end of the origin period; that is why context flags use the origin period end as the knowledge cutoff.
- The six series without monthly rows have history only in the final month (2026-09), so no complete target month exists; they stay in scope for the weekly model.
- MOCK DATA: row counts and flags describe the generator, not real events.
