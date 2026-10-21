"""Metric tests with hand-computed fixtures (F-24).

Every expectation here is arithmetic done by hand, not a snapshot of program output, so a silent change in
the metrics changes a number the test can explain.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from f1_forecast import metrics
from f1_forecast.schema import quantile_column


def _frame(rows: list[dict]) -> pd.DataFrame:
    """Build a prediction frame with the quantile columns filled from ``rows``."""
    frame = pd.DataFrame(rows)
    for column in ("q05", "q10", "q25", "q50", "q75", "q90", "q95"):
        frame[column] = frame[column].astype(float)
    return frame


def test_pinball_loss_hand_computed():
    """y = [0, 10], q = 5 -> errors [-5, +5]: pinball = 2.5 at both tau 0.5 and 0.9."""
    y = pd.Series([0.0, 10.0])
    q = pd.Series([5.0, 5.0])
    assert metrics.pinball_loss(y, q, 0.5) == pytest.approx(2.5)
    assert metrics.pinball_loss(y, q, 0.9) == pytest.approx(2.5)
    # asymmetric case: y = [0], q = 5 -> tau 0.9 penalises the miss only on the (1 - tau) side
    assert metrics.pinball_loss(pd.Series([0.0]), pd.Series([5.0]), 0.9) == pytest.approx(0.5)
    assert metrics.pinball_loss(pd.Series([0.0]), pd.Series([5.0]), 0.1) == pytest.approx(4.5)


def test_coverage_mae_wape_hand_computed():
    """Coverage counts y <= q; MAE is the mean absolute error; WAPE normalises by the actual total."""
    y = pd.Series([0.0, 10.0])
    q = pd.Series([5.0, 5.0])
    assert metrics.coverage(y, q) == pytest.approx(0.5)
    assert metrics.coverage(pd.Series([1.0, 2.0, 3.0]), pd.Series([2.0, 2.0, 2.0])) == pytest.approx(2 / 3)
    assert metrics.mae(y, q) == pytest.approx(5.0)
    assert metrics.wape(y, q) == pytest.approx(1.0)
    assert np.isnan(metrics.wape(pd.Series([0.0, 0.0]), q))


def test_interval_width_and_crossing():
    """Width is P95 - P05; crossing counts inverted adjacent pairs before the monotone fix."""
    frame = _frame([
        {"q05": 1, "q10": 2, "q25": 3, "q50": 4, "q75": 5, "q90": 6, "q95": 7},
        {"q05": 1, "q10": 2, "q25": 3, "q50": 9, "q75": 5, "q90": 6, "q95": 7},  # q50 > q75
    ])
    assert metrics.mean_interval_width(frame, [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]) == pytest.approx(6.0)
    assert metrics.crossing_rate(frame, [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]) == pytest.approx(0.5)
    assert metrics.crossing_pairs(frame, [0.50, 0.75])["q50>q75"] == pytest.approx(0.5)


def test_monotone_fix_sorts_rows_and_leaves_the_original_alone():
    """Spec E4: sort the quantiles ascending per row; the raw frame stays available for the raw rate."""
    frame = _frame([{"q05": 1, "q10": 2, "q25": 3, "q50": 9, "q75": 5, "q90": 6, "q95": 7}])
    fixed = metrics.monotone_fix(frame, [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95])
    assert fixed.loc[0, "q50"] == 5.0 and fixed.loc[0, "q75"] == 6.0 and fixed.loc[0, "q90"] == 7.0
    assert fixed.loc[0, "q95"] == 9.0
    assert frame.loc[0, "q50"] == 9.0
    assert metrics.crossing_rate(fixed, [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]) == 0.0


def test_total_target_follows_ved_and_never_drops_below_p50(cfg):
    """F-06: TT = P95 for V, P90 for E, undefined for D, and always at least P50."""
    frame = pd.DataFrame({
        "ved": ["V", "E", "D", "E"],
        "q50": [10.0, 10.0, 10.0, 30.0],
        "q90": [20.0, 20.0, 20.0, 25.0],   # below P50 in the last row
        "q95": [25.0, 25.0, 25.0, 40.0],
    })
    tt = metrics.total_target(frame, cfg.ved["quantile"])
    assert tt.iloc[0] == pytest.approx(25.0)   # V -> P95
    assert tt.iloc[1] == pytest.approx(20.0)   # E -> P90
    assert np.isnan(tt.iloc[2])                # D -> undefined
    assert tt.iloc[3] == pytest.approx(30.0)   # E but P90 < P50 -> lifted to P50


def test_stockout_overstock_and_value_impact():
    """TT-based policy metrics and THB impact, per F-24 formulas."""
    y = pd.Series([1.0, 10.0, 2.0])
    tt = pd.Series([5.0, 5.0, 5.0])
    assert metrics.stockout_rate(y, tt) == pytest.approx(1 / 3)
    stock = pd.Series([100.0, 1.0])
    target = pd.Series([10.0, 10.0])
    assert metrics.overstock_rate(stock, target, multiple=2) == pytest.approx(0.5)
    impact = metrics.value_impact(pd.Series([10.0]), pd.Series([5.0]), pd.Series([20.0]), pd.Series([2.0]))
    assert impact["under_thb"] == pytest.approx(10.0)   # (10 - 5) * 2
    assert impact["over_thb"] == pytest.approx(30.0)    # avg(20 - 5) * 2


def test_evaluate_predictions_reports_both_filters_and_low_n(cfg):
    """The double reporting: all rows vs rows whose target window had no stock-out day."""
    quantiles = list(cfg.quantiles)
    rows: list[dict] = []
    for split in ("valid", "test"):
        for series_index, series_id in enumerate(["s1", "s2"]):
            for step in range(3):
                band = {quantile_column(q): float(step + quantile_index) for quantile_index, q in enumerate(quantiles)}
                rows.append({
                    "baseline": "seasonal_naive", "split": split, "series_id": series_id,
                    "origin": pd.Timestamp("2026-01-05") + pd.Timedelta(weeks=step), "y": float(series_index + step),
                    "ved": "E", "unit_price_thb": 2.0, "origin_stock": 50.0,
                    "target_stockout_days": 1 if step == 0 else 0, **band,
                })
    predictions = _frame(rows)
    report = metrics.evaluate_predictions(predictions, quantiles, cfg)

    assert set(report["filters"]) == {"all_rows", "no_stockout_rows"}
    assert report["filters"]["all_rows"]["valid"]["seasonal_naive"]["rows"] == 6
    assert report["filters"]["no_stockout_rows"]["valid"]["seasonal_naive"]["rows"] == 4
    gate_all = report["gates"]["seasonal_naive"]["valid"]["all_rows"]
    gate_clean = report["gates"]["seasonal_naive"]["valid"]["no_stockout_rows"]
    # 3 periods per series -> every series is LOW_N (threshold 26) and therefore not judged
    assert gate_all["series_judged"] == 0 and gate_all["series_low_n"] == 2
    assert gate_clean["series_judged"] == 0
    pooled = report["filters"]["all_rows"]["valid"]["seasonal_naive"]
    assert pooled["crossing_rate"] == 0.0            # bands are already monotone
    assert "crossing_rate_raw" in pooled
    assert pooled["coverage"]["0.9"] == 1.0          # every actual is below the top of the band


def test_pooled_metrics_flags_data_quality_signals(cfg):
    """Zero-actual rows and D-series exclusion from the TT metrics are reported explicitly."""
    rows = []
    for step in range(4):
        band = {quantile_column(q): float(step) for q in cfg.quantiles}
        rows.append({"baseline": "b", "split": "test", "series_id": "s1",
                     "origin": pd.Timestamp("2026-01-05") + pd.Timedelta(weeks=step),
                     "y": 0.0 if step < 2 else 5.0, "ved": "D", "unit_price_thb": 1.0,
                     "origin_stock": 10.0, "target_stockout_days": 0, **band})
    pooled = metrics.pooled_metrics(_frame(rows), list(cfg.quantiles), cfg)
    assert pooled["zero_actual_rows"] == 2
    assert pooled["total_target_rows"] == 0                     # D has no Total Target
    assert np.isnan(pooled["stockout_rate_vs_tt"])
