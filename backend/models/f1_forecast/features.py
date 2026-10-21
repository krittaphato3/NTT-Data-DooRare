"""Feature builds for the weekly and monthly matrices, plus build reconciliation.

Two jobs:

1. **Weekly rebuild.** A faithful port of ``data/DooRare-F1-Monthly-Pack/build_features.py`` so the
   committed ``data/f1_weekly_features4.csv`` can be verified instead of trusted: same scope, same
   complete-week rule, same lag semantics (``lag_1w`` is the origin week itself), same warm-up cut, same
   tail split with 1-week embargoes. :func:`reconcile_weekly` reports every row- and column-level mismatch.
2. **Monthly matrix.** Built from the raw pack CSVs (never from ``f1_daily``), because the joined daily
   view cannot produce calendar-complete month totals per ``hospital_drug_id`` with the same guarantees.

Context flags carry the one real leakage risk. Three variants are produced so the difference is measured
rather than assumed:

``target_period_all``
    The reference/committed rule: does the *target* period overlap the event window, ignoring when the
    window record was created. Kept only to reproduce the committed file.
``known_at_origin`` (canonical)
    Same target-period overlap, plus the record existed (``created_at``) and was approved by the forecast
    instant -- the end of the origin period, since ``lag_1w``/``lag_1m`` already include it. This keeps the
    documented meaning of the feature ("the event covers the target period") and removes only the leak.
``origin_active``
    Alternative reading of "known at origin": the window is active at the forecast instant
    (``valid_from <= origin_end <= valid_to``) and its record was known then, regardless of the target
    period. Reported for comparison; it is a different feature (current context), not a leak fix.

A literal ``valid_from <= origin`` test with no ``valid_to`` bound was rejected: every event type had
started long before most origins, so the flag was 1 on 74-93% of rows and carried no information.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

from f1_forecast import clean, data_loader, schema
from f1_forecast.config import ForecastConfig, ensure_dir

ContextRule = Literal["known_at_origin", "origin_active", "target_period_all"]
CONTEXT_RULES: tuple[ContextRule, ...] = ("known_at_origin", "origin_active", "target_period_all")

# tolerance for float comparison when reconciling against the committed CSV (summation order only)
RECONCILE_ATOL = 1e-9
RECONCILE_RTOL = 1e-9


# --------------------------------------------------------------------------------------------- calendar


def _mmdd(text: str) -> tuple[int, int]:
    month, day = text.split("-")
    return int(month), int(day)


def _fixed_holidays(cfg: ForecastConfig) -> set[tuple[int, int]]:
    return {_mmdd(value) for value in cfg.calendar["fixed_holidays_mmdd"]}


def _weekday_holidays(cfg: ForecastConfig, start: pd.Timestamp, days: int) -> int:
    """Count fixed-date public holidays that fall on a weekday inside ``[start, start+days)``."""
    fixed = _fixed_holidays(cfg)
    span = pd.date_range(start, periods=days)
    return int(sum((day.month, day.day) in fixed and day.weekday() < 5 for day in span))


def _span_hits(cfg: ForecastConfig, start: pd.Timestamp, days: int, key: str) -> int:
    """1 when one of the configured ``mm-dd`` dates occurs inside the span (Songkran / New Year)."""
    wanted = {_mmdd(value) for value in cfg.calendar[key]}
    span = pd.date_range(start, periods=days)
    return int(any((day.month, day.day) in wanted for day in span))


def _newyear_hits(cfg: ForecastConfig, start: pd.Timestamp, days: int) -> int:
    """1 when the span touches the year-end period (the range wraps across 31 Dec)."""
    window = cfg.calendar["newyear_period"]
    first, last = _mmdd(window["from_mmdd"]), _mmdd(window["to_mmdd"])
    span = pd.date_range(start, periods=days)
    return int(any((day.month, day.day) >= first or (day.month, day.day) <= last for day in span))


def weekly_calendar(cfg: ForecastConfig, periods) -> pd.DataFrame:
    """Calendar features keyed by week start (Monday).

    Cycles use a 52-week year (matching the reference builder), the month cycle uses the week's midpoint.
    """
    rows: dict[pd.Timestamp, dict[str, float]] = {}
    for period in periods:
        start = pd.Timestamp(period)
        mid = start + pd.Timedelta(days=3)
        woy = int(mid.isocalendar().week)
        rows[start] = {
            "woy_sin": float(np.sin(2 * np.pi * woy / 52)),
            "woy_cos": float(np.cos(2 * np.pi * woy / 52)),
            "month_sin": float(np.sin(2 * np.pi * mid.month / 12)),
            "month_cos": float(np.cos(2 * np.pi * mid.month / 12)),
            "is_songkran_week": _span_hits(cfg, start, 7, "songkran_mmdd"),
            "is_newyear_week": _newyear_hits(cfg, start, 7),
            "long_weekend_days": _weekday_holidays(cfg, start, 7),
        }
    return pd.DataFrame.from_dict(rows, orient="index")


def monthly_calendar(cfg: ForecastConfig, periods) -> pd.DataFrame:
    """Calendar features keyed by month start, describing the whole month."""
    rows: dict[pd.Timestamp, dict[str, float]] = {}
    for period in periods:
        start = pd.Timestamp(period)
        days = int(start.days_in_month)
        rows[start] = {
            "month_sin": float(np.sin(2 * np.pi * start.month / 12)),
            "month_cos": float(np.cos(2 * np.pi * start.month / 12)),
            "is_songkran_month": _span_hits(cfg, start, days, "songkran_mmdd"),
            "is_newyear_month": _newyear_hits(cfg, start, days),
            "long_weekend_days": _weekday_holidays(cfg, start, days),
        }
    return pd.DataFrame.from_dict(rows, orient="index")


# ---------------------------------------------------------------------------------------------- context


def _period_end(start: pd.Timestamp, granularity: str) -> pd.Timestamp:
    """Last day of the period that starts at ``start``."""
    value = pd.Timestamp(start)
    if granularity.upper() == "WEEK":
        return value + pd.Timedelta(days=6)
    return value + pd.offsets.MonthEnd(1)


def _clean_signals(signals: pd.DataFrame) -> pd.DataFrame:
    """Normalise the event table for causal comparisons (naive local time, open-ended windows)."""
    frame = signals[["signal_type", "valid_from", "valid_to", "created_at", "approved_by"]].copy()
    frame["valid_from"] = pd.to_datetime(frame["valid_from"])
    frame["valid_to"] = pd.to_datetime(frame["valid_to"])
    frame["created_at"] = pd.to_datetime(frame["created_at"], utc=True).dt.tz_convert("Asia/Bangkok").dt.tz_localize(None)
    frame["approved"] = frame["approved_by"].notna() & frame["approved_by"].astype(str).str.strip().ne("")
    frame["valid_to"] = frame["valid_to"].fillna(pd.Timestamp("2100-01-01"))
    return frame


def context_flags(cfg: ForecastConfig, signals: pd.DataFrame, origins, granularity: str,
                  rule: ContextRule) -> pd.DataFrame:
    """Event flags of the target period, per origin period, under one knowledge rule.

    Args:
        cfg: configuration (signal type -> column mapping).
        signals: raw ``context_signal`` frame.
        origins: origin period starts.
        granularity: ``WEEK`` or ``MONTH``.
        rule: one of :data:`CONTEXT_RULES`.

    Returns:
        Frame indexed by origin period with one 0/1 column per configured signal.
    """
    if rule not in CONTEXT_RULES:
        raise ValueError(f"unknown context rule {rule!r}; expected one of {CONTEXT_RULES}")
    prepared = _clean_signals(signals)
    mapping: dict[str, str] = dict(cfg.context_flags["signals"])
    rows: dict[pd.Timestamp, dict[str, int]] = {}
    for origin in origins:
        start = pd.Timestamp(origin)
        origin_end = _period_end(start, granularity)
        target_start = pd.Timestamp(clean.next_period_start(pd.Series([start]), granularity).iloc[0])
        target_end = _period_end(target_start, granularity)
        row: dict[str, int] = {}
        for signal_type, column in mapping.items():
            subset = prepared.loc[prepared["signal_type"] == signal_type]
            known = (subset["created_at"] <= origin_end) & subset["approved"]
            if rule == "origin_active":
                hit = (subset["valid_from"] <= origin_end) & (subset["valid_to"] >= start) & known
            else:
                overlap = (subset["valid_from"] <= target_end) & (subset["valid_to"] >= target_start)
                hit = overlap if rule == "target_period_all" else overlap & known
            row[column] = int(bool(hit.any()))
        rows[start] = row
    return pd.DataFrame.from_dict(rows, orient="index")


# -------------------------------------------------------------------------------------------- period data


def period_usage(pack: data_loader.RawPack, ids: list[str], granularity: str) -> pd.DataFrame:
    """Complete period totals per series (``clean.period_totals`` already enforces completeness)."""
    return clean.period_totals(pack.usage_daily, ids, granularity)


def period_stockout_days(pack: data_loader.RawPack, cfg: ForecastConfig, ids: list[str],
                         granularity: str) -> pd.DataFrame:
    """Stock-out days per series and origin period (``qty_on_hand <= stockout_threshold``)."""
    snapshot = clean.restrict_to_scope(pack.stock_snapshot, ids)
    threshold = float(cfg.stockout["stockout_threshold"])
    if granularity.upper() == "WEEK":
        period = snapshot["snap_date"].dt.to_period("W-SUN").dt.start_time
    else:
        period = snapshot["snap_date"].dt.to_period("M").dt.to_timestamp()
    flagged = snapshot.assign(period=period, is_stockout=(snapshot["qty_on_hand"] <= threshold).astype(int))
    return (
        flagged.groupby(["hospital_drug_id", "period"], observed=True)["is_stockout"].sum()
        .rename("stockout_days").reset_index()
        .rename(columns={"hospital_drug_id": "series_id"})
    )


def _series_attributes(series: pd.DataFrame) -> pd.DataFrame:
    """Catalogue attributes carried onto every row (identical for WEEK and MONTH)."""
    attributes = series[[
        "hospital_drug_id", "hospital_code", "item_code", "price_tier", "ved", "abc", "item_type",
        "hospital_tier", "is_cold_chain", "log_unit_price", "is_seasonal",
    ]].rename(columns={"hospital_drug_id": "series_id"})
    attributes["is_cold_chain"] = attributes["is_cold_chain"].astype(int)
    attributes["is_seasonal"] = attributes["is_seasonal"].astype(int)
    return attributes


# ------------------------------------------------------------------------------------------------ weekly


def build_weekly(cfg: ForecastConfig, pack: data_loader.RawPack | None = None,
                 series: pd.DataFrame | None = None, context_rule: ContextRule = "known_at_origin",
                 assign_splits: bool = True, require_target: bool = True) -> pd.DataFrame:
    """Rebuild the weekly matrix from the raw pack.

    Args:
        cfg: resolved configuration.
        pack: pre-loaded raw pack (loaded from disk when omitted).
        series: series inventory (built from ``pack`` when omitted).
        context_rule: event-flag knowledge rule (see module docstring).
        assign_splits: when False the ``split`` column is left empty, which the no-lookahead test uses
            because truncating the raw data moves the split boundaries.
        require_target: when True (training default) only rows whose target week is observed are kept.
            Inference passes False to keep the latest complete origin, whose target lies in the future;
            that row has ``y_target`` = NaN and every feature is built exactly as for the training rows.

    Returns:
        One row per series x origin week with the committed column order and names.
    """
    key = "WEEK"
    pack = pack if pack is not None else data_loader.load_pack(cfg)
    series = series if series is not None else data_loader.enrich_series(pack, cfg)
    ids = clean.scope_ids(series)
    granularity = cfg.granularity(key)

    totals = period_usage(pack, ids, key)
    stockouts = period_stockout_days(pack, cfg, ids, key)
    totals = totals.merge(stockouts, on=["series_id", "period"], how="left", validate="one_to_one")
    totals["stockout_days"] = totals["stockout_days"].fillna(0.0)

    min_history = int(dict(granularity.split or {}).get("min_history_periods", max(granularity.lags)))
    lags = granularity.lags
    rolls = granularity.rolling_windows
    zero_window = int(granularity.zero_window)

    frames: list[pd.DataFrame] = []
    for series_id, group in totals.groupby("series_id", observed=True, sort=False):
        group = group.sort_values("period").set_index("period")
        # a missing week is a missing week (never interpolated); reindex keeps the position arithmetic honest
        group = group.reindex(pd.date_range(group.index.min(), group.index.max(), freq="W-MON"))
        usage = group["qty"].astype(float)
        stockout = group["stockout_days"].fillna(0.0)

        frame = pd.DataFrame(index=group.index)
        for lag in lags:
            frame[f"lag_{lag}w"] = usage.shift(lag - 1)          # lag_1w is the origin week itself
        for window in rolls:
            frame[f"roll_mean_{window}w"] = usage.rolling(window, min_periods=2).mean()
            frame[f"roll_std_{window}w"] = usage.rolling(window, min_periods=2).std()
        frame[f"roll_zero_share_{zero_window}"] = (
            (usage == 0).astype(float).rolling(zero_window, min_periods=4).mean()
        )
        positions = np.arange(len(usage))
        last_nonzero = pd.Series(np.where(usage.where(usage > 0).notna(), positions, np.nan),
                                 index=usage.index).ffill()
        frame["weeks_since_last_nonzero"] = positions - last_nonzero
        frame["stockout_days_4w"] = stockout.rolling(4, min_periods=1).sum()
        frame["item_te_mean"] = usage.expanding().mean()          # expanding, ends at the origin week
        frame["y_target"] = usage.shift(-1)
        frame["n_hist_weeks"] = positions + 1
        frame["series_id"] = series_id
        frame["origin_week"] = frame.index

        # rows need an observed origin week; training also needs the target, inference keeps the
        # latest origin whose target is still in the future. Long series also wait for the longest lag.
        if require_target:
            frame = frame.loc[frame["y_target"].notna() & usage.notna()]
        else:
            frame = frame.loc[usage.notna()]
        if len(usage) >= min_history:
            frame = frame.loc[frame["n_hist_weeks"] >= min_history]
        frames.append(frame)

    matrix = pd.concat(frames, ignore_index=True)
    matrix["target_week"] = matrix["origin_week"] + pd.Timedelta(weeks=1)

    # calendar describes the target week (deterministic, known in advance)
    calendar = weekly_calendar(cfg, sorted(matrix["target_week"].unique()))
    matrix = matrix.merge(calendar.rename_axis("target_week").reset_index(), on="target_week",
                          how="left", validate="many_to_one").drop(columns=["target_week"])

    flags = context_flags(cfg, pack.context_signal, sorted(matrix["origin_week"].unique()), key, context_rule)
    matrix = matrix.merge(flags.rename_axis("origin_week").reset_index(), on="origin_week",
                          how="left", validate="many_to_one")

    matrix = matrix.merge(_series_attributes(series), on="series_id", how="left", validate="many_to_one")

    matrix["split"] = _weekly_splits(matrix["origin_week"], cfg) if assign_splits else ""
    if assign_splits:
        # embargo weeks are labelled so they are visible, then dropped exactly like the committed matrix
        matrix = matrix.loc[matrix["split"] != "embargo"]

    matrix = matrix.rename(columns={"series_id": "hospital_drug_id"})
    return matrix.loc[:, list(schema.WEEKLY_FEATURES.columns)].reset_index(drop=True)


def _weekly_splits(origins: pd.Series, cfg: ForecastConfig) -> pd.Series:
    """Tail-period split with embargoes, matching the reference builder's rule."""
    settings = dict(cfg.granularity("WEEK").split or {})
    eval_periods = int(settings["eval_periods"])
    embargo = int(settings["embargo_periods"])
    week = pd.Timedelta(weeks=1)
    last = origins.max()
    test_start = last - (eval_periods - 1) * week
    valid_end = test_start - (embargo + 1) * week
    valid_start = valid_end - (eval_periods - 1) * week
    train_end = valid_start - (embargo + 1) * week
    labels = np.select(
        [origins >= test_start, (origins >= valid_start) & (origins <= valid_end), origins <= train_end],
        ["test", "valid", "train"], default="embargo")
    return pd.Series(labels, index=origins.index)


# ----------------------------------------------------------------------------------------------- monthly


def build_monthly(cfg: ForecastConfig, pack: data_loader.RawPack | None = None,
                  series: pd.DataFrame | None = None, context_rule: ContextRule = "known_at_origin",
                  assign_splits: bool = True, require_target: bool = True) -> pd.DataFrame:
    """Build the monthly matrix from the raw pack CSVs.

    The reference rule (monthly spec): keep calendar-complete months, drop the last month of every series
    (no target), and for series with at least ``max(lags)`` complete months drop the first ``max(lags)``
    months so the longest lag exists. Short series keep all their rows with NaN lags.

    Args:
        cfg: resolved configuration.
        pack: pre-loaded raw pack (loaded from disk when omitted).
        series: series inventory (built from ``pack`` when omitted).
        context_rule: event-flag knowledge rule.
        assign_splits: when False the split column is left empty (no-lookahead test).
        require_target: when True (training default) the last month of every series is dropped because its
            target month is not observed yet; inference passes False to keep that latest complete origin.
            Its ``y_target`` is NaN and every feature is built exactly as for the training rows.

    Returns:
        One row per series x origin month with the ``schema.MONTHLY_FEATURES`` column order.
    """
    key = "MONTH"
    pack = pack if pack is not None else data_loader.load_pack(cfg)
    series = series if series is not None else data_loader.enrich_series(pack, cfg)
    ids = clean.scope_ids(series)
    granularity = cfg.granularity(key)

    totals = period_usage(pack, ids, key)
    stockouts = period_stockout_days(pack, cfg, ids, key)
    totals = totals.merge(stockouts, on=["series_id", "period"], how="left", validate="one_to_one")
    totals["stockout_days"] = totals["stockout_days"].fillna(0.0)

    lags = granularity.lags
    rolls = granularity.rolling_windows
    zero_window = int(granularity.zero_window)
    min_history = int(max(lags))

    frames: list[pd.DataFrame] = []
    for series_id, group in totals.groupby("series_id", observed=True, sort=False):
        group = group.sort_values("period").set_index("period")
        usage = group["qty"].astype(float)
        stockout = group["stockout_days"].fillna(0.0)

        frame = pd.DataFrame(index=group.index)
        for lag in lags:
            frame[f"lag_{lag}m"] = usage.shift(lag - 1)          # lag_1m is the origin month itself
        for window in rolls:
            frame[f"roll_mean_{window}m"] = usage.rolling(window, min_periods=2).mean()
            frame[f"roll_std_{window}m"] = usage.rolling(window, min_periods=2).std()
        frame[f"roll_zero_share_{zero_window}m"] = (
            (usage == 0).astype(float).rolling(zero_window, min_periods=2).mean()
        )
        positions = np.arange(len(usage))
        last_nonzero = pd.Series(np.where(usage.where(usage > 0).notna(), positions, np.nan),
                                 index=usage.index).ffill()
        frame["months_since_last_nonzero"] = positions - last_nonzero
        frame["stockout_days_1m"] = stockout.rolling(1, min_periods=1).sum()
        frame["item_te_mean"] = usage.expanding().mean()          # expanding, ends at the origin month
        frame["y_target"] = usage.shift(-1)
        frame["series_id"] = series_id
        frame["origin_month"] = frame.index

        # training drops the last month (no target); inference keeps it. Long series also drop warm-up.
        usable = frame.iloc[:-1] if require_target else frame
        if len(group) >= min_history:
            usable = usable.iloc[min_history:]
        frames.append(usable)

    matrix = pd.concat(frames, ignore_index=True)

    target_month = pd.to_datetime(matrix["origin_month"]) + pd.offsets.MonthBegin(1)
    calendar = monthly_calendar(cfg, sorted(set(target_month)))
    matrix = matrix.merge(
        calendar.rename_axis("target_month").reset_index(),
        left_on=target_month, right_on="target_month", how="left", validate="many_to_one")
    matrix = matrix.drop(columns=["target_month"])

    flags = context_flags(cfg, pack.context_signal, sorted(matrix["origin_month"].unique()), key, context_rule)
    matrix = matrix.merge(flags.rename_axis("origin_month").reset_index(), on="origin_month",
                          how="left", validate="many_to_one")

    matrix = matrix.merge(_series_attributes(series), on="series_id", how="left", validate="many_to_one")

    if assign_splits:
        # embargo months stay in the matrix (they are part of the 17,763-row contract) but labelled
        # `embargo`, so no consumer can train or score on them by accident.
        matrix["split"] = _monthly_splits(matrix["origin_month"], cfg)
    else:
        matrix["split"] = ""

    matrix = matrix.rename(columns={"series_id": "hospital_drug_id"})
    return matrix.loc[:, list(schema.MONTHLY_FEATURES.columns)].reset_index(drop=True)


def _month_ranges(cfg: ForecastConfig) -> dict[str, tuple[pd.Period | None, pd.Period | None]]:
    """Parse the confirmed monthly split boundaries into periods."""
    settings = dict(cfg.granularity("MONTH").split or {})

    def period(value: str | None) -> pd.Period | None:
        return pd.Period(value, freq="M") if value else None

    return {
        "train": (None, period(settings["train_end"])),
        "valid": (period(settings["valid"][0]), period(settings["valid"][1])),
        "test": (period(settings["test"][0]), period(settings["test"][1])),
    }


def _monthly_splits(origins: pd.Series, cfg: ForecastConfig) -> pd.Series:
    """Assign train/valid/test from the configured month ranges; gap months are labelled ``embargo``."""
    ranges = _month_ranges(cfg)
    months = pd.PeriodIndex(pd.to_datetime(origins), freq="M")
    labels = np.full(len(months), "embargo", dtype=object)
    for split in ("train", "valid", "test"):
        low, high = ranges[split]
        inside = np.ones(len(months), dtype=bool)
        if low is not None:
            inside &= months >= low
        if high is not None:
            inside &= months <= high
        labels[inside] = split
    return pd.Series(labels, index=origins.index)


def monthly_split_stats(matrix: pd.DataFrame) -> dict:
    """Row/series counts and origin range per monthly split, plus the excluded (embargo) months."""
    stats: dict = {}
    for split, group in matrix.groupby("split", observed=True, sort=True):
        if split == "":
            continue
        stats[str(split)] = {
            "rows": int(len(group)),
            "series": int(group["hospital_drug_id"].nunique()),
            "origin_month_min": str(pd.Timestamp(group["origin_month"].min()).date()),
            "origin_month_max": str(pd.Timestamp(group["origin_month"].max()).date()),
        }
    return stats


# ------------------------------------------------------------------------------------------ reconciliation


def _mismatch_stats(left: pd.Series, right: pd.Series) -> dict:
    """Compare two aligned series: count, share and max absolute difference (NaN == NaN)."""
    left_null, right_null = left.isna(), right.isna()
    both_null = left_null & right_null
    if pd.api.types.is_numeric_dtype(left) and pd.api.types.is_numeric_dtype(right):
        delta = (left.astype(float) - right.astype(float)).abs()
        mismatch = ~both_null & ~np.isclose(left.astype(float), right.astype(float),
                                           rtol=RECONCILE_RTOL, atol=RECONCILE_ATOL, equal_nan=True)
        max_diff = float(np.nanmax(delta.to_numpy(dtype=float))) if (~both_null).any() else 0.0
        return {"mismatches": int(mismatch.sum()), "share": round(float(mismatch.mean()), 6),
                "max_abs_diff": None if np.isnan(max_diff) else round(max_diff, 12)}
    mismatch = ~both_null & (left.astype(str) != right.astype(str))
    return {"mismatches": int(mismatch.sum()), "share": round(float(mismatch.mean()), 6),
            "max_abs_diff": None}


def reconcile_weekly(committed: pd.DataFrame, rebuilt: pd.DataFrame,
                     keys: tuple[str, ...] = ("hospital_drug_id", "origin_week")) -> dict:
    """Compare a rebuilt weekly matrix against the committed CSV, column by column.

    Nothing is dropped silently: the report carries the outer-join size, rows present only on one side,
    split disagreements, and per-column mismatch counts with the worst example rows.
    """
    left = committed.copy()
    right = rebuilt.copy()
    for frame in (left, right):
        frame["origin_week"] = pd.to_datetime(frame["origin_week"])
    for column in keys:
        left[column] = left[column].astype(str)
        right[column] = right[column].astype(str)

    joined = left.merge(right, on=list(keys), how="outer", suffixes=("_committed", "_rebuilt"),
                        indicator=True, validate="one_to_one")
    both = joined.loc[joined["_merge"] == "both"]
    only_committed = joined.loc[joined["_merge"] == "left_only", list(keys)]
    only_rebuilt = joined.loc[joined["_merge"] == "right_only", list(keys)]

    compared = [column for column in schema.WEEKLY_FEATURES.columns if column not in keys]
    columns: dict[str, dict] = {}
    for column in compared:
        stats = _mismatch_stats(both[f"{column}_committed"], both[f"{column}_rebuilt"])
        if stats["mismatches"]:
            flagged = ~np.isclose(both[f"{column}_committed"].astype(float),
                                  both[f"{column}_rebuilt"].astype(float),
                                  rtol=RECONCILE_RTOL, atol=RECONCILE_ATOL, equal_nan=True) \
                if pd.api.types.is_numeric_dtype(both[f"{column}_committed"]) else \
                both[f"{column}_committed"].astype(str) != both[f"{column}_rebuilt"].astype(str)
            sample = both.loc[flagged, list(keys)].head(3).astype(str).to_dict(orient="records")
            stats["examples"] = sample
        columns[column] = stats

    total_mismatches = sum(stats["mismatches"] for stats in columns.values())
    return {
        "rows_committed": int(len(left)),
        "rows_rebuilt": int(len(right)),
        "rows_joined": int(len(both)),
        "rows_only_committed": int(len(only_committed)),
        "rows_only_rebuilt": int(len(only_rebuilt)),
        "only_committed_examples": only_committed.head(5).astype(str).to_dict(orient="records"),
        "only_rebuilt_examples": only_rebuilt.head(5).astype(str).to_dict(orient="records"),
        "columns_total": len(compared),
        "columns_exact": int(sum(stats["mismatches"] == 0 for stats in columns.values())),
        "total_mismatches": int(total_mismatches),
        "columns": columns,
    }


def compare_context(committed: pd.DataFrame, rebuilt: pd.DataFrame, cfg: ForecastConfig,
                    keys: tuple[str, ...] = ("hospital_drug_id", "origin_week")) -> dict:
    """Quantify every context-flag variant against the committed (target-week) flags.

    Args:
        committed: committed weekly matrix (carries the reference target-week flags).
        rebuilt: rebuilt matrix under the canonical ``known_at_origin`` rule.
        cfg: configuration (flag columns and split labels).
        keys: join keys.

    Returns:
        Per-flag counts overall and per split: disagreements, direction, and the leak rate relative to
        the committed flags.
    """
    flags = list(dict(cfg.context_flags["signals"]).values())
    time_column = keys[-1]
    left = committed.copy()
    right = rebuilt.copy()
    for frame in (left, right):
        frame[time_column] = pd.to_datetime(frame[time_column])
    joined = left.merge(right, on=list(keys), how="inner", suffixes=("_committed", "_rebuilt"),
                        validate="one_to_one")
    report: dict = {"rule": "known_at_origin", "flags": {}, "rows_compared": int(len(joined))}
    for column in flags:
        committed_flag = joined[f"{column}_committed"].astype(int)
        rebuilt_flag = joined[f"{column}_rebuilt"].astype(int)
        differs = committed_flag != rebuilt_flag
        entry = {
            "rows": int(len(joined)),
            "committed_positive": int(committed_flag.sum()),
            "rebuilt_positive": int(rebuilt_flag.sum()),
            "disagreements": int(differs.sum()),
            "disagreement_share": round(float(differs.mean()), 6),
            "leak_rows_committed_only": int(((committed_flag == 1) & (rebuilt_flag == 0)).sum()),
            "rebuilt_only": int(((committed_flag == 0) & (rebuilt_flag == 1)).sum()),
            "by_split": {},
        }
        for split, group in joined.groupby("split_committed", observed=True, sort=True):
            subset = differs.loc[group.index]
            entry["by_split"][str(split)] = {
                "rows": int(len(group)),
                "disagreements": int(subset.sum()),
                "disagreement_share": round(float(subset.mean()), 6) if len(group) else None,
            }
        report["flags"][column] = entry
    return report


# ----------------------------------------------------------------------------------------------- reporting


def build_all(cfg: ForecastConfig, pack: data_loader.RawPack | None = None,
              series: pd.DataFrame | None = None, write: bool = True) -> dict:
    """Build both matrices, verify the weekly rebuild and write the feature reports.

    Args:
        cfg: resolved configuration.
        pack: pre-loaded raw pack (loaded from disk when omitted).
        series: series inventory (built from ``pack`` when omitted).
        write: write parquet matrices (gitignored) and ``reports/feature_build.*``.

    Returns:
        Report dict with the reconciliation, the context-flag comparison, monthly stats and the
        expectation checks (``all_passed`` is False when a confirmed number does not match).
    """
    pack = pack if pack is not None else data_loader.load_pack(cfg)
    series = series if series is not None else data_loader.enrich_series(pack, cfg)
    committed = data_loader.load_weekly_features(cfg)

    weekly_reference = build_weekly(cfg, pack, series, context_rule="target_period_all")
    weekly = build_weekly(cfg, pack, series, context_rule="known_at_origin")
    weekly_origin_active = build_weekly(cfg, pack, series, context_rule="origin_active")
    reconciliation = reconcile_weekly(committed, weekly_reference)
    # canonical (known at origin) vs committed, then the alternative origin-active reading
    weekly_context = compare_context(committed, weekly, cfg)
    weekly_context_alternative = compare_context(committed, weekly_origin_active, cfg)

    monthly = build_monthly(cfg, pack, series, context_rule="known_at_origin")
    monthly_reference = build_monthly(cfg, pack, series, context_rule="target_period_all")
    monthly_context = compare_context(monthly_reference, monthly, cfg, keys=("hospital_drug_id", "origin_month"))

    expectations = cfg.expectations
    weekly_splits = {str(k): int(v) for k, v in weekly["split"].value_counts().items()}
    monthly_rows = int(len(monthly))
    series_in_scope = len(clean.scope_ids(series))
    series_with_rows = int(monthly["hospital_drug_id"].nunique())
    origin_min = str(pd.Timestamp(monthly["origin_month"].min()).date())
    origin_max = str(pd.Timestamp(monthly["origin_month"].max()).date())

    checks = {
        "weekly_rows": _check(len(weekly) == int(expectations["weekly_rows"]), len(weekly),
                              int(expectations["weekly_rows"])),
        "weekly_split_counts": _check(
            weekly_splits == {k: int(v) for k, v in expectations["weekly_split_counts"].items()},
            weekly_splits, dict(expectations["weekly_split_counts"])),
        "weekly_reconciliation_exact": _check(
            reconciliation["total_mismatches"] == 0 and reconciliation["rows_joined"] == len(committed)
            and reconciliation["rows_only_committed"] == 0 and reconciliation["rows_only_rebuilt"] == 0,
            {"mismatches": reconciliation["total_mismatches"], "joined": reconciliation["rows_joined"]},
            {"mismatches": 0, "joined": int(len(committed))}),
        "monthly_rows": _check(monthly_rows == int(expectations["monthly_rows"]), monthly_rows,
                               int(expectations["monthly_rows"])),
        # 173 is the *scope* count (config expectations.modelled_series). Only 167 of them can carry a
        # monthly row: six cold-start series have a single complete month (2026-09), so the drop-the-last-
        # month rule leaves no target. Both numbers are reported; only the scope count is a contract.
        "monthly_series_in_scope": _check(series_in_scope == int(expectations["modelled_series"]),
                                          series_in_scope, int(expectations["modelled_series"])),
        "monthly_origin_range": _check(
            origin_min == expectations["monthly_origin_month_min"]
            and origin_max == expectations["monthly_origin_month_max"],
            [origin_min, origin_max],
            [expectations["monthly_origin_month_min"], expectations["monthly_origin_month_max"]]),
        "monthly_split_months": _check(
            sorted(monthly.loc[monthly["split"] == "embargo", "origin_month"].dt.strftime("%Y-%m").unique())
            == ["2024-07", "2025-08"],
            sorted(monthly.loc[monthly["split"] == "embargo", "origin_month"].dt.strftime("%Y-%m").unique()),
            ["2024-07", "2025-08"]),
    }

    report = {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
        "weekly": {
            "rows": int(len(weekly)),
            "series": int(weekly["hospital_drug_id"].nunique()),
            "splits": weekly_splits,
            "origin_range": [str(pd.Timestamp(weekly["origin_week"].min()).date()),
                             str(pd.Timestamp(weekly["origin_week"].max()).date())],
            "context_rule": "known_at_origin",
            "reconciliation": reconciliation,
            "context_comparison": weekly_context,
            "context_comparison_origin_active": weekly_context_alternative,
        },
        "monthly": {
            "rows": monthly_rows,
            "series_in_scope": series_in_scope,
            "series_with_rows": series_with_rows,
            "series_without_rows": series_in_scope - series_with_rows,
            "series_without_rows_reason": "single complete month (2026-09) -> no target month after dropping "
                                          "the last month; kept in scope for the weekly model",
            "splits": monthly_split_stats(monthly),
            "origin_range": [origin_min, origin_max],
            "context_rule": "known_at_origin",
            "context_comparison": monthly_context,
        },
        "expectations": checks,
        "all_passed": all(check["passed"] for check in checks.values()),
    }

    if write:
        derived = ensure_dir(cfg.derived_dir)
        weekly_path = derived / "weekly_features.parquet"
        monthly_path = derived / "monthly_features.parquet"
        weekly.to_parquet(weekly_path, index=False)
        monthly.to_parquet(monthly_path, index=False)
        report["paths"] = {"weekly": str(weekly_path), "monthly": str(monthly_path)}
        report["paths"].update({name: str(path) for name, path in write_feature_reports(cfg, report).items()})
    report["summary_text"] = render_feature_console(report)
    return report


def _check(passed: bool, actual, expected) -> dict:
    """One expectation check (actual is reported verbatim, never adjusted to pass)."""
    return {"passed": bool(passed), "actual": actual, "expected": expected}


def render_feature_console(report: dict) -> str:
    """Console summary of the feature build and its checks."""
    weekly, monthly = report["weekly"], report["monthly"]
    reconciliation = weekly["reconciliation"]
    lines = [
        "F1 feature build (mock pack)",
        f"weekly: {weekly['rows']:,} rows / {weekly['series']} series / splits {weekly['splits']} "
        f"/ {weekly['origin_range'][0]} -> {weekly['origin_range'][1]}",
        f"weekly reconciliation: joined {reconciliation['rows_joined']:,} of {reconciliation['rows_committed']:,} "
        f"committed rows; only committed {reconciliation['rows_only_committed']}, "
        f"only rebuilt {reconciliation['rows_only_rebuilt']}; "
        f"{reconciliation['columns_exact']}/{reconciliation['columns_total']} columns exact, "
        f"{reconciliation['total_mismatches']} value mismatches",
        f"ctx flags (known_at_origin vs committed target-week): "
        + ", ".join(f"{name} {entry['disagreements']}" for name, entry in weekly["context_comparison"]["flags"].items()),
        f"monthly: {monthly['rows']:,} rows / {monthly['series_with_rows']} series with rows "
        f"({monthly['series_without_rows']} of {monthly['series_in_scope']} have no usable target month) "
        f"/ {monthly['origin_range'][0]} -> {monthly['origin_range'][1]}",
        f"monthly splits: {monthly['splits']}",
        "",
        "checks:",
    ]
    for name, check in report["expectations"].items():
        lines.append(f"  [{'PASS' if check['passed'] else 'FAIL'}] {name}: actual={check['actual']} "
                     f"expected={check['expected']}")
    lines.append(f"  all_passed={report['all_passed']}")
    return "\n".join(lines)


def write_feature_reports(cfg: ForecastConfig, report: dict) -> dict[str, Path]:
    """Write ``reports/feature_build.json`` and ``reports/feature_build.md``."""
    reports_dir = ensure_dir(cfg.reports_dir)
    json_path = reports_dir / "feature_build.json"
    markdown_path = reports_dir / "feature_build.md"
    json_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    markdown_path.write_text(render_feature_markdown(report), encoding="utf-8")
    return {"json": json_path, "markdown": markdown_path}


def render_feature_markdown(report: dict) -> str:
    """Committed markdown: reconciliation table (every mismatch), context comparison, monthly checks."""
    weekly, monthly = report["weekly"], report["monthly"]
    reconciliation = weekly["reconciliation"]
    lines = [
        "# Feature build (Phase 3)",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "## Weekly rebuild vs committed matrix",
        "",
        f"- rows: committed {reconciliation['rows_committed']:,} / rebuilt {reconciliation['rows_rebuilt']:,} "
        f"/ joined {reconciliation['rows_joined']:,}",
        f"- rows only in the committed file: {reconciliation['rows_only_committed']}; "
        f"only in the rebuild: {reconciliation['rows_only_rebuilt']}",
        f"- columns compared: {reconciliation['columns_total']}; exact: {reconciliation['columns_exact']}; "
        f"value mismatches: {reconciliation['total_mismatches']}",
        "",
        "| column | mismatches | share | max abs diff |",
        "|---|---|---|---|",
    ]
    for column, stats in reconciliation["columns"].items():
        lines.append(f"| {column} | {stats['mismatches']} | {stats['share']} | {stats['max_abs_diff']} |")
    lines += ["", "## Context flags: known_at_origin vs committed (target week)", "",
              "| flag | committed=1 | rebuilt=1 | disagreements | share | committed-only (leak) | rebuilt-only |",
              "|---|---|---|---|---|---|---|"]
    for name, entry in weekly["context_comparison"]["flags"].items():
        lines.append(f"| {name} | {entry['committed_positive']:,} | {entry['rebuilt_positive']:,} | "
                     f"{entry['disagreements']:,} | {entry['disagreement_share']} | "
                     f"{entry['leak_rows_committed_only']:,} | {entry['rebuilt_only']:,} |")
    lines += ["", "### Alternative reading: event active at the origin (current context, not target period)", "",
              "| flag | committed=1 | active-at-origin=1 | disagreements | share | committed-only | active-only |",
              "|---|---|---|---|---|---|---|"]
    for name, entry in weekly["context_comparison_origin_active"]["flags"].items():
        lines.append(f"| {name} | {entry['committed_positive']:,} | {entry['rebuilt_positive']:,} | "
                     f"{entry['disagreements']:,} | {entry['disagreement_share']} | "
                     f"{entry['leak_rows_committed_only']:,} | {entry['rebuilt_only']:,} |")
    lines += ["", "## Monthly matrix", "",
              f"- rows: {monthly['rows']:,}; series in scope: {monthly['series_in_scope']}; "
              f"series with at least one row: {monthly['series_with_rows']}",
              f"- origin months: {monthly['origin_range'][0]} -> {monthly['origin_range'][1]}",
              "", "| split | rows | series | first origin | last origin |", "|---|---|---|---|---|"]
    for split, stats in monthly["splits"].items():
        lines.append(f"| {split} | {stats['rows']:,} | {stats['series']} | {stats['origin_month_min']} | "
                     f"{stats['origin_month_max']} |")
    lines += ["", "### Monthly context flags (known_at_origin vs pack target-month variant)", "",
              "| flag | pack-variant=1 | known-at-origin=1 | disagreements | share |", "|---|---|---|---|---|"]
    for name, entry in monthly["context_comparison"]["flags"].items():
        lines.append(f"| {name} | {entry['committed_positive']:,} | {entry['rebuilt_positive']:,} | "
                     f"{entry['disagreements']:,} | {entry['disagreement_share']} |")
    lines += ["", "## Expectation checks", ""]
    for name, check in report["expectations"].items():
        lines.append(f"- {'PASS' if check['passed'] else 'FAIL'} `{name}`: actual `{check['actual']}` "
                     f"vs expected `{check['expected']}`")
    lines += ["", "## Notes", "",
              "- `lag_1w` / `lag_1m` is the origin period itself (the reference builder's convention), so the "
              "forecast instant is the end of the origin period; that is why context flags use the origin "
              "period end as the knowledge cutoff.",
              "- The six series without monthly rows have history only in the final month (2026-09), so no "
              "complete target month exists; they stay in scope for the weekly model.",
              "- MOCK DATA: row counts and flags describe the generator, not real events.", ""]
    return "\n".join(lines)
