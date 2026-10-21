---
title: Backend step 4 - stock alerts, forecast loader, classification
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, backend, alerts, forecast, f1a, frontend, detailed
summary: Alerts evaluated from usable stock vs forecasts; forecast JSON loader; PH and WH stock pages live; 55 checks pass
---

> Detailed on purpose: the user asked for detailed session notes from now on (this overrides the 150-250 word guideline).

## Goal

- Step 4 of the solo API plan (F1a remainder): alerts, forecast "run", VED classification.
- Branch `feature/backend-step4-stock-alerts`, created from `feature/backend-api` (a4eeacb). Pushed, NOT yet merged into `feature/backend-api`.

## What was built (backend)

### `POST /forecasts/runs` (API-F1a-003) — `modules/forecasts/forecasts.runs.ts`
- Roles SYSTEM_ADMIN, REGION_ADMIN; needs `Idempotency-Key`. Body `{granularity: WEEK | MONTH | BOTH}` (default BOTH). Response `{ok, jobId, status, runs[]}`; `runs[]` has runId, modelVersion, periodStart, dataEnd, loaded, items, skipped, alerts counts.
- There is no Python worker behind the API. A "run" loads the newest inference JSON (`backend/models/artifacts/forecasts/<version>/forecast_<GRAN>_<origin>.json`, the Phase 7a contract) into `forecast_run` + `forecast_result`, then evaluates alerts.
- Method mapping: `QUANTILE_LGBM`, `MA_ES` as is; `FALLBACK_CLASSICAL` -> `MA_ES`. `confidence_flag`, `demand_pattern`, `lead_time_quantile`, p50/p90/p95, total_target, rop copied.
- Idempotent load: same `model_version` + `period_start` already SUCCEEDED -> rows are not loaded again (`loaded:false`), but alerts ARE re-evaluated against current stock. A pg advisory lock per granularity serialises runs.
- Writes one `audit_log` row `FORECAST_RUN` per granularity (counts included).
- After a run `GET /forecasts` is served from the DB (`meta.source = DB`), not the JSON fallback. The DB path has no stockOnHand/p05..p75, so screens take stock from `/inventory`.

### Alert evaluation — `modules/alerts/alerts.evaluate.ts`
Usable stock = sum(qty_on_hand - qty_held) over lots not expired (BR-F1a-019), per hospital drug. For each forecast row (VED V or E, not blood):
- stock >= Total Target -> no alert; an OPEN / ACKNOWLEDGED / SNOOZED alert becomes AUTO_CLOSED (BR-F1a-013). LINKED_TO_REQUEST is never auto-closed.
- Predict <= stock < Total Target -> `ORDER_AHEAD`, NORMAL (BR-F1a-014).
- stock < Predict, WEEK -> `LOW_STOCK` (the "agent trigger"), severity from days of cover = stock / u_per_day (F-11): V <=2 d VERY_URGENT, <=7 d URGENT, else NORMAL; E <=2 d URGENT else NORMAL.
- stock < Predict, MONTH -> `ORDER_EARLIER`, NORMAL (BR-F1a-015).
- stock fine but forecast flagged LOW_CONFIDENCE (or COLD_START on WEEK) -> `LOW_CONFIDENCE`, NORMAL.
- VED D items with `min_level` and stock < min -> `MIN_MAX`, WEEK, NORMAL; never an agent run (BR-F1a-010/020). Evaluated during the WEEK run only.
- Blood products skipped (BR-F1a-024).
- At most one active alert per hospital drug x granularity (also enforced in code; the DB unique index includes `type`). An existing alert is updated in place (type, severity, stock_qty, days_cover, forecast_result_id). A SNOOZED alert stays snoozed until `snoozed_until`; afterwards it is re-opened (status OPEN) by the next evaluation.
- `suggested_borrow_qty` and `incoming_qty` are left null (F1b computes the borrow quantity).

### `GET /alerts` (API-F1a-005) — `modules/alerts/alerts.service.ts`
- Roles PHARMACIST, HOSPITAL_ADMIN, WAREHOUSE_OFFICER (view), SYSTEM_ADMIN (must pass `hospitalId`); hospital-bound users always get their own hospital.
- Query: `status` (`active` default | `all` | comma list), `type`, `granularity`, `ved`, `q`, `limit` (1-200), `cursor`.
- Order (BR-F1a-011 / FR-F1a-009): VED V -> E -> D, then ABC A -> B -> C, then fewest days of cover, then newest.
- Each item: type, severity, status, version, hospitalDrug {id, localCode, localName, localUnit, ved, abc}, drugName, baseUnit, coldChain, stockQty, daysCover, forecast {method, p50, p90, p95, totalTarget, rop, uPerDay, leadTimeDays, confidenceFlag} (from the linked forecast_result), request {id, requestNo, status} (borrow request that references the alert), snoozedUntil.
- `meta`: `active` total, `byStatus`, `bySeverity` (used for the summary cards).

### Acknowledge / snooze (API-F1a-006 / -007)
- Both PHARMACIST only; own hospital only (other hospital's alert -> 404). Optional `version` in the body -> 409 `VERSION_CONFLICT` on mismatch.
- `POST /alerts/{id}/ack`: OPEN -> ACKNOWLEDGED, otherwise 409 `ALREADY_DECIDED`. Audit `ALERT_ACKNOWLEDGED`.
- `POST /alerts/{id}/snooze` body `{reason, hours?}`: reason required (>= 3 chars); hours 1-168, default 24; OPEN or ACKNOWLEDGED -> SNOOZED with `snoozed_until`. Audit `ALERT_SNOOZED` with the reason (part of the hash chain).

### `PATCH /hospital-drugs/{id}/classification` (API-F1a-004) — `modules/catalog`
- PHARMACIST, HOSPITAL_ADMIN; only the caller's own listings (other hospital -> 404).
- Body `{ved?, expiryThresholdDays? (1-3650 or null), reason}`; changing VED requires a reason (FR-F1a-014). A listing with `method_override = MIN_MAX` cannot leave VED D (409).
- Audit `HOSPITAL_DRUG_CLASSIFIED` with before/after + reason. `hospital_drug` has no `version` column, so there is no optimistic lock.
- Changing VED does not recompute anything by itself; the next forecast run / evaluation uses the new class.

### Other backend edits
- `GET /inventory?view=summary` now also returns `usable` (not expired, not held) — the number the alert comparison uses.
- `GET /forecasts` and `/forecasts/{id}` now allow WAREHOUSE_OFFICER (plan §4.2).
- `app.ts` registers `/alerts`.

## What was built (frontend)
- `services/alertsApi.ts`: getAlerts, ackAlert, snoozeAlert, getInventorySummary, classifyHospitalDrug, runForecasts.
- `roles/pharmacist/data/stockAlertRows.ts`: builds table rows from forecasts + usable stock + alerts (weekly forecast row; alert shown is the WEEK one if any, else MONTH); builds the 5 summary cards (low stock with severity split, order ahead/earlier, min-max, low confidence, near-expiry from `/dashboard`).
- `roles/pharmacist/data/useStockAlerts.ts`: loads the 4 reads with `Promise.allSettled`; falls back to the old mock rows only if `/alerts` itself fails; a missing forecast file just means rows come from alerts alone.
- `stockAlerts.ts`: alert types extended with ORDER_AHEAD, ORDER_EARLIER, MIN_MAX (labels in `ALERT_TYPE_META`).
- PH page `StockAlertsPage.tsx`: queue tab = rows with an alert; ack button calls the API; snooze opens a dialog (hours + required reason); "create borrow request" shows a notice (needs F1b); banner states source, model version and whether the data is synthetic. `StockAlertSummary` takes optional `cards`.
- WH page `WhStockPage.tsx`: same hook, read-only.
- Removed the earlier `forecastRows.ts` (replaced by `stockAlertRows.ts`).

## Tests (scratch scripts in the session scratchpad, NOT in the repo)
- 55 step-4 checks, all pass: role/auth guards, run loading (173 + 173 rows, 346 results, MA_ES mapping, no duplicates on re-run, audit rows), DB-served `/forecasts`, **alerts recomputed independently in the test and compared with what the system created (0 differences for WEEK 14 expected, MONTH 80 expected)**, one-active-alert invariant, no alert for blood, D items only MIN_MAX, ordering, filters, cursor paging, hospital scoping, ack/snooze rules and audit, snooze surviving and expiring, stock rising closes an alert, stock zero on a V item -> LOW_STOCK VERY_URGENT (0 days), Min-Max alert, classification rules and audit.
- Earlier suites re-run on fresh DB copies: step 3 (55), transport (40), returns (26, must run after transport), documents (26).
- UI checked in the browser against a DB copy: queue of 21 alerts for HA, ack changed the DB row to ACKNOWLEDGED (version 2), snooze dialog set SNOOZED with `snoozed_until` +24 h, WH stock page shows 37 rows / 21 alerts.
- All test databases were copies (`doorare_test`) and were dropped; the real DB has no forecasts or new alerts until someone calls `POST /forecasts/runs`.

## Decisions
- A forecast "run" only loads the latest JSON; training/prediction stays in the Python module (`python -m f1_forecast.cli predict`). New numbers need that step first.
- LOW_CONFIDENCE alert only when stock is otherwise fine, so one active alert per drug x granularity holds.
- Snooze reason required and max 168 h are my choices (spec names no duration).
- Either WEEK or MONTH alert is shown per row (WEEK preferred) because the table has one alert slot.

## Known gaps / things to know
- BR-F1a-021 (stale usage suppresses forecasts/alerts) NOT applied: demo usage ends 2026-09-30, so the rule would suppress everything. The run result returns `dataEnd` so the screen can say so.
- About 80 MONTH `ORDER_EARLIER` alerts appear (monthly Predict exceeds usable stock for many items). That follows BR-F1a-015; pharmacists may find it noisy. A threshold or grouping is a product decision.
- "Create borrow request" from an alert is not available until F1b (step 5); the button only shows a notice. `suggested_borrow_qty` stays null.
- Not built: forecast detail screen data (history/backtest tables are empty for DB rows), per-item forecast rerun (FR-F1a-012, max 3/day), monthly ABC recompute (FR-F1a-015), OVERSTOCK and DATA_STALE alert creation (types exist, nothing produces them), notifications for new alerts.
- No scheduler: evaluation only runs when someone calls `POST /forecasts/runs`; stock changes (loads, receipts) do not re-evaluate alerts.
- The summary card "near-expiry" count comes from `/dashboard` (near_expiry_item DETECTED).
- Friend's files touched: `backend/src/modules/forecasts/forecasts.routes.ts` (added POST /runs, WH read access). Tell the owner (napatsun).
- Server restart drops in-memory sessions; the app then shows mock data until re-login (existing auth behaviour).

## Next steps
- Decide whether to merge this branch into `feature/backend-api` (not done yet).
- Step 5: F1b borrow requests (create, propose, approve, reject, ladder, escalate), lender queue, `borrow-legs/{id}/respond` (calls `createTransportTask()`), agent runs rule-based first. Needs the user to review the Si score / ladder formulas (spec §8-9).
