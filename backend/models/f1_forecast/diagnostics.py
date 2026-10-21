"""Phase 6b — series-level diagnostics (Part A) and the split-conformal calibration study (Part B).

Part A reads the **frozen** row-level predictions (model + saved baselines) on the common row set and never
re-scores or retrains anything.

Part B calibrates on **valid only**: the early half of valid fits the offsets, one period is skipped and the
later half decides whether a variant passes the pre-registered rule. Only when a variant is enabled is the
test split scored, once, labelled ``calibrated test evaluation (new)``.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping

import numpy as np
import pandas as pd

from f1_forecast import calibration as calib
from f1_forecast import evaluation, metrics, model
from f1_forecast.config import ForecastConfig, ensure_dir
from f1_forecast.schema import quantile_column

CAVEAT = "MOCK DATA - not real accuracy; the pack is synthetic"
BASELINES = evaluation.BASELINES
GATE_QUANTILES: tuple[float, ...] = evaluation.GATE_QUANTILES
QUANTILES: tuple[float, ...] = tuple(model.TRAINED_QUANTILES)


def _column(tau: float) -> str:
    return quantile_column(float(tau))


def _pooled(frame: pd.DataFrame, cfg: ForecastConfig) -> dict[str, Any]:
    """Pooled metrics on the monotone-fixed bands (same helper the Phase 6a report uses)."""
    return metrics.pooled_metrics(metrics.monotone_fix(frame, list(QUANTILES)), list(QUANTILES), cfg)


# ------------------------------------------------------------------------------------------ series

def _loss_means(frame: pd.DataFrame, quantiles: tuple[float, ...]) -> pd.DataFrame:
    """Per-series mean pinball loss, one column per quantile."""
    losses: dict[str, np.ndarray] = {}
    for tau in quantiles:
        delta = frame["y"].to_numpy(dtype=float) - frame[_column(tau)].to_numpy(dtype=float)
        losses[str(tau)] = np.maximum(tau * delta, (tau - 1.0) * delta)
    table = pd.DataFrame(losses, index=frame.index)
    table["series_id"] = frame["series_id"].to_numpy()
    return table.groupby("series_id", observed=True).mean()


def _series_periods(frame: pd.DataFrame) -> pd.Series:
    return frame.groupby("series_id", observed=True).size()


def win_rate_table(model_frame: pd.DataFrame, base_frame: pd.DataFrame, cfg: ForecastConfig,
                   threshold: int) -> dict[str, Any]:
    """A1: per-series win rate against the best of the three baselines, plus the ratio distribution."""
    model_means = _loss_means(model_frame, GATE_QUANTILES)
    baseline_means = {name: _loss_means(base_frame.loc[base_frame["baseline"] == name], GATE_QUANTILES)
                      for name in BASELINES}
    periods = _series_periods(model_frame)
    low_n = periods < threshold
    output: dict[str, Any] = {
        "series": int(len(model_means)),
        "series_low_n": int(low_n.sum()),
        "series_judged": int((~low_n).sum()),
        "rows": int(len(model_frame)),
        "quantiles": {},
        "series_table": [],
    }
    for tau in GATE_QUANTILES:
        key = str(tau)
        stacked = pd.DataFrame({name: means[key] for name, means in baseline_means.items()}).reindex(model_means.index)
        best = stacked.min(axis=1)
        win = model_means[key] < best
        ratio = model_means[key] / best.where(best > 0)
        judged = ~low_n
        output["quantiles"][key] = {
            "win_rate": round(float(win.mean()), 4),
            "win_rate_judged": round(float(win[judged].mean()), 4) if judged.any() else None,
            "ties": int((model_means[key] == best).sum()),
            "median_ratio": round(float(ratio.median()), 4),
            "p10_ratio": round(float(ratio.quantile(0.10)), 4),
            "p90_ratio": round(float(ratio.quantile(0.90)), 4),
        }
        for series_id in model_means.index:
            output["series_table"].append({
                "quantile": key, "series_id": series_id,
                "n_periods": int(periods.loc[series_id]), "low_n": bool(low_n.loc[series_id]),
                "model_pinball": round(float(model_means.loc[series_id, key]), 4),
                "best_baseline_pinball": round(float(best.loc[series_id]), 4),
                "ratio": None if pd.isna(ratio.loc[series_id]) else round(float(ratio.loc[series_id]), 4),
                "win": bool(win.loc[series_id]),
            })
    return output


def scale_free_table(model_frame: pd.DataFrame, base_frame: pd.DataFrame) -> dict[str, Any]:
    """A2: per-series pinball / series mean y, summarised by the median across series."""
    def summarise(frame: pd.DataFrame) -> pd.DataFrame:
        losses = _loss_means(frame, QUANTILES).sum(axis=1)
        mean_y = frame.groupby("series_id", observed=True)["y"].mean()
        table = pd.DataFrame({"pinball": losses, "mean_y": mean_y}).dropna()
        table = table.loc[table["mean_y"] > 0]
        table["ratio"] = table["pinball"] / table["mean_y"]
        return table

    model_table = summarise(model_frame)
    output: dict[str, Any] = {
        "series": int(len(model_table)),
        "series_without_usage": int(len(_loss_means(model_frame, QUANTILES))
                                    - len(summarise(model_frame))),
        "methods": {
            "model": {
                "median": round(float(model_table["ratio"].median()), 4),
                "p10": round(float(model_table["ratio"].quantile(0.10)), 4),
                "p90": round(float(model_table["ratio"].quantile(0.90)), 4),
            }
        },
    }
    for name in BASELINES:
        table = summarise(base_frame.loc[base_frame["baseline"] == name])
        output["methods"][name] = {
            "median": round(float(table["ratio"].median()), 4),
            "p10": round(float(table["ratio"].quantile(0.10)), 4),
            "p90": round(float(table["ratio"].quantile(0.90)), 4),
        }
    return output


def tt_nominal_table(model_frame: pd.DataFrame, base_frame: pd.DataFrame, cfg: ForecastConfig) -> dict[str, Any]:
    """A3: forecast stock-out rate next to the nominal rate implied by VED (V 5 %, E 10 %)."""
    v_rows = int((model_frame["ved"].astype(str) == "V").sum())
    e_rows = int((model_frame["ved"].astype(str) == "E").sum())
    nominal = (v_rows * 0.05 + e_rows * 0.10) / (v_rows + e_rows) if (v_rows + e_rows) else float("nan")
    methods = {"model": _pooled(model_frame, cfg)["stockout_rate_vs_tt"]}
    for name in BASELINES:
        subset = base_frame.loc[base_frame["baseline"] == name]
        if not subset.empty:
            methods[name] = _pooled(subset, cfg)["stockout_rate_vs_tt"]
    return {
        "rows": int(len(model_frame)),
        "ved_rows": {"V": v_rows, "E": e_rows, "D": int((model_frame["ved"].astype(str) == "D").sum())},
        "nominal": round(float(nominal), 4),
        "methods": {name: {"rate": value, "delta_vs_nominal": round(value - nominal, 4)}
                    for name, value in methods.items()},
    }


def volume_coverage_table(model_frame: pd.DataFrame, base_frame: pd.DataFrame,
                          train_frame: pd.DataFrame) -> dict[str, Any]:
    """A4: coverage by train-volume tercile; series with no train history form a separate ``none`` bucket."""
    buckets = calib.series_volume_buckets(train_frame, model_frame["series_id"].unique())
    assignment = model_frame["series_id"].map(buckets).fillna(calib.MISSING_BUCKET)
    rows: list[dict[str, Any]] = []
    for label in (*calib.BUCKET_LABELS, calib.MISSING_BUCKET):
        subset = model_frame.loc[assignment == label]
        if subset.empty:
            continue
        entry: dict[str, Any] = {
            "bucket": label,
            "series": int(subset["series_id"].nunique()),
            "rows": int(len(subset)),
            "model": {key: round(float((subset["y"] <= subset[_column(float(key))]).mean()), 4)
                      for key in ("0.9", "0.95")},
            "baselines": {},
        }
        for name in BASELINES:
            group = base_frame.loc[(base_frame["baseline"] == name)
                                   & base_frame["series_id"].isin(subset["series_id"].unique())]
            if not group.empty:
                entry["baselines"][name] = {
                    key: round(float((group["y"] <= group[_column(float(key))]).mean()), 4)
                    for key in ("0.9", "0.95")}
        rows.append(entry)
    return {"rows": rows,
            "empty_buckets": [label for label in (*calib.BUCKET_LABELS, calib.MISSING_BUCKET)
                              if not any(entry["bucket"] == label for entry in rows)],
            "tercile_definition": "terciles of the series mean y_target inside the TRAIN split; "
                                  "series without train history -> none"}


# ---------------------------------------------------------------------------------- calibration run

def calibration_study(cfg: ForecastConfig, key: str, valid_frame: pd.DataFrame,
                      common_test: pd.DataFrame, base_test: pd.DataFrame,
                      train_frame: pd.DataFrame) -> dict[str, Any]:
    """Fit on the valid calibration half, decide on the check half, then score test once if enabled."""
    threshold = int(cfg.evaluation["low_n_threshold"])
    blocks = calib.valid_time_blocks(valid_frame["origin"], key)
    calibrate_rows = valid_frame.loc[valid_frame["origin"].isin(blocks["calibrate"])]
    check_rows = valid_frame.loc[valid_frame["origin"].isin(blocks["check"])]
    buckets = calib.series_volume_buckets(train_frame, valid_frame["series_id"].unique())
    counts = calib.bucket_row_counts(calibrate_rows, buckets)
    tercile_feasible = bool(all(counts.get(label, 0) >= calib.MIN_BUCKET_ROWS
                                for label in calib.BUCKET_LABELS))

    global_offsets = calib.fit_offsets(calibrate_rows)
    bucket_offsets = calib.fit_bucket_offsets(calibrate_rows, buckets) if tercile_feasible else {}
    off_metrics = calib.variant_metrics(check_rows, check_rows)
    results: dict[str, dict[str, Any]] = {
        "off": off_metrics,
        "global": calib.variant_metrics(check_rows, calib.apply_offsets(check_rows, global_offsets)),
    }
    if tercile_feasible:
        results["tercile"] = calib.variant_metrics(
            check_rows, calib.apply_offsets(check_rows, global_offsets, buckets=buckets,
                                            bucket_offsets=bucket_offsets))
    decision = calib.choose_variant(results, tercile_feasible)

    study: dict[str, Any] = {
        "model_version": str(model.load_artifact(cfg, None, key)[0].model_version),
        "granularity": key,
        "granularity_display": model.DISPLAY_NAMES[key],
        "blocks": {
            "calibrate": [str(pd.Timestamp(value).date()) for value in blocks["calibrate"]],
            "gap": [str(pd.Timestamp(value).date()) for value in blocks["gap"]],
            "check": [str(pd.Timestamp(value).date()) for value in blocks["check"]],
            "calibrate_rows": int(len(calibrate_rows)),
            "check_rows": int(len(check_rows)),
            "low_n_threshold": threshold,
        },
        "buckets": {"counts": counts, "tercile_feasible": tercile_feasible,
                    "min_bucket_rows": calib.MIN_BUCKET_ROWS,
                    "series": int(len(buckets))},
        "check_half": {name: {key_: value for key_, value in metrics_.items() if key_ != "rows"}
                       for name, metrics_ in results.items()},
        "decision": decision,
        "calibration_offsets_visible": {"global": {key_: round(value, 6)
                                                   for key_, value in global_offsets.items()}},
        "test": None,
    }
    if decision["enabled"]:
        final = calib.Calibration(
            model_version=study["model_version"], granularity=key, variant=decision["variant"],
            offsets=calib.fit_offsets(valid_frame),
            bucket_offsets=(calib.fit_bucket_offsets(valid_frame, buckets)
                            if decision["variant"] == "tercile" else {}),
            buckets=buckets if decision["variant"] == "tercile" else {},
            fitted_rows=int(len(valid_frame)),
            fitted_origins=[str(pd.Timestamp(value).date()) for value in sorted(valid_frame["origin"].unique())],
            decision=decision,
        )
        path = calib.save_calibration(cfg, final)
        calibrated = final.apply(common_test)
        study["calibration_file"] = str(path)
        study["test"] = _test_evaluation(common_test, calibrated, base_test, cfg, final)
    return study


def _raw_crossing(frame: pd.DataFrame) -> float:
    """Crossing rate of the frozen model's unsorted output (``raw_qXX`` columns)."""
    columns = [f"raw_{_column(tau)}" for tau in QUANTILES]
    values = frame[columns].to_numpy(dtype=float)
    return round(float((np.diff(values, axis=1) < 0).any(axis=1).mean()), 4)


def _test_evaluation(off: pd.DataFrame, calibrated: pd.DataFrame, base_test: pd.DataFrame,
                     cfg: ForecastConfig, fitted: calib.Calibration) -> dict[str, Any]:
    """One look at test: before/after per quantile, width, TT impact, crossings and the gate."""
    before, after = _pooled(off, cfg), _pooled(calibrated, cfg)
    quantiles = {
        str(tau): {
            "coverage_before": before["coverage"][str(tau)], "coverage_after": after["coverage"][str(tau)],
            "pinball_before": before["pinball"][str(tau)], "pinball_after": after["pinball"][str(tau)],
        }
        for tau in QUANTILES
    }
    v_rows = int((off["ved"].astype(str) == "V").sum())
    e_rows = int((off["ved"].astype(str) == "E").sum())
    nominal = (v_rows * 0.05 + e_rows * 0.10) / (v_rows + e_rows) if (v_rows + e_rows) else float("nan")
    gate = evaluation.gate_checks(calibrated, base_test, cfg, "test")
    return {
        "rows": int(len(off)),
        "label": "calibrated test evaluation (new)",
        "quantiles": quantiles,
        "width_before": before["width_p95_p05"],
        "width_after": after["width_p95_p05"],
        "wape_before": before["wape_p50"],
        "wape_after": after["wape_p50"],
        "tt": {
            "rows": int(before["total_target_rows"]),
            "nominal": round(float(nominal), 4),
            "stockout_before": before["stockout_rate_vs_tt"],
            "stockout_after": after["stockout_rate_vs_tt"],
            "overstock_before": before["overstock_rate_vs_tt"],
            "overstock_after": after["overstock_rate_vs_tt"],
            "under_thb_before": before["under_thb"], "under_thb_after": after["under_thb"],
            "over_thb_before": before["over_thb"], "over_thb_after": after["over_thb"],
        },
        "crossing": {
            # the frozen model's own pre-postprocess rate, then the calibrated bands before/after sorting
            "raw_before": _raw_crossing(off),
            "shipped_before": before["crossing_rate"],
            "pre_sort_after": round(calib.crossing_rate_pre_sort(calibrated), 4),
            "post_sort_after": after["crossing_rate"],
        },
        "gate": gate,
        "fitted": {"variant": fitted.variant, "rows": fitted.fitted_rows,
                   "offsets": {str(tau): round(fitted.offsets[str(tau)], 6) for tau in QUANTILES}},
    }


# -------------------------------------------------------------------------------------- rendering

def _fmt(value: Any, digits: int = 4) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "-"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def render_diagnostics(report: Mapping[str, Any]) -> str:
    lines = ["# Phase 6b - series diagnostics (frozen predictions, no changes)", "",
             f"Generated: {report['generated_at']}", "", f"**{report['caveat']}**", "",
             "Common row set, frozen row-level predictions. LOW_N uses "
             f"`evaluation.low_n_threshold = {report['low_n_threshold']}`.", ""]
    for key, block in report["granularities"].items():
        lines += [f"# {key} ({model.DISPLAY_NAMES[key]}) - `{block['model_version']}`", ""]
        for split, data in block["splits"].items():
            lines += [f"## {key} / {split}", "",
                      f"- rows {data['rows']:,}; series {data['series']} "
                      f"({data['series_low_n']} LOW_N, {data['series_judged']} judged)", ""]
            lines += ["### A1 win rate vs the best baseline (per series)", "",
                      "| tau | win rate | win rate (judged) | ties | median ratio | p10 | p90 |",
                      "|---|---|---|---|---|---|---|"]
            for tau, values in data["win_rate"]["quantiles"].items():
                lines.append(f"| {tau} | {_fmt(values['win_rate'])} | {_fmt(values['win_rate_judged'])} | "
                             f"{values['ties']} | {_fmt(values['median_ratio'])} | {_fmt(values['p10_ratio'])} | "
                             f"{_fmt(values['p90_ratio'])} |")
            lines += ["", "### A2 scale-free pinball (per-series pinball / series mean y, median across series)", "",
                      "| method | median | p10 | p90 |", "|---|---|---|---|"]
            for name, values in data["scale_free"]["methods"].items():
                lines.append(f"| {name} | {_fmt(values['median'])} | {_fmt(values['p10'])} | {_fmt(values['p90'])} |")
            lines += ["", "### A3 Total-Target stock-out rate vs nominal", "",
                      f"Nominal = ({data['tt']['ved_rows']['V']} V x 0.05 + {data['tt']['ved_rows']['E']} E x 0.10) "
                      f"/ {data['tt']['ved_rows']['V'] + data['tt']['ved_rows']['E']} = "
                      f"**{_fmt(data['tt']['nominal'])}**", "",
                      "| method | stock-out rate | delta vs nominal |", "|---|---|---|"]
            for name, values in data["tt"]["methods"].items():
                lines.append(f"| {name} | {_fmt(values['rate'])} | {values['delta_vs_nominal']:+.4f} |")
            lines += ["", "### A4 coverage by train-volume tercile", "",
                      "| bucket | series | rows | model .90 | model .95 | "
                      + " | ".join(f"{name} .90 | {name} .95" for name in BASELINES) + " |",
                      "|---|---|---|" + "---|" * (2 + 2 * len(BASELINES))]
            for entry in data["coverage"]["rows"]:
                cells = [entry["bucket"], str(entry["series"]), str(entry["rows"]),
                         _fmt(entry["model"]["0.9"]), _fmt(entry["model"]["0.95"])]
                for name in BASELINES:
                    values = entry["baselines"].get(name, {})
                    cells.extend([_fmt(values.get("0.9")), _fmt(values.get("0.95"))])
                lines.append("| " + " | ".join(cells) + " |")
            empty = data["coverage"]["empty_buckets"]
            lines += ["", f"Buckets with no rows: {', '.join(empty) if empty else 'none'} "
                          "(cold-start series have no baseline on the common row set).", ""]
    return "\n".join(lines) + "\n"


def render_calibration(report: Mapping[str, Any]) -> str:
    lines = ["# Phase 6b - split-conformal calibration decision (valid only)", "",
             f"Generated: {report['generated_at']}", "", f"**{report['caveat']}**", "",
             "Method: `s = log1p(y) - log1p(q_tau)` on the final post-processed bands; "
             "`delta_tau` = empirical quantile of `s` at `ceil((n+1)*tau)/n`; "
             "calibrated band `= expm1(log1p(q_tau) + delta_tau)`, clipped at 0, then sorted per row.", "",
             "Pre-registered rule (check half only): coverage error strictly decreases, "
             "mean width ratio <= 1.10, pinball P50 <= +1 % and P90/P95 <= +3 %. "
             "Global is preferred unless tercile cuts the coverage error by >= 20 %.", ""]
    for key, study in report["studies"].items():
        blocks = study["blocks"]
        lines += [f"# {key} ({study['granularity_display']}) - `{study['model_version']}`", "",
                  f"- calibrate: {blocks['calibrate'][0]} .. {blocks['calibrate'][-1]} "
                  f"({len(blocks['calibrate'])} periods, {blocks['calibrate_rows']:,} rows)",
                  f"- gap: {', '.join(blocks['gap']) or '-'}",
                  f"- check: {blocks['check'][0]} .. {blocks['check'][-1]} "
                  f"({len(blocks['check'])} periods, {blocks['check_rows']:,} rows)",
                  f"- tercile feasible: **{study['buckets']['tercile_feasible']}** "
                  f"(bucket rows {study['buckets']['counts']}, need >= {study['buckets']['min_bucket_rows']})", "",
                  "| variant | cov .90 off -> cal | cov .95 off -> cal | coverage error | width ratio | "
                  "pinball ratio .5/.9/.95 | passes |", "|---|---|---|---|---|---|---|"]
        for name, values in study["check_half"].items():
            ratios = values["pinball_ratio"]
            lines.append(
                f"| {name} | {_fmt(values['coverage_off']['0.9'])} -> {_fmt(values['coverage_calibrated']['0.9'])} "
                f"| {_fmt(values['coverage_off']['0.95'])} -> {_fmt(values['coverage_calibrated']['0.95'])} "
                f"| {_fmt(values['coverage_error_off'])} -> {_fmt(values['coverage_error_calibrated'])} "
                f"| {_fmt(values['width_ratio'])} "
                f"| {_fmt(ratios['0.5'])}/{_fmt(ratios['0.9'])}/{_fmt(ratios['0.95'])} "
                f"| {calib.rule_check(values)['passes'] if name != 'off' else '-'} |")
        decision = study["decision"]
        lines += ["", f"**Decision: enabled = {decision['enabled']}, variant = `{decision['variant']}`** - "
                      f"{decision['reason']}.", ""]
        test = study["test"]
        if not test:
            lines += ["No test evaluation was run for this granularity.", ""]
            continue
        lines += [f"## {key} / test - {test['label']}", "",
                  f"- rows {test['rows']:,}; width {test['width_before']} -> {test['width_after']}; "
                  f"WAPE P50 {test['wape_before']} -> {test['wape_after']}", "",
                  "| tau | coverage before -> after | pinball before -> after |", "|---|---|---|"]
        for tau, values in test["quantiles"].items():
            lines.append(f"| {tau} | {_fmt(values['coverage_before'])} -> {_fmt(values['coverage_after'])} | "
                         f"{_fmt(values['pinball_before'])} -> {_fmt(values['pinball_after'])} |")
        tt = test["tt"]
        lines += ["", "| Total Target metric | before | after |", "|---|---|---|",
                  f"| stock-out rate (nominal {_fmt(tt['nominal'])}) | {_fmt(tt['stockout_before'])} | "
                  f"{_fmt(tt['stockout_after'])} |",
                  f"| overstock rate (2x TT) | {_fmt(tt['overstock_before'])} | {_fmt(tt['overstock_after'])} |",
                  f"| under-TT THB | {tt['under_thb_before']} | {tt['under_thb_after']} |",
                  f"| over-TT THB | {tt['over_thb_before']} | {tt['over_thb_after']} |", "",
                  f"Crossing: frozen raw {test['crossing']['raw_before']}, shipped {test['crossing']['shipped_before']}, "
                  f"calibrated pre-sort {test['crossing']['pre_sort_after']}, post-sort "
                  f"{test['crossing']['post_sort_after']}.", "",
                  "| filter | baseline | pinball P50/P90/P95 | delta | beats |", "|---|---|---|---|---|"]
        for filter_name, checks in test["gate"]["checks"].items():
            for name, entry in checks.items():
                pinball = entry.get("model_pinball", {})
                delta = entry.get("delta", {})
                lines.append(f"| {filter_name} | {name} | {pinball.get('0.5')}/{pinball.get('0.9')}/"
                             f"{pinball.get('0.95')} | {delta.get('0.5')}/{delta.get('0.9')}/"
                             f"{delta.get('0.95')} | {entry.get('beats')} |")
        lines += ["", "Valid was also used for early stopping, so valid residuals are slightly optimistic and "
                      "the shift may under-correct. No parameter was adjusted after seeing test.", ""]
    return "\n".join(lines) + "\n"


# ------------------------------------------------------------------------------------------- driver

def build_diagnostics(cfg: ForecastConfig, granularity: str = "BOTH") -> dict[str, Any]:
    """Part A: A1-A4 for one or both granularities, from the saved predictions only."""
    requested = (("WEEK", "MONTH") if str(granularity).upper() == "BOTH"
                 else (model.granularity_key(granularity),))
    threshold = int(cfg.evaluation["low_n_threshold"])
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "caveat": CAVEAT,
        "label": "frozen predictions, no changes",
        "low_n_threshold": threshold,
        "granularities": {},
    }
    for key in requested:
        dataset = model.build_dataset(cfg, key)
        block: dict[str, Any] = {"model_version": str(model.load_artifact(cfg, None, key)[0].model_version),
                                 "splits": {}}
        for split in ("valid", "test"):
            model_frame, base_frame, _info = evaluation._common(cfg, key, split)
            win_rate = win_rate_table(model_frame, base_frame, cfg, threshold)
            block["splits"][split] = {
                "rows": int(len(model_frame)),
                "series": win_rate["series"],
                "series_low_n": win_rate["series_low_n"],
                "series_judged": win_rate["series_judged"],
                "win_rate": win_rate,
                "scale_free": scale_free_table(model_frame, base_frame),
                "tt": tt_nominal_table(model_frame, base_frame, cfg),
                "coverage": volume_coverage_table(model_frame, base_frame, dataset.train),
            }
        report["granularities"][key] = block
    return report


def write_diagnostics(cfg: ForecastConfig, report: Mapping[str, Any]) -> dict[str, str]:
    """Write ``reports/diagnostics.{md,json}`` plus the per-series CSV."""
    reports_dir = ensure_dir(cfg.reports_dir)
    md = reports_dir / "diagnostics.md"
    md.write_text(render_diagnostics(report), encoding="utf-8")
    js = reports_dir / "diagnostics.json"
    js.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    rows = []
    for key, block in report["granularities"].items():
        for split, data in block["splits"].items():
            for row in data["win_rate"]["series_table"]:
                rows.append({"granularity": key, "split": split, **row})
    csv_path = reports_dir / "diagnostics_series.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)
    return {"markdown": str(md), "json": str(js), "series_csv": str(csv_path)}


def build_calibration(cfg: ForecastConfig, granularity: str = "BOTH") -> dict[str, Any]:
    """Part B: fit on valid, decide on the check half, score test once when a variant is enabled."""
    requested = (("WEEK", "MONTH") if str(granularity).upper() == "BOTH"
                 else (model.granularity_key(granularity),))
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "caveat": CAVEAT,
        "method": {"name": "split_conformal_cqr", "scale": calib.CALIBRATION_SCALE,
                   "rule": {"max_width_ratio": calib.MAX_WIDTH_RATIO,
                            "max_pinball_increase": calib.MAX_PINBALL_INCREASE,
                            "tercile_relative_gain": calib.TERCILE_RELATIVE_GAIN,
                            "min_bucket_rows": calib.MIN_BUCKET_ROWS}},
        "studies": {},
    }
    for key in requested:
        dataset = model.build_dataset(cfg, key)
        model_valid, _, _ = evaluation._common(cfg, key, "valid")
        common_test, base_test, _ = evaluation._common(cfg, key, "test")
        report["studies"][key] = calibration_study(cfg, key, model_valid, common_test, base_test, dataset.train)
    return report


def write_calibration(cfg: ForecastConfig, report: Mapping[str, Any]) -> dict[str, str]:
    """Write ``reports/calibration.{md,json}`` and the decision/test CSVs."""
    reports_dir = ensure_dir(cfg.reports_dir)
    md = reports_dir / "calibration.md"
    md.write_text(render_calibration(report), encoding="utf-8")
    js = reports_dir / "calibration.json"
    js.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    decision_rows = []
    for key, study in report["studies"].items():
        for name, values in study["check_half"].items():
            decision_rows.append({"granularity": key, "variant": name, **values,
                                  "decision_enabled": study["decision"]["enabled"],
                                  "decision_variant": study["decision"]["variant"]})
    decision_csv = reports_dir / "calibration_check.csv"
    pd.DataFrame(decision_rows).to_csv(decision_csv, index=False)
    test_rows = []
    for key, study in report["studies"].items():
        if not study["test"]:
            continue
        for tau, values in study["test"]["quantiles"].items():
            test_rows.append({"granularity": key, "tau": tau, **values})
    test_csv = reports_dir / "calibration_test.csv"
    pd.DataFrame(test_rows).to_csv(test_csv, index=False)
    return {"markdown": str(md), "json": str(js), "check_csv": str(decision_csv), "test_csv": str(test_csv)}
