"""Phase 1 data-contract tests.

These assert the facts the later phases depend on: the series inventory, key uniqueness, the identity
crosswalk, the target definition and the monthly build projection. Checks that already exist in
``f1_forecast.validate_data`` are reused instead of duplicated, so the CLI and the test suite can never
drift apart.
"""

from __future__ import annotations

import pytest

from f1_forecast import clean, data_loader, schema, validate_data


def test_series_inventory_matches_confirmed_counts(series, cfg):
    """191 listings - 3 blood - 15 Min-Max = 173 modelled series."""
    counts = clean.series_scope_counts(series)
    assert counts["hospital_drug_rows"] == cfg.expectations["hospital_drug_rows"]
    assert counts["blood_products"] == cfg.expectations["blood_series"]
    assert counts["min_max"] == cfg.expectations["min_max_series"]
    assert counts["non_blood"] == cfg.expectations["non_blood_series"]
    assert counts["in_scope"] == cfg.expectations["modelled_series"]


def test_pack_tables_have_no_duplicate_keys(pack, cfg):
    """Key uniqueness on the raw tables (a duplicate would silently double-count a day)."""
    usage = validate_data.check_usage_daily(pack.usage_daily, cfg)
    snapshot = validate_data.check_stock_snapshot(pack.stock_snapshot, float(cfg.stockout["stockout_threshold"]), cfg)
    assert usage.metrics["duplicate_keys"] == 0
    assert snapshot.metrics["duplicate_keys"] == 0
    assert usage.metrics["negative_qty"] == 0
    assert snapshot.metrics["negative_on_hand"] == 0


def test_every_listing_resolves_catalogue_attributes(series):
    """The gp_id fallback must resolve all 16 NULL drug_master_id listings (known past bug)."""
    result = validate_data.check_drug_master_resolution(series)
    assert result.metrics["null_drug_master_id"] == 16
    assert result.metrics["unmapped_item_type"] == 0
    assert result.metrics["local_fallback_item_codes"] == 0
    assert result.status == validate_data.PASS


def test_daily_crosswalk_is_one_to_one(daily, series, cfg):
    """The joined daily view maps 1:1 onto the 188 non-blood listings and onto 173 modelled ones."""
    result = validate_data.check_daily_crosswalk(daily, series, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["daily_series"] == cfg.expectations["non_blood_series"]
    assert result.metrics["daily_hospital_item_pairs"] == result.metrics["daily_series"]
    assert result.metrics["daily_series_in_model_scope"] == cfg.expectations["modelled_series"]
    assert daily["hospital_drug_id"].notna().all()


def test_daily_view_reconciles_with_raw_pack(daily, pack):
    """f1_daily must equal usage_daily (usage) and stock_snapshot (on hand) for the same series/day."""
    result = validate_data.check_daily_pack_reconciliation(daily, pack, threshold=0.0)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["usage_sum_mismatches"] == 0
    assert result.metrics["on_hand_mismatches_last_day"] == 0


def test_cold_start_series_are_known_and_in_scope(daily, weekly, series, cfg):
    """7 cold-start series (46-68 days), all modelled, appearing only in the weekly test split."""
    day_counts = data_loader.series_day_counts(daily)
    result = validate_data.check_cold_start(day_counts, weekly, series, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["cold_start_series"] == cfg.expectations["cold_start_series"]
    assert result.metrics["history_days_max"] <= cfg.series_scope["cold_start_max_history_days"]
    split_counts = result.metrics["weekly_split_counts"]
    # Cold-start series never appear in train/valid: their rows can only be evaluated out-of-sample.
    assert set(split_counts) == {"test"}, f"cold-start rows found in {sorted(split_counts)}"
    assert sum(split_counts.values()) == 43, f"expected 43 cold-start test rows, got {split_counts}"


def test_weekly_matrix_matches_contract(weekly, cfg):
    """Column contract, counts, splits and key uniqueness of the committed weekly matrix."""
    assert tuple(weekly.columns) == schema.WEEKLY_FEATURES.columns
    assert len(schema.WEEKLY_FEATURE_COLUMNS) == 40
    result = validate_data.check_weekly_matrix(weekly, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["rows"] == cfg.expectations["weekly_rows"]
    assert result.metrics["split_counts"] == {k: int(v) for k, v in cfg.expectations["weekly_split_counts"].items()}
    assert result.metrics["duplicate_keys"] == 0


def test_weekly_target_recomputed_from_raw_usage(weekly, pack, cfg):
    """Target definition: y_target = usage of the week after origin_week; lag_1w = origin week usage."""
    result = validate_data.check_weekly_target_from_raw(weekly, pack, cfg, sample_size=25)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["y_target_mismatches"] == 0
    assert result.metrics["lag_1w_mismatches"] == 0


def test_monthly_build_projection_matches_confirmed_rows(pack, series, cfg):
    """Complete months + warm-up rule must give exactly the confirmed 17,763 rows."""
    result = validate_data.check_monthly_projection(pack, series, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["usable_rows"] == cfg.expectations["monthly_rows"]
    assert result.metrics["origin_month_min"] == cfg.expectations["monthly_origin_month_min"]
    assert result.metrics["origin_month_max"] == cfg.expectations["monthly_origin_month_max"]


def test_scope_is_modellable(series, cfg):
    """All 173 modelled series are active, priced, have a VED class and a lead time."""
    result = validate_data.check_scope_integrity(series, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["series"] == cfg.expectations["modelled_series"]
    assert result.metrics["method_override_set"] == 0


def test_context_signals_are_declared_and_dated(pack, cfg):
    """Every signal type has a feature flag and every window is approved and dated."""
    result = validate_data.check_context_signal(pack.context_signal, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["signals_without_feature_flag"] == []
    assert result.metrics["approved_rows"] == result.metrics["rows"]


def test_reference_tables_match_confirmed_sizes(pack, cfg):
    """drug_master (41 rows) and hospital (5 rows) are the confirmed reference tables."""
    result = validate_data.check_reference_tables(pack, cfg)
    assert result.status == validate_data.PASS, result.detail
    assert result.metrics["hospital_codes"] == ["HA", "HB", "HC", "HD", "HE"]


def test_full_validation_suite_passes(pack, series, daily, weekly, cfg):
    """The Phase 1 gate: every check passes when run over the pre-loaded data."""
    report = validate_data.run_validation(cfg, write_report=False, data=(pack, series, daily, weekly))
    failures = [check for check in report["checks"] if check["status"] == validate_data.FAIL]
    assert report["failed"] == 0, failures
    assert len(report["checks"]) == 13


@pytest.mark.parametrize("column", ["price_tier", "ved", "abc", "item_type", "hospital_tier"])
def test_weekly_categorical_values_are_allowed(weekly, column):
    """Categorical columns only contain declared values."""
    schema.assert_allowed_values("weekly_features", column, weekly[column].unique())
