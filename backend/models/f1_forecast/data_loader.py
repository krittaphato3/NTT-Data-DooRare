"""Readers for every input of the F1 quantile module.

Data semantics that the rest of the pipeline depends on (verified against the mock generator
``db/mock/generate.py``):

* ``usage_daily.qty_used`` = ``min(demand, stock_on_hand)`` -- dispensed usage, i.e. **censored** by
  stock-outs. It is the forecast target (forward sum over the horizon), not true demand.
* ``stock_snapshot.qty_on_hand`` = end-of-day physical on-hand balance, i.e. the output of each
  hospital's own min/max reorder policy. It is an *input* (for the alert comparison), never a target.
* ``stock_snapshot.qty_incoming`` = total quantity on open orders, with no arrival date.
* Units are base dispensing units; all dates are Asia/Bangkok calendar days.

Series identity: the pack keys everything by ``hospital_drug_id``. The joined daily view
(``data/f1_daily.csv``) has no such id and must be mapped through ``(hospital_code, item_code)`` --
``item_code`` is the canonical ``gp_id`` when present, otherwise ``drug_master.internal_code``
(``SUP-0001``...). 16 ``hospital_drug`` rows carry a NULL ``drug_master_id`` and must be resolved
through ``gp_id`` (otherwise ``item_type`` / ``is_cold_chain`` come back wrong).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from f1_forecast import schema
from f1_forecast.config import ForecastConfig

# Catalogue attributes copied onto each listing. The reference builder maps the first five; the two
# high-alert / controlled flags are carried through as well because F1b (borrow) excludes controlled
# drugs and F2 prioritises high-alert items, and both must also resolve for the gp_id fallback rows.
_DRUG_MASTER_DERIVED = (
    "item_type", "internal_code", "is_cold_chain", "is_blood_product", "generic_name",
    "is_high_alert", "is_controlled",
)
_TRUE = {"true", "1", "yes", "y", "t"}
_FALSE = {"false", "0", "no", "n", "f"}


def _to_nullable_bool(series: pd.Series) -> pd.Series:
    """Parse a CSV boolean column into a nullable ``boolean`` Series."""
    text = series.astype("string").str.strip().str.lower()
    return pd.array(
        np.where(text.isin(_TRUE), True, np.where(text.isin(_FALSE), False, pd.NA)),
        dtype="boolean",
    )


def _to_int_string(series: pd.Series) -> pd.Series:
    """Render an integer-like column that may contain NaN as a clean string without '.0'."""
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.astype("Int64").astype("string")


@dataclass(frozen=True)
class RawPack:
    """The raw tables of ``data/DooRare-F1-Monthly-Pack/csv`` as DataFrames."""

    usage_daily: pd.DataFrame
    stock_snapshot: pd.DataFrame
    hospital_drug: pd.DataFrame
    drug_master: pd.DataFrame
    hospital: pd.DataFrame
    context_signal: pd.DataFrame


def _read_csv(cfg: ForecastConfig, logical_name: str, spec: schema.TableSpec, **kwargs) -> pd.DataFrame:
    path: Path = cfg.raw_path(logical_name)
    frame = pd.read_csv(path, **kwargs)
    schema.assert_columns(list(frame.columns), spec)
    return frame


def load_pack(cfg: ForecastConfig) -> RawPack:
    """Load and type-cast the six raw pack CSVs (no filtering, no exclusions)."""
    usage = _read_csv(cfg, "usage_daily", schema.USAGE_DAILY, parse_dates=["usage_date"])
    usage["qty_used"] = pd.to_numeric(usage["qty_used"], errors="coerce")

    snap = _read_csv(cfg, "stock_snapshot", schema.STOCK_SNAPSHOT, parse_dates=["snap_date"])
    for column in ("qty_on_hand", "qty_incoming", "qty_held"):
        snap[column] = pd.to_numeric(snap[column], errors="coerce")

    hospital_drug = _read_csv(cfg, "hospital_drug", schema.HOSPITAL_DRUG)
    hospital_drug["unit_price_thb"] = pd.to_numeric(hospital_drug["unit_price_thb"], errors="coerce")
    for column in ("is_seasonal",):
        hospital_drug[column] = _to_nullable_bool(hospital_drug[column])
    hospital_drug["active"] = _to_nullable_bool(hospital_drug["active"])

    drug_master = _read_csv(cfg, "drug_master", schema.DRUG_MASTER)
    for column in ("is_cold_chain", "is_blood_product", "is_high_alert", "is_controlled"):
        drug_master[column] = _to_nullable_bool(drug_master[column])

    hospital = _read_csv(cfg, "hospital", schema.HOSPITAL)
    for column in ("is_urban", "has_cold_chain", "has_blood_bank", "active"):
        hospital[column] = _to_nullable_bool(hospital[column])

    context = _read_csv(cfg, "context_signal", schema.CONTEXT_SIGNAL,
                        parse_dates=["valid_from", "valid_to", "created_at"])
    schema.assert_allowed_values("context_signal", "signal_type", context["signal_type"].unique())

    return RawPack(
        usage_daily=usage,
        stock_snapshot=snap,
        hospital_drug=hospital_drug,
        drug_master=drug_master,
        hospital=hospital,
        context_signal=context,
    )


def load_daily_joined(cfg: ForecastConfig) -> pd.DataFrame:
    """Load ``data/f1_daily.csv`` (daily usage + stock snapshot joined, keyed by codes)."""
    # covid_phase mixes numeric and textual phases in the mock, so it is read as a string.
    frame = _read_csv(cfg, "daily_joined", schema.DAILY_JOINED, parse_dates=["date"],
                      dtype={"covid_phase": "string", "event_tags": "string"})
    for column in ("qty_used", "qty_on_hand_end_of_day", "qty_incoming", "qty_held"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def load_weekly_features(cfg: ForecastConfig) -> pd.DataFrame:
    """Load the committed weekly matrix with typed dates, categoricals and split labels.

    The file already carries the authoritative ``split`` column (train/valid/test with embargoes),
    so it is loaded as data and never re-split by this module.
    """
    frame = _read_csv(cfg, "weekly_features", schema.WEEKLY_FEATURES, parse_dates=["origin_week"])
    schema.assert_allowed_values("weekly_features", "split", frame["split"].unique())
    for column in schema.WEEKLY_CATEGORICAL_COLUMNS:
        schema.assert_allowed_values("weekly_features", column, frame[column].unique())
        frame[column] = frame[column].astype("category")
    return frame


def enrich_series(pack: RawPack, cfg: ForecastConfig) -> pd.DataFrame:
    """Build the 191-row series table with catalogue attributes, price tier and scope flags.

    Implements the ``gp_id`` fallback from ``data/DooRare-F1-Monthly-Pack/build_features.py``:
    a listing whose ``drug_master_id`` is NULL inherits the catalogue attributes of its ``gp_id``.

    Returns:
        One row per ``hospital_drug_id`` with ``item_code``, ``item_type``, ``is_cold_chain``,
        ``is_blood_product``, ``price_tier``, ``is_min_max`` and ``in_scope``.
    """
    dm = pack.drug_master.rename(columns={"id": "drug_master_id", "gp_id": "dm_gp_id"})
    hd = pack.hospital_drug.rename(columns={"id": "hospital_drug_id"})

    merged = hd.merge(dm[["drug_master_id", *_DRUG_MASTER_DERIVED]], on="drug_master_id", how="left")
    by_gp = (
        dm.dropna(subset=["dm_gp_id"])
        .drop_duplicates("dm_gp_id")
        .set_index("dm_gp_id")[list(_DRUG_MASTER_DERIVED)]
    )
    needs_fallback = merged["drug_master_id"].isna() & merged["gp_id"].notna()
    for column in _DRUG_MASTER_DERIVED:
        merged.loc[needs_fallback, column] = merged.loc[needs_fallback, "gp_id"].map(by_gp[column])

    merged["item_code"] = _to_int_string(merged["gp_id"]).where(
        merged["gp_id"].notna(), merged["internal_code"].astype("string")
    )
    merged["item_code"] = merged["item_code"].fillna("LOCAL-" + merged["local_code"].astype("string"))

    hospitals = pack.hospital[["id", "code", "tier", "has_cold_chain"]].rename(
        columns={"id": "hospital_id", "code": "hospital_code", "tier": "hospital_tier"}
    )
    merged = merged.merge(hospitals, on="hospital_id", how="left")

    low = float(cfg.series_scope["price_low_thb"])
    high = float(cfg.series_scope["price_high_thb"])
    price = merged["unit_price_thb"]
    merged["price_tier"] = np.select([price <= low, price >= high], ["LOW", "HIGH"], default="MID")
    merged["log_unit_price"] = np.log1p(price)
    merged["item_type"] = merged["item_type"].fillna("UNMAPPED")
    merged["is_cold_chain"] = merged["is_cold_chain"].fillna(False).astype(bool)
    merged["is_blood_product"] = merged["is_blood_product"].fillna(False).astype(bool)
    merged["is_seasonal"] = merged["is_seasonal"].fillna(False).astype(bool)

    min_max = (merged["ved"] == "D") & (price <= float(cfg.series_scope["min_max_price_threshold_thb"]))
    merged["is_min_max"] = min_max
    merged["in_scope"] = ~merged["is_blood_product"] & ~min_max if cfg.series_scope["exclude_min_max"] else ~merged["is_blood_product"]

    columns = [
        "hospital_drug_id", "hospital_id", "hospital_code", "hospital_tier", "has_cold_chain",
        "item_code", "local_code", "gp_id", "drug_master_id", "generic_name", "item_type",
        "unit_price_thb", "log_unit_price", "price_tier", "ved", "abc", "active", "is_seasonal",
        "is_cold_chain", "is_blood_product", "is_high_alert", "is_controlled",
        "standard_lead_time_days", "lend_in_packs", "method_override", "min_level", "max_level",
        "is_min_max", "in_scope",
    ]
    return merged[columns].reset_index(drop=True)


def build_series_crosswalk(series: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    """Map the joined daily view onto ``hospital_drug_id`` via ``(hospital_code, item_code)``.

    Args:
        series: output of :func:`enrich_series` (must contain ``in_scope``).
        daily: output of :func:`load_daily_joined`.

    Returns:
        ``daily`` with an added ``hospital_drug_id`` column.

    Raises:
        ValueError: if a ``(hospital_code, item_code)`` pair matches zero or several series.
    """
    lookup = series[["hospital_drug_id", "hospital_code", "item_code"]].copy()
    duplicated = lookup.duplicated(subset=["hospital_code", "item_code"], keep=False)
    if duplicated.any():
        pairs = lookup.loc[duplicated, ["hospital_code", "item_code"]].drop_duplicates()
        raise ValueError(f"(hospital_code, item_code) is not unique for {len(pairs)} pairs, e.g. "
                         f"{pairs.head(3).to_dict('records')}")
    mapped = daily.merge(lookup, on=["hospital_code", "item_code"], how="left", validate="many_to_one")
    unmapped = mapped["hospital_drug_id"].isna()
    if unmapped.any():
        pairs = mapped.loc[unmapped, ["hospital_code", "item_code"]].drop_duplicates()
        raise ValueError(f"{int(unmapped.sum())} daily rows have no series match, e.g. "
                         f"{pairs.head(3).to_dict('records')}")
    return mapped


def series_day_counts(daily: pd.DataFrame) -> pd.DataFrame:
    """Per-series observation span: number of days, first/last date, zero-day share.

    Args:
        daily: frames with ``hospital_drug_id``, ``date`` and ``qty_used``.

    Returns:
        One row per series with ``n_days``, ``first_date``, ``last_date``, ``zero_share``.
    """
    grouped = daily.groupby("hospital_drug_id", observed=True).agg(
        n_days=("date", "size"),
        first_date=("date", "min"),
        last_date=("date", "max"),
        qty_used_sum=("qty_used", "sum"),
        zero_days=("qty_used", lambda values: int((values == 0).sum())),
    )
    grouped["zero_share"] = grouped["zero_days"] / grouped["n_days"]
    return grouped.reset_index()


def load_all(cfg: ForecastConfig) -> tuple[RawPack, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Convenience loader used by the CLI and tests.

    Returns:
        ``(pack, series, daily_joined_with_id, weekly_features)``.
    """
    pack = load_pack(cfg)
    series = enrich_series(pack, cfg)
    daily = build_series_crosswalk(series, load_daily_joined(cfg))
    weekly = load_weekly_features(cfg)
    return pack, series, daily, weekly
