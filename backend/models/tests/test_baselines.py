"""Baseline tests: causality proof, F-03/F-04 band rules, fallback and real-data cross-checks."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from f1_forecast import baselines, clean
from f1_forecast.schema import quantile_column


def _totals(values: list[float], series_id: str = "s1", start: str = "2020-01-06",
            freq: str = "W-MON") -> pd.DataFrame:
    """Synthetic totals frame (series_id / period / qty)."""
    periods = pd.date_range(start, periods=len(values), freq=freq)
    return pd.DataFrame({"series_id": series_id, "period": periods, "qty": [float(v) for v in values]})


def _panel(totals: pd.DataFrame, origins: list[pd.Timestamp], series_id: str = "s1") -> pd.DataFrame:
    """Minimal evaluation panel for the synthetic totals."""
    lookup = totals.set_index(["series_id", "period"])["qty"]
    rows = []
    for origin in origins:
        target_start = origin + pd.Timedelta(days=7)
        target_end = target_start + pd.Timedelta(days=6)
        y = float(lookup.get((series_id, target_start), np.nan))
        rows.append({"series_id": series_id, "origin": origin, "split": "test", "y": y,
                     "target_start": target_start, "target_end": target_end, "origin_end": origin,
                     "ved": "E", "unit_price_thb": 1.0, "origin_stock": 10.0, "target_stockout_days": 0})
    return pd.DataFrame(rows)


def test_causal_signals_do_not_depend_on_later_periods(cfg):
    """Cutting the tail of the series must not change any signal at the retained rows.

    This is the generic no-lookahead proof: expanding statistics (winsorise P99, MAE selection, seasonal
    index, residual quantiles) are recomputed and must be identical.
    """
    values = [10 + (index % 7) * 3 for index in range(70)]
    columns = ["qty", "qty_win", "ma", "es", "alpha", "mae_ma", "mae_es", "method", "level",
               "seasonal_index", "p50_ma_es", "resid_n", "resid_std", "residual_fallback",
               "seasonal_point", "seasonal_resid_n", "eq_q90", "rq_q90"]
    full = baselines.causal_signals(_totals(values), cfg, "WEEK")
    truncated = baselines.causal_signals(_totals(values[:-6]), cfg, "WEEK")
    pd.testing.assert_frame_equal(full.loc[: len(values) - 7, columns].reset_index(drop=True),
                                  truncated[columns].reset_index(drop=True))


def test_constant_series_produces_flat_bands(cfg):
    """A flat series: P50 equals the level and every band collapses onto it (zero residuals)."""
    totals = _totals([25.0] * 60)
    signals = baselines.causal_signals(totals, cfg, "WEEK")
    last = signals.iloc[-1]
    assert last["p50_ma_es"] == pytest.approx(25.0)
    assert last["resid_n"] >= 52
    assert abs(last["rq_q95"]) < 1e-9


def test_bands_are_monotone_and_buffers_respect_the_direction(cfg):
    """F-04 direction rules: q >= 0.5 bands sit at or above P50, lower bands at or below it."""
    totals = _totals([float(20 + (index * 37) % 90) for index in range(80)])
    panel = _panel(totals, list(totals["period"].iloc[-6:]))
    predictions = baselines.baseline_predictions(totals, panel, cfg, "WEEK")
    quantile_columns = [quantile_column(q) for q in cfg.quantiles]
    values = predictions[quantile_columns].to_numpy(dtype=float)
    assert (np.diff(values, axis=1) >= -1e-9).all(), "bands must never cross after construction"
    structured = predictions.loc[predictions["baseline"] != baselines.EMPIRICAL_QUANTILE]
    assert (structured[quantile_column(0.95)] >= structured[quantile_column(0.5)]).all()
    assert (structured[quantile_column(0.05)] <= structured[quantile_column(0.5)]).all()
    assert (structured[quantile_column(0.5)] >= 0).all()


def test_short_history_uses_the_normal_fallback(cfg):
    """Fewer than ``min_residuals`` residuals -> B_tau = z_tau * std(e), flagged as RESIDUAL_FALLBACK."""
    totals = _totals([float(10 + index) for index in range(12)])
    signals = baselines.causal_signals(totals, cfg, "WEEK")
    last = signals.iloc[-1]
    assert bool(last["residual_fallback"]) is True
    assert last["resid_n"] < int(cfg.baselines["ma_es"]["min_residuals"])
    panel = _panel(totals, [totals["period"].iloc[-1]])
    prediction = baselines.baseline_predictions(totals, panel, cfg, "WEEK")
    ma_es = prediction.loc[prediction["baseline"] == baselines.MA_ES_RESIDUAL_QUANTILE].iloc[0]
    assert bool(ma_es["residual_fallback"]) is True
    expected = float(cfg.baselines["ma_es"]["z"][0.95]) * float(last["resid_std"])
    assert ma_es[quantile_column(0.95)] - ma_es[quantile_column(0.5)] == pytest.approx(expected, rel=1e-6)


def test_empirical_quantile_matches_pandas_quantile(cfg):
    """Baseline 3 is literally the trailing-window quantile (linear interpolation, causal)."""
    values = [float(15 + (index * 53) % 70) for index in range(60)]
    totals = _totals(values)
    signals = baselines.causal_signals(totals, cfg, "WEEK")
    window = int(cfg.baselines["empirical_quantile"]["weekly_window"])
    expected = float(pd.Series(values[-window:]).quantile(0.9))
    assert signals.iloc[-1]["eq_q90"] == pytest.approx(expected)


def test_monthly_granularity_reuses_the_same_code(cfg):
    """The monthly granularity only changes lag/window sizes and the target period arithmetic."""
    values = [float(100 + (index % 5) * 10) for index in range(30)]
    totals = _totals(values, start="2023-01-01", freq="MS")
    signals = baselines.causal_signals(totals, cfg, "MONTH")
    last = signals.iloc[-1]
    monthly_lag = int(cfg.baselines["seasonal_naive"]["monthly_lag"])
    assert last["seasonal_point"] == pytest.approx(values[-monthly_lag])
    # origin 2025-06 -> target 2025-07, and the seasonal index stays inside the configured clip
    assert int(last["target_month"]) == 7
    clip_low, clip_high = (float(v) for v in cfg.baselines["ma_es"]["seasonal_index_clip"])
    assert clip_low <= float(last["seasonal_index"]) <= clip_high


def _weekly_matrix_lag(cfg, series_ids: list[str]) -> pd.DataFrame:
    """Committed weekly matrix restricted to ``series_ids`` (helper for the cross-check below)."""
    from f1_forecast import data_loader

    matrix = data_loader.load_weekly_features(cfg)
    matrix = matrix.loc[matrix["hospital_drug_id"].isin(series_ids)]
    return matrix.rename(columns={"hospital_drug_id": "series_id", "origin_week": "origin"})[
        ["series_id", "origin", "lag_52w"]]


def test_seasonal_naive_p50_matches_the_committed_lag_52w(cfg, weekly_totals):
    """Cross-check on real data: seasonal-naive P50 == the committed weekly matrix `lag_52w`."""
    series_ids = sorted(weekly_totals["series_id"].unique())[:5]
    subset = weekly_totals.loc[weekly_totals["series_id"].isin(series_ids)]
    signals = baselines.causal_signals(subset, cfg, "WEEK")
    matrix = _weekly_matrix_lag(cfg, series_ids)
    merged = matrix.merge(signals[["series_id", "period", "seasonal_point"]].rename(columns={"period": "origin"}),
                          on=["series_id", "origin"], how="inner")
    assert len(merged) > 0
    comparable = merged.dropna(subset=["lag_52w", "seasonal_point"])
    assert len(comparable) > 0
    assert (comparable["lag_52w"] - comparable["seasonal_point"]).abs().max() < 1e-6
