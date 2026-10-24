# Pharmacist Near-expiry + Pool: 3-step pipeline UI

## Goal
- Feedback #4: /expiry and /pool overlap; FEFO formula hard to read; NEEDS_DISCUSSION lost in table. Keep two pages, make the hand-over clear.

## Done
- New `components/ExpiryPipelineStepper.tsx` + `pipeline.css`: 1 ตรวจคลังเรา -> 2 คลังกลางเขต 6 -> 3 แผนจัดสรร, with open counts; on /pool the steps switch tabs, on /expiry they link (`?page=pool&tab=pool|plans`). Pool page reads `?tab=`.
- `NearExpiryPage`: last column is a green/blue split bar (keep X | release Y) + one primary button "ปล่อย Y เข้าคลังกลาง" (confirm() then same decide/decideLive path, rbac `releaseNearExpiry`); lots with release 0 show "ใช้ทันหมด"; link opens drawer for keep/dismiss. Uses `usePoolAndPlans` for stepper counts.
- `NearExpiryDrawer`: FEFO formula folded into `<details>` "ดูวิธีคำนวณ"; split bar + plain sentence shown instead.
- `PoolAllocationPage`: orange alert card (`data-part=discussion-alert`) listing NEEDS_DISCUSSION plans with rejecting hospitals + comment and button "ดูแผนและปรับยอดจัดสรร"; "สร้างแผนเอง" demoted to a text link under the single primary "ให้ Agent จัดสรร".

## Follow-up (same session)
- Expiry rows: editable "จำนวนที่จะปล่อย" (0..FEFO max, default = suggestion) with live green/blue bar; buttons: primary "ปล่อย N เข้าคลังกลาง" (confirm; remainder stays kept) + secondary "เก็บไว้ใช้เองทั้งล็อต" (asks a reason; live API needs 3+ chars). Lots where FEFO uses everything: primary "ยืนยันเก็บไว้ใช้เอง" (auto reason). Cap = FEFO max (drawer behaves the same); not verified that the backend would accept more.
- Pool: every own-hospital lot has a checkbox (all pre-selected); one primary button "ให้ Agent จัดสรร N ล็อต" runs `sendPoolToAgent` per lot sequentially (agent builds one plan per pool lot, no backend change), then shows a result card (`data-part=agent-batch-result`) and switches to the plans tab. "สร้างแผนเอง" stays a per-row link.
- Backend fact (matching.ts `demandCandidates`): receivers = active hospitals of the same region with `agent_participation`, a distance row, a verified drug mapping and a forecast with usage > 0. They do NOT need to have released anything to the pool. Pool = supply side only.
- Verified in browser: bulk bar, 2/2 pre-selected, untick -> "1 ล็อต". NOT clicked: agent button (creates real plans, calls LLM) and release/keep (changes real stock). Editable qty input untested on live data (no pending lot with release > 0 left).

## Allocation round (backend + frontend, no schema change)
- Decision (user): any pharmacist may trigger the agent for any pool lot in their region; one click = a round over all open pool lots. Demo: no scheduler needed, manual buttons.
- Backend: `allocation.agent.ts` `agentPlan` no longer requires `pool.origin_id === user.hospitalId` (region check stays; plan still needs origin + every receiver to approve). `matching.ts` new `plannedInbound()` adds qty of other open plans (not received/cancelled) for the same drug to a receiver's `incoming`, so lots allocated one after another never fill the same shortfall twice (also affects per-lot candidates). New `POST /near-expiry/scan` (PHARMACIST, HOSPITAL_ADMIN) runs `runExpiryJobs()` (same as the timer / SYSTEM_ADMIN trigger). `createManual` still owner-only.
- Frontend: pool toolbar button "ให้ Agent จัดสรรรอบนี้ N ล็อต" over every HELD lot (any hospital), run sequentially soonest-expiry first; expiry page button "ตรวจล็อตใกล้หมดอายุตอนนี้" (`scanNearExpiryNow`).
- Verified: backend `tsc` build ok; unit tests 141 pass / 82 fail, all failures = DB connection (`no pg_hba.conf entry` from this shell), allocation agent unit tests pass; Docker backend+frontend rebuilt; browser: scan button returns "พบล็อตใหม่ 0", pool bar shows 2 lots (others already in plans).
- NOT run: the agent round itself (creates real plans, calls the LLM); cross-hospital lot case (no other-hospital open lot in data); `plannedInbound` SQL only compiled, not exercised on live data beyond the existing candidate list.
- Backend restart invalidates browser sessions (login again).

- Pool list split: "คลังกลาง · รอจับคู่" (allocatable lots, checkboxes, round button) vs a collapsed "จับคู่แล้ว · อยู่ในแผน" group (no checkbox, links to plan, remainder note). Tab/stepper counts = waiting lots. Verified: 2 waiting, 3 matched (AP-2026-00083..85), button "ให้ Agent จัดสรรรอบนี้ 2 ล็อต". Docker frontend rebuilt.
- Demo data gap: near-expiry "รอตัดสินใจ" = 0 right now, so release->round->approve cannot be shown without new near-expiry lots (not seeded; DB data untouched).

- Copilot alignment: `pharmacist.tools.ts` SEND_POOL_TO_AGENT no longer requires the lot's owner hospital; it checks the pool entry exists and is in the caller's region (error "belongs to another region"). `tests/ai.f2.proposals.test.ts` updated (same-region hospital allowed, other region denied); test needs the DB so it was typechecked only, not run. Backend rebuilt.

- Plan tabs on /pool: "แผนรอเห็นชอบ" (needs a decision; empty state "พร้อมสำหรับรอบจัดสรรถัดไป") | "อนุมัติแล้ว · ขนส่ง" (APPROVED, AUTO_APPROVED, TRANSPORTING) | "จบแล้ว" (COMPLETED, CANCELLED; replaces the "show finished" toggle). `?tab=pool|plans|approved|history`. Verified: 0 / 3 / 29 rows. Docker frontend rebuilt.

- Round with no receiver: user ran the round, both lots failed 422 NO_CANDIDATE (no hospital in the region has a mapped listing + forecast usage that can use the lot before expiry; no plan created, nothing to cancel). Now the pool page pre-checks `getPoolCandidates` per waiting lot: lots with no receiver get badge "ไม่มีผู้รับที่ใช้ทัน", are excluded from the selection/round (no agent call), and the result card shows them as "ข้าม" (amber) instead of an error. Withdraw back to own use stays on the expiry page (tab ปล่อยแล้ว -> drawer, owner only; no button added on /pool because pool lot has no near-expiry item id). Verified in browser: 2 lots flagged, round button hidden; Docker rebuilt.

- No-receiver lots no longer sit stuck: `GET /pool` now also returns `itemId` (near-expiry item; backend only, no schema change) and the pool row of a no-receiver lot owned by the viewer's hospital has "ถอนกลับมาใช้เอง" (prompt for reason -> `withdrawNearExpiry`; the lot returns to DETECTED on the expiry page). Other hospitals' lots show "เจ้าของล็อตถอนกลับได้". Verified buttons render for both lots; NOT clicked (would withdraw real lots). Backend + frontend rebuilt.

- Agent autonomy (middle path, user approved): `allocation.agent.ts` G-03 changed from "qty must equal max_qty" to "whole number > 0, <= that receiver's max_qty (F-22 cap), and the sum <= pool qty_available" (`validateAllocationProposal(..., poolQty)`); the system prompt now lets the LLM choose receivers and quantities (days of stock/deficit first, transport cost vs value, spread over hospitals, may leave a remainder). Code still re-validates in `createPlanFromAgentProposal` (caps each line by F-22 and the pool) and F-23 cost check; fallback to the F-22 greedy split unchanged. Note: Si score belongs to F1 borrow ranking, F2 uses F-22 / F-23. `tests/allocation.agent.test.ts` updated (6/6 pass, no DB). Not run against a real LLM.

- Native browser prompt/confirm/alert removed from /pool and /expiry: withdraw, keep-whole-lot use `ReasonDialog` (added optional `defaultReason` + `minLength` props, backward compatible), release uses new `components/ConfirmDialog.tsx` (shows released vs kept quantity). Verified the withdraw dialog in browser (prefilled reason, cancel closes); not confirmed (would withdraw a real lot). Docker frontend rebuilt.

## Decisions
- Did NOT merge /expiry and /pool: own-hospital step vs regional steps have different audiences. No route change, no backend change.
- No "open 3-hospital chat room" button: nothing in backend supports it.

## Verified
- tsc clean; browser: stepper counts 3/4/0, split bar widths 109/131 px, drawer formula collapsed, pool stepper click switches tab.
- NOT verified: discussion alert (no NEEDS_DISCUSSION plan in live data; only typechecked), release button click (would hold real stock).

## Next
- Group sidebar headers (feedback #5), Copilot order sheet (#6), Hub drawer simplification (hide Si).
- Not committed; Docker frontend rebuilt.
