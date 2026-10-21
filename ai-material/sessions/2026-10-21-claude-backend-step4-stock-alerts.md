---
title: Backend step 4 - stock alerts, forecast loader, classification
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, backend, alerts, forecast, f1a
summary: Alerts evaluated from usable stock vs forecasts; PH and WH stock pages live; 55 checks pass
---

## Goal

- Step 4 (F1a rest) on branch `feature/backend-step4-stock-alerts` (from `feature/backend-api`).

## Done

- `POST /forecasts/runs` (SYSTEM_ADMIN/REGION_ADMIN, Idempotency-Key): loads the newest inference JSON into `forecast_run` / `forecast_result` (the missing "writer"), then evaluates alerts. Same model+period is not loaded twice.
- `modules/alerts/alerts.evaluate.ts`: BR-F1a-010/013-015/019/020/024; F-11 severity; one active alert per drug x granularity; Min-Max items below min.
- `GET /alerts` (V -> E -> D, ABC, days of cover; counts in `meta`), `POST /alerts/{id}/ack|snooze`, `PATCH /hospital-drugs/{id}/classification`.
- Frontend: PH stock-alert page (queue, ack, snooze dialog) and WH stock page read the live API; `/forecasts` now readable by WH.
- Tests (scratch, not in repo): 55 step-4 checks incl. an independent recomputation of alerts; earlier suites pass.

## Decisions

- No Python worker exists, so a forecast "run" loads the latest JSON artifact; it does not train or predict.
- LOW_CONFIDENCE alert is raised only when stock is fine but the forecast is flagged COLD_START (WEEK) / LOW_CONFIDENCE.
- Snooze needs a reason, max 168 h; evaluation re-opens it when time is up. `hospital_drug` has no version, so classification has no optimistic lock.

## Files touched

backend/src/modules/{alerts,forecasts,catalog,inventory}; frontend pharmacist stock-alert page/data, warehouse stock page, services/alertsApi.ts.

## Known gaps

- Stale-usage suppression (BR-F1a-021) not applied: demo usage ends 2026-09-30. Run result carries `dataEnd`.
- "Create borrow request" from an alert waits for F1b (shows a notice). `suggested_borrow_qty` stays null.
- Forecast detail screen, forecast rerun per item (FR-F1a-012) and monthly ABC recompute (FR-F1a-015) not built.
- ~80 MONTH ORDER_EARLIER alerts appear because monthly Predict exceeds usable stock for many items (rule as specified).

## Next steps

- Step 5: F1b borrow requests, lender queue, respond (calls `createTransportTask()`), agent runs rule-based.
