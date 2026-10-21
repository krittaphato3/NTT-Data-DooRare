# `backend/models/` — F1 quantile demand forecasting (DooRare)

CPU-only Python module that forecasts **dispensed drug usage (demand)** per hospital × drug for two
timeframes — **WEEK** (next week) and **MONTH** (next calendar month) — as quantiles
**P05 / P10 / P25 / P50 / P75 / P90 / P95**, so the product can derive Total Target (F-06), daily usage
`u` (F-08), lead-time quantities (ASM-43) and shortage/overstock risk (F-24).

Specs it implements: `data/DooRare-F1-Quantile-Model-Spec4.md` (weekly, = the pack copy),
`data/DooRare-F1-Monthly-Pack/DooRare-F1-Monthly-Spec.md` (monthly),
`specification/04-rules-formulas.md` (F-01…F-08, F-24), `specification/02-features-f1.md` (F1a).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | environment, config, CLI skeleton | done |
| 1 | data loading, validation, series inventory | done |
| 2 | baselines + backtesting + metrics framework (WEEK) | done |
| 3 | feature engineering (weekly + monthly, no-lookahead) | done |
| 4 | weekly quantile models | done |
| 5 | monthly quantile models | done |
| 6 | evaluation report (6a) + conformal calibration (6b) | done — MONTH calibration disabled |
| 7 | inference CLI (7a) + read API `backend/src/modules/forecasts` (7b) | done — see `backend/README.md` |
| 8 | closing: `scripts/run_all.sh`, README, session notes | done |

Every command under *Commands* exists. Only `train` writes a new model; `scripts/run_all.sh` and the
`predict` / `evaluate` paths use the frozen artifacts.

## Install

The virtualenv lives at the repo root (already gitignored, same convention as `db/mock/generate.py`).

```bash
# from the repository root
python3 -m venv .venv
.venv/bin/pip install -r backend/models/requirements.txt

# from this folder (backend/models)
cd backend/models
../../.venv/bin/python -m f1_forecast.cli --help

# full close-out check (never trains): validate -> features -> evaluate(saved, valid)
# -> predict WEEK -> predict MONTH -> pytest
scripts/run_all.sh
```

The venv is expected at `<repo>/.venv`; override the interpreter with `PYTHON=/path/to/python
scripts/run_all.sh`. Every command below assumes `cd backend/models`.

Versions used for Phase 0/1 (macOS arm64, Python 3.13.16): pandas 3.0.6, numpy 2.5.4, lightgbm 4.7.0,
scikit-learn 1.9.1, pyarrow 26.0.0, PyYAML 6.0.3, pytest 9.1.1.

## Configuration

`config/forecast.yaml` is the single source of truth — paths, quantiles, split boundaries, hyper-parameters,
gates and the confirmed data facts. **No path, date or threshold may be hard-coded in the code.**

Confirmed decisions baked into the file:

- target = forward dispensed usage (`y_target`); stock on hand is never a trained target;
- quantiles `[0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]`; only `0.50/0.90/0.95` map to `forecast_result`;
- one global booster per `(granularity, quantile)`; separate model sets per granularity;
- horizon = 1 week / 1 month (code parameterised for more); `log1p` target, metrics on the raw scale;
- weekly split = the committed `split` column; monthly split = train ≤ 2024-06, embargo 2024-07,
  valid 2024-08 → 2025-07, embargo 2025-08, test 2025-09 → 2026-08;
- `ctx_*` flags use the **known-at-origin** rule: the target-period event window, kept only when its
  record was created and approved by the end of the origin period;
- stock-out-censored rows stay in training; every metric reported twice (all rows / no stock-out rows);
- acceptance gate = beat seasonal-naive **and** MA/ES + residual quantile on pinball at P50/P90/P95 with
  coverage within ±0.05, otherwise keep the baseline and record why;
- derived data → `backend/models/data/`, models → `backend/models/artifacts/` (both gitignored);
  `reports/` is committed.

### Config keys

One YAML file (`config/forecast.yaml`), overridable per run with `-c FILE`; the repo root is resolved
from the module location (override with `DOORARE_ROOT`).

| Key | Value here | Controls |
|---|---|---|
| `paths.raw.*` | `data/f1_daily.csv`, `data/f1_weekly_features4.csv`, `data/DooRare-F1-Monthly-Pack/csv/*` | read-only inputs |
| `paths.derived` / `artifacts` / `forecasts` / `reports` | `backend/models/{data,artifacts,artifacts/forecasts,reports}` | where every output goes |
| `target.*` | `y_target`, `log1p`, `raw`, horizon 1 | target column, transform, metric scale |
| `quantiles` / `quantiles_persisted` | 7 levels / `[0.50, 0.90, 0.95]` | trained vs stored quantiles |
| `granularities.WEEK` | lags 1–52, windows 4/13/26, tail split (28 eval periods), grid 3×3, `n_estimators: 5000` | weekly build + training |
| `granularities.MONTH` | lags 1–12, windows 3/6/12, explicit split dates, grid 3×3 | monthly build + training |
| `seed` / `deterministic` | `42` / `true` | reproducibility |
| `model_version_revision` / `model_version_template` | `2` / `f1-{granularity}-{data_end}-{feature_hash}-r{revision}` | artifact naming (see *Model versioning*) |
| `series_scope.*` | exclude blood + Min-Max (VED D, ≤ 50 THB), price tiers 50 / 1000 | which listings are modelled |
| `expectations.*` | 191 listings, 173 series, 77,565 weekly rows, 17,763 monthly rows … | hard numbers `validate` enforces |
| `censoring.*` | keep stock-out rows, report all + no-stock-out | target policy |
| `context_flags.*` | `known_at_origin` (+ two comparison variants) | `ctx_*` features |
| `calendar.*` | 15 fixed Thai holidays, Songkran, New Year | holiday features |
| `baselines.*` | MA(26)/ES, seasonal naive, empirical; z table | comparison methods |
| `backtest.*` | monthly blocks, `valid`+`test`, save predictions | walk-forward harness |
| `ved.z` / `ved.quantile` | V 1.65 / E 1.28 / D 0.0; V 0.95 / E 0.90 | `rop`, Total Target |
| `totals.rosterp_min_floor_units` | `null` | no V-item floor applied |
| `evaluation.*` | ±0.05 coverage, LOW_N 26, overstock 2×, 3-baseline gate | metrics + gate |
| `calibration.*` | split conformal on `log1p`, valid-only decision, width ≤ +10 %; WEEK on, MONTH off | post-processing |
| `inference.*` | pinned `model_versions`, `stale_after_days: 30`, `min_history_periods: 26`, `write_csv: false` | `predict` / stdout |
| `stockout.*` | 4-period window, on-hand ≤ 0 | stock-out features |

## Commands

```bash
cd backend/models

# Phase 8 close-out: validate -> features -> evaluate (saved artifact, valid split) ->
# predict WEEK -> predict MONTH -> pytest. Never trains and aborts on the first failing step.
scripts/run_all.sh

# resolved configuration: paths, quantiles, splits; exits 1 if an input file is missing
../../.venv/bin/python -m f1_forecast.cli config

# Phase 1 gate: data-quality suite -> reports/data_quality.json + reports/data_quality_summary.md
../../.venv/bin/python -m f1_forecast.cli validate

# Phase 3 gate: rebuild weekly + build monthly, verify against the committed matrix
# -> data/{weekly,monthly}_features.parquet (gitignored), reports/feature_build.{json,md}
../../.venv/bin/python -m f1_forecast.cli features

# Phase 2/3 gate: baseline walk-forward backtest for one or both granularities
# -> reports/baseline_metrics{,_month}.json, *_by_series.csv, baseline_summary.md
../../.venv/bin/python -m f1_forecast.cli backtest --granularity WEEK|MONTH|BOTH

# Phase 4 / 5: select on valid, fit, write artifacts/ + the training report
../../.venv/bin/python -m f1_forecast.cli train --granularity WEEK|MONTH

# score a frozen model on one split (also writes data/model_predictions_<gran>_<split>.parquet)
../../.venv/bin/python -m f1_forecast.cli evaluate --granularity WEEK|MONTH --split test --evaluation-number N

# Phase 6a: slices/concentration/TT/crossing/importance -> reports/evaluation.{md,json} + 2 CSVs
../../.venv/bin/python -m f1_forecast.cli report --granularity WEEK|MONTH|BOTH

# Phase 6b: series diagnostics + conformal calibration (valid only) -> reports/{diagnostics,calibration}.*
../../.venv/bin/python -m f1_forecast.cli diagnose --granularity WEEK|MONTH|BOTH
../../.venv/bin/python -m f1_forecast.cli calibrate --granularity WEEK|MONTH|BOTH

# Phase 7a: score the frozen model at one origin -> artifacts/forecasts/<model_version>/forecast_*.json
../../.venv/bin/python -m f1_forecast.cli predict --granularity WEEK|MONTH [--as-of YYYY-MM-DD]

# Phase 7a gate: reproduce the saved valid predictions through the predict path -> reports/parity.json
../../.venv/bin/python -m f1_forecast.cli parity --granularity WEEK|MONTH|BOTH

# test suite
../../.venv/bin/pytest -q
```

## Phase 2 — baselines, backtesting, metrics

Three baselines (`f1_forecast/baselines.py`), all strictly causal and granularity-agnostic:

| Baseline | P50 | Bands |
|---|---|---|
| `ma_es_residual_quantile` | F-03: MA(26) or ES(alpha in 0.1..0.5, chosen by expanding MAE) x seasonal index | F-04: 1-step-ahead residual quantiles, `z * std(e)` fallback when fewer than 26 residuals |
| `seasonal_naive` | usage of the same period one season ago (lag 52 weekly / lag 12 monthly) | its own 1-step residual quantiles |
| `empirical_quantile` | trailing-window quantiles (52 weeks / 12 months) | same |

Harness (`f1_forecast/backtest.py`): one block per calendar month inside each evaluated split; a training
row is admissible only when its **target window closes before the block starts** (weekly `origin + 13 days <
block start`). Metrics (`f1_forecast/metrics.py`, F-24) are computed twice — over all rows and over rows whose
target window had no stock-out day — plus per-series tables with `LOW_N` (< 26 periods) and the coverage gate.

Headline result on the mock pack (WEEK, raw scale; MOCK DATA, not real accuracy):

| split | baseline | rows | pinball P50 | pinball P90 | pinball P95 | cov P90 | cov P95 | MAE P50 | WAPE P50 |
|---|---|---|---|---|---|---|---|---|---|
| test | seasonal_naive | 4,648 | **31.53** | 29.48 | 25.31 | 0.932 | 0.968 | **63.05** | **0.092** |
| test | ma_es_residual_quantile | 4,670 | 40.63 | 18.45 | 11.95 | **0.911** | **0.955** | 81.25 | 0.119 |
| test | empirical_quantile | 4,670 | 33.62 | **13.58** | **7.68** | 0.879 | 0.930 | 67.24 | 0.099 |

(valid is similar; both splits and both row filters are in the reports.)

What the numbers mean for Phase 4/5:

* **No baseline dominates** — seasonal naive has the best P50 (MAE/WAPE) and the best P50 pinball, MA/ES the
  best pooled coverage, the empirical quantile the best tail pinball. The gate therefore has to be met per
  quantile, not on an average.
* **Pooled coverage passes, per-series coverage does not**: MA/ES lands at 0.911 pooled at P90 but only 61 %
  (test) / 75 % (valid) of series are inside +/-0.05, with a median of 0.93. Per-series calibration is the
  real bar — and the reason Phase 6 implements conformal calibration.
* **Row coverage differs by baseline**: the 7 cold-start series (43 test rows) never receive a seasonal-naive
  forecast (no 52-week lag exists) and the first 3 origins of each also fall outside the MA/ES/empirical
  fallback. Compare models and baselines on the common row set and report this table beside the metrics.
* `crossing_rate_raw` is 0 for every baseline: P05..P95 are built monotonically, so any crossing in Phase 4
  output is a genuine model artefact rather than an inherited one.

One bug worth remembering: F-04 residuals must be **1-step-ahead** (`y_k - P50_{k-1}`). Using the same-period
level (`y_k - P50_k`) looked plausible but produced P90 coverage of 0.80 instead of 0.91, because the level
already contains part of `y_k`. The causality test in `tests/test_baselines.py` guards the alignment.

## Phase 3 — feature matrices

`f1_forecast/features.py` builds both matrices from the raw pack (never from `f1_daily`) and verifies the
weekly one against the committed CSV:

* **Weekly rebuild is exact.** 77,565 rows, same row keys and split labels as
  `data/f1_weekly_features4.csv`, 44/44 compared columns identical, 0 value mismatches (float tolerance
  1e-9 for summation order). This is what makes the reconstructed pipeline trustworthy for Phase 4.
* **Monthly matrix.** 17,763 rows, `origin_month` 2017-10 → 2026-08, 173 series in scope of which 167
  carry rows; train ≤ 2024-06 (13,446), valid 2024-08 → 2025-07 (1,992), test 2025-09 → 2026-08 (1,993),
  embargo months 2024-07 and 2025-08 (332 rows, labelled `embargo` and never trained or scored on).
  The six series without rows have a single complete month (2026-09), so the drop-the-last-month rule
  leaves no target.
* **`ctx_*` flags.** Canonical rule = target-period event window, kept only when the record existed
  (`created_at`) and was approved by the end of the origin period. Against the committed target-week
  flags this removes 0.6 % (COVID, flood) to 4.5 % (`seven_dangerous_days`) of rows, and the difference is
  one-directional: every changed row was `1` in the committed file and `0` causally — i.e. only leaks were
  removed. The alternative "event active at the origin" reading (reported too) differs by 0.2–8.4 %
  because it is a different feature, not a leak fix. A literal `valid_from <= origin` test with no
  `valid_to` bound was rejected: it made the flags 1 on 74–93 % of rows, i.e. constant.
* **Monthly context caveat.** With the causal rule, `ctx_flu_peak` and `ctx_dengue_peak` are 0 on every
  monthly row: those windows start on the first day of the month they describe, so they are never known at
  the previous month's end. Monthly event flags carry less signal than the weekly ones by construction.

Monthly baselines (MOCK DATA; same three methods, 24 monthly blocks):

| split | baseline | pinball P50 | pinball P90 | pinball P95 | cov P90 | cov P95 | MAE P50 | WAPE P50 |
|---|---|---|---|---|---|---|---|---|
| test | seasonal_naive | **98.2** | 120.4 | 102.2 | 0.944 | 0.971 | **196.5** | **0.067** |
| test | ma_es_residual_quantile | 161.9 | 65.1 | 38.2 | **0.907** | **0.961** | 323.8 | 0.111 |
| test | empirical_quantile | 118.8 | **49.0** | **28.9** | 0.840 | 0.888 | 237.7 | 0.081 |

Monthly valid/test hold 12 periods per series, so **every** monthly series is `LOW_N` and the per-series
coverage gate cannot judge anything: monthly decisions use the pooled tables only (spec caveat, restated in
`reports/baseline_summary.md`).

## Phase 4 — weekly quantile model

`f1_forecast/model.py` implements the spec's training recipe: `log1p` target, one LightGBM `quantile` model
per level (all seven: 0.05 / 0.10 / 0.25 / 0.50 / 0.75 / 0.90 / 0.95; only P50/P90/P95 are persisted
downstream), the config grid selected **on valid only**, early stopping on valid, and the
`last_24_months` vs `all_history` window compared on valid. Features are the Phase 3 rebuild with the
canonical `known_at_origin` flags; the committed CSV is only the split reference. Constant features are
excluded and listed in the reports (none for weekly; the monthly flu/dengue flags are the Phase 5 case).

The test split is not read by `train`. It was scored **twice**: Phase 4 (three quantiles, sort-only) and
Phase 4b (seven quantiles, isotonic) — the second evaluation is the one quoted below. A third look was a
re-score of the **byte-identical** artifact (hashes checked) to emit row-level diagnostics; nothing was
retrained or tuned after any test run.

| split | filter | rows | pinball P50 | pinball P90 | pinball P95 | cov P90 | cov P95 | MAE P50 | WAPE | width P95−P05 | raw cross | fixed cross |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| valid | all rows | 4,648 | 22.11 | 10.51 | 6.60 | 0.8886 | 0.9445 | 44.21 | 0.066 | 187.66 | 0.157 | 0.000 |
| valid | no stock-out | 4,604 | 22.24 | 10.57 | 6.64 | 0.8886 | 0.9444 | 44.48 | 0.066 | 188.62 | 0.157 | 0.000 |
| test | all rows | 4,691 | 24.13 | 11.74 | 7.32 | 0.8825 | 0.9418 | 48.27 | 0.071 | 203.84 | 0.171 | 0.000 |
| test | no stock-out | 4,600 | 23.85 | 11.75 | 7.34 | 0.8824 | 0.9417 | 47.71 | 0.070 | 205.66 | 0.169 | 0.000 |

Gate against **all three** baselines, scored on the common row set (4,648 rows on both splits = every row
scored by the model **and** all three baselines; on test the 43 excluded rows are the 7 cold-start series):

| split | filter | rows | model P50/P90/P95 | seasonal naive | MA/ES | empirical | beats all 3 | cov 0.90 / 0.95 |
|---|---|---|---|---|---|---|---|
| valid | all rows | 4,648 | 22.11 / 10.51 / 6.60 | 40.76 / 33.62 / 27.89 | 37.36 / 15.85 / 10.29 | 28.00 / 13.74 / 8.10 | **yes** | 0.889 / 0.945 |
| valid | no stock-out | 4,604 | 22.24 / 10.57 / 6.64 | 40.98 / 33.71 / 27.93 | 37.59 / 15.92 / 10.33 | 28.18 / 13.83 / 8.15 | **yes** | 0.889 / 0.944 |
| test | all rows | 4,648 | 24.20 / 11.67 / 7.23 | 31.53 / 29.48 / 25.31 | 40.78 / 18.51 / 12.00 | 33.74 / 13.63 / 7.71 | **yes** | 0.884 / 0.943 |
| test | no stock-out | 4,557 | 23.92 / 11.68 / 7.25 | 31.23 / 29.71 / 25.57 | 40.74 / 18.60 / 12.07 | 33.68 / 13.65 / 7.72 | **yes** | 0.884 / 0.943 |

The model also wins at the four non-gate quantiles on both splits; the tightest margin is P95 on test
(7.23 vs empirical 7.71, +6 %).

* Selected variant: `all_history` (valid sum 92.56 vs 102.22). Selected params differ per quantile; six of
the seven choose `num_leaves = 15` and four `min_child_samples = 20`, the lowest values in the grid — the
selection is sitting on the grid edge, so a wider grid could change the answer. Not extended here.
* Early stopping now ends training on its own: the `n_estimators` cap was raised 2,000 → 5,000; best
  iterations are 1,090 / 2,484 / 3,976 / 1,959 / 2,952 / 1,350 / 1,302 (max 3,976, i.e. below the cap).
  `meta.json` records `best_iteration` per model but not the cap itself (config only) — a known metadata gap.
* **Post-processing = isotonic** (row-wise PAVA), chosen over sort-only on valid by a pre-registered rule:
  coverage score 0.0169 vs 0.0174, width ratio 0.9901, both inside tolerance. The gain is marginal (P90
  coverage +0.05 pp) and P90 pinball is 0.04 worse (10.511 vs 10.467), so treat this as a near-tie.
* **Raw crossing 15.7 % valid / 17.1 % test** before the fix, **0** after it (per filter, per split).
  Crossings concentrate in zero-heavy series (`roll_zero_share_13 > 0.5`, 5.2 % / 5.6 % of rows): 84.6 % /
  88.3 % of those rows cross at least once, but the median violation is 0.0–0.4 units. The substantive ones
  are upper-tail (`q90 > q95`, 4.7 % / 4.3 % of rows, median 7.3 / 14.8 units ≈ 1–2 % of P50) and
  `q75 > q90` (1.3 % / 1.9 %); sorted bands keep the metrics valid, but the seven models are not
  jointly coherent and Phase 6 should replace the fix with a proper joint (CQR) construction.
* **Per-series coverage** (all rows, judged = `N >= 26` and not all-zero; test has 7 LOW_N cold-start
  series excluded from the rate):

| split | model cov90 / cov95 | seasonal naive | MA/ES | empirical |
|---|---|---|---|---|
| valid (165 judged) | 0.703 / 0.612 | 0.376 / 0.333 | **0.746 / 0.636** | 0.612 / 0.570 |
| test (165 judged) | **0.667 / 0.673** | 0.449 / 0.424 | 0.612 / 0.533 | 0.576 / 0.545 |

  So the model is best on test but MA/ES still wins the per-series P90 rate on valid: pooled coverage is
  fine, series-level calibration is not, and Phase 6 owns it.
* **Cold-start series are weak**: 7 series / 43 test rows, coverage P90 0.698, P95 0.791, P50 0.140, WAPE
  0.32, raw crossing 32.6 % — these rows never appear in train and are the sole reason the model's full
  test row set (4,691) differs from the baselines'. At inference they must fall back (COLD_START / MA_ES).

## Phase 5 — monthly quantile model

Same recipe as Phase 4, at monthly granularity (`data/DooRare-F1-Monthly-Pack/DooRare-F1-Monthly-Spec.md`):
`log1p` target, all seven quantiles, grid + post-processing chosen on valid, early stopping on valid,
`all_history` only (a 24-month window leaves too little data). Artifact
`artifacts/f1-MONTH-2026-08-01-8f70f4a87d1e-r2/`; the version carries the new `-r2` revision so it cannot be
confused with the frozen WEEK artifact (`…-f455e37770dc`, revision 1).

* **Rows**: 13,446 train / 1,992 valid / 1,993 test, 166 / 166 / 167 series. Splits are
  train ≤ 2024-06, embargo 2024-07, valid 2024-08 → 2025-07, embargo 2025-08, test 2025-09 → 2026-08.
* **Features**: 33 used; `ctx_flu_peak` and `ctx_dengue_peak` are constant by construction under the
  known-at-origin rule and are dropped (listed in the report, not silently kept).
* **Cap recorded**: `n_estimators = 5,000` with 100-round early stopping; best iterations 1,530 / 1,370 /
  1,345 / 329 / 443 / 536 / 518, so the cap is not binding and `meta.json` now carries
  `n_estimators_cap` (the Phase 4 gap is closed for new artifacts).
* **Post-processing: sort** (isotonic rejected on valid: coverage score 0.0093 vs 0.0033, width ratio
  0.9828). Isotonic was slightly better at P90 coverage (0.9021 vs 0.9001) but worse overall.
* **Grid edge**: every quantile picks `learning_rate = 0.03` (minimum) and `min_child_samples = 10`
  (minimum); `num_leaves` spans 7 / 15 / 31 with 31 (maximum) for four quantiles. Not extended here.
* **6 of the 173 modelled series have no usable monthly rows** and therefore no model; inference must use
  a fallback (`COLD_START` / `MA_ES`) for them. One additional test row (a series with 2 history periods)
  has no baseline forecast, hence the common row set is 1,992 of 1,993 rows.

Monthly evaluation is **pooled only**: valid and test hold 12 periods per series, i.e. every series is
`LOW_N`, so per-series pass/fail is not defined (reported as information only).

Model metrics (full split):

| split | filter | rows | pinball P50 | pinball P90 | pinball P95 | cov 0.90 | cov 0.95 | WAPE P50 | width P95−P05 | raw cross | fixed cross |
|---|---|---|---|---|---|---|---|---|---|---|---|
| valid | all rows | 1,992 | 95.59 | 43.80 | 29.48 | 0.9001 | 0.9468 | 0.0633 | 921.53 | 0.362 | 0.000 |
| valid | no stock-out | 1,875 | 96.33 | 44.49 | 29.67 | 0.9040 | 0.9499 | 0.0633 | 916.26 | 0.363 | 0.000 |
| test | all rows | 1,993 | 84.09 | 37.53 | 21.81 | 0.8776 | 0.9453 | 0.0575 | 748.28 | 0.365 | 0.000 |
| test | no stock-out | 1,899 | 85.69 | 38.30 | 22.19 | 0.8805 | 0.9458 | 0.0571 | 769.33 | 0.365 | 0.000 |

Gate vs **all three** baselines on the common row set (test = **monthly test evaluation #1**):

| split | filter | rows | method | pinball P50 / P90 / P95 | cov 0.90 / 0.95 | WAPE P50 | width |
|---|---|---|---|---|---|---|---|
| valid | all rows | 1,992 | **LightGBM** | **95.59 / 43.80 / 29.48** | 0.9001 / 0.9468 | 0.0633 | 921.5 |
| | | | seasonal_naive | 130.00 / 128.84 / 109.12 | 0.9483 / 0.9704 | 0.0861 | 2,990.8 |
| | | | ma_es_residual_quantile | 195.95 / 73.21 / 44.10 | 0.9096 / 0.9563 | 0.1298 | 1,540.1 |
| | | | empirical_quantile | 119.65 / 75.29 / 42.34 | 0.8805 / 0.9197 | 0.0793 | 1,127.3 |
| test | all rows | 1,992 | **LightGBM** | **84.08 / 37.48 / 21.77** | 0.8780 / 0.9458 | 0.0574 | 748.6 |
| | | | seasonal_naive | 98.23 / 120.44 / 102.15 | 0.9438 / 0.9709 | 0.0671 | 2,802.8 |
| | | | ma_es_residual_quantile | 161.92 / 65.09 / 38.22 | 0.9071 / 0.9608 | 0.1106 | 1,478.7 |
| | | | empirical_quantile | 118.84 / 48.99 / 28.86 | 0.8399 / 0.8876 | 0.0812 | 710.1 |
| test | no stock-out | 1,898 | **LightGBM** | **85.69 / 38.25 / 22.15** | 0.8809 / 0.9463 | 0.0570 | 769.7 |
| | | | seasonal_naive | 100.50 / 122.54 / 103.69 | 0.9442 / 0.9715 | 0.0669 | 2,858.6 |
| | | | ma_es_residual_quantile | 165.80 / 66.42 / 39.10 | 0.9099 / 0.9626 | 0.1103 | 1,518.2 |
| | | | empirical_quantile | 121.66 / 50.29 / 29.70 | 0.8435 / 0.8872 | 0.0810 | 729.2 |

(The valid no-stock-out gate passes too: 96.33 / 44.49 / 29.67 vs 128.49 / 127.55 / 107.94, 197.14 / 74.87 /
44.79 and 119.82 / 76.91 / 43.17.) Seasonal naive is the strongest P50 baseline on test (98.23), and the
model still beats it by 14.15.

Raw quantile crossings are **much larger than weekly** (36.2 % valid / 36.5 % test before the fix, 0 after);
61 % of crossing rows are substantive (worst violation above `max(1 unit, 1 % of P50)`):

| pair | valid share | valid median / p95 gap | valid zero-heavy / other | test share | test median / p95 gap | test zero-heavy / other |
|---|---|---|---|---|---|---|
| q05>q10 | 11.4 % | 2.63 / 482.1 | 25.0 % / 11.1 % | 10.8 % | 2.03 / 362.5 | 45.8 % / 10.0 % |
| q10>q25 | 6.1 % | 8.58 / 338.3 | 41.7 % / 5.2 % | 5.8 % | 4.18 / 412.6 | 29.2 % / 5.2 % |
| q25>q50 | 3.8 % | 7.00 / 216.7 | 18.8 % / 3.5 % | 4.0 % | 8.53 / 275.8 | 27.1 % / 3.4 % |
| q50>q75 | 5.5 % | 14.70 / 192.8 | 0.0 % / 5.7 % | 6.5 % | 20.82 / 108.2 | 0.0 % / 6.6 % |
| q75>q90 | 6.4 % | 27.61 / 516.2 | 0.0 % / 6.6 % | 6.3 % | 23.05 / 696.2 | 0.0 % / 6.5 % |
| q90>q95 | 12.1 % | 18.73 / 801.6 | 4.2 % / 12.3 % | 11.3 % | 25.48 / 765.4 | 2.1 % / 11.5 % |
| **any pair** | **36.2 %** | — | 66.7 % / 35.4 % | **36.5 %** | — | 81.3 % / 35.4 % |

Zero-heavy is `roll_zero_share_6m > 0.5` (48 rows, 2.4 % of each split). Sorting the bands keeps the
metrics valid but hides this incoherence; the monthly models are worse than weekly here and Phase 6 (joint
CQR) should be scoped for both granularities.

Accepted limitation: monthly coverage at P90 drifts below nominal on test (0.8780 vs 0.9001 valid) while
staying inside the ±0.05 tolerance; the empirical baseline fails the same check (0.8399).

## Phase 6a — evaluation report and diagnostics

`f1_forecast/evaluation.py` + `cli report` read **saved** row-level predictions
(`data/model_predictions_<gran>_<split>.parquet`) and the saved baseline predictions; nothing is retrained
or re-scored, and no existing report is rewritten. Output: `reports/evaluation.md`, `evaluation.json`,
`evaluation_slices.csv`, `evaluation_series.csv`.

* **Verification block first.** Before any diagnostic, each split's all-rows pooled metrics are recomputed
  from the saved predictions and compared with the frozen report (`model_test.json`, `model_valid_month.json`,
  …). All four splits reproduce to 0.0000 max abs difference; WEEK test is the re-scored frozen artifact
  (24.1348 / 11.7363 / 7.3171) and MONTH test is the saved predictions (no re-score).

* **Common row set everywhere.** WEEK 4,648 rows; MONTH 1,992 valid and 1,992 of 1,993 test (one cold-start
  row has no baseline). Slices use all rows; Δ = model − lowest-P50 baseline in the same slice; a slice with
  < 100 rows is marked low confidence.
* **WEEK gate passes both splits**; MONTH too. But the model is **not uniformly better** at slice level:
  - WEEK loses in VED `D` (280 rows; valid Δ +0.04/+0.05/+0.06 at P50/P90/P95), `HIGH` price tier
    (196 rows, all three on test), `TERTIARY` hospitals at P95 only (+0.44 on test) and zero-heavy rows at
    P95 (valid) / all three (test, margins < 0.01).
  - MONTH loses in `HIGH` price tier (84 rows, low confidence; +0.04/+0.03/+0.02 on test), zero-heavy rows
    (48 rows, low confidence) and on **P50 for `SUPPLY` item type** (+0.37 test) while its tails are far
    better than every baseline (−16.4 / −21.7 at P90/P95).
* **Test labels follow provenance.** WEEK test is labelled "re-score of frozen model, no changes", MONTH test
  "saved row-level predictions, no re-score"; only the weekly split was rebuilt in Phase 6a.
* **Scale dominance.** The top-10 series carry **62.8 % / 63.2 %** of WEEK pinball and **75.0 % / 67.4 %** of
  MONTH pinball (valid/test) — the pooled numbers are driven by a handful of high-volume series.
* **Total Target impact** (V→P95, E→P90, D excluded, floored at P50; overstock at 2×TT). The narrower model
  bands are operationally more conservative than their pinball suggests: on test the model's TT stock-out
  rate is **8.84 % (WEEK) / 8.97 % (MONTH)** vs seasonal naive 4.97 % / 4.43 %, and overstock is higher than
  every baseline (74.3 % vs 64.5–74.0 % weekly; 15.0 % vs 12.8–14.5 % monthly). Under-TT THB is lower than
  seasonal naive weekly (232k vs 273k) but higher monthly (239k vs 117k); over-TT holding value is the worst
  of the four monthly methods (24.5k vs 16.6–24.2k).
* **Crossings concentrate in high-volume series**, not only zero-heavy ones: MONTH any-pair rate by volume
  tercile is 20.1 % / 28.5 % / **61.2 %** (low/mid/high, test); WEEK 18.8 % / 7.5 % / **24.7 %**.
* **Feature importance (gain)** looks sane weekly (top feature 26.7 % at P50, 28.1 % at P95) and is
  suspiciously concentrated monthly: `lag_1m` takes **57.6 %** of P50 gain and **42.5 %** of P95 gain. It is
  not leakage (lag ≤ origin) but it dominates the monthly model and is the first thing Phase 6b should test.
* Gain importance is not causality, the pack is synthetic, monthly per-series calibration is unjudgeable
  (all series LOW_N) and valid was used for selection, so its coverage is optimistic.

## Phase 6b — series diagnostics and conformal calibration

`f1_forecast/diagnostics.py` (+ `cli diagnose`, `cli calibrate`) writes `reports/diagnostics.{md,json}` and
`reports/calibration.{md,json}` with `diagnostics_series.csv`, `calibration_check.csv`,
`calibration_test.csv`. Part A reads the frozen row-level predictions only; Part B fits offsets on valid
and scores test at most once. Params: `f1_forecast/calibration.py`, stored under
`artifacts/calibration/<model_version>/calibration.json` — never inside the frozen artifact folders.

### Part A — frozen predictions, no changes (common row set)

* **The aggregate win is not a per-series win.** WEEK test: the model beats the best baseline on only
  **50.6 % / 44.0 % / 36.8 %** of series at P50/P90/P95 (valid 48.2/46.4/39.2); MONTH test
  **40.4 / 47.0 / 44.6 %** (valid 42.8/46.4/38.6). Median per-series ratio model/best is 0.998 (WEEK P50)
  but 1.05 at P95, i.e. it wins on large series and loses the tail on many small ones.
* **Scale-free check** (per-series pinball / series mean y, median across series, test): model 0.368 vs
  empirical 0.405, MA/ES 0.539, seasonal 0.590 weekly; 0.220 vs 0.251 / 0.336 / 0.395 monthly. The median
  series is genuinely better, not only the biggest ones.
* **Total-Target stock-out vs nominal.** Nominal (V 5 %, E 10 %) is **0.0744** on both granularities. Test:
  model **0.0884 / 0.0897** (WEEK/MONTH) vs seasonal 0.0497/0.0443, MA/ES 0.0673/0.0716, empirical
  0.0968/0.1325 — the model over-shoots nominal, seasonal under-shoots it.
* **Coverage by train-volume tercile** (test): the model degrades with volume — WEEK 0.894/0.950 (low),
  0.881/0.937 (mid), 0.878/0.942 (high) at P90/P95; MONTH 0.899/0.952, 0.880/0.952, **0.855/0.933 (high)**.
  Baselines are flat or slightly better in the high bucket, which is where the value sits.

### Part B — conformal decision (valid only, pre-registered rule)

Scores `s = log1p(y) - log1p(q_tau)` on the final bands; offset = quantile at `ceil((n+1)tau)/n`; apply on
log1p, clip at 0, re-sort. Valid is split by time: WEEK 14 periods calibrate / 1 gap / 13 check; MONTH
6 / 1 / 5. Rule: coverage error must fall, width ratio <= 1.10, pinball P50 <= +1 %, P90/P95 <= +3 %;
global preferred unless tercile cuts coverage error by >= 20 %.

| granularity | variant | coverage error (check) | width ratio | pinball ratio .5/.9/.95 | verdict |
|---|---|---|---|---|---|
| WEEK | global | 0.0145 → **0.0024** | 1.093 | 1.000/1.012/1.007 | **enabled** |
| WEEK | tercile | 0.0145 → 0.0032 | 1.136 | 1.005/1.022/1.022 | rejected (width) |
| MONTH | global | 0.0139 → 0.0151 | 1.073 | 0.990/1.009/0.999 | **disabled** |

MONTH tercile is infeasible (336/330/330 rows per bucket < 500). MONTH therefore ships uncalibrated —
`calibration.MONTH.enabled = false`.

**WEEK calibrated test evaluation (new, one look):** coverage 0.884/0.943 → **0.897/0.952**, width
204.9 → 220.6 (+7.7 %), pinball 24.20/11.67/7.23 → 24.21/11.63/7.20, TT stock-out 0.0884 → **0.0760**
(nominal 0.0744), under-TT THB 232.5k → 210.2k, overstock 0.743 → 0.739, post-sort crossings 0.000, and
the gate still passes all three baselines on the common row set (both filters). Valid was also used for
early stopping, so valid residuals are optimistic and the shift likely under-corrects.

## Phase 7a — inference (`predict`) and the JSON contract

`f1_forecast/predict.py`, CLI `predict --granularity WEEK|MONTH [--as-of YYYY-MM-DD]`. Pipeline: load the
frozen artifact whose version is pinned in `inference.model_versions` → rebuild the latest feature rows with
the **training** builder (`build_weekly` / `build_monthly`, `require_target=False`, no splits assigned) →
score → calibrate exactly as configured (`calibration.WEEK` global on, `calibration.MONTH` off) → clip ≥ 0 and
sort the seven bands per row, round to 3 decimals (the DB is `numeric(14,3)`) → post-process TT / rop /
lead time / projected on-hand from those stored values. No retraining, no test evaluation, no feature logic
of its own.

```text
artifacts/forecasts/<model_version>/forecast_<GRANULARITY>_<originUsed>.json   (+ .csv when write_csv)
reports/parity.json
```

| granularity | model rows | fallback rows | total | notes |
|---|---|---|---|---|
| WEEK | 173 `QUANTILE_LGBM` | 0 | 173 | 7 series flagged `COLD_START` + `LOW_CONFIDENCE` (< 26 periods) |
| MONTH | 167 `QUANTILE_LGBM` | 6 `MA_ES` (`FALLBACK_CLASSICAL`) | 173 | the 6 have a single complete month; every series emitted, never a silent 0 |

**Origin default.** `--as-of` omitted → the latest complete origin in the matrix (WEEK: Monday of the last
fully observed week; MONTH: the last complete calendar month). The run reports `originUsed` and `dataEnd`;
`periodStart` is the *target* period (`origin + 1` week / month), and the frozen pack's `dataEnd` can fall
inside it (WEEK 2026-09-30 → origin 2026-09-21 → period 2026-09-28).

**Stale-input threshold.** `inference.stale_after_days: 30`. The pack ends 2026-09-30, so a 7-day default would
make every run stale; FR-F1a-013's 7 days is an alert-suppression rule, not an input gate. Configure, do not
hardcode.

**Exit codes** (structured JSON on stderr, `{"error": {code, message, exitCode, details}}`):

| code | exit | meaning |
|---|---|---|
| `OK` | 0 | forecast written |
| `NO_MODEL` | 3 | pinned artifact directory / `meta.json` / `.txt` missing, or calibration file missing while enabled |
| `STALE_INPUT` | 4 | `dataEnd` older than `stale_after_days` |
| `INSUFFICIENT_DATA` | 5 | no usable origin, `--as-of` not a complete origin or in the future, matrix missing modelled series |
| `SCHEMA_MISMATCH` | 6 | inference frame missing features/categoricals the frozen model expects |
| (argparse) | 2 | bad `--granularity` value |

**Top level**: `modelVersion, granularity, asOf, originUsed, dataEnd, calibration {enabled, variant, rows},
counts {rows, series, byMethod, byConfidenceFlag, fallbackRows}, definitions {...}, notes [caveat, ...], rows []`.

**Row**: `hospitalId, hospitalCode, hospitalDrugId, itemCode, periodStart, originPeriod, method (`QUANTILE_LGBM` /
`MA_ES` / `COLD_START`), demandPattern (`REGULAR` / `INTERMITTENT` / `NO_USAGE`), ved, abc, p05, p10, p25, p50,
p75, p90, p95, totalTarget, rop, uPerDay, sigmaPerDay, leadTimeDays, leadTimeQuantile,
leadTimeQuantileApprox, stockOnHand, incoming, projectedOnHand_p50, projectedOnHand_p90,
projectedOnHand_p95, confidenceFlag, confidenceFlags [], flags [], coverageOk, historyPeriods, activeDayRatio,
cv`.

**Definitions as implemented** (formula ids are also in the `predict.py` module docstring):

* **Total Target (F-06)** `TT = p95` for VED `V`, `p90` for `E`, `null` for `D`; `TT = max(TT, p50)`; rounded
  **up** to a whole base unit (`ceil`). `totals.rosterp_min_floor_units` is `null`, so no floor.
* **uPerDay (F-08)** `p50 / 7` (WEEK) or `p50 / 30` (MONTH). **sigmaPerDay (F-08)** sample std of daily usage
  over the trailing 90 days, missing days counted as zero, minimum 28 days; when a series cannot supply it,
  `SIGMA_POOLED` and the VED-class median.
* **leadTimeDays (F-08)** `max(1, ceil(PO ETA - today))` when an open PO has a date, else
  `standard_lead_time_days`. The pack has **no PO arrival dates**, so the standard lead time is used — stated,
  not approximated.
* **leadTimeQuantile (ASM-43 approximation)** a **WEEK run scales the weekly band**: `P_q × L/7`; a **MONTH
  run scales the monthly band**: `P_q × L/30`; `ceil`, with `q` = P95 (V) / P90 (E). The spec's own switch
  (`P_q(week) × L/7` for `L ≤ 7`, else `P_q(month) × L/30`) needs **both** bands at the same origin, which a
  single-granularity run does not have, so the switch is approximated: a WEEK run uses `L/7` even when
  `L > 7`, a MONTH run uses `L/30` even when `L ≤ 7`. `leadTimeQuantileApprox` is therefore always `true` and
  every row carries `LEAD_TIME_QUANTILE_APPROX` in `flags`.
* **rop (F-09)** `u × L + Z × sigma × sqrt(L)` when `demandPattern = REGULAR`, `Q_q(L)` when `INTERMITTENT`,
  `ceil`; `Z` from `ved.z` (V 1.65, E 1.28, D 0.0).
* **incoming** `stock_snapshot.qty_incoming` at the data end: the **open-order total with no arrival date**,
  treated as available now (optimistic about timing).
* **Projected on-hand** `projectedOnHand_pXX = stockOnHand + incoming - pXX`, one field per demand quantile
  (`p50` = expected case, `p90` = pessimistic, `p95` = severe); negative means a shortfall against that
  quantile. It is a period-total demand subtraction, not a day-by-day simulation.
  `stockOnHand` is observed **at `dataEnd`**, so when `dataEnd` falls mid-week the first days of the target
  week are already consumed in that stock: **WEEK projections are slightly pessimistic** for that reason
  (the numbers are not adjusted for it; MONTH is unaffected because `dataEnd` is month-aligned).
* **confidenceFlag** primary flag by precedence `COLD_START > FALLBACK_CLASSICAL > RESIDUAL_FALLBACK >
  SIGMA_POOLED > NO_USAGE > LOW_CONFIDENCE > OK`; `confidenceFlags` keeps every confidence flag on the row and
  `flags` adds the method flag `LEAD_TIME_QUANTILE_APPROX`.
  `coverageOk` is the per-series P90/P95 coverage on the frozen valid predictions (±0.05), `null` for `LOW_N`.

## Model versioning

One directory per frozen model set: `artifacts/<model_version>/` with `q05.txt … q95.txt` (LightGBM text
models) and `meta.json` (feature list, `feature_hash`, train window, post-processing, `best_iteration` per
quantile, data end, seed; MONTH also records `n_estimators_cap`).

- Version string = `f1-{granularity}-{data_end}-{feature_hash}-r{revision}`. The hash covers the feature
  list, so a changed feature set cannot silently reuse an old artifact.
- `inference.model_versions` **pins** the version each granularity serves. A missing directory / `meta.json` /
  quantile file stops `predict` with `NO_MODEL` (exit 3) instead of falling back to another model.
- The frozen sets are WEEK `f1-WEEK-2026-09-14-f455e37770dc` (created before the `-r` suffix existed, so it
  carries no revision marker) and MONTH `f1-MONTH-2026-08-01-8f70f4a87d1e-r2` (`revision: 2`, set in Phase 5).
  `revision` was bumped because Phase 5 changed the gate and the artifact metadata; the WEEK model was kept
  byte-identical on purpose — every WEEK number in this README refers to it.
- Retraining writes a **new** directory (new data end / hash / revision); nothing in the code overwrites a
  frozen version, and `scripts/run_all.sh` never calls `train`.
- Calibration parameters are versioned separately: `artifacts/calibration/<model_version>/calibration.json`,
  keyed by the model they belong to, never stored inside the artifact folder.
- Reports carry the version they scored plus an `evaluation_number` when a split was looked at more than once.

## Calibration (split conformal)

`f1_forecast/calibration.py`; switch in `calibration.WEEK/MONTH.enabled`; parameters in
`artifacts/calibration/<model_version>/calibration.json`.

- Method `split_conformal_cqr` on the `log1p` scale: one additive offset per quantile, fitted on the valid
  **check half** (later half, with a one-period gap) and applied to every row at inference after the bands are
  sorted. The frozen LightGBM files are never modified.
- **WEEK: enabled**, variant `global` — valid coverage error 0.0145 → 0.0024, width ×1.093 (cap 1.10),
  pinball +1.2 % at P90. Calibrated test: P90/P95 coverage 0.897/0.952, TT stock-out 0.0760.
- **MONTH: disabled** — the global shift raised the valid coverage error (0.0139 → 0.0151), and the tercile
  variant needs 500 rows per bucket while the 12-month monthly split supplies ~336. Monthly output therefore
  stays uncalibrated (P90 coverage ≈ 0.88 on test).
- Test is never used to choose the variant; the WEEK calibrated test run is a labelled new evaluation (#3).

## Data contract

Inputs are read **read-only** from `data/`; nothing in `data/` is ever written to.

| Input | Rows | Granularity / keys | Role |
|---|---|---|---|
| `data/DooRare-F1-Monthly-Pack/csv/usage_daily.csv` | 672,367 | day × (`hospital_id`, `hospital_drug_id`) | target source (`qty_used`, censored by stock) |
| `…/stock_snapshot.csv` | 672,367 | day × series | on-hand, open-order quantity, stock-out days |
| `…/hospital_drug.csv` | 191 | (`id`) | listings: price, VED, ABC, lead time, seasonality |
| `…/drug_master.csv` | 41 | (`id`) | catalogue: item type, cold chain, blood, controlled |
| `…/hospital.csv` | 5 | (`id`) | hospital code HA–HE, tier |
| `…/context_signal.csv` | 73 | date window × signal type | event flags (known-at-origin rule) |
| `data/f1_daily.csv` | 661,411 | day × (`hospital_code`, `item_code`) | joined daily view, 188 non-blood series |
| `data/f1_weekly_features4.csv` | 77,565 | (`hospital_drug_id`, `origin_week`) | committed weekly matrix + authoritative `split` |

**Target definition** (verified in Phase 1 by recomputing from `usage_daily`): `origin_week` is the Monday
of the last week of available data; `lag_1w` = usage over `[origin_week, origin_week+6]`;
`y_target` = usage over `[origin_week+7, origin_week+13]` — i.e. the next week. Monthly uses
calendar-complete months and the same one-step-ahead rule.

**Series scope**: 191 listings − 3 blood products = 188; − 15 Min-Max listings (VED = D and price ≤ 50 THB)
= **173 modelled series**. Cold-start series (7) have 46–68 days of history and appear only in the weekly
test split (43 rows).

## Metrics and gates

Pinball loss per quantile, coverage per quantile (target ±0.05), MAE and WAPE on P50, mean interval width,
quantile-crossing rate (raw and after the monotone fix), forecast stock-out rate (`y > Total Target`),
overstock rate (`stock > 2 × TT`), value impact in THB — all on the raw scale after `expm1`, sliced by
VED / price tier / item type / hospital tier / seasonality / high-zero-share / cold start, with `LOW_N`
(monthly always, since only 12 evaluation months per series exist).

## Limitations (read before trusting any number)

- The pack is **synthetic mock data** generated by `db/mock/generate.py`; the model learns the generator's
  own formulas, so coverage and pinball will look better than reality. Never quote these as real accuracy.
- `qty_used` is **dispensed** usage, censored when stock hits zero (3.57 % of item-days); true demand is
  unobserved.
- Stock on hand is a **policy output** (each hospital's min/max reorder rule), so it is used as an input to
  the alert comparison, not modelled.
- `qty_incoming` has **no arrival date** (total open-order quantity), so projected on-hand needs an
  assumption — it is reported with that caveat.
- The committed weekly matrix flags `ctx_*` on the **target** week; training uses the known-at-origin
  variant instead, and Phase 3 will quantify the difference.
- The module does **not** write to the database and does **not** change the schema. Monthly backtests need a
  `granularity`/`period_start` column on `forecast_backtest` before they can be persisted (separate task).
- **The frozen WEEK `meta.json` has no tree cap.** It was written before Phase 5; MONTH artifacts (and any
  future WEEK retrain) record `n_estimators_cap`, so the WEEK file is the only one without it.
- **The frozen WEEK reports gate on two baselines.** `evaluation.gate.must_beat_baselines` now lists all
  three (Phase 5), but `reports/model_{train,test}.json` were not regenerated (that would re-run WEEK test
  predictions), so their `gate.checks` still show seasonal naive + MA/ES only.
- **`model_version` is revision-suffixed only from Phase 5.** New artifacts get `-r2`; the frozen WEEK
  artifact keeps `f1-WEEK-2026-09-14-f455e37770dc`, which no longer matches what a fresh WEEK retrain would
  produce (by design, to preserve its provenance).
- **Calibration is a global additive shift on the log1p scale**, not a per-series or per-horizon fix, and it
  was accepted with width at +9.3 % on the valid check half (cap 10 %) and +7.7 % on test. MONTH stays
  uncalibrated because the shift did not reduce the coverage error; the monthly P90 miss (≈0.88 on test)
  remains open. Tercile variants need 500 calibration rows per bucket, which the 12-month monthly split
  cannot supply.
- **The WEEK calibrated test numbers are a new evaluation** — test look **#3** for the WEEK artifact
  (`model_test.json` records #2), labelled "calibrated test evaluation (new)" in `reports/calibration.md`.
  MONTH was **not** re-evaluated: its saved test report (#1) is untouched. Nothing was tuned after seeing
  any of these numbers.
- **High-volume series under-cover.** Coverage degrades with volume: MONTH test P90/P95 is 0.899/0.952 (low
  tercile), 0.880/0.952 (mid) and **0.855/0.933 (high)**; WEEK 0.894/0.950 → **0.878/0.942**. Baselines are
  flat or slightly better in the high bucket, i.e. exactly where the value sits.
- **Aggregate wins are not per-series wins.** WEEK test beats the best baseline on only 50.6 % / 44.0 % /
  **36.8 %** of series at P50/P90/P95 (MONTH 40.4 / 47.0 / 44.6 %); the top-10 series carry 63 % (WEEK) and
  67–75 % (MONTH) of pooled pinball.
- **`ctx_flu_peak` / `ctx_dengue_peak` are constant at monthly granularity** under the known-at-origin rule
  and are dropped, so the monthly model has no flu/dengue signal by construction (33 features).
- **Hyper-parameter grids are selected at their edges**: WEEK picks `num_leaves = 15` and
  `min_child_samples = 20` (both the lowest) for most quantiles; MONTH picks `learning_rate = 0.03` and
  `min_child_samples = 10` (lowest) for every quantile and `num_leaves = 31` (highest) for four. A wider grid
  could change the answer; not extended here.
- **`incoming` is treated as available now.** The pack has no PO arrival dates, so projected on-hand adds the
  full open-order quantity to stock at the data end — optimistic about timing, not about quantity.
- **`leadTimeQuantile` is an approximation of ASM-43.** A single-granularity run cannot apply the spec's
  L ≤ 7 / L > 7 switch (it needs both bands at the same origin), so WEEK always uses ×L/7 and MONTH ×L/30;
  every row carries `LEAD_TIME_QUANTILE_APPROX` and `leadTimeQuantileApprox: true`.
- **The Node SQL path is untested against a live Postgres.** `backend/src/modules/forecasts` was verified
  through the compiled service with the JSON fallback only (`forecast_result` is empty in this environment);
  the queries are type-checked and compiled, never executed. The HTTP layer was not exercised over a socket
  (auth needs Postgres).
- **No DB ingestion yet.** This module writes files, not rows: persisting the JSON into
  `forecast_run` / `forecast_result` (plus a `granularity` column on `forecast_backtest`) is still open.
- `scripts/run_all.sh` rewrites `reports/data_quality.*` and `reports/feature_build.*` (they embed a
  `generated_at` timestamp) and the JSON under `artifacts/forecasts/`; model and calibration files are not
  touched.

## Layout

```
backend/models/
  config/forecast.yaml     all paths, quantiles, splits, hyper-parameters, gates, expectations
  f1_forecast/             config, schema, data_loader, clean, validate_data, metrics, baselines, backtest, cli
  scripts/run_all.sh       close-out verification (validate -> features -> evaluate -> predict -> pytest)
  tests/                   pytest suite (session-scoped fixtures, data loaded once)
  reports/                 committed small reports (data_quality.json, data_quality_summary.md)
  data/                    derived feature tables (gitignored)
  artifacts/               trained models + meta.json (gitignored)
```
