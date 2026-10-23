"""Phase 7a — inference: build the latest features, score the frozen model, emit the JSON contract.

Formulas implemented (see ``specification/04-rules-formulas.md`` and ``specification/01-foundation.md``):

* **F-06 Total Target**: ``TT = P95`` for VED ``V``, ``P90`` for ``E``, undefined (``null``) for ``D``;
  ``TT = max(TT, P50)`` and rounded **up** to a whole base unit (``ceil``). The configured floor
  (``totals.rosterp_min_floor_units``) is ``null``, so no floor is applied.
* **F-08 daily usage / sigma**: ``u = P50_week / 7`` for a WEEK run and ``P50_month / 30`` for MONTH (the
  spec switches on the lead time, which is exactly what running one granularity per call expresses);
  ``sigma = sample_std(daily usage, trailing 90 d, min 28 d)`` with missing days counted as zero.
  ``L = max(1, ceil(PO ETA - today))`` when an open PO exists, else ``standard_lead_time_days`` — this
  pack has no PO arrival dates, so ``L`` is always the standard lead time (documented, not approximated).
* **F-09 reorder point**: ``rop = u*L + Z*sigma*sqrt(L)`` for REGULAR demand and ``rop = Q_q(L)`` for
  INTERMITTENT demand, ``ceil``; ``Z`` comes from ``ved.z`` (V 1.65, E 1.28, D 0.0).
* **ASM-43 lead-time quantile**: a WEEK run scales the weekly band (``P_q * L/7``) and a MONTH run the
  monthly band (``P_q * L/30``), rounded up. The spec switches band by ``L`` (weekly for ``L <= 7``, monthly
  for ``L > 7``), which needs both bands at one origin; a single-granularity run only has its own, so the
  switch is approximated and every row is flagged ``LEAD_TIME_QUANTILE_APPROX`` (README says so too).
* **Projected on-hand** (defined here, named by the demand quantile it uses):
  ``projectedOnHand_pXX = stockOnHand + incoming - pXX``. ``incoming`` is the open-order total with **no
  arrival date** (``stock_snapshot.qty_incoming``); it is therefore treated as available now, which makes
  the projection optimistic about timing. Negative values mean a shortfall against that quantile.
  ``stockOnHand`` is observed at ``dataEnd``, so a mid-week ``dataEnd`` has already consumed the first days
  of the target week inside that stock: WEEK projections are slightly pessimistic for that reason (not
  adjusted; MONTH is unaffected because ``dataEnd`` is month-aligned).

Output: ``artifacts/forecasts/<model_version>/forecast_<GRANULARITY>_<as-of>.json`` (plus a CSV when the
config asks for one). Exit codes: 0 OK, 3 ``NO_MODEL``, 4 ``STALE_INPUT``, 5 ``INSUFFICIENT_DATA``,
6 ``SCHEMA_MISMATCH``.
"""

from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd

from f1_forecast import baselines, calibration, clean, data_loader, features, metrics, model
from f1_forecast.config import ForecastConfig, ensure_dir
from f1_forecast.schema import quantile_column

QUANTILES: tuple[float, ...] = tuple(model.TRAINED_QUANTILES)
EXIT_CODES: dict[str, int] = {"OK": 0, "NO_MODEL": 3, "STALE_INPUT": 4,
                              "INSUFFICIENT_DATA": 5, "SCHEMA_MISMATCH": 6}
METHOD_QUANTILE = "QUANTILE_LGBM"
METHOD_MA_ES = "MA_ES"
METHOD_COLD_START = "COLD_START"
FLAG_PRECEDENCE = ("COLD_START", "FALLBACK_CLASSICAL", "RESIDUAL_FALLBACK", "SIGMA_POOLED", "NO_USAGE",
                   "LOW_CONFIDENCE", "OK")
DAYS_PER_PERIOD = {"WEEK": 7, "MONTH": 30}
PERIOD_STEP = {"WEEK": pd.Timedelta(weeks=1), "MONTH": pd.offsets.MonthBegin(1)}
CAVEAT = "MOCK DATA - not real accuracy; the pack is synthetic"


class PredictError(RuntimeError):
    """Structured inference failure (code, message, details, documented exit code)."""

    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    @property
    def exit_code(self) -> int:
        return EXIT_CODES[self.code]

    def to_dict(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message,
                          "exitCode": self.exit_code, "details": self.details}}


def _column(tau: float) -> str:
    return quantile_column(float(tau))


# ------------------------------------------------------------------------------------- model/inputs

def pinned_version(cfg: ForecastConfig, granularity: str) -> str:
    """Model version to serve for a granularity (``latest`` follows the newest artifact directory)."""
    key = model.granularity_key(granularity)
    versions = dict(cfg.inference.get("model_versions", {}))
    if key not in versions:
        raise PredictError("NO_MODEL", f"inference.model_versions has no entry for {key}",
                           granularity=key)
    return str(versions[key])


def load_model(cfg: ForecastConfig, granularity: str) -> tuple[model.TrainedModel, dict]:
    """Load the pinned frozen artifact; a missing directory/meta/model file is ``NO_MODEL``."""
    key = model.granularity_key(granularity)
    version = pinned_version(cfg, key)
    if version == "latest":
        candidates = sorted(path for path in cfg.artifacts_dir.glob(f"f1-{key}-*") if path.is_dir())
        if not candidates:
            raise PredictError("NO_MODEL", f"no {key} artifact under {cfg.artifacts_dir}", granularity=key)
        directory = candidates[-1]
    else:
        directory = cfg.artifacts_dir / version
    if not directory.is_dir():
        raise PredictError("NO_MODEL", f"artifact directory missing: {directory}",
                           granularity=key, modelVersion=version)
    if not (directory / "meta.json").exists():
        raise PredictError("NO_MODEL", f"meta.json missing in {directory}", granularity=key,
                           modelVersion=version)
    try:
        trained, meta = model.load_artifact(cfg, directory, key)
    except FileNotFoundError as error:  # a quantile .txt file is missing
        raise PredictError("NO_MODEL", f"model file missing: {error}", granularity=key,
                           modelVersion=version) from error
    return trained, meta


def data_end_of(pack: data_loader.RawPack) -> pd.Timestamp:
    """Latest usage date in the pack (the 'data end' the JSON reports)."""
    return pd.Timestamp(pd.to_datetime(pack.usage_daily["usage_date"]).max())


def inference_matrix(cfg: ForecastConfig, granularity: str, pack: data_loader.RawPack,
                     series: pd.DataFrame) -> pd.DataFrame:
    """Feature matrix that keeps the latest complete origin (target still in the future).

    Reuses the training builder: ``require_target=False`` only stops dropping the last origin; every lag,
    rolling window, calendar flag and context flag is computed by the same code as training. Splits are
    intentionally not assigned (they are relative to the newest origin and inference never scores them).
    """
    key = model.granularity_key(granularity)
    builder = features.build_weekly if key == "WEEK" else features.build_monthly
    matrix = builder(cfg, pack, series, assign_splits=False, require_target=False)
    return matrix.rename(columns={"hospital_drug_id": "series_id",
                                  "origin_week": "origin", "origin_month": "origin",
                                  "y_target": "y"})


def check_schema(trained: model.TrainedModel, frame: pd.DataFrame) -> None:
    """``SCHEMA_MISMATCH`` when the inference frame cannot feed the frozen feature contract."""
    missing = [column for column in trained.feature_list if column not in frame.columns]
    if missing:
        raise PredictError("SCHEMA_MISMATCH", "inference frame is missing model features",
                           missing=missing, expected=len(trained.feature_list))
    missing_categorical = [column for column in trained.categorical if column not in frame.columns]
    if missing_categorical:
        raise PredictError("SCHEMA_MISMATCH", "categorical features missing from the inference frame",
                           missing=missing_categorical)


def check_stale(cfg: ForecastConfig, data_end: pd.Timestamp, today: date) -> None:
    """``STALE_INPUT`` when the data end is older than ``inference.stale_after_days``.

    ``F1_STALE_AFTER_DAYS`` (env) overrides the config value when set to an integer; the scheduled predict job
    uses it so predicting on older input does not abort.
    """
    override = os.environ.get("F1_STALE_AFTER_DAYS", "").strip()
    threshold = int(override) if override.lstrip("-").isdigit() else int(cfg.inference["stale_after_days"])
    days_old = (pd.Timestamp(today) - data_end.normalize()).days
    if days_old > threshold:
        raise PredictError("STALE_INPUT", f"data end {data_end.date()} is {days_old} days old "
                                          f"(threshold {threshold} days)",
                           dataEnd=str(data_end.date()), daysOld=int(days_old), thresholdDays=threshold)


def choose_origin(frame: pd.DataFrame, as_of: str | None, granularity: str) -> pd.Timestamp:
    """Resolve ``--as-of`` to a complete origin present in the matrix (default: the latest one)."""
    origins = sorted(pd.to_datetime(pd.Series(frame["origin"].unique())))
    if not origins:
        raise PredictError("INSUFFICIENT_DATA", "no usable origins in the feature matrix",
                           granularity=granularity)
    latest = origins[-1]
    if as_of is None:
        return pd.Timestamp(latest)
    try:
        requested = pd.Timestamp(as_of)
    except (TypeError, ValueError) as error:
        raise PredictError("INSUFFICIENT_DATA", f"cannot parse --as-of {as_of!r}", granularity=granularity) from error
    if requested > latest:
        raise PredictError("INSUFFICIENT_DATA",
                           f"as-of {requested.date()} is after the latest complete origin {latest.date()}",
                           granularity=granularity, latestOrigin=str(latest.date()))
    if requested not in origins:
        raise PredictError("INSUFFICIENT_DATA",
                           f"as-of {requested.date()} is not a complete {granularity} origin",
                           granularity=granularity, latestOrigin=str(latest.date()),
                           available=[str(pd.Timestamp(value).date()) for value in origins[-3:]])
    return pd.Timestamp(requested)


# ------------------------------------------------------------------------------------------- scoring

def score(trained: model.TrainedModel, frame: pd.DataFrame) -> pd.DataFrame:
    """Feature frame -> raw and post-processed quantile columns (no calibration yet)."""
    scored = frame.copy()
    for column in trained.categorical:
        scored[column] = scored[column].astype("category")
    raw = {quantile: np.expm1(fitted.booster.predict(scored[trained.feature_list]))
           for quantile, fitted in trained.models.items()}
    ordered = model.postprocess(raw, trained.postprocess_method)
    for quantile in sorted(raw):
        scored[f"raw_{_column(quantile)}"] = np.asarray(raw[quantile], dtype=float)
        scored[_column(quantile)] = ordered[quantile]
    return scored


def calibrated(scored: pd.DataFrame, cfg: ForecastConfig, granularity: str,
               version: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Apply the configured calibration exactly (WEEK global on, MONTH off in this repo)."""
    key = model.granularity_key(granularity)
    settings = calibration.settings(cfg, key)
    if not settings["enabled"]:
        return scored, {"enabled": False, "variant": settings["variant"], "rows": None}
    try:
        fitted = calibration.load_calibration(cfg, version)
    except FileNotFoundError as error:
        raise PredictError("NO_MODEL", f"calibration enabled but its file is missing: {error}",
                           granularity=key, modelVersion=version) from error
    return fitted.apply(scored), {"enabled": True, "variant": fitted.variant,
                                  "rows": int(fitted.fitted_rows)}


# ---------------------------------------------------------------------------------- series features

def daily_sigma(pack: data_loader.RawPack, series_ids: list[str], data_end: pd.Timestamp,
                window: int = 90, min_days: int = 28) -> pd.Series:
    """F-08 ``sigma``: sample std of daily usage over the trailing 90 days, missing days = 0."""
    usage = pack.usage_daily.loc[pack.usage_daily["hospital_drug_id"].isin(series_ids),
                                 ["hospital_drug_id", "usage_date", "qty_used"]].copy()
    usage["usage_date"] = pd.to_datetime(usage["usage_date"])
    output: dict[str, float] = {}
    start = (data_end - pd.Timedelta(days=window - 1)).normalize()
    calendar = pd.date_range(start, data_end.normalize(), freq="D")
    for series_id, group in usage.groupby("hospital_drug_id", observed=True):
        daily = group.groupby("usage_date")["qty_used"].sum().reindex(calendar, fill_value=0.0)
        first = pd.Timestamp(group["usage_date"].min()).normalize()
        available = daily.loc[daily.index >= max(start, first)]
        output[str(series_id)] = (float(available.std(ddof=1)) if len(available) >= min_days else float("nan"))
    result = pd.Series(output, dtype=float)
    return result.reindex(series_ids)


def pattern_table(pack: data_loader.RawPack, ids: list[str],
                  data_end: pd.Timestamp) -> pd.DataFrame:
    """F-01 pattern metrics: CV of trailing 52 weekly totals and the 365-day active-day ratio."""
    usage = pack.usage_daily.loc[pack.usage_daily["hospital_drug_id"].isin(ids),
                                 ["hospital_drug_id", "usage_date", "qty_used"]].copy()
    usage["usage_date"] = pd.to_datetime(usage["usage_date"])
    weekly = clean.period_totals(pack.usage_daily, ids, "WEEK")
    weekly = weekly.loc[weekly["period"] >= data_end - pd.Timedelta(weeks=52)]
    window_start = (data_end - pd.Timedelta(days=364)).normalize()
    rows: list[dict[str, Any]] = []
    for series_id, group in usage.groupby("hospital_drug_id", observed=True):
        first = pd.Timestamp(group["usage_date"].min()).normalize()
        recent = group.loc[group["usage_date"] >= window_start]
        span = pd.date_range(max(window_start, first), data_end.normalize(), freq="D")
        active = recent.loc[recent["qty_used"] > 0, "usage_date"].nunique()
        ratio = float(active / len(span)) if len(span) else float("nan")
        series_weekly = weekly.loc[weekly["series_id"] == series_id, "qty"].astype(float)
        mean = float(series_weekly.mean()) if len(series_weekly) else 0.0
        cv = float(series_weekly.std(ddof=1) / mean) if len(series_weekly) >= 2 and mean > 0 else float("nan")
        if mean <= 0:
            pattern = "NO_USAGE"
        elif ratio <= 0.30:
            pattern = "INTERMITTENT"
        else:
            pattern = "REGULAR"
        rows.append({"series_id": series_id, "cv": round(cv, 4) if np.isfinite(cv) else None,
                     "active_day_ratio": round(ratio, 4) if np.isfinite(ratio) else None,
                     "history_days": int((data_end.normalize() - first).days + 1),
                     "demand_pattern": pattern})
    return pd.DataFrame(rows).set_index("series_id")


def stock_state(pack: data_loader.RawPack, ids: list[str], data_end: pd.Timestamp) -> pd.DataFrame:
    """Latest observed on-hand and open-order total (no arrival date) per series."""
    snapshot = pack.stock_snapshot
    snapshot = snapshot.loc[snapshot["hospital_drug_id"].isin(ids)
                            & (pd.to_datetime(snapshot["snap_date"]) <= data_end)]
    latest = snapshot.sort_values("snap_date").groupby("hospital_drug_id", observed=True).tail(1)
    return latest.set_index("hospital_drug_id")[["qty_on_hand", "qty_incoming"]].rename(
        columns={"qty_on_hand": "stock_on_hand", "qty_incoming": "incoming"})


def coverage_flags(cfg: ForecastConfig, granularity: str) -> pd.DataFrame | None:
    """Per-series P90/P95 coverage on the frozen valid split (None when it is not available)."""
    key = model.granularity_key(granularity)
    path = cfg.derived_dir / f"model_predictions_{key.lower()}_valid.parquet"
    if not path.exists():
        return None
    saved = pd.read_parquet(path)
    threshold = int(cfg.inference["min_history_periods"])
    tolerance = float(cfg.evaluation["coverage_tolerance"])
    rows: list[dict[str, Any]] = []
    for series_id, group in saved.groupby("series_id", observed=True):
        cov90 = float((group["y"] <= group["q90"]).mean())
        cov95 = float((group["y"] <= group["q95"]).mean())
        low_n = len(group) < threshold
        rows.append({"series_id": series_id, "low_n": low_n,
                     "coverage_ok": None if low_n else bool(abs(cov90 - 0.9) <= tolerance
                                                           and abs(cov95 - 0.95) <= tolerance)})
    return pd.DataFrame(rows).set_index("series_id")


# --------------------------------------------------------------------------------------- fallbacks

def monthly_fallbacks(cfg: ForecastConfig, origin: pd.Timestamp, model_ids: set[str],
                      ids: list[str], series: pd.DataFrame, pack: data_loader.RawPack,
                      data_end: pd.Timestamp) -> dict[str, dict[str, Any]]:
    """MONTH rows for series the monthly model cannot serve (no usable monthly row).

    Try the existing MA/ES baseline at the same origin first; when its bands are unavailable (fewer than
    two monthly observations ⇒ no residuals, no std) fall back to ``COLD_START`` pooled VED-class
    quantiles of the latest complete monthly usage (ASM-08's pooled idea, cross-sectional estimator).
    """
    missing = sorted(set(ids) - set(model_ids))
    if not missing:
        return {}
    totals = clean.period_totals(pack.usage_daily, ids, "MONTH")
    attributes = series.set_index("hospital_drug_id")
    signals = baselines.causal_signals(totals, cfg, "MONTH")
    at_origin = signals.loc[signals["period"] == origin]
    model_rows = at_origin.loc[at_origin["series_id"].isin(model_ids)]
    pooled_std = (float(model_rows["resid_std"].median())
                  if model_rows["resid_std"].notna().any() else float("nan"))
    z_table = cfg.baselines["ma_es"]["z"]

    pooled = totals.loc[(totals["period"] == origin) & totals["series_id"].isin(model_ids)]
    output: dict[str, dict[str, Any]] = {}
    for series_id in missing:
        ved = str(attributes.loc[series_id, "ved"])
        row = at_origin.loc[at_origin["series_id"] == series_id]
        p50 = float(row["p50_ma_es"].iloc[0]) if len(row) else float("nan")
        if not np.isfinite(p50) and len(row):
            # a single complete month: the P99 winsoriser needs two points, so the ES level is undefined.
            # With one observation the ES point *is* that observation, which is what MA/ES would return.
            p50 = float(row["qty"].iloc[0])
        if np.isfinite(p50) and np.isfinite(pooled_std) and pooled_std > 0:
            # F-04 fallback rule (z * std(e)) with the series' own residuals unavailable: the std is the
            # VED-class pooled residual std at this origin, which keeps the series' own level (last month).
            bands: dict[float, float] = {}
            for quantile in QUANTILES:
                if quantile == 0.5:
                    bands[quantile] = max(p50, 0.0)
                else:
                    buffer = float(z_table[quantile]) * pooled_std
                    buffer = max(buffer, 0.0) if quantile > 0.5 else min(buffer, 0.0)
                    bands[quantile] = max(p50 + buffer, 0.0)
            output[series_id] = {
                "method": METHOD_MA_ES, "bands": bands,
                "flags": ["FALLBACK_CLASSICAL", "RESIDUAL_FALLBACK"],
                "reason": f"MA/ES point at the origin (single month = the ES level) + VED {ved} pooled "
                          f"residual std {pooled_std:.2f} (fewer than 26 residuals, F-04 fallback)",
            }
            continue
        sample = pooled.loc[pooled["series_id"].map(attributes["ved"]) == ved, "qty"].astype(float)
        if len(sample) < 5:
            sample = pooled["qty"].astype(float)
        bands = {quantile: float(sample.quantile(quantile)) if len(sample) else 0.0
                 for quantile in QUANTILES}
        bands = {quantile: max(bands[quantile], 0.0) for quantile in QUANTILES}
        output[series_id] = {"method": METHOD_COLD_START, "bands": bands,
                             "flags": ["COLD_START"],
                             "reason": f"no monthly MA/ES point for VED {ved}; pooled class quantiles"}
    return output


# ------------------------------------------------------------------------------------------ payload

def _ceil(value: float | None) -> int | None:
    return None if value is None or not np.isfinite(value) else int(math.ceil(value))


def _round(value: float | None, digits: int = 3) -> float | None:
    return None if value is None or not np.isfinite(value) else round(float(value), digits)


def build_forecast(cfg: ForecastConfig, granularity: str = "WEEK", as_of: str | None = None,
                   today: date | None = None, pack: data_loader.RawPack | None = None,
                   series: pd.DataFrame | None = None) -> dict[str, Any]:
    """Build the full forecast payload for one granularity and origin."""
    key = model.granularity_key(granularity)
    today = today or datetime.now(timezone.utc).date()

    if pack is None or series is None:
        pack = data_loader.load_pack(cfg)
        series = data_loader.enrich_series(pack, cfg)
    trained, meta = load_model(cfg, key)
    data_end = data_end_of(pack)
    check_stale(cfg, data_end, today)

    matrix = inference_matrix(cfg, key, pack, series)
    check_schema(trained, matrix)
    origin = choose_origin(matrix, as_of, key)
    frame = matrix.loc[matrix["origin"] == origin].copy()
    if frame.empty:
        raise PredictError("INSUFFICIENT_DATA", f"no feature rows at origin {origin.date()}",
                           granularity=key)
    frame["split"] = ""
    scored = score(trained, frame)
    scored, calibration_info = calibrated(scored, cfg, key, trained.model_version)

    ids = clean.scope_ids(series)
    present = set(scored["series_id"])
    unavailable = sorted(set(ids) - present)
    if key == "WEEK" and unavailable:
        raise PredictError("INSUFFICIENT_DATA", "weekly matrix is missing modelled series",
                           granularity=key, missing=unavailable[:5], count=len(unavailable))

    history = matrix.loc[matrix["origin"] <= origin].groupby("series_id", observed=True).size()
    sigma = daily_sigma(pack, ids, data_end)
    patterns = pattern_table(pack, ids, data_end)
    stock = stock_state(pack, ids, data_end)
    coverage = coverage_flags(cfg, key)
    hospitals = pack.hospital.set_index("code")["id"].to_dict()
    attributes = series.set_index("hospital_drug_id")
    min_history = int(cfg.inference["min_history_periods"])
    z_table = cfg.ved["z"]
    tt_levels = cfg.ved["quantile"]
    days = DAYS_PER_PERIOD[key]
    projected_levels = [float(value) for value in cfg.inference["projected_on_hand_quantiles"]]

    fallbacks: dict[str, dict[str, Any]] = {}
    model_ids = set(scored["series_id"])
    if key == "MONTH":
        # "a model row" = the series appears in the **training** matrix (>= 2 complete months).
        # A series with a single month is visible in the inference matrix for the newest origin but the
        # model never saw it, so it gets the explicit fallback row instead of a NaN-lag prediction.
        train_series = features.build_monthly(cfg, pack, series)["hospital_drug_id"].unique()
        model_ids = set(train_series)
        scored = scored.loc[scored["series_id"].isin(model_ids)].copy()
        fallbacks = monthly_fallbacks(cfg, origin, model_ids, ids, series, pack, data_end)

    rows: list[dict[str, Any]] = []
    for series_id in sorted(set(scored["series_id"]) | set(fallbacks)):
        if series_id in fallbacks:
            entry = fallbacks[series_id]
            bands = entry["bands"]
            method = entry["method"]
            flags = list(entry["flags"])
        else:
            row = scored.loc[scored["series_id"] == series_id].iloc[0]
            bands = {quantile: float(row[_column(quantile)]) for quantile in QUANTILES}
            method = METHOD_QUANTILE
            flags = []
        bands = {quantile: max(float(value), 0.0) for quantile, value in bands.items()}
        ordered = np.sort(np.array([bands[q] for q in QUANTILES], dtype=float))
        # store 3 decimals (DB numeric(14,3)) and derive every downstream field from those stored values,
        # so TT / Q_q(L) / uPerDay are exactly reproducible from the JSON itself
        bands = {quantile: round(float(ordered[index]), 3) for index, quantile in enumerate(QUANTILES)}

        history_periods = int(history.get(series_id, 0))
        if method == METHOD_QUANTILE and history_periods < min_history:
            if key == "WEEK":
                flags.append("COLD_START")
            flags.append("LOW_CONFIDENCE")
        elif method != METHOD_QUANTILE:
            flags.append("LOW_CONFIDENCE")
        profile = patterns.loc[series_id] if series_id in patterns.index else None
        pattern = str(profile["demand_pattern"]) if profile is not None else "NO_USAGE"
        if pattern == "NO_USAGE":
            flags.append("NO_USAGE")

        ved = str(attributes.loc[series_id, "ved"])
        lead_time = attributes.loc[series_id, "standard_lead_time_days"]
        lead_days = max(1, int(math.ceil(float(lead_time)))) if pd.notna(lead_time) else 1
        sigma_value = sigma.get(series_id, float("nan"))
        pooled_sigma = None
        if not np.isfinite(sigma_value):
            peers = sigma.loc[sigma.index.map(lambda sid: attributes.loc[sid, "ved"]) == ved]
            pooled_sigma = float(peers.median()) if len(peers) and np.isfinite(peers).any() else 0.0
            sigma_value = pooled_sigma
            flags.append("SIGMA_POOLED")

        p50 = bands[0.50]
        u_per_day = p50 / days
        quantile_level = tt_levels.get(ved)
        total_target_raw = max(bands[float(quantile_level)], p50) if quantile_level is not None else None
        total_target = _ceil(total_target_raw)
        if quantile_level is not None:
            lead_quantile_value = bands[float(quantile_level)] * lead_days / days
            lead_quantile = _ceil(lead_quantile_value)
        else:
            lead_quantile = None
        z_value = float(z_table.get(ved, 0.0))
        if pattern == "INTERMITTENT":
            rop_raw = lead_quantile
        else:
            rop_raw = u_per_day * lead_days + z_value * float(sigma_value) * math.sqrt(lead_days)
        rop = _ceil(rop_raw) if rop_raw is not None else None

        stock_row = stock.loc[series_id] if series_id in stock.index else None
        on_hand = float(stock_row["stock_on_hand"]) if stock_row is not None else 0.0
        incoming = float(stock_row["incoming"]) if stock_row is not None else 0.0
        unique_flags = [flag for flag in FLAG_PRECEDENCE if flag in set(flags)]
        primary = unique_flags[0] if unique_flags else "OK"

        coverage_ok = None
        if coverage is not None and series_id in coverage.index and not bool(coverage.loc[series_id, "low_n"]):
            value = coverage.loc[series_id, "coverage_ok"]
            coverage_ok = None if pd.isna(value) else bool(value)

        period_start = pd.Timestamp(origin) + PERIOD_STEP[key]
        payload_row: dict[str, Any] = {
            "hospitalId": hospitals.get(str(attributes.loc[series_id, "hospital_code"])),
            "hospitalCode": str(attributes.loc[series_id, "hospital_code"]),
            "hospitalDrugId": series_id,
            "itemCode": str(attributes.loc[series_id, "item_code"]),
            "periodStart": str(pd.Timestamp(period_start).date()),
            "originPeriod": str(pd.Timestamp(origin).date()),
            "method": method,
            "demandPattern": pattern,
            "ved": ved,
            "abc": str(attributes.loc[series_id, "abc"]),
        }
        for quantile in QUANTILES:
            payload_row[f"p{int(round(quantile * 100)):02d}"] = _round(bands[quantile])
        payload_row.update({
            "totalTarget": total_target,
            "rop": rop,
            "uPerDay": _round(u_per_day),
            "sigmaPerDay": _round(float(sigma_value)),
            "leadTimeDays": lead_days,
            "leadTimeQuantile": lead_quantile,
            "leadTimeQuantileApprox": True,
            "stockOnHand": _round(on_hand),
            "incoming": _round(incoming),
            "confidenceFlag": primary,
            "confidenceFlags": unique_flags or ["OK"],
            # ASM-43 method flag: the lead-time band is scaled from the run's granularity, always an
            # approximation. Kept out of the confidence precedence (it is not a data-quality signal).
            "flags": (unique_flags or ["OK"]) + ["LEAD_TIME_QUANTILE_APPROX"],
            "coverageOk": coverage_ok,
            "historyPeriods": history_periods,
            "activeDayRatio": None if profile is None else profile["active_day_ratio"],
            "cv": None if profile is None else profile["cv"],
        })
        for level in projected_levels:
            name = f"p{int(round(level * 100)):02d}"
            payload_row[f"projectedOnHand_{name}"] = _round(on_hand + incoming - bands[level])
        rows.append(payload_row)

    if key == "WEEK" and len(rows) != len(ids):
        raise PredictError("INSUFFICIENT_DATA", "weekly output does not cover every modelled series",
                           granularity=key, expected=len(ids), got=len(rows))
    if key == "MONTH" and len(rows) != len(ids):
        raise PredictError("INSUFFICIENT_DATA", "monthly output does not cover every modelled series",
                           granularity=key, expected=len(ids), got=len(rows))

    by_method: dict[str, int] = {}
    by_flag: dict[str, int] = {}
    for row in rows:
        by_method[row["method"]] = by_method.get(row["method"], 0) + 1
        by_flag[row["confidenceFlag"]] = by_flag.get(row["confidenceFlag"], 0) + 1
    return {
        "modelVersion": trained.model_version,
        "granularity": key,
        "asOf": str(pd.Timestamp(origin).date()) if as_of is None else str(pd.Timestamp(as_of).date()),
        "originUsed": str(pd.Timestamp(origin).date()),
        "dataEnd": str(data_end.date()),
        "calibration": calibration_info,
        "counts": {"rows": len(rows), "series": len(rows), "byMethod": by_method,
                   "byConfidenceFlag": by_flag, "fallbackRows": len(fallbacks)},
        "definitions": {
            "totalTarget": "F-06: P95 for V, P90 for E, null for D; max(TT, P50); ceil to whole units; "
                           "configured floor is null",
            "uPerDay": f"F-08: P50 / {days} (this is a {key} run)",
            "leadTimeDays": "F-08: max(1, ceil(PO ETA - today)) when an open PO exists, else "
                            "standard_lead_time_days; this pack carries no PO arrival dates, so the "
                            "standard lead time is used",
            "sigmaPerDay": "F-08: sample std of daily usage, trailing 90 days, missing days = 0, "
                           "minimum 28 days; pooled VED-class median when unavailable",
            "leadTimeQuantile": "ASM-43 approximation: a WEEK run scales the weekly band (P_q x L/7) and a "
                                "MONTH run scales the monthly band (P_q x L/30), ceil; a single-granularity "
                                "run has only its own band, so the spec's L <= 7 / L > 7 band switch is "
                                "approximated and every row is flagged LEAD_TIME_QUANTILE_APPROX",
            "rop": "F-09: u x L + Z x sigma x sqrt(L) for REGULAR, Q_q(L) for INTERMITTENT, ceil; "
                   "Z from ved.z (V 1.65, E 1.28, D 0.0)",
            "projectedOnHand": "stockOnHand + incoming - pXX for XX in "
                               f"{[int(round(level * 100)) for level in projected_levels]}; negative = "
                               "shortfall against that quantile. stockOnHand is observed at dataEnd, so when "
                               "dataEnd falls mid-period the first days of the target period are already "
                               "consumed in it: WEEK projections are slightly pessimistic for that reason",
            "incoming": "stock_snapshot.qty_incoming at the data end: open-order total with NO arrival date, "
                        "treated as available now (optimistic about timing)",
            "coverageOk": "per-series P90 and P95 coverage within +/-0.05 on the frozen valid predictions; "
                          "null for LOW_N series or when the saved predictions are unavailable",
        },
        "notes": [CAVEAT,
                  "quantiles are the calibrated, clipped, row-sorted bands"
                  if calibration_info["enabled"] else "quantiles are the model bands (calibration off)",
                  "periodStart is the target period; originPeriod is the data cut used"],
        "rows": rows,
    }


def forecast_paths(cfg: ForecastConfig, payload: Mapping[str, Any]) -> dict[str, Path]:
    directory = ensure_dir(cfg.forecasts_dir / str(payload["modelVersion"]))
    stem = f"forecast_{payload['granularity']}_{payload['originUsed']}"
    return {"json": directory / f"{stem}.json", "csv": directory / f"{stem}.csv"}


def write_forecast(cfg: ForecastConfig, payload: Mapping[str, Any],
                   write_csv: bool | None = None) -> dict[str, str]:
    """Write the JSON contract and (optionally) the flat CSV; returns the paths."""
    paths = forecast_paths(cfg, payload)
    paths["json"].write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    written = {"json": str(paths["json"])}
    want_csv = bool(cfg.inference.get("write_csv", False)) if write_csv is None else write_csv
    if want_csv:
        pd.DataFrame(payload["rows"]).to_csv(paths["csv"], index=False)
        written["csv"] = str(paths["csv"])
    return written


def run_predict(cfg: ForecastConfig, granularity: str = "WEEK", as_of: str | None = None,
                write: bool = True, write_csv: bool | None = None) -> dict[str, Any]:
    """Public entry point used by the CLI and tests."""
    payload = build_forecast(cfg, granularity=granularity, as_of=as_of)
    if write:
        payload["paths"] = write_forecast(cfg, payload, write_csv=write_csv)
    return payload


# -------------------------------------------------------------------------------------------- parity

def parity_check(cfg: ForecastConfig, granularity: str, origins: int = 2) -> dict[str, Any]:
    """Reproduce the saved valid predictions through the predict path (no re-score, valid only)."""
    key = model.granularity_key(granularity)
    trained, _ = load_model(cfg, key)
    saved_path = cfg.derived_dir / f"model_predictions_{key.lower()}_valid.parquet"
    if not saved_path.exists():
        raise PredictError("INSUFFICIENT_DATA", f"saved valid predictions missing: {saved_path}",
                           granularity=key)
    saved = pd.read_parquet(saved_path)
    chosen = sorted(pd.to_datetime(saved["origin"].unique()))[-origins:]
    pack = data_loader.load_pack(cfg)
    series = data_loader.enrich_series(pack, cfg)
    matrix = inference_matrix(cfg, key, pack, series)
    frame = matrix.loc[matrix["origin"].isin(chosen)].copy()
    frame["split"] = ""
    scored = score(trained, frame)

    joined = saved.loc[saved["origin"].isin(chosen)].merge(
        scored[["series_id", "origin", *_all_columns()]], on=["series_id", "origin"],
        suffixes=("_saved", "_new"), validate="one_to_one")
    max_diff = {column: float(np.abs(joined[f"{column}_saved"] - joined[f"{column}_new"]).max())
                for column in _all_columns()}
    result: dict[str, Any] = {
        "granularity": key,
        "modelVersion": trained.model_version,
        "split": "valid",
        "origins": [str(pd.Timestamp(value).date()) for value in chosen],
        "rows": int(len(joined)),
        "uncalibrated_max_abs_diff": max_diff,
        "uncalibrated_max": max(max_diff.values()),
        "calibrated": None,
    }
    settings = calibration.settings(cfg, key)
    if settings["enabled"]:
        fitted = calibration.load_calibration(cfg, trained.model_version)
        model_cal = fitted.apply(scored)
        saved_cal = fitted.apply(saved.loc[saved["origin"].isin(chosen)].copy())
        cal_joined = saved_cal.merge(model_cal[["series_id", "origin", *_columns()]],
                                     on=["series_id", "origin"], suffixes=("_saved", "_new"),
                                     validate="one_to_one")
        cal_diff = {column: float(np.abs(cal_joined[f"{column}_saved"]
                                         - cal_joined[f"{column}_new"]).max())
                    for column in _columns()}
        result["calibrated"] = {"rows": int(len(cal_joined)),
                                "max_abs_diff": cal_diff, "max": max(cal_diff.values()),
                                "variant": fitted.variant}
    return result


def _columns() -> list[str]:
    return [_column(quantile) for quantile in QUANTILES]


def _all_columns() -> list[str]:
    return [f"raw_{column}" for column in _columns()] + _columns()


def write_parity(cfg: ForecastConfig, report: Mapping[str, Any]) -> Path:
    path = cfg.reports_dir / "parity.json"
    ensure_dir(cfg.reports_dir)
    payload = {**report, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    return path
