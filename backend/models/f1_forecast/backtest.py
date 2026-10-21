"""Walk-forward backtesting harness and baseline evaluation.

Granularity-agnostic by construction: only :func:`build_panel` knows how to assemble today's RAW panel
(WEEK from the committed weekly matrix + the raw pack; MONTH arrives with the monthly feature matrix in
Phase 3), while folds, block cutoffs, prediction assembly, metric evaluation and reporting are shared.

Fold and embargo rules (spec: "Walk-forward", leakage prevention):

* a fold is one calendar month inside the evaluated split;
* a training row is admissible for that fold only when its **target window ends before** the fold starts
  (weekly: ``origin + 13 days < first day of the fold's month``; monthly: target month ends before it);
* the split boundaries themselves come from the data (weekly ``split`` column) or from config (monthly),
  never from a random split.

Baselines in this phase use causal (expanding, weekly-refit) parameters, which satisfy the same rule a
fortiori; the block structure is installed now so Phase 4/5 models can plug in with monthly retraining.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from f1_forecast import baselines, clean, data_loader, features, metrics, schema
from f1_forecast.config import ForecastConfig, ensure_dir


@dataclass(frozen=True)
class Block:
    """One walk-forward evaluation block (one calendar month of a split)."""

    split: str
    block_start: pd.Timestamp
    eval_origins: tuple[pd.Timestamp, ...]
    train_cutoff: pd.Timestamp | None      # last origin whose target window closes before the block
    n_admissible_origins: int              # distinct origin periods a model may train on for this block


def add_target_window(panel: pd.DataFrame, granularity: str) -> pd.DataFrame:
    """Add ``target_start``/``target_end`` (inclusive) for every evaluation row."""
    frame = panel.copy()
    frame["target_start"] = clean.next_period_start(frame["origin"], granularity)
    if granularity.upper() == "WEEK":
        frame["target_end"] = frame["target_start"] + pd.Timedelta(days=6)
    else:
        frame["target_end"] = frame["target_start"] + pd.offsets.MonthEnd(1)
    # end of the origin period == the last day whose stock is observable when the forecast is made
    frame["origin_end"] = frame["target_start"] - pd.Timedelta(days=1)
    return frame


def _stock_flags(pack: data_loader.RawPack, cfg: ForecastConfig, ids: list[str]) -> pd.DataFrame:
    """Per-series daily stock-out flag with a trailing window sum, for target-window slicing.

    The flag is ground truth used only to slice evaluation output (never a model input): a period whose
    target window contained a stock-out day is reported separately because the target is censored there.
    """
    snapshot = clean.restrict_to_scope(pack.stock_snapshot, ids)
    threshold = float(cfg.stockout["stockout_threshold"])
    flagged = snapshot.assign(is_stockout=(snapshot["qty_on_hand"] <= threshold).astype(int))
    flagged = flagged.sort_values(["hospital_drug_id", "snap_date"])
    flagged["stockout_window"] = (
        flagged.groupby("hospital_drug_id", observed=True)["is_stockout"]
        .transform(lambda s: s.rolling(7, min_periods=1).sum())
    )
    return flagged.rename(columns={"hospital_drug_id": "series_id", "snap_date": "date"})[
        ["series_id", "date", "stockout_window", "qty_on_hand", "qty_incoming"]]


def build_panel(cfg: ForecastConfig, granularity: str, pack: data_loader.RawPack | None = None,
                series: pd.DataFrame | None = None) -> pd.DataFrame:
    """Assemble the evaluation panel for a granularity.

    Args:
        cfg: resolved configuration.
        granularity: ``WEEK`` (committed split column) or ``MONTH`` (Phase 3 monthly matrix, config splits).
        pack: pre-loaded raw pack (loaded from disk when omitted).
        series: pre-built series inventory (built from ``pack`` when omitted).

    Returns:
        One row per series x origin period with ``series_id``, ``origin``, ``split``, ``y``,
        ``target_start``/``target_end``, ``origin_stock``, ``target_stockout_days`` and the slicing
        attributes (ved, abc, price tier, item type, hospital tier, seasonality, zero share, cold start).
    """
    key = granularity.upper()
    if key not in ("WEEK", "MONTH"):
        raise ValueError(f"unsupported granularity {granularity!r}; expected WEEK or MONTH")
    pack = pack if pack is not None else data_loader.load_pack(cfg)
    series = series if series is not None else data_loader.enrich_series(pack, cfg)
    panel = _weekly_panel(cfg, pack, series) if key == "WEEK" else _monthly_panel(cfg, pack, series)
    return panel.sort_values(["split", "origin", "series_id"]).reset_index(drop=True)


def _panel_attributes(series: pd.DataFrame) -> pd.DataFrame:
    """Per-series attributes carried onto panel rows (identical for WEEK and MONTH)."""
    attributes = series[[
        "hospital_drug_id", "hospital_code", "hospital_tier", "item_code", "ved", "abc", "item_type",
        "price_tier", "unit_price_thb", "is_seasonal", "is_cold_chain", "standard_lead_time_days",
    ]].rename(columns={"hospital_drug_id": "series_id"})
    attributes["is_cold_chain"] = attributes["is_cold_chain"].astype(bool)
    attributes["is_seasonal"] = attributes["is_seasonal"].astype(bool)
    return attributes


def _weekly_panel(cfg: ForecastConfig, pack: data_loader.RawPack, series: pd.DataFrame) -> pd.DataFrame:
    """Weekly panel from the committed matrix (the authoritative `split` source)."""
    key = "WEEK"
    weekly = data_loader.load_weekly_features(cfg)
    ids = clean.scope_ids(series)

    totals = clean.period_totals(pack.usage_daily, ids, key)
    history = totals.groupby("series_id", observed=True).size().rename("history_periods")

    attributes = _panel_attributes(series)

    panel = weekly.rename(columns={"hospital_drug_id": "series_id", "origin_week": "origin",
                                   "y_target": "y"})[
        ["series_id", "origin", "split", "y", "roll_zero_share_13", "stockout_days_4w"]
    ]
    panel = panel.loc[panel["series_id"].isin(ids)]
    panel = add_target_window(panel, key)
    panel = panel.merge(attributes, on="series_id", how="left", validate="many_to_one")
    panel = panel.merge(history, on="series_id", how="left", validate="many_to_one")

    flags = _stock_flags(pack, cfg, ids)
    panel = panel.merge(
        flags[["series_id", "date", "stockout_window"]].rename(
            columns={"date": "target_end", "stockout_window": "target_stockout_days"}),
        on=["series_id", "target_end"], how="left", validate="many_to_one")
    panel = panel.merge(
        flags[["series_id", "date", "qty_on_hand", "qty_incoming"]].rename(
            columns={"date": "origin_end", "qty_on_hand": "origin_stock",
                     "qty_incoming": "origin_incoming"}),
        on=["series_id", "origin_end"], how="left", validate="many_to_one")

    cold_start_weeks = int(cfg.series_scope["cold_start_max_history_weeks"])
    panel["cold_start"] = panel["history_periods"] <= cold_start_weeks
    panel["intermittent"] = panel["roll_zero_share_13"] > 0.5
    panel["target_stockout_days"] = panel["target_stockout_days"].fillna(0).astype(int)
    return panel


def _month_end_snapshot(pack: data_loader.RawPack, ids: list[str]) -> pd.DataFrame:
    """Last snapshot of each calendar month per series (the stock observable at the month end)."""
    snapshot = clean.restrict_to_scope(pack.stock_snapshot, ids)
    snapshot = snapshot.assign(period_end=snapshot["snap_date"].dt.to_period("M").dt.end_time.dt.normalize())
    return (
        snapshot.sort_values("snap_date")
        .groupby(["hospital_drug_id", "period_end"], observed=True).tail(1)
        .rename(columns={"hospital_drug_id": "series_id"})[
            ["series_id", "period_end", "qty_on_hand", "qty_incoming"]]
    )


def _monthly_panel(cfg: ForecastConfig, pack: data_loader.RawPack, series: pd.DataFrame) -> pd.DataFrame:
    """Monthly panel from the Phase 3 monthly matrix (built from the raw pack, never from f1_daily)."""
    key = "MONTH"
    ids = clean.scope_ids(series)
    matrix = features.build_monthly(cfg, pack, series)
    totals = clean.period_totals(pack.usage_daily, ids, key)
    history = totals.groupby("series_id", observed=True).size().rename("history_periods")

    panel = matrix.rename(columns={"hospital_drug_id": "series_id", "origin_month": "origin",
                                   "y_target": "y"})[
        ["series_id", "origin", "split", "y", "roll_zero_share_6m", "stockout_days_1m"]
    ]
    panel = add_target_window(panel, key)
    panel = panel.merge(_panel_attributes(series), on="series_id", how="left", validate="many_to_one")
    panel = panel.merge(history, on="series_id", how="left", validate="many_to_one")

    # target-month stock-out days are ground truth for slicing the report, never a model input
    month_stockout = features.period_stockout_days(pack, cfg, ids, key).rename(
        columns={"period": "target_start", "stockout_days": "target_stockout_days"})
    panel = panel.merge(month_stockout, on=["series_id", "target_start"], how="left", validate="many_to_one")

    month_end = _month_end_snapshot(pack, ids).rename(
        columns={"period_end": "origin_end", "qty_on_hand": "origin_stock", "qty_incoming": "origin_incoming"})
    panel = panel.merge(month_end, on=["series_id", "origin_end"], how="left", validate="many_to_one")

    cold_months = int(cfg.series_scope["cold_start_max_history_months"])
    panel["cold_start"] = panel["history_periods"] <= cold_months
    panel["intermittent"] = panel["roll_zero_share_6m"] > 0.5
    panel["target_stockout_days"] = panel["target_stockout_days"].fillna(0).astype(int)
    return panel


def walk_forward_blocks(panel: pd.DataFrame, granularity: str, cfg: ForecastConfig) -> list[Block]:
    """Split every evaluated split into calendar-month blocks with a leakage-safe training cutoff.

    Args:
        panel: evaluation panel with ``split``, ``origin`` and ``target_end``.
        granularity: ``WEEK`` or ``MONTH``.
        cfg: configuration (split names).

    Returns:
        One :class:`Block` per (split, calendar month), each carrying the admissible training cutoff: the
        last origin whose target window ends strictly before the block starts.
    """
    blocks: list[Block] = []
    # Admissible training data is measured across EVERY split (including `train`), while only the evaluated
    # splits produce blocks: a model may train on anything whose target window closes before the block.
    all_origins = panel[["origin", "target_end"]].drop_duplicates()
    for split in [s for s in schema.MODEL_SPLITS if s != "train"]:
        subset = panel.loc[panel["split"] == split]
        if subset.empty:
            continue
        months = subset.assign(block_month=subset["origin"].dt.to_period("M"))
        for month, group in months.groupby("block_month", observed=True, sort=True):
            block_start = pd.Timestamp(month.start_time)
            admissible = all_origins.loc[all_origins["target_end"] < block_start]
            cutoff = pd.Timestamp(admissible["origin"].max()) if not admissible.empty else None
            blocks.append(Block(split=split, block_start=block_start,
                                eval_origins=tuple(sorted(group["origin"].unique())),
                                train_cutoff=cutoff,
                                n_admissible_origins=int(admissible["origin"].nunique())))
    return sorted(blocks, key=lambda b: (b.split, b.block_start))


def run_baselines(cfg: ForecastConfig, granularity: str = "WEEK", panel: pd.DataFrame | None = None,
                  pack: data_loader.RawPack | None = None, series: pd.DataFrame | None = None,
                  ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Run every configured baseline over the evaluation panel.

    Args:
        cfg: resolved configuration.
        granularity: ``WEEK`` today, ``MONTH`` once the monthly panel exists.
        panel: pre-built panel (optional; built from disk when omitted).
        pack: pre-loaded raw pack (loaded from disk when omitted).
        series: pre-built series inventory (built from ``pack`` when omitted).

    Returns:
        ``(predictions, panel)`` — predictions carry ``baseline``, split, identity, actuals, the quantile
        columns and the slicing attributes.
    """
    key = granularity.upper()
    pack = pack if pack is not None else data_loader.load_pack(cfg)
    series = series if series is not None else data_loader.enrich_series(pack, cfg)
    if panel is None:
        panel = build_panel(cfg, key, pack=pack, series=series)
    totals = clean.period_totals(pack.usage_daily, clean.scope_ids(series), key)
    predictions = baselines.baseline_predictions(totals, panel, cfg, key)
    return predictions, panel


def coverage_report(predictions: pd.DataFrame, panel: pd.DataFrame) -> dict:
    """How many panel rows each baseline could actually predict (short histories cannot)."""
    report: dict = {}
    for (baseline, split), group in predictions.groupby(["baseline", "split"], observed=True):
        panel_rows = int((panel["split"] == split).sum())
        report.setdefault(baseline, {})[split] = {
            "panel_rows": panel_rows,
            "predicted_rows": int(len(group)),
            "coverage_share": round(len(group) / panel_rows, 4) if panel_rows else None,
            "unpredicted_rows": panel_rows - len(group),
        }
    return report


def run_backtest(cfg: ForecastConfig, granularity: str = "WEEK", save_predictions: bool | None = None,
                 write_report: bool = True) -> dict:
    """Run the Phase 2 baseline backtest and (optionally) write the reports.

    Args:
        cfg: resolved configuration.
        granularity: ``WEEK`` today.
        save_predictions: write the prediction table to ``data/`` (gitignored) for later comparison;
            defaults to ``backtest.save_predictions`` in the config.
        write_report: write ``reports/baseline_metrics.json``, ``reports/baseline_metrics_by_series.csv``
            and ``reports/baseline_summary.md``.

    Returns:
        The report dict (also returned by the CLI) with coverage, per-filter/split pooled metrics, gates
        and the walk-forward block summary.
    """
    key = granularity.upper()
    if save_predictions is None:
        save_predictions = bool(cfg.raw["backtest"].get("save_predictions", True))
    pack = data_loader.load_pack(cfg)
    series = data_loader.enrich_series(pack, cfg)
    panel = build_panel(cfg, key, pack=pack, series=series)
    # only the evaluated splits are scored (train rows exist for the models, but they are never reported)
    evaluated = [str(split) for split in cfg.raw["backtest"].get("evaluated_splits", ["valid", "test"])]
    blocks = walk_forward_blocks(panel, key, cfg)
    predictions, panel = run_baselines(cfg, key, panel.loc[panel["split"].isin(evaluated)], pack=pack,
                                       series=series)
    panel = panel.reset_index(drop=True)

    evaluation = metrics.evaluate_predictions(predictions, cfg.quantiles, cfg)
    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "granularity": key,
        "quantiles": [float(q) for q in cfg.quantiles],
        "coverage_tolerance": float(cfg.evaluation["coverage_tolerance"]),
        "low_n_threshold": int(cfg.evaluation["low_n_threshold"]),
        "baselines": sorted(predictions["baseline"].unique()),
        "panel": {
            "rows": int(len(panel)),
            "series": int(panel["series_id"].nunique()),
            "splits": {split: int((panel["split"] == split).sum()) for split in sorted(panel["split"].unique())},
            "origins": {split: [str(group["origin"].min().date()), str(group["origin"].max().date())]
                        for split, group in panel.groupby("split", observed=True)},
            "rows_with_target_stockout": int((panel["target_stockout_days"] > 0).sum()),
            "blocks": [asdict(block) | {"block_start": str(block.block_start.date()),
                                        "train_cutoff": str(block.train_cutoff.date()) if block.train_cutoff else None,
                                        "eval_origins": len(block.eval_origins)} for block in blocks],
            "evaluated_splits": evaluated,
        },
        "coverage": coverage_report(predictions, panel),
        "filters": evaluation["filters"],
        "gates": evaluation["gates"],
        "per_series": evaluation["per_series"],
    }
    report["summary_text"] = render_console(report)

    if save_predictions:
        derived = ensure_dir(cfg.derived_dir)
        path = derived / f"baseline_predictions_{key.lower()}.parquet"
        predictions.to_parquet(path, index=False)
        report["predictions_path"] = str(path)
    if write_report:
        paths = write_reports(cfg, report)
        report["paths"] = {name: str(path) for name, path in paths.items()}
    return report


# --------------------------------------------------------------------------------------------- reporting
HEADLINE_METRICS = ("rows", "pinball_0.5", "pinball_0.9", "pinball_0.95", "coverage_0.5", "coverage_0.9",
                    "coverage_0.95", "mae_p50", "wape_p50", "width_p95_p05", "crossing_rate_raw",
                    "stockout_rate_vs_tt", "overstock_rate_vs_tt", "under_thb", "over_thb")


def _headline(row: dict) -> dict:
    """Flatten one pooled-metric dict to the headline columns (pinball/coverage read from nested dicts)."""
    flat = {key: row.get(key) for key in HEADLINE_METRICS if key in row}
    for quantile in (0.5, 0.9, 0.95):
        flat[f"pinball_{quantile}"] = row["pinball"][str(quantile)]
        flat[f"coverage_{quantile}"] = row["coverage"][str(quantile)]
    return flat


def _table(rows: list[dict], columns: tuple[str, ...]) -> list[str]:
    """Render a fixed-width text table."""
    header = "| " + " | ".join(f"{column:>12}" for column in columns) + " |"
    lines = [header, "|" + "|".join("-" * 14 for _ in columns) + "|"]
    for row in rows:
        cells = []
        for column in columns:
            value = row.get(column)
            if value is None:
                cells.append(f"{'-':>12}")
            elif isinstance(value, float):
                cells.append(f"{value:>12.4f}")
            else:
                cells.append(f"{value:>12}")
        lines.append("| " + " | ".join(cells) + " |")
    return lines


def render_console(report: dict) -> str:
    """Render the console summary: pooled metrics per baseline, split and row filter."""
    lines = [
        f"F1 baseline backtest - granularity {report['granularity']} (raw scale, mock data)",
        f"generated: {report['generated_at']}",
        f"panel: {report['panel']['rows']:,} rows / {report['panel']['series']} series "
        f"/ splits {report['panel']['splits']} / blocks {len(report['panel']['blocks'])}",
        f"panel rows whose target window had a stock-out day: {report['panel']['rows_with_target_stockout']:,}",
        "",
    ]
    for filter_name, splits in report["filters"].items():
        lines.append(f"== {filter_name} ==")
        rows: list[dict] = []
        for split, per_baseline in splits.items():
            for baseline, pooled in per_baseline.items():
                rows.append({"split": split, "baseline": baseline, **_headline(pooled)})
        columns = ("split", "baseline", "rows", "pinball_0.5", "pinball_0.9", "pinball_0.95", "coverage_0.5",
                   "coverage_0.9", "coverage_0.95", "mae_p50", "wape_p50", "width_p95_p05",
                   "crossing_rate_raw", "stockout_rate_vs_tt", "overstock_rate_vs_tt", "under_thb", "over_thb")
        lines += _table(rows, columns)
        lines.append("")

    lines.append("== quantile detail (all rows) ==")
    detail_rows: list[dict] = []
    for split, per_baseline in report["filters"]["all_rows"].items():
        for baseline, pooled in per_baseline.items():
            row = {"split": split, "baseline": baseline}
            for quantile, value in pooled["pinball"].items():
                row[f"pin_{quantile}"] = value
            for quantile, value in pooled["coverage"].items():
                row[f"cov_{quantile}"] = value
            detail_rows.append(row)
    lines += _table(detail_rows, tuple(detail_rows[0].keys()) if detail_rows else ())
    lines.append("")

    lines.append("== coverage gate (series with >= low_n_threshold periods) ==")
    gate_rows: list[dict] = []
    for baseline, splits in report["gates"].items():
        for split, filters in splits.items():
            for filter_name, gate in filters.items():
                gate_rows.append({"baseline": baseline, "split": split, "filter": filter_name, **{
                    key: value for key, value in gate.items()
                    if key in ("series_judged", "series_low_n", "series_all_zero", "coverage_pass_rate_0.9",
                               "coverage_pass_rate_0.95", "coverage_median_0.9", "coverage_median_0.95")
                }})
    lines += _table(gate_rows, ("baseline", "split", "filter", "series_judged", "series_low_n", "series_all_zero",
                                "coverage_pass_rate_0.9", "coverage_median_0.9", "coverage_pass_rate_0.95",
                                "coverage_median_0.95"))
    return "\n".join(lines)


def _render_section(report: dict) -> list[str]:
    """Render one granularity's markdown section (header + the same tables as the console)."""
    lines = [
        f"## {report['granularity']}",
        "",
        f"Generated: {report['generated_at']} (mock data - not real accuracy)",
        "",
        f"- Panel: {report['panel']['rows']:,} rows, {report['panel']['series']} series, "
        f"splits {report['panel']['splits']}, {len(report['panel']['blocks'])} walk-forward blocks",
        f"- Rows whose target window had a stock-out day: {report['panel']['rows_with_target_stockout']:,} "
        f"(reported separately as `no_stockout_rows`)",
        f"- Metrics are on the raw scale after expm1-inversion conventions; coverage tolerance "
        f"+/-{report['coverage_tolerance']}; LOW_N threshold {report['low_n_threshold']} periods per series",
        "",
    ]
    for filter_name, splits in report["filters"].items():
        lines.append(f"### {filter_name}")
        lines.append("")
        columns = ("split", "baseline", "rows", "pinball_0.5", "pinball_0.9", "pinball_0.95", "coverage_0.5",
                   "coverage_0.9", "coverage_0.95", "mae_p50", "wape_p50", "width_p95_p05",
                   "crossing_rate_raw", "stockout_rate_vs_tt", "overstock_rate_vs_tt", "under_thb", "over_thb")
        lines.append("| " + " | ".join(columns) + " |")
        lines.append("|" + "|".join("---" for _ in columns) + "|")
        for split, per_baseline in splits.items():
            for baseline, pooled in per_baseline.items():
                flat = _headline(pooled)
                cells = [split, baseline] + [
                    ("-" if flat.get(column) is None else
                     (f"{flat[column]:.4f}" if isinstance(flat.get(column), float) else str(flat[column])))
                    for column in columns[2:]]
                lines.append("| " + " | ".join(cells) + " |")
        lines.append("")
    lines += [
        "### Coverage gate per series",
        "",
        "| baseline | split | filter | series judged | LOW_N | all-zero series | pass cov90 | median cov90 | "
        "pass cov95 | median cov95 |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for baseline, splits in report["gates"].items():
        for split, filters in splits.items():
            for filter_name, gate in filters.items():
                lines.append("| " + " | ".join([
                    baseline, split, filter_name, str(gate["series_judged"]), str(gate["series_low_n"]),
                    str(gate["series_all_zero"]), str(gate["coverage_pass_rate_0.9"]),
                    str(gate["coverage_median_0.9"]), str(gate["coverage_pass_rate_0.95"]),
                    str(gate["coverage_median_0.95"]),
                ]) + " |")
    return lines


def render_markdown(reports: list[dict]) -> str:
    """Render the committed markdown summary for every granularity that has been run."""
    lines = [
        "# Baseline backtest (weekly + monthly)",
        "",
        "Phase 2/3 baselines on the mock pack. Each granularity is scored independently; both filters "
        "(`all_rows`, `no_stockout_rows`) are always shown.",
        "",
    ]
    for report in reports:
        lines += _render_section(report)
    lines += [
        "## Notes",
        "",
        "- Baselines are the mandatory comparison set (weekly spec section 7.3): a Phase 4/5 quantile model "
        "must beat seasonal naive and MA/ES + residual quantile on pinball loss at P50/P90/P95 with coverage "
        "inside the tolerance.",
        "- `crossing_rate_raw` is measured before the monotone fix; metrics use the fixed bands (spec E4).",
        "- `stockout_rate_vs_tt` / `overstock_rate_vs_tt` use Total Target (V: P95, E: P90, D: undefined) and "
        "exclude D series from that metric.",
        "- Monthly valid/test hold only 12 periods per series, so every series is `LOW_N` there by the "
        "26-period rule: judge the monthly baseline pooled, not per series.",
        "- MOCK DATA: the pack is synthetic, so these numbers describe the generator, not real accuracy.",
        "",
    ]
    return "\n".join(lines)


def _report_paths(cfg: ForecastConfig, granularity: str) -> tuple[Path, Path]:
    """JSON and per-series CSV paths; the weekly names are the ones Phase 2 published."""
    reports_dir = ensure_dir(cfg.reports_dir)
    if granularity.upper() == "WEEK":
        return reports_dir / "baseline_metrics.json", reports_dir / "baseline_metrics_by_series.csv"
    slug = granularity.lower()
    return reports_dir / f"baseline_metrics_{slug}.json", reports_dir / f"baseline_metrics_{slug}_by_series.csv"


def _available_reports(cfg: ForecastConfig, current: dict) -> list[dict]:
    """Current report plus the other granularity's saved JSON, so the summary never hides a run."""
    reports: list[dict] = []
    for granularity in ("WEEK", "MONTH"):
        if granularity == current["granularity"]:
            reports.append(current)
            continue
        json_path, _ = _report_paths(cfg, granularity)
        if json_path.exists():
            loaded = json.loads(json_path.read_text(encoding="utf-8"))
            # the saved per-series block is large and the markdown never reads it
            loaded.pop("per_series", None)
            reports.append(loaded)
    return reports


def write_reports(cfg: ForecastConfig, report: dict) -> dict[str, Path]:
    """Write the JSON report, the per-series CSV and the combined markdown summary."""
    reports_dir = ensure_dir(cfg.reports_dir)
    json_path, csv_path = _report_paths(cfg, report["granularity"])
    markdown_path = reports_dir / "baseline_summary.md"

    serialisable = {key: value for key, value in report.items() if key != "per_series"}
    serialisable["per_series"] = {
        filter_name: {split: {baseline: frame.to_dict(orient="records")
                              for baseline, frame in per_baseline.items()}
                      for split, per_baseline in splits.items()}
        for filter_name, splits in report["per_series"].items()
    }
    json_path.write_text(json.dumps(serialisable, indent=2, default=str) + "\n", encoding="utf-8")

    frames = []
    for filter_name, splits in report["per_series"].items():
        for split, per_baseline in splits.items():
            for baseline, frame in per_baseline.items():
                frames.append(frame.assign(filter=filter_name, split=split, baseline=baseline))
    pd.concat(frames, ignore_index=True).to_csv(csv_path, index=False)
    markdown_path.write_text(render_markdown(_available_reports(cfg, report)), encoding="utf-8")
    return {"json": json_path, "csv": csv_path, "markdown": markdown_path}
