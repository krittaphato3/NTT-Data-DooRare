"""Phase 6b — split-conformal calibration on the log1p scale, with the pre-registered enable rule.

Method (per quantile ``tau`` and bucket):

* score ``s = log1p(y) - log1p(q_tau)`` on the final post-processed bands (the shipped ``qXX`` columns);
* ``delta_tau`` = empirical quantile of ``s`` at level ``ceil((n + 1) * tau) / n`` (finite-sample conformal);
* calibrated band = ``expm1(log1p(q_tau) + delta_tau)``, clipped at 0, then sorted ascending per row.

All seven quantiles are fitted; the enable/disable decision only looks at ``tau = 0.90`` and ``0.95``
because those drive Total Target. Every decision uses **valid** data; the test split is scored at most
once, after the decision is frozen.

The parameters live outside the frozen model directories, under
``artifacts/calibration/<model_version>/calibration.json``.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd

from f1_forecast import model
from f1_forecast.config import ForecastConfig, ensure_dir
from f1_forecast.schema import quantile_column

QUANTILES: tuple[float, ...] = tuple(model.TRAINED_QUANTILES)
BUCKET_LABELS: tuple[str, ...] = ("low", "mid", "high")
MISSING_BUCKET = "none"

# Pre-registered rule (config/forecast.yaml mirrors these numbers).
MAX_WIDTH_RATIO = 1.10
MAX_PINBALL_INCREASE = {0.5: 0.01, 0.90: 0.03, 0.95: 0.03}
TERCILE_RELATIVE_GAIN = 0.20
MIN_BUCKET_ROWS = 500
CALIBRATION_SCALE = "log1p"
METHOD = "split_conformal_cqr"


# ------------------------------------------------------------------------------------------ scoring

def _column(tau: float) -> str:
    return quantile_column(float(tau))


def log_scores(frame: pd.DataFrame, tau: float) -> np.ndarray:
    """Per-row conformity score on the log1p scale (positive = actual above the band)."""
    actual = np.log1p(frame["y"].to_numpy(dtype=float))
    predicted = np.log1p(frame[_column(tau)].to_numpy(dtype=float))
    return actual - predicted


def conformal_offset(scores: np.ndarray, tau: float) -> float:
    """Finite-sample conformal quantile ``ceil((n+1) * tau) / n`` of the scores (``higher``)."""
    values = np.asarray(scores, dtype=float)
    if values.size == 0:
        raise ValueError("cannot calibrate on an empty score set")
    level = min(1.0, math.ceil((values.size + 1) * tau) / values.size)
    return float(np.quantile(values, level, method="higher"))


def fit_offsets(frame: pd.DataFrame) -> dict[str, float]:
    """One offset per quantile, fitted on every row of ``frame``."""
    return {str(tau): conformal_offset(log_scores(frame, tau), tau) for tau in QUANTILES}


def fit_bucket_offsets(frame: pd.DataFrame, buckets: Mapping[str, str]) -> dict[str, dict[str, float]]:
    """Per-bucket offsets; a bucket that is completely absent is skipped (reported by the caller)."""
    assignment = frame["series_id"].map(buckets)
    output: dict[str, dict[str, float]] = {}
    for label in BUCKET_LABELS:
        subset = frame.loc[assignment == label]
        if not subset.empty:
            output[label] = fit_offsets(subset)
    return output


def apply_offsets(frame: pd.DataFrame, offsets: Mapping[str, float],
                  buckets: Mapping[str, str] | None = None,
                  bucket_offsets: Mapping[str, Mapping[str, float]] | None = None) -> pd.DataFrame:
    """Apply calibration and re-sort the bands; adds ``cal_raw_qXX`` (pre-sort) for crossing diagnostics.

    Rows whose series has no bucket (no train history) fall back to the global offsets.
    """
    calibrated = frame.copy()
    assignment = calibrated["series_id"].map(buckets) if buckets is not None else None
    raw_columns: list[str] = []
    for tau in QUANTILES:
        column = _column(tau)
        offset = np.full(len(calibrated), float(offsets[str(tau)]))
        if bucket_offsets and assignment is not None:
            for label, per_bucket in bucket_offsets.items():
                mask = (assignment == label).to_numpy()
                if mask.any():
                    offset[mask] = float(per_bucket[str(tau)])
        values = np.expm1(np.log1p(calibrated[column].to_numpy(dtype=float)) + offset)
        raw_column = f"cal_raw_{column}"
        calibrated[raw_column] = np.maximum(values, 0.0)
        raw_columns.append(raw_column)
    matrix = np.sort(calibrated[raw_columns].to_numpy(dtype=float), axis=1)
    calibrated[[_column(tau) for tau in QUANTILES]] = matrix
    calibrated["calibration"] = "on"
    return calibrated


# -------------------------------------------------------------------------------------- buckets

def series_volume_buckets(train_frame: pd.DataFrame, series_ids: pd.Series | np.ndarray) -> dict[str, str]:
    """Terciles of the series mean ``y`` **in train**; series without train history are not bucketed."""
    means = train_frame.groupby("series_id", observed=True)["y"].mean()
    wanted = pd.Index(sorted(set(series_ids))).intersection(means.index)
    ranked = means.loc[wanted].sort_values(kind="mergesort")
    labels = np.empty(len(ranked), dtype=object)
    for position, chunk in enumerate(np.array_split(np.arange(len(ranked)), 3)):
        labels[chunk] = BUCKET_LABELS[position]
    return {series_id: str(label) for series_id, label in zip(ranked.index, labels)}


def bucket_row_counts(frame: pd.DataFrame, buckets: Mapping[str, str],
                      labels: tuple[str, ...] = BUCKET_LABELS) -> dict[str, int]:
    assignment = frame["series_id"].map(buckets).fillna(MISSING_BUCKET)
    return {label: int((assignment == label).sum()) for label in labels}


# ---------------------------------------------------------------------------------- valid blocks

def valid_time_blocks(origins: pd.Series, granularity: str) -> dict[str, list[pd.Timestamp]]:
    """Split valid by time: earlier half calibrates, one period gap, later half checks."""
    ordered = sorted(pd.to_datetime(pd.Series(origins).unique()))
    if len(ordered) < 4:
        raise ValueError(f"{granularity} valid has {len(ordered)} periods; need at least 4 to split")
    half = len(ordered) // 2
    calibrate = ordered[:half]
    gap = ordered[half:half + 1]
    check = ordered[half + 1:]
    return {"calibrate": calibrate, "gap": gap, "check": check}


# -------------------------------------------------------------------------------- decision metrics

def coverage_pair(frame: pd.DataFrame) -> tuple[float, float]:
    return (float((frame["y"] <= frame[_column(0.90)]).mean()),
            float((frame["y"] <= frame[_column(0.95)]).mean()))


def coverage_error(frame: pd.DataFrame) -> float:
    cov90, cov95 = coverage_pair(frame)
    return abs(cov90 - 0.90) + abs(cov95 - 0.95)


def mean_width(frame: pd.DataFrame) -> float:
    return float((frame[_column(0.95)] - frame[_column(0.05)]).mean())


def pinball_at(frame: pd.DataFrame, tau: float) -> float:
    delta = frame["y"].to_numpy(dtype=float) - frame[_column(tau)].to_numpy(dtype=float)
    return float(np.mean(np.maximum(tau * delta, (tau - 1.0) * delta)))


def crossing_rate_pre_sort(frame: pd.DataFrame) -> float:
    """Share of rows whose calibrated (pre-sort) bands are inverted at least once."""
    columns = [f"cal_raw_{_column(tau)}" for tau in QUANTILES]
    values = frame[columns].to_numpy(dtype=float)
    return float((np.diff(values, axis=1) < 0).any(axis=1).mean())


def variant_metrics(off: pd.DataFrame, calibrated: pd.DataFrame) -> dict[str, Any]:
    """Check-half metrics of one variant next to ``off``."""
    cov_off, cov_cal = coverage_pair(off), coverage_pair(calibrated)
    width_off, width_cal = mean_width(off), mean_width(calibrated)
    pinball_off = {str(tau): pinball_at(off, tau) for tau in MAX_PINBALL_INCREASE}
    pinball_cal = {str(tau): pinball_at(calibrated, tau) for tau in MAX_PINBALL_INCREASE}
    error_off = abs(cov_off[0] - 0.90) + abs(cov_off[1] - 0.95)
    error_cal = abs(cov_cal[0] - 0.90) + abs(cov_cal[1] - 0.95)
    return {
        "rows": int(len(calibrated)),
        "coverage_off": {"0.9": round(cov_off[0], 4), "0.95": round(cov_off[1], 4)},
        "coverage_calibrated": {"0.9": round(cov_cal[0], 4), "0.95": round(cov_cal[1], 4)},
        "coverage_error_off": round(error_off, 4),
        "coverage_error_calibrated": round(error_cal, 4),
        "coverage_error_gain": round(error_off - error_cal, 4),
        "width_off": round(width_off, 4),
        "width_calibrated": round(width_cal, 4),
        "width_ratio": round(width_cal / width_off, 4) if width_off else float("inf"),
        "pinball_off": {key: round(value, 4) for key, value in pinball_off.items()},
        "pinball_calibrated": {key: round(value, 4) for key, value in pinball_cal.items()},
        "pinball_ratio": {key: round(pinball_cal[key] / pinball_off[key], 4) if pinball_off[key] else float("inf")
                          for key in pinball_off},
    }


def rule_check(metrics: Mapping[str, Any]) -> dict[str, Any]:
    """Apply the three pre-registered conditions and return them with the verdict."""
    coverage_ok = bool(metrics["coverage_error_calibrated"] < metrics["coverage_error_off"])
    width_ok = bool(metrics["width_ratio"] <= MAX_WIDTH_RATIO)
    pinball_ok = bool(all(metrics["pinball_ratio"][key] <= 1.0 + limit
                          for key, limit in ((str(tau), limit) for tau, limit in MAX_PINBALL_INCREASE.items())))
    return {"coverage_improves": coverage_ok, "width_ok": width_ok, "pinball_ok": pinball_ok,
            "passes": bool(coverage_ok and width_ok and pinball_ok)}


def choose_variant(results: Mapping[str, dict[str, Any]],
                   tercile_feasible: bool) -> dict[str, Any]:
    """Pre-registered selection: global is the default; tercile must win by >=20 % on coverage error."""
    verdicts = {name: rule_check(values) for name, values in results.items() if name != "off"}
    passing = [name for name, verdict in verdicts.items() if verdict["passes"]]
    decision: dict[str, Any] = {"passing": passing, "tercile_feasible": bool(tercile_feasible)}
    if not passing:
        decision.update({"enabled": False, "variant": "off",
                         "reason": "no variant satisfies the pre-registered rule on the check half"})
        return decision
    if "tercile" in passing and "global" in passing and tercile_feasible:
        global_error = results["global"]["coverage_error_calibrated"]
        tercile_error = results["tercile"]["coverage_error_calibrated"]
        preferred = "tercile" if (global_error > 0 and
                                  tercile_error <= (1.0 - TERCILE_RELATIVE_GAIN) * global_error) else "global"
        decision.update({"enabled": True, "variant": preferred,
                         "reason": ("tercile reduces the coverage error by >=20 % vs global"
                                    if preferred == "tercile" else
                                    "global chosen: tercile does not reduce the coverage error by >=20 %")})
        return decision
    chosen = "global" if "global" in passing else "tercile"
    decision.update({"enabled": True, "variant": chosen,
                     "reason": f"only {chosen} satisfies the pre-registered rule"})
    return decision


# --------------------------------------------------------------------------------------- artifact

@dataclass
class Calibration:
    """Fitted offsets plus the provenance needed to reproduce them."""

    model_version: str
    granularity: str
    variant: str
    offsets: dict[str, float]
    bucket_offsets: dict[str, dict[str, float]] = field(default_factory=dict)
    buckets: dict[str, str] = field(default_factory=dict)
    fitted_rows: int = 0
    fitted_origins: list[str] = field(default_factory=list)
    decision: dict[str, Any] = field(default_factory=dict)

    def apply(self, frame: pd.DataFrame) -> pd.DataFrame:
        return apply_offsets(frame, self.offsets,
                             buckets=self.buckets if self.variant == "tercile" else None,
                             bucket_offsets=self.bucket_offsets if self.variant == "tercile" else None)

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_version": self.model_version,
            "granularity": self.granularity,
            "method": METHOD,
            "scale": CALIBRATION_SCALE,
            "variant": self.variant,
            "fitted_on": {"split": "valid", "rows": self.fitted_rows, "origins": self.fitted_origins},
            "offsets": {key: round(value, 6) for key, value in self.offsets.items()},
            "bucket_offsets": {label: {key: round(value, 6) for key, value in per_bucket.items()}
                               for label, per_bucket in self.bucket_offsets.items()},
            "bucket_series": dict(self.buckets),
            "decision": self.decision,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "notes": [
                "offsets are additive on log1p(q_tau); bands are clipped at 0 and sorted per row after apply",
                "decision was made on the valid check half only; test was scored once afterwards",
                "valid was also used for early stopping, so valid residuals are slightly optimistic",
            ],
        }


def settings(cfg: ForecastConfig, granularity: str) -> dict[str, Any]:
    """Per-granularity switch from ``config/forecast.yaml`` (what inference should obey)."""
    key = model.granularity_key(granularity)
    entry = cfg.calibration.get(key) or {}
    return {"enabled": bool(entry.get("enabled", False)), "variant": str(entry.get("variant", "off"))}


def calibration_path(cfg: ForecastConfig, model_version: str) -> Path:
    return cfg.artifacts_dir / "calibration" / model_version / "calibration.json"


def save_calibration(cfg: ForecastConfig, calibration: Calibration) -> Path:
    """Write ``artifacts/calibration/<model_version>/calibration.json`` (never the frozen directory)."""
    path = calibration_path(cfg, calibration.model_version)
    ensure_dir(path.parent)
    path.write_text(json.dumps(calibration.to_dict(), indent=2) + "\n", encoding="utf-8")
    return path


def load_calibration(cfg: ForecastConfig, model_version: str) -> Calibration:
    """Read the fitted offsets for a model version and rebuild the :class:`Calibration`."""
    path = calibration_path(cfg, model_version)
    if not path.exists():
        raise FileNotFoundError(f"no calibration for {model_version}: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return Calibration(
        model_version=str(payload["model_version"]),
        granularity=str(payload["granularity"]),
        variant=str(payload["variant"]),
        offsets={str(key): float(value) for key, value in payload["offsets"].items()},
        bucket_offsets={label: {str(key): float(value) for key, value in per_bucket.items()}
                        for label, per_bucket in payload.get("bucket_offsets", {}).items()},
        buckets={str(key): str(value) for key, value in payload.get("bucket_series", {}).items()},
        fitted_rows=int(payload.get("fitted_on", {}).get("rows", 0)),
        fitted_origins=list(payload.get("fitted_on", {}).get("origins", [])),
        decision=dict(payload.get("decision", {})),
    )
