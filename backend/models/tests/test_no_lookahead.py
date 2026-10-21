"""No-lookahead proofs: every feature of a row is reproducible from data at or before its origin.

Three independent checks:

1. **From the raw daily data.** For sampled series, the matrix values are recomputed from ``usage_daily``
   alone (weekly sums, expanding mean, rolling means) and must match row by row. This is the same thing an
   auditor would do, not a comparison against the builder that produced the matrix.
2. **Future removal.** Rebuilding from a pack truncated at a cutoff (usage, snapshots *and* context-signal
   records created after it removed) must leave every feature of every earlier row unchanged. If any
   column -- including the context flags and ``item_te_mean`` -- used later data, the value would move.
3. **``item_te_mean`` explicitly.** It must equal the expanding mean up to and including the origin period,
   and must differ from a mean that includes the target period (otherwise the check would prove nothing).
"""

from __future__ import annotations

import pandas as pd
import pytest

from f1_forecast import clean, data_loader, features

FEATURE_EXCLUSIONS = ("split",)
ID_COLUMNS = ("hospital_drug_id", "origin_week")


def _truncate(pack: data_loader.RawPack, cutoff: pd.Timestamp) -> data_loader.RawPack:
    """Pack with every table cut at ``cutoff`` (context rows by their ``created_at`` timestamp)."""
    cutoff = pd.Timestamp(cutoff)
    created = pd.to_datetime(pack.context_signal["created_at"], utc=True).dt.tz_convert("Asia/Bangkok")
    created = created.dt.tz_localize(None)
    return data_loader.RawPack(
        usage_daily=pack.usage_daily.loc[pack.usage_daily["usage_date"] <= cutoff],
        stock_snapshot=pack.stock_snapshot.loc[pack.stock_snapshot["snap_date"] <= cutoff],
        hospital_drug=pack.hospital_drug,
        drug_master=pack.drug_master,
        hospital=pack.hospital,
        context_signal=pack.context_signal.loc[created <= cutoff],
    )


def _assert_frames_match(full: pd.DataFrame, truncated: pd.DataFrame, keys: list[str],
                         columns: list[str]) -> None:
    """Inner-join on keys and assert every compared column is identical (no NaN tolerance games)."""
    merged = full.merge(truncated, on=keys, suffixes=("_full", "_trunc"), how="inner",
                        validate="one_to_one")
    assert len(merged) > 0, "truncated rebuild shares no rows with the full rebuild"
    for column in columns:
        left = merged[f"{column}_full"]
        right = merged[f"{column}_trunc"]
        if pd.api.types.is_numeric_dtype(left):
            pd.testing.assert_series_equal(left.reset_index(drop=True).astype(float),
                                           right.reset_index(drop=True).astype(float),
                                           check_names=False, check_exact=False, rtol=0, atol=1e-12)
        else:
            assert left.reset_index(drop=True).equals(right.reset_index(drop=True)), column


# ----------------------------------------------------------------------------------------------- weekly


def test_weekly_rows_rebuild_from_raw_daily_usage(cfg, pack, series):
    """Sample weekly rows must equal values recomputed from ``usage_daily`` alone."""
    ids = sorted(clean.scope_ids(series))[:2]
    matrix = features.build_weekly(cfg, pack, series, assign_splits=False)

    for series_id in ids:
        usage = pack.usage_daily.loc[pack.usage_daily["hospital_drug_id"] == series_id]
        usage = usage.assign(week=usage["usage_date"].dt.to_period("W-SUN").dt.start_time)
        weekly_sum = usage.groupby("week", observed=True)["qty_used"].sum()
        weekly_count = usage.groupby("week", observed=True)["qty_used"].size()
        complete = weekly_sum.loc[weekly_count == 7].sort_index()
        assert len(complete) > 60

        rows = matrix.loc[matrix["hospital_drug_id"] == series_id].reset_index(drop=True)
        assert len(rows) > 30
        step = max(1, len(rows) // 10)
        for _, row in rows.iloc[::step].iterrows():
            origin = pd.Timestamp(row["origin_week"])
            history = complete.loc[:origin]
            assert row["lag_1w"] == pytest.approx(history.iloc[-1])
            assert row["roll_mean_4w"] == pytest.approx(history.iloc[-4:].mean())
            assert row["roll_mean_26w"] == pytest.approx(history.iloc[-26:].mean())
            assert row["item_te_mean"] == pytest.approx(history.mean())
            # the target really is the *next* complete week
            if origin + pd.Timedelta(weeks=1) in complete.index:
                assert row["y_target"] == pytest.approx(complete.loc[origin + pd.Timedelta(weeks=1)])


def test_weekly_features_are_unchanged_when_future_data_is_removed(cfg, pack, series):
    """Truncating usage, snapshots and post-cutoff context records must not move any earlier feature."""
    full = features.build_weekly(cfg, pack, series, assign_splits=False)
    cutoff = pd.Timestamp("2024-01-01")  # a Monday, so the boundary is unambiguous
    truncated = features.build_weekly(cfg, _truncate(pack, cutoff), series, assign_splits=False)

    # keep rows whose *target* week closed before the cutoff: those rows cannot see anything later
    mask = full["origin_week"] + pd.Timedelta(weeks=1) <= cutoff
    columns = [column for column in full.columns if column not in FEATURE_EXCLUSIONS + ID_COLUMNS]
    assert set(full.columns) == set(truncated.columns)
    _assert_frames_match(full.loc[mask], truncated, list(ID_COLUMNS), columns)


def test_item_te_mean_excludes_the_target_week(cfg, pack, series):
    """``item_te_mean`` is the expanding mean up to the origin and would differ if it used the target."""
    ids = sorted(clean.scope_ids(series))[:1]
    matrix = features.build_weekly(cfg, pack, series, assign_splits=False)
    rows = matrix.loc[matrix["hospital_drug_id"] == ids[0]].reset_index(drop=True)
    assert len(rows) > 60

    # the expanding mean starts at the series' first week, including the warm-up weeks the matrix drops
    totals = clean.period_totals(pack.usage_daily, ids, "WEEK").set_index("period")["qty"].sort_index()
    last = rows.iloc[-1]
    origin = pd.Timestamp(last["origin_week"])
    history = totals.loc[:origin]
    including_target = pd.concat([history, totals.loc[origin + pd.Timedelta(weeks=1):].iloc[:1]])

    assert last["item_te_mean"] == pytest.approx(history.mean())
    assert last["item_te_mean"] != pytest.approx(including_target.mean())


# ---------------------------------------------------------------------------------------------- monthly


def test_monthly_rows_rebuild_from_raw_daily_usage(cfg, pack, series):
    """Monthly totals and the expanding mean must equal a direct monthly sum of the raw daily rows."""
    ids = sorted(clean.scope_ids(series))[:2]
    matrix = features.build_monthly(cfg, pack, series, assign_splits=False)

    for series_id in ids:
        usage = pack.usage_daily.loc[pack.usage_daily["hospital_drug_id"] == series_id]
        usage = usage.assign(month=usage["usage_date"].dt.to_period("M").dt.to_timestamp())
        grouped = usage.groupby("month", observed=True)["qty_used"].agg(["sum", "size"])
        complete = grouped.loc[grouped["size"] == grouped.index.days_in_month, "sum"].sort_index()
        assert len(complete) > 12

        rows = matrix.loc[matrix["hospital_drug_id"] == series_id].reset_index(drop=True)
        assert len(rows) > 12
        step = max(1, len(rows) // 8)
        for _, row in rows.iloc[::step].iterrows():
            origin = pd.Timestamp(row["origin_month"])
            history = complete.loc[:origin]
            assert row["lag_1m"] == pytest.approx(history.iloc[-1])
            assert row["item_te_mean"] == pytest.approx(history.mean())
            if origin + pd.offsets.MonthBegin(1) in complete.index:
                assert row["y_target"] == pytest.approx(complete.loc[origin + pd.offsets.MonthBegin(1)])


def test_monthly_features_are_unchanged_when_future_data_is_removed(cfg, pack, series):
    """Same future-removal proof for the monthly matrix."""
    full = features.build_monthly(cfg, pack, series, assign_splits=False)
    cutoff = pd.Timestamp("2023-06-30")
    truncated = features.build_monthly(cfg, _truncate(pack, cutoff), series, assign_splits=False)

    # the row's target month must end before the cutoff
    target_end = (pd.to_datetime(full["origin_month"]) + pd.offsets.MonthBegin(1)) + pd.offsets.MonthEnd(1)
    mask = target_end <= cutoff
    keys = ("hospital_drug_id", "origin_month")
    columns = [column for column in full.columns if column not in FEATURE_EXCLUSIONS + keys]
    assert set(full.columns) == set(truncated.columns)
    _assert_frames_match(full.loc[mask], truncated, list(keys), columns)


def test_known_at_origin_flags_ignore_later_context_records(cfg, pack, series):
    """A flag at the origin cannot depend on a signal record created after the origin period ended.

    The truncated pack has every context row created after the cutoff removed, so any flag that had used
    one of those rows would change. Equality proves the knowledge cutoff is honoured.
    """
    signals = pack.context_signal
    later = pd.to_datetime(signals["created_at"], utc=True).dt.tz_localize(None) > pd.Timestamp("2024-01-01")
    assert later.any(), "test needs at least one context record created after the cutoff"

    cutoff = pd.Timestamp("2024-01-01")
    full = features.build_weekly(cfg, pack, series, assign_splits=False)
    truncated = features.build_weekly(cfg, _truncate(pack, cutoff), series, assign_splits=False)
    flags = list(dict(cfg.context_flags["signals"]).values())
    mask = full["origin_week"] + pd.Timedelta(weeks=1) <= cutoff
    _assert_frames_match(full.loc[mask], truncated, ["hospital_drug_id", "origin_week"], flags)
