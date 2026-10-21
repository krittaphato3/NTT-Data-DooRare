"""Forecast quality metrics (F-24) — granularity-agnostic.

Implements `specification/04-rules-formulas.md` §9.3 F-24 exactly:

* pinball loss per quantile: ``L_tau = mean(max(tau*(y - q), (tau - 1)*(y - q)))``
* coverage per quantile: ``cov_tau = mean(y <= q_tau)`` (target = tau, tolerance +/- 0.05)
* MAE of P50 (method selection) and WAPE on P50
* forecast stock-out rate = share of periods where ``y > TT``
* overstock rate = share of periods where ``stock > 2 * TT`` (``forecast.overstock_multiple``)
* value impact: under = ``sum(max(0, y - TT) * price)``, over = ``mean(max(0, stock - TT)) * price``
* ``N < 26`` -> metrics marked ``LOW_N``

Everything is computed on the raw scale (callers pass ``expm1``-inverted values). Values are rounded to
4 decimals for storage (spec), counts stay integers. The module knows nothing about WEEK vs MONTH: it
works on any frame that carries ``y``, the quantile columns and one row per series x period.
"""

from __future__ import annotations

from typing import Mapping, Sequence

import numpy as np
import pandas as pd

from f1_forecast.config import ForecastConfig
from f1_forecast.schema import quantile_column

METRICS_ROUND = 4
THB_ROUND = 2


def pinball_loss(y: pd.Series | np.ndarray, q: pd.Series | np.ndarray, tau: float) -> float:
    """Mean pinball (quantile) loss for one quantile level.

    Args:
        y: actual values.
        q: predicted quantile values.
        tau: quantile level in (0, 1); the loss is minimised when ``q`` is the tau-quantile of ``y``.
    """
    actual = np.asarray(y, dtype=float)
    predicted = np.asarray(q, dtype=float)
    if actual.size == 0:
        return float("nan")
    delta = actual - predicted
    return float(np.mean(np.maximum(tau * delta, (tau - 1.0) * delta)))


def coverage(y: pd.Series | np.ndarray, q: pd.Series | np.ndarray) -> float:
    """Empirical coverage = share of periods where the actual value is at or below the quantile."""
    actual = np.asarray(y, dtype=float)
    if actual.size == 0:
        return float("nan")
    return float(np.mean(actual <= np.asarray(q, dtype=float)))


def mae(y: pd.Series | np.ndarray, q: pd.Series | np.ndarray) -> float:
    """Mean absolute error (used for the P50 point forecast)."""
    actual = np.asarray(y, dtype=float)
    if actual.size == 0:
        return float("nan")
    return float(np.mean(np.abs(actual - np.asarray(q, dtype=float))))


def wape(y: pd.Series | np.ndarray, q: pd.Series | np.ndarray) -> float:
    """Weighted absolute percentage error: ``sum|y - q| / sum(y)``.

    Returns ``nan`` when the actual total is zero (nothing to normalise against).
    """
    actual = np.asarray(y, dtype=float)
    denominator = float(np.sum(actual))
    if actual.size == 0 or denominator <= 0:
        return float("nan")
    return float(np.sum(np.abs(actual - np.asarray(q, dtype=float))) / denominator)


def mean_interval_width(frame: pd.DataFrame, quantiles: Sequence[float]) -> float:
    """Mean width of the outer interval (P95 - P05)."""
    low, high = quantile_column(quantiles[0]), quantile_column(quantiles[-1])
    return float((frame[high] - frame[low]).mean())


def crossing_pairs(frame: pd.DataFrame, quantiles: Sequence[float]) -> dict[str, float]:
    """Share of rows where an adjacent quantile pair is inverted (``q_i > q_{i+1}``)."""
    pairs: dict[str, float] = {}
    for lower, upper in zip(quantiles, quantiles[1:]):
        left, right = quantile_column(lower), quantile_column(upper)
        pairs[f"{left}>{right}"] = float((frame[left] > frame[right]).mean())
    return pairs


def crossing_rate(frame: pd.DataFrame, quantiles: Sequence[float]) -> float:
    """Share of rows with at least one adjacent inversion."""
    if frame.empty:
        return float("nan")
    columns = [quantile_column(q) for q in quantiles]
    values = frame[columns].to_numpy(dtype=float)
    inverted = (np.diff(values, axis=1) < 0).any(axis=1)
    return float(inverted.mean())


def monotone_fix(frame: pd.DataFrame, quantiles: Sequence[float]) -> pd.DataFrame:
    """Sort the quantile columns ascending row by row (spec E4: ``q50 <= q90 <= q95``).

    Returns a copy; the original frame (with raw crossings) is used to report the crossing rate.
    """
    columns = [quantile_column(q) for q in quantiles]
    fixed = frame.copy()
    fixed[columns] = np.sort(frame[columns].to_numpy(dtype=float), axis=1)
    return fixed


def total_target(frame: pd.DataFrame, ved_quantile: Mapping[str, float]) -> pd.Series:
    """Total Target per row (F-06): ``P95`` for V, ``P90`` for E, undefined for D; never below P50."""
    level = frame["ved"].map(ved_quantile)
    target = pd.Series(np.nan, index=frame.index, dtype=float)
    for quantile in sorted(set(level.dropna())):
        mask = level == quantile
        target.loc[mask] = frame.loc[mask, quantile_column(float(quantile))].astype(float)
    return np.maximum(target, frame[quantile_column(0.5)].astype(float))


def stockout_rate(y: pd.Series, tt: pd.Series) -> float:
    """Forecast stock-out rate: share of periods where actual usage exceeded Total Target."""
    valid = tt.notna()
    if not valid.any():
        return float("nan")
    return float((y[valid] > tt[valid]).mean())


def overstock_rate(stock: pd.Series, tt: pd.Series, multiple: float) -> float:
    """Overstock rate: share of periods where stock on hand exceeded ``multiple`` x Total Target."""
    valid = tt.notna() & stock.notna()
    if not valid.any():
        return float("nan")
    return float((stock[valid] > multiple * tt[valid]).mean())


def value_impact(y: pd.Series, tt: pd.Series, stock: pd.Series, price: pd.Series) -> dict[str, float]:
    """Value impact in THB (F-24): unmet demand under Total Target, and average over-holding."""
    valid = tt.notna()
    if not valid.any():
        return {"under_thb": float("nan"), "over_thb": float("nan")}
    under = float((np.maximum(0.0, y[valid] - tt[valid]) * price[valid]).sum())
    over = float(np.maximum(0.0, stock[valid] - tt[valid]).mean() * price[valid].mean())
    return {"under_thb": round(under, THB_ROUND), "over_thb": round(over, THB_ROUND)}


def pooled_metrics(frame: pd.DataFrame, quantiles: Sequence[float], cfg: ForecastConfig,
                   multiple: float | None = None) -> dict:
    """Every F-24 metric over a set of prediction rows (one filter: all rows, or no-stock-out rows).

    Args:
        frame: prediction rows with ``y``, the quantile columns, ``ved``, ``unit_price_thb``,
            ``origin_stock`` and ``target_stockout_days``.
        quantiles: quantile levels in ascending order.
        cfg: configuration (VED quantiles, overstock multiple, LOW_N threshold).
        multiple: overstock multiple override; defaults to ``evaluation.overstock_multiple``.

    Returns:
        Nested dict: ``pinball``/``coverage`` per quantile, ``mae_p50``, ``wape_p50``, ``width_p95_p05``,
        ``crossing_rate``, ``crossing_rate_raw``, TT-based rates and value impact, plus row counts.
    """
    overstock_multiple = float(cfg.evaluation["overstock_multiple"] if multiple is None else multiple)
    p50 = frame[quantile_column(0.5)]
    tt = total_target(frame, cfg.ved["quantile"])
    metrics = {
        "rows": int(len(frame)),
        "series": int(frame["series_id"].nunique()) if not frame.empty else 0,
        "periods": int(frame["origin"].nunique()) if not frame.empty else 0,
        "zero_actual_rows": int((frame["y"] == 0).sum()) if not frame.empty else 0,
        "pinball": {str(q): round(pinball_loss(frame["y"], frame[quantile_column(q)], q), METRICS_ROUND)
                    for q in quantiles},
        "coverage": {str(q): round(coverage(frame["y"], frame[quantile_column(q)]), METRICS_ROUND)
                     for q in quantiles},
        "mae_p50": round(mae(frame["y"], p50), METRICS_ROUND),
        "wape_p50": round(wape(frame["y"], p50), METRICS_ROUND),
        "width_p95_p05": round(mean_interval_width(frame, quantiles), METRICS_ROUND),
        "crossing_rate": round(crossing_rate(frame, quantiles), METRICS_ROUND),
        "stockout_rate_vs_tt": round(stockout_rate(frame["y"], tt), METRICS_ROUND),
        "overstock_rate_vs_tt": round(overstock_rate(frame["origin_stock"], tt, overstock_multiple), METRICS_ROUND),
        "total_target_rows": int(tt.notna().sum()),
    }
    metrics.update(value_impact(frame["y"], tt, frame["origin_stock"], frame["unit_price_thb"]))
    return metrics


def per_series_metrics(frame: pd.DataFrame, quantiles: Sequence[float], cfg: ForecastConfig) -> pd.DataFrame:
    """Per-series metrics with the LOW_N flag (``N < evaluation.low_n_threshold``).

    Returns one row per series with ``n_periods``, ``low_n``, per-quantile pinball/coverage (P50/P90/P95,
    the gate quantiles), MAE of P50 and the Total-Target stock-out count.
    """
    low_n_threshold = int(cfg.evaluation["low_n_threshold"])
    gate_quantiles = [float(q) for q in cfg.evaluation["gate"]["gate_quantiles"]]
    rows: list[dict] = []
    for series_id, group in frame.groupby("series_id", observed=True):
        tt = total_target(group, cfg.ved["quantile"])
        row: dict = {
            "series_id": series_id,
            "n_periods": int(len(group)),
            "low_n": bool(len(group) < low_n_threshold),
            "y_sum": float(group["y"].sum()),
            "mae_p50": round(mae(group["y"], group[quantile_column(0.5)]), METRICS_ROUND),
            "stockout_periods_vs_tt": int((group["y"] > tt).sum()),
        }
        for q in gate_quantiles:
            row[f"pinball_{q}"] = round(pinball_loss(group["y"], group[quantile_column(q)], q), METRICS_ROUND)
            row[f"coverage_{q}"] = round(coverage(group["y"], group[quantile_column(q)]), METRICS_ROUND)
        rows.append(row)
    return pd.DataFrame(rows)


def coverage_gate(per_series: pd.DataFrame, cfg: ForecastConfig) -> dict:
    """Share of series meeting the coverage tolerance, split by LOW_N status.

    Only series with at least ``low_n_threshold`` evaluation periods are judged; series below it are
    counted separately (spec: N < 26 is not a pass or a fail, it is LOW_N).
    """
    tolerance = float(cfg.evaluation["coverage_tolerance"])
    # All-zero series carry no information to judge (spec edge case 1: INSUFFICIENT_DATA) and are excluded
    # from the pass rate instead of silently deflating it.
    all_zero = per_series["y_sum"] <= 0
    judgeable = per_series.loc[~per_series["low_n"] & ~all_zero]
    result: dict = {
        "series_total": int(len(per_series)),
        "series_low_n": int(per_series["low_n"].sum()),
        "series_all_zero": int(all_zero.sum()),
        "series_judged": int(len(judgeable)),
        "low_n_threshold": int(cfg.evaluation["low_n_threshold"]),
        "coverage_tolerance": tolerance,
    }
    for quantile in [float(q) for q in cfg.evaluation["gate"]["require_coverage_within_tolerance"]]:
        column = f"coverage_{quantile}"
        inside = (judgeable[column].sub(quantile).abs() <= tolerance)
        result[f"coverage_pass_rate_{quantile}"] = round(float(inside.mean()), METRICS_ROUND) if len(judgeable) else None
        result[f"coverage_median_{quantile}"] = (round(float(judgeable[column].median()), METRICS_ROUND)
                                                 if len(judgeable) else None)
    return result


def evaluate_predictions(predictions: pd.DataFrame, quantiles: Sequence[float], cfg: ForecastConfig) -> dict:
    """Evaluate predictions with the required double reporting.

    Args:
        predictions: rows with ``baseline``, ``split``, ``series_id``, ``origin``, ``y``, quantile columns,
            ``ved``, ``unit_price_thb``, ``origin_stock`` and ``target_stockout_days``.
        quantiles: quantile levels in ascending order.
        cfg: configuration.

    Returns:
        ``{"filters": {filter: {split: {baseline: {...}}}}, "per_series": {split: {baseline: DataFrame}},
        "gates": {baseline: {split: {filter: {...}}}}}`` where the row filters are ``all_rows`` and
        ``no_stockout_rows`` (periods whose target window had no stock-out day).
    """
    filters = {
        "all_rows": lambda frame: frame,
        "no_stockout_rows": lambda frame: frame.loc[frame["target_stockout_days"] == 0],
    }
    tolerance = float(cfg.evaluation["coverage_tolerance"])
    results: dict = {"filters": {name: {} for name in filters}, "per_series": {}, "gates": {}}
    for filter_name, selector in filters.items():
        for split in sorted(predictions["split"].unique()):
            for baseline, group in predictions.loc[predictions["split"] == split].groupby("baseline", observed=True):
                raw = selector(group)
                subset = monotone_fix(raw, quantiles)
                pooled = pooled_metrics(subset, quantiles, cfg)
                # Reported metrics always use the monotone-fixed bands; the raw rate shows how often the
                # baseline itself produced an inverted pair (spec E4: sort first, then evaluate).
                pooled["crossing_rate_raw"] = round(crossing_rate(raw, quantiles), METRICS_ROUND)
                pooled["crossing_pairs_raw"] = {pair: round(value, METRICS_ROUND)
                                                for pair, value in crossing_pairs(raw, quantiles).items()}
                results["filters"][filter_name].setdefault(split, {})[baseline] = pooled
                per_series = per_series_metrics(subset, quantiles, cfg)
                results["per_series"].setdefault(filter_name, {}).setdefault(split, {})[baseline] = per_series
                results["gates"].setdefault(baseline, {}).setdefault(split, {})[filter_name] = coverage_gate(per_series, cfg)
    results["coverage_tolerance"] = tolerance
    results["quantiles"] = [float(q) for q in quantiles]
    return results
