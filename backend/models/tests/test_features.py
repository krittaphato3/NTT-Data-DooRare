"""Feature-build contracts: perfect weekly reproduction, context-flag comparison, monthly matrix shape."""

from __future__ import annotations

import pandas as pd

from f1_forecast import features


def test_weekly_rebuild_reproduces_the_committed_matrix(cfg, pack, series, weekly):
    """Under the reference rule the rebuild must match the committed CSV exactly (no tolerance games)."""
    rebuilt = features.build_weekly(cfg, pack, series, context_rule="target_period_all")
    report = features.reconcile_weekly(weekly, rebuilt)

    assert report["rows_committed"] == report["rows_rebuilt"] == report["rows_joined"] == len(weekly)
    assert report["rows_only_committed"] == 0
    assert report["rows_only_rebuilt"] == 0
    assert report["columns_total"] == 44
    assert report["columns_exact"] == report["columns_total"]
    assert report["total_mismatches"] == 0
    assert all(stats["mismatches"] == 0 for stats in report["columns"].values())


def test_canonical_weekly_matrix_uses_known_at_origin_flags(cfg, pack, series, weekly):
    """The canonical build swaps in the causal flags and still matches everything else."""
    rebuilt = features.build_weekly(cfg, pack, series, context_rule="known_at_origin")
    flags = list(dict(cfg.context_flags["signals"]).values())
    assert set(flags).issubset(rebuilt.columns)
    assert rebuilt[flags].isin([0, 1]).all().all()
    assert len(rebuilt) == len(weekly)

    comparison = features.compare_context(weekly, rebuilt, cfg)
    assert comparison["rows_compared"] == len(weekly)
    assert set(comparison["flags"]) == set(flags)
    # a comparison that finds no difference anywhere would not prove the variants are distinct
    assert sum(entry["disagreements"] for entry in comparison["flags"].values()) > 0
    for entry in comparison["flags"].values():
        assert entry["by_split"], "per-split breakdown missing"


def test_monthly_matrix_matches_the_confirmed_contract(cfg, pack, series):
    """17,763 rows, 173 series in scope, 2017-10 -> 2026-08, confirmed months with 1-month embargoes."""
    matrix = features.build_monthly(cfg, pack, series)

    assert len(matrix) == 17_763
    assert matrix["hospital_drug_id"].nunique() == 167          # 6 cold-start series have no target month
    assert matrix["hospital_drug_id"].nunique() <= cfg.expectations["modelled_series"]
    assert not matrix.duplicated(["hospital_drug_id", "origin_month"]).any()
    assert pd.Timestamp(matrix["origin_month"].min()) == pd.Timestamp("2017-10-01")
    assert pd.Timestamp(matrix["origin_month"].max()) == pd.Timestamp("2026-08-01")

    stats = features.monthly_split_stats(matrix)
    assert stats["train"]["origin_month_max"] == "2024-06-01"
    assert stats["valid"] == {**stats["valid"], "origin_month_min": "2024-08-01",
                             "origin_month_max": "2025-07-01"}
    assert stats["test"] == {**stats["test"], "origin_month_min": "2025-09-01",
                            "origin_month_max": "2026-08-01"}
    assert stats["train"]["rows"] + stats["valid"]["rows"] + stats["test"]["rows"] == 17_431
    assert stats["embargo"]["rows"] == 332
    embargo_months = sorted(matrix.loc[matrix["split"] == "embargo", "origin_month"].dt.strftime("%Y-%m"))
    assert set(embargo_months) == {"2024-07", "2025-08"}


def test_monthly_cold_start_series_keep_nan_lags(cfg, pack, series):
    """Short histories stay in the matrix with NaN lags instead of being dropped or filled."""
    matrix = features.build_monthly(cfg, pack, series)
    short = matrix.loc[matrix["lag_12m"].isna()]
    assert len(short) > 0
    assert (short["split"] != "embargo").any()
    # NaN means "not enough history", never a fabricated value
    assert short["lag_1m"].notna().all()
