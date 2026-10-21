"""Backtest harness tests: embargo rule, block coverage, granularity dispatch and a real-data run."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from f1_forecast import backtest, baselines, clean, metrics
from f1_forecast.schema import quantile_column

QUANTILE_COLUMNS = [quantile_column(q) for q in (0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95)]


def _synthetic_panel(weeks: int = 120) -> pd.DataFrame:
    """Two series over ``weeks`` Monday origins, split so that valid and test are the last 20 weeks."""
    origins = pd.date_range("2024-01-01", periods=weeks, freq="W-MON")
    rows = []
    for series_id in ("s1", "s2"):
        for index, origin in enumerate(origins):
            split = "test" if index >= weeks - 10 else ("valid" if index >= weeks - 20 else "train")
            rows.append({"series_id": series_id, "origin": origin, "split": split,
                         "y": float(index % 11), "target_stockout_days": 0})
    panel = pd.DataFrame(rows)
    return backtest.add_target_window(panel, "WEEK")


def test_blocks_respect_the_embargo_rule(cfg):
    """A block's training cutoff is the last origin whose target window ends before the block starts."""
    panel = _synthetic_panel()
    blocks = backtest.walk_forward_blocks(panel, "WEEK", cfg)
    assert blocks, "expected at least one walk-forward block"
    for block in blocks:
        if block.train_cutoff is not None:
            cutoff_end = block.train_cutoff + pd.Timedelta(days=13)
            assert cutoff_end < block.block_start, f"cutoff {block.train_cutoff} leaks into {block.block_start}"
        evaluated = panel.loc[panel["origin"].isin(block.eval_origins)]
        # every evaluated origin belongs to the block month and its target window is not in the past
        assert (evaluated["origin"].dt.to_period("M").dt.start_time == block.block_start).all()
        assert (evaluated["target_end"] >= block.block_start).all()
        # nothing evaluated could have been used as training data for its own block
        if block.train_cutoff is not None:
            assert (block.eval_origins[0] > block.train_cutoff)


def test_blocks_cover_every_evaluated_origin(cfg):
    """Union of block origins == all valid/test origins, so no evaluation row is silently skipped."""
    panel = _synthetic_panel()
    blocks = backtest.walk_forward_blocks(panel, "WEEK", cfg)
    covered = {origin for block in blocks for origin in block.eval_origins}
    expected = set(panel.loc[panel["split"].isin(["valid", "test"]), "origin"].unique())
    assert covered == expected
    assert {block.split for block in blocks} == {"valid", "test"}


def test_monthly_panel_uses_the_phase3_matrix(cfg, pack, series):
    """MONTH scores only the confirmed valid/test months, from the monthly matrix."""
    panel = backtest.build_panel(cfg, "MONTH", pack=pack, series=series)
    # the panel keeps every split (train/embargo rows are needed as training history) ...
    assert set(panel["split"]) == {"train", "valid", "test", "embargo"}
    # ... and the backtest scores only valid/test
    scored = panel.loc[panel["split"].isin(["valid", "test"])]
    assert len(scored) == 1_992 + 1_993
    assert scored["series_id"].nunique() == 167
    # 12 valid + 12 test periods per series -> every series is LOW_N at the 26-period threshold
    assert scored.groupby("series_id", observed=True).size().max() == 24
    assert scored.groupby(["series_id", "split"], observed=True).size().max() == 12
    assert panel["target_stockout_days"].between(0, 31).all()
    assert panel["origin_stock"].notna().mean() > 0.9


def test_real_baseline_predictions_pass_the_contract(cfg, pack, series, weekly_totals):
    """Integration run on real data (8 series): schema, baselines, monotone bands, coverage report."""
    series_ids = sorted(weekly_totals["series_id"].unique())[:8]
    totals = weekly_totals.loc[weekly_totals["series_id"].isin(series_ids)]
    panel = backtest.build_panel(cfg, "WEEK", pack=pack, series=series)
    panel = panel.loc[panel["series_id"].isin(series_ids) & panel["split"].isin(["valid", "test"])]
    panel = panel.reset_index(drop=True)

    predictions = baselines.baseline_predictions(totals, panel, cfg, "WEEK")
    assert set(predictions["baseline"]) == {baselines.SEASONAL_NAIVE, baselines.MA_ES_RESIDUAL_QUANTILE,
                                            baselines.EMPIRICAL_QUANTILE}
    assert not predictions[QUANTILE_COLUMNS].isna().any().any()
    assert (predictions[QUANTILE_COLUMNS] >= 0).all().all()
    assert (np.diff(predictions[QUANTILE_COLUMNS].to_numpy(dtype=float), axis=1) >= -1e-9).all()
    assert set(predictions["split"]) == {"valid", "test"}

    coverage = backtest.coverage_report(predictions, panel)
    for baseline in coverage:
        for split, stats in coverage[baseline].items():
            assert stats["predicted_rows"] > 0
            assert stats["predicted_rows"] + stats["unpredicted_rows"] == stats["panel_rows"]

    metrics_report = metrics.evaluate_predictions(predictions, cfg.quantiles, cfg)
    assert set(metrics_report["filters"]) == {"all_rows", "no_stockout_rows"}
    pooled = metrics_report["filters"]["all_rows"]["test"][baselines.SEASONAL_NAIVE]
    assert pooled["rows"] > 0
    assert 0.0 <= pooled["coverage"][str(cfg.quantiles[-1])] <= 1.0
    assert pooled["coverage"]["0.5"] <= pooled["coverage"]["0.95"]


def test_panel_columns_and_stock_flags(cfg, pack, series):
    """The panel carries the slicing attributes and a target-window stock-out count for every row."""
    panel = backtest.build_panel(cfg, "WEEK", pack=pack, series=series)
    expected = {"series_id", "origin", "split", "y", "target_start", "target_end", "origin_end",
                "origin_stock", "target_stockout_days", "ved", "abc", "price_tier", "item_type",
                "hospital_tier", "is_seasonal", "unit_price_thb", "roll_zero_share_13", "history_periods",
                "cold_start", "intermittent"}
    assert expected.issubset(set(panel.columns))
    assert panel["target_stockout_days"].between(0, 7).all()
    assert panel["series_id"].nunique() == len(clean.scope_ids(series))
    # the seven cold-start series must be flagged, and only they
    assert int(panel.loc[panel["cold_start"], "series_id"].nunique()) == cfg.expectations["cold_start_series"]
