---
title: Feature feedback fixes F1-F3 (alerts, pool plans, objections, emergency)
date: 2026-10-24
author: copte
ai: claude
tags: session, backend, frontend, f1, f2, f3, alerts, allocation, agent, emergency
summary: Alert link/duplicates/snooze, F2 agent+manual plans+objection, F3 add item+late answer
---

## Goal
- Fix team feedback on F1 stock alerts, F2 pool/allocation, F3 emergency plan (branch `fix/feature-feedback-f1-f3` from `backend-byok`).

## Done
- F1: "ตรวจสอบและอนุมัติ"/"ดูคำขอ"/BR link → `?page=requests&request=BR-…` (drawer opens). Duplicates = `GET /forecasts` returned one row per period (`forecasts.repository.ts`). Snooze reopens on time (`reopenSnoozedAlerts`, 1-min timer).
- F2: `allocation.agent.ts` (BYOK LLM, F-22 fallback), `GET /pool/{id}/candidates`, `POST /pool/{id}/agent-plan`, `POST /allocation-plans`, `POST /allocation-plans/{id}/objection`; region plans visible while objectable; UI buttons + `ManualPlanDialog`.
- F3: `AddPlanItem` (setExtras/setKits); added items now named in plan view; late confirm of TIMED_OUT legs (`lateAnswerSql`), pharmacist lender page uses `/emergency-legs/{id}/confirm`.

## Decisions
- `decisions/0005-f2-f3-feedback-rules.md`.

## Files touched
- backend: alerts.evaluate, index, forecasts.repository, borrow.flow, lender.service, expiry/{matching,plans.service,expiry.routes,allocation.agent}, incidents/{emergency.borrow,plan.service}; tests allocation.agent, forecasts.latest.
- frontend: StockAlertsPage/Table, AlertsPanel, BorrowRequestsPage, PoolAllocationPage, AllocationDrawer, ManualPlanDialog, LenderQueuePage, LiveInbox, LiveIncidentFlow, AddPlanItem, services.

## Errors encountered
- "Lender does not see request": legs time out after 3/5 min and move on; not a delivery bug.
- Demo network auto-approves every plan → objection had to cover approved, not-dispatched plans.
- Git Bash rewrites `/api/...` args → use `MSYS_NO_PATHCONV=1`.

## Next steps
- Real LLM run once BYOK has a key; push branch / PR after review; `db:reset` clears local test data (INC-0067/68, AP-00083..85).
