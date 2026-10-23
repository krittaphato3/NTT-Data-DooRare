"""Phase 7a inference contracts: parity, JSON rules, counts, flags and documented exit codes."""

from __future__ import annotations

import json
import math
from datetime import date

import numpy as np
import pandas as pd
import pytest

from f1_forecast import clean, data_loader, predict
from f1_forecast.cli import main as cli_main

QUANTILES = list(predict.QUANTILES)
REQUIRED = ("hospitalId", "hospitalCode", "hospitalDrugId", "itemCode", "periodStart", "originPeriod",
            "method", "demandPattern", "ved", "abc", "p05", "p10", "p25", "p50", "p75", "p90", "p95",
            "uPerDay", "sigmaPerDay", "leadTimeDays", "leadTimeQuantile", "leadTimeQuantileApprox",
            "stockOnHand", "incoming", "confidenceFlag", "confidenceFlags", "flags")


@pytest.fixture(scope="session")
def week_forecast(cfg):
    return predict.build_forecast(cfg, "WEEK")


@pytest.fixture(scope="session")
def month_forecast(cfg):
    return predict.build_forecast(cfg, "MONTH")


@pytest.fixture(scope="session")
def scope_ids(cfg, pack, series):
    return set(clean.scope_ids(series))


@pytest.fixture(scope="session")
def parity(cfg):
    return {granularity: predict.parity_check(cfg, granularity, origins=2)
            for granularity in ("WEEK", "MONTH")}


def _frame(payload: dict) -> pd.DataFrame:
    return pd.DataFrame(payload["rows"])


def test_parity_reproduces_saved_valid_predictions(parity):
    """Feature build -> model -> post-process (-> calibration) must be bit-identical to the saved rows."""
    for granularity, entry in parity.items():
        assert entry["rows"] >= 300, granularity
        assert entry["uncalibrated_max"] == pytest.approx(0.0, abs=1e-9)
        if entry["calibrated"]:
            assert entry["calibrated"]["rows"] >= 300
            assert entry["calibrated"]["max"] == pytest.approx(0.0, abs=1e-9)


def test_forecast_origins_and_data_end(week_forecast, month_forecast):
    """Both runs use the latest complete origin and report the true data end."""
    assert week_forecast["dataEnd"] == "2026-09-30"
    assert week_forecast["originUsed"] == "2026-09-21"
    assert week_forecast["asOf"] == "2026-09-21"
    assert month_forecast["originUsed"] == "2026-09-01"
    assert month_forecast["dataEnd"] == "2026-09-30"


def test_series_counts_cover_every_modelled_series(week_forecast, month_forecast, scope_ids):
    """173 rows for WEEK; MONTH = 167 model rows + 6 explicit fallbacks = 173, no Min-Max series."""
    week = _frame(week_forecast)
    month = _frame(month_forecast)
    assert len(week) == 173 and set(week["hospitalDrugId"]) == scope_ids
    assert len(month) == 173 and set(month["hospitalDrugId"]) == scope_ids
    assert (month["method"] == predict.METHOD_QUANTILE).sum() == 167
    assert (month["method"] == predict.METHOD_MA_ES).sum() == 6
    assert month_forecast["counts"]["fallbackRows"] == 6


def test_quantiles_are_monotone_and_non_negative(week_forecast, month_forecast):
    columns = [f"p{int(round(q * 100)):02d}" for q in QUANTILES]
    for payload in (week_forecast, month_forecast):
        frame = _frame(payload)[columns].to_numpy(dtype=float)
        assert np.isfinite(frame).all()
        assert (frame >= 0).all()
        assert (np.diff(frame, axis=1) >= 0).all()


def test_total_target_follows_f06(week_forecast, month_forecast):
    """V -> ceil(max(P95, P50)); E -> ceil(max(P90, P50)); D -> null; TT >= P50."""
    for payload in (week_forecast, month_forecast):
        frame = _frame(payload)
        for level, column in (("V", "p95"), ("E", "p90")):
            subset = frame.loc[frame["ved"] == level]
            assert (~subset["totalTarget"].isna()).all()
            expected = np.ceil(subset[["p50", column]].max(axis=1))
            assert np.allclose(subset["totalTarget"].to_numpy(float), expected.to_numpy(float))
        assert frame.loc[frame["ved"] == "D", "totalTarget"].isna().all()
        judged = frame.loc[frame["totalTarget"].notna()]
        assert (judged["totalTarget"] >= judged["p50"]).all()
        assert ((judged["totalTarget"] % 1) == 0).all()  # whole base units


def test_daily_usage_and_lead_time_quantile(week_forecast, month_forecast):
    """F-08 u = P50/7 or /30; ASM-43 Q_q(L) = P_q x L/days, ceil, always flagged approximate."""
    for payload, days in ((week_forecast, 7), (month_forecast, 30)):
        frame = _frame(payload)
        assert np.allclose(frame["uPerDay"], (frame["p50"] / days).round(3), atol=1e-3)
        assert frame["leadTimeQuantileApprox"].all()
        assert frame["flags"].map(lambda flags: "LEAD_TIME_QUANTILE_APPROX" in flags).all()
        for level, column in (("V", "p95"), ("E", "p90")):
            subset = frame.loc[frame["ved"] == level]
            expected = np.ceil(subset[column] * subset["leadTimeDays"] / days)
            assert np.allclose(subset["leadTimeQuantile"].to_numpy(float), expected.to_numpy(float))
        assert frame.loc[frame["ved"] == "D", "leadTimeQuantile"].isna().all()
        assert (frame["leadTimeDays"] >= 1).all()


def test_lead_time_quantile_scales_by_run_granularity(week_forecast, month_forecast):
    """Regression: a MONTH run divides by 30 even for L <= 7 (and a WEEK run by 7 even for L > 7).

    The spec switches band by L, but one run only has one band; the definitions text and this test pin the
    implemented behaviour so it can never silently drift to the other divisor.
    """
    month = _frame(month_forecast)
    short = month.loc[month["leadTimeDays"] <= 7]
    assert len(short) > 0, "no MONTH row with L <= 7 to exercise the case"
    for level, column in (("V", "p95"), ("E", "p90")):
        subset = short.loc[short["ved"] == level]
        if subset.empty:
            continue
        expected = np.ceil(subset[column] * subset["leadTimeDays"] / 30)
        assert np.allclose(subset["leadTimeQuantile"].to_numpy(float), expected.to_numpy(float))
    week = _frame(week_forecast)
    long_lead = week.loc[week["leadTimeDays"] > 7]
    assert len(long_lead) > 0
    for level, column in (("V", "p95"), ("E", "p90")):
        subset = long_lead.loc[long_lead["ved"] == level]
        expected = np.ceil(subset[column] * subset["leadTimeDays"] / 7)
        assert np.allclose(subset["leadTimeQuantile"].to_numpy(float), expected.to_numpy(float))


def test_definitions_state_the_implemented_scaling_and_the_data_end_caveat(week_forecast, month_forecast):
    """The contract text must match the code: per-run divisor, and the dataEnd stock caveat."""
    for payload, days in ((week_forecast, 7), (month_forecast, 30)):
        lead = payload["definitions"]["leadTimeQuantile"]
        assert f"L/{days}" in lead
        assert "LEAD_TIME_QUANTILE_APPROX" in lead
        assert "dataEnd" in payload["definitions"]["projectedOnHand"]
        assert "pessimistic" in payload["definitions"]["projectedOnHand"]


def test_projected_on_hand_is_named_by_quantile(week_forecast, month_forecast):
    """projectedOnHand_pXX = stock + incoming - pXX, with incoming treated as available now."""
    for payload in (week_forecast, month_forecast):
        frame = _frame(payload)
        for level in (0.50, 0.90, 0.95):
            column = f"p{int(round(level * 100)):02d}"
            expected = (frame["stockOnHand"] + frame["incoming"] - frame[column]).round(3)
            assert np.allclose(frame[f"projectedOnHand_{column}"], expected)
        assert payload["definitions"]["incoming"].endswith("optimistic about timing)")


def test_confidence_flags_on_cold_start_and_fallback_rows(week_forecast, month_forecast):
    """Weekly cold-start series are flagged; monthly fallbacks say FALLBACK_CLASSICAL."""
    week = _frame(week_forecast)
    cold = week.loc[week["confidenceFlag"] == "COLD_START"]
    assert len(cold) == 7
    assert all(set(flags) >= {"COLD_START", "LOW_CONFIDENCE"} for flags in cold["confidenceFlags"])
    assert (cold["method"] == predict.METHOD_QUANTILE).all()

    month = _frame(month_forecast)
    fallback = month.loc[month["method"] == predict.METHOD_MA_ES]
    assert len(fallback) == 6
    assert (fallback["confidenceFlag"] == "FALLBACK_CLASSICAL").all()
    assert all("LOW_CONFIDENCE" in flags for flags in fallback["confidenceFlags"])
    # fallback rows keep their own scale (last complete month), not a silent zero
    assert (fallback["p50"] > 0).all()


def test_calibration_is_applied_as_configured(week_forecast, month_forecast):
    assert week_forecast["calibration"]["enabled"] is True
    assert week_forecast["calibration"]["variant"] == "global"
    assert month_forecast["calibration"] == {"enabled": False, "variant": "off", "rows": None}


def test_required_fields_are_present(week_forecast, month_forecast):
    for payload in (week_forecast, month_forecast):
        frame = _frame(payload)
        for column in REQUIRED:
            assert column in frame.columns, column
            if column in ("sigmaPerDay", "leadTimeQuantile", "projectedOnHand_p90"):
                continue  # nullable by design (D rows / unavailable sigma)
            if column in ("p05", "p10", "p25", "p50", "p75", "p90", "p95", "uPerDay", "stockOnHand",
                          "incoming"):
                assert frame[column].notna().all(), column
        for column in ("p50", "p90", "p95", "totalTarget", "uPerDay"):
            assert frame[column].notna().sum() > 0
        assert (frame["coverageOk"].isin([True, False]) | frame["coverageOk"].isna()).all()


def test_predict_writes_the_json_contract(cfg, week_forecast, tmp_path):
    """The written file matches the payload and lands under artifacts/forecasts/<model_version>/."""
    payload = {**week_forecast}
    payload.pop("paths", None)
    scratch = cfg.__class__(**{**cfg.__dict__, "forecasts_dir": tmp_path / "forecasts"})
    written = predict.write_forecast(scratch, payload, write_csv=True)
    path = written["json"]
    assert path.endswith("forecast_WEEK_2026-09-21.json")
    assert path.split("forecasts/")[1].startswith("f1-WEEK-")
    stored = json.loads(open(path, encoding="utf-8").read())
    assert stored["modelVersion"] == payload["modelVersion"]
    assert len(stored["rows"]) == 173
    assert written["csv"].endswith(".csv")


def test_no_model_exit_code(cfg, monkeypatch, capsys):
    """A pinned artifact that does not exist returns 3 and a JSON error on stderr."""
    broken = cfg.__class__(**{**cfg.__dict__,
                              "inference": {**cfg.inference,
                                            "model_versions": {**cfg.inference["model_versions"],
                                                               "WEEK": "f1-WEEK-does-not-exist"}}})
    monkeypatch.setattr("f1_forecast.cli.load_config", lambda *_args, **_kwargs: broken)
    code = cli_main(["predict", "--granularity", "WEEK", "--no-write"])
    assert code == predict.EXIT_CODES["NO_MODEL"] == 3
    error = json.loads(capsys.readouterr().err)
    assert error["error"]["code"] == "NO_MODEL"
    assert error["error"]["exitCode"] == 3


def test_stale_input_exit_code(cfg):
    """Data end older than the configured threshold raises STALE_INPUT (exit 4)."""
    with pytest.raises(predict.PredictError) as caught:
        predict.build_forecast(cfg, "WEEK", today=date(2027, 6, 1))
    assert caught.value.code == "STALE_INPUT"
    assert caught.value.exit_code == 4
    assert caught.value.details["thresholdDays"] == int(cfg.inference["stale_after_days"])


def test_stale_threshold_env_override(cfg, monkeypatch):
    """F1_STALE_AFTER_DAYS lifts the threshold so the scheduled job can predict on older data."""
    monkeypatch.setenv("F1_STALE_AFTER_DAYS", "3650")
    predict.check_stale(cfg, pd.Timestamp("2026-09-30"), date(2027, 6, 1))  # no raise
    monkeypatch.setenv("F1_STALE_AFTER_DAYS", "10")
    with pytest.raises(predict.PredictError) as caught:
        predict.check_stale(cfg, pd.Timestamp("2026-09-30"), date(2026, 10, 23))
    assert caught.value.details["thresholdDays"] == 10


def test_schema_mismatch_exit_code(cfg):
    """A feature contract the inference frame cannot satisfy raises SCHEMA_MISMATCH (exit 6)."""
    trained, _ = predict.load_model(cfg, "WEEK")
    broken = type(trained)(**{**trained.__dict__,
                              "feature_list": trained.feature_list + ["not_a_real_feature"]})
    frame = pd.DataFrame({column: [0.0] for column in trained.feature_list})
    with pytest.raises(predict.PredictError) as caught:
        predict.check_schema(broken, frame)
    assert caught.value.code == "SCHEMA_MISMATCH"
    assert caught.value.exit_code == 6


def test_insufficient_data_for_unknown_origin(cfg):
    """An as-of beyond the latest complete origin is INSUFFICIENT_DATA (exit 5)."""
    with pytest.raises(predict.PredictError) as caught:
        predict.build_forecast(cfg, "WEEK", as_of="2027-01-04")
    assert caught.value.code == "INSUFFICIENT_DATA"
    assert caught.value.exit_code == 5


@pytest.mark.parametrize("code,expected", [("NO_MODEL", 3), ("STALE_INPUT", 4),
                                           ("INSUFFICIENT_DATA", 5), ("SCHEMA_MISMATCH", 6)])
def test_cli_translates_every_documented_code(cfg, monkeypatch, capsys, code, expected):
    """cmd_predict turns a PredictError into its documented exit code plus JSON on stderr."""
    def raiser(*_args, **_kwargs):
        raise predict.PredictError(code, "synthetic failure", detail="test")

    monkeypatch.setattr("f1_forecast.predict.run_predict", raiser)
    monkeypatch.setattr("f1_forecast.cli.load_config", lambda *_a, **_k: cfg)
    assert cli_main(["predict", "--granularity", "WEEK", "--no-write"]) == expected
    error = json.loads(capsys.readouterr().err)
    assert error["error"]["code"] == code and error["error"]["exitCode"] == expected


def test_as_of_accepts_a_known_origin(cfg):
    """--as-of must name an existing complete origin; the payload reports it as used."""
    payload = predict.build_forecast(cfg, "WEEK", as_of="2026-09-14")
    assert payload["originUsed"] == "2026-09-14"
    assert payload["asOf"] == "2026-09-14"
    assert len(payload["rows"]) == 173
