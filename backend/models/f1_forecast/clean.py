"""Series scope, cold-start detection, censoring statistics and monthly aggregation.

Scope rules (confirmed): the pack holds 191 ``hospital_drug`` listings; 3 blood products are dropped
by design and 15 listings are VED = D with a low price (the F-02 Min-Max rule), leaving **173**
modelled series. The same rules must be applied explicitly to the monthly build, because the joined
daily view (``f1_daily.csv``) only removes the 3 blood products.
"""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from f1_forecast.config import ForecastConfig


def next_period_start(origin: pd.Series, granularity: str) -> pd.Series:
    """Return the period immediately after ``origin`` (the forecast horizon start).

    Args:
        origin: origin period start dates (Monday for WEEK, first of month for MONTH).
        granularity: ``WEEK`` or ``MONTH``.

    Returns:
        ``origin + 7 days`` for WEEK, ``first day of the next month`` for MONTH.
    """
    key = granularity.upper()
    values = pd.to_datetime(origin)
    if key == "WEEK":
        return values + pd.Timedelta(days=7)
    if key == "MONTH":
        return values + pd.offsets.MonthBegin(1)
    raise ValueError(f"unsupported granularity {granularity!r}")


def period_totals(usage_daily: pd.DataFrame, ids: Iterable[str], granularity: str,
                  min_days_per_period: int = 7) -> pd.DataFrame:
    """Aggregate daily usage into complete periods (WEEK: 7-day weeks; MONTH: calendar-complete months).

    A period is kept only when it holds every expected day for that series -- partial first/last periods
    are dropped instead of being scaled, so no period is silently under-counted.

    Args:
        usage_daily: frame with ``hospital_drug_id``, ``usage_date``, ``qty_used``.
        ids: series ids in scope.
        granularity: ``WEEK`` (Monday-based) or ``MONTH``.
        min_days_per_period: days required for WEEK periods (7).

    Returns:
        One row per series x period with ``series_id``, ``period``, ``qty`` and ``n_days``.
    """
    if granularity.upper() == "MONTH":
        monthly = monthly_aggregate(usage_daily, ids)
        return (monthly.rename(columns={"hospital_drug_id": "series_id", "origin_month": "period",
                                        "qty_used": "qty"})
                .loc[:, ["series_id", "period", "qty", "n_days"]])
    usage = restrict_to_scope(usage_daily, ids)
    usage = usage.assign(period=usage["usage_date"].dt.to_period("W-SUN").dt.start_time)
    weekly = (usage.groupby(["hospital_drug_id", "period"], observed=True)
              .agg(qty=("qty_used", "sum"), n_days=("usage_date", "size"))
              .reset_index()
              .rename(columns={"hospital_drug_id": "series_id"}))
    complete = weekly.loc[weekly["n_days"] == min_days_per_period]
    return complete.sort_values(["series_id", "period"]).reset_index(drop=True)


def series_scope_counts(series: pd.DataFrame) -> dict[str, int]:
    """Count the series inventory: total, blood, Min-Max and in-scope."""
    return {
        "hospital_drug_rows": int(len(series)),
        "blood_products": int(series["is_blood_product"].sum()),
        "min_max": int(series["is_min_max"].sum()),
        "non_blood": int((~series["is_blood_product"]).sum()),
        "in_scope": int(series["in_scope"].sum()),
    }


def scope_ids(series: pd.DataFrame) -> list[str]:
    """Return the ``hospital_drug_id`` values of the modelled series (173 rows)."""
    return series.loc[series["in_scope"], "hospital_drug_id"].tolist()


def cold_start_ids(day_counts: pd.DataFrame, cfg: ForecastConfig) -> list[str]:
    """Return series ids whose whole history is shorter than the cold-start threshold."""
    limit = int(cfg.series_scope["cold_start_max_history_days"])
    return day_counts.loc[day_counts["n_days"] <= limit, "hospital_drug_id"].tolist()


def restrict_to_scope(frame: pd.DataFrame, ids: Iterable[str], id_column: str = "hospital_drug_id") -> pd.DataFrame:
    """Return the rows of ``frame`` whose ``id_column`` is in ``ids``."""
    wanted = set(ids)
    return frame.loc[frame[id_column].isin(wanted)].reset_index(drop=True)


def monthly_aggregate(usage_daily: pd.DataFrame, ids: Iterable[str]) -> pd.DataFrame:
    """Aggregate daily usage into calendar months, keeping only calendar-complete months.

    A month is complete when it has exactly ``days_in_month`` daily rows for that series (the generator
    writes a row for every day, including zeros, so a missing row means the series did not exist yet).

    Args:
        usage_daily: frame with ``hospital_drug_id``, ``usage_date``, ``qty_used``.
        ids: series ids to keep (the modelled scope).

    Returns:
        One row per series x complete month with ``origin_month`` (first day of the month),
        ``qty_used`` (sum), ``n_days`` and ``expected_days``, sorted by series and month.
    """
    usage = restrict_to_scope(usage_daily, ids)
    monthly = (
        usage.assign(origin_month=usage["usage_date"].dt.to_period("M").dt.to_timestamp())
        .groupby(["hospital_drug_id", "origin_month"], observed=True)
        .agg(qty_used=("qty_used", "sum"), n_days=("usage_date", "size"))
        .reset_index()
    )
    monthly["expected_days"] = monthly["origin_month"].dt.days_in_month
    complete = monthly.loc[monthly["n_days"] == monthly["expected_days"]].copy()
    return complete.sort_values(["hospital_drug_id", "origin_month"]).reset_index(drop=True)


def project_monthly_rows(monthly: pd.DataFrame, cfg: ForecastConfig) -> dict[str, object]:
    """Count the monthly training rows the confirmed build rule produces.

    Rule (monthly spec): drop the last complete month of every series (no target available) and, for
    series with at least ``min_history_months`` complete months, drop the first ``min_history_months``
    months so that the longest lag can be computed. Short (cold-start) series keep all their rows with
    NaN lags.

    Returns:
        Counts plus the resulting ``origin_month`` range, for the Phase 1 acceptance check.
    """
    min_history_months = max(cfg.granularity("MONTH").lags)
    rows = 0
    starts: list[pd.Timestamp] = []
    ends: list[pd.Timestamp] = []
    for _, group in monthly.groupby("hospital_drug_id", observed=True):
        months = group["origin_month"].sort_values().tolist()
        if not months:
            continue
        usable = months[:-1]
        if len(months) >= min_history_months:
            usable = usable[min_history_months:]
        if not usable:
            continue
        rows += len(usable)
        starts.append(min(usable))
        ends.append(max(usable))
    return {
        "rows": rows,
        "series": int(monthly["hospital_drug_id"].nunique()),
        "min_history_months": min_history_months,
        "origin_month_min": str(min(starts).date()) if starts else None,
        "origin_month_max": str(max(ends).date()) if ends else None,
    }


def stockout_days_by_series(stock_snapshot: pd.DataFrame, ids: Iterable[str], threshold: float) -> pd.DataFrame:
    """Count days with unusable stock per series (``qty_on_hand`` <= ``threshold``).

    Args:
        stock_snapshot: frame with ``hospital_drug_id``, ``snap_date``, ``qty_on_hand``.
        ids: series ids to keep.
        threshold: on-hand value at or below which the day counts as a stock-out day.

    Returns:
        Per-series ``n_days``, ``stockout_days`` and ``stockout_share``.
    """
    snapshot = restrict_to_scope(stock_snapshot, ids)
    flagged = snapshot.assign(is_stockout=(snapshot["qty_on_hand"] <= threshold).astype(int))
    return (
        flagged.groupby("hospital_drug_id", observed=True)
        .agg(n_days=("snap_date", "size"), stockout_days=("is_stockout", "sum"))
        .assign(stockout_share=lambda frame: frame["stockout_days"] / frame["n_days"])
        .reset_index()
    )
