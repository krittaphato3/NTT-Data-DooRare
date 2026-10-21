# Phase 1 - data quality summary (F1 quantile module)

Generated: 2026-10-21T00:02:27+00:00 (read-only checks; no input file was modified)

- Modelled series: **173** (191 listings - 3 blood - 15 Min-Max)
- Joined daily series: 188 | cold-start series: 7
- Stock-out days in scope: 23,991 (3.57%); series with at least one: 158
- Checks: 13 total, 0 failed, 0 warnings

| Check | Status | Result |
|---|---|---|
| `usage_daily.keys_and_ranges` | PASS | 672,367 rows (expected 672,367), 191 series, 0 duplicate keys, 0 negative quantities |
| `stock_snapshot.keys_and_censoring` | PASS | 672,367 rows (expected 672,367), 0 duplicate keys, 23,991 stock-out days (3.57%) -> target is stock-out censored |
| `reference_tables.shape` | PASS | drug_master 41 rows (expected 41), hospitals 5 rows ['HA', 'HB', 'HC', 'HD', 'HE'] (expected 5) |
| `series_inventory.exclusions` | PASS | 191 listings - 3 blood - 15 Min-Max (VED=D, price<=50) = 173 modelled series |
| `series_inventory.drug_master_resolution` | PASS | 16 listings without drug_master_id, all resolved via gp_id; 0 UNMAPPED, 0 LOCAL- item codes |
| `identity.daily_crosswalk` | PASS | 661,411 daily rows (expected 661,411), 188 daily series == 188 non-blood listings == expected 188; 188 unique (hospital_code, item_code) pairs (173 in modelling scope) |
| `consistency.daily_vs_pack` | PASS | per-series usage sums identical for 188 series (max gap 0.000000); 0 on-hand mismatches on the last day |
| `cold_start.series` | PASS | 7 cold-start series (46-68 days of history), weekly splits {'test': 43} |
| `weekly_matrix.shape_and_splits` | PASS | 77,565 rows (expected 77,565), 173 series (expected 173), splits {'test': 4691, 'train': 68226, 'valid': 4648} (expected {'train': 68226, 'valid': 4648, 'test': 4691}), 6,783 zero targets (8.7%), duplicate keys 0 |
| `weekly_matrix.target_from_raw` | PASS | recomputed y_target and lag_1w from usage_daily for 300 sampled rows: 0 / 0 mismatches |
| `context_signal.windows` | PASS | 73 windows over 7 signal types; 73/73 have created_at == valid_from (a target-week flag can leak up to 7 days, hence the known-at-origin rule); 62 windows start mid-week |
| `monthly.projection` | PASS | 17,763 monthly training rows (expected 17,763) for 173 series, origin_month 2017-10-01 -> 2026-08-01 (complete months only, 12-month warm-up for long series) |
| `scope.integrity` | PASS | 173 modelled series, 0 inactive / 0 unpriced / 0 without VED / 0 without lead time; lead time 5-28 days (median 10) |

## Key metrics

```json
{
  "usage_daily.keys_and_ranges": {
    "rows": 672367,
    "series": 191,
    "duplicate_keys": 0,
    "negative_qty": 0,
    "zero_days": 145460,
    "zero_share": 0.21634,
    "date_min": "2016-10-01",
    "date_max": "2026-09-30",
    "qty_used_sum": 66885967.0,
    "expected_rows": 672367
  },
  "stock_snapshot.keys_and_censoring": {
    "rows": 672367,
    "duplicate_keys": 0,
    "stockout_days": 23991,
    "stockout_share": 0.035681,
    "negative_on_hand": 0,
    "incoming_positive_rows": 139720,
    "held_positive_rows": 0,
    "date_min": "2016-10-01",
    "date_max": "2026-09-30",
    "expected_rows": 672367
  },
  "reference_tables.shape": {
    "drug_master_rows": 41,
    "expected_drug_master_rows": 41,
    "hospital_rows": 5,
    "expected_hospital_rows": 5,
    "hospital_codes": [
      "HA",
      "HB",
      "HC",
      "HD",
      "HE"
    ],
    "blood_products_in_catalogue": 1,
    "supply_internal_codes": 8
  },
  "series_inventory.exclusions": {
    "hospital_drug_rows": 191,
    "blood_products": 3,
    "min_max": 15,
    "non_blood": 188,
    "in_scope": 173,
    "expected": {
      "hospital_drug_rows": 191,
      "non_blood": 188,
      "in_scope": 173
    }
  },
  "series_inventory.drug_master_resolution": {
    "unmapped_item_type": 0,
    "null_drug_master_id": 16,
    "local_fallback_item_codes": 0,
    "resolved_via_gp_id": 16,
    "item_type_counts": {
      "DRUG": 148,
      "SUPPLY": 40,
      "BLOOD": 3
    }
  },
  "identity.daily_crosswalk": {
    "daily_rows": 661411,
    "expected_daily_rows": 661411,
    "daily_series": 188,
    "daily_hospital_item_pairs": 188,
    "non_blood_listings": 188,
    "daily_series_in_model_scope": 173,
    "expected_daily_series": 188
  },
  "consistency.daily_vs_pack": {
    "series_compared": 188,
    "usage_sum_mismatches": 0,
    "max_usage_sum_gap": 0.0,
    "on_hand_mismatches_last_day": 0,
    "on_hand_last_date": "2026-09-30",
    "stockout_threshold": 0.0
  },
  "cold_start.series": {
    "cold_start_series": 7,
    "expected": 7,
    "history_days_min": 46,
    "history_days_max": 68,
    "all_in_model_scope": true,
    "weekly_split_counts": {
      "test": 43
    }
  },
  "weekly_matrix.shape_and_splits": {
    "rows": 77565,
    "series": 173,
    "duplicate_keys": 0,
    "split_counts": {
      "test": 4691,
      "train": 68226,
      "valid": 4648
    },
    "missing_splits": [],
    "split_spans": {
      "test": [
        "2026-03-09",
        "2026-09-14"
      ],
      "train": [
        "2017-09-25",
        "2025-08-04"
      ],
      "valid": [
        "2025-08-18",
        "2026-02-23"
      ]
    },
    "zero_target_rows": 6783,
    "zero_target_share": 0.087449,
    "y_target_quantiles": {
      "0.5": 49.0,
      "0.75": 192.0,
      "0.9": 1078.0,
      "0.95": 5156.800000000003,
      "0.99": 11950.160000000003
    },
    "y_target_max": 38428.0,
    "nan_counts_top": {
      "weeks_since_last_nonzero": 2106,
      "lag_13w": 43,
      "lag_26w": 43,
      "lag_52w": 43,
      "lag_8w": 42,
      "lag_4w": 21
    },
    "expected_rows": 77565,
    "expected_series": 173,
    "expected_split_counts": {
      "train": 68226,
      "valid": 4648,
      "test": 4691
    }
  },
  "weekly_matrix.target_from_raw": {
    "sampled_rows": 300,
    "seed": 42,
    "y_target_mismatches": 0,
    "lag_1w_mismatches": 0
  },
  "context_signal.windows": {
    "rows": 73,
    "type_counts": {
      "SEVEN_DANGEROUS_DAYS": 20,
      "COVID_PERIOD": 10,
      "INFLUENZA_PEAK": 10,
      "DENGUE_PEAK": 10,
      "PM25_SEASON": 10,
      "FISCAL_YEAR_END_ORDERING": 10,
      "FLOOD": 3
    },
    "created_equals_valid_from": 73,
    "approved_rows": 73,
    "windows_starting_midweek": 62,
    "valid_from_min": "2016-12-29",
    "valid_from_max": "2026-09-01",
    "signals_without_feature_flag": [],
    "expected_rows": 73
  },
  "monthly.projection": {
    "complete_series_months": 19928,
    "series": 173,
    "usable_rows": 17763,
    "expected_rows": 17763,
    "expected_origin_month_min": "2017-10-01",
    "expected_origin_month_max": "2026-08-01",
    "min_history_months": 12,
    "origin_month_min": "2017-10-01",
    "origin_month_max": "2026-08-01"
  },
  "scope.integrity": {
    "series": 173,
    "inactive": 0,
    "missing_unit_price": 0,
    "missing_ved": 0,
    "missing_lead_time": 0,
    "price_tier_counts": {
      "LOW": 113,
      "MID": 53,
      "HIGH": 7
    },
    "ved_counts": {
      "V": 87,
      "E": 76,
      "D": 10
    },
    "cold_chain_series": 27,
    "seasonal_series": 10,
    "lead_time_days": {
      "min": 5.0,
      "max": 28.0,
      "median": 10.0
    },
    "method_override_set": 0
  }
}
```

## Caveats

- The pack is synthetic mock data generated by `db/mock/generate.py`; metrics are not real accuracy.
- `usage_daily.qty_used` is dispensed usage, censored when stock reaches zero.
- The committed weekly matrix flags `ctx_*` on the target week; training will use the known-at-origin variant (Phase 3 quantifies the difference).
