"""Baseline forecasts — the yardstick the quantile model must beat.

Three baselines, from `specification/04-rules-formulas.md` F-03/F-04 and the pack specs §7.3:

1. ``seasonal_naive``  — usage of the same period one season ago (lag 52 weekly / lag 12 monthly).
2. ``ma_es_residual_quantile`` — the spec's own method: MA/ES for P50 (F-03) plus empirical residual
   quantiles for the bands (F-04), with the ``z * std(e)`` fallback and the ``RESIDUAL_FALLBACK`` flag
   when fewer than ``min_residuals`` residuals exist.
3. ``empirical_quantile`` — quantiles of the series' trailing window (52 weeks / 12 months).

Design notes that matter for correctness:

* **Strictly causal.** Every prediction made at origin ``t`` uses only data up to and including ``t``.
  Winsorisation thresholds, seasonal indices, MAE-based method/alpha choices and residual distributions are
  all computed with expanding statistics that end at ``t`` (never a full-sample statistic).
* **F-24 retraining cadence.** MA/ES parameters are refit weekly (per the spec table "Retraining: quantile
  models monthly; MA/ES parameters weekly"), so the causal column-wise computation *is* the refit.
* **Band construction (F-04 extended to 7 quantiles).** ``P_q = max(0, P50 + B_q)`` with
  ``B_q = max(0, Q_q(e))`` for ``q >= 0.5`` (spec) and ``B_q = min(0, Q_q(e))`` for ``q < 0.5`` (the
  mirror image, so a lower band can never be widened upwards), and ``B_0.5 = 0`` (F-03 defines P50 as the
  point forecast). Residuals are measured against the winsorised series, as the spec winsorises when
  training MA/ES.
* **Granularity-agnostic.** Period arithmetic comes from :mod:`f1_forecast.clean`, window sizes and lag
  sizes from config, so MONTH plugs in without code changes.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from f1_forecast import clean
from f1_forecast.config import ForecastConfig
from f1_forecast.schema import quantile_column

SEASONAL_NAIVE = "seasonal_naive"
MA_ES_RESIDUAL_QUANTILE = "ma_es_residual_quantile"
EMPIRICAL_QUANTILE = "empirical_quantile"


def _config_prefix(granularity: str) -> str:
    """Map a granularity to its config key prefix (``WEEK`` -> ``weekly``, ``MONTH`` -> ``monthly``)."""
    key = granularity.upper()
    if key == "WEEK":
        return "weekly"
    if key == "MONTH":
        return "monthly"
    raise ValueError(f"unsupported granularity {granularity!r}")


def _expanding_mean_abs(residual: pd.Series, grouper) -> pd.Series:
    """Expanding mean of ``|residual|`` per series (causal MAE used for method selection)."""
    return residual.abs().groupby(grouper, observed=True).transform(lambda s: s.expanding(min_periods=2).mean())


def causal_signals(totals: pd.DataFrame, cfg: ForecastConfig, granularity: str) -> pd.DataFrame:
    """Add every causal signal the three baselines need, one row per series x period.

    Args:
        totals: frame with ``series_id``, ``period`` (period start) and ``qty`` (aggregated usage). ``qty``
            is raw usage; the winsorised copy used for MA/ES lives in ``qty_win``.
        cfg: configuration (lags, windows, alpha grid, clip ranges, fallback z table).
        granularity: ``WEEK`` or ``MONTH``.

    Returns:
        ``totals`` plus: winsorised usage, MA/ES levels per alpha, chosen method/alpha with their MAEs,
        seasonal index, ``p50_ma_es`` and its residual bands ``rq_*``, seasonal-naive point and bands,
        and trailing empirical quantiles ``eq_*``. Columns not available for a row (e.g. a series younger
        than the seasonal lag) are NaN, which downstream reporting counts rather than hides.
    """
    prefix = _config_prefix(granularity)
    seasonal_lag = int(cfg.baselines["seasonal_naive"][f"{prefix}_lag"])
    ma_cfg = cfg.baselines["ma_es"]
    ma_n = int(ma_cfg["ma_n"])
    alphas = tuple(float(a) for a in ma_cfg["alpha_grid"])
    min_residuals = int(ma_cfg["min_residuals"])
    clip_low, clip_high = (float(v) for v in ma_cfg["seasonal_index_clip"])
    min_seasonal_periods = int(cfg.baselines["seasonal_naive"]["min_history_periods_for_seasonality"][granularity.upper()])
    empirical = cfg.baselines["empirical_quantile"]
    empirical_window = int(empirical[f"{prefix}_window"])
    empirical_min_periods = int(empirical["min_periods"])

    frame = totals.sort_values(["series_id", "period"]).reset_index(drop=True)
    keys = frame["series_id"]
    grouped = frame.groupby("series_id", observed=True)

    # 1) winsorise at the expanding P99 (spec: outliers winsorised at P99 when training MA/ES)
    if bool(ma_cfg.get("winsorise_p99", True)):
        # min_periods=2: a threshold computed from few points is simply the highest of them, so young
        # series are not blanked out -- NaN here would silently drop them from the MA/ES comparison.
        p99 = grouped["qty"].transform(lambda s: s.expanding(min_periods=2).quantile(0.99))
        frame["qty_win"] = np.minimum(frame["qty"].astype(float), p99)
    else:
        frame["qty_win"] = frame["qty"].astype(float)

    frame["history_periods"] = grouped.cumcount() + 1
    frame["ma"] = frame["qty_win"].groupby(keys, observed=True).transform(
        lambda s: s.rolling(ma_n, min_periods=2).mean())

    # 2) ES for every alpha, its causal MAE, then the per-row best alpha
    mae_columns: list[str] = []
    for alpha in alphas:
        es_column, mae_column = f"es_{alpha}", f"mae_es_{alpha}"
        frame[es_column] = frame["qty_win"].groupby(keys, observed=True).transform(
            lambda s, a=alpha: s.ewm(alpha=a, adjust=False).mean())
        frame[mae_column] = _expanding_mean_abs(frame["qty_win"] - frame[es_column], keys)
        mae_columns.append(mae_column)

    es_block = frame[[f"es_{alpha}" for alpha in alphas]].to_numpy(dtype=float)
    mae_block = frame[mae_columns].to_numpy(dtype=float)
    best_alpha = np.nanargmin(np.where(np.isnan(mae_block), np.inf, mae_block), axis=1)
    row_index = np.arange(len(frame))
    frame["alpha"] = np.array(alphas)[best_alpha]
    frame["es"] = es_block[row_index, best_alpha]
    frame["mae_es"] = mae_block[row_index, best_alpha]
    frame["mae_ma"] = _expanding_mean_abs(frame["qty_win"] - frame["ma"], keys)
    use_ma = frame["mae_ma"] <= frame["mae_es"]
    frame["method"] = np.where(use_ma, "ma", "es")
    frame["level"] = np.where(use_ma, frame["ma"], frame["es"])

    # 3) seasonal index of the TARGET period, from history only, applied once 12 months exist
    frame["target_month"] = clean.next_period_start(frame["period"], granularity).dt.month
    month_mean = frame["qty_win"].groupby([keys, frame["target_month"]], observed=True).transform(
        lambda s: s.expanding(min_periods=2).mean())
    overall_mean = frame["qty_win"].groupby(keys, observed=True).transform(
        lambda s: s.expanding(min_periods=2).mean())
    si_raw = month_mean / overall_mean.replace(0.0, np.nan)
    enough_history = frame["history_periods"] >= min_seasonal_periods  # >= 12 months (F-03)
    frame["seasonal_index"] = np.where(enough_history, si_raw.clip(clip_low, clip_high), 1.0)

    # 4) MA/ES point forecast (F-03) and its residual bands (F-04).
    # F-04 requires 1-step-ahead residuals: the error of the forecast made for period k BEFORE k, i.e.
    # ``e_k = y_k - p50_{k-1}``. Using the same-period level instead would subtract a value that already
    # contains ``y_k`` (up to the MA/ES weight of the current point), which shrinks the errors and makes the
    # bands far too narrow -- exactly the failure this line prevents.
    frame["p50_ma_es"] = (frame["level"] * frame["seasonal_index"]).clip(lower=0)
    frame["p50_ma_es_prev"] = frame["p50_ma_es"].groupby(keys, observed=True).transform(lambda s: s.shift(1))
    ma_residual = frame["qty_win"] - frame["p50_ma_es_prev"]
    for quantile in cfg.quantiles:
        column = quantile_column(quantile)
        frame[f"rq_{column}"] = _expanding_quantile(ma_residual, keys, quantile)
    frame["resid_n"] = ma_residual.notna().groupby(keys, observed=True).transform(lambda s: s.cumsum())
    frame["resid_std"] = ma_residual.groupby(keys, observed=True).transform(
        lambda s: s.expanding(min_periods=2).std())
    frame["residual_fallback"] = frame["resid_n"] < min_residuals

    # 5) seasonal naive: same period one season ago (lag - 1 because the current period is included).
    # Winsorisation is an MA/ES training device (F-04), so this descriptive baseline and the empirical
    # quantiles below are built from the raw series -- which also makes seasonal naive P50 identical to the
    # committed `lag_52w` feature, a cross-check the tests assert.
    frame["seasonal_point"] = frame["qty"].astype(float).groupby(keys, observed=True).transform(
        lambda s: s.shift(seasonal_lag - 1))
    # same 1-step-ahead alignment: the seasonal error is ``y_k - y_{k-seasonal_lag}``
    frame["seasonal_point_prev"] = frame["seasonal_point"].groupby(keys, observed=True).transform(
        lambda s: s.shift(1))
    seasonal_residual = frame["qty"].astype(float) - frame["seasonal_point_prev"]
    for quantile in cfg.quantiles:
        column = quantile_column(quantile)
        frame[f"srq_{column}"] = _expanding_quantile(seasonal_residual, keys, quantile)
    frame["seasonal_resid_n"] = seasonal_residual.notna().groupby(keys, observed=True).transform(
        lambda s: s.cumsum())
    frame["seasonal_resid_std"] = seasonal_residual.groupby(keys, observed=True).transform(
        lambda s: s.expanding(min_periods=2).std())

    # 6) empirical quantiles of the trailing window (causal, includes the origin period)
    for quantile in cfg.quantiles:
        column = quantile_column(quantile)
        frame[f"eq_{column}"] = frame["qty"].astype(float).groupby(keys, observed=True).transform(
            lambda s, q=quantile: s.rolling(empirical_window, min_periods=empirical_min_periods).quantile(q))
    return frame


def _expanding_quantile(values: pd.Series, keys: pd.Series, quantile: float) -> pd.Series:
    """Expanding quantile of ``values`` per series (causal, includes the current period)."""
    return values.groupby(keys, observed=True).transform(
        lambda s, q=quantile: s.expanding(min_periods=2).quantile(q))


def _bands(center: pd.Series, buffers: dict[str, pd.Series], quantiles: Sequence[float]) -> pd.DataFrame:
    """Build quantile columns from a centre forecast and per-quantile buffers (F-04 rules)."""
    bands: dict[str, pd.Series] = {}
    for quantile in quantiles:
        column = quantile_column(quantile)
        if quantile == 0.5:
            bands[column] = center.clip(lower=0)
            continue
        buffer = buffers[column]
        buffer = buffer.clip(lower=0) if quantile > 0.5 else buffer.clip(upper=0)
        bands[column] = (center + buffer).clip(lower=0)
    return pd.DataFrame(bands)


def _resolve_buffers(signals: pd.DataFrame, prefix: str, quantiles: Sequence[float], cfg: ForecastConfig,
                     fallback_flag: pd.Series, fallback_std: pd.Series) -> dict[str, pd.Series]:
    """Pick empirical residual quantiles, swapping in ``z * std(e)`` where residuals are too few."""
    z_table = cfg.baselines["ma_es"]["z"]
    buffers: dict[str, pd.Series] = {}
    for quantile in quantiles:
        column = quantile_column(quantile)
        empirical = signals[f"{prefix}_{column}"]
        fallback = float(z_table[quantile]) * fallback_std
        buffers[column] = empirical.where(~fallback_flag, fallback)
    return buffers


def baseline_predictions(totals: pd.DataFrame, panel: pd.DataFrame, cfg: ForecastConfig,
                         granularity: str) -> pd.DataFrame:
    """Predict every panel row with all three baselines.

    Args:
        totals: series x period usage totals (``clean.period_totals``).
        panel: evaluation rows with ``series_id``, ``origin``, ``y`` and the slicing attributes.
        cfg: configuration.
        granularity: ``WEEK`` or ``MONTH``.

    Returns:
        One row per baseline x panel row: ``baseline``, ``split``, ``series_id``, ``origin``, ``y``,
        the quantile columns, the slicing attributes, plus ``method``/``alpha``/``residual_fallback``.
    """
    quantiles = cfg.quantiles
    quantile_columns = [quantile_column(q) for q in quantiles]
    signals = causal_signals(totals, cfg, granularity)
    # Only the signal columns actually used are merged, with explicit names: the panel is the single source
    # of truth for identity and attributes, so nothing is duplicated or silently suffixed.
    wanted = (["series_id", "period", "method", "alpha", "residual_fallback", "p50_ma_es", "resid_std",
               "seasonal_point", "seasonal_resid_n", "seasonal_resid_std"]
              + [f"rq_{column}" for column in quantile_columns]
              + [f"srq_{column}" for column in quantile_columns]
              + [f"eq_{column}" for column in quantile_columns])
    merged = panel.merge(
        signals[wanted].rename(columns={"method": "ma_es_method", "alpha": "ma_es_alpha"}),
        left_on=["series_id", "origin"], right_on=["series_id", "period"], how="left", validate="many_to_one")

    base = merged[list(panel.columns)].copy()  # identity, actual and slicing attributes come from the panel

    frames = []

    # additive buffers -> quantile bands per baseline
    ma_es_buffers = _resolve_buffers(merged, "rq", quantiles, cfg, merged["residual_fallback"], merged["resid_std"])
    ma_es = pd.concat([base.assign(baseline=MA_ES_RESIDUAL_QUANTILE,
                                   residual_fallback=merged["residual_fallback"].fillna(True)),
                       _bands(merged["p50_ma_es"], ma_es_buffers, quantiles)], axis=1)
    frames.append(ma_es)

    seasonal_fallback = merged["seasonal_resid_n"] < int(cfg.baselines["ma_es"]["min_residuals"])
    seasonal_buffers = _resolve_buffers(merged, "srq", quantiles, cfg, seasonal_fallback,
                                        merged["seasonal_resid_std"])
    # Seasonal naive: P50 is last season's same period; its bands come from its own residuals.
    seasonal_point = merged["seasonal_point"]
    seasonal_bands = _bands(seasonal_point, seasonal_buffers, quantiles)
    seasonal = pd.concat([base.assign(baseline=SEASONAL_NAIVE,
                                      residual_fallback=seasonal_fallback.fillna(True)), seasonal_bands], axis=1)
    frames.append(seasonal)

    # empirical quantiles stand on their own (no centre + buffer construction)
    empirical_bands = {}
    for quantile in quantiles:
        column = quantile_column(quantile)
        empirical_bands[column] = merged[f"eq_{column}"].clip(lower=0)
    empirical = pd.concat([base.assign(baseline=EMPIRICAL_QUANTILE, residual_fallback=False),
                           pd.DataFrame(empirical_bands)], axis=1)
    frames.append(empirical)

    predictions = pd.concat(frames, ignore_index=True)
    # Series that cannot support a baseline at a given origin produce NaN bands. Rows are dropped so every
    # metric denominator is explicit; backtest.py reports how many rows each baseline could actually cover.
    incomplete = predictions[quantile_columns].isna().any(axis=1)
    return predictions.loc[~incomplete].reset_index(drop=True)
