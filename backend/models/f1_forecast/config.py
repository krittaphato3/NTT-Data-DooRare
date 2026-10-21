"""Typed configuration for the F1 quantile forecasting module.

Everything the pipeline needs (paths, quantiles, splits, hyper-parameters, gates) is read from
``backend/models/config/forecast.yaml``. Code must never hard-code a path, date boundary, quantile
or threshold: add it to the YAML instead.

Usage::

    from f1_forecast.config import load_config
    cfg = load_config()
    cfg.quantiles            # (0.05, 0.10, ..., 0.95)
    cfg.granularity("WEEK")  # typed per-granularity settings
    cfg.missing_paths()      # [] when every configured input file exists
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import yaml

# f1_forecast/config.py -> f1_forecast -> backend/models -> backend -> <repo root>
MODULE_DIR = Path(__file__).resolve().parent          # backend/models/f1_forecast
MODELS_DIR = MODULE_DIR.parent                        # backend/models
REPO_ROOT = MODELS_DIR.parent.parent                  # <repo root>
DEFAULT_CONFIG_PATH = MODELS_DIR / "config" / "forecast.yaml"


@dataclass(frozen=True)
class Granularity:
    """Per-granularity settings (WEEK or MONTH)."""

    name: str
    period_anchor: str
    split_source: str
    lags: tuple[int, ...]
    rolling_windows: tuple[int, ...]
    zero_window: int
    cold_start_history_days: int
    min_eval_periods: int
    model: Mapping[str, Any]
    grid: Mapping[str, Any]
    train_window_variants: tuple[str, ...]
    split: Mapping[str, Any] | None


@dataclass(frozen=True)
class ForecastConfig:
    """Resolved configuration: absolute paths + every modelling decision."""

    version: int
    config_path: Path
    repo_root: Path
    raw_paths: Mapping[str, Path]  # logical name -> absolute path (daily_joined, weekly_features, pack files)
    derived_dir: Path
    artifacts_dir: Path
    forecasts_dir: Path
    reports_dir: Path
    target: Mapping[str, Any]
    quantiles: tuple[float, ...]
    quantiles_persisted: tuple[float, ...]
    granularities: Mapping[str, Granularity]
    seed: int
    deterministic: bool
    model_version_template: str
    series_scope: Mapping[str, Any]
    expectations: Mapping[str, Any]
    censoring: Mapping[str, Any]
    context_flags: Mapping[str, Any]
    calendar: Mapping[str, Any]
    baselines: Mapping[str, Any]
    ved: Mapping[str, Any]
    evaluation: Mapping[str, Any]
    calibration: Mapping[str, Any]
    inference: Mapping[str, Any]
    stockout: Mapping[str, Any]
    totals: Mapping[str, Any]
    raw: Mapping[str, Any]

    # ---- convenience accessors -------------------------------------------------
    def granularity(self, name: str) -> Granularity:
        """Return the typed settings for ``WEEK`` or ``MONTH`` (case-insensitive)."""
        key = name.upper()
        if key not in self.granularities:
            raise KeyError(f"unknown granularity {name!r}; expected one of {sorted(self.granularities)}")
        return self.granularities[key]

    def raw_path(self, name: str) -> Path:
        """Return an absolute input path by logical name."""
        if name not in self.raw_paths:
            raise KeyError(f"unknown raw path {name!r}; expected one of {sorted(self.raw_paths)}")
        return self.raw_paths[name]

    def missing_paths(self) -> list[str]:
        """Return the configured input paths that do not exist on disk (empty list is healthy)."""
        return [f"{name}: {path}" for name, path in self.raw_paths.items() if not path.exists()]

    def as_dict(self) -> dict[str, Any]:
        """JSON-serialisable view of the resolved configuration (used by ``cli config``)."""
        return {
            "version": self.version,
            "config_path": str(self.config_path),
            "repo_root": str(self.repo_root),
            "raw_paths": {k: str(v) for k, v in self.raw_paths.items()},
            "derived_dir": str(self.derived_dir),
            "artifacts_dir": str(self.artifacts_dir),
            "forecasts_dir": str(self.forecasts_dir),
            "reports_dir": str(self.reports_dir),
            "target": dict(self.target),
            "quantiles": list(self.quantiles),
            "quantiles_persisted": list(self.quantiles_persisted),
            "granularities": {k: vars(v) for k, v in self.granularities.items()},
            "seed": self.seed,
            "deterministic": self.deterministic,
            "model_version_template": self.model_version_template,
            "series_scope": dict(self.series_scope),
            "censoring": dict(self.censoring),
            "context_flags": dict(self.context_flags),
            "evaluation": dict(self.evaluation),
            "calibration": dict(self.calibration),
            "inference": dict(self.inference),
        }


def _granularity(name: str, blob: Mapping[str, Any]) -> Granularity:
    return Granularity(
        name=name,
        period_anchor=str(blob["period_anchor"]),
        split_source=str(blob.get("split_source", "file")),
        lags=tuple(int(v) for v in blob["lags"]),
        rolling_windows=tuple(int(v) for v in blob["rolling_windows"]),
        zero_window=int(blob["zero_window"]),
        cold_start_history_days=int(blob["cold_start_history_days"]),
        min_eval_periods=int(blob["min_eval_periods"]),
        model=dict(blob["model"]),
        grid=dict(blob.get("grid", {})),
        train_window_variants=tuple(blob.get("train_window_variants", ["all_history"])),
        split=dict(blob["split"]) if blob.get("split") else None,
    )


def load_config(path: str | Path | None = None) -> ForecastConfig:
    """Load and resolve the forecast configuration.

    Args:
        path: optional YAML path; defaults to ``backend/models/config/forecast.yaml``.

    Returns:
        A :class:`ForecastConfig` with absolute paths and typed sections.

    Raises:
        FileNotFoundError: when the YAML file does not exist.
        ValueError: when required keys are missing or inconsistent.
    """
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    if not config_path.exists():
        raise FileNotFoundError(f"config file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw: dict[str, Any] = yaml.safe_load(handle)

    env_root = os.environ.get("DOORARE_ROOT")
    repo_root = Path(env_root).resolve() if env_root else REPO_ROOT

    paths = raw["paths"]
    raw_paths: dict[str, Path] = {
        "daily_joined": repo_root / paths["raw"]["daily_joined"],
        "weekly_features": repo_root / paths["raw"]["weekly_features"],
    }
    pack_dir = repo_root / paths["raw"]["pack_csv_dir"]
    for logical_name, file_name in paths["raw"]["pack_files"].items():
        raw_paths[logical_name] = pack_dir / file_name

    granularities = {
        name.upper(): _granularity(name.upper(), blob) for name, blob in raw["granularities"].items()
    }
    required = {"WEEK", "MONTH"}
    if not required.issubset(granularities):
        raise ValueError(f"config must define granularities {sorted(required)}")

    quantiles = tuple(float(q) for q in raw["quantiles"])
    if tuple(sorted(quantiles)) != quantiles or len(set(quantiles)) != len(quantiles):
        raise ValueError("quantiles must be unique and ascending")

    return ForecastConfig(
        version=int(raw["version"]),
        config_path=config_path.resolve(),
        repo_root=repo_root,
        raw_paths=raw_paths,
        derived_dir=repo_root / paths["derived"],
        artifacts_dir=repo_root / paths["artifacts"],
        forecasts_dir=repo_root / paths["forecasts"],
        reports_dir=repo_root / paths["reports"],
        target=dict(raw["target"]),
        quantiles=quantiles,
        quantiles_persisted=tuple(float(q) for q in raw["quantiles_persisted"]),
        granularities=granularities,
        seed=int(raw["seed"]),
        deterministic=bool(raw["deterministic"]),
        model_version_template=str(raw["model_version_template"]),
        series_scope=dict(raw["series_scope"]),
        expectations=dict(raw["expectations"]),
        censoring=dict(raw["censoring"]),
        context_flags=dict(raw["context_flags"]),
        calendar=dict(raw["calendar"]),
        baselines=dict(raw["baselines"]),
        ved=dict(raw["ved"]),
        evaluation=dict(raw["evaluation"]),
        calibration=dict(raw["calibration"]),
        inference=dict(raw["inference"]),
        stockout=dict(raw["stockout"]),
        totals=dict(raw["totals"]),
        raw=raw,
    )


def ensure_dir(path: Path) -> Path:
    """Create ``path`` (and parents) if needed and return it."""
    path.mkdir(parents=True, exist_ok=True)
    return path
