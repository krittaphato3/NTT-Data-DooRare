---
title: Backend step 7 - F3 incidents, emergency plan, urgent borrowing, kit packing, reconciliation, ER / WH / PH screens
date: 2026-10-22
author: alongkorn
ai: claude
tags: session, backend, f3, incident, emergency, kits, borrowing, reconciliation, frontend, er, warehouse, detailed
summary: Incident intake with F-26 ETA, rule-based plan (F-27), approval, simultaneous lender requests with first-wins, kit pack / stock / return, close with two signatures; ER, WH and PH screens on the API; 410 backend checks pass
---

> Detailed on purpose (user asked for detailed notes).

## Goal / branch

- Step 7 of the solo plan (F3). Branch `feature/backend-step7-f3-incidents-kits`, created from `feature/backend-api` (bd3bb00). **Not committed, not pushed, not merged** (user pushes step by step on request).
- The Agent is not connected (same as steps 5 and 6): the plan is the rule baseline (`kit_recipe` + `incident_extra_rule`), recorded as `agent_run` RULES / ASSESS / SKIPPED, plan source `RULE_FALLBACK`. No LLM, no route service.

## Decisions worth remembering

- **Roles: union of the two sources.** 07-api.md says plan approve = PHARMACIST + HOSPITAL_ADMIN, send urgent borrow = PHARMACIST, lender confirm = WH + PH, kit-task confirm = WH. The permission matrix (spec §5.2, A8, FR-F3-009) and the UI RBAC (`approveIncidentPlan` = ER_STAFF, `manageIncident` = ER + WH "sends the urgent borrow, packs a kit", `confirmLend` = PH + ER) give ER those actions and the ER screens are built on it. Each route allows the union: approve ER+PH+HA, send ER+PH, lender confirm WH+PH+ER, kit-task list PH+WH+ER and confirm WH+ER, reconciliation PH+HA+ER, incident read ER+PH+HA+WH (WH for the kit page, read only). The close needs one ER and one pharmacist signature either way. Comment block in `incidents.routes.ts`.
- **ETA (F-26):** no route service exists. `resolveEta` uses the reported ETA (`unsure` + route -> min, route never available) and never invents a number: no ETA -> `eta_source UNAVAILABLE`, flag `ETA_UNAVAILABLE`, notification to ER + PH ("use radio"), audit row. `unsure` with a reported ETA -> `ROUTE_UNAVAILABLE` flag. `reportedEtaMin` on create is minutes from now; PATCH counts stores it as minutes after the report (`elapsed + value`) so the arrival time stays fixed. Seed incidents have only `reported_eta_min` (`eta_minutes` null), `etaView` derives it.
- **Lender transit time** (needed for `Ttransit <= ETA`) comes from `hospital_distance.travel_minutes` (override first). That matrix is mock (`MOCK_HAVERSINE_x1.35`) and the spec forbids a speed-table in F3; it is the only source in this deployment, shown to staff as "from the network distance table". Honest gap.
- **Class of a kit line** = CRITICAL when it counts in the Critical Minimum (`crit > 0`), stored in step-1 `classes`; extras use `drug_master.emergency_class`. Timeouts F-28: 3 / 5 min, capped by ETA remaining (floor, min 1), fixed class time while ETA unavailable.
- **Critical Minimum** uses the `kit_recipe.is_critical_min` flag (all RED rows in the seed) instead of the literal "RED only".
- **Usage records stock?** Drug usage is a record only (hospital stock comes from HIS usage). Kit usage does move `kit_stock` (DooRare owns it): consumes the reservation first, correcting 5 -> 3 puts 2 back as free sets.
- **Close = two signatures:** ACTIVE -> CLOSE_REQUESTED by ER or PH (waiting legs cancelled), CLOSE_REQUESTED -> RECONCILED by the other role (same role or same user -> 409 NEEDS_OTHER_ROLE). The requester's role is read from `audit_log` (`INCIDENT_CLOSE_REQUESTED`). `mode: CANCEL` + reason for a false alarm (OPEN / PLAN_REVIEW / ACTIVE).
- **No document generation** for INCIDENT_REPORT / UCEP_REPORT (documents service supports 3 kinds); the screens show the reconciliation tables and the print buttons are disabled with a hint.

## Pure functions (`core/formulas/emergency.ts`, 17 unit tests, spec examples)

- F-26 `resolveEta`, `etaRemainingMin`; F-28 `emergencyTimeoutMin`; F-27 `needs` (est / crit, fractions accumulate then `ceilSafe`, black / unknown never produce lines), `planKits` (ready -> pack complete sets only, critical kits first for shared components -> borrow whole sets; extras use leftover loose stock; `packOverrides` may only lower, rejected otherwise), `spread` (one-pass check, items inside ready sets count as available), `chooseLenders` (in time nearest first up to `emergency.max_parallel` = 5, none in time -> only the fastest flagged `FASTEST_LATE`, ETA unknown -> nearest 3).
- Spec examples hold: bus crash Trauma 35/5, IV 15/5, Intubation 3/3; intubation Est 8, ready 4, loose stylet 3 -> use 4, pack 3, borrow 1 set.

## Stored plan shape (table `emergency_plan`)

- `estimated_need` / `critical_min` / `buffer` = `{kits: {KIT_CODE: n}, extras: {drugMasterId: n}}`. `steps` = array of `{step, kind, action, ...}` like the seed plans plus `kind` (CHECK with counts, edits, ready / loose snapshots, classes, noRecipe, cappedBlood; USE_READY; PACK with packMax; BORROW_SET; BORROW_ITEM with useLoose; NOTE). `shortfall` = `{items: [{item, need, available, shortage}]}`.
- **Seed plans (66 incidents) use a different shape** (extras keyed by codes `ORS`, `ATROPINE_06`...; steps without `kind`; flat zero shortfall). `buildPlanView` reads both (`legacy: true`, names through an alias table). Seed plans cannot be sent (`LEGACY_PLAN`). Seed borrow requests are one DRUG item per request, no ladder, legs RECEIVED / CANCELLED; seed `incident_usage` has fractional kit quantities.
- PRC group O is in `incident_extra_rule`: kept only for hospitals with `has_blood_bank` and `emergency.blood.enabled`, capped at `prc_o_max_units` (6), flagged `capped`; other blood products are reminders (BR-F3-032). Components include fractional per-kit amounts (gloves 0.05 / 0.1): `floorUnits` tolerates float noise.
- Revisions: every calculation is a new revision, unapproved ones become CANCELLED; edits (`packOverrides`, `removeKits`, `removeExtras`, `setKits`, `setExtras`) are kept from the last live revision unless `edits: {}`. `preview: true` computes without storing (used while staff adjust lines).

## Kit stock model (`core/kitStock.ts`, only writer of `kit_stock`)

- `qty_ready`, `qty_held` (reserved). Approve reserves the plan's use-ready sets; packing confirm adds ready sets and reserves them for the incident; lending: confirm reserves, LOADED removes (reservation consumed first); RECEIVED adds to the borrower; usage removes; close releases everything (`incidentHolds` = approved plan's use-ready + sets packed since).
- No kit ledger table: every move writes an audit row (`KIT_STOCK_LEND_OUT`, `KIT_STOCK_BORROW_IN`, `KIT_STOCK_RETURN`, `KIT_STOCK_SET`, `KIT_PACKED`).
- `transport.workflow.ts`: kit legs (item kind KIT) move kit_stock at LOADED / RECEIVED (the file already skipped lots for kit legs); received quantity checked against the confirmed one.
- Kit returns added to `POST /return-obligations/{id}/return` (whole sets debtor -> creditor, integer only); blood (`BLOOD_REPLACEMENT`) is still not supported there. Also fixed: obligation list showed an empty name for kits (`COALESCE` of an empty string).

## Emergency borrowing (`incidents/emergency.borrow.ts`)

- One `borrow_request` per borrow line (context EMERGENCY, VERY_URGENT, `ladder` NULL so F1b `advanceRequest` leaves it alone, one item KIT or DRUG). Sent legs all at once to eligible hospitals (same region, active, enough free kit sets / unexpired lots, PRC O needs `has_blood_bank` and shelf life). Staff can switch hospitals off per line (`lenderPlan`) or globally (`lenderHospitalIds`).
- First confirmation wins: request row locked, remaining = requested - confirmed; the other waiting legs are trimmed to the missing quantity or CANCELLED `FIRST_CONFIRMED` (lender notified); `TAKEN_BY_OTHER` for the loser. Partial / reject / timeout with nobody waiting -> next round to farther hospitals (`expandRequest`), no hospital in time -> fastest flagged late (alert once), nobody left -> request `ESCALATED` + alert once (`notification` dedupe by kind + ref). `processEmergencyTimers` runs after `processLegTimers` every minute and in `POST /jobs/borrow-timers`; it only acts while the incident is ACTIVE.
- Re-sending after the plan changes asks only the difference: bigger need raises the request and asks the delta, smaller need trims waiting legs (confirmed quantity kept, flagged), a line that left the plan is reduced to what is confirmed. Calling send twice changes nothing. ESCALATED requests do not count as covering a need.
- Lender confirm: kit -> `holdKits`; item -> FEFO lots (not expired, PRC O >= `prc_o_min_remaining_days`), no own-target guardrail (the F1 F-14 guardrail is not applied in an emergency), transport task via `createTransportTask` with the lender's default carrier, `lateForEta` recorded in `borrow_leg.score_parts`.

## Endpoints (all under /api/v1)

| Endpoint | Roles | Notes |
|---|---|---|
| POST `/incidents` (F3-001) | ER, PH | Idempotency-Key; type, counts per triage level, ETA; duplicate (same hospital, <= 10 min, <= 500 m by coordinates, or same text without coordinates) -> 409 `DUPLICATE_SUSPECTED` with candidates, `acknowledgeDuplicate` + `duplicateOf` to go on |
| GET `/incidents`, `/{id}` (-002/-003) | ER, PH, HA, WH | list groups active / closed / cancelled, borrow summary per incident; detail has plan, plan history, borrow lines with legs, pack tasks, usage, history from audit, warnings |
| PATCH `/incidents/{id}/counts` (-004) | ER | counts and / or ETA, `version`, note; live plan -> new revision waiting for approval |
| POST `/incidents/{id}/plan` (-005) | ER, PH | `{edits?, preview?}` |
| POST `/incidents/{id}/plan/approve` (-006) | ER, PH, HA | `{planId}`; reserves sets, creates pack tasks; stale revision -> 409 `STALE_PLAN` |
| GET `/incidents/{id}/emergency-borrow/preview` | ER, PH | lines, lenders with transit, in-time flag, ask quantity, chosen, timeout, warnings |
| POST `/incidents/{id}/emergency-borrow` (-007) | ER, PH | sends / re-syncs; `lenderPlan` per line |
| GET `/emergency-legs`, POST `/emergency-legs/{legId}/confirm` (-008) | WH, PH, ER (+HA read) | lender inbox (groups pending / confirmed / done / declined); CONFIRM / PARTIAL / REJECT |
| GET `/kit-tasks`, POST `/kit-tasks/{id}/confirm` (-009/-010) | list WH, PH, ER; confirm WH, ER | component check, FEFO KIT_PACK ledger rows, `INSUFFICIENT_COMPONENTS` |
| POST `/incidents/{id}/usage` (-011) | ER, PH | set semantics per item, 0 removes |
| POST `/incidents/{id}/close` (-012) | ER, PH | REQUEST / APPROVE / CANCEL |
| GET `/incidents/{id}/reconciliation` (-013) | PH, HA, ER | borrowed per lender, obligations, unused borrowed, usage with value |
| GET / PUT `/kit-stock` (-014/-015) | read PH, WH, ER; PUT WH | count may not go below the reserved sets |
| GET `/kit-types` (-016) | all | existed |
| GET / PUT `/preset-kits`, `/incident-rules` | read all F3 roles; PUT SYSTEM_ADMIN | not in openapi, no screen uses them yet |

## Existing files changed

`app.ts` (routers), `index.ts` and `borrow.routes.ts` (emergency timers), `borrow.service.ts` (`nextRequestNo` exported), `transport.workflow.ts` (kit legs), `returns.service.ts` (kit returns, kit names). Frontend: `apiFetch.ts` (errors carry `code` and `details`), `returnsApi.ts`, `App.tsx` (removed the sample-data note for ER / incident / kit pages), `ErPageSwitch`, `IncidentConsolePage`, `KitPage`, `WhKitStockPanel`, `IncidentTabs` (live badges), `StockCheckStep` (wording props).

## Frontend (live unless `?mock=1`)

- `services/incidentApi.ts`; `roles/er/live/` (hooks with polling, `PlanTables`, `IntakeForm`, `LiveIncidentFlow` 5 steps with preview and per-lender switches, `LiveBorrowConfirm`, `LiveIncidentList` / `Detail` (update form, cancel), `LiveTrackPage` (borrow / pack / requests from other hospitals), `LiveInbox` (lender cards with countdown, confirm / partial / reject), `LivePack`, `LiveSummary` (usage, return status, two-signature close), `LiveDashboard`, `LiveConsole` for PH / HA); `roles/warehouse/pages/LiveKitPage.tsx` (urgent requests, pack tasks, kit count editor, incidents, returns). The old mock pages stay for demo mode.
- Checked in the browser on a DB copy: ER intake -> plan preview (pack stepper) -> approve -> stock check -> borrow preview -> send -> track (countdowns) -> pack confirm; WH lender confirm; PH console tabs; ER summary page; seed incidents (legacy plans) open.

## Tests (scratch, outside the repo: `.../f64189fc-.../scratchpad/step7-test.mts`, `rerun7.sh`, `regress7.sh`, DB copy made with pg_dump because the main backend keeps connections open)

- `step7-test.mts`: 410 checks. Independent F-27 computation from the DB rules (not imported) compared with every plan; intake / ETA / duplicates; scope per role (401 / 403 / 404); preview vs stored; approval (stale, twice, reservations, pack tasks); packing (component short, ledger sums, double confirm, concurrent confirm); stock count; send (legs, timeouts 3 / 5 min, trimming, simultaneous confirmations, partial, reject, timeout -> expansion -> fastest late, escalation once, NO_LENDER, cancel); transport (kit and lot stock, obligations); counts up / down with delta-only requests; usage; two-signature close; reconciliation vs SQL; rules tables; kit return; 25 seed incidents read; close pending does not ask more hospitals.
- Real bugs the tests found and I fixed: re-send cancelled kit requests (line key was kit code vs id), `ceilSafe(0)` gave -0, timers expanded while the close was pending, kit lines showed the drug default class, kit names empty in the returns list.
- Regression on fresh copies: step3 55, step4 55, step5 93 (alone), step5b 10, transport 40, returns 26, documents 26, step6 132; `npm test` 37 (17 new). Backend and frontend builds pass.

## After first review (user feedback)

- Flow page without `?incident=` resumes the newest unfinished incident (OPEN / PLAN_REVIEW / a pending plan revision); `?new=1` starts a new one (all "+ แจ้งเหตุใหม่" links). Step 1 stays editable after the incident exists: PATCH `/incidents/{id}/counts` now also takes `incidentType`, `description`, `locationText` (audited, no plan impact); counts / ETA changes still open a new revision. Incident list: the opened detail is shown above the table (it used to render below a long table and looked like nothing opened).
- Growing a request that still has waiting legs now notifies those lenders (`EMERGENCY_LEG_INCREASED`). Extra quantity is asked from hospitals not asked yet (a lender that already confirmed is not asked again for the delta); step 3 shows plan totals while step 4 shows only the missing part ("ส่งไปแล้ว n") - both known rough edges.
- Plan lines are rules, not Agent: every kit / extra of the rule tables is proposed for every incident type (schema has no per-type rules), staff remove lines; Agent integration would post its choice to a function like `createPlanFromAgentProposal`.

## Caveats / not done

- Not done: INCIDENT_REPORT / UCEP_REPORT documents; the WH work-inbox page (`?page=inbox`, F1 / F2 / F3 mixed mock) still on sample data (banner kept); blood (`BLOOD_REPLACEMENT`) returns; UI to add arbitrary extra drugs to a plan (API `setExtras` accepts any drug id); coordinates / duplicate radius in the intake form (text match only); route service ETA; Agent assessment and Agent-chosen kits per incident type (`incident_kit_rule` by type does not exist in the schema, all kits of the rules are proposed and staff remove lines); plan editing after legs were sent beyond the delta rule; kit-lot level for blood kits.
- Holds of a lender's ready sets are not attributed per incident (aggregate `qty_held`): a lender with its own running incident could have its reservation consumed by a shipment.
- Running the job endpoints on the MAIN DB still changes seed history; use a copy for demos.
- Sessions are in memory: restart of the backend needs a new login.
