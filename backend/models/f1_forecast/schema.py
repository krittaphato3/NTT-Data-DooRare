"""Column/key/value contracts for every input file.

The data pack is fixed and synthetic, so the module validates it strictly: loaders assert the expected
columns, key uniqueness and allowed categorical values before any modelling code touches a frame.
A mismatch is a hard error (``SchemaError``) -- never a silent drop or a silent rename.
"""

from __future__ import annotations

from dataclasses import dataclass


class SchemaError(ValueError):
    """Raised when an input file does not match its declared contract."""


@dataclass(frozen=True)
class TableSpec:
    """Declared contract of one CSV file.

    Attributes:
        name: logical table name (matches ``config.paths.raw`` where applicable).
        columns: expected column names, in file order.
        keys: columns that must be unique in combination (empty = no uniqueness requirement).
        description: short human explanation of one row.
    """

    name: str
    columns: tuple[str, ...]
    keys: tuple[str, ...]
    description: str


# --- raw pack tables -----------------------------------------------------------------------------
USAGE_DAILY = TableSpec(
    name="usage_daily",
    columns=("hospital_id", "hospital_drug_id", "usage_date", "qty_used"),
    keys=("hospital_id", "hospital_drug_id", "usage_date"),
    description="dispensed quantity per hospital x local item x day (censored by stock on hand)",
)

STOCK_SNAPSHOT = TableSpec(
    name="stock_snapshot",
    columns=("hospital_id", "hospital_drug_id", "snap_date", "qty_on_hand", "qty_incoming", "qty_held"),
    keys=("hospital_id", "hospital_drug_id", "snap_date"),
    description="end-of-day stock state per hospital x local item (on hand / open orders / held)",
)

HOSPITAL_DRUG = TableSpec(
    name="hospital_drug",
    columns=(
        "id", "hospital_id", "local_code", "local_name", "unit_price_thb", "local_unit", "tmt_id",
        "gp_id", "active", "ved", "abc", "expiry_threshold_days", "drug_master_id", "lend_in_packs",
        "method_override", "is_seasonal", "standard_lead_time_days", "min_level", "max_level",
    ),
    keys=("id",),
    description="one local drug listing per hospital; the modelling series is defined here",
)

DRUG_MASTER = TableSpec(
    name="drug_master",
    columns=(
        "id", "item_type", "gp_id", "internal_code", "generic_name", "strength", "dosage_form",
        "base_unit", "is_cold_chain", "is_blood_product", "is_high_alert", "is_controlled",
        "emergency_class", "created_at",
    ),
    keys=("id",),
    description="central drug/supply catalogue (DRUG / SUPPLY / BLOOD)",
)

HOSPITAL = TableSpec(
    name="hospital",
    columns=(
        "id", "region_id", "network_id", "code", "name_th", "name_en", "lat", "lon", "is_urban",
        "has_cold_chain", "has_blood_bank", "active", "created_at", "updated_at", "version",
        "province", "tier", "bed_count", "address", "phone",
    ),
    keys=("id",),
    description="the five hospitals (HA-HE) with tier and cold-chain capability",
)

CONTEXT_SIGNAL = TableSpec(
    name="context_signal",
    columns=(
        "id", "region_id", "signal_type", "payload", "valid_from", "valid_to", "source",
        "approved_by", "created_at",
    ),
    keys=("id",),
    description="event windows (COVID, flu peak, dengue, PM2.5, fiscal year end, flood, 7 dangerous days)",
)

# --- derived/committed views ---------------------------------------------------------------------
DAILY_JOINED = TableSpec(
    name="f1_daily",
    columns=(
        "date", "hospital_code", "hospital_name", "item_type", "item_code", "drug_name", "qty_used",
        "qty_on_hand_end_of_day", "qty_incoming", "qty_held", "day_of_week", "month", "covid_phase",
        "event_tags",
    ),
    keys=("date", "hospital_code", "item_code"),
    description="daily usage + stock snapshot already joined, keyed by hospital code and item code",
)

WEEKLY_FEATURES = TableSpec(
    name="weekly_features",
    columns=(
        "hospital_drug_id", "hospital_code", "item_code", "origin_week", "y_target", "split",
        "lag_1w", "lag_2w", "lag_3w", "lag_4w", "lag_8w", "lag_13w", "lag_26w", "lag_52w",
        "roll_mean_4w", "roll_std_4w", "roll_mean_13w", "roll_std_13w", "roll_mean_26w", "roll_std_26w",
        "roll_zero_share_13", "weeks_since_last_nonzero", "stockout_days_4w", "item_te_mean",
        "woy_sin", "woy_cos", "month_sin", "month_cos",
        "is_songkran_week", "is_newyear_week", "long_weekend_days",
        "ctx_covid", "ctx_flu_peak", "ctx_dengue_peak", "ctx_pm25", "ctx_fiscal_year_end",
        "ctx_flood", "ctx_seven_dangerous_days",
        "price_tier", "ved", "abc", "item_type", "hospital_tier", "is_cold_chain", "log_unit_price",
        "is_seasonal",
    ),
    keys=("hospital_drug_id", "origin_week"),
    description="weekly training matrix: one row per series x origin week, target = next week's usage",
)

MONTHLY_FEATURES = TableSpec(
    name="monthly_features",
    columns=(
        "hospital_drug_id", "hospital_code", "item_code", "origin_month", "y_target", "split",
        "lag_1m", "lag_2m", "lag_3m", "lag_6m", "lag_12m",
        "roll_mean_3m", "roll_std_3m", "roll_mean_6m", "roll_std_6m", "roll_mean_12m", "roll_std_12m",
        "roll_zero_share_6m", "months_since_last_nonzero", "stockout_days_1m", "item_te_mean",
        "month_sin", "month_cos", "is_songkran_month", "is_newyear_month", "long_weekend_days",
        "ctx_covid", "ctx_flu_peak", "ctx_dengue_peak", "ctx_pm25", "ctx_fiscal_year_end",
        "ctx_flood", "ctx_seven_dangerous_days",
        "price_tier", "ved", "abc", "item_type", "hospital_tier", "is_cold_chain", "log_unit_price",
        "is_seasonal",
    ),
    keys=("hospital_drug_id", "origin_month"),
    description="monthly training matrix: one row per series x origin month, target = next month's usage",
)

# --- weekly matrix column roles ------------------------------------------------------------------
WEEKLY_ID_COLUMNS: tuple[str, ...] = ("hospital_drug_id", "hospital_code", "item_code", "origin_week")
WEEKLY_TARGET_COLUMN = "y_target"
WEEKLY_SPLIT_COLUMN = "split"
WEEKLY_CATEGORICAL_COLUMNS: tuple[str, ...] = (
    "price_tier", "ved", "abc", "item_type", "hospital_tier",
)
WEEKLY_FEATURE_COLUMNS: tuple[str, ...] = tuple(
    column
    for column in WEEKLY_FEATURES.columns
    if column not in WEEKLY_ID_COLUMNS + (WEEKLY_TARGET_COLUMN, WEEKLY_SPLIT_COLUMN)
)

# --- monthly matrix column roles -----------------------------------------------------------------
MONTHLY_ID_COLUMNS: tuple[str, ...] = ("hospital_drug_id", "hospital_code", "item_code", "origin_month")
MONTHLY_TARGET_COLUMN = "y_target"
MONTHLY_SPLIT_COLUMN = "split"
MONTHLY_CATEGORICAL_COLUMNS: tuple[str, ...] = (
    "price_tier", "ved", "abc", "item_type", "hospital_tier",
)
MONTHLY_FEATURE_COLUMNS: tuple[str, ...] = tuple(
    column
    for column in MONTHLY_FEATURES.columns
    if column not in MONTHLY_ID_COLUMNS + (MONTHLY_TARGET_COLUMN, MONTHLY_SPLIT_COLUMN)
)

# --- allowed values ------------------------------------------------------------------------------
ALLOWED_VALUES: dict[str, frozenset[str]] = {
    "price_tier": frozenset({"LOW", "MID", "HIGH"}),
    "ved": frozenset({"V", "E", "D"}),
    "abc": frozenset({"A", "B", "C"}),
    "item_type": frozenset({"DRUG", "SUPPLY", "BLOOD", "UNMAPPED"}),
    "hospital_tier": frozenset({"TERTIARY", "SECONDARY", "COMMUNITY"}),
    "split": frozenset({"train", "valid", "test"}),
    "signal_type": frozenset({
        "COVID_PERIOD", "INFLUENZA_PEAK", "DENGUE_PEAK", "PM25_SEASON",
        "FISCAL_YEAR_END_ORDERING", "FLOOD", "SEVEN_DANGEROUS_DAYS",
    }),
}

MODEL_SPLITS: tuple[str, ...] = ("train", "valid", "test")

# Prediction frames name quantile columns q05, q10, q25, q50, q75, q90, q95 (one digit pair per level).
QUANTILE_COLUMN_PREFIX = "q"


def quantile_column(quantile: float) -> str:
    """Return the canonical column name of a quantile level (``0.05`` -> ``"q05"``)."""
    return f"{QUANTILE_COLUMN_PREFIX}{int(round(quantile * 100)):02d}"


def assert_columns(actual: tuple[str, ...] | list[str], spec: TableSpec) -> None:
    """Raise :class:`SchemaError` unless ``actual`` matches ``spec.columns`` exactly.

    Order matters: the pack CSVs are stable, so a reordered file is a signal that something changed.
    """
    actual_tuple = tuple(actual)
    if actual_tuple == spec.columns:
        return
    missing = [c for c in spec.columns if c not in actual_tuple]
    unexpected = [c for c in actual_tuple if c not in spec.columns]
    detail = []
    if missing:
        detail.append(f"missing={missing}")
    if unexpected:
        detail.append(f"unexpected={unexpected}")
    if not detail:
        detail.append(f"order differs: expected {list(spec.columns)}")
    raise SchemaError(f"{spec.name}: column mismatch ({'; '.join(detail)})")


def assert_allowed_values(series_name: str, column: str, values) -> None:
    """Raise :class:`SchemaError` when a categorical column contains values outside the contract."""
    allowed = ALLOWED_VALUES.get(column)
    if allowed is None:
        return
    seen = {str(v) for v in values if v is not None}
    unexpected = sorted(seen - allowed)
    if unexpected:
        raise SchemaError(f"{series_name}.{column}: unexpected values {unexpected} (allowed {sorted(allowed)})")
