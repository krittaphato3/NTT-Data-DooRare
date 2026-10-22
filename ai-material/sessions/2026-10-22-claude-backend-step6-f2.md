---
title: Backend step 6 - F2 near-expiry, regional pool, allocation plans, repeat expiry, value, reports
date: 2026-10-22
author: alongkorn
ai: claude
tags: session, backend, f2, near-expiry, pool, allocation, reports, frontend, detailed
summary: Near-expiry scan and review, pool, plan approval / options / mutual-consent cancel, F-25 flags, value and reports on the API; matching is left to the Agent (user decision); 132 backend checks pass
---

> Detailed on purpose (user asked for detailed notes).

## Goal / branch

- Step 6 of the solo plan (F2). Branch `feature/backend-step6-f2-near-expiry-pool-allocation`, created from `feature/backend-api` (fe19967). Not pushed, not merged.
- **User decision (mid-step): the matching of pool lots to receivers is the Agent's job and is NOT built.** Nothing in the backend proposes a split or creates a plan by itself. What exists is the CODE side of FL-12: `createPlanFromAgentProposal(client, poolEntryId, {agentRunId, lines})` in `modules/expiry/matching.ts` recomputes each receiver's F-22 cap, cuts any proposed line above it, drops infeasible / unknown receivers, bounds the total by the pool quantity, runs the F-23 cost check, stores the plan (READY_FOR_APPROVAL, or AUTO_APPROVED inside one network when economical) and notifies. No HTTP endpoint calls it yet; the Agent (or a test) must. The greedy split `splitLot` stays as a tested pure function only (spec fallback), not wired.

## Rules implemented (pure functions in `core/formulas/expiry.ts`, 8 unit tests = spec examples)

- F-22: remaining days, near-expiry = 0 < days <= threshold (per drug `expiry_threshold_days`, default 180); `alloc = min(qty, deficit, consumable)` integer, feasible only if `alloc / u <= days_avail`; greedy order helper; FEFO helper of the drawer: usable = floor((d-1) u), releasable = qty - usable.
- F-23: cost = 300 + 8 km (+500 cold chain); uneconomical when cost >= 20 % of value (value 0 = uneconomical). Plan-level totals; ratio stored capped at 99.9999 (numeric(6,4)).
- F-25: WATCH >= 2 lots, RECOMMEND >= 3 or lost value >= 10,000 THB; reduction plan only when order history exists (>= 2 `incoming_order`).

## Endpoints

| Endpoint | Roles | Notes |
|---|---|---|
| GET `/near-expiry` (F2a-001) | PH, HA, WH (read) | own hospital; status groups review / released / kept / done, `q`, cursor; computed `fefoUsable`, `releasable`, repeat flag, history |
| POST `/near-expiry/{id}/release` (-002) | PH | Idempotency-Key; `{qty, version}`; qty <= free lot qty (BR-F2a-022); verified mapping, not blood / controlled, not expired; holds the quantity, pool entry (reused after a withdrawal), item RELEASED_TO_POOL; no plan is created |
| POST `/{id}/keep` (-003) | PH | reason >= 3, `reviewDays` (default 30) -> KEPT, comes back to DETECTED when the review date passes |
| POST `/{id}/dismiss` (-004), `/withdraw` (-005) | PH | withdraw only without an active plan (409 PLAN_ACTIVE), releases the hold |
| GET `/pool` (-006) | PH, HA, WH, SA | region wide; origin hospital, drug, qty, expiry, price; never the origin's stock level (BR-F2a-030); expired lots hidden |
| GET `/allocation-plans`, `/{id}` (-007/-008) | PH, HA, WH, SA | only plans the hospital is involved in; lines, F-23 numbers, approvals, options |
| POST `/{id}/decision` (-009) | PH | Idempotency-Key; `version` required; reject needs a comment -> NEEDS_DISCUSSION; all approved -> transport tasks per line (`ALLOCATION_LINE`) and lot ALLOCATED; uneconomical plans need an option first (409 OPTION_REQUIRED) |
| POST `/{id}/option` (-010) | PH of the origin | schema codes: MERGE_SHIPMENTS / RAISE_VALUE (continue), DONATE_OR_DISCARD (cancel, lot DISMISSED, hold released, write-off value), HOLD (cancel, quantity back in the pool). The UI mock's return/adjust/destroy/accept labels do not exist in the schema CHECK |
| POST `/{id}/cancel` (-011) | PH | before approval: any involved hospital; after approval (tasks all WAITING_DISPATCH): first call = request (`CANCEL_REQUESTED`), a second involved hospital with the origin among the two = consent -> tasks CANCELLED, quantity back to the pool |
| GET `/repeat-expiry`, POST `/{id}/dismiss` (-015/-016) | PH | dismiss hides 90 days; recompute does not resurrect |
| GET `/value`, GET `/reports/{id}` (XC-006, AD-005) | PH, HA, SA | `value_record` totals + completed-plan transport cost; reports `expiry_waste`, `borrow_activity`, `stock_overview` |
| POST `/jobs/near-expiry` | SA | JOB-05 scan + plan timeouts + JOB-07; the server also runs it every 15 min |

Scan (JOB-05) details: new DETECTED items per lot (free qty, value = qty x price), KEPT items return if the lot is still usable, expired lots with stock write `EXPIRED_WRITEOFF_THB` once per lot (BR-F2a-024), released lots that expired without an active plan are closed (DISMISSED, hold released), plans waiting for approval on an expired lot are CANCELLED, plans past `approval_deadline` -> NEEDS_DISCUSSION.
Transport receipt of an allocation line: when every line arrived the plan is COMPLETED, the lot TRANSFERRED (or back to RELEASED_TO_POOL when a remainder is left) and `F2_TRANSFER_THB` is recorded.

## Existing files changed (10, all small)

`app.ts` (routers), `index.ts` (15 min timer), `core/transportTask.ts` (+`defaultCarrier`, now also used by `borrow/lender.service.ts`), `transport.workflow.ts` (+`settleAllocationLine` on RECEIVED), frontend `NearExpiryDrawer`, `nearExpiry.ts`, `pool.ts` (extra statuses / optional live fields), `NearExpiryPage`, `WhExpiryPage`, `ReportsPage` (wrapper: live unless `?mock=1`), `PoolAllocationPage`, `AllocationDrawer`.

## Frontend wired

- UI-07 near-expiry (list, KPIs from the data + `/value`, release / keep / dismiss / withdraw with reasons); UI-08/09 pool and plans (approve, reject with comment, option, cancel; finished plans hidden behind a toggle); WH near-expiry page (4 tabs) on the same hooks; UI-19 reports live (`LiveReports`: value, borrowing, expiry waste, repeat-expiry flags; forecast accuracy tab says there is no data yet).
- The "sample data" note was removed for expiry, pool and reports pages.

## Tests (scratch, outside the repo, on a `doorare_test` copy)

- `step6-test.mts`: 132 checks. The test plays the Agent: it proposes the spec's greedy split computed independently of the backend and the code validates it. Covers scan thresholds / blood / expired, list scope, FEFO numbers, keep / dismiss / re-evaluation, release errors and a parallel double release, plan lines and costs against an independent F-22 / F-23 computation, approvals incl. reject and re-approve, transport load -> receive (stock out at LOADED, receiver lot, plan COMPLETED, value record, ledger), timeouts, uneconomical options, mutual-consent cancel, withdraw, auto-approve, repeat flags, value / reports totals vs SQL, proposal validation (caps, infeasible receivers).
- Regression on fresh copies: step3 55, step4 55, step5 93 (alone) + 5b 10, transport 40, returns 26, documents 26; `npm test` 20/20. (Step 5 gives ESCALATED when it runs after step 3/4 on the same DB: existing ordering effect.)
- Browser: near-expiry screen on a DB copy (list, drawer, keep persisted), pool/plans page.

## Caveats

- Running the scan on the MAIN seed DB changes seed history (closes released lots that expired, cancels waiting plans on expired lots, writes write-off records). Use a copy for demos or accept it.
- No plans exist until the Agent proposes some (seed shows only history); the approval / option / cancel UI is verified through the API tests and a seed plan view, not through a live proposal.
- Option labels of the UI mock were replaced by the four schema options.
- Not done: PDF/CSV buttons, merge-shipment suggestion in the drawer, plan editing (BR-F2a-029), kit / blood lots.
