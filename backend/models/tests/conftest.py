"""Shared pytest fixtures.

The data pack is several hundred thousand rows, so every fixture is session-scoped: the raw tables are
read once and reused by all tests, which keeps ``pytest -q`` at a few seconds.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

MODELS_DIR = Path(__file__).resolve().parents[1]
if str(MODELS_DIR) not in sys.path:  # allow `pytest backend/models` from any working directory
    sys.path.insert(0, str(MODELS_DIR))

from f1_forecast import clean, data_loader  # noqa: E402  (import after sys.path bootstrap)
from f1_forecast.config import ForecastConfig, load_config  # noqa: E402


@pytest.fixture(scope="session")
def cfg() -> ForecastConfig:
    """Resolved configuration from backend/models/config/forecast.yaml."""
    return load_config()


@pytest.fixture(scope="session")
def pack(cfg: ForecastConfig) -> data_loader.RawPack:
    """The six raw pack tables."""
    return data_loader.load_pack(cfg)


@pytest.fixture(scope="session")
def series(pack: data_loader.RawPack, cfg: ForecastConfig):
    """Series inventory with resolved catalogue attributes and scope flags (191 rows)."""
    return data_loader.enrich_series(pack, cfg)


@pytest.fixture(scope="session")
def daily(series, cfg: ForecastConfig):
    """Joined daily view with ``hospital_drug_id`` attached (188 series)."""
    return data_loader.build_series_crosswalk(series, data_loader.load_daily_joined(cfg))


@pytest.fixture(scope="session")
def weekly(cfg: ForecastConfig):
    """The committed weekly training matrix (173 series)."""
    return data_loader.load_weekly_features(cfg)


@pytest.fixture(scope="session")
def weekly_totals(pack, series, cfg: ForecastConfig):
    """Weekly usage totals per modelled series (complete Monday weeks), straight from usage_daily."""
    return clean.period_totals(pack.usage_daily, clean.scope_ids(series), "WEEK")
