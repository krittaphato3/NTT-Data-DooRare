"""Data-quality validation for the F1 quantile module (Phase 1 gate).

Runs every contract check that the later phases rely on, writes
``backend/models/reports/data_quality.json`` plus a short markdown summary, and exits non-zero when
anything fails. Nothing here modifies the input files: everything is read-only.

Checks are grouped by source:

* raw pack tables -- shape, key uniqueness, ranges, censoring statistics;
* series inventory -- 191 listings -> 3 blood -> 15 Min-Max -> **173 modelled series**;
* identity -- ``(hospital_code, item_code)`` <-> ``hospital_drug_id`` 1:1 crosswalk for the daily view;
* cross-file consistency -- the joined daily view must reconcile with ``usage_daily`` / ``stock_snapshot``;
* the committed weekly matrix -- counts, splits, missingness, and a target spot-reconciliation
  recomputed from the raw daily table;
* a projected monthly build -- 17,763 rows over origin_month 2017-10 -> 2026-08.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from f1_forecast import clean, data_loader, schema
from f1_forecast.config import ForecastConfig, ensure_dir

PASS, FAIL, WARN = "PASS", "FAIL", "WARN"


@dataclass
class Check:
    """One validation result."""

    name: str
    status: str
    detail: str
    metrics: dict = field(default_factory=dict)


def _result(name: str, ok: bool | None, detail: str, metrics: dict | None = None) -> Check:
    """Build a :class:`Check`; ``ok=None`` marks an informational (WARN) result."""
    status = WARN if ok is None else (PASS if ok else FAIL)
    return Check(name=name, status=status, detail=detail, metrics=metrics or {})


def check_usage_daily(usage: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """Shape, key uniqueness and range checks for ``usage_daily``."""
    rows = len(usage)
    duplicates = int(usage.duplicated(subset=list(("hospital_id", "hospital_drug_id", "usage_date"))).sum())
    negative = int((usage["qty_used"] < 0).sum())
    zero_days = int((usage["qty_used"] == 0).sum())
    series_count = int(usage["hospital_drug_id"].nunique())
    metrics = {
        "rows": rows,
        "series": series_count,
        "duplicate_keys": duplicates,
        "negative_qty": negative,
        "zero_days": zero_days,
        "zero_share": round(zero_days / rows, 6),
        "date_min": str(usage["usage_date"].min().date()),
        "date_max": str(usage["usage_date"].max().date()),
        "qty_used_sum": float(usage["qty_used"].sum()),
        "expected_rows": int(cfg.expectations["usage_daily_rows"]),
    }
    ok = duplicates == 0 and negative == 0 and rows == int(cfg.expectations["usage_daily_rows"])
    return _result("usage_daily.keys_and_ranges", ok,
                   f"{rows:,} rows (expected {int(cfg.expectations['usage_daily_rows']):,}), {series_count} series, "
                   f"{duplicates} duplicate keys, {negative} negative quantities",
                   metrics)


def check_stock_snapshot(snapshot: pd.DataFrame, threshold: float, cfg: ForecastConfig) -> Check:
    """Stock-state checks: key uniqueness plus the censoring signal (days with unusable stock)."""
    rows = len(snapshot)
    duplicates = int(snapshot.duplicated(subset=["hospital_id", "hospital_drug_id", "snap_date"]).sum())
    stockout_days = int((snapshot["qty_on_hand"] <= threshold).sum())
    negative_on_hand = int((snapshot["qty_on_hand"] < 0).sum())
    metrics = {
        "rows": rows,
        "duplicate_keys": duplicates,
        "stockout_days": stockout_days,
        "stockout_share": round(stockout_days / rows, 6),
        "negative_on_hand": negative_on_hand,
        "incoming_positive_rows": int((snapshot["qty_incoming"] > 0).sum()),
        "held_positive_rows": int((snapshot["qty_held"] > 0).sum()),
        "date_min": str(snapshot["snap_date"].min().date()),
        "date_max": str(snapshot["snap_date"].max().date()),
        "expected_rows": int(cfg.expectations["stock_snapshot_rows"]),
    }
    ok = duplicates == 0 and negative_on_hand == 0 and rows == int(cfg.expectations["stock_snapshot_rows"])
    return _result("stock_snapshot.keys_and_censoring", ok,
                   f"{rows:,} rows (expected {int(cfg.expectations['stock_snapshot_rows']):,}), "
                   f"{duplicates} duplicate keys, {stockout_days:,} stock-out days "
                   f"({stockout_days / rows:.2%}) -> target is stock-out censored", metrics)


def check_series_inventory(series: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """Reproduce 191 -> 188 -> 173 and the 3 blood / 15 Min-Max exclusions."""
    counts = clean.series_scope_counts(series)
    expected = {
        "hospital_drug_rows": int(cfg.expectations["hospital_drug_rows"]),
        "non_blood": int(cfg.expectations["non_blood_series"]),
        "in_scope": int(cfg.expectations["modelled_series"]),
    }
    mismatches = {key: (counts[key], want) for key, want in expected.items() if counts[key] != want}
    ok = not mismatches
    detail = (f"{counts['hospital_drug_rows']} listings - {counts['blood_products']} blood - "
              f"{counts['min_max']} Min-Max (VED=D, price<=50) = {counts['in_scope']} modelled series")
    if mismatches:
        detail += f"; MISMATCH {mismatches}"
    return _result("series_inventory.exclusions", ok, detail, counts | {"expected": expected})


def check_drug_master_resolution(series: pd.DataFrame) -> Check:
    """Every listing must resolve to catalogue attributes (``item_type`` never ``UNMAPPED``).

    16 ``hospital_drug`` rows carry a NULL ``drug_master_id``; they are resolved through ``gp_id``.
    A silent failure here degrades ``item_type`` / ``is_cold_chain`` and is a known past bug.
    """
    unmapped = int((series["item_type"] == "UNMAPPED").sum())
    null_drug_master = int(series["drug_master_id"].isna().sum())
    local_fallback_codes = int(series["item_code"].str.startswith("LOCAL-").sum())
    metrics = {
        "unmapped_item_type": unmapped,
        "null_drug_master_id": null_drug_master,
        "local_fallback_item_codes": local_fallback_codes,
        "resolved_via_gp_id": null_drug_master - unmapped,
        "item_type_counts": series["item_type"].value_counts().to_dict(),
    }
    ok = unmapped == 0 and local_fallback_codes == 0
    return _result("series_inventory.drug_master_resolution", ok,
                   f"{null_drug_master} listings without drug_master_id, all resolved via gp_id; "
                   f"{unmapped} UNMAPPED, {local_fallback_codes} LOCAL- item codes", metrics)


def check_daily_crosswalk(daily: pd.DataFrame, series: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """The joined daily view must map 1:1 onto non-blood listings (188 series)."""
    daily_series = int(daily["hospital_drug_id"].nunique())
    non_blood = int((~series["is_blood_product"]).sum())
    expected = int(cfg.expectations["non_blood_series"])
    expected_daily_rows = int(cfg.expectations["daily_joined_rows"])
    pairs = int(daily[["hospital_code", "item_code"]].drop_duplicates().shape[0])
    in_scope_daily = int(daily.loc[daily["hospital_drug_id"].isin(series.loc[series["in_scope"], "hospital_drug_id"]),
                                   "hospital_drug_id"].nunique())
    metrics = {
        "daily_rows": int(len(daily)),
        "expected_daily_rows": expected_daily_rows,
        "daily_series": daily_series,
        "daily_hospital_item_pairs": pairs,
        "non_blood_listings": non_blood,
        "daily_series_in_model_scope": in_scope_daily,
        "expected_daily_series": expected,
    }
    ok = (daily_series == expected == non_blood and pairs == daily_series
          and len(daily) == expected_daily_rows)
    return _result("identity.daily_crosswalk", ok,
                   f"{len(daily):,} daily rows (expected {expected_daily_rows:,}), {daily_series} daily series "
                   f"== {non_blood} non-blood listings == expected {expected}; "
                   f"{pairs} unique (hospital_code, item_code) pairs ({in_scope_daily} in modelling scope)", metrics)


def check_daily_pack_reconciliation(daily: pd.DataFrame, pack: data_loader.RawPack, threshold: float) -> Check:
    """The joined daily view must reconcile exactly with the raw usage and stock tables."""
    usage_by_series = daily.groupby("hospital_drug_id", observed=True)["qty_used"].sum()
    raw_usage = (
        pack.usage_daily.loc[pack.usage_daily["hospital_drug_id"].isin(usage_by_series.index)]
        .groupby("hospital_drug_id", observed=True)["qty_used"].sum()
    )
    usage_gap = (usage_by_series - raw_usage).abs()
    usage_mismatch = int((usage_gap > 1e-6).sum())

    last_rows = (
        daily.sort_values("date").groupby("hospital_drug_id", observed=True)
        .tail(1)[["hospital_drug_id", "date", "qty_on_hand_end_of_day"]]
    )
    merged = last_rows.merge(
        pack.stock_snapshot[["hospital_drug_id", "snap_date", "qty_on_hand"]],
        left_on=["hospital_drug_id", "date"], right_on=["hospital_drug_id", "snap_date"], how="left",
    )
    on_hand_gap = (merged["qty_on_hand"] - merged["qty_on_hand_end_of_day"]).abs()
    on_hand_mismatch = int((on_hand_gap > 1e-6).sum())

    metrics = {
        "series_compared": int(len(usage_by_series)),
        "usage_sum_mismatches": usage_mismatch,
        "max_usage_sum_gap": float(usage_gap.max()),
        "on_hand_mismatches_last_day": on_hand_mismatch,
        "on_hand_last_date": str(last_rows["date"].min().date()),
        "stockout_threshold": threshold,
    }
    ok = usage_mismatch == 0 and on_hand_mismatch == 0
    return _result("consistency.daily_vs_pack", ok,
                   f"per-series usage sums identical for {len(usage_by_series)} series "
                   f"(max gap {usage_gap.max():.6f}); {on_hand_mismatch} on-hand mismatches on the last day",
                   metrics)


def check_cold_start(day_counts: pd.DataFrame, weekly: pd.DataFrame, series: pd.DataFrame,
                     cfg: ForecastConfig) -> Check:
    """Cold-start series: count, scope membership and where they appear in the weekly splits."""
    cold_ids = clean.cold_start_ids(day_counts, cfg)
    expected = int(cfg.expectations["cold_start_series"])
    in_scope = series.loc[series["hospital_drug_id"].isin(cold_ids), "in_scope"].all() if cold_ids else False
    weekly_cold = weekly.loc[weekly["hospital_drug_id"].isin(cold_ids)]
    split_counts = weekly_cold["split"].value_counts().to_dict()
    history = day_counts.loc[day_counts["hospital_drug_id"].isin(cold_ids), "n_days"]
    metrics = {
        "cold_start_series": len(cold_ids),
        "expected": expected,
        "history_days_min": int(history.min()) if len(history) else 0,
        "history_days_max": int(history.max()) if len(history) else 0,
        "all_in_model_scope": bool(in_scope),
        "weekly_split_counts": split_counts,
    }
    ok = len(cold_ids) == expected and bool(in_scope)
    return _result("cold_start.series", ok,
                   f"{len(cold_ids)} cold-start series ({metrics['history_days_min']}-"
                   f"{metrics['history_days_max']} days of history), weekly splits {split_counts}", metrics)


def check_reference_tables(pack: data_loader.RawPack, cfg: ForecastConfig) -> Check:
    """Reference tables (drug catalogue, hospitals) must match their confirmed sizes."""
    codes = sorted(str(code) for code in pack.hospital["code"].unique())
    metrics = {
        "drug_master_rows": int(len(pack.drug_master)),
        "expected_drug_master_rows": int(cfg.expectations["drug_master_rows"]),
        "hospital_rows": int(len(pack.hospital)),
        "expected_hospital_rows": int(cfg.expectations["hospital_rows"]),
        "hospital_codes": codes,
        "blood_products_in_catalogue": int(pack.drug_master["is_blood_product"].fillna(False).sum()),
        "supply_internal_codes": int(pack.drug_master["internal_code"].astype("string")
                                     .str.startswith("SUP-").fillna(False).sum()),
    }
    ok = (metrics["drug_master_rows"] == metrics["expected_drug_master_rows"]
          and metrics["hospital_rows"] == metrics["expected_hospital_rows"])
    return _result("reference_tables.shape", ok,
                   f"drug_master {metrics['drug_master_rows']} rows "
                   f"(expected {metrics['expected_drug_master_rows']}), hospitals "
                   f"{metrics['hospital_rows']} rows {codes} "
                   f"(expected {metrics['expected_hospital_rows']})", metrics)


def check_weekly_matrix(weekly: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """Counts, split boundaries, duplicate keys and missingness of the committed weekly matrix."""
    rows = len(weekly)
    duplicates = int(weekly.duplicated(subset=["hospital_drug_id", "origin_week"]).sum())
    split_counts = {str(k): int(v) for k, v in weekly["split"].value_counts().sort_index().items()}
    expected_series = int(cfg.expectations["modelled_series"])
    expected_rows = int(cfg.expectations["weekly_rows"])
    expected_splits = {str(k): int(v) for k, v in cfg.expectations["weekly_split_counts"].items()}
    series_count = int(weekly["hospital_drug_id"].nunique())
    zero_target = int((weekly["y_target"] == 0).sum())
    quantiles = {str(q): float(weekly["y_target"].quantile(q)) for q in (0.5, 0.75, 0.9, 0.95, 0.99)}
    lag_nan = {column: int(weekly[column].isna().sum())
               for column in weekly.columns
               if column.startswith(("lag_", "roll_")) or column in ("weeks_since_last_nonzero",)}
    spans = {
        str(split): [str(group["origin_week"].min().date()), str(group["origin_week"].max().date())]
        for split, group in weekly.groupby("split", observed=True)
    }
    missing_splits = sorted(set(schema.MODEL_SPLITS) - set(split_counts))
    metrics = {
        "rows": rows,
        "series": series_count,
        "duplicate_keys": duplicates,
        "split_counts": split_counts,
        "missing_splits": missing_splits,
        "split_spans": spans,
        "zero_target_rows": zero_target,
        "zero_target_share": round(zero_target / rows, 6),
        "y_target_quantiles": quantiles,
        "y_target_max": float(weekly["y_target"].max()),
        "nan_counts_top": dict(sorted(lag_nan.items(), key=lambda item: -item[1])[:6]),
        "expected_rows": expected_rows,
        "expected_series": expected_series,
        "expected_split_counts": expected_splits,
    }
    ok = (duplicates == 0 and not missing_splits and rows == expected_rows
          and series_count == expected_series and split_counts == expected_splits)
    detail = (f"{rows:,} rows (expected {expected_rows:,}), {series_count} series (expected {expected_series}), "
              f"splits {split_counts} (expected {expected_splits}), {zero_target:,} zero targets "
              f"({zero_target / rows:.1%}), duplicate keys {duplicates}")
    return _result("weekly_matrix.shape_and_splits", ok, detail, metrics)


def check_weekly_target_from_raw(weekly: pd.DataFrame, pack: data_loader.RawPack, cfg: ForecastConfig,
                                 sample_size: int = 300) -> Check:
    """Recompute ``y_target`` and ``lag_1w`` for a seeded sample straight from ``usage_daily``.

    ``origin_week`` is the Monday of the week the features end on, so the origin week is
    ``[origin_week, origin_week + 6]`` and the target week (``y_target``) is
    ``[origin_week + 7, origin_week + 13]``. Verified by hand for series HA|763354,
    origin_week 2017-09-25: ``lag_1w = 21`` and ``y_target = 14``.
    """
    sample = weekly.sample(n=min(sample_size, len(weekly)), random_state=cfg.seed)
    usage = pack.usage_daily.loc[pack.usage_daily["hospital_drug_id"].isin(sample["hospital_drug_id"].unique())]
    by_series = {
        series_id: group.set_index("usage_date")["qty_used"]
        for series_id, group in usage.groupby("hospital_drug_id", observed=True)
    }

    target_mismatch = lag_mismatch = 0
    for row in sample.itertuples():
        daily = by_series[row.hospital_drug_id]
        origin = row.origin_week
        origin_sum = float(daily.reindex(pd.date_range(origin, origin + pd.Timedelta(days=6), freq="D")).sum())
        target_sum = float(daily.reindex(pd.date_range(origin + pd.Timedelta(days=7),
                                                       origin + pd.Timedelta(days=13), freq="D")).sum())
        if abs(target_sum - float(row.y_target)) > 1e-6:
            target_mismatch += 1
        if abs(origin_sum - float(row.lag_1w)) > 1e-6:
            lag_mismatch += 1

    metrics = {
        "sampled_rows": int(len(sample)),
        "seed": int(cfg.seed),
        "y_target_mismatches": target_mismatch,
        "lag_1w_mismatches": lag_mismatch,
    }
    ok = target_mismatch == 0 and lag_mismatch == 0
    return _result("weekly_matrix.target_from_raw", ok,
                   f"recomputed y_target and lag_1w from usage_daily for {len(sample)} sampled rows: "
                   f"{target_mismatch} / {lag_mismatch} mismatches", metrics)


def check_context_signal(context: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """Context windows: types, coverage and the evidence for the known-at-origin rule."""
    type_counts = {str(k): int(v) for k, v in context["signal_type"].value_counts().items()}
    same_day = int((context["created_at"].dt.date == context["valid_from"].dt.date).sum())
    approved = int(context["approved_by"].notna().sum())
    midweek_starts = int((context["valid_from"].dt.weekday != 0).sum())
    unknown_signals = sorted(set(type_counts) - set(cfg.context_flags["signals"]))
    metrics = {
        "rows": int(len(context)),
        "type_counts": type_counts,
        "created_equals_valid_from": same_day,
        "approved_rows": approved,
        "windows_starting_midweek": midweek_starts,
        "valid_from_min": str(context["valid_from"].min().date()),
        "valid_from_max": str(context["valid_from"].max().date()),
        "signals_without_feature_flag": unknown_signals,
        "expected_rows": int(cfg.expectations["context_signal_rows"]),
    }
    ok = not unknown_signals and approved == len(context) and len(context) == int(cfg.expectations["context_signal_rows"])
    return _result("context_signal.windows", ok,
                   f"{len(context)} windows over {len(type_counts)} signal types; "
                   f"{same_day}/{len(context)} have created_at == valid_from (a target-week flag can leak "
                   f"up to 7 days, hence the known-at-origin rule); {midweek_starts} windows start mid-week",
                   metrics)


def check_monthly_projection(pack: data_loader.RawPack, series: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """Project the monthly build: complete months, warm-up rule, expected 17,763 rows."""
    ids = clean.scope_ids(series)
    monthly = clean.monthly_aggregate(pack.usage_daily, ids)
    projection = clean.project_monthly_rows(monthly, cfg)
    metrics = {
        "complete_series_months": int(len(monthly)),
        "series": projection["series"],
        "usable_rows": projection["rows"],
        "expected_rows": int(cfg.expectations["monthly_rows"]),
        "expected_origin_month_min": cfg.expectations["monthly_origin_month_min"],
        "expected_origin_month_max": cfg.expectations["monthly_origin_month_max"],
        "min_history_months": projection["min_history_months"],
        "origin_month_min": projection["origin_month_min"],
        "origin_month_max": projection["origin_month_max"],
    }
    ok = (projection["rows"] == int(cfg.expectations["monthly_rows"])
          and projection["origin_month_min"] == cfg.expectations["monthly_origin_month_min"]
          and projection["origin_month_max"] == cfg.expectations["monthly_origin_month_max"]
          and projection["series"] == int(cfg.expectations["modelled_series"]))
    return _result("monthly.projection", ok,
                   f"{projection['rows']:,} monthly training rows (expected "
                   f"{int(cfg.expectations['monthly_rows']):,}) for {projection['series']} series, "
                   f"origin_month {projection['origin_month_min']} -> {projection['origin_month_max']} "
                   f"(complete months only, {projection['min_history_months']}-month warm-up for long series)",
                   metrics)


def check_scope_integrity(series: pd.DataFrame, cfg: ForecastConfig) -> Check:
    """The modelled scope must be active, priced and routable (VED present, lead time present)."""
    scope = series.loc[series["in_scope"]]
    inactive = int((scope["active"] != True).sum())  # noqa: E712 - nullable boolean comparison
    missing_price = int(scope["unit_price_thb"].isna().sum())
    missing_ved = int(scope["ved"].isna().sum())
    missing_lead = int(scope["standard_lead_time_days"].isna().sum())
    tier_counts = {str(k): int(v) for k, v in scope["price_tier"].value_counts().items()}
    ved_counts = {str(k): int(v) for k, v in scope["ved"].value_counts().items()}
    metrics = {
        "series": int(len(scope)),
        "inactive": inactive,
        "missing_unit_price": missing_price,
        "missing_ved": missing_ved,
        "missing_lead_time": missing_lead,
        "price_tier_counts": tier_counts,
        "ved_counts": ved_counts,
        "cold_chain_series": int(scope["is_cold_chain"].sum()),
        "seasonal_series": int(scope["is_seasonal"].sum()),
        "lead_time_days": {
            "min": float(scope["standard_lead_time_days"].min()),
            "max": float(scope["standard_lead_time_days"].max()),
            "median": float(scope["standard_lead_time_days"].median()),
        },
        "method_override_set": int(scope["method_override"].notna().sum()),
    }
    ok = inactive == 0 and missing_price == 0 and missing_ved == 0 and missing_lead == 0
    return _result("scope.integrity", ok,
                   f"{len(scope)} modelled series, 0 inactive / {missing_price} unpriced / {missing_ved} without VED / "
                   f"{missing_lead} without lead time; lead time {metrics['lead_time_days']['min']:.0f}-"
                   f"{metrics['lead_time_days']['max']:.0f} days (median {metrics['lead_time_days']['median']:.0f})",
                   metrics)


def run_validation(cfg: ForecastConfig, write_report: bool = True, sample_size: int = 300,
                   data: tuple[data_loader.RawPack, pd.DataFrame, pd.DataFrame, pd.DataFrame] | None = None) -> dict:
    """Run every Phase 1 check and (optionally) write the reports.

    Args:
        cfg: resolved configuration.
        write_report: write ``reports/data_quality.json`` and ``reports/data_quality_summary.md``.
        sample_size: rows used by the weekly target spot-reconciliation.
        data: pre-loaded ``(pack, series, daily, weekly)``; loaded from disk when omitted.

    Returns:
        ``{"checks": [...], "failed": int, "warned": int, "summary_text": str, "paths": {...}}``
    """
    pack, series, daily, weekly = data if data is not None else data_loader.load_all(cfg)
    threshold = float(cfg.stockout["stockout_threshold"])
    day_counts = data_loader.series_day_counts(daily)
    cold_ids = clean.cold_start_ids(day_counts, cfg)
    stockout = clean.stockout_days_by_series(pack.stock_snapshot, [r.hospital_drug_id for r in series.itertuples()],
                                             threshold)

    checks = [
        check_usage_daily(pack.usage_daily, cfg),
        check_stock_snapshot(pack.stock_snapshot, threshold, cfg),
        check_reference_tables(pack, cfg),
        check_series_inventory(series, cfg),
        check_drug_master_resolution(series),
        check_daily_crosswalk(daily, series, cfg),
        check_daily_pack_reconciliation(daily, pack, threshold),
        check_cold_start(day_counts, weekly, series, cfg),
        check_weekly_matrix(weekly, cfg),
        check_weekly_target_from_raw(weekly, pack, cfg, sample_size=sample_size),
        check_context_signal(pack.context_signal, cfg),
        check_monthly_projection(pack, series, cfg),
        check_scope_integrity(series, cfg),
    ]

    counts = {
        "series": clean.series_scope_counts(series),
        "daily_series": int(daily["hospital_drug_id"].nunique()),
        "cold_start_series": len(cold_ids),
        "scope_stockout_days": int(stockout["stockout_days"].sum()),
        "scope_stockout_share": round(float(stockout["stockout_days"].sum() / stockout["n_days"].sum()), 6),
        "series_with_any_stockout": int((stockout["stockout_days"] > 0).sum()),
    }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "config_path": str(cfg.config_path),
        "repo_root": str(cfg.repo_root),
        "raw_paths": {name: str(path) for name, path in cfg.raw_paths.items()},
        "checks": [asdict(check) for check in checks],
        "counts": counts,
        "failed": sum(1 for check in checks if check.status == FAIL),
        "warned": sum(1 for check in checks if check.status == WARN),
    }
    report["summary_text"] = render_text(report)

    if write_report:
        paths = write_reports(cfg, report)
        report["paths"] = {key: str(value) for key, value in paths.items()}
    else:
        report["paths"] = {}
    return report


def render_text(report: dict) -> str:
    """Render a compact console table of the check results."""
    lines = [
        "F1 quantile module - Phase 1 data validation",
        f"generated: {report['generated_at']}",
        "",
    ]
    width = max(len(check["name"]) for check in report["checks"])
    for check in report["checks"]:
        lines.append(f"  [{check['status']}] {check['name']:<{width}}  {check['detail']}")
    lines += [
        "",
        f"  checks: {len(report['checks'])} | failed: {report['failed']} | warnings: {report['warned']}",
        f"  series: {report['counts']['series']}",
    ]
    if report.get("paths"):
        lines.append(f"  report: {report['paths'].get('json')}")
        lines.append(f"  summary: {report['paths'].get('markdown')}")
    return "\n".join(lines)


def render_markdown(report: dict) -> str:
    """Render the short markdown summary committed alongside the JSON report."""
    counts = report["counts"]
    lines = [
        "# Phase 1 - data quality summary (F1 quantile module)",
        "",
        f"Generated: {report['generated_at']} (read-only checks; no input file was modified)",
        "",
        f"- Modelled series: **{counts['series']['in_scope']}** "
        f"({counts['series']['hospital_drug_rows']} listings - {counts['series']['blood_products']} blood - "
        f"{counts['series']['min_max']} Min-Max)",
        f"- Joined daily series: {counts['daily_series']} | cold-start series: {counts['cold_start_series']}",
        f"- Stock-out days in scope: {counts['scope_stockout_days']:,} "
        f"({counts['scope_stockout_share']:.2%}); series with at least one: {counts['series_with_any_stockout']}",
        f"- Checks: {len(report['checks'])} total, {report['failed']} failed, {report['warned']} warnings",
        "",
        "| Check | Status | Result |",
        "|---|---|---|",
    ]
    for check in report["checks"]:
        lines.append(f"| `{check['name']}` | {check['status']} | {check['detail']} |")
    lines += [
        "",
        "## Key metrics",
        "",
        "```json",
        json.dumps({check["name"]: check["metrics"] for check in report["checks"]}, indent=2, default=str),
        "```",
        "",
        "## Caveats",
        "",
        "- The pack is synthetic mock data generated by `db/mock/generate.py`; metrics are not real accuracy.",
        "- `usage_daily.qty_used` is dispensed usage, censored when stock reaches zero.",
        "- The committed weekly matrix flags `ctx_*` on the target week; training will use the "
        "known-at-origin variant (Phase 3 quantifies the difference).",
        "",
    ]
    return "\n".join(lines)


def write_reports(cfg: ForecastConfig, report: dict) -> dict[str, Path]:
    """Write the JSON report and the markdown summary; return their paths."""
    reports_dir = ensure_dir(cfg.reports_dir)
    json_path = reports_dir / "data_quality.json"
    markdown_path = reports_dir / "data_quality_summary.md"
    json_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return {"json": json_path, "markdown": markdown_path}
