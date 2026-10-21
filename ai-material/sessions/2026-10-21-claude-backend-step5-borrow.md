---
title: Backend step 5 - F1b borrow requests, lender queue, stop rule, timers
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, backend, borrow, f1b, lender, frontend, detailed
summary: Borrow request lifecycle (create, propose, approve, respond, next round, escalation, timers) on the F1b formulas; PH requests, lender queue and alert button live; 108 backend checks pass
---

> Detailed on purpose: the user asked for detailed session notes (overrides the 150-250 word guideline).

## Goal

- Step 5 of the solo API plan: F1b borrowing (API-F1b-001..013), wire PH `BorrowRequestsPage`, `LenderQueuePage`, the stock-alert "create request" button.
- Branch `feature/backend-step5-borrow-requests`, created from `feature/backend-api` (394527d + formulas commit edb57c6). Backend commit a3a7a53; frontend commit follows. NOT pushed, NOT merged.

## Rules implemented (all numbers come from `core/formulas/borrow.ts`, pure functions + 12 unit tests = the spec's worked examples; `npm test`)

- Need (F-08/F-09): `required R` = u x L + safety (REGULAR) or quantile (INTERMITTENT); `borrow = max(0, ceil(R - stock - incoming))`. `stock` = usable lots (not expired, not held). `incoming` = OPEN `incoming_order` whose `expected_date >= today` (overdue orders are NOT counted - decision, spec only says "incoming"; seed orders are 3 weeks overdue, so without this every seed alert returned NO_NEED). Confirmed-but-not-received legs of an earlier request are not added (the duplicate-request guard makes that case rare).
- Urgency (F-11): V <=2 d VERY_URGENT, <=7 d URGENT; E <=2 d URGENT; else NORMAL. Window = days of cover.
- Hard filters (F-12) per candidate lender, first failing reason stored: NO_DISTANCE, INACTIVE, NOT_PARTICIPATING, NO_LISTING, MAPPING_NOT_VERIFIED, CONTROLLED_DRUG, NO_TOTAL_TARGET, TRANSIT_TOO_LONG, NO_LENDABLE_STOCK, COLD_CHAIN.
- Lendable (F-13/F-14): `max(0, usable stock of lots with > 180 days left - lender's own WEEK Total Target)`; recomputed at approve and at respond.
- Score Si (F-15..F-18): weights .45 time / .28 fulfil / .17 stock-safety / .10 reliability (config keys `borrow.score_weights`); Si is computed from UNROUNDED parts and rounded to 4 dp at the end (the spec's example E = 0.5348 only matches this way). Ranked by Si desc.
- Rounds (F-19): sequential, or up to `borrow.max_parallel` (3) when VERY_URGENT. First-round quantities are allocated greedily down the ladder.
- Stop rule (F-20): V stop when confirmed >= ceil(0.9 x first-round qty); E when confirmed >= normal use (u x L - stock - incoming). Stored in `borrow_request.stop_threshold`. Confirmed = ACCEPTED/PARTIAL/LOADED/IN_TRANSIT `qty_accepted` + RECEIVED `qty_received`.
- Timeouts (F-21): deadline per urgency from `borrow.timeout_min` (V 120 / E 360 / normal 2880); reminder at 50 %; silence at the deadline = TIMED_OUT (counts as a rejection in reliability).
- Next round (BR-F1b-030): when nothing is waiting and the stop rule is not met, the shortfall (`qty_requested - effective`) is asked from the next lender in the FROZEN ladder who was not asked yet; nobody asked twice. Ladder exhausted and nothing in flight -> ESCALATED + notification to HOSPITAL_ADMIN and PHARMACIST of the borrower.
- When the stop rule is met, legs still SENT are CANCELLED (`reject_reason = STOP_RULE`).
- Request FULFILLED only when no confirmed leg is still travelling and received >= threshold; alert goes LINKED_TO_REQUEST -> RESOLVED then. A request that received less than the threshold and has no one left ends ESCALATED (not "PARTIALLY_FULFILLED").
- Agent: not connected. `propose` writes `agent_run` (agent RULES, status SKIPPED, 3 guardrail checks G-QTY / G-HARD-FILTER / G-PARALLEL) and a template message per lender (`draftMessage`). Human approval (HITL) writes `decision_log`.

## Endpoints (`modules/borrow/`)

| Endpoint | Roles | Notes |
|---|---|---|
| POST `/borrow-requests` (-001) | PHARMACIST | Idempotency-Key; `{stockAlertId}` or `{context:'MANUAL', items:[{drugMasterId, qtyRequested}], reason}`; 201 DRAFT, `BR-yyyy-seq6`; one DRUG item; 409 CONFLICT if an active request for the drug exists, 409 NO_NEED, 409 ALREADY_DECIDED (alert not OPEN/ACK); alert -> LINKED_TO_REQUEST |
| GET `/borrow-requests` (-002) | PH, WH, HA, SA | `role=borrower|lender|all`, `status` (group pending/progress/escalated/fulfilled/closed or SM-1 list), `q`, cursor pagination |
| GET `/borrow-requests/{id}` (-003) | same | borrower sees legs + proposal (ladder with Si parts, excluded + reason, drafts); a lender hospital sees only its own legs |
| POST `/{id}/propose` (-004) | PHARMACIST of borrower | recompute need, rank, store `ladder` jsonb, DRAFT/PENDING_APPROVAL -> PENDING_APPROVAL; no lender -> ESCALATED; NO_NEED -> request CANCELLED + 409 |
| PATCH `/{id}/ladder` (-007) | PHARMACIST | per-lender `qty` (<= lendable, total <= borrow, <=1 sequential or <=3 parallel), message texts, `version` check |
| POST `/{id}/approve` (-005) | PHARMACIST of borrower | version check, re-validates lendable (409 LADDER_STALE), APPROVED -> legs SENT -> IN_PROGRESS, decision_log, lenders' PHARMACISTs notified |
| POST `/{id}/reject` (-006) | PHARMACIST | reason >= 3 chars, only DRAFT/PENDING_APPROVAL, alert back to ACKNOWLEDGED |
| POST `/{id}/escalate-manual` (-012) | PHARMACIST | only ESCALATED; lender not self, must have a verified listing; qty <= remaining need; new leg in next round, request back to IN_PROGRESS |
| GET `/{id}/agent-runs` (-013) | readers (own hospital) | runs + human decisions |
| GET `/lender-queue` (-008) | PH, WH, HA | legs sent to my hospital; for SENT legs also `lendable`, `usableForLending`, `ownTarget`, FEFO `lots` with `lendable` flag (> 180 d) and `remainingSec` |
| POST `/borrow-legs/{id}/respond` (-009) | PHARMACIST of lender | `{decision: ACCEPT|PARTIAL|REJECT, qty, lots[], reason}`; ACCEPT = asked qty, PARTIAL < asked; FEFO lots (>= 180 d) unless `lots` given; `holdStock` + `borrow_leg_lot`; `createTransportTask` (default driver + vehicle, cold box when cold chain); reliability_stat; notify borrower; then `advanceRequest` |
| POST `/jobs/borrow-timers` | SYSTEM_ADMIN | runs JOB-04 now; `index.ts` also runs it every 60 s |

`transport.workflow.ts settleBorrowLeg`: after a receipt calls `advanceRequest`; requests whose `ladder` is not an object (seed rows have an older array shape) keep the old plain rule "all items fulfilled -> FULFILLED else PARTIALLY".

## Frontend wired

- `services/borrowApi.ts` (types + calls), `roles/pharmacist/data/{borrowLive,useBorrowRequests,lenderLive,useLenderQueue}.ts`.
- `BorrowRequestsPage`: live list/detail/legs/stop bar/countdown; approve and reject (reason dialog) call the API; ESCALATED -> escalate-manual dialog with a hospital select + qty; "คิวตอบคำขอ" tab now navigates to `?page=lend` with live counts. Falls back to mock when the API is unreachable (same pattern as earlier steps).
- `StockAlertsPage`: "สร้างคำขอ" does create + propose and shows the BR number; approval is on the requests page.
- `LenderQueuePage`: live queue, FEFO lots, lendable box, ACCEPT / PARTIAL (chosen lots) / REJECT (reason) calls `respond`.

## Tests (scratch scripts outside the repo, run on a `doorare_test` copy of the DB)

- `step5-test.mts` 93 checks: auth/roles, validation, idempotency replay, duplicate guard, visibility (borrower / lender / uninvolved), independent recomputation (Si = weighted parts, ranks, borrow = ceil(R - stock - incoming), plan <= borrow, deadline 120 min), edit rules, LADDER_STALE, approve once, lender queue, respond errors, FEFO >= 180 d + held qty, task created with driver, reliability, rejection -> next round, load/transit/arrive/receive, obligation, all lenders reject -> ESCALATED + notification, manual lender, timers (reminder once, TIMED_OUT, escalated again), agent-runs.
- `step5b-test.mts` 10: PARTIAL -> round 2 asks exactly qty - confirmed from a new lender, deliver both, FULFILLED, alert RESOLVED, item qty_fulfilled.
- `step5c-test.mts` 6: two parallel lenders, stop rule cancels the waiting leg (needs a fresh DB copy; stock is consumed by 5/5b).
- Regression on a fresh copy: transport 40, returns 26, documents 26, step3 55, step4 55 all pass; `npm test` 12/12.
- UI check in the browser on a DB copy: alert button -> BR-2026-000579 PENDING_APPROVAL -> approve (countdown 01:59:48, 2 legs, Si 0.7846 / 0.7033 equal to the API) -> as HE pharmacist accept 160 -> leg ACCEPTED + task TR-2026-000083 WAITING_DISPATCH in the DB.

## Decisions / spec deviations (tell the owners)

- Overdue incoming orders are ignored (above). Approx lead-time quantile as in F1a. `remaining` = `qty_requested - effective` (stored need) rather than recomputing R from fresh stock after every response.
- Seed `borrow_request.ladder` has a different (array) shape; code treats it as "no ladder" via `asStoredLadder`. The 5 seed ESCALATED and 4 IN_PROGRESS requests therefore cannot be advanced by the new flow.
- Legs have no `version` column, so `respond` uses the status guard (409 ALREADY_DECIDED) instead of a version check.
- Edited friend/teammate files: none new this step (earlier: `forecasts.routes.ts`, `errorHandler.ts`).

## Known gaps / next steps

- WH requests page (`WhBorrowPage`) and WH inbox still mock; `drug.ved` in the lender row is hard-coded `E`; sidebar badge counts and the page header text ("รพ.สมุทรปราการ") are static.
- Manual request creation UI (UI-10 "สร้างคำขอยืมเอง") button still does nothing; API supports it.
- "ยกเลิกคำขอ" in the drawer (cancel after approval) has no API; returnState chips are not mapped for live rows.
- Agent (Task 3 messages, Task 5 re-rank) is not connected; `agent_run` rows are SKIPPED.
- Notification bell, EMERGENCY context (F3), kit legs still pending; step 6 per the plan order.
- Remember: after any backend restart sessions are dropped; log in again in the browser. Backend runs on 3001 against the main DB.
