---
title: F1 quantile forecast module (Phase 4/4b — weekly quantile model)
date: 2026-10-19
author: sun
ai: buffy
tags: session, ml, forecast, quantile, lightgbm, model, artifacts, isotonic, backend
summary: WEEK model with all 7 quantiles, isotonic bands, 5k trees; beats all 3 baselines on valid and test
---

## Goal

- Phase 4: weekly LightGBM quantile model — select on valid, score test once.
- Phase 4b (follow-up): train all 7 quantiles, lift the tree cap, compare sort vs isotonic, re-fit, second
  test evaluation, fix the per-filter `crossing_rate_raw` reporting.

## Done

- `model.py` / `cli.py`: seven quantile models, 12-config grid × 2 windows × 7 quantiles, early stopping on
  valid, isotonic vs sort chosen on valid, `--evaluation-number` label.
- Artifact `artifacts/f1-WEEK-2026-09-14-f455e37770dc/`: q05…q95 `.txt` + `meta.json` (40 features,
  `all_history`, isotonic, seed 42, best iterations 1,090–3,976).
- Valid: pinball 22.11 / 10.51 / 6.60, coverage 0.889 / 0.945, WAPE 0.066, width 187.7.
- Test (second evaluation): pinball 24.13 / 11.74 / 7.32, coverage 0.882 / 0.943, WAPE 0.071,
  width 203.8; beats seasonal naive, MA/ES and empirical at P50/P90/P95 on both filters.
- Reporting fixes: `crossing_pairs_raw` now reads the raw columns; the no-stock-out block recomputes its own
  raw crossing rate (0.1714 all rows vs 0.1689 no-stock-out on test).
- 57 tests green; `validate` 13/13 PASS; `features` rebuild exact; `data/` untouched.
- Acceptance re-checked from saved reports + a no-write re-score of the frozen artifact: gate passes vs all
  three baselines on the common 4,648-row set (valid and test, both filters), coverage 0.889/0.945 valid and
  0.884/0.943 test, post-fix crossing 0. The three known gaps (cap missing from `meta.json`, two-baseline
  `must_beat_baselines`, un-bumped `model_version`) are now recorded in `README.md` → Limitations (docs only).

## Decisions

- Cap 2,000 → 5,000: the P50 model had early-stopped at 1,959/2,000; valid-only run then ended at the same
  1,959 iterations, so the cap was truncating, not helping. No model now reaches 5,000.
- Isotonic kept, but it is a near-tie: coverage score 0.0169 vs 0.0174, width ratio 0.9901, P90 pinball
  0.04 worse. Pre-registered rule applied on valid only.
- Gate is reported against all three baselines on the common row set; `config.evaluation.gate.must_beat_baselines`
  still names only two (spec/config gap, not changed here).
- Grid edge recorded, not extended: 6/7 configs pick `num_leaves = 15`, 5/7 `min_child_samples = 20`.

## Files touched

- `f1_forecast/model.py`, `f1_forecast/cli.py`, `tests/test_model.py`, `config/forecast.yaml`,
  `reports/model_{train,test}.{json,md}`, `README.md`, this note, `INDEX.md`, `context/current-task.md`.
- `data/**` untouched (read-only). The row-level re-score was a throwaway script, deleted after the report;
  derived tables in `backend/models/data/` stay gitignored.

## Errors

- `meta.json` records `best_iteration` but not the `n_estimators` cap — future artifact writers should add it.
- A scratch re-score diluted `crossing_rate_raw` when model and baseline rows shared a frame (NaN raw columns
  inflate the denominator); compute it per frame, as `evaluate_frame` does for a single model.
- Reporting-row mismatch caught late: model test 4,691 vs baselines 4,648/4,670; the 43 extra rows are the
  7 cold-start series.

## Next steps

- Phase 5: monthly training (167 series) + cold-start inference fallback. Do not re-tune WEEK on test.
- Phase 6: conformal/CQR joint construction to remove the crossing artefact and lift per-series coverage
  (valid P90 pass 70.3 % vs MA/ES 74.6 %).
