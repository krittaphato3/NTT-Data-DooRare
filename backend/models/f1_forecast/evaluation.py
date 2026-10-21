"""Phase 6a evaluation report: slices, concentration, Total-Target impact, crossings, importance.

Reads **saved** row-level predictions (``data/model_predictions_<gran>_<split>.parquet``) and the saved
baseline predictions from Phase 2/3; nothing is retrained or re-scored here. The only exception is the WEEK
predictions that were deleted after Phase 4b: they are rebuilt by ``model.score_split`` before this report
runs, and the aggregate metrics are checked against the frozen reports first.

Definitions used in the report (all on the monotone-fixed bands, raw scale after ``expm1``):

* Total Target ``TT`` = P95 for VED ``V``, P90 for ``E``; ``D`` rows have no TT. ``TT = max(TT, P50)``
  (F-06, the module's ``metrics.total_target``).
* stock-out rate = share of rows with ``y > TT``; overstock rate = share of rows with
  ``origin_stock > forecast.overstock_multiple * TT`` (2.0).
* ``under_thb = sum(max(0, y - TT) * unit_price)``; ``over_thb = mean(max(0, stock - TT)) * mean(price)``.
* pinball contribution of a series = sum over its rows and all seven quantiles of the pinball loss.
* coverage miss of a series = ``|cov90 - 0.90| + |cov95 - 0.95|``.
* crossing gap fraction = ``(lower_raw - upper_raw) / max(P50, 1)`` for crossing rows only.
* volume terciles = terciles of the series' total ``y`` inside the evaluated split.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

from f1_forecast import metrics, model
from f1_forecast.config import ForecastConfig, ensure_dir

GRANULARITIES: tuple[str, ...] = ("WEEK", "MONTH")
BASELINES: tuple[str, ...] = ("seasonal_naive", "ma_es_residual_quantile", "empirical_quantile")
SLICE_COLUMNS: tuple[str, ...] = ("ved", "price_tier", "item_type", "hospital_tier", "is_seasonal")
LOW_CONFIDENCE_ROWS = 100
CAVEAT = "MOCK DATA - not real accuracy; the pack is synthetic"
GATE_QUANTILES = (0.5, 0.9, 0.95)

# where each split's frozen all-rows pooled metrics live (used to prove this report did not move them)
FROZEN_REPORTS: dict[tuple[str, str], tuple[str, tuple[str, ...]]] = {
    ("WEEK", "valid"): ("model_train.json", ("valid",)),
    ("WEEK", "test"): ("model_test.json", ("metrics",)),
    ("MONTH", "valid"): ("model_valid_month.json", ("metrics",)),
    ("MONTH", "test"): ("model_test_month.json", ("metrics",)),
}
RESCORE_SOURCE = {
    "WEEK": "re-score of the frozen artifact - no refit, artifact and meta.json unchanged",
    "MONTH": "saved row-level predictions - no re-score, no model change",
}
SAVED_ROUNDING_TOLERANCE = 5e-4  # the frozen reports store 4 decimals


# ----------------------------------------------------------------------------------------- loading

def _dataset_frame(cfg: ForecastConfig, granularity: str, split: str) -> pd.DataFrame:
    """Evaluation frame for a split, carrying the slicing attributes."""
    dataset = model.build_dataset(cfg, granularity)
    return dataset.valid if split == "valid" else dataset.test


def _saved_predictions(cfg: ForecastConfig, granularity: str, split: str) -> pd.DataFrame:
    """Load the saved row-level predictions and attach any attributes they do not carry yet."""
    key = model.granularity_key(granularity)
    path = cfg.derived_dir / f"model_predictions_{key.lower()}_{split}.parquet"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing; run `evaluate` (or the Phase 6a WEEK re-score) first")
    predictions = pd.read_parquet(path)
    frame = _dataset_frame(cfg, key, split)
    predictions = model.attach_attributes(predictions, frame, key)
    zero_column = model.ZERO_SHARE_COLUMNS[key]
    predictions["zero_heavy"] = predictions[zero_column] > 0.5
    predictions["cold_start"] = predictions["cold_start"].fillna(False).astype(bool)
    return predictions


def _common(cfg: ForecastConfig, granularity: str, split: str) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Model and baseline rows scored by every method, plus the exclusion bookkeeping."""
    predictions = _saved_predictions(cfg, granularity, split)
    baselines, path = model.baseline_predictions(cfg, granularity)
    if baselines is None:
        raise FileNotFoundError(f"{path} missing; baseline predictions are required")
    baselines = baselines.loc[baselines["split"] == split].copy()
    keys = model.common_row_keys(predictions, baselines)
    common_model = predictions.merge(keys, on=["series_id", "origin"], how="inner")
    common_base = baselines.merge(keys, on=["series_id", "origin"], how="inner")
    # zero_heavy/cold_start are row attributes; take them from the model frame so every method slices equally
    common_base = common_base.drop(columns=[c for c in ("zero_heavy", "cold_start")
                                            if c in common_base.columns])
    attributes = common_model[["series_id", "origin", "zero_heavy", "cold_start"]]
    common_base = common_base.merge(attributes, on=["series_id", "origin"], how="left")
    excluded = predictions.loc[~predictions.set_index(["series_id", "origin"]).index.isin(
        keys.set_index(["series_id", "origin"]).index)]
    info = {"rows_model": int(len(predictions)), "rows_common": int(len(common_model)),
            "rows_excluded": int(len(excluded)), "series_excluded": int(excluded["series_id"].nunique())}
    return common_model, common_base, info


# ------------------------------------------------------------------------------------- aggregation

def verify_aggregates(cfg: ForecastConfig, key: str) -> dict:
    """Recompute each split's pooled metrics and compare them with the frozen report."""
    result: dict[str, Any] = {"source": RESCORE_SOURCE[key], "refit": False, "splits": {}}
    for split in ("valid", "test"):
        frame = _saved_predictions(cfg, key, split)
        recomputed = _model_pooled(frame, cfg)
        entry: dict[str, Any] = {"rows": int(len(frame))}
        report_name, parts = FROZEN_REPORTS[(key, split)]
        path = cfg.reports_dir / report_name
        entry["report"] = f"reports/{report_name}"
        if not path.exists():
            entry.update({"saved": None, "recomputed": recomputed, "max_abs_diff": None,
                          "matches": None, "note": "frozen report missing; nothing to compare"})
            result["splits"][split] = entry
            continue
        payload: Any = json.loads(path.read_text(encoding="utf-8"))
        for part in parts:
            payload = payload[part]
        saved = payload["filters"]["all_rows"][split][model.MODEL_BASELINE_NAMES[key]]
        kept = ("pinball", "coverage", "wape_p50")
        diffs = [abs(saved[name][q] - recomputed[name][q]) for name in kept[:2] for q in saved[name]]
        diffs.append(abs(saved["wape_p50"] - recomputed["wape_p50"]))
        entry.update({"saved": {name: saved[name] for name in kept},
                      "recomputed": {name: recomputed[name] for name in kept},
                      "max_abs_diff": round(max(diffs), 10),
                      "matches": bool(max(diffs) <= SAVED_ROUNDING_TOLERANCE)})
        result["splits"][split] = entry
    result["all_match"] = all(value["matches"] for value in result["splits"].values())
    return result


def _pooled(frame: pd.DataFrame, cfg: ForecastConfig) -> dict:
    """Pooled metrics on fixed bands (all seven quantiles)."""
    return metrics.pooled_metrics(metrics.monotone_fix(frame, list(model.TRAINED_QUANTILES)),
                                  list(model.TRAINED_QUANTILES), cfg)


def _model_pooled(frame: pd.DataFrame, cfg: ForecastConfig) -> dict:
    return _pooled(frame, cfg)


def _slice_value(value: Any) -> str:
    if isinstance(value, (bool, np.bool_)):
        return "true" if bool(value) else "false"
    return str(value)


def slice_tables(model_frame: pd.DataFrame, base_frame: pd.DataFrame, cfg: ForecastConfig) -> dict:
    """Per-slice model metrics and deltas against the best baseline in the same slice."""
    dimensions = list(SLICE_COLUMNS) + ["zero_heavy", "cold_start"]
    result: dict[str, list[dict]] = {}
    for dimension in dimensions:
        entries: list[dict] = []
        values = sorted(model_frame[dimension].dropna().unique(), key=_slice_value)
        for value in values:
            label = _slice_value(value)
            model_slice = model_frame.loc[model_frame[dimension] == value]
            if model_slice.empty:
                continue
            model_metrics = _model_pooled(model_slice, cfg)
            baseline_metrics: dict[str, dict] = {}
            for name in BASELINES:
                subset = base_frame.loc[(base_frame["baseline"] == name) & (base_frame[dimension] == value)]
                if not subset.empty:
                    baseline_metrics[name] = _model_pooled(subset, cfg)
            if not baseline_metrics:
                continue
            best = min(baseline_metrics, key=lambda name: baseline_metrics[name]["pinball"]["0.5"])
            best_metrics = baseline_metrics[best]
            deltas = {str(q): round(model_metrics["pinball"][str(q)] - best_metrics["pinball"][str(q)], 4)
                      for q in GATE_QUANTILES}
            entries.append({
                "slice": label,
                "rows": int(model_metrics["rows"]),
                "low_confidence": bool(model_metrics["rows"] < LOW_CONFIDENCE_ROWS),
                "pinball": {str(q): model_metrics["pinball"][str(q)] for q in GATE_QUANTILES},
                "coverage": {str(q): model_metrics["coverage"][str(q)] for q in (0.9, 0.95)},
                "wape_p50": model_metrics["wape_p50"],
                "width_p95_p05": model_metrics["width_p95_p05"],
                "best_baseline": best,
                "best_baseline_pinball": {str(q): best_metrics["pinball"][str(q)] for q in GATE_QUANTILES},
                "best_baseline_coverage": {str(q): best_metrics["coverage"][str(q)] for q in (0.9, 0.95)},
                "best_baseline_wape_p50": best_metrics["wape_p50"],
                "delta_vs_best": deltas,
                "loses_at": [q for q, value_ in deltas.items() if value_ > 0],
            })
        result[dimension] = entries
    return result


def _series_pinball(frame: pd.DataFrame) -> pd.DataFrame:
    """Per-series pinball contribution (all seven quantiles summed) and coverage miss."""
    quantiles = list(model.TRAINED_QUANTILES)
    losses = {}
    for quantile in quantiles:
        delta = frame["y"].to_numpy(float) - frame[f"q{int(round(quantile * 100)):02d}"].to_numpy(float)
        losses[quantile] = np.maximum(quantile * delta, (quantile - 1.0) * delta)
    loss_frame = pd.DataFrame(losses, index=frame.index)
    frame = frame.assign(_pinball=loss_frame.sum(axis=1))
    rows: list[dict] = []
    for series_id, group in frame.groupby("series_id", observed=True):
        coverage = {q: float((group["y"] <= group[f"q{int(round(q * 100)):02d}"]).mean()) for q in (0.9, 0.95)}
        rows.append({
            "series_id": series_id,
            "hospital_code": group["hospital_code"].iloc[0] if "hospital_code" in group else "",
            "item_code": group["item_code"].iloc[0] if "item_code" in group else "",
            "ved": str(group["ved"].iloc[0]) if "ved" in group else "",
            "n_periods": int(len(group)),
            "y_sum": float(group["y"].sum()),
            "pinball_total": float(group["_pinball"].sum()),
            "coverage_0.9": coverage[0.9],
            "coverage_0.95": coverage[0.95],
            "coverage_miss": abs(coverage[0.9] - 0.9) + abs(coverage[0.95] - 0.95),
        })
    return pd.DataFrame(rows)


def series_tables(frame: pd.DataFrame, cfg: ForecastConfig, threshold: int) -> dict:
    """Top-10 concentration plus the worst 15 series by loss and by coverage miss."""
    table = _series_pinball(frame)
    table["low_n"] = table["n_periods"] < threshold
    total = float(table["pinball_total"].sum())
    table["share"] = table["pinball_total"] / total if total else 0.0
    top10 = float(table.nlargest(10, "pinball_total")["share"].sum()) if total else 0.0
    worst_loss = table.nlargest(15, "pinball_total")
    worst_coverage = table.nlargest(15, "coverage_miss")
    columns = ["series_id", "hospital_code", "item_code", "ved", "n_periods", "low_n", "y_sum",
               "pinball_total", "share", "coverage_0.9", "coverage_0.95", "coverage_miss"]
    return {
        "total_pinball": round(total, 2),
        "series": int(len(table)),
        "top10_share": round(top10, 4),
        "worst_by_pinball": worst_loss[columns].to_dict("records"),
        "worst_by_coverage": worst_coverage[columns].to_dict("records"),
        "table": table,
    }


# ------------------------------------------------------------------------------------ TT impact

def tt_tables(model_frame: pd.DataFrame, base_frame: pd.DataFrame, cfg: ForecastConfig,
              model_name: str) -> dict:
    """Total-Target stock-out/overstock rates and THB value impact, model vs the baselines."""
    output: dict[str, dict] = {}
    for filter_name, subset in (("all_rows", model_frame),
                                ("no_stockout_rows",
                                 model_frame.loc[model_frame["target_stockout_days"] == 0])):
        pooled = {model_name: _model_pooled(subset, cfg)}
        base_subset = base_frame if filter_name == "all_rows" else base_frame.loc[
            base_frame["target_stockout_days"] == 0]
        for name in BASELINES:
            group = base_subset.loc[base_subset["baseline"] == name]
            if not group.empty:
                pooled[name] = _model_pooled(group, cfg)
        output[filter_name] = {
            name: {
                "rows": value["rows"],
                "total_target_rows": value["total_target_rows"],
                "stockout_rate_vs_tt": value["stockout_rate_vs_tt"],
                "overstock_rate_vs_tt": value["overstock_rate_vs_tt"],
                "under_thb": value["under_thb"],
                "over_thb": value["over_thb"],
            }
            for name, value in pooled.items()
        }
    return output


# -------------------------------------------------------------------------------------- crossing

def crossing_tables(frame: pd.DataFrame) -> dict:
    """Per-pair crossings (rate, gap fraction of P50) and crossing rate by volume tercile."""
    quantiles = list(model.TRAINED_QUANTILES)
    pairs: list[dict] = []
    q50 = frame["q50"].to_numpy(float)
    for lower, upper in zip(quantiles, quantiles[1:]):
        left = frame[f"raw_q{int(round(lower * 100)):02d}"].to_numpy(float)
        right = frame[f"raw_q{int(round(upper * 100)):02d}"].to_numpy(float)
        mask = left > right
        gap = (left - right)[mask]
        fraction = gap / np.maximum(q50[mask], 1.0) if gap.size else np.array([0.0])
        pairs.append({
            "pair": f"q{int(round(lower * 100)):02d}>q{int(round(upper * 100)):02d}",
            "share": round(float(mask.mean()), 4),
            "rows": int(mask.sum()),
            "gap_median": round(float(np.median(gap)), 2) if gap.size else 0.0,
            "gap_p95": round(float(np.percentile(gap, 95)), 2) if gap.size else 0.0,
            "fraction_median": round(float(np.median(fraction)), 4) if gap.size else 0.0,
            "fraction_p95": round(float(np.percentile(fraction, 95)), 4) if gap.size else 0.0,
        })

    volume = frame.groupby("series_id", observed=True)["y"].sum().rename("volume").reset_index()
    try:
        volume["tercile"] = pd.qcut(volume["volume"], 3, labels=["low", "mid", "high"],
                                    duplicates="drop")
    except ValueError:
        volume["tercile"] = "all"
    frame = frame.merge(volume[["series_id", "tercile"]], on="series_id", how="left")
    any_mask = np.column_stack([
        frame[f"raw_q{int(round(lower * 100)):02d}"].to_numpy(float)
        > frame[f"raw_q{int(round(upper * 100)):02d}"].to_numpy(float)
        for lower, upper in zip(quantiles, quantiles[1:])]).any(axis=1)
    frame = frame.assign(_any_cross=any_mask)
    terciles: list[dict] = []
    for label, group in frame.groupby("tercile", observed=True):
        upper_pair = (group["raw_q90"] > group["raw_q95"]).mean()
        terciles.append({
            "tercile": str(label),
            "series": int(group["series_id"].nunique()),
            "rows": int(len(group)),
            "any_crossing_rate": round(float(group["_any_cross"].mean()), 4),
            "q90_q95_rate": round(float(upper_pair), 4),
            "median_y": round(float(group["y"].median()), 2),
        })
    return {"pairs": pairs, "terciles": terciles}


# ----------------------------------------------------------------------------------- importance

def feature_importance(cfg: ForecastConfig, granularity: str) -> dict:
    """Gain importance for the P50 and P95 models, with the top-feature share."""
    trained, meta = model.load_artifact(cfg, None, granularity)
    output: dict[str, Any] = {"model_version": trained.model_version}
    for label, quantile in (("p50", 0.5), ("p95", 0.95)):
        fitted = trained.models[quantile]
        # loaded artifacts carry a plain lgb.Booster; in-memory models carry the sklearn wrapper
        booster = fitted.booster.booster_ if hasattr(fitted.booster, "booster_") else fitted.booster
        names = list(booster.feature_name())
        gains = np.asarray(booster.feature_importance(importance_type="gain"), dtype=float)
        order = np.argsort(gains)[::-1]
        total = float(gains.sum()) or 1.0
        top = [{"feature": names[index], "gain": round(float(gains[index]), 2),
                "share": round(float(gains[index] / total), 4)} for index in order[:15]]
        output[label] = {"top": top, "top1_share": top[0]["share"] if top else 0.0,
                         "features": int(len(names))}
    return output


# ------------------------------------------------------------------------------------- assembly

def gate_checks(model_frame: pd.DataFrame, base_frame: pd.DataFrame, cfg: ForecastConfig,
                split: str) -> dict:
    """Gate vs all must-beat baselines on the common rows, both filters."""
    must_beat = [str(name) for name in cfg.evaluation["gate"]["must_beat_baselines"]]
    result: dict[str, Any] = {"split": split, "scope": "common row set", "must_beat": must_beat,
                              "quantiles": [0.5, 0.9, 0.95], "checks": {}, "passed": None}
    filters = {"all_rows": lambda frame: frame,
               "no_stockout_rows": lambda frame: frame.loc[frame["target_stockout_days"] == 0]}
    for filter_name, selector in filters.items():
        model_subset = selector(model_frame)
        model_metrics = _model_pooled(model_subset, cfg)
        checks: dict[str, Any] = {}
        for name in must_beat:
            subset = selector(base_frame.loc[base_frame["baseline"] == name])
            if subset.empty:
                checks[name] = {"note": "missing side", "beats": False}
                continue
            base_metrics = _model_pooled(subset, cfg)
            deltas = {str(q): round(model_metrics["pinball"][str(q)] - base_metrics["pinball"][str(q)], 4)
                      for q in GATE_QUANTILES}
            checks[name] = {"model_pinball": {str(q): model_metrics["pinball"][str(q)] for q in GATE_QUANTILES},
                            "baseline_pinball": {str(q): base_metrics["pinball"][str(q)] for q in GATE_QUANTILES},
                            "delta": deltas,
                            "beats": all(value < 0 for value in deltas.values())}
        result["checks"][filter_name] = checks
    result["passed"] = all(entry["beats"] for checks in result["checks"].values()
                           for entry in checks.values())
    return result


def build_report(cfg: ForecastConfig, granularity: str = "BOTH") -> dict:
    """Compute the Phase 6a evaluation for one or both granularities and write reports/."""
    requested = GRANULARITIES if str(granularity).upper() == "BOTH" else (model.granularity_key(granularity),)
    report: dict = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "caveat": CAVEAT,
                    "definitions": {
                        "total_target": "P95 for VED V, P90 for E, none for D, floored at P50",
                        "stockout_rate": "share of rows with y > TT",
                        "overstock_rate": "share of rows with origin_stock > 2 x TT",
                        "under_thb": "sum(max(0, y - TT) * unit_price)",
                        "over_thb": "mean(max(0, stock - TT)) * mean(price)",
                        "pinball_contribution": "sum over rows and all seven quantiles",
                        "coverage_miss": "|cov90 - 0.90| + |cov95 - 0.95|",
                        "crossing_fraction": "(lower_raw - upper_raw) / max(P50, 1) on crossing rows",
                        "low_confidence_rows": LOW_CONFIDENCE_ROWS,
                        "slice_filter": "all rows; slices are computed on the common row set",
                    },
                    "granularities": {}}

    threshold = int(cfg.evaluation["low_n_threshold"])
    for key in requested:
        block: dict = {"gate": {}, "splits": {}, "importance": feature_importance(cfg, key),
                       "verification": verify_aggregates(cfg, key)}
        for split in ("valid", "test"):
            model_frame, base_frame, info = _common(cfg, key, split)
            series = series_tables(model_frame, cfg, threshold)
            block["splits"][split] = {
                **info,
                "slices": slice_tables(model_frame, base_frame, cfg),
                "series": {name: value for name, value in series.items() if name != "table"},
                "tt": tt_tables(model_frame, base_frame, cfg, model.MODEL_BASELINE_NAMES[key]),
                "crossing": crossing_tables(model_frame),
            }
            block["gate"][split] = gate_checks(model_frame, base_frame, cfg, split)
        block["model_version"] = str(model.load_artifact(cfg, None, key)[0].model_version)
        report["granularities"][key] = block

    paths = write_reports(cfg, report)
    report["paths"] = {name: str(path) for name, path in paths.items()}
    return report


# ------------------------------------------------------------------------------------ rendering

def _fmt(value: Any, digits: int = 4) -> str:
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def _slice_lines(entries: Sequence[Mapping[str, Any]]) -> list[str]:
    lines = ["| slice | rows | pin P50 | pin P90 | pin P95 | cov 0.90 | cov 0.95 | WAPE P50 | best baseline | "
             "Δ P50 / P90 / P95 | low-conf |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for entry in entries:
        pinball = entry["pinball"]
        coverage = entry["coverage"]
        delta = entry["delta_vs_best"]
        lines.append(
            f"| {entry['slice']} | {entry['rows']} | {pinball['0.5']:.2f} | {pinball['0.9']:.2f} | "
            f"{pinball['0.95']:.2f} | {coverage['0.9']:.4f} | {coverage['0.95']:.4f} | "
            f"{entry['wape_p50']:.4f} | {entry['best_baseline']} | "
            f"{delta['0.5']:+.2f} / {delta['0.9']:+.2f} / {delta['0.95']:+.2f} | "
            f"{'yes' if entry['low_confidence'] else ''} |")
    return lines


def _series_lines(rows: Sequence[Mapping[str, Any]], coverage: bool = False) -> list[str]:
    if coverage:
        lines = ["| series | hospital | item | VED | n | LOW_N | y sum | cov 0.90 | cov 0.95 | miss |",
                 "|---|---|---|---|---|---|---|---|---|---|"]
        for row in rows:
            lines.append(f"| {row['series_id']} | {row['hospital_code']} | {row['item_code']} | {row['ved']} | "
                         f"{row['n_periods']} | {'yes' if row['low_n'] else ''} | {row['y_sum']:.0f} | "
                         f"{row['coverage_0.9']:.4f} | {row['coverage_0.95']:.4f} | {row['coverage_miss']:.4f} |")
        return lines
    lines = ["| series | hospital | item | VED | n | LOW_N | pinball total | share |",
             "|---|---|---|---|---|---|---|---|"]
    for row in rows:
        lines.append(f"| {row['series_id']} | {row['hospital_code']} | {row['item_code']} | {row['ved']} | "
                     f"{row['n_periods']} | {'yes' if row['low_n'] else ''} | {row['pinball_total']:.1f} | "
                     f"{row['share']:.4f} |")
    return lines


def render_markdown(report: Mapping[str, Any]) -> str:
    """Full Phase 6a report in markdown (every table the chat prints)."""
    lines = ["# Phase 6a - evaluation report (slices, concentration, TT impact, crossings, importance)", "",
             f"Generated: {report['generated_at']}", "",
             f"**{report['caveat']}**", "",
             "## Definitions", ""]
    for name, text in report["definitions"].items():
        lines.append(f"- `{name}`: {text}")
    for key, block in report["granularities"].items():
        display = model.DISPLAY_NAMES[key]
        lines += ["", f"# {key} ({display}) - `{block['model_version']}`", ""]
        verification = block["verification"]
        lines += [f"## {key} verification - {verification['source']}", "",
                  "Recomputed from the saved row-level predictions; the frozen report is read, never written.", "",
                  "| split | rows | pinball P50 / P90 / P95 saved -> recomputed | "
                  "coverage 0.90 / 0.95 saved -> recomputed | max abs diff | matches |",
                  "|---|---|---|---|---|---|"]
        for split, entry in verification["splits"].items():
            if entry["saved"] is None:
                lines.append(f"| {split} | {entry['rows']} | - | - | - | no frozen report |")
                continue
            saved, recomputed = entry["saved"], entry["recomputed"]
            pinball = " / ".join(f"{saved['pinball'][q]} -> {recomputed['pinball'][q]}"
                                 for q in ("0.5", "0.9", "0.95"))
            coverage = " / ".join(f"{saved['coverage'][q]} -> {recomputed['coverage'][q]}"
                                  for q in ("0.9", "0.95"))
            lines.append(f"| {split} | {entry['rows']} | {pinball} | {coverage} | "
                         f"{entry['max_abs_diff']} | {entry['matches']} |")
        lines += ["", f"All splits reproduce their frozen report: **{verification['all_match']}**.", ""]
        for split in ("valid", "test"):
            data = block["splits"][split]
            gate = block["gate"][split]
            if split == "valid":
                label = "valid (selection split - coverage is optimistic)"
            elif key == "WEEK":
                label = "test (re-score of frozen model, no changes)"
            else:
                label = "test (saved row-level predictions, no re-score)"
            lines += [f"## {key} / {split} - {label}", "",
                      f"- rows: model {data['rows_model']:,}, common {data['rows_common']:,}, "
                      f"excluded {data['rows_excluded']} ({data['series_excluded']} series)",
                      f"- gate passed: **{gate['passed']}**", ""]
            lines += ["### Gate (common rows)", "",
                      "| filter | baseline | pin P50 / P90 / P95 | Δ P50 / P90 / P95 | beats |",
                      "|---|---|---|---|---|"]
            for filter_name, checks in gate["checks"].items():
                for name, entry in checks.items():
                    pinball = entry.get("model_pinball", {})
                    delta = entry.get("delta", {})
                    lines.append(
                        f"| {filter_name} | {name} | {pinball.get('0.5')} / {pinball.get('0.9')} / "
                        f"{pinball.get('0.95')} | {delta.get('0.5')} / {delta.get('0.9')} / "
                        f"{delta.get('0.95')} | {entry.get('beats')} |")
            lines += ["", "### Slices", ""]
            for dimension, entries in data["slices"].items():
                lines += [f"#### {dimension}", ""] + _slice_lines(entries) + [""]
            series = data["series"]
            lines += ["### Scale dominance", "",
                      f"- series: {series['series']}; total pinball: {series['total_pinball']}",
                      f"- top-10 share of pinball: **{series['top10_share']:.2%}**", "",
                      "Worst 15 series by pinball contribution:", ""] + _series_lines(series["worst_by_pinball"]) + [""]
            lines += ["Worst 15 series by coverage miss:", ""] + _series_lines(series["worst_by_coverage"],
                                                                            coverage=True) + [""]
            lines += ["### Total Target impact", "",
                      "| filter | method | rows | TT rows | stock-out rate | overstock rate | under THB | over THB |",
                      "|---|---|---|---|---|---|---|---|"]
            for filter_name, methods in data["tt"].items():
                for name, value in methods.items():
                    lines.append(f"| {filter_name} | {name} | {value['rows']} | {value['total_target_rows']} | "
                                 f"{value['stockout_rate_vs_tt']} | {value['overstock_rate_vs_tt']} | "
                                 f"{value['under_thb']} | {value['over_thb']} |")
            lines += ["", "### Crossing diagnostics", "",
                      "| pair | share | rows | gap median | gap p95 | gap/P50 median | gap/P50 p95 |",
                      "|---|---|---|---|---|---|---|"]
            for entry in data["crossing"]["pairs"]:
                lines.append(f"| {entry['pair']} | {entry['share']} | {entry['rows']} | {entry['gap_median']} | "
                             f"{entry['gap_p95']} | {entry['fraction_median']} | {entry['fraction_p95']} |")
            lines += ["", "Crossing rate by series-volume tercile:", "",
                      "| tercile | series | rows | any-pair rate | q90>q95 rate | median y |",
                      "|---|---|---|---|---|---|"]
            for entry in data["crossing"]["terciles"]:
                lines.append(f"| {entry['tercile']} | {entry['series']} | {entry['rows']} | "
                             f"{entry['any_crossing_rate']} | {entry['q90_q95_rate']} | {entry['median_y']} |")
            lines.append("")
        importance = block["importance"]
        lines += [f"## {key} feature importance (gain)", ""]
        for label in ("p50", "p95"):
            entry = importance[label]
            lines += [f"### {label.upper()} - top-10 share {entry['top1_share']:.2%} (n={entry['features']} features)", "",
                      "| feature | gain | share |", "|---|---|---|"]
            for row in entry["top"]:
                lines.append(f"| {row['feature']} | {row['gain']} | {row['share']:.4f} |")
            lines.append("")
    return "\n".join(lines) + "\n"


def write_reports(cfg: ForecastConfig, report: Mapping[str, Any]) -> dict[str, Path]:
    """Write ``reports/evaluation.{md,json}`` and the two CSVs."""
    reports_dir = ensure_dir(cfg.reports_dir)
    paths: dict[str, Path] = {"markdown": reports_dir / "evaluation.md",
                              "json": reports_dir / "evaluation.json"}
    paths["markdown"].write_text(render_markdown(report), encoding="utf-8")

    payload = {name: value for name, value in report.items() if not name.startswith("_")}
    paths["json"].write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")

    slice_rows: list[dict] = []
    series_rows: list[dict] = []
    for key, block in report["granularities"].items():
        for split, data in block["splits"].items():
            for dimension, entries in data["slices"].items():
                for entry in entries:
                    slice_rows.append({"granularity": key, "split": split, "dimension": dimension,
                                       **{k: v for k, v in entry.items()
                                          if k not in ("pinball", "coverage", "best_baseline_pinball",
                                                       "best_baseline_coverage", "delta_vs_best")},
                                       **{f"pinball_{q}": v for q, v in entry["pinball"].items()},
                                       **{f"coverage_{q}": v for q, v in entry["coverage"].items()},
                                       **{f"delta_{q}": v for q, v in entry["delta_vs_best"].items()}})
            for group in ("worst_by_pinball", "worst_by_coverage"):
                for row in data["series"][group]:
                    series_rows.append({"granularity": key, "split": split, "group": group, **row})
    paths["slices_csv"] = reports_dir / "evaluation_slices.csv"
    pd.DataFrame(slice_rows).to_csv(paths["slices_csv"], index=False)
    paths["series_csv"] = reports_dir / "evaluation_series.csv"
    pd.DataFrame(series_rows).to_csv(paths["series_csv"], index=False)
    return paths
