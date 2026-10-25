#!/usr/bin/env python3
"""Standalone read-only value & sensitivity analysis for F1 forecasting models.

CONSTRAINT COMPLIANCE:
- Strictly read-only with respect to all existing repository files.
- Does NOT import `f1_forecast` or run any model training, inference, or pipeline code.
- Reads ONLY existing JSON reports (`reports/evaluation.json`, `reports/calibration.json`,
  `artifacts/calibration/.../calibration.json`) and existing saved row-level parquet files
  (`data/model_predictions_*.parquet`, `data/baseline_predictions_*.parquet`) for slice
  breakdowns (VED class and price tier).
- Writes ONLY `value_summary.md` and `value_summary.csv` inside `backend/models/value_analysis/`.
- All underlying data is SYNTHETIC (MOCK DATA).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths (strictly read-only outside `backend/models/value_analysis/`)
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR.parent
REPORTS_DIR = MODELS_DIR / "reports"
DATA_DIR = MODELS_DIR / "data"
CALIB_ARTIFACT_PATH = (
    MODELS_DIR
    / "artifacts"
    / "calibration"
    / "f1-WEEK-2026-09-14-f455e37770dc"
    / "calibration.json"
)

EVALUATION_JSON_PATH = REPORTS_DIR / "evaluation.json"
CALIBRATION_JSON_PATH = REPORTS_DIR / "calibration.json"

OUT_MD_PATH = SCRIPT_DIR / "value_summary.md"
OUT_CSV_PATH = SCRIPT_DIR / "value_summary.csv"

# ---------------------------------------------------------------------------
# Fixed Assumptions & Sensitivity Grid
# ---------------------------------------------------------------------------
PRIMARY_BASELINE = "seasonal_naive"
BASELINES = ("seasonal_naive", "ma_es_residual_quantile", "empirical_quantile")

HOLDING_RATES = (0.15, 0.20, 0.25)  # annual holding cost rates (base = 0.20)
BASE_HOLDING_RATE = 0.20

SHORTAGE_WEIGHTS = (0.5, 1.0, 2.0)  # THB penalty per 1 THB of Under THB (base = 1.0)
BASE_SHORTAGE_WEIGHT = 1.0

PERIODS_PER_YEAR = {"WEEK": 52, "MONTH": 12}
VED_QUANTILES = {"V": 0.95, "E": 0.90}  # D has no Total Target (NaN)
OVERSTOCK_MULTIPLE = 2.0
QUANTILE_COLS = ["q05", "q10", "q25", "q50", "q75", "q90", "q95"]

# Source line citations in `backend/models/reports/evaluation.md` and `calibration.md`
SOURCE_CITATIONS: dict[tuple[str, str, str, str], str] = {
    ("WEEK", "valid", "all_rows", "lgbm_quantile_wk"): "reports/evaluation.md:L151 (reports/evaluation.json)",
    ("WEEK", "valid", "all_rows", "seasonal_naive"): "reports/evaluation.md:L152 (reports/evaluation.json)",
    ("WEEK", "valid", "all_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L153 (reports/evaluation.json)",
    ("WEEK", "valid", "all_rows", "empirical_quantile"): "reports/evaluation.md:L154 (reports/evaluation.json)",
    ("WEEK", "valid", "no_stockout_rows", "lgbm_quantile_wk"): "reports/evaluation.md:L155 (reports/evaluation.json)",
    ("WEEK", "valid", "no_stockout_rows", "seasonal_naive"): "reports/evaluation.md:L156 (reports/evaluation.json)",
    ("WEEK", "valid", "no_stockout_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L157 (reports/evaluation.json)",
    ("WEEK", "valid", "no_stockout_rows", "empirical_quantile"): "reports/evaluation.md:L158 (reports/evaluation.json)",
    ("WEEK", "test", "all_rows", "lgbm_quantile_wk"): "reports/evaluation.md:L297 (reports/evaluation.json)",
    ("WEEK", "test", "all_rows", "seasonal_naive"): "reports/evaluation.md:L298 (reports/evaluation.json)",
    ("WEEK", "test", "all_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L299 (reports/evaluation.json)",
    ("WEEK", "test", "all_rows", "empirical_quantile"): "reports/evaluation.md:L300 (reports/evaluation.json)",
    ("WEEK", "test", "no_stockout_rows", "lgbm_quantile_wk"): "reports/evaluation.md:L301 (reports/evaluation.json)",
    ("WEEK", "test", "no_stockout_rows", "seasonal_naive"): "reports/evaluation.md:L302 (reports/evaluation.json)",
    ("WEEK", "test", "no_stockout_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L303 (reports/evaluation.json)",
    ("WEEK", "test", "no_stockout_rows", "empirical_quantile"): "reports/evaluation.md:L304 (reports/evaluation.json)",
    ("WEEK", "test", "all_rows", "lgbm_quantile_wk_calibrated"): "reports/calibration.md:L40-L45 (reports/calibration.json:L238-L249)",
    ("MONTH", "valid", "all_rows", "lgbm_quantile_mo"): "reports/evaluation.md:L499 (reports/evaluation.json)",
    ("MONTH", "valid", "all_rows", "seasonal_naive"): "reports/evaluation.md:L500 (reports/evaluation.json)",
    ("MONTH", "valid", "all_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L501 (reports/evaluation.json)",
    ("MONTH", "valid", "all_rows", "empirical_quantile"): "reports/evaluation.md:L502 (reports/evaluation.json)",
    ("MONTH", "valid", "no_stockout_rows", "lgbm_quantile_mo"): "reports/evaluation.md:L503 (reports/evaluation.json)",
    ("MONTH", "valid", "no_stockout_rows", "seasonal_naive"): "reports/evaluation.md:L504 (reports/evaluation.json)",
    ("MONTH", "valid", "no_stockout_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L505 (reports/evaluation.json)",
    ("MONTH", "valid", "no_stockout_rows", "empirical_quantile"): "reports/evaluation.md:L506 (reports/evaluation.json)",
    ("MONTH", "test", "all_rows", "lgbm_quantile_mo"): "reports/evaluation.md:L645 (reports/evaluation.json)",
    ("MONTH", "test", "all_rows", "seasonal_naive"): "reports/evaluation.md:L646 (reports/evaluation.json)",
    ("MONTH", "test", "all_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L647 (reports/evaluation.json)",
    ("MONTH", "test", "all_rows", "empirical_quantile"): "reports/evaluation.md:L648 (reports/evaluation.json)",
    ("MONTH", "test", "no_stockout_rows", "lgbm_quantile_mo"): "reports/evaluation.md:L649 (reports/evaluation.json)",
    ("MONTH", "test", "no_stockout_rows", "seasonal_naive"): "reports/evaluation.md:L650 (reports/evaluation.json)",
    ("MONTH", "test", "no_stockout_rows", "ma_es_residual_quantile"): "reports/evaluation.md:L651 (reports/evaluation.json)",
    ("MONTH", "test", "no_stockout_rows", "empirical_quantile"): "reports/evaluation.md:L652 (reports/evaluation.json)",
}


# ---------------------------------------------------------------------------
# Pure F-06 & F-24 metric helpers (reproducing `f1_forecast/metrics.py` L102-145)
# ---------------------------------------------------------------------------
def monotone_fix_df(df: pd.DataFrame) -> pd.DataFrame:
    """Sort quantile columns q05..q95 ascending per row."""
    out = df.copy()
    out[QUANTILE_COLS] = np.sort(out[QUANTILE_COLS].to_numpy(dtype=float), axis=1)
    return out


def compute_exact_conformal_offsets(valid_df: pd.DataFrame) -> dict[str, float]:
    """Reproduce exact float64 conformal offsets from `model_predictions_week_valid.parquet`
    (`calibration.md:L7`: `s = log1p(y) - log1p(q_tau)`, `quantile(s, ceil((n+1)*tau)/n, method='higher')`)."""
    tau_to_col = {
        "0.05": (0.05, "q05"),
        "0.1": (0.10, "q10"),
        "0.25": (0.25, "q25"),
        "0.5": (0.50, "q50"),
        "0.75": (0.75, "q75"),
        "0.9": (0.90, "q90"),
        "0.95": (0.95, "q95"),
    }
    n = len(valid_df)
    actual_log = np.log1p(valid_df["y"].to_numpy(dtype=float))
    offsets: dict[str, float] = {}
    for tau_str, (tau, col) in tau_to_col.items():
        scores = actual_log - np.log1p(valid_df[col].to_numpy(dtype=float))
        level = min(1.0, math.ceil((n + 1) * tau) / n)
        offsets[tau_str] = float(np.quantile(scores, level, method="higher"))
    return offsets


def apply_global_calibration(df: pd.DataFrame, offsets: dict[str, float]) -> pd.DataFrame:
    """Apply saved log1p conformal offsets, clip at 0, and sort bands ascending per row."""
    out = df.copy()
    tau_to_col = {
        "0.05": "q05",
        "0.1": "q10",
        "0.25": "q25",
        "0.5": "q50",
        "0.75": "q75",
        "0.9": "q90",
        "0.95": "q95",
    }
    for tau_str, col in tau_to_col.items():
        offset = float(offsets[tau_str])
        vals = np.expm1(np.log1p(out[col].to_numpy(dtype=float)) + offset)
        out[col] = np.maximum(vals, 0.0)
    out[QUANTILE_COLS] = np.sort(out[QUANTILE_COLS].to_numpy(dtype=float), axis=1)
    return out


def compute_tt_metrics(df: pd.DataFrame) -> dict[str, Any]:
    """Compute F-24 Total Target metrics on a monotone-sorted prediction frame."""
    fixed = monotone_fix_df(df)
    ved_str = fixed["ved"].astype(str)
    tt = pd.Series(np.nan, index=fixed.index, dtype=float)
    v_mask = ved_str == "V"
    e_mask = ved_str == "E"
    tt.loc[v_mask] = fixed.loc[v_mask, "q95"].astype(float)
    tt.loc[e_mask] = fixed.loc[e_mask, "q90"].astype(float)
    tt = np.maximum(tt, fixed["q50"].astype(float))

    valid = tt.notna()
    rows_total = int(len(fixed))
    tt_rows = int(valid.sum())
    if tt_rows == 0:
        return {
            "rows": rows_total,
            "total_target_rows": 0,
            "stockout_rate_vs_tt": float("nan"),
            "overstock_rate_vs_tt": float("nan"),
            "under_thb": 0.0,
            "over_thb": float("nan"),
            "exact_over_sum_thb": 0.0,
            "exact_over_mean_thb": float("nan"),
        }

    y_val = fixed.loc[valid, "y"].astype(float)
    tt_val = tt.loc[valid].astype(float)
    stock_val = fixed.loc[valid, "origin_stock"].astype(float)
    price_val = fixed.loc[valid, "unit_price_thb"].astype(float)

    stockout_rate = round(float((y_val > tt_val).mean()), 4)
    overstock_rate = round(float((stock_val > OVERSTOCK_MULTIPLE * tt_val).mean()), 4)
    under_thb = round(float((np.maximum(0.0, y_val - tt_val) * price_val).sum()), 2)
    # Exact F-24 / evaluation.md formula: mean(max(0, stock - TT)) * mean(price)
    over_thb = round(float(np.maximum(0.0, stock_val - tt_val).mean() * price_val.mean()), 2)
    # Also compute exact row-level sum(max(0, stock - TT) * price) and mean(max(0, stock - TT) * price)
    exact_over_sum_thb = round(float((np.maximum(0.0, stock_val - tt_val) * price_val).sum()), 2)
    exact_over_mean_thb = round(float((np.maximum(0.0, stock_val - tt_val) * price_val).mean()), 2)

    return {
        "rows": rows_total,
        "total_target_rows": tt_rows,
        "stockout_rate_vs_tt": stockout_rate,
        "overstock_rate_vs_tt": overstock_rate,
        "under_thb": under_thb,
        "over_thb": over_thb,
        "exact_over_sum_thb": exact_over_sum_thb,
        "exact_over_mean_thb": exact_over_mean_thb,
    }


# ---------------------------------------------------------------------------
# Load existing reports and row-level parquets
# ---------------------------------------------------------------------------
def load_reported_tt_data() -> dict[tuple[str, str, str, str], dict[str, Any]]:
    """Read Total Target impact figures directly from `reports/evaluation.json` and `reports/calibration.json`."""
    eval_payload = json.loads(EVALUATION_JSON_PATH.read_text(encoding="utf-8"))
    calib_payload = json.loads(CALIBRATION_JSON_PATH.read_text(encoding="utf-8"))

    records: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for gran in ("WEEK", "MONTH"):
        splits_dict = eval_payload["granularities"][gran]["splits"]
        for split in ("valid", "test"):
            tt_dict = splits_dict[split]["tt"]
            for row_filter in ("all_rows", "no_stockout_rows"):
                for method_name, metrics_val in tt_dict[row_filter].items():
                    key = (gran, split, row_filter, method_name)
                    records[key] = {
                        **metrics_val,
                        "source": SOURCE_CITATIONS.get(key, "reports/evaluation.json"),
                    }

    # Add calibrated WEEK test from `reports/calibration.json`
    wk_cal_tt = calib_payload["studies"]["WEEK"]["test"]["tt"]
    wk_cal_rows = calib_payload["studies"]["WEEK"]["test"]["rows"]
    key_cal = ("WEEK", "test", "all_rows", "lgbm_quantile_wk_calibrated")
    records[key_cal] = {
        "rows": wk_cal_rows,
        "total_target_rows": wk_cal_tt["rows"],
        "stockout_rate_vs_tt": wk_cal_tt["stockout_after"],
        "overstock_rate_vs_tt": wk_cal_tt["overstock_after"],
        "under_thb": wk_cal_tt["under_thb_after"],
        "over_thb": wk_cal_tt["over_thb_after"],
        "source": SOURCE_CITATIONS[key_cal],
    }
    return records


def load_common_row_frames(granularity: str, split: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame | None]:
    """Load saved model and baseline prediction parquets on the common row set without importing f1_forecast."""
    gran_lower = granularity.lower()
    model_path = DATA_DIR / f"model_predictions_{gran_lower}_{split}.parquet"
    base_path = DATA_DIR / f"baseline_predictions_{gran_lower}.parquet"

    model_df = pd.read_parquet(model_path)
    base_all = pd.read_parquet(base_path)
    base_df = base_all.loc[base_all["split"] == split].copy()

    # Intersect common (series_id, origin) keys across model and all 3 baselines
    keys = model_df[["series_id", "origin"]].drop_duplicates()
    for bname in BASELINES:
        bkeys = base_df.loc[base_df["baseline"] == bname, ["series_id", "origin"]].drop_duplicates()
        keys = keys.merge(bkeys, on=["series_id", "origin"], how="inner")

    common_model = model_df.merge(keys, on=["series_id", "origin"], how="inner")
    common_base = base_df.merge(keys, on=["series_id", "origin"], how="inner")

    # Attach price_tier onto common_model if missing (e.g., MONTH model parquet does not store price_tier directly,
    # whereas baseline_predictions_month.parquet carries it on every row)
    if "price_tier" not in common_model.columns:
        pt_map = (
            common_base[["series_id", "origin", "price_tier"]]
            .drop_duplicates(subset=["series_id", "origin"])
        )
        common_model = common_model.merge(pt_map, on=["series_id", "origin"], how="left")

    calibrated_model = None
    if granularity == "WEEK":
        valid_df = pd.read_parquet(DATA_DIR / "model_predictions_week_valid.parquet")
        exact_offsets = compute_exact_conformal_offsets(valid_df)
        calibrated_model = apply_global_calibration(common_model, exact_offsets)

    return common_model, common_base, calibrated_model


# ---------------------------------------------------------------------------
# Pairwise Comparison & Sensitivity Grid Calculations
# ---------------------------------------------------------------------------
def compute_comparison_row(
    granularity: str,
    split: str,
    row_filter: str,
    model_variant: str,
    baseline_name: str,
    model_metrics: dict[str, Any],
    base_metrics: dict[str, Any],
    holding_rate: float,
    shortage_weight: float,
    slice_dim: str = "ALL",
    slice_val: str = "ALL",
) -> dict[str, Any]:
    """Compute Under/Over reductions, period holding cost saving, rate changes, net value, and break-even."""
    periods = PERIODS_PER_YEAR[granularity]
    period_holding_rate = holding_rate / periods

    m_under = float(model_metrics["under_thb"])
    b_under = float(base_metrics["under_thb"])
    m_over = float(model_metrics["over_thb"])
    b_over = float(base_metrics["over_thb"])

    m_so = float(model_metrics["stockout_rate_vs_tt"])
    b_so = float(base_metrics["stockout_rate_vs_tt"])
    m_os = float(model_metrics["overstock_rate_vs_tt"])
    b_os = float(base_metrics["overstock_rate_vs_tt"])

    # 1. Under-stock reduction (baseline - model: positive = model reduces under-stock)
    under_reduction_thb = b_under - m_under
    under_reduction_pct = (under_reduction_thb / b_under * 100.0) if b_under > 0 else float("nan")

    # 2. Over-stock reduction (baseline - model: positive = model reduces over-stock)
    over_reduction_thb = b_over - m_over
    over_reduction_pct = (over_reduction_thb / b_over * 100.0) if b_over > 0 else float("nan")

    # Period-adjusted holding cost exposure & saving
    model_holding_cost_thb = m_over * period_holding_rate
    base_holding_cost_thb = b_over * period_holding_rate
    holding_cost_saving_thb = over_reduction_thb * period_holding_rate

    # 3. Stock-out rate and overstock rate change vs baseline (percentage points, model - baseline)
    stockout_rate_diff_pp = (m_so - b_so) * 100.0
    overstock_rate_diff_pp = (m_os - b_os) * 100.0

    # 4. Net value = (shortage_weight * under_reduction_thb) + holding_cost_saving_thb
    shortage_benefit_thb = shortage_weight * under_reduction_thb
    net_value_thb = shortage_benefit_thb + holding_cost_saving_thb

    # Break-even shortage_weight w* where Net Value = 0:
    # w* * under_reduction_thb + holding_cost_saving_thb = 0  =>  w* = -holding_cost_saving_thb / under_reduction_thb
    if abs(under_reduction_thb) > 1e-9:
        breakeven_w = -holding_cost_saving_thb / under_reduction_thb
    else:
        breakeven_w = float("nan")

    if under_reduction_thb > 0 and holding_cost_saving_thb >= 0:
        breakeven_regime = "DOMINATES_ALL_POSITIVE_W"
    elif under_reduction_thb <= 0 and holding_cost_saving_thb <= 0:
        breakeven_regime = "DOMINATED_NO_POSITIVE_W"
    elif under_reduction_thb > 0 and holding_cost_saving_thb < 0:
        breakeven_regime = "WIN_IF_W_GT_BREAKEVEN"
    else:
        breakeven_regime = "WIN_IF_W_LT_BREAKEVEN"

    # Newsvendor implied critical fractile tau = Cu / (Cu + Co)
    cu = shortage_weight
    co = period_holding_rate
    implied_tau = cu / (cu + co)

    return {
        "granularity": granularity,
        "split": split,
        "row_filter": row_filter,
        "slice_dimension": slice_dim,
        "slice_value": slice_val,
        "model_variant": model_variant,
        "baseline": baseline_name,
        "is_primary_baseline": baseline_name == PRIMARY_BASELINE,
        "holding_rate_annual": holding_rate,
        "periods_per_year": periods,
        "holding_rate_period": round(period_holding_rate, 8),
        "shortage_weight": shortage_weight,
        "is_base_scenario": (
            abs(holding_rate - BASE_HOLDING_RATE) < 1e-9
            and abs(shortage_weight - BASE_SHORTAGE_WEIGHT) < 1e-9
        ),
        "rows": int(model_metrics["rows"]),
        "tt_rows": int(model_metrics["total_target_rows"]),
        "baseline_under_thb": round(b_under, 2),
        "model_under_thb": round(m_under, 2),
        "under_reduction_thb": round(under_reduction_thb, 2),
        "under_reduction_pct": round(under_reduction_pct, 2) if not np.isnan(under_reduction_pct) else None,
        "baseline_over_thb": round(b_over, 2),
        "model_over_thb": round(m_over, 2),
        "over_reduction_thb": round(over_reduction_thb, 2),
        "over_reduction_pct": round(over_reduction_pct, 2) if not np.isnan(over_reduction_pct) else None,
        "baseline_holding_cost_thb": round(base_holding_cost_thb, 2),
        "model_holding_cost_thb": round(model_holding_cost_thb, 2),
        "holding_cost_saving_thb": round(holding_cost_saving_thb, 2),
        "baseline_stockout_rate": round(b_so, 4),
        "model_stockout_rate": round(m_so, 4),
        "stockout_rate_diff_pp": round(stockout_rate_diff_pp, 2),
        "baseline_overstock_rate": round(b_os, 4),
        "model_overstock_rate": round(m_os, 4),
        "overstock_rate_diff_pp": round(overstock_rate_diff_pp, 2),
        "shortage_benefit_thb": round(shortage_benefit_thb, 2),
        "net_value_thb": round(net_value_thb, 2),
        "model_wins_net_value": bool(net_value_thb > 0),
        "breakeven_shortage_weight": round(breakeven_w, 6) if not np.isnan(breakeven_w) else None,
        "breakeven_regime": breakeven_regime,
        "implied_newsvendor_tau": round(implied_tau, 6),
        "model_source": model_metrics.get("source", "row-level parquet"),
        "baseline_source": base_metrics.get("source", "row-level parquet"),
    }


def main() -> None:
    reported = load_reported_tt_data()

    # 1. Verify row-level parquet recomputation matches `reports/evaluation.md` and `reports/calibration.md`
    verification_checks: list[dict[str, Any]] = []
    slice_records: list[dict[str, Any]] = []

    for gran in ("WEEK", "MONTH"):
        for split in ("test", "valid"):
            common_model, common_base, calibrated_model = load_common_row_frames(gran, split)
            model_name = "lgbm_quantile_wk" if gran == "WEEK" else "lgbm_quantile_mo"

            # Verify all_rows pooled TT metrics against reported JSON/MD
            recomp_m = compute_tt_metrics(common_model)
            rep_m = reported[(gran, split, "all_rows", model_name)]
            diff_under = abs(recomp_m["under_thb"] - rep_m["under_thb"])
            diff_over = abs(recomp_m["over_thb"] - rep_m["over_thb"])
            verification_checks.append({
                "granularity": gran,
                "split": split,
                "method": model_name,
                "reported_under_thb": rep_m["under_thb"],
                "recomputed_under_thb": recomp_m["under_thb"],
                "reported_over_thb": rep_m["over_thb"],
                "recomputed_over_thb": recomp_m["over_thb"],
                "exact_over_sum_thb": recomp_m["exact_over_sum_thb"],
                "exact_over_mean_thb": recomp_m["exact_over_mean_thb"],
                "max_diff": round(max(diff_under, diff_over), 6),
                "matches": max(diff_under, diff_over) < 1e-6,
            })

            if gran == "WEEK" and split == "test" and calibrated_model is not None:
                recomp_cal = compute_tt_metrics(calibrated_model)
                rep_cal = reported[("WEEK", "test", "all_rows", "lgbm_quantile_wk_calibrated")]
                diff_u_cal = abs(recomp_cal["under_thb"] - rep_cal["under_thb"])
                diff_o_cal = abs(recomp_cal["over_thb"] - rep_cal["over_thb"])
                verification_checks.append({
                    "granularity": "WEEK",
                    "split": "test",
                    "method": "lgbm_quantile_wk_calibrated",
                    "reported_under_thb": rep_cal["under_thb"],
                    "recomputed_under_thb": recomp_cal["under_thb"],
                    "reported_over_thb": rep_cal["over_thb"],
                    "recomputed_over_thb": recomp_cal["over_thb"],
                    "exact_over_sum_thb": recomp_cal["exact_over_sum_thb"],
                    "exact_over_mean_thb": recomp_cal["exact_over_mean_thb"],
                    "max_diff": round(max(diff_u_cal, diff_o_cal), 6),
                    "matches": max(diff_u_cal, diff_o_cal) < 1e-6,
                })

            # Compute VED and price_tier slice breakdowns on `all_rows` for base scenario
            variants_to_slice: list[tuple[str, pd.DataFrame]] = [(model_name, common_model)]
            if gran == "WEEK" and split == "test" and calibrated_model is not None:
                variants_to_slice.append(("lgbm_quantile_wk_calibrated", calibrated_model))

            for m_var_name, m_df in variants_to_slice:
                for dim, values in (("ved", ("V", "E", "D")), ("price_tier", ("LOW", "MID", "HIGH"))):
                    for val in values:
                        m_sub = m_df.loc[m_df[dim].astype(str) == val]
                        m_sub_metrics = compute_tt_metrics(m_sub)
                        m_sub_metrics["source"] = f"data/model_predictions_{gran.lower()}_{split}.parquet ({dim}={val})"
                        for bname in BASELINES:
                            b_sub = common_base.loc[
                                (common_base["baseline"] == bname) & (common_base[dim].astype(str) == val)
                            ]
                            b_sub_metrics = compute_tt_metrics(b_sub)
                            b_sub_metrics["source"] = f"data/baseline_predictions_{gran.lower()}.parquet ({dim}={val})"
                            if m_sub_metrics["total_target_rows"] == 0:
                                slice_records.append({
                                    "granularity": gran,
                                    "split": split,
                                    "row_filter": "all_rows",
                                    "slice_dimension": dim,
                                    "slice_value": val,
                                    "model_variant": m_var_name,
                                    "baseline": bname,
                                    "is_primary_baseline": bname == PRIMARY_BASELINE,
                                    "holding_rate_annual": BASE_HOLDING_RATE,
                                    "periods_per_year": PERIODS_PER_YEAR[gran],
                                    "holding_rate_period": round(BASE_HOLDING_RATE / PERIODS_PER_YEAR[gran], 8),
                                    "shortage_weight": BASE_SHORTAGE_WEIGHT,
                                    "is_base_scenario": True,
                                    "rows": m_sub_metrics["rows"],
                                    "tt_rows": 0,
                                    "baseline_under_thb": None,
                                    "model_under_thb": None,
                                    "under_reduction_thb": None,
                                    "under_reduction_pct": None,
                                    "baseline_over_thb": None,
                                    "model_over_thb": None,
                                    "over_reduction_thb": None,
                                    "over_reduction_pct": None,
                                    "baseline_holding_cost_thb": None,
                                    "model_holding_cost_thb": None,
                                    "holding_cost_saving_thb": None,
                                    "baseline_stockout_rate": None,
                                    "model_stockout_rate": None,
                                    "stockout_rate_diff_pp": None,
                                    "baseline_overstock_rate": None,
                                    "model_overstock_rate": None,
                                    "overstock_rate_diff_pp": None,
                                    "shortage_benefit_thb": None,
                                    "net_value_thb": None,
                                    "model_wins_net_value": None,
                                    "breakeven_shortage_weight": None,
                                    "breakeven_regime": "NO_TT_DEFINED_FOR_VED_D",
                                    "implied_newsvendor_tau": round(
                                        BASE_SHORTAGE_WEIGHT / (BASE_SHORTAGE_WEIGHT + BASE_HOLDING_RATE / PERIODS_PER_YEAR[gran]),
                                        6,
                                    ),
                                    "model_source": m_sub_metrics["source"],
                                    "baseline_source": b_sub_metrics["source"],
                                })
                            else:
                                slice_records.append(
                                    compute_comparison_row(
                                        gran,
                                        split,
                                        "all_rows",
                                        m_var_name,
                                        bname,
                                        m_sub_metrics,
                                        b_sub_metrics,
                                        BASE_HOLDING_RATE,
                                        BASE_SHORTAGE_WEIGHT,
                                        slice_dim=dim,
                                        slice_val=val,
                                    )
                                )

    # 2. Full Sensitivity Grid on pooled reported figures
    grid_records: list[dict[str, Any]] = []
    model_specs = [
        ("WEEK", "test", "all_rows", "lgbm_quantile_wk"),
        ("WEEK", "test", "all_rows", "lgbm_quantile_wk_calibrated"),
        ("WEEK", "valid", "all_rows", "lgbm_quantile_wk"),
        ("MONTH", "test", "all_rows", "lgbm_quantile_mo"),
        ("MONTH", "valid", "all_rows", "lgbm_quantile_mo"),
        # Also include no_stockout_rows at base parameters for completeness
        ("WEEK", "test", "no_stockout_rows", "lgbm_quantile_wk"),
        ("WEEK", "valid", "no_stockout_rows", "lgbm_quantile_wk"),
        ("MONTH", "test", "no_stockout_rows", "lgbm_quantile_mo"),
        ("MONTH", "valid", "no_stockout_rows", "lgbm_quantile_mo"),
    ]

    for gran, split, row_filter, m_var in model_specs:
        m_metrics = reported[(gran, split, row_filter, m_var)]
        rates = HOLDING_RATES if row_filter == "all_rows" else (BASE_HOLDING_RATE,)
        weights = SHORTAGE_WEIGHTS if row_filter == "all_rows" else (BASE_SHORTAGE_WEIGHT,)
        for r in rates:
            for w in weights:
                for bname in BASELINES:
                    b_metrics = reported[(gran, split, row_filter, bname)]
                    row = compute_comparison_row(
                        gran, split, row_filter, m_var, bname, m_metrics, b_metrics, r, w
                    )
                    grid_records.append(row)

    # Annotate sign / ranking changes relative to the base scenario (r=0.20, w=1.0)
    grid_df = pd.DataFrame(grid_records)
    base_lookup: dict[tuple[str, str, str, str, str], bool] = {}
    base_ranking_lookup: dict[tuple[str, str, str, str], list[str]] = {}

    base_rows = grid_df.loc[grid_df["is_base_scenario"]]
    for _, brow in base_rows.iterrows():
        bkey = (brow["granularity"], brow["split"], brow["row_filter"], brow["model_variant"], brow["baseline"])
        base_lookup[bkey] = bool(brow["model_wins_net_value"])

    for (g, s, rf, mv), grp in base_rows.groupby(["granularity", "split", "row_filter", "model_variant"]):
        ordered = grp.sort_values("net_value_thb", ascending=False)["baseline"].tolist()
        base_ranking_lookup[(g, s, rf, mv)] = ordered

    sign_changed_list = []
    ranking_changed_list = []
    cell_rankings: dict[tuple[str, str, str, str, float, float], list[str]] = {}
    for (g, s, rf, mv, r, w), grp in grid_df.groupby(
        ["granularity", "split", "row_filter", "model_variant", "holding_rate_annual", "shortage_weight"]
    ):
        ordered = grp.sort_values("net_value_thb", ascending=False)["baseline"].tolist()
        cell_rankings[(g, s, rf, mv, r, w)] = ordered

    for _, row in grid_df.iterrows():
        bkey = (row["granularity"], row["split"], row["row_filter"], row["model_variant"], row["baseline"])
        rkey = (row["granularity"], row["split"], row["row_filter"], row["model_variant"])
        ckey = (
            row["granularity"],
            row["split"],
            row["row_filter"],
            row["model_variant"],
            row["holding_rate_annual"],
            row["shortage_weight"],
        )
        sign_changed_list.append(bool(row["model_wins_net_value"]) != base_lookup[bkey])
        ranking_changed_list.append(cell_rankings[ckey] != base_ranking_lookup[rkey])

    grid_df["sign_changed_vs_base"] = sign_changed_list
    grid_df["ranking_changed_vs_base"] = ranking_changed_list

    slice_df = pd.DataFrame(slice_records)
    slice_df["sign_changed_vs_base"] = False
    slice_df["ranking_changed_vs_base"] = False

    full_csv_df = pd.concat([grid_df, slice_df], ignore_index=True)
    full_csv_df.to_csv(OUT_CSV_PATH, index=False)

    # Render Markdown report
    md_text = render_markdown_report(reported, grid_df, slice_df, verification_checks)
    OUT_MD_PATH.write_text(md_text, encoding="utf-8")
    print(f"Wrote {OUT_CSV_PATH} ({len(full_csv_df)} rows)")
    print(f"Wrote {OUT_MD_PATH} ({len(md_text.splitlines())} lines)")


def render_markdown_report(
    reported: dict[tuple[str, str, str, str], dict[str, Any]],
    grid_df: pd.DataFrame,
    slice_df: pd.DataFrame,
    verification_checks: list[dict[str, Any]],
) -> str:
    """Render comprehensive, transparent Markdown summary."""
    lines: list[str] = [
        "# Value of Reducing Under-Stock and Over-Stock — Forecasting Model Summary",
        "",
        "> **WARNING — SYNTHETIC MOCK DATA:** Every figure in this report is computed from the synthetic",
        "> DooRare data pack (`db/mock/generate.py` / `data/DooRare-F1-Monthly-Pack/`). These numbers reflect",
        "> how the quantile LightGBM models and baselines interact with the synthetic generator and simulated",
        "> hospital reorder rules. **Never cite these figures as real-world clinical or financial savings.**",
        "",
        "---",
        "",
        "## 1. Executive Summary & Robustness Verdict",
        "",
        "- **Conclusion robust to parameter choice (`holding_rate ∈ {15%, 20%, 25%}` × `shortage_weight ∈ {0.5, 1.0, 2.0}`): YES**",
        "  - Across all **9 parameter cells** (`3 holding rates × 3 shortage weights`), **zero cells change sign** (`sign_changed_vs_base = False` for every granularity, split, model variant, and baseline) and **zero cells change baseline ranking** (`ranking_changed_vs_base = False` everywhere).",
        "  - Why is the sign invariant across the grid? Because period-adjusted holding cost savings (`ΔOver THB × rate / 52` or `rate / 12`) are on the order of **-2.81 THB to -230.96 THB** per split, whereas shortage reductions (`shortage_weight × ΔUnder THB`) are on the order of **±620 THB to ±500,141 THB**. Thus the sign of Net Value is governed almost entirely by whether the model reduces `Under THB` relative to the baseline.",
        "- **Does the model uniformly beat the baselines on value? NO.**",
        "  - **Where the model WINS on Net Value (positive Net Value across all 9 grid cells):**",
        "    1. **WEEK / test (`all_rows`, uncalibrated `lgbm_quantile_wk`):** Beats all 3 baselines — **+40,066.14 THB** vs. `seasonal_naive` (primary baseline), **+59,750.77 THB** vs. `ma_es_residual_quantile`, and **+138,104.96 THB** vs. `empirical_quantile` at base assumptions (`rate = 20%`, `shortage_weight = 1.0`).",
        "    2. **WEEK / test (`all_rows`, calibrated `lgbm_quantile_wk_calibrated`):** Global split-conformal calibration raises Total Target slightly (`+0.011387` at P90, `+0.010951` at P95 on `log1p`), cutting `Under THB` by a further **22,227.20 THB** and slightly trimming `Over THB` by **1,178.02 THB**, improving Net Value to **+62,297.87 THB** vs. `seasonal_naive`, **+81,982.50 THB** vs. `ma_es_residual_quantile`, and **+160,336.69 THB** vs. `empirical_quantile`.",
        "    3. **MONTH / test (`all_rows`, uncalibrated `lgbm_quantile_mo`):** Beats `ma_es_residual_quantile` (**+1,109.59 THB** at base; **+456.73 THB** at `w=0.5, r=25%`) and strongly beats `empirical_quantile` (**+250,064.87 THB** at base).",
        "    4. **MONTH / valid (`all_rows`, uncalibrated `lgbm_quantile_mo`):** Beats `ma_es_residual_quantile` (**+178,101.75 THB** at base) and `empirical_quantile` (**+231,542.73 THB** at base).",
        "  - **Where the model LOSES on Net Value (negative Net Value across all 9 grid cells):**",
        "    1. **MONTH / test vs. `seasonal_naive` (primary baseline):** Model loses by **-122,082.67 THB** at base (`Under THB` is **239,425.34 THB** vs. `seasonal_naive` **117,431.09 THB**, an increase of **+121,994.25 THB / +103.89%** in under-stock exposure, plus **+5,305.17 THB / +27.65%** higher `Over THB`).",
        "    2. **MONTH / valid vs. `seasonal_naive` (primary baseline):** Model loses by **-20,294.05 THB** at base (`Under THB` is **173,104.42 THB** vs. **152,955.72 THB**, and `Over THB` is **60,795.77 THB** vs. **52,074.98 THB**).",
        "    3. **WEEK / valid vs. ALL 3 baselines:** Model loses vs. `seasonal_naive` (**-104,303.91 THB**), vs. `ma_es_residual_quantile` (**-21,712.36 THB**), and vs. `empirical_quantile` (**-4,444.57 THB**) at base because the model's narrower bands on the selection split yield higher `Under THB` (**172,389.73 THB**) and higher `Over THB` (**237,113.77 THB**) than all three baselines.",
        "    4. **Over-stock exposure (`Over THB`) and Overstock Rate (`origin_stock > 2 × TT`) in EVERY split and granularity:** Because the LightGBM quantile model produces **narrower prediction intervals** (lower `TT`) than `seasonal_naive` and `ma_es_residual_quantile`, existing hospital stock (`origin_stock`) sits further above `TT`. Consequently, under the F-24 formula `Over THB = mean(max(0, stock - TT)) * mean(price)`, the model has **higher `Over THB` (negative over-stock reduction)** against **every baseline in every split**.",
        "",
        "---",
        "",
        "## 2. Service Levels, Assumptions & Formulas",
        "",
        "### 2.1 Fixed Service Levels & Total Target (`F-06`, `F-24`)",
        "- **Quantiles trained:** `[0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]` on `log1p(y_target)`, inverted via `expm1`, clipped at `0`, and monotone-fixed per row (`backend/models/config/forecast.yaml:L35`, `backend/models/f1_forecast/metrics.py:L102-L119`).",
        "- **Total Target (`TT`):** `P95` for `VED = V`, `P90` for `VED = E`, undefined (`NaN`, excluded from TT metrics) for `VED = D`, floored at `P50` (`TT = max(TT, P50)`). Citations: `backend/models/reports/evaluation.md:L9`, `backend/models/config/forecast.yaml:L191`.",
        "- **Stock-out Rate:** `mean(y > TT)` over rows with a valid `TT` (`V` and `E` rows). Citation: `backend/models/reports/evaluation.md:L10`.",
        "- **Overstock Rate:** `mean(origin_stock > 2 × TT)` over rows with a valid `TT`. Citation: `backend/models/reports/evaluation.md:L11`.",
        "- **Under THB:** `sum(max(0, y - TT) × unit_price_thb)` over all `TT` rows in the split. Citation: `backend/models/reports/evaluation.md:L12`, `backend/models/f1_forecast/metrics.py:L143`.",
        "- **Over THB:** `mean(max(0, origin_stock - TT)) × mean(unit_price_thb)` over all `TT` rows in the split. Citation: `backend/models/reports/evaluation.md:L13`, `backend/models/f1_forecast/metrics.py:L144`.",
        "",
        "### 2.2 Economic Value Assumptions & Formulas",
        "- **Primary baseline (\"current practice\"):** `seasonal_naive` (same week 52 weeks ago for `WEEK`, same month 12 months ago for `MONTH`, with its own 1-step-ahead residual quantiles). Comparisons against `ma_es_residual_quantile` (`F-03`/`F-04`) and `empirical_quantile` are also reported in full.",
        "- **Under-stock reduction (`ΔUnder THB` and `%ΔUnder`):**",
        "  $$\\Delta\\text{Under THB} = \\text{Under THB}_{\\text{baseline}} - \\text{Under THB}_{\\text{model}}, \\qquad \\%\\Delta\\text{Under} = \\frac{\\text{Under THB}_{\\text{baseline}} - \\text{Under THB}_{\\text{model}}}{\\text{Under THB}_{\\text{baseline}}} \\times 100\\%$$",
        "- **Over-stock reduction (`ΔOver THB` and `%ΔOver`):**",
        "  $$\\Delta\\text{Over THB} = \\text{Over THB}_{\\text{baseline}} - \\text{Over THB}_{\\text{model}}, \\qquad \\%\\Delta\\text{Over} = \\frac{\\text{Over THB}_{\\text{baseline}} - \\text{Over THB}_{\\text{model}}}{\\text{Over THB}_{\\text{baseline}}} \\times 100\\%$$",
        "- **Period-adjusted Holding Cost Saving (`Holding Saving THB`):**",
        "  - Annual holding rate $r \\in \\{15\\%, 20\\%, 25\\%\\}$ (base $r = 20\\%$) is converted to the forecast period via $P = 52$ (`WEEK`) or $P = 12$ (`MONTH`):",
        "  $$\\text{Holding Cost}_{\\text{method}} = \\text{Over THB}_{\\text{method}} \\times \\frac{r}{P}, \\qquad \\text{Holding Saving THB} = \\Delta\\text{Over THB} \\times \\frac{r}{P}$$",
        "- **Rate Changes (percentage points, `pp`):**",
        "  $$\\Delta\\text{Stock-out Rate (pp)} = (\\text{stockout\\_rate}_{\\text{model}} - \\text{stockout\\_rate}_{\\text{baseline}}) \\times 100$$",
        "  $$\\Delta\\text{Overstock Rate (pp)} = (\\text{overstock\\_rate}_{\\text{model}} - \\text{overstock\\_rate}_{\\text{baseline}}) \\times 100$$",
        "- **Net Value (`THB`):**",
        "  $$\\text{Net Value (THB)} = \\left(\\text{shortage\\_weight} \\times \\Delta\\text{Under THB}\\right) + \\text{Holding Saving THB}$$",
        "  where $\\text{shortage\\_weight} \\in \\{0.5, 1.0, 2.0\\}$ (base $= 1.0$).",
        "- **Break-even `shortage_weight` ($w^*$):**",
        "  $$w^* = -\\frac{\\text{Holding Saving THB}}{\\Delta\\text{Under THB}} = \\frac{(r / P) \\times (\\text{Over THB}_{\\text{model}} - \\text{Over THB}_{\\text{baseline}})}{\\text{Under THB}_{\\text{baseline}} - \\text{Under THB}_{\\text{model}}}$$",
        "  *(Note: When $\\Delta\\text{Under THB} < 0$ and $\\text{Holding Saving THB} < 0$, the algebraic ratio $w^*$ is negative, meaning the model is strictly dominated on both terms and **no positive `shortage_weight > 0` can yield a positive Net Value**.)*",
        "",
        "### 2.3 Citation of Repo's Existing Holding-Cost Definition (`F-31` / `ASM-40`) & Scaling Flag",
        "1. **Repo specification (`specification/04-rules-formulas.md:L525-L532` F-31 & `specification/01-foundation.md:L217` ASM-40):**",
        "   - Defines `overstock_reduction = (baseline_avg_excess_value - current_avg_excess_value) × holding_cost_rate (default 0.10/yr, pro-rated)`.",
        "   - **Difference #1 (Rate):** `ASM-40` / `F-31` uses a default annual holding cost rate of **10%/yr** (`0.10`), whereas this analysis uses the requested sensitivity grid **15%, 20% (base), 25%/yr** pro-rated by `/52` (weekly) and `/12` (monthly).",
        "   - **Difference #2 (`Over THB` vs `Under THB` aggregation scale in `f1_forecast/metrics.py:L143-L144`):**",
        "     - `Under THB = sum(max(0, y - TT) * unit_price)` sums across **all `TT` rows** in the evaluation split (`4,368` series-weeks in `WEEK` = `156 V/E series × 28 weeks`; `1,872` series-months in `MONTH` = `156 V/E series × 12 months`).",
        "     - `Over THB = mean(max(0, stock - TT)) * mean(price)` is a **per-row mean** (the unweighted average excess units per series-period multiplied by the unweighted average unit price across rows), **not** summed across the `156` series or `28`/`12` periods, and **not** the mean of row-level products `mean(max(0, stock - TT) * price)`. Per the task rules, we use `Over THB` and `Under THB` **unchanged** from `reports/evaluation.md` and `reports/calibration.md`, and report the exact row-level `sum(max(0, stock - TT) * price)` in Section 3.1 so the scaling difference is transparent.",
        "",
        "---",
        "",
        "## 3. Input Data & Source Citations (`MOCK DATA`)",
        "",
        "| Granularity | Split | Row Filter | Method / Variant | Rows | TT Rows | Stock-out Rate | Overstock Rate | Under THB | Over THB | Source Citation |",
        "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|",
    ]

    ordered_keys = [
        ("WEEK", "test", "all_rows", "lgbm_quantile_wk"),
        ("WEEK", "test", "all_rows", "lgbm_quantile_wk_calibrated"),
        ("WEEK", "test", "all_rows", "seasonal_naive"),
        ("WEEK", "test", "all_rows", "ma_es_residual_quantile"),
        ("WEEK", "test", "all_rows", "empirical_quantile"),
        ("WEEK", "valid", "all_rows", "lgbm_quantile_wk"),
        ("WEEK", "valid", "all_rows", "seasonal_naive"),
        ("WEEK", "valid", "all_rows", "ma_es_residual_quantile"),
        ("WEEK", "valid", "all_rows", "empirical_quantile"),
        ("MONTH", "test", "all_rows", "lgbm_quantile_mo"),
        ("MONTH", "test", "all_rows", "seasonal_naive"),
        ("MONTH", "test", "all_rows", "ma_es_residual_quantile"),
        ("MONTH", "test", "all_rows", "empirical_quantile"),
        ("MONTH", "valid", "all_rows", "lgbm_quantile_mo"),
        ("MONTH", "valid", "all_rows", "seasonal_naive"),
        ("MONTH", "valid", "all_rows", "ma_es_residual_quantile"),
        ("MONTH", "valid", "all_rows", "empirical_quantile"),
        ("WEEK", "test", "no_stockout_rows", "lgbm_quantile_wk"),
        ("WEEK", "test", "no_stockout_rows", "seasonal_naive"),
        ("WEEK", "test", "no_stockout_rows", "ma_es_residual_quantile"),
        ("WEEK", "test", "no_stockout_rows", "empirical_quantile"),
        ("WEEK", "valid", "no_stockout_rows", "lgbm_quantile_wk"),
        ("WEEK", "valid", "no_stockout_rows", "seasonal_naive"),
        ("WEEK", "valid", "no_stockout_rows", "ma_es_residual_quantile"),
        ("WEEK", "valid", "no_stockout_rows", "empirical_quantile"),
        ("MONTH", "test", "no_stockout_rows", "lgbm_quantile_mo"),
        ("MONTH", "test", "no_stockout_rows", "seasonal_naive"),
        ("MONTH", "test", "no_stockout_rows", "ma_es_residual_quantile"),
        ("MONTH", "test", "no_stockout_rows", "empirical_quantile"),
        ("MONTH", "valid", "no_stockout_rows", "lgbm_quantile_mo"),
        ("MONTH", "valid", "no_stockout_rows", "seasonal_naive"),
        ("MONTH", "valid", "no_stockout_rows", "ma_es_residual_quantile"),
        ("MONTH", "valid", "no_stockout_rows", "empirical_quantile"),
    ]

    for key in ordered_keys:
        gran, split, rf, method = key
        d = reported[key]
        lines.append(
            f"| {gran} | {split} | `{rf}` | `{method}` | {d['rows']:,} | {d['total_target_rows']:,} | "
            f"{d['stockout_rate_vs_tt']:.4f} | {d['overstock_rate_vs_tt']:.4f} | "
            f"{d['under_thb']:,.2f} | {d['over_thb']:,.2f} | `{d['source']}` |"
        )

    lines += [
        "",
        "### 3.1 Verification of Saved Row-Level Parquets vs. Frozen Reports",
        "",
        "| Granularity | Split | Method | Reported Under THB | Recomputed Under THB | Reported Over THB (`mean×mean`) | Recomputed Over THB (`mean×mean`) | Exact Row Mean `mean(excess×price)` | Exact Row Sum `sum(excess×price)` | Max Diff | Matches |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for vc in verification_checks:
        lines.append(
            f"| {vc['granularity']} | {vc['split']} | `{vc['method']}` | "
            f"{vc['reported_under_thb']:,.2f} | {vc['recomputed_under_thb']:,.2f} | "
            f"{vc['reported_over_thb']:,.2f} | {vc['recomputed_over_thb']:,.2f} | "
            f"{vc['exact_over_mean_thb']:,.2f} | {vc['exact_over_sum_thb']:,.2f} | "
            f"{vc['max_diff']:.6f} | **{vc['matches']}** |"
        )

    # 4. Base-Case Value Summary Table
    lines += [
        "",
        "---",
        "",
        "## 4. Base-Case Value Summary (`holding_rate = 20%/yr`, `shortage_weight = 1.0`, `MOCK DATA`)",
        "",
        "Formulas:",
        "- `ΔUnder THB = Baseline Under THB - Model Under THB` (`+` = model reduces shortage exposure)",
        "- `ΔOver THB = Baseline Over THB - Model Over THB` (`+` = model reduces over-holding exposure; `-` = model increases over-holding exposure)",
        "- `Holding Saving THB = ΔOver THB × (0.20 / 52)` for `WEEK`, `ΔOver THB × (0.20 / 12)` for `MONTH`",
        "- `Net Value THB = (1.0 × ΔUnder THB) + Holding Saving THB`",
        "",
        "### 4.1 Primary Split (`test`, `all_rows`) and Secondary Split (`valid`, `all_rows`)",
        "",
        "| Granularity | Split | Model Variant | Baseline (`*` = Primary) | ΔUnder THB | %ΔUnder | ΔOver THB | %ΔOver | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) | Model Wins? |",
        "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]

    base_all_rows = grid_df.loc[(grid_df["row_filter"] == "all_rows") & (grid_df["is_base_scenario"])]
    for _, r in base_all_rows.iterrows():
        b_label = f"`{r['baseline']}`*" if r["is_primary_baseline"] else f"`{r['baseline']}`"
        lines.append(
            f"| {r['granularity']} | {r['split']} | `{r['model_variant']}` | {b_label} | "
            f"{r['under_reduction_thb']:+,.2f} | {r['under_reduction_pct']:+.2f}% | "
            f"{r['over_reduction_thb']:+,.2f} | {r['over_reduction_pct']:+.2f}% | "
            f"{r['holding_cost_saving_thb']:+,.2f} | "
            f"{r['stockout_rate_diff_pp']:+.2f} pp | {r['overstock_rate_diff_pp']:+.2f} pp | "
            f"**{r['net_value_thb']:+,.2f}** | **{'YES' if r['model_wins_net_value'] else 'NO'}** |"
        )

    lines += [
        "",
        "### 4.2 Uncensored Filter Check (`no_stockout_rows`, Base Scenario `holding_rate = 20%/yr`, `shortage_weight = 1.0`)",
        "",
        "| Granularity | Split | Model Variant | Baseline (`*` = Primary) | ΔUnder THB | %ΔUnder | ΔOver THB | %ΔOver | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) | Model Wins? |",
        "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    base_ns_rows = grid_df.loc[(grid_df["row_filter"] == "no_stockout_rows") & (grid_df["is_base_scenario"])]
    for _, r in base_ns_rows.iterrows():
        b_label = f"`{r['baseline']}`*" if r["is_primary_baseline"] else f"`{r['baseline']}`"
        lines.append(
            f"| {r['granularity']} | {r['split']} | `{r['model_variant']}` | {b_label} | "
            f"{r['under_reduction_thb']:+,.2f} | {r['under_reduction_pct']:+.2f}% | "
            f"{r['over_reduction_thb']:+,.2f} | {r['over_reduction_pct']:+.2f}% | "
            f"{r['holding_cost_saving_thb']:+,.2f} | "
            f"{r['stockout_rate_diff_pp']:+.2f} pp | {r['overstock_rate_diff_pp']:+.2f} pp | "
            f"**{r['net_value_thb']:+,.2f}** | **{'YES' if r['model_wins_net_value'] else 'NO'}** |"
        )
    lines.append(
        "\n*Note on `MONTH / test` (`no_stockout_rows`): When stock-out-censored target months are excluded (leaving 1,898 common rows, 1,783 TT rows), `lgbm_quantile_mo` also loses to `ma_es_residual_quantile` (`Under THB` 188,228.13 vs. 130,530.74, `Net Value = -57,827.48 THB`), whereas on `all_rows` (1,992 rows) `lgbm_quantile_mo` edges out `ma_es_residual_quantile` by `+1,109.59 THB`.*"
    )

    # 5. Full 3x3 Sensitivity Grid
    lines += [
        "",
        "---",
        "",
        "## 5. Sensitivity Analysis Grid (`holding_rate ∈ {15%, 20%, 25%}` × `shortage_weight ∈ {0.5, 1.0, 2.0}`, `all_rows`, `MOCK DATA`)",
        "",
        "| Granularity | Split | Model Variant | Holding Rate (Annual -> Period) | Shortage Weight | Net Value vs `seasonal_naive`* (THB) | Net Value vs `ma_es_residual_quantile` (THB) | Net Value vs `empirical_quantile` (THB) | Sign Changed vs Base? | Ranking Changed vs Base? |",
        "|---|---|---|---|---:|---:|---:|---:|---|---|",
    ]

    grid_all = grid_df.loc[grid_df["row_filter"] == "all_rows"]
    group_Order = [
        ("WEEK", "test", "lgbm_quantile_wk"),
        ("WEEK", "test", "lgbm_quantile_wk_calibrated"),
        ("WEEK", "valid", "lgbm_quantile_wk"),
        ("MONTH", "test", "lgbm_quantile_mo"),
        ("MONTH", "valid", "lgbm_quantile_mo"),
    ]
    for gran, split, mv in group_Order:
        sub = grid_all.loc[
            (grid_all["granularity"] == gran)
            & (grid_all["split"] == split)
            & (grid_all["model_variant"] == mv)
        ]
        for r in HOLDING_RATES:
            for w in SHORTAGE_WEIGHTS:
                cell = sub.loc[
                    (np.isclose(sub["holding_rate_annual"], r))
                    & (np.isclose(sub["shortage_weight"], w))
                ].set_index("baseline")
                nv_sn = cell.loc["seasonal_naive", "net_value_thb"]
                nv_ma = cell.loc["ma_es_residual_quantile", "net_value_thb"]
                nv_emp = cell.loc["empirical_quantile", "net_value_thb"]
                sign_chg = bool(cell["sign_changed_vs_base"].any())
                rank_chg = bool(cell["ranking_changed_vs_base"].any())
                p_div = PERIODS_PER_YEAR[gran]
                r_per = r / p_div * 100.0
                is_base = abs(r - BASE_HOLDING_RATE) < 1e-9 and abs(w - BASE_SHORTAGE_WEIGHT) < 1e-9
                sc_label = f"{r*100:.0f}% ({r_per:.4f}%/{'wk' if gran=='WEEK' else 'mo'})" + (" **[BASE]**" if is_base else "")
                lines.append(
                    f"| {gran} | {split} | `{mv}` | {sc_label} | {w:.1f} | "
                    f"{nv_sn:+,.2f} | {nv_ma:+,.2f} | {nv_emp:+,.2f} | "
                    f"{'YES' if sign_chg else 'No'} | {'YES' if rank_chg else 'No'} |"
                )

    # 6. Break-Even Table
    lines += [
        "",
        "---",
        "",
        "## 6. Break-Even `shortage_weight` Table (`Net Value = 0`, `all_rows`, `MOCK DATA`)",
        "",
        "Formula: $w^* = \\frac{(\\text{holding\\_rate} / P) \\times (\\text{Over THB}_{\\text{model}} - \\text{Over THB}_{\\text{baseline}})}{\\text{Under THB}_{\\text{baseline}} - \\text{Under THB}_{\\text{model}}}$",
        "",
        "| Granularity | Split | Model Variant | Baseline (`*` = Primary) | ΔUnder THB | ΔOver THB | Algebraic $w^*$ (`r=15%`) | Algebraic $w^*$ (`r=20%` Base) | Algebraic $w^*$ (`r=25%`) | Operational Interpretation |",
        "|---|---|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for gran, split, mv in group_Order:
        for bname in BASELINES:
            sub = grid_all.loc[
                (grid_all["granularity"] == gran)
                & (grid_all["split"] == split)
                & (grid_all["model_variant"] == mv)
                & (grid_all["baseline"] == bname)
                & (np.isclose(grid_all["shortage_weight"], BASE_SHORTAGE_WEIGHT))
            ].set_index("holding_rate_annual")
            u_red = sub.loc[0.20, "under_reduction_thb"]
            o_red = sub.loc[0.20, "over_reduction_thb"]
            w15 = sub.loc[0.15, "breakeven_shortage_weight"]
            w20 = sub.loc[0.20, "breakeven_shortage_weight"]
            w25 = sub.loc[0.25, "breakeven_shortage_weight"]
            regime = sub.loc[0.20, "breakeven_regime"]
            b_label = f"`{bname}`*" if bname == PRIMARY_BASELINE else f"`{bname}`"
            if regime == "WIN_IF_W_GT_BREAKEVEN":
                interp = f"Model wins for any `shortage_weight > {w20:.4f}` (at base r=20%)"
            elif regime == "DOMINATED_NO_POSITIVE_W":
                interp = "**DOMINATED:** Model has higher Under THB AND higher Over THB; loses for all `w > 0`"
            else:
                interp = regime
            lines.append(
                f"| {gran} | {split} | `{mv}` | {b_label} | {u_red:+,.2f} | {o_red:+,.2f} | "
                f"{w15:+.6f} | **{w20:+.6f}** | {w25:+.6f} | {interp} |"
            )

    # 7. Newsvendor Consistency Check
    lines += [
        "",
        "---",
        "",
        "## 7. Newsvendor Critical-Fractile Consistency Check (`τ = Cu / (Cu + Co)`)",
        "",
        "Under the classical single-period newsvendor model per 1 THB of unit price:",
        "- Underage penalty per THB: $C_u = \\text{shortage\\_weight}$",
        "- Period holding cost per THB: $C_o = \\text{holding\\_rate} / P$, where $P = 52$ (`WEEK`) or $P = 12$ (`MONTH`)",
        "- Implied critical fractile: $\\tau_{\\text{implied}} = \\frac{C_u}{C_u + C_o}$",
        "- Configured Total Target service levels (`config/forecast.yaml:L191`): **V = 0.9500**, **E = 0.9000** (row-weighted nominal $= 0.9256$).",
        "",
        "| Granularity | Holding Rate (Annual) | Period $C_o = r / P$ | Shortage Weight $C_u$ | Implied $\\tau = C_u / (C_u + C_o)$ | Configured $\\tau_V = 0.95$ Mismatch ($\\tau_{\\text{implied}} - 0.95$) | Configured $\\tau_E = 0.90$ Mismatch ($\\tau_{\\text{implied}} - 0.90$) | $C_u$ Required to Match $\\tau_V=0.95$ ($19 C_o$) | $C_u$ Required to Match $\\tau_E=0.90$ ($9 C_o$) |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for gran in ("WEEK", "MONTH"):
        p_div = PERIODS_PER_YEAR[gran]
        for r in HOLDING_RATES:
            co = r / p_div
            cu_for_95 = 19.0 * co
            cu_for_90 = 9.0 * co
            for w in SHORTAGE_WEIGHTS:
                tau_imp = w / (w + co)
                lines.append(
                    f"| {gran} | {r*100:.0f}% | {co:.6f} | {w:.1f} | **{tau_imp:.4f}** | "
                    f"{tau_imp - 0.95:+.4f} | {tau_imp - 0.90:+.4f} | {cu_for_95:.4f} | {cu_for_90:.4f} |"
                )

    lines += [
        "",
        "**Mismatch Flag:**",
        "- Across all 9 grid cells, $\\tau_{\\text{implied}}$ ranges from **0.9905 to 0.9986** for `WEEK` and **0.9600 to 0.9938** for `MONTH` — substantially higher than the configured service levels **V = 0.95** and **E = 0.90**.",
        "- Equivalently, at base `holding_rate = 20%/yr`, the configured service levels $\\tau_V = 0.95$ ($C_u / C_o = 19$) and $\\tau_E = 0.90$ ($C_u / C_o = 9$) correspond to an implicit `shortage_weight` of **$C_u = 0.0731$ (V) / $0.0346$ (E)** for `WEEK` and **$C_u = 0.3167$ (V) / $0.1500$ (E)** for `MONTH`.",
        "- Per the task constraints, **service levels are kept fixed at V = P95 and E = P90**; this mismatch is reported to explain why `shortage_weight ∈ {0.5, 1.0, 2.0}` heavily penalizes any method with higher `Under THB`.",
        "",
        "---",
        "",
        "## 8. Breakdown by VED Class (`V`, `E`, `D`) and Price Tier (`LOW`, `MID`, `HIGH`)",
        "",
        "Computed directly from the saved row-level parquet files (`data/model_predictions_{week,month}_{valid,test}.parquet` and `data/baseline_predictions_{week,month}.parquet`) on the common row set (`all_rows`) under the base scenario (`holding_rate = 20%/yr`, `shortage_weight = 1.0`).",
        "",
        "- **Note on `VED = D`:** By specification (`F-06`, `evaluation.md:L9`), `D` items have **no Total Target (`TT = NaN`, `TT rows = 0`)**. Therefore `Under THB`, `Over THB`, `stock-out rate`, and `overstock rate` are undefined (`N/A`) on `D` rows.",
        "- **Note on Additivity Across Slices:** `Under THB = sum(max(0, y - TT) × price)` is **exact and additive** across slices (`Under THB(V) + Under THB(E) = Under THB(All)`). By contrast, `Over THB = mean(max(0, stock - TT)) × mean(price)` is **non-additive** across slices because it multiplies the slice mean excess units by the slice mean unit price.",
        "",
        "### 8.1 Breakdown by VED Class (`test` split primary, `valid` split secondary)",
        "",
        "| Granularity | Split | Model Variant | VED | Rows | TT Rows | Baseline (`*`=Primary) | Baseline Under THB | Model Under THB | ΔUnder THB | Baseline Over THB | Model Over THB | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) |",
        "|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    ved_sub = slice_df.loc[slice_df["slice_dimension"] == "ved"]
    for _, r in ved_sub.iterrows():
        b_label = f"`{r['baseline']}`*" if r["is_primary_baseline"] else f"`{r['baseline']}`"
        if r["tt_rows"] == 0:
            if r["baseline"] == PRIMARY_BASELINE:
                lines.append(
                    f"| {r['granularity']} | {r['split']} | `{r['model_variant']}` | **{r['slice_value']}** | "
                    f"{r['rows']:,} | 0 | *(all baselines)* | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **N/A (no TT for D)** |"
                )
            continue
        lines.append(
            f"| {r['granularity']} | {r['split']} | `{r['model_variant']}` | **{r['slice_value']}** | "
            f"{r['rows']:,} | {r['tt_rows']:,} | {b_label} | "
            f"{r['baseline_under_thb']:,.2f} | {r['model_under_thb']:,.2f} | {r['under_reduction_thb']:+,.2f} | "
            f"{r['baseline_over_thb']:,.2f} | {r['model_over_thb']:,.2f} | {r['holding_cost_saving_thb']:+,.2f} | "
            f"{r['stockout_rate_diff_pp']:+.2f} pp | {r['overstock_rate_diff_pp']:+.2f} pp | "
            f"**{r['net_value_thb']:+,.2f}** |"
        )

    lines += [
        "",
        "### 8.2 Breakdown by Price Tier (`LOW <= 50 THB`, `MID 50..1000 THB`, `HIGH >= 1000 THB`)",
        "",
        "| Granularity | Split | Model Variant | Price Tier | Rows | TT Rows | Baseline (`*`=Primary) | Baseline Under THB | Model Under THB | ΔUnder THB | Baseline Over THB | Model Over THB | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) |",
        "|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    pt_sub = slice_df.loc[slice_df["slice_dimension"] == "price_tier"]
    for _, r in pt_sub.iterrows():
        b_label = f"`{r['baseline']}`*" if r["is_primary_baseline"] else f"`{r['baseline']}`"
        lines.append(
            f"| {r['granularity']} | {r['split']} | `{r['model_variant']}` | **{r['slice_value']}** | "
            f"{r['rows']:,} | {r['tt_rows']:,} | {b_label} | "
            f"{r['baseline_under_thb']:,.2f} | {r['model_under_thb']:,.2f} | {r['under_reduction_thb']:+,.2f} | "
            f"{r['baseline_over_thb']:,.2f} | {r['model_over_thb']:,.2f} | {r['holding_cost_saving_thb']:+,.2f} | "
            f"{r['stockout_rate_diff_pp']:+.2f} pp | {r['overstock_rate_diff_pp']:+.2f} pp | "
            f"**{r['net_value_thb']:+,.2f}** |"
        )

    lines += [
        "",
        "---",
        "",
        "## 9. Where the Model Does NOT Beat the Baseline (Unfavorable Results)",
        "",
        "1. **Over-stock Exposure (`Over THB`) and Overstock Rate (`origin_stock > 2 × TT`) — Worse in 100% of pooled comparisons:**",
        "   - Across **every granularity (`WEEK`, `MONTH`), every split (`test`, `valid`), every row filter (`all_rows`, `no_stockout_rows`), and every baseline (`seasonal_naive`, `ma_es_residual_quantile`, `empirical_quantile`)**, both uncalibrated and calibrated LightGBM models have **higher `Over THB`** (negative `ΔOver THB` and negative holding cost saving) and **higher overstock rate** (`+0.39 pp` to `+10.83 pp` weekly uncalibrated; `+0.53 pp` to `+2.24 pp` monthly; only calibrated `WEEK / test` vs. `empirical_quantile` is `-0.05 pp` on overstock rate while still `-972.78 THB` worse on `Over THB`).",
        "   - Cause: The baselines (especially `seasonal_naive` and `ma_es_residual_quantile`) have wider residual intervals (higher P90/P95 and therefore higher `TT`). Because `Over THB = mean(max(0, origin_stock - TT)) × mean(price)` measures existing `origin_stock` against `TT`, a tighter/lower `TT` mechanically labels more existing hospital stock as \"over Target\".",
        "2. **`MONTH / test` vs. `seasonal_naive` (Primary Baseline) — Worse on EVERY Total-Target metric:**",
        "   - `Under THB`: Model is **239,425.34 THB** vs. `seasonal_naive` **117,431.09 THB** (**+121,994.25 THB / +103.89% worse**).",
        "   - `Over THB`: Model is **24,490.22 THB** vs. `seasonal_naive` **19,185.05 THB** (**+5,305.17 THB / +27.65% worse**).",
        "   - `Stock-out rate`: Model is **8.97%** vs. `seasonal_naive` **4.43%** (**+4.54 pp worse**; also overshoots the 7.44% nominal target).",
        "   - `Overstock rate`: Model is **15.01%** vs. `seasonal_naive` **13.73%** (**+1.28 pp worse**).",
        "   - `Net Value`: **-122,082.67 THB** at base (`rate = 20%`, `shortage_weight = 1.0`), and negative across all 9 sensitivity grid cells (ranging from **-61,063.44 THB** to **-244,099.02 THB**).",
        "3. **`MONTH / test` (`no_stockout_rows`) vs. `ma_es_residual_quantile`:**",
        "   - While `lgbm_quantile_mo` barely beats `ma_es_residual_quantile` on `all_rows` (`+1,109.59 THB`), on uncensored rows (`no_stockout_rows`) `lgbm_quantile_mo` has **higher `Under THB`** (`188,228.13 THB` vs. `130,530.74 THB`) and loses by **-57,827.48 THB**.",
        "4. **`MONTH / valid` vs. `seasonal_naive` (Primary Baseline) — Worse on EVERY Total-Target metric:**",
        "   - `Under THB`: **173,104.42 THB** vs. **152,955.72 THB** (**+20,148.70 THB / +13.17% worse**).",
        "   - `Over THB`: **60,795.77 THB** vs. **52,074.98 THB** (**+8,720.79 THB / +16.75% worse**).",
        "   - `Stock-out rate`: **7.80%** vs. **4.38%** (**+3.42 pp worse**). `Overstock rate`: **15.71%** vs. **15.28%** (**+0.43 pp worse**).",
        "   - `Net Value`: **-20,294.05 THB** at base.",
        "5. **`WEEK / valid` vs. ALL 3 Baselines (`seasonal_naive`, `ma_es_residual_quantile`, `empirical_quantile`) — Worse on EVERY Total-Target metric:**",
        "   - Model `Under THB` (**172,389.73 THB**) is higher than `seasonal_naive` (**68,188.43 THB**, Net Value **-104,303.91 THB**), `ma_es_residual_quantile` (**150,704.53 THB**, Net Value **-21,712.36 THB**), and `empirical_quantile` (**167,967.72 THB**, Net Value **-4,444.57 THB**).",
        "   - Model `stock-out rate` (**8.56%**) is higher than all 3 baselines (`4.08%`, `7.39%`, `7.55%`).",
        "6. **`WEEK / test` Stock-out Rate vs. `seasonal_naive` and `ma_es_residual_quantile`:**",
        "   - Even on `WEEK / test` where the model reduces `Under THB` against all 3 baselines, its `stock-out rate` (**8.84%** uncalibrated, **7.60%** calibrated) remains higher than `seasonal_naive` (**4.97%**, `+3.87 pp` / `+2.63 pp`) and `ma_es_residual_quantile` (**6.73%**, `+2.11 pp` / `+0.87 pp`).",
        "7. **Slice-Level Losses by VED Class and Price Tier (Base Scenario):**",
        "   - **`WEEK / test` on `VED = V` (Vital items, P95 target):** Both uncalibrated `lgbm_quantile_wk` (`Under THB = 68,257.86 THB`) and calibrated `lgbm_quantile_wk_calibrated` (`Under THB = 62,808.62 THB`) lose to `seasonal_naive` (`54,808.65 THB`; Net Value **-13,517.50 THB** uncalibrated, **-8,065.59 THB** calibrated) and to `ma_es_residual_quantile` (`53,186.87 THB`; Net Value **-15,094.45 THB** uncalibrated, **-9,642.53 THB** calibrated). The weekly model's overall test win comes entirely from `VED = E` (`+53,535.69 THB` uncalibrated / `+70,317.48 THB` calibrated vs. `seasonal_naive`).",
        "   - **`WEEK / test` on `price_tier = LOW` (`<= 50 THB`):** Both uncalibrated and calibrated weekly models lose to `seasonal_naive` (Net Value **-34,882.90 THB** uncalibrated, **-25,022.78 THB** calibrated) and to `ma_es_residual_quantile` (**-23,320.92 THB** uncalibrated, **-13,460.80 THB** calibrated); the weekly test win is driven by `MID` (`+70,275.65 THB` / `+82,182.25 THB`) and `HIGH` (`+4,720.79 THB` / `+5,182.63 THB`).",
        "   - **`MONTH / test` on `VED = E`:** Loses heavily to `seasonal_naive` (**-122,585.12 THB**) and `ma_es_residual_quantile` (**-12,203.10 THB**).",
        "   - **`MONTH / test` across Price Tiers vs. `seasonal_naive`:** Loses in **every** price tier against `seasonal_naive` — `LOW` (**-47,970.77 THB**), `MID` (**-71,527.88 THB**), and `HIGH` (**-2,571.03 THB**), and also loses in `LOW` against `ma_es_residual_quantile` (**-16,496.47 THB**).",
        "",
        "---",
        "",
        "## 10. Caveats & Limitations",
        "",
        "1. **Synthetic Data (`MOCK DATA`):** All series, usage patterns, prices, and stock snapshots come from the synthetic generator (`db/mock/generate.py`). The LightGBM models and baselines are evaluated on synthetic demand and simulated min/max stock trajectories (`reports/evaluation.md:L5`, `README.md:L603-L605`).",
        "2. **Exposure Metrics vs. Operational Cash Savings:** `Under THB` and `Over THB` in `reports/evaluation.md` are **retrospective forecast-vs-actual / stock-vs-target exposure metrics**, not realized hospital P&L cash flows. In particular, `origin_stock` is historical observed stock under the synthetic hospital's existing reorder policy — the evaluation does **not** simulate counterfactual inventory trajectories where orders were placed using the model's `TT` (`README.md:L608-L609`).",
        "3. **Pooled Aggregation & Scale Dominance (`README.md:L391`):** Pooled totals are heavily dominated by the top-10 high-volume series (which carry **62.8% / 63.2%** of `WEEK` pinball and **75.0% / 67.4%** of `MONTH` pinball on `valid` / `test`). Per-series win rates (`reports/diagnostics.md`) are near 40%–51%.",
        "4. **Asymmetric Definition of `Under THB` (Sum) vs. `Over THB` (Mean × Mean) (`f1_forecast/metrics.py:L143-L144`):** As flagged in Section 2.3 and verified in Section 3.1, `Under THB` sums over all `4,368` (`WEEK`) or `1,872` (`MONTH`) `TT` rows, whereas `Over THB = mean(max(0, stock - TT)) × mean(price)` is a single per-row average figure (and uses product-of-means rather than mean-of-products). Dividing `Over THB` by 52 or 12 therefore yields a per-row period holding cost of a few dozen THB, which is orders of magnitude smaller than cumulative `Under THB`.",
        "5. **Censored Demand (`qty_used`):** Historical demand is dispensed usage, censored on stock-out days (`3.57%` of item-days; `README.md:L606`). Both `all_rows` and `no_stockout_rows` are reported above.",
        "6. **Evaluation Periods & Common Row Set:**",
        "   - `WEEK` (`f1-WEEK-2026-09-14-f455e37770dc`): `valid` = 28 weeks (`2025-08-18` to `2026-02-23`, 4,648 common rows, 4,368 TT rows across 166 series); `test` = 28 weeks (4,648 common rows, 4,368 TT rows; 43 rows from 7 cold-start series are excluded from the common row set because `seasonal_naive` has no 52-week lag).",
        "   - `MONTH` (`f1-MONTH-2026-08-01-8f70f4a87d1e-r2`): `valid` = 12 months (`2024-08` to `2025-07`, 1,992 common rows, 1,872 TT rows); `test` = 12 months (`2025-09` to `2026-08`, 1,992 common rows, 1,872 TT rows; 1 cold-start row excluded). Every monthly series has only 12 periods per split (`LOW_N`), and conformal calibration is disabled (`calibration.md:L72`).",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
