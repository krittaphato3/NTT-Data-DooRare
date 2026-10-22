# Current Task

Goal: Pharmacist Hospital Dashboard frontend (React+TS, Docker, npm) — mockup-faithful, now role-structured and responsive to phones/tablets.

Status: Reverted to remote `2e1313b` and continued from it. Restructured to `src/roles/pharmacist/{pages,components,data}` + shared `components/{common,layout}` and `data/{session,navigation}`. Responsive pass done (drawer nav <1024, phone top bar grid <768, 2-col KPI/tiles <640). Build passes; Docker rebuilt; :8080 HTTP 200. Collapsed rail overlap fixed and expand/collapse animated; UI capture snapshot committed to `artifacts/`.

Blockers: Browser-panel screenshots were unavailable ("webview not composited") — verified via DOM geometry; a visual pass is still worth doing.

Next action: Review preview at http://127.0.0.1:5173 (vite dev) or http://localhost:8080 (docker). Then wire real API replacing mock data, and add the remaining role pages on the new structure.

Relevant files: `frontend/src/App.tsx`, `frontend/src/roles/pharmacist/pages/DashboardPage.tsx`, `frontend/src/index.css`, `frontend/src/README.md`


## Branch feature/ml-stock-prediction

- F1 quantile demand-forecast module at `backend/models/` (Python 3.13, CPU). Phases 0–5 done: config, validation, baselines + backtest + F-24 metrics, weekly/monthly matrices, WEEK + MONTH quantile models (60 tests green). See `sessions/2026-10-19-buffy-f1-quantile-{forecast,phase2,phase3,phase4}.md` and `sessions/2026-10-20-buffy-f1-quantile-phase5.md`.
- Phase 3: weekly rebuild reproduces the committed matrix exactly (77,565 rows, 44/44 columns, 0 mismatches); monthly matrix 17,763 rows, 2017-10→2026-08, train ≤ 2024-06 / valid 2024-08–2025-07 / test 2025-09–2026-08, embargo 2024-07 + 2025-08. 167 of 173 series carry monthly rows (6 have one complete month only).
- Baseline result (test, mock data): WEEK — seasonal naive best P50 (MAE 63.1), MA/ES P90 coverage 0.911, empirical best tail (7.7 at P95). MONTH — seasonal best P50 (196.5), MA/ES cov90 0.907, empirical cov90 0.840 (outside ±0.05). Per-series coverage 61 % (WEEK test) — Phase 6 target. All monthly series are LOW_N (12 periods/split).
- Phase 4/4b: artifact `artifacts/f1-WEEK-2026-09-14-f455e37770dc/` — 7 quantile models (q05…q95), `all_history`, isotonic post-processing, cap 5,000 trees (best iter ≤ 3,976). Test (second evaluation): pinball 24.13 / 11.74 / 7.32, coverage 0.882 / 0.943, WAPE 0.071; beats all three baselines on the common 4,648-row set. Raw crossing 17.1 % (0 after the fix), concentrated in zero-heavy series; per-series P90 pass 66.7 % (valid 70.3 %, MA/ES 74.6 %); cold-start weak (43 rows, cov P90 0.698). 57 tests green.
- Phase 5 (MONTH): artifact `artifacts/f1-MONTH-2026-08-01-8f70f4a87d1e-r2/` — 7 quantiles, 33 features (`ctx_flu_peak`/`ctx_dengue_peak` dropped as constant), `all_history`, sort bands, cap 5,000 recorded in `meta.json`. 13,446 / 1,992 / 1,993 rows, 166 / 166 / 167 series. Test (monthly evaluation #1, common 1,992 rows): pinball 84.08 / 37.48 / 21.77, coverage 0.878 / 0.946, WAPE 0.057; beats all three baselines (98.23 / 161.92 / 118.84 at P50). Raw crossing 36.5 % (0 after sort) — 61 % of crossings substantive. All series LOW_N (12 periods), per-series pass undefined. 6 series have no monthly rows → inference fallback. Row-level predictions in `data/model_predictions_month_{valid,test}.parquet`.
- Housekeeping done: `must_beat_baselines` lists three baselines; `model_version_revision: 2` → MONTH version `…-r2` (WEEK artifact frozen at its old version). WEEK `meta.json` still lacks the cap (frozen on purpose).
- Phase 6a: `reports/evaluation.{md,json}` + `evaluation_{slices,series}.csv`; slices, top-10 concentration (WEEK 63 %, MONTH 67–75 %), TT impact, crossings by volume tercile, gain importance. WEEK re-scored from the frozen artifact into `data/model_predictions_week_{valid,test}.parquet`; aggregates match the saved report exactly. Model loses in VED D / HIGH price / zero-heavy slices (small margins) and monthly `lag_1m` holds 58 % of P50 gain. 63 tests green.
- Phase 6b: `reports/diagnostics.*` (A1–A4: per-series win rate 50.6/44.0/36.8 % WEEK test; scale-free median 0.368 vs 0.405 empirical; TT stock-out 0.0884 vs nominal 0.0744; high-volume coverage 0.878/0.942) and `reports/calibration.*` (split conformal, valid-only decision). **WEEK: global enabled** — check-half coverage error 0.0145→0.0024, width ×1.093; calibrated test (look #3) coverage 0.884/0.943→0.897/0.952, TT stock-out 0.0760, gate passes. **MONTH: disabled** (global worsened coverage error 0.0139→0.0151; tercile infeasible). Params in `artifacts/calibration/<model_version>/`. 72 tests green.
- Phase 7a: `f1_forecast/predict.py` + `cli predict --granularity WEEK|MONTH [--as-of]` (and `cli parity`). Outputs `artifacts/forecasts/<model_version>/forecast_<GRAN>_<origin>.json`; WEEK origin 2026-09-21 / dataEnd 2026-09-30 → 173 QUANTILE_LGBM (166 OK, 7 COLD_START), calibrated global; MONTH origin 2026-09-01 → 167 QUANTILE_LGBM + 6 MA_ES FALLBACK_CLASSICAL (166 OK, 1 LOW_CONFIDENCE), calibration off. Parity 332 valid rows/granularity, max abs diff 0 (WEEK uncalibrated and calibrated). Exit codes 3 NO_MODEL / 4 STALE_INPUT / 5 INSUFFICIENT_DATA / 6 SCHEMA_MISMATCH; `inference.stale_after_days: 30`. 92 tests green.
- Phase 7a Step 0 (accepted): `definitions.leadTimeQuantile` rewritten to the implemented per-granularity scaling (WEEK ×L/7, MONTH ×L/30, ASM-43 switch approximated + always flagged); `definitions.projectedOnHand` + README document `stockOnHand` at `dataEnd` (mid-week WEEK projections slightly pessimistic). MONTH L≤7 check: 70 rows, sample 108.0 × 7/30 → 26, matches. 94 Python tests green; 18 artifact files sha256-identical.
- Phase 7b: read-only Node API `backend/src/modules/forecasts/` mounted at `/api/v1/forecasts` (API-F1a-001 list, API-F1a-002 detail; `POST /forecasts/runs` deliberately omitted — write/job). DB first (`v_latest_forecast` + `forecast_result` history + WEEK `forecast_backtest`), JSON fallback by `originUsed`→`modelVersion` with `meta.source`/`meta.dbError`. `config/env.ts`: `FORECASTS_DIR`, `FORECASTS_STALE_AFTER_DAYS=30`. `npm --prefix backend ci` + `run build` pass; smoke script (no Postgres, no server) shows list/filters/detail/404/400. `backend/README.md` written.
- Phase 8 (closing, docs/scripts only): `backend/models/scripts/run_all.sh` = validate → features → `evaluate --split valid --no-report` (WEEK+MONTH, saved artifacts) → `predict WEEK` → `predict MONTH` → `pytest`; **never trains**. Real run exit 0 (13/13 checks, 7/7 build checks, both gates pass, 173 rows/granularity, 94 tests). README completed (config keys, model versioning, calibration, exit codes, data contract, extended limitations). DoD checklist printed PASS/PARTIAL/NOT DONE; frozen artifact + calibration sha256 unchanged; `data/` untouched. See `sessions/2026-10-21-buffy-f1-quantile-phase8.md`.
- Commands: `cd backend/models && scripts/run_all.sh` (full check) or `../../.venv/bin/python -m f1_forecast.cli validate|features|backtest [--granularity WEEK|MONTH|BOTH]|train --granularity WEEK|MONTH|evaluate --granularity WEEK|MONTH --split test --evaluation-number N|report --granularity BOTH|predict --granularity WEEK|MONTH [--as-of YYYY-MM-DD]|parity`, `../../.venv/bin/pytest`; `npm --prefix backend run build`. **Do not retrain the frozen WEEK/MONTH artifacts.**
- Next (awaiting sign-off): **Phase 7c** — persist forecast JSON into `forecast_run`/`forecast_result` (DB path is written but never exercised against live Postgres; `forecast_backtest` still needs a `granularity` column), then frontend wiring for API-F1a-001/002. Calibration switch is in `config/forecast.yaml` (`calibration.WEEK/MONTH`).

## Branch feature/dashboard-transport-tracking

- UI-14 Transport tracking (warehouse role) built UI-only; open `/?page=transport`. See `sessions/2026-10-14-transport-tracking-ui.md`.
- Next: driver PWA states, IndexedDB queue, API wiring.

## UI-05 Borrow requests (pharmacist)

- Built UI-only at `/?page=requests`; see `sessions/2026-10-14-2039-claude-borrow-requests-ui05.md`.
- Shared ops CSS (table/filters/drawer/tabs) now lives in `index.css`.
- Next: UI-06 lender queue, UI-10 manual request, API wiring.

## Branch feature/dashboard-Incident

- UI-11 – UI-13 Incident Console (`?page=incident`) built matching 4 mockup screens.
- All 4 tabs implemented: แผนเวชภัณฑ์ UI-12, ยืมฉุกเฉิน, จัดชุด UI-13, สรุปหลังเหตุการณ์.
- Zero emojis used; standard SVG icons and `.badge` tokens used throughout.
- Docker rebuilt and serving on port 8080.
- Next: integration with live backend events and WebSocket incident updates.

## UI-02 Stock alert queue (branch feature/notification)

- UI-02 built UI-only (pharmacist role); open `/?page=alerts`; sidebar "แจ้งเตือนสต็อก" links there. See `sessions/2026-10-14-stock-alert-queue-ui02.md`.
- Files: `frontend/src/roles/pharmacist/{data/stockAlerts.ts,components/StockAlert*.tsx,pages/StockAlertsPage.tsx}`, `frontend/src/index.css` (`.sa-*`), `frontend/src/App.tsx`, `frontend/src/components/common/icons.tsx` (`upload`).
- Visual-fix pass done: design alignment (no English glosses, accent borders, badge icons, two bar markers, underline tabs, etc.); build exit 0; DOM probe 46/46; 25 `ui-02-*.png` re-captured fresh.
- Verify: `cd frontend && npm run build`; page checks via `vite` + Playwright (`?page=alerts`).
- Next: wire `GET /alerts` (API-F1a-005) + ack/snooze POSTs, "สร้างคำขอ" → API-F1b-001; then UI-03 / UI-07.

## ER role (branch feature/dashboard-er)

- ER shell at `/?role=er`; incident console is role-aware (pharmacist view-only). See `sessions/2026-10-17-claude-er-incident-console.md`.
- Next: browser pass, team decision on joint close approval.

## Branch feature/backend-step7-f3-incidents-kits

- F3 backend (incidents, rule-based plan F-27, approval, urgent borrowing with first-wins, kit packing / stock / returns, two-signature close, reconciliation) and the ER / WH / PH screens on the API. 405 step-7 checks + 37 unit tests + earlier suites pass. See `sessions/2026-10-22-claude-backend-step7-f3.md` (roles decision, plan shape, kit stock model, gaps).
- Not committed / pushed. Next: step 8 (Admin: users, config, audit-log, kill-switch); open F3 gaps: INCIDENT_REPORT / UCEP documents, WH work-inbox page (mock), blood returns, Agent.
