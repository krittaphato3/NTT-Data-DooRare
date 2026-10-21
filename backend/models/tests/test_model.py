"""Phase 4 model contracts: post-processing, feature selection, windows and a tiny end-to-end fit."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from f1_forecast import model
from f1_forecast.schema import quantile_column


def _tiny_frame(rows: int = 60, seed: int = 0) -> pd.DataFrame:
    """Synthetic frame with the columns the trainer and the evaluation need."""
    rng = np.random.default_rng(seed)
    frame = pd.DataFrame({
        "series_id": [f"s{index % 3}" for index in range(rows)],
        "origin": pd.date_range("2024-01-01", periods=rows, freq="W-MON"),
        "split": "train",
        "y": rng.integers(0, 40, rows).astype(float),
        "y_target": rng.integers(0, 40, rows).astype(float),
        "lag_1w": rng.integers(0, 40, rows).astype(float),
        "roll_mean_4w": rng.integers(0, 40, rows).astype(float),
        "ved": pd.Categorical(rng.choice(["V", "E"], rows)),
        "unit_price_thb": rng.uniform(5, 500, rows),
        "origin_stock": rng.uniform(0, 200, rows),
        "target_stockout_days": rng.integers(0, 3, rows),
    })
    return frame


def test_postprocess_clips_negatives_and_sorts_rows():
    """Bands are clipped at 0 and sorted, while the raw crossing rate keeps the pre-sort picture."""
    raw = {0.5: np.array([10.0, -3.0, 5.0]), 0.9: np.array([8.0, 4.0, 6.0]),
           0.95: np.array([7.0, 5.0, 9.0])}
    assert model.raw_crossing_rate(raw) == pytest.approx(1 / 3)

    ordered = model.postprocess(raw)
    values = np.column_stack([ordered[q] for q in sorted(ordered)])
    assert (values >= 0).all()
    assert (np.diff(values, axis=1) >= 0).all()
    # the negative P50 becomes 0 and is still the smallest value in its row
    assert ordered[0.5][1] == 0.0


def test_isotonic_keeps_levels_instead_of_moving_extremes():
    """PAVA pools a violating pair at their mean; a plain sort would move 8 to the bottom and 10 to the top."""
    raw = {0.5: np.array([10.0, 10.0]), 0.9: np.array([8.0, 12.0]), 0.95: np.array([9.0, 11.0])}
    sorted_bands = model.postprocess(raw, "sort")
    isotonic = model.postprocess(raw, "isotonic")

    assert list(sorted_bands[0.5]) == [8.0, 10.0]          # sort pulls the low value down
    assert list(isotonic[0.5]) == [9.0, 10.0]              # PAVA pools (10, 8) to 9
    values = np.column_stack([isotonic[q] for q in sorted(isotonic)])
    assert (np.diff(values, axis=1) >= 0).all()
    assert (values >= 0).all()


def test_select_features_drops_constant_and_empty_columns():
    """Constant/all-NaN columns are excluded and reported."""
    frame = pd.DataFrame({
        "varying": [1.0, 2.0, 3.0],
        "constant": [1.0, 1.0, 1.0],
        "empty": [np.nan, np.nan, np.nan],
    })
    kept, dropped = model.select_features(frame, ["varying", "constant", "empty"])
    assert kept == ["varying"]
    assert dropped == ["constant", "empty"]


def test_train_window_variants_select_the_expected_rows():
    """``last_24_months`` keeps only origins inside the 24 months before the valid start."""
    frame = pd.DataFrame({"origin": pd.to_datetime(
        ["2022-01-03", "2023-08-14", "2023-08-21", "2024-01-01"])})
    valid_start = pd.Timestamp("2025-08-18")
    assert len(model._train_window(frame, "all_history", valid_start)) == 4
    recent = model._train_window(frame, "last_24_months", valid_start)
    assert recent["origin"].min() == pd.Timestamp("2023-08-21")


def test_weekly_dataset_contract(cfg):
    """Real dataset: all splits present, no id/target columns, constants reported (not silent)."""
    dataset = model.build_weekly_dataset(cfg)
    assert len(dataset.train) == 68_226
    assert len(dataset.valid) == 4_648
    assert len(dataset.test) == 4_691
    assert not set(dataset.features) & {"series_id", "y_target", "split", "num_hist_weeks"}
    kept, dropped = model.select_features(dataset.train, dataset.features)
    assert dropped == []
    assert dataset.dropped_constant == []
    assert {"price_tier", "ved", "abc", "item_type", "hospital_tier"}.issubset(dataset.categorical)


def test_monthly_dataset_contract(cfg):
    """Real monthly dataset: spec split sizes, constant ctx flags dropped and logged, no id columns."""
    dataset = model.build_monthly_dataset(cfg)
    assert (len(dataset.train), len(dataset.valid), len(dataset.test)) == (13_446, 1_992, 1_993)
    assert dataset.dropped_constant == ["ctx_flu_peak", "ctx_dengue_peak"]
    assert len(dataset.features) == 33
    assert {"lag_12m", "roll_zero_share_6m", "month_sin", "item_te_mean"}.issubset(dataset.features)
    assert not set(dataset.features) & {"series_id", "y_target", "split", "origin_month"}
    assert dataset.valid["origin"].min() == pd.Timestamp("2024-08-01")
    assert dataset.valid["origin"].max() == pd.Timestamp("2025-07-01")
    assert dataset.test["origin"].min() == pd.Timestamp("2025-09-01")
    assert dataset.test["origin"].max() == pd.Timestamp("2026-08-01")
    assert dataset.valid["series_id"].nunique() == 166


def test_model_version_separates_granularity_and_revision(cfg):
    """MONTH artifacts get their own version string; the revision suffix is the Phase 5 bump."""
    features = ["lag_1m", "lag_12m"]
    week = model.model_version(cfg, pd.Timestamp("2026-09-14"), features, "WEEK")
    month = model.model_version(cfg, pd.Timestamp("2026-08-01"), features, "MONTH")
    assert week != month
    assert week.startswith("f1-WEEK-") and month.startswith("f1-MONTH-")
    assert week.endswith(f"-r{cfg.raw['model_version_revision']}")


def test_common_row_keys_keep_only_rows_scored_by_every_method():
    """A gate on the common row set must not compare rows that one method cannot score."""
    keys = ["series_id", "origin"]
    origins = pd.date_range("2025-09-01", periods=4, freq="MS")
    predictions = pd.DataFrame({"series_id": "s0", "origin": origins})
    baselines = pd.DataFrame({
        "series_id": "s0", "origin": list(origins[:3]) + list(origins[1:]),
        "baseline": ["a"] * 3 + ["b"] * 3,
    })
    common = model.common_row_keys(predictions, baselines)
    assert list(common["origin"]) == [origins[1], origins[2]]


def test_fit_predict_evaluate_end_to_end(cfg):
    """Three quantile models on a tiny frame produce monotone, metrics-ready predictions."""
    train = _tiny_frame(80, seed=1)
    valid = _tiny_frame(40, seed=2)
    feature_list = ["lag_1w", "roll_mean_4w"]
    params = {**model._base_params(cfg), "n_estimators": 20, "num_leaves": 3,
              "min_child_samples": 5, "learning_rate": 0.1}

    models = {q: model.fit_quantile(train, valid, feature_list, q, params, int(cfg.seed))
              for q in model.TRAINED_QUANTILES}
    trained = model.TrainedModel(models=models, feature_list=feature_list, dropped_constant=[],
                                 categorical=[], train_variant="all_history",
                                 train_window={"variant": "all_history"},
                                 feature_hash=model.feature_hash(feature_list), model_version="test")
    predictions = model.predict_frame(trained, valid)

    columns = [quantile_column(q) for q in model.TRAINED_QUANTILES]
    assert set(columns).issubset(predictions.columns)
    assert (predictions[columns] >= 0).all().all()
    assert (np.diff(predictions[columns].to_numpy(), axis=1) >= 0).all()
    assert 0.0 <= model.crossing_rate_raw_columns(predictions, model.TRAINED_QUANTILES) <= 1.0

    evaluation = model.evaluate_frame(predictions, cfg)
    pooled = evaluation["filters"]["all_rows"]["train"][model.MODEL_BASELINE_NAME]
    assert pooled["rows"] == len(valid)
    assert 0.0 <= pooled["coverage"]["0.9"] <= 1.0
    assert "width_p95_p05" in pooled                              # seven quantiles -> comparable width
    assert pooled["crossing_rate_fixed"] == 0.0
    assert 0.0 <= pooled["crossing_rate_raw"] <= 1.0


def test_raw_crossing_is_recomputed_per_filter(cfg):
    """The no-stock-out figure is computed on its own rows, not copied from the split-wide scalar."""
    quantiles = list(model.TRAINED_QUANTILES)
    base = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
    raw_rows = np.vstack([base, base * 2, base[::-1], base[::-1] * 2])   # last two rows cross
    fixed_rows = np.sort(raw_rows, axis=1)
    frame = pd.DataFrame({"series_id": "s0", "origin": pd.date_range("2024-01-01", periods=4, freq="W-MON"),
                          "split": "valid", "y": [1.0, 2.0, 3.0, 4.0], "ved": "V",
                          "unit_price_thb": 10.0, "origin_stock": 0.0,
                          "target_stockout_days": [0, 0, 1, 1],
                          "baseline": model.MODEL_BASELINE_NAME})
    for index, quantile in enumerate(quantiles):
        frame[f"raw_{quantile_column(quantile)}"] = raw_rows[:, index]
        frame[quantile_column(quantile)] = fixed_rows[:, index]

    evaluation = model.evaluate_frame(frame, cfg)
    all_rows = evaluation["filters"]["all_rows"]["valid"][model.MODEL_BASELINE_NAME]
    clean_rows = evaluation["filters"]["no_stockout_rows"]["valid"][model.MODEL_BASELINE_NAME]
    assert all_rows["crossing_rate_raw"] == pytest.approx(0.5)
    assert clean_rows["crossing_rate_raw"] == pytest.approx(0.0)
    assert all_rows["crossing_rate_fixed"] == 0.0
    assert clean_rows["crossing_rate_fixed"] == 0.0
    # the pair breakdown must come from the raw bands too, not from the already sorted qXX columns
    assert all_rows["crossing_pairs_raw"]["q90>q95"] == pytest.approx(0.5)
    assert clean_rows["crossing_pairs_raw"]["q90>q95"] == pytest.approx(0.0)


def test_artifact_round_trip(cfg, tmp_path):
    """A written artifact reloads with the same feature contract and predicts identically."""
    train = _tiny_frame(80, seed=3)
    valid = _tiny_frame(30, seed=4)
    feature_list = ["lag_1w", "roll_mean_4w"]
    params = {**model._base_params(cfg), "n_estimators": 10, "num_leaves": 3,
              "min_child_samples": 5, "learning_rate": 0.1}
    models = {q: model.fit_quantile(train, valid, feature_list, q, params, int(cfg.seed))
              for q in model.TRAINED_QUANTILES}
    trained = model.TrainedModel(models=models, feature_list=feature_list, dropped_constant=[],
                                 categorical=[], train_variant="all_history",
                                 train_window={"variant": "all_history", "rows": len(train),
                                               "origin_min": "2024-01-01", "origin_max": "2025-06-01"},
                                 feature_hash=model.feature_hash(feature_list), model_version="f1-WEEK-test")

    dataset = model.Dataset(train=train, valid=valid, test=valid, features=feature_list,
                            categorical=[], dropped_constant=[], data_end=pd.Timestamp("2025-01-01"))
    directory = model.write_artifact(cfg, trained, dataset, pd.Timestamp("2025-01-01"))
    try:
        meta = json.loads((directory / "meta.json").read_text(encoding="utf-8"))
        assert meta["feature_hash"] == trained.feature_hash
        assert meta["granularity"] == "WEEK"
        assert meta["n_estimators_cap"] == int(model._base_params(cfg)["n_estimators"])
        assert meta["quantiles"] == list(model.TRAINED_QUANTILES)
        assert set(meta["models"]) == {str(q) for q in model.TRAINED_QUANTILES}
        assert meta["postprocess"] == "sort"

        reloaded, _ = model.load_artifact(cfg, directory)
        assert reloaded.feature_list == feature_list
        before = model.predict_frame(trained, valid)
        after = model.predict_frame(reloaded, valid)
        for column in (quantile_column(q) for q in model.TRAINED_QUANTILES):
            np.testing.assert_allclose(before[column], after[column], rtol=0, atol=1e-9)
    finally:
        for path in directory.glob("*"):
            path.unlink()
        directory.rmdir()
