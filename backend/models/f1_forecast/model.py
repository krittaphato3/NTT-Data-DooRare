"""Quantile model (Phase 4 WEEK, Phase 5 MONTH): LightGBM quantile regression per level.

Spec: ``data/DooRare-F1-Quantile-Model-Spec4.md`` §4–§7 (weekly),
``data/DooRare-F1-Monthly-Pack/DooRare-F1-Monthly-Spec.md`` (monthly) and F-05/F-24 in
``specification/04-rules-formulas.md``.

Rules this module enforces for both granularities:

* target is ``log1p(y_target)``; every metric is computed after ``expm1`` on the raw scale;
* one model per quantile (all seven, 0.05 … 0.95), global across series with item features;
* the small config grid is selected on **valid only**, with early stopping on valid;
* training windows from the config are compared on valid (``all_history`` only for MONTH);
* post-processing: ``expm1`` -> clip at 0 -> sort or PAVA, chosen on valid with a pre-registered rule, and
  the **raw** crossing rate is reported separately (metrics use the fixed bands);
* the test split is never read while training or selecting; :func:`evaluate` touches it only when called
  (MONTH: once, labelled ``monthly test evaluation #1``);
* each fitted model set is stored under ``artifacts/f1-<GRANULARITY>-<data_end>-<feature_hash>-r<rev>/``
  with a ``meta.json`` carrying everything needed to reproduce it, including the tree cap.

Feature matrix: the Phase 3 rebuild with the canonical (``known_at_origin``) context flags. The committed
weekly CSV is only used as the split reference; its target-week context flags are not fed to the model
because their records can be created after the origin.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import lightgbm as lgb
import numpy as np
import pandas as pd

from f1_forecast import backtest, data_loader, features, metrics, schema
from f1_forecast.config import ForecastConfig, ensure_dir
from f1_forecast.schema import quantile_column

TRAINED_QUANTILES: tuple[float, ...] = (0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95)
POSTPROCESS_METHODS: tuple[str, ...] = ("sort", "isotonic")
MODEL_BASELINE_NAME = "lgbm_quantile_wk"
MODEL_BASELINE_NAMES: dict[str, str] = {"WEEK": "lgbm_quantile_wk", "MONTH": "lgbm_quantile_mo"}
ORIGIN_COLUMNS: dict[str, str] = {"WEEK": "origin_week", "MONTH": "origin_month"}
ZERO_SHARE_COLUMNS: dict[str, str] = {"WEEK": "roll_zero_share_13", "MONTH": "roll_zero_share_6m"}
DISPLAY_NAMES: dict[str, str] = {"WEEK": "weekly", "MONTH": "monthly"}
# Pre-registered rule for choosing between sort-only and isotonic post-processing (valid only).
ISOTONIC_MAX_WIDTH_RATIO = 1.05
EARLY_STOPPING_ROUNDS_DEFAULT = 100


@dataclass
class Dataset:
    """Train/valid/test frames plus the exact feature contract used for training."""

    train: pd.DataFrame
    valid: pd.DataFrame
    test: pd.DataFrame
    features: list[str]
    categorical: list[str]
    dropped_constant: list[str]
    data_end: pd.Timestamp


@dataclass
class FittedModel:
    """One quantile model plus the bookkeeping the artifact needs."""

    quantile: float
    booster: lgb.LGBMRegressor
    best_iteration: int
    params: dict[str, Any]
    valid_pinball: float
    train_rows: int


@dataclass
class TrainedModel:
    """The selected model set (one model per quantile) and its provenance."""

    models: dict[float, FittedModel]
    feature_list: list[str]
    dropped_constant: list[str]
    categorical: list[str]
    train_variant: str
    train_window: dict[str, Any]
    feature_hash: str
    model_version: str
    granularity: str = "WEEK"
    postprocess_method: str = "sort"
    grid_results: list[dict] = field(default_factory=list)


def granularity_key(granularity: str) -> str:
    """Validate and normalise ``WEEK`` / ``MONTH``."""
    key = str(granularity).upper()
    if key not in MODEL_BASELINE_NAMES:
        raise ValueError(f"unsupported granularity {granularity!r}; expected WEEK or MONTH")
    return key


# -------------------------------------------------------------------------------------------- dataset


def build_dataset(cfg: ForecastConfig, granularity: str = "WEEK",
                  context_rule: str = "known_at_origin") -> Dataset:
    """Build the train/valid/test frames and the constant-free feature list for one granularity.

    Columns that are constant (or entirely missing) inside ``train`` carry no information and are dropped
    from the model input -- they stay in the matrix/schema for consistency. Which ones were dropped is
    returned so every report can state it (e.g. the monthly flu/dengue flags are constant by construction).
    """
    key = granularity_key(granularity)
    pack = data_loader.load_pack(cfg)
    series = data_loader.enrich_series(pack, cfg)
    builder = features.build_weekly if key == "WEEK" else features.build_monthly
    matrix = builder(cfg, pack, series, context_rule=context_rule)
    # metrics/prediction conventions: series_id / origin / y (same as the baseline prediction frames)
    matrix = matrix.rename(columns={"hospital_drug_id": "series_id", ORIGIN_COLUMNS[key]: "origin",
                                    "y_target": "y"})

    # The evaluation attributes (price, observable stock, target-window stock-out days) live on the same
    # panel the baselines were scored on, so the model is trained and measured on identical rows.
    panel = backtest.build_panel(cfg, key, pack=pack, series=series)
    identity = ("series_id", "origin", "split", "y")
    feature_columns = [column for column in matrix.columns if column not in identity]
    matrix = panel.merge(matrix[["series_id", "origin", *feature_columns]], on=["series_id", "origin"],
                         how="inner", validate="one_to_one", suffixes=("", "_feature"))
    # the panel already carries a verified copy of some attributes (Phase 3 reconciliation proved the
    # rebuilt values equal the committed ones), so the suffixed duplicates are dropped rather than fed twice
    matrix = matrix.loc[:, [column for column in matrix.columns if not column.endswith("_feature")]]
    matrix = matrix.sort_values(["origin", "series_id"]).reset_index(drop=True)

    categorical_schema = (schema.WEEKLY_CATEGORICAL_COLUMNS if key == "WEEK"
                          else schema.MONTHLY_CATEGORICAL_COLUMNS)
    categorical = [column for column in categorical_schema if column in matrix.columns]
    for column in categorical:
        matrix[column] = matrix[column].astype("category")

    candidate_schema = schema.WEEKLY_FEATURE_COLUMNS if key == "WEEK" else schema.MONTHLY_FEATURE_COLUMNS
    candidates = [column for column in candidate_schema if column in matrix.columns]

    train = matrix.loc[matrix["split"] == "train"]
    valid = matrix.loc[matrix["split"] == "valid"]
    test = matrix.loc[matrix["split"] == "test"]
    if train.empty or valid.empty:
        raise ValueError(f"{key.lower()} dataset needs non-empty train and valid splits")

    kept, dropped = select_features(train, candidates)

    return Dataset(
        train=train.reset_index(drop=True),
        valid=valid.reset_index(drop=True),
        test=test.reset_index(drop=True),
        features=kept,
        categorical=[column for column in categorical if column in kept],
        dropped_constant=dropped,
        data_end=pd.Timestamp(matrix["origin"].max()),
    )


def build_weekly_dataset(cfg: ForecastConfig, context_rule: str = "known_at_origin") -> Dataset:
    """Weekly wrapper around :func:`build_dataset`."""
    return build_dataset(cfg, "WEEK", context_rule=context_rule)


def build_monthly_dataset(cfg: ForecastConfig, context_rule: str = "known_at_origin") -> Dataset:
    """Monthly wrapper around :func:`build_dataset`."""
    return build_dataset(cfg, "MONTH", context_rule=context_rule)


def select_features(train: pd.DataFrame, candidates: Sequence[str]) -> tuple[list[str], list[str]]:
    """Split candidate features into (kept, dropped-constant) using the training rows only.

    A column that is constant (or entirely missing) inside ``train`` cannot help the model; it is dropped
    and reported, not silently left in the matrix.
    """
    kept: list[str] = []
    dropped: list[str] = []
    for column in candidates:
        values = train[column]
        if values.isna().all() or values.dropna().nunique() <= 1:
            dropped.append(column)
        else:
            kept.append(column)
    return kept, dropped


def feature_hash(feature_list: Sequence[str]) -> str:
    """Stable short hash of the feature contract (spec: store the feature-set hash)."""
    digest = hashlib.sha1("|".join(sorted(feature_list)).encode("utf-8")).hexdigest()
    return digest[:12]


def model_version(cfg: ForecastConfig, data_end: pd.Timestamp, feature_list: Sequence[str],
                  granularity: str = "WEEK") -> str:
    """Render ``model_version_template`` for this granularity/data end/feature set/revision."""
    key = granularity_key(granularity)
    return str(cfg.model_version_template).format(
        granularity=key, data_end=pd.Timestamp(data_end).strftime("%Y-%m-%d"),
        feature_hash=feature_hash(feature_list),
        revision=int(cfg.raw.get("model_version_revision", 1)))


# ------------------------------------------------------------------------------------------- fitting


def _base_params(cfg: ForecastConfig, granularity: str = "WEEK") -> dict[str, Any]:
    """LightGBM parameters shared by every candidate, from the config."""
    model_cfg = dict(cfg.granularity(granularity_key(granularity)).model)
    return {
        "learning_rate": model_cfg["learning_rate"],
        "num_leaves": model_cfg["num_leaves"],
        "min_child_samples": model_cfg["min_child_samples"],
        "colsample_bytree": model_cfg["colsample_bytree"],
        "subsample": model_cfg["subsample"],
        "subsample_freq": model_cfg["subsample_freq"],
        "reg_lambda": model_cfg["reg_lambda"],
        "n_estimators": model_cfg["n_estimators"],
        "random_state": int(cfg.seed),
        "deterministic": bool(cfg.deterministic),
        "verbosity": -1,
    }


def candidate_grid(cfg: ForecastConfig, granularity: str = "WEEK") -> list[dict[str, Any]]:
    """Expand the configured small grid into explicit parameter dicts (selected on valid only)."""
    grid = dict(cfg.granularity(granularity_key(granularity)).grid)
    keys = list(grid)
    return [dict(zip(keys, values)) for values in itertools.product(*(grid[key] for key in keys))]


def fit_quantile(train: pd.DataFrame, valid: pd.DataFrame, feature_list: Sequence[str], quantile: float,
                 params: Mapping[str, Any], seed: int) -> FittedModel:
    """Fit one quantile model with early stopping on valid (target on the ``log1p`` scale)."""
    model = lgb.LGBMRegressor(objective="quantile", alpha=float(quantile), **dict(params))
    with warnings.catch_warnings():
        # LightGBM 4.7 deprecates the sklearn `eval_set` spelling; requirements still allow 4.5
        warnings.filterwarnings("ignore", message=".*eval_set.*")
        model.fit(
            train[list(feature_list)], np.log1p(train["y"].astype(float)),
            eval_set=[(valid[list(feature_list)], np.log1p(valid["y"].astype(float)))],
            eval_metric="quantile",
            callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS_DEFAULT, verbose=False)],
        )
    predictions = postprocess({quantile: np.expm1(model.predict(valid[list(feature_list)]))})
    pinball = metrics.pinball_loss(valid["y"].astype(float), predictions[quantile], quantile)
    return FittedModel(quantile=float(quantile), booster=model,
                       best_iteration=int(model.best_iteration_ or model.n_estimators),
                       params={k: v for k, v in params.items() if k in
                               ("learning_rate", "num_leaves", "min_child_samples", "n_estimators")},
                       valid_pinball=float(pinball), train_rows=int(len(train)))


def _pava_row(values: np.ndarray) -> np.ndarray:
    """Isotonic (non-decreasing) regression of one row with equal weights, via PAVA.

    The projection keeps the predicted level and pools only the violating neighbours, instead of moving the
    largest value to the top band the way a plain sort does.
    """
    blocks: list[list[float]] = []  # [sum, count]
    for value in values:
        blocks.append([float(value), 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1] + 1e-12:
            total, count = blocks.pop()
            blocks[-1][0] += total
            blocks[-1][1] += count
    projected: list[float] = []
    for total, count in blocks:
        projected.extend([total / count] * int(count))
    return np.asarray(projected, dtype=float)


def postprocess(raw: Mapping[float, np.ndarray], method: str = "sort") -> dict[float, np.ndarray]:
    """Invert ``log1p`` conventions: clip at 0, then make each row non-decreasing.

    Args:
        raw: quantile level -> predictions on the raw scale (already ``expm1``-inverted).
        method: ``sort`` (plain ascending sort, Phase 4 default) or ``isotonic`` (row-wise PAVA projection).

    Returns:
        Same mapping, clipped and ordered. Callers that need the *raw* crossing rate must compute it on the
        pre-processing values (see :func:`crossing_rate_raw_columns`).
    """
    if method not in POSTPROCESS_METHODS:
        raise ValueError(f"unknown postprocess method {method!r}; expected one of {POSTPROCESS_METHODS}")
    columns = sorted(raw)
    frame = pd.DataFrame({quantile_column(q): np.asarray(raw[q], dtype=float) for q in columns})
    values = frame.to_numpy(dtype=float)
    values = np.clip(values, 0.0, None)
    if method == "sort":
        values = np.sort(values, axis=1)
    else:
        values = np.vstack([_pava_row(row) for row in values])
    return {quantile: values[:, index] for index, quantile in enumerate(columns)}


def raw_crossing_rate(raw: Mapping[float, np.ndarray]) -> float:
    """Share of rows with at least one inverted adjacent pair *before* the monotone fix."""
    columns = sorted(raw)
    values = np.column_stack([np.asarray(raw[q], dtype=float) for q in columns])
    if values.size == 0:
        return float("nan")
    return float((np.diff(values, axis=1) < 0).any(axis=1).mean())


def crossing_rate_raw_columns(frame: pd.DataFrame, quantiles: Sequence[float]) -> float:
    """Raw crossing rate of a prediction subset, read from its ``raw_qXX`` columns.

    This is what makes the ``no_stockout_rows`` figure its own number instead of the split-wide scalar.
    """
    columns = [f"raw_{quantile_column(q)}" for q in quantiles]
    if frame.empty:
        return float("nan")
    values = frame[columns].to_numpy(dtype=float)
    return float((np.diff(values, axis=1) < 0).any(axis=1).mean())


def crossing_pairs_raw_columns(frame: pd.DataFrame, quantiles: Sequence[float]) -> dict[str, float]:
    """Per-adjacent-pair raw crossing rates, read from the ``raw_qXX`` columns.

    The ``qXX`` columns already carry the post-fixed bands, so reading those would report zero here even
    when the raw rate is not zero.
    """
    pairs: dict[str, float] = {}
    for lower, upper in zip(quantiles, quantiles[1:]):
        left, right = f"raw_{quantile_column(lower)}", f"raw_{quantile_column(upper)}"
        pairs[f"{quantile_column(lower)}>{quantile_column(upper)}"] = (
            float((frame[left] > frame[right]).mean()) if not frame.empty else float("nan"))
    return pairs


# ---------------------------------------------------------------------------------------- training


def _train_window(frame: pd.DataFrame, variant: str, valid_start: pd.Timestamp) -> pd.DataFrame:
    """Select training rows for one of the two configured windows."""
    if variant == "all_history":
        return frame
    if variant == "last_24_months":
        cutoff = pd.Timestamp(valid_start) - pd.DateOffset(months=24)
        return frame.loc[frame["origin"] >= cutoff]
    raise ValueError(f"unknown train window variant {variant!r}")


def train(cfg: ForecastConfig, granularity: str = "WEEK", write: bool = True,
          grid: list[dict] | None = None, variants: list[str] | None = None,
          n_estimators: int | None = None) -> dict:
    """Select hyper-parameters/variant on valid, fit the final models and write the artifact.

    The test split is deliberately never touched here: :func:`evaluate` is the only entry point that reads
    it, and it is called once per granularity.

    Args:
        cfg: resolved configuration.
        granularity: ``WEEK`` (Phase 4) or ``MONTH`` (Phase 5).
        write: write the artifact (models + ``meta.json``) and the training report.

    Returns:
        Report dict with the grid results, the selected model set, valid metrics and the gate comparison.
    """
    key = granularity_key(granularity)
    dataset = build_dataset(cfg, key)
    train, valid = dataset.train, dataset.valid
    valid_start = pd.Timestamp(valid["origin"].min())
    variants = list(variants or cfg.granularity(key).train_window_variants)
    grid = list(grid or candidate_grid(cfg, key))
    base = _base_params(cfg, key)
    if n_estimators is not None:  # smoke tests only; production uses the configured value
        base["n_estimators"] = int(n_estimators)

    grid_results: list[dict] = []
    best: dict[tuple[str, float], dict] = {}
    for variant in variants:
        window = _train_window(train, variant, valid_start)
        if window.empty:
            raise ValueError(f"training window {variant!r} selected no rows")
        for candidate in grid:
            params = {**base, **candidate}
            for quantile in TRAINED_QUANTILES:
                fitted = fit_quantile(window, valid, dataset.features, quantile, params, int(cfg.seed))
                record = {"variant": variant, "quantile": quantile, **candidate,
                          "valid_pinball": round(fitted.valid_pinball, 4),
                          "best_iteration": fitted.best_iteration, "train_rows": fitted.train_rows}
                grid_results.append(record)
                slot = (variant, quantile)
                if slot not in best or fitted.valid_pinball < best[slot]["valid_pinball"]:
                    best[slot] = {**record, "params": params}

    # variant = the one with the lowest total valid pinball over the three selected models
    variant_scores = {
        variant: round(sum(best[(variant, q)]["valid_pinball"] for q in TRAINED_QUANTILES), 4)
        for variant in variants
    }
    chosen_variant = min(variant_scores, key=variant_scores.get)
    window = _train_window(train, chosen_variant, valid_start)

    models: dict[float, FittedModel] = {}
    for quantile in TRAINED_QUANTILES:
        params = dict(best[(chosen_variant, quantile)]["params"])
        models[quantile] = fit_quantile(window, valid, dataset.features, quantile, params, int(cfg.seed))

    version = model_version(cfg, dataset.data_end, dataset.features, key)
    trained = TrainedModel(
        models=models,
        feature_list=dataset.features,
        dropped_constant=dataset.dropped_constant,
        categorical=dataset.categorical,
        train_variant=chosen_variant,
        train_window={
            "variant": chosen_variant,
            "origin_min": str(pd.Timestamp(window["origin"].min()).date()),
            "origin_max": str(pd.Timestamp(window["origin"].max()).date()),
            "rows": int(len(window)),
        },
        feature_hash=feature_hash(dataset.features),
        model_version=version,
        granularity=key,
        grid_results=grid_results,
    )

    # Post-processing choice: compare sort-only vs isotonic on valid, with a pre-registered rule.
    # (Coverage is the criterion, not pinball: sorting/PAVA do not change the loss ranking much but they do
    # move the bands, and coverage is what the acceptance gate measures.)
    predictions_by_method = {method: predict_frame(trained, valid, method=method)
                             for method in POSTPROCESS_METHODS}
    evaluations = {method: evaluate_frame(frame, cfg)
                   for method, frame in predictions_by_method.items()}
    chosen_method, postprocess_comparison = choose_postprocess(
        evaluations, cfg, baseline_name=MODEL_BASELINE_NAMES[key])
    trained.postprocess_method = chosen_method
    evaluation = evaluations[chosen_method]
    valid_predictions = predictions_by_method[chosen_method]
    diagnostic = ["series_id", "origin", "cold_start", "history_periods"]
    valid_predictions = valid_predictions.merge(
        valid[[column for column in diagnostic if column in valid.columns]],
        on=["series_id", "origin"], how="left")
    gate = (common_row_gate(cfg, valid_predictions, "valid", key) if key == "MONTH"
            else gate_report(cfg, evaluation, "valid"))
    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "granularity": key,
        "n_estimators_cap": int(base["n_estimators"]),
        "model_version": version,
        "feature_hash": trained.feature_hash,
        "features": trained.feature_list,
        "dropped_constant_features": trained.dropped_constant,
        "categorical_features": trained.categorical,
        "quantiles": list(TRAINED_QUANTILES),
        "train_window": trained.train_window,
        "postprocess": chosen_method,
        "postprocess_comparison": postprocess_comparison,
        "variant_scores": variant_scores,
        "grid": {name: value for name, value in dict(cfg.granularity(key).grid).items()},
        "grid_results": grid_results,
        "selected": {f"{q}": best[(chosen_variant, q)] for q in TRAINED_QUANTILES},
        "valid": evaluation,
        "gate": gate,
    }
    if write:
        artifact_dir = write_artifact(cfg, trained, dataset, valid_start)
        report["artifact"] = str(artifact_dir)
        report["paths"] = {name: str(path) for name, path in
                           write_train_reports(cfg, report, key).items()}
    report["summary_text"] = render_train_console(report)
    return report


# -------------------------------------------------------------------------------------- prediction


def predict_frame(trained: TrainedModel, frame: pd.DataFrame, method: str | None = None) -> pd.DataFrame:
    """Predict one frame and return a metrics-ready prediction frame (raw scale, monotone bands)."""
    method = method or trained.postprocess_method
    raw = {quantile: np.expm1(model.booster.predict(frame[trained.feature_list]))
           for quantile, model in trained.models.items()}
    ordered = postprocess(raw, method)

    predictions = frame[["series_id", "origin", "split", "y", "ved", "unit_price_thb", "origin_stock",
                         "target_stockout_days"]].copy()
    predictions["baseline"] = MODEL_BASELINE_NAMES[granularity_key(trained.granularity)]
    for quantile in sorted(raw):
        predictions[f"raw_{quantile_column(quantile)}"] = np.asarray(raw[quantile], dtype=float)
        predictions[quantile_column(quantile)] = ordered[quantile]
    predictions["postprocess"] = method
    return predictions


def evaluate_frame(predictions: pd.DataFrame, cfg: ForecastConfig) -> dict:
    """F-24 metrics on all seven quantiles, with the raw crossing rate recomputed per row filter."""
    quantiles = list(TRAINED_QUANTILES)
    evaluation = metrics.evaluate_predictions(predictions, quantiles, cfg)
    filters = {
        "all_rows": predictions,
        "no_stockout_rows": predictions.loc[predictions["target_stockout_days"] == 0],
    }
    for filter_name, subset in filters.items():
        raw_rate = crossing_rate_raw_columns(subset, quantiles)
        raw_pairs = crossing_pairs_raw_columns(subset, quantiles)
        for per_baseline in evaluation["filters"][filter_name].values():
            for pooled in per_baseline.values():
                pooled["crossing_rate_raw"] = round(raw_rate, metrics.METRICS_ROUND)
                pooled["crossing_pairs_raw"] = {pair: round(value, metrics.METRICS_ROUND)
                                                for pair, value in raw_pairs.items()}
                # metrics.crossing_rate is measured on the shipped (post-fix) bands; report it explicitly
                pooled["crossing_rate_fixed"] = pooled["crossing_rate"]
    return evaluation


# --------------------------------------------------------------------------------------- artifacts


def _artifact_dir(cfg: ForecastConfig, trained: TrainedModel) -> Path:
    return ensure_dir(cfg.artifacts_dir / trained.model_version)


def write_artifact(cfg: ForecastConfig, trained: TrainedModel, dataset: Dataset,
                   valid_start: pd.Timestamp) -> Path:
    """Write one text model per quantile plus ``meta.json`` (reproducibility contract)."""
    directory = _artifact_dir(cfg, trained)
    for quantile, fitted in trained.models.items():
        fitted.booster.booster_.save_model(str(directory / f"{quantile_column(quantile)}.txt"))

    meta = {
        "model_version": trained.model_version,
        "granularity": trained.granularity,
        "n_estimators_cap": int(cfg.granularity(trained.granularity).model["n_estimators"]),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_end": str(pd.Timestamp(dataset.data_end).date()),
        "feature_hash": trained.feature_hash,
        "features": trained.feature_list,
        "dropped_constant_features": trained.dropped_constant,
        "categorical_features": trained.categorical,
        "quantiles": list(TRAINED_QUANTILES),
        "train_window": {**trained.train_window, "valid_start": str(valid_start.date())},
        "seed": int(cfg.seed),
        "deterministic": bool(cfg.deterministic),
        "early_stopping_rounds": EARLY_STOPPING_ROUNDS_DEFAULT,
        "lightgbm_version": lgb.__version__,
        "postprocess": trained.postprocess_method,
        "models": {
            f"{quantile}": {
                "file": f"{quantile_column(quantile)}.txt",
                "params": fitted.params,
                "best_iteration": fitted.best_iteration,
                "valid_pinball": round(fitted.valid_pinball, 4),
                "train_rows": fitted.train_rows,
            }
            for quantile, fitted in trained.models.items()
        },
        "notes": [
            "trained on log1p(y_target); predictions are expm1-inverted, clipped at 0 and sorted per row",
            "feature matrix = Phase 3 rebuild with known-at-origin context flags",
            "test split was not read during training or selection",
        ],
    }
    (directory / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return directory


def load_artifact(cfg: ForecastConfig, artifact: str | Path | None = None,
                  granularity: str = "WEEK") -> tuple[TrainedModel, dict]:
    """Load a saved model set (latest for the granularity when no path is given) and its ``meta.json``."""
    key = granularity_key(granularity)
    if artifact is None:
        candidates = sorted(path for path in cfg.artifacts_dir.glob(f"f1-{key}-*") if path.is_dir())
        if not candidates:
            raise FileNotFoundError(f"no WEEK artifact under {cfg.artifacts_dir}; run `train` first")
        directory = candidates[-1]
    else:
        directory = Path(artifact)
    meta = json.loads((directory / "meta.json").read_text(encoding="utf-8"))
    models: dict[float, FittedModel] = {}
    for quantile_text, info in meta["models"].items():
        booster = lgb.Booster(model_file=str(directory / info["file"]))
        models[float(quantile_text)] = FittedModel(
            quantile=float(quantile_text), booster=booster, best_iteration=int(info["best_iteration"]),
            params=dict(info["params"]), valid_pinball=float(info["valid_pinball"]),
            train_rows=int(info["train_rows"]))
    trained = TrainedModel(
        models=models, feature_list=list(meta["features"]),
        dropped_constant=list(meta["dropped_constant_features"]),
        categorical=list(meta["categorical_features"]),
        train_variant=str(meta["train_window"]["variant"]), train_window=dict(meta["train_window"]),
        feature_hash=str(meta["feature_hash"]), model_version=str(meta["model_version"]),
        granularity=str(meta.get("granularity", key)),
        postprocess_method=str(meta.get("postprocess", "sort")),
    )
    return trained, meta


def attach_attributes(predictions: pd.DataFrame, frame: pd.DataFrame,
                      granularity: str = "WEEK") -> pd.DataFrame:
    """Merge the slicing/diagnostic attributes the evaluation report needs onto a prediction frame."""
    key = granularity_key(granularity)
    wanted = [ZERO_SHARE_COLUMNS[key], "cold_start", "history_periods", "price_tier", "item_type",
              "hospital_tier", "is_seasonal", "hospital_code", "item_code"]
    extra = [column for column in wanted if column not in predictions.columns and column in frame.columns]
    if not extra:
        return predictions
    return predictions.merge(frame[["series_id", "origin", *extra]], on=["series_id", "origin"], how="left")


def score_split(cfg: ForecastConfig, granularity: str = "WEEK", split: str = "test",
                artifact: str | Path | None = None, save: bool = False) -> pd.DataFrame:
    """Predict one split from a frozen artifact **without touching any report**.

    Used to rebuild row-level predictions after they were deleted; the aggregate metrics must equal the
    saved report (see Phase 6a). ``save`` writes ``data/model_predictions_<gran>_<split>.parquet``.
    """
    key = granularity_key(granularity)
    if split not in ("valid", "test"):
        raise ValueError(f"unsupported split {split!r}; expected valid or test")
    trained, _ = load_artifact(cfg, artifact, key)
    dataset = build_dataset(cfg, key)
    frame = dataset.valid if split == "valid" else dataset.test
    predictions = attach_attributes(predict_frame(trained, frame), frame, key)
    if save:
        path = cfg.derived_dir / f"model_predictions_{key.lower()}_{split}.parquet"
        ensure_dir(cfg.derived_dir)
        predictions.to_parquet(path, index=False)
    return predictions


def evaluate(cfg: ForecastConfig, split: str = "test", artifact: str | Path | None = None,
             write: bool = True, evaluation_number: int | None = None,
             granularity: str = "WEEK") -> dict:
    """Score a saved artifact on one split and persist its row-level predictions.

    ``evaluation_number`` labels repeated runs of the same split (Phase 4b records the weekly test split as
    the second evaluation, Phase 5 records the monthly one as #1) so the report never hides how many times
    test was looked at. The predictions parquet is what later diagnostics read, so they need no re-score.
    """
    key = granularity_key(granularity)
    if split not in ("valid", "test"):
        raise ValueError(f"unsupported split {split!r}; expected valid or test")
    trained, meta = load_artifact(cfg, artifact, key)
    dataset = build_dataset(cfg, key)
    frame = dataset.valid if split == "valid" else dataset.test
    if frame.empty:
        raise ValueError(f"{split} split is empty")

    predictions = attach_attributes(predict_frame(trained, frame), frame, key)
    evaluation = evaluate_frame(predictions, cfg)
    per_series = metrics.per_series_metrics(metrics.monotone_fix(predictions, list(TRAINED_QUANTILES)),
                                            list(TRAINED_QUANTILES), cfg)
    per_series_info = metrics.coverage_gate(per_series, cfg)
    gate = (common_row_gate(cfg, predictions, split, key) if key == "MONTH"
            else gate_report(cfg, evaluation, split))
    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "granularity": key,
        "split": split,
        "model_version": trained.model_version,
        "artifact": str(cfg.artifacts_dir / trained.model_version),
        "feature_hash": trained.feature_hash,
        "features": trained.feature_list,
        "dropped_constant_features": trained.dropped_constant,
        "train_window": trained.train_window,
        "postprocess": trained.postprocess_method,
        "evaluation_number": evaluation_number,
        "rows": int(len(predictions)),
        "series": int(predictions["series_id"].nunique()),
        "series_without_rows": int(cfg.expectations["modelled_series"]) - int(predictions["series_id"].nunique()),
        "crossing_rate_raw": round(crossing_rate_raw_columns(predictions, list(TRAINED_QUANTILES)),
                                   metrics.METRICS_ROUND),
        "metrics": evaluation,
        "gate": gate,
        "per_series_info": per_series_info,
        "all_series_low_n": bool(per_series_info.get("series_judged") == 0),
        "cold_start": cold_start_report(predictions, cfg) if key == "WEEK" else {
            "series": 0,
            "note": "monthly evaluation covers only 12 periods per series, so every series is LOW_N",
        },
    }
    if write:
        predictions_path = cfg.derived_dir / f"model_predictions_{key.lower()}_{split}.parquet"
        ensure_dir(cfg.derived_dir)
        predictions.to_parquet(predictions_path, index=False)
        report["paths"] = {name: str(path) for name, path in
                           write_eval_reports(cfg, report, key).items()}
        report["paths"]["predictions"] = str(predictions_path)
    report["summary_text"] = render_eval_console(report)
    return report


def _coverage_score(evaluation: dict, split: str = "valid",
                    baseline_name: str = MODEL_BASELINE_NAME) -> float:
    """Absolute coverage error at P90 and P95 (lower is better), on the all-rows filter."""
    pooled = evaluation["filters"]["all_rows"][split][baseline_name]
    return abs(pooled["coverage"]["0.9"] - 0.9) + abs(pooled["coverage"]["0.95"] - 0.95)


def choose_postprocess(evaluations: Mapping[str, dict], cfg: ForecastConfig,
                       split: str = "valid",
                       baseline_name: str = MODEL_BASELINE_NAME) -> tuple[str, dict]:
    """Pick sort vs isotonic on valid using the pre-registered rule.

    Isotonic is kept only when it (a) puts both P90 and P95 coverage inside the tolerance, (b) has a strictly
    smaller combined coverage error than sorting, and (c) widens the P95-P05 interval by at most
    ``ISOTONIC_MAX_WIDTH_RATIO``. Otherwise sorting wins.
    """
    tolerance = float(cfg.evaluation["coverage_tolerance"])
    summary: dict = {"rule": {"split": split,
                               "coverage_tolerance": tolerance,
                               "max_width_ratio": ISOTONIC_MAX_WIDTH_RATIO,
                               "requires": "coverage inside tolerance, strictly better coverage score, "
                                           "width ratio <= max_width_ratio"},
                      "variants": {}}
    for method, evaluation in evaluations.items():
        pooled = evaluation["filters"]["all_rows"][split][baseline_name]
        summary["variants"][method] = {
            "coverage_0.9": pooled["coverage"]["0.9"],
            "coverage_0.95": pooled["coverage"]["0.95"],
            "coverage_score": round(_coverage_score(evaluation, split, baseline_name), 4),
            "width_p95_p05": pooled["width_p95_p05"],
            "pinball_0.5": pooled["pinball"]["0.5"],
            "pinball_0.9": pooled["pinball"]["0.9"],
            "pinball_0.95": pooled["pinball"]["0.95"],
            "crossing_rate_raw": pooled["crossing_rate_raw"],
            "crossing_rate_fixed": pooled["crossing_rate_fixed"],
        }

    sort = summary["variants"]["sort"]
    isotonic = summary["variants"]["isotonic"]
    width_ratio = (isotonic["width_p95_p05"] / sort["width_p95_p05"]
                   if sort["width_p95_p05"] else float("inf"))
    within_tolerance = all(abs(isotonic[f"coverage_{q}"] - q) <= tolerance for q in (0.9, 0.95))
    better = isotonic["coverage_score"] < sort["coverage_score"] - 1e-9
    narrow_enough = width_ratio <= ISOTONIC_MAX_WIDTH_RATIO
    chosen = "isotonic" if (within_tolerance and better and narrow_enough) else "sort"
    summary["width_ratio"] = round(width_ratio, 4)
    summary["isotonic_conditions"] = {"coverage_within_tolerance": within_tolerance,
                                      "strictly_better_coverage": better,
                                      "width_ok": narrow_enough}
    summary["chosen"] = chosen
    return chosen, summary


# ------------------------------------------------------------------------------------ comparisons


def _baseline_report(cfg: ForecastConfig) -> dict | None:
    """Saved weekly baseline metrics (Phase 2), used for the gate comparison."""
    path = cfg.reports_dir / "baseline_metrics.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def gate_report(cfg: ForecastConfig, evaluation: dict, split: str) -> dict:
    """Compare the model against the configured must-beat baselines on the same row filter."""
    baseline = _baseline_report(cfg)
    gate_quantiles = [float(q) for q in cfg.evaluation["gate"]["gate_quantiles"]]
    must_beat = [str(name) for name in cfg.evaluation["gate"]["must_beat_baselines"]]
    result: dict = {"split": split, "must_beat": must_beat, "quantiles": gate_quantiles,
                    "checks": {}, "passed": None}
    if baseline is None:
        return {**result, "note": "reports/baseline_metrics.json missing; gate not evaluated"}

    for filter_name, splits in evaluation["filters"].items():
        per_filter: dict = {}
        for baseline_name in must_beat:
            reference = baseline["filters"][filter_name].get(split, {}).get(baseline_name)
            model = splits.get(split, {}).get(MODEL_BASELINE_NAME)
            if reference is None or model is None:
                per_filter[baseline_name] = {"note": "missing side", "beats": False}
                continue
            deltas = {str(q): round(model["pinball"][str(q)] - reference["pinball"][str(q)], 4)
                      for q in gate_quantiles}
            per_filter[baseline_name] = {
                "model_pinball": {str(q): model["pinball"][str(q)] for q in gate_quantiles},
                "baseline_pinball": {str(q): reference["pinball"][str(q)] for q in gate_quantiles},
                "delta": deltas,
                "beats": all(value < 0 for value in deltas.values()),
            }
        result["checks"][filter_name] = per_filter
    result["passed"] = all(entry["beats"] for checks in result["checks"].values()
                           for entry in checks.values())
    return result


def baseline_predictions(cfg: ForecastConfig,
                        granularity: str = "MONTH") -> tuple[pd.DataFrame | None, Path]:
    """Load the Phase 2/3 baseline predictions for a granularity (used for common-row comparisons)."""
    path = cfg.derived_dir / f"baseline_predictions_{granularity_key(granularity).lower()}.parquet"
    if not path.exists():
        return None, path
    return pd.read_parquet(path), path


def common_row_keys(predictions: pd.DataFrame, baselines: pd.DataFrame) -> pd.DataFrame:
    """``(series_id, origin)`` rows scored by the model and by every baseline present in the frame."""
    keys = ["series_id", "origin"]
    common = predictions[keys].drop_duplicates()
    for _, group in baselines.groupby("baseline", observed=True):
        common = common.merge(group[keys].drop_duplicates(), on=keys, how="inner")
    return common.drop_duplicates().reset_index(drop=True)


def common_row_gate(cfg: ForecastConfig, predictions: pd.DataFrame, split: str,
                    granularity: str = "MONTH") -> dict:
    """Gate against every must-beat baseline **on the rows scored by all methods**.

    Baselines and the model do not cover identical rows (no 12-month lag / no residual fallback for short
    series), so a gate on each side's own rows compares different populations. This intersects the keys and
    reports the excluded rows explicitly.
    """
    key = granularity_key(granularity)
    model_name = MODEL_BASELINE_NAMES[key]
    gate_quantiles = [float(q) for q in cfg.evaluation["gate"]["gate_quantiles"]]
    must_beat = [str(name) for name in cfg.evaluation["gate"]["must_beat_baselines"]]
    result: dict = {"split": split, "scope": "common row set", "must_beat": must_beat,
                    "quantiles": gate_quantiles, "rows_model": int(len(predictions)),
                    "checks": {}, "passed": None}
    baselines, path = baseline_predictions(cfg, key)
    if baselines is None:
        result["note"] = f"{path.name} missing; gate not evaluated"
        return result

    split_baselines = baselines.loc[baselines["split"] == split]
    keys = common_row_keys(predictions, split_baselines)
    common = predictions.merge(keys, on=["series_id", "origin"], how="inner")
    base_common = split_baselines.merge(keys, on=["series_id", "origin"], how="inner")
    excluded = predictions.loc[~predictions.set_index(["series_id", "origin"]).index.isin(
        keys.set_index(["series_id", "origin"]).index)]
    excluded_info: dict = {"rows": int(len(excluded)), "series": int(excluded["series_id"].nunique()),
                           "reason": "no baseline forecast exists for these rows "
                                     "(no 12-month lag and no residual fallback)"}
    if "cold_start" in excluded.columns:
        excluded_info["cold_start_rows"] = int(excluded["cold_start"].fillna(False).sum())
    if "history_periods" in excluded.columns and len(excluded):
        excluded_info["history_periods"] = [int(excluded["history_periods"].min()),
                                            int(excluded["history_periods"].max())]
    result.update({
        "rows_common": int(len(common)),
        "rows_excluded": int(len(excluded)),
        "excluded": excluded_info,
        "baseline_rows": {name: int((split_baselines["baseline"] == name).sum()) for name in must_beat},
        "pooled_common": {},
    })

    filters = {"all_rows": lambda frame: frame,
               "no_stockout_rows": lambda frame: frame.loc[frame["target_stockout_days"] == 0]}
    headline = ("rows", "pinball", "coverage", "mae_p50", "wape_p50", "width_p95_p05",
                "crossing_rate")
    for filter_name, selector in filters.items():
        model_subset = selector(common)
        if model_subset.empty:
            continue
        pooled: dict = {}
        model_pooled = metrics.pooled_metrics(metrics.monotone_fix(model_subset, list(TRAINED_QUANTILES)),
                                              list(TRAINED_QUANTILES), cfg)
        pooled[model_name] = {field: model_pooled[field] for field in headline}
        checks: dict = {}
        for name in must_beat:
            base_subset = selector(base_common.loc[base_common["baseline"] == name])
            if base_subset.empty:
                checks[name] = {"note": "missing side", "beats": False}
                continue
            base_pooled = metrics.pooled_metrics(
                metrics.monotone_fix(base_subset, list(TRAINED_QUANTILES)), list(TRAINED_QUANTILES), cfg)
            pooled[name] = {field: base_pooled[field] for field in headline}
            deltas = {str(q): round(model_pooled["pinball"][str(q)] - base_pooled["pinball"][str(q)], 4)
                      for q in gate_quantiles}
            checks[name] = {
                "rows": int(len(model_subset)),
                "model_pinball": {str(q): model_pooled["pinball"][str(q)] for q in gate_quantiles},
                "baseline_pinball": {str(q): base_pooled["pinball"][str(q)] for q in gate_quantiles},
                "delta": deltas,
                "model_coverage": {str(q): model_pooled["coverage"][str(q)] for q in (0.9, 0.95)},
                "baseline_coverage": {str(q): base_pooled["coverage"][str(q)] for q in (0.9, 0.95)},
                "model_wape_p50": model_pooled["wape_p50"],
                "baseline_wape_p50": base_pooled["wape_p50"],
                "beats": all(value < 0 for value in deltas.values()),
            }
        result["checks"][filter_name] = checks
        result["pooled_common"][filter_name] = pooled
    result["passed"] = all(entry["beats"] for checks in result["checks"].values()
                           for name, entry in checks.items())
    return result


def cold_start_report(predictions: pd.DataFrame, cfg: ForecastConfig) -> dict:
    """Metrics on the LOW_N (cold-start) series, kept separate from the main gate."""
    threshold = int(cfg.evaluation["low_n_threshold"])
    counts = predictions.groupby("series_id", observed=True).size()
    cold_ids = counts.loc[counts < threshold].index
    if len(cold_ids) == 0:
        return {"series": 0}
    subset = predictions.loc[predictions["series_id"].isin(cold_ids)]
    fixed = metrics.monotone_fix(subset, list(TRAINED_QUANTILES))
    pooled = metrics.pooled_metrics(fixed, list(TRAINED_QUANTILES), cfg)
    for quantile in TRAINED_QUANTILES:
        pooled[f"pinball_{quantile}"] = pooled["pinball"][str(quantile)]
        pooled[f"coverage_{quantile}"] = pooled["coverage"][str(quantile)]
    return {"series": int(len(cold_ids)), "rows": int(len(subset)), "low_n": True, "metrics": pooled}


# --------------------------------------------------------------------------------------- reporting


def _headline_row(split: str, filter_name: str, pooled: Mapping[str, Any]) -> dict:
    """Flatten a pooled-metric dict into the report columns."""
    return {
        "split": split, "filter": filter_name, "rows": pooled["rows"],
        "pinball_0.5": pooled["pinball"]["0.5"], "pinball_0.9": pooled["pinball"]["0.9"],
        "pinball_0.95": pooled["pinball"]["0.95"],
        "coverage_0.5": pooled["coverage"]["0.5"], "coverage_0.9": pooled["coverage"]["0.9"],
        "coverage_0.95": pooled["coverage"]["0.95"],
        "mae_p50": pooled["mae_p50"], "wape_p50": pooled["wape_p50"],
        "width_p95_p05": pooled.get("width_p95_p05"),
        "crossing_rate_raw": pooled.get("crossing_rate_raw"),
        "crossing_rate_fixed": pooled.get("crossing_rate_fixed"),
    }


def render_metrics_table(report: Mapping[str, Any], split: str,
                         baseline_name: str = MODEL_BASELINE_NAME) -> list[str]:
    """Markdown table of the model's pooled metrics, both filters."""
    columns = ("filter", "rows", "pinball_0.5", "pinball_0.9", "pinball_0.95", "coverage_0.5",
               "coverage_0.9", "coverage_0.95", "mae_p50", "wape_p50", "width_p95_p05",
               "crossing_rate_raw", "crossing_rate_fixed")
    lines = ["| " + " | ".join(columns) + " |", "|" + "|".join("---" for _ in columns) + "|"]
    for filter_name, splits in report["metrics"]["filters"].items():
        pooled = splits.get(split, {}).get(baseline_name)
        if pooled is None:
            continue
        row = _headline_row(split, filter_name, pooled)
        cells = []
        for column in columns:
            value = row[column]
            cells.append(f"{value:.4f}" if isinstance(value, float) else str(value))
        lines.append("| " + " | ".join(cells) + " |")
    return lines


def render_train_console(report: dict) -> str:
    """Console summary of training: selected variant/params, dropped features, valid metrics."""
    key = granularity_key(report.get("granularity", "WEEK"))
    lines = [
        f"F1 {key} quantile training - {report['model_version']}",
        f"features: {len(report['features'])} used, {len(report['dropped_constant_features'])} constant "
        f"dropped {report['dropped_constant_features']}",
        f"train window: {report['train_window']}",
        f"variant valid pinball (sum over quantiles): {report['variant_scores']} -> "
        f"selected {report['train_window']['variant']}",
        "selected parameters:",
    ]
    for quantile, entry in report["selected"].items():
        lines.append(f"  q{quantile}: {entry['params']} -> valid pinball {entry['valid_pinball']} "
                     f"(best_iter {entry['best_iteration']})")
    lines.append("")
    lines.append("valid metrics (model):")
    lines += ["  " + line for line in render_metrics_table(
        {"metrics": report["valid"]}, "valid", MODEL_BASELINE_NAMES[key])]
    gate = report.get("gate")
    if gate:
        lines.append(f"  gate passed: {gate['passed']}")
    return "\n".join(lines)


def render_eval_console(report: dict) -> str:
    """Console summary of the evaluation (labels repeated test runs)."""
    key = granularity_key(report.get("granularity", "WEEK"))
    display = DISPLAY_NAMES[key]
    label = (f" - {display} {report['split']} evaluation #{report['evaluation_number']}"
             if report.get("evaluation_number") else "")
    lines = [
        f"F1 {key} quantile evaluation - split {report['split']}{label} - {report['model_version']}",
        f"postprocess: {report.get('postprocess')} / rows: {report['rows']:,} / series {report['series']} "
        f"/ raw crossing rate {report['crossing_rate_raw']:.4f}",
        "",
    ]
    lines += ["  " + line for line in render_metrics_table(report, report["split"],
                                                           MODEL_BASELINE_NAMES[key])]
    gate = report.get("gate") or {}
    if gate.get("checks"):
        lines.append("")
        lines.append("gate vs baselines (negative delta = model better):")
        for filter_name, checks in gate["checks"].items():
            for baseline_name, entry in checks.items():
                lines.append(f"  {filter_name} / {baseline_name}: delta {entry.get('delta')} "
                             f"-> beats={entry.get('beats')}")
        lines.append(f"  gate passed: {gate.get('passed')}")
    return "\n".join(lines)


def write_train_reports(cfg: ForecastConfig, report: dict,
                        granularity: str = "WEEK") -> dict[str, Path]:
    """Write the training report (``model_train.*``, ``model_train_month.*`` for MONTH)."""
    key = granularity_key(granularity)
    suffix = "" if key == "WEEK" else f"_{key.lower()}"
    reports_dir = ensure_dir(cfg.reports_dir)
    json_path = reports_dir / f"model_train{suffix}.json"
    markdown_path = reports_dir / f"model_train{suffix}.md"
    json_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    phase = "Phase 4" if key == "WEEK" else "Phase 5"
    lines = [
        f"# {phase} - {DISPLAY_NAMES[key]} quantile model training",
        "",
        f"Generated: {report['generated_at']} (MOCK DATA - not real accuracy)",
        "",
        f"- Model version: `{report['model_version']}` (feature hash `{report['feature_hash']}`)",
        f"- Tree cap: `n_estimators = {report.get('n_estimators_cap')}` with early stopping "
        f"({report.get('early_stopping_rounds', EARLY_STOPPING_ROUNDS_DEFAULT)} rounds) on valid",
        f"- Features: {len(report['features'])} used; constant columns dropped: "
        f"{report['dropped_constant_features'] or 'none'}",
        f"- Training window: `{report['train_window']['variant']}` "
        f"({report['train_window']['origin_min']} -> {report['train_window']['origin_max']}, "
        f"{report['train_window']['rows']:,} rows)",
        f"- Variant valid pinball (sum over the seven quantiles): `{report['variant_scores']}`",
        f"- Post-processing: `{report.get('postprocess')}` "
        f"(width ratio {report.get('postprocess_comparison', {}).get('width_ratio')})",
        f"- Grid: {json.dumps(report['grid'])} (selected on valid only)",
        "",
        "## Selection",
        "",
        "| quantile | learning_rate | num_leaves | min_child_samples | valid pinball | best iteration |",
        "|---|---|---|---|---|---|",
    ]
    for quantile, entry in report["selected"].items():
        lines.append(f"| {quantile} | {entry['learning_rate']} | {entry['num_leaves']} | "
                     f"{entry['min_child_samples']} | {entry['valid_pinball']} | {entry['best_iteration']} |")
    comparison = report.get("postprocess_comparison", {})
    lines += ["", "## Post-processing choice (valid only)", "",
              "| variant | cov P90 | cov P95 | coverage score | width P95-P05 | raw crossing | fixed crossing |",
              "|---|---|---|---|---|---|---|"]
    for method, entry in comparison.get("variants", {}).items():
        lines.append(f"| {method} | {entry['coverage_0.9']} | {entry['coverage_0.95']} | "
                     f"{entry['coverage_score']} | {entry['width_p95_p05']} | "
                     f"{entry['crossing_rate_raw']} | {entry['crossing_rate_fixed']} |")
    rule = comparison.get("rule", {})
    lines += ["", f"Rule: {rule.get('requires')} (tolerance {rule.get('coverage_tolerance')}, "
                  f"width ratio <= {rule.get('max_width_ratio')}); width ratio "
                  f"{comparison.get('width_ratio')}; chosen **{comparison.get('chosen')}**", ""]
    lines += ["## Valid metrics", ""] + render_metrics_table(
        {"metrics": report["valid"]}, "valid", MODEL_BASELINE_NAMES[key])
    gate = report.get("gate") or {}
    scope = "" if not gate.get("scope") else f" ({gate['scope']}, {gate.get('rows_common')} rows)"
    lines += ["", f"## Gate (valid){scope}", ""]
    if gate.get("checks"):
        lines += ["| filter | baseline | delta P50 | delta P90 | delta P95 | beats |", "|---|---|---|---|---|---|"]
        for filter_name, checks in gate["checks"].items():
            for baseline_name, entry in checks.items():
                delta = entry.get("delta") or {}
                lines.append(f"| {filter_name} | {baseline_name} | {delta.get('0.5')} | {delta.get('0.9')} | "
                             f"{delta.get('0.95')} | {entry.get('beats')} |")
    lines += ["", f"Gate passed: **{gate.get('passed')}**", ""]
    lines += ["## All grid results (valid)", "",
              "| variant | quantile | learning_rate | num_leaves | min_child_samples | valid pinball | "
              "best iteration |", "|---|---|---|---|---|---|---|"]
    for row in sorted(report["grid_results"], key=lambda r: (r["variant"], r["quantile"], r["valid_pinball"])):
        lines.append(f"| {row['variant']} | {row['quantile']} | {row['learning_rate']} | {row['num_leaves']} | "
                     f"{row['min_child_samples']} | {row['valid_pinball']} | {row['best_iteration']} |")
    lines += ["", "## Notes", "",
              "- The test split is not read here; `evaluate --split test` is run once after selection.",
              "- Context flags come from the Phase 3 canonical (known-at-origin) rebuild.",
              "- MOCK DATA: these numbers describe the synthetic generator.", ""]
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    return {"json": json_path, "markdown": markdown_path}


def write_eval_reports(cfg: ForecastConfig, report: dict,
                       granularity: str = "WEEK") -> dict[str, Path]:
    """Write the evaluation report (``model_<split>.*``; ``_month`` suffix for MONTH)."""
    key = granularity_key(granularity)
    suffix = "" if key == "WEEK" else f"_{key.lower()}"
    reports_dir = ensure_dir(cfg.reports_dir)
    split = report["split"]
    json_path = reports_dir / f"model_{split}{suffix}.json"
    markdown_path = reports_dir / f"model_{split}{suffix}.md"
    json_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    number = report.get("evaluation_number")
    phase = "Phase 4" if key == "WEEK" else "Phase 5"
    title = f"# {phase} - {DISPLAY_NAMES[key]} quantile model ({split})"
    if number:
        title += f" - evaluation #{number}"
    lines = [
        title,
        "",
        f"Generated: {report['generated_at']} (MOCK DATA - not real accuracy)",
        "",
        f"- Model: `{report['model_version']}`; features {len(report['features'])}; "
        f"postprocess `{report.get('postprocess')}`; train window `{report['train_window']['variant']}`",
        (f"- **This is {DISPLAY_NAMES[key]} test evaluation #{number}**; all choices were frozen on valid "
         "before it ran." if split == "test" and number else ""),
        f"- Rows: {report['rows']:,} / series {report['series']}; raw crossing rate "
        f"{report['crossing_rate_raw']:.4f} (bands are fixed before scoring)",
        (f"- Series without any row in this split: {report['series_without_rows']} "
         "(inference must use a fallback: COLD_START / MA_ES)"
         if report.get("series_without_rows") else ""),
        "",
        "## Model metrics",
        "",
    ] + render_metrics_table(report, split, MODEL_BASELINE_NAMES[key])

    gate = report.get("gate") or {}
    scope = "" if not gate.get("scope") else f" ({gate['scope']}, {gate.get('rows_common')} rows)"
    lines += ["", f"## Gate vs baselines{scope}", ""]
    if gate.get("checks"):
        lines += ["| filter | baseline | delta P50 | delta P90 | delta P95 | beats |",
                  "|---|---|---|---|---|---|"]
        for filter_name, checks in gate["checks"].items():
            for baseline_name, entry in checks.items():
                delta = entry.get("delta") or {}
                lines.append(f"| {filter_name} | {baseline_name} | {delta.get('0.5')} | "
                             f"{delta.get('0.9')} | {delta.get('0.95')} | {entry.get('beats')} |")
        lines += ["", f"Gate passed: **{gate.get('passed')}**"]
    else:
        lines += [str(gate.get("note", "gate not evaluated"))]

    cold = report.get("cold_start") or {}
    lines += ["", "## Cold-start series (LOW_N)", ""]
    if cold.get("rows"):
        lines += [f"- series: {cold['series']}, rows: {cold['rows']} (all LOW_N: fewer than 26 periods)",
                  f"- pinball P50/P90/P95: {cold['metrics']['pinball_0.5']} / "
                  f"{cold['metrics']['pinball_0.9']} / {cold['metrics']['pinball_0.95']}",
                  f"- coverage P90/P95: {cold['metrics']['coverage_0.9']} / {cold['metrics']['coverage_0.95']}"]
    else:
        lines.append("- none")
    lines += ["", "## Notes", "",
              f"- Post-processing: `{report.get('postprocess')}` (chosen on valid). Raw crossing is measured "
              "before the fix and recomputed on each filter's own rows; the fixed rate is after it.",
              "- Interval width is P95 - P05 (all seven quantiles are trained), matching the baseline table.",
              "- MOCK DATA: these numbers describe the synthetic generator.", ""]
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    return {"json": json_path, "markdown": markdown_path}
