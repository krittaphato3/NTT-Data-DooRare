---
title: F1 quantile forecast module (Phase 3 — feature matrices)
date: 2026-10-19
author: sun
ai: buffy
tags: session, ml, forecast, quantile, features, monthly, no-lookahead, backend
summary: Weekly rebuild exact; monthly 17,763 rows; causal ctx flags; monthly baselines
---

## Goal

- Phase 3: weekly rebuild, monthly matrix, no-lookahead proof.

## Done

- `features.py`: port of the pack builder, monthly build, three ctx variants, reconciliation; CLI
  `features`; backtest `BOTH`.
- Weekly rebuild **exact**: 77,565 rows, 44/44 columns, 0 mismatches.
- Monthly: 17,763 rows, 2017-10 → 2026-08; train 13,446 / valid 1,992 / test 1,993; embargo 2024-07 +
  2025-08 (332 rows).
- ctx canonical vs committed: 0.6–4.5 % differ, all one-directional (leaks removed).
- Monthly baselines: seasonal best P50 (MAE 196), MA/ES cov90 0.907, empirical 0.840 (fails ±0.05).
- 49 tests green, incl. `test_no_lookahead.py` (from-raw rebuild + future-removal).

## Decisions

- Canonical ctx = target-period overlap AND created/approved by the origin-period end; a literal
  `valid_from <= origin` rule made 74–93 % of rows 1, so it was rejected.
- Monthly keeps embargo rows labelled (17,763 contract); weekly drops them as committed does.
- 167 of 173 series carry monthly rows; 6 have a single complete month (2026-09) → no target.

## Files touched

- Added `features.py` + two test modules; edited `schema.py`, `backtest.py`, `cli.py`,
  `config/forecast.yaml`, `README.md`, `INDEX.md`, `current-task.md`. `data/**` untouched.

## Errors

- First monthly build gave 17,431 rows (embargo rows are in the contract); YAML line merge;
  `_month_ranges` train key.

## Next steps

- Phase 4: weekly LightGBM quantile training.
