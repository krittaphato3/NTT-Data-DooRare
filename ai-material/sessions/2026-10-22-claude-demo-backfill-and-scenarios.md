---
title: Demo data - backfill 1-21 Oct, role scenarios for pharmacist / ER / warehouse / driver, snapshot and restore
date: 2026-10-22
author: alongkorn
ai: claude
tags: session, demo, mock-data, backfill, scenarios, snapshot, reset, detailed
summary: backfill + shape run inside db:load, db:scenarios for API scenarios (snapshot idea dropped); SQL backfill to 21 Oct, shaping of low stock, near-expiry and kits, API-driven scenarios per role; pharmacist header date fixed
---

> Detailed on purpose (user asked for detailed notes).

## Goal

- Mock history stopped at 30 Sep 2026. Extend it to today (22 Oct) and, for 19-22 Oct, leave unfinished work for the demo roles (pharmacist, ER, warehouse, driver) so the web can start from a usable state. A reset must bring the original data back. One database only (sample data is removable, not a shipped second DB).
- Branch `feature/demo-backfill-and-scenarios` from `feature/backend-api`. Not pushed, not merged.

## Done

- `scripts/db.sh` + npm scripts: `db:snapshot` (CREATE DATABASE doorare_baseline TEMPLATE doorare, kills other connections), `db:restore` (drop doorare, recreate from baseline), `db:demo` (restore, 01, 02, scenarios; needs backend on :3001 and a snapshot). The pool in `backend/src/db/client.ts` has an error handler, so restoring while the backend runs is fine; in-memory sessions survive (same user ids).
- `db/demo/01-backfill.sql` (plpgsql, ~1 min): per day 1-21 Oct and per active hospital drug: usage = recent 28-day average x jitter (deterministic hash) x weekday/weekend factor, FEFO decrements from unexpired free lots (ledger ISSUE_USAGE, ref_type DEMO_DAILY), receipts of due incoming orders (the 36 left OPEN on 30 Sep get dates 1-4 Oct), reorders when stock + open orders < 14 days (30 days of use, lead time), EXPIRED_WRITEOFF until 18 Oct, daily stock_snapshot. Result: 4011 usage rows, 67 new lots `DEMO-R*`, ~19 open orders. Refuses to run twice (guard on usage_daily after 30 Sep).
- `db/demo/02-shape.sql`: usage spike on 20-21 Oct (ledger ref_type `DEMO_SPIKE`) leaving V/E drugs low (HA 2 at 3% and 3 at 12%, HB 2, HC 1; excludes drugs that already have an open borrow request, blood, cold chain, controlled); HA loose components of kits TRAUMA_RESUS / INTUBATION / CHEST_TUBE cut to 3% (so the bus-crash plan must borrow sets) and HA ready kit sets lowered; near-expiry lots `DEMO-NE-{HA1..5,HB1..3,HC1..2}` (18/33/47/62/85 d etc., qty = 2.2 x usage until expiry so part is releasable, chosen where other hospitals are short); expired lots `DEMO-EXP-HA1/2`.
- `backend/scripts/demo-scenarios.ts` (tsx, not in the tsc build): logs in as each role and calls the real API; steps are independent (`step()` logs ok / warns). Forecast run, expiry scan; HA requests (very urgent delivered and ARRIVED, lender accepted and waiting, lender asked and pending, lender rejected, proposal waiting for approval, draft); HB / HC requests to HA lender (loaded / in transit / waiting to load / pending in HA lender queue); two completed HA receipts made overdue by SQL (return_obligation due 3 / 8 days ago, status OVERDUE); near-expiry: HA1 released + Agent plan waiting approval (auto_approve toggled to false only while the plan is created, restored in `finally`), HA2 released and waiting for the Agent, HA3 kept (reason required), HB1 released and Agent plan auto-approved -> TRANSPORTING; ER: incident 1 bus crash (plan, approve, emergency-borrow, one lender WH confirms), incident 2 chemical leak (plan waiting approval).
- The "Agent" is played by inserting an `agent_run` (F2_AGENT) and calling `createPlanFromAgentProposal` (code validates the split). Nothing in matching is built in the product.
- `db/demo/README.md`: commands, what each step does, accounts, what waits for whom.
- Frontend: `PageHeader.tsx` (pharmacist dashboard) showed a hard-coded "13 ต.ค. 2569 19:11"; now the real date/time (th-TH).

## Result on the main DB (verified with SQL after `npm run db:demo`)

- Pharmacist HA: 4 near-expiry DETECTED, 1 plan waiting approval, 1 pool item for the Agent (+ older pool rows), 2 requests PENDING_APPROVAL/DRAFT, 3 lender legs to answer, 3 overdue returns, many LOW_STOCK alerts (5 very urgent).
- Warehouse HA: 2 to load, 2 ARRIVED to receive, 5 kit pack tasks. Driver HA: 3 LOADED / IN_TRANSIT. ER HA: 2 running incidents.
- Dashboard of HA pharmacist checked in the browser (at-risk 40, pending approvals 1, in transit 4, near-expiry lots). Individual pages not walked through again.

## Decisions / gotchas

- Scenario records are created by the API at run time, so they are dated 22 Oct (not backdated to 19-21 Oct); the backfilled consumption/receipts cover 1-21 Oct. Backdating would fight timers and holds.
- Open borrow requests of the seed (BR-2026-000575..578, BR-2016-*, BR-2022-*) block new requests for the same drug (409) - hence the exclusions in shape/scenario queries.
- Controlled / cold-chain / blood drugs cannot go through the automatic borrow flow (422) - excluded when picking alerts and manual drugs.
- Ladder edit rules: parallel legs only for VERY_URGENT; sum of legs <= qty needed; PATCH legs `{hospitalId, qty}`.
- Emergency borrowing only creates lines when kit packing from components cannot cover the plan (`shortfall` empty otherwise).
- `db:reset` drops the volume and therefore the snapshot; run `db:snapshot` again afterwards. Do not snapshot after a demo run.
- Test method: copy DB (`doorare_test` from doorare), backend on :3002, `rerun-demo.sh` in the scratchpad (not in repo); dropped afterwards.

## Not done / next

- Forecast artifacts still end ~21 Sep; alerts severity comes from them. Retraining / a 3-day forecast timer needs the model owner's way to run it.
- Pages of the other roles (ER, WH, driver) not clicked through after the demo run; no automated test for the demo scripts.
- Agent integration (F1b messages, F2 plan proposal endpoint), cancel-after-approval of borrow requests.

## Update (same day): snapshot dropped

- User wanted the extended data as THE main data, no snapshot/restore. `scripts/db.sh`: `load` now runs 01-backfill + 02-shape after the CSV; `db:scenarios` runs the API scenarios (needs backend; refuses twice). Commands `db:snapshot`, `db:restore`, `db:demo` removed; the `doorare_baseline` database was dropped.
- Fixes found by re-running: alerts the rules refuse (NO_NEED) or with no lender are skipped (next alert tried); Agent plan tries HA2 / HA4 / HA5 (HA1 has no forecast at receivers, so it is the lot left waiting for the Agent); close of old PARTIALLY_FULFILLED / ESCALATED requests (before 15 Oct) in 02-shape.
- Also fixed the hard-coded "13 Oct 19:11" in the warehouse header (`WhPageHeader.tsx`).
- Mistake worth remembering: a test command built from a zsh variable failed and the full `db:demo` ran on the main DB instead of a dry check; no harm because it was restorable, but test destructive commands on a copy.

## Update: alert timer (branch feature/alert-reevaluate-timer)

- `reevaluateAlerts()` in `backend/src/modules/forecasts/forecasts.runs.ts`: every 6 hours (timer in `index.ts`) re-evaluates stock alerts against the CURRENT stock with the latest loaded forecast per granularity; loads/retrains nothing. Tested on a DB copy (WEEK 178 evaluated / 27 updated, MONTH 163 / 96 updated + 1 opened).
- Agreed cadence: forecast every ~3 days (still blocked: no way to run the model from the backend, needs the model owner's command), alert check every 6 h (done), expiry scan every 15 min (existing).
