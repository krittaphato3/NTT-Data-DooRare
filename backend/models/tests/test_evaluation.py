"""Phase 6a evaluation contracts: slice deltas, low-confidence flags, crossing gap fractions."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from f1_forecast import evaluation, model

QUANTILES = list(model.TRAINED_QUANTILES)


def _base_frame(rows: int = 120, seed: int = 0) -> pd.DataFrame:
    """Synthetic prediction frame with the attributes the report slices on."""
    rng = np.random.default_rng(seed)
    origins = pd.date_range("2025-01-01", periods=rows, freq="MS")
    frame = pd.DataFrame({
        "series_id": [f"s{index % 3}" for index in range(rows)],
        "origin": origins,
        "split": "valid",
        "y": rng.integers(5, 100, rows).astype(float),
        "ved": pd.Categorical(rng.choice(["V", "E"], rows)),
        "price_tier": pd.Categorical(rng.choice(["LOW", "HIGH"], rows)),
        "item_type": pd.Categorical(rng.choice(["DRUG", "SUPPLY"], rows)),
        "hospital_tier": pd.Categorical(rng.choice(["A", "TERTIARY"], rows)),
        "is_seasonal": rng.choice([True, False], rows),
        "cold_start": False,
        "zero_heavy": rng.choice([True, False], rows, p=[0.1, 0.9]),
        "target_stockout_days": np.zeros(rows, dtype=int),
        "unit_price_thb": rng.uniform(10, 500, rows),
        "origin_stock": rng.uniform(0, 100, rows),
        "hospital_code": "HA",
        "item_code": "IT-1",
        "n_periods": 5,
        "baseline": model.MODEL_BASELINE_NAME,
    })
    base = np.arange(1, len(QUANTILES) + 1, dtype=float) * 10
    values = np.vstack([base * (1 + 0.1 * (index % 5)) for index in range(rows)])
    for index, quantile in enumerate(QUANTILES):
        column = f"q{int(round(quantile * 100)):02d}"
        frame[column] = values[:, index]
        frame[f"raw_{column}"] = values[:, index]
    return frame


def test_slice_tables_flag_low_confidence_and_pick_the_best_baseline(cfg):
    """A slice under 100 rows is flagged; deltas are measured against the lowest-pinball baseline."""
    model_frame = _base_frame(60, seed=1)
    baselines = []
    for name, inflation in (("seasonal_naive", 3.0), ("ma_es_residual_quantile", 2.0),
                            ("empirical_quantile", 1.5)):
        frame = model_frame.copy()
        frame["baseline"] = name
        for quantile in QUANTILES:
            column = f"q{int(round(quantile * 100)):02d}"
            frame[column] = frame[column] * inflation
            frame[f"raw_{column}"] = frame[column]
        baselines.append(frame)
    slices = evaluation.slice_tables(model_frame, pd.concat(baselines, ignore_index=True), cfg)

    rows = [entry for dimension in slices.values() for entry in dimension]
    assert rows, "slice tables must not be empty"
    assert all(entry["rows"] < evaluation.LOW_CONFIDENCE_ROWS for entry in rows)
    assert all(entry["low_confidence"] for entry in rows)

    # the chosen baseline really is the lowest-P50 one, and deltas are model - that baseline
    combined = pd.concat(baselines, ignore_index=True)
    entry = next(entry for entry in slices["ved"] if entry["rows"])
    value = entry["slice"]
    model_metrics = evaluation._model_pooled(
        model_frame.loc[model_frame["ved"].astype(str) == value], cfg)
    baseline_metrics = {
        name: evaluation._model_pooled(
            combined.loc[(combined["baseline"] == name)
                         & (combined["ved"].astype(str) == value)], cfg)
        for name in evaluation.BASELINES}
    best = min(baseline_metrics, key=lambda name: baseline_metrics[name]["pinball"]["0.5"])
    assert entry["best_baseline"] == best
    for quantile in ("0.5", "0.9", "0.95"):
        expected = model_metrics["pinball"][quantile] - baseline_metrics[best]["pinball"][quantile]
        assert entry["delta_vs_best"][quantile] == pytest.approx(expected, abs=1e-4)
    assert entry["loses_at"] == [q for q, delta in entry["delta_vs_best"].items() if delta > 0]


def test_crossing_gap_fraction_is_relative_to_p50():
    """The reported gap fraction is (lower - upper) / max(P50, 1), not a raw unit gap."""
    frame = pd.DataFrame({
        "series_id": ["s0"] * 4,
        "origin": pd.date_range("2025-01-01", periods=4, freq="MS"),
        "y": [10.0, 10.0, 10.0, 10.0],
        "q50": [100.0, 100.0, 100.0, 100.0],
        "raw_q05": [10.0, 10.0, 10.0, 10.0],
        "raw_q10": [5.0, 10.0, 10.0, 5.0],
        "raw_q25": [20.0, 20.0, 20.0, 20.0],
        "raw_q50": [30.0, 30.0, 30.0, 30.0],
        "raw_q75": [40.0, 40.0, 40.0, 40.0],
        "raw_q90": [50.0, 50.0, 50.0, 50.0],
        "raw_q95": [55.0, 60.0, 60.0, 60.0],
    })
    crossing = evaluation.crossing_tables(frame)
    pairs = {entry["pair"]: entry for entry in crossing["pairs"]}
    assert pairs["q05>q10"]["share"] == pytest.approx(0.5)
    assert pairs["q05>q10"]["fraction_median"] == pytest.approx(0.05)
    assert pairs["q05>q10"]["fraction_p95"] == pytest.approx(0.05)
    assert pairs["q90>q95"]["share"] == pytest.approx(0.0)
    assert crossing["terciles"]


def test_crossing_fraction_floors_the_p50_denominator_at_one():
    """A near-zero P50 must not turn a 5-unit gap into a 500 % ratio."""
    frame = pd.DataFrame({
        "series_id": ["s0", "s0"],
        "origin": pd.date_range("2025-01-01", periods=2, freq="MS"),
        "y": [0.0, 0.0],
        "q50": [0.5, 0.5],
        "raw_q05": [10.0, 10.0], "raw_q10": [5.0, 5.0],
        "raw_q25": [20.0, 20.0], "raw_q50": [20.0, 20.0], "raw_q75": [20.0, 20.0],
        "raw_q90": [20.0, 20.0], "raw_q95": [20.0, 20.0],
    })
    pairs = {entry["pair"]: entry for entry in evaluation.crossing_tables(frame)["pairs"]}
    assert pairs["q05>q10"]["share"] == pytest.approx(1.0)
    assert pairs["q05>q10"]["fraction_median"] == pytest.approx(5.0)
