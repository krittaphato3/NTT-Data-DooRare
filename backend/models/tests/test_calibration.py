"""Phase 6b calibration contracts: conformal offset, re-sort, decision rule, artifact round-trip."""

from __future__ import annotations

import dataclasses

import numpy as np
import pandas as pd
import pytest

from f1_forecast import calibration as calib
from f1_forecast import model

QUANTILES = list(model.TRAINED_QUANTILES)


def _frame(rows: int = 200, scale: float = 1.0, seed: int = 0, series: int = 3) -> pd.DataFrame:
    """Synthetic prediction frame: lognormal y, bands from a fixed quantile grid."""
    rng = np.random.default_rng(seed)
    frame = pd.DataFrame({
        "series_id": [f"s{index % series}" for index in range(rows)],
        "origin": pd.date_range("2025-01-01", periods=rows, freq="D"),
        "y": rng.lognormal(mean=3.0, sigma=1.0, size=rows),
    })
    for tau in QUANTILES:
        frame[f"q{int(round(tau * 100)):02d}"] = np.exp(3.0 + scale * 1.0) * 1.5
    return frame


def test_conformal_offset_uses_the_finite_sample_level():
    """Level is ceil((n+1) * tau) / n and the 'higher' interpolation, not a plain percentile."""
    scores = np.arange(100, dtype=float)
    assert calib.conformal_offset(scores, 0.90) == pytest.approx(91.0)
    assert calib.conformal_offset(scores, 0.50) == pytest.approx(51.0)
    assert calib.conformal_offset(scores, 0.95) == pytest.approx(96.0)
    # monotone in tau
    offsets = [calib.conformal_offset(scores, tau) for tau in QUANTILES]
    assert offsets == sorted(offsets)


def test_apply_offsets_clips_and_sorts_per_row():
    """Calibrated bands stay non-negative and strictly ascending even with wild offsets."""
    frame = _frame(10, seed=1)
    offsets = {str(tau): (5.0 if tau < 0.5 else -2.0) for tau in QUANTILES}
    out = calib.apply_offsets(frame, offsets)
    columns = [f"q{int(round(tau * 100)):02d}" for tau in QUANTILES]
    assert (out[columns] >= 0).all().all()
    assert (np.diff(out[columns].to_numpy(float), axis=1) >= 0).all()
    # pre-sort columns keep the inversion so the crossing diagnostic can see it
    assert not (np.diff(out[[f"cal_raw_{column}" for column in columns]].to_numpy(float), axis=1) >= 0).all()


def test_fitted_offsets_restore_nominal_coverage_on_a_holdout():
    """Fitting on one draw and applying to a second draw lands coverage near the nominal level."""
    fit = _frame(4000, scale=0.8, seed=2)
    holdout = _frame(4000, scale=0.8, seed=3)
    offsets = calib.fit_offsets(fit)
    calibrated = calib.apply_offsets(holdout, offsets)
    cov90, cov95 = calib.coverage_pair(calibrated)
    assert abs(cov90 - 0.90) < 0.03
    assert abs(cov95 - 0.95) < 0.03


def test_rule_check_rejects_a_variant_that_widens_or_loses_coverage():
    """All three pre-registered conditions must hold; width and pinball guard against blind widening."""
    good = {"coverage_error_off": 0.05, "coverage_error_calibrated": 0.01, "width_ratio": 1.02,
            "pinball_ratio": {"0.5": 1.0, "0.9": 1.0, "0.95": 1.0}}
    assert calib.rule_check(good)["passes"] is True

    worse_coverage = {**good, "coverage_error_calibrated": 0.06}
    assert calib.rule_check(worse_coverage)["coverage_improves"] is False

    too_wide = {**good, "width_ratio": 1.25}
    assert calib.rule_check(too_wide)["width_ok"] is False

    p50_loss = {**good, "pinball_ratio": {"0.5": 1.02, "0.9": 1.0, "0.95": 1.0}}
    assert calib.rule_check(p50_loss)["pinball_ok"] is False

    tail_loss = {**good, "pinball_ratio": {"0.5": 1.0, "0.9": 1.0, "0.95": 1.04}}
    assert calib.rule_check(tail_loss)["pinball_ok"] is False


def test_choose_variant_prefers_global_unless_tercile_is_much_better():
    """Global wins ties; tercile needs a 20 % relative cut in coverage error."""
    base = {"coverage_error_off": 0.04, "width_ratio": 1.0,
            "pinball_ratio": {"0.5": 1.0, "0.9": 1.0, "0.95": 1.0}}
    results = {"off": base,
               "global": {**base, "coverage_error_calibrated": 0.02},
               "tercile": {**base, "coverage_error_calibrated": 0.018}}
    assert calib.choose_variant(results, tercile_feasible=True)["variant"] == "global"

    results["tercile"] = {**base, "coverage_error_calibrated": 0.010}
    assert calib.choose_variant(results, tercile_feasible=True)["variant"] == "tercile"

    assert calib.choose_variant(results, tercile_feasible=False)["variant"] == "global"
    assert calib.choose_variant({"off": base, "global": {**base, "coverage_error_calibrated": 0.05}},
                                tercile_feasible=False)["enabled"] is False


def test_valid_time_blocks_leave_a_one_period_gap():
    """28 weekly origins -> 14 calibrate, 1 gap, 13 check; monthly 12 -> 6 / 1 / 5."""
    weekly = pd.Series(pd.date_range("2025-08-18", periods=28, freq="7D"))
    blocks = calib.valid_time_blocks(weekly, "WEEK")
    assert (len(blocks["calibrate"]), len(blocks["gap"]), len(blocks["check"])) == (14, 1, 13)
    assert blocks["gap"][0] not in blocks["calibrate"] and blocks["gap"][0] not in blocks["check"]

    monthly = pd.Series(pd.date_range("2024-08-01", periods=12, freq="MS"))
    blocks = calib.valid_time_blocks(monthly, "MONTH")
    assert (len(blocks["calibrate"]), len(blocks["gap"]), len(blocks["check"])) == (6, 1, 5)


def test_volume_buckets_split_series_into_three_equal_groups(cfg):
    """Bucket members are terciles of the train mean y; unknown series are simply absent."""
    train = pd.DataFrame({"series_id": [f"s{index}" for index in range(9)] * 2,
                          "y": [float(value) for value in list(range(1, 10)) * 2]})
    buckets = calib.series_volume_buckets(train, [f"s{index}" for index in range(9)] + ["unknown"])
    assert set(buckets) == {f"s{index}" for index in range(9)}
    assert list(buckets.values()).count("low") == 3
    assert buckets["s0"] == "low" and buckets["s8"] == "high"


def test_config_carries_the_phase_6b_decision(cfg):
    """The switch that inference will obey matches the accepted decision (WEEK on, MONTH off)."""
    assert calib.settings(cfg, "WEEK") == {"enabled": True, "variant": "global"}
    assert calib.settings(cfg, "MONTH") == {"enabled": False, "variant": "off"}


def test_calibration_artifact_round_trip(cfg, tmp_path):
    """Offsets and bucket map survive save/load under artifacts/calibration/<model_version>/."""
    cfg = dataclasses.replace(cfg, artifacts_dir=tmp_path)
    fitted = calib.Calibration(
        model_version="f1-TEST-0000", granularity="WEEK", variant="global",
        offsets={str(tau): 0.1 * index for index, tau in enumerate(QUANTILES)},
        fitted_rows=100, fitted_origins=["2025-01-01"], decision={"enabled": True, "variant": "global"})
    path = calib.save_calibration(cfg, fitted)
    assert path == tmp_path / "calibration" / "f1-TEST-0000" / "calibration.json"
    loaded = calib.load_calibration(cfg, "f1-TEST-0000")
    assert loaded.variant == "global"
    assert loaded.offsets["0.95"] == pytest.approx(0.6)
    assert loaded.decision == {"enabled": True, "variant": "global"}

    frame = _frame(20, seed=4)
    assert np.allclose(fitted.apply(frame)[[f"q{int(round(tau * 100)):02d}" for tau in QUANTILES]],
                       loaded.apply(frame)[[f"q{int(round(tau * 100)):02d}" for tau in QUANTILES]])
