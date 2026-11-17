---
title: Borrow approve fails with LADDER_STALE - removed the emergency-fallback lendable rule
date: 2026-11-17
author: Alongkorn
ai: CLAUDE
tags: session, backend, borrow, f1b, bug, ladder, approve
summary: Plan proposed lenders below their keep-level; approve rejected it. Fallback block removed.
---

## Goal

- Pharmacist could not press "อนุมัติและส่ง" on BR-2026-000576 (red text: "สต็อกของ HB เปลี่ยนไปแล้ว กรุณาเสนอแผนใหม่", 409 `LADDER_STALE`). Find why and fix it.

## Done

- Root cause: propose and approve used two different "lendable" formulas.
  - `buildLadder` (`borrow.ladder.ts`) had an "emergency fallback" (commit `86781a8`, krittaphato3, 2026-11-15, direct commit on `backend-byok`, later carried by merges `5e234b4`, `596de5a` (PR #19 from edit-real-time), `64b2ada`): when usable stock - total target <= 0 but usable > 0, lendable = usable - a reserve of about 1 day of the lender's own use. HB: usable 435 (lots with > 180 days left), target 644 -> strict lendable 0, fallback gave 351; HE gave 6.
  - `approve()` (`borrow.service.ts:466`) re-checks with the strict rule `max(0, usable - totalTarget)` -> 0 < 351 -> `LADDER_STALE`. The lender's confirm (`lender.service.ts:37-44`, `:192`) is strict too, so even an approved plan could not be confirmed.
  - Stock did not change (stock_ledger has no rows on HB's lots after 2026-10-21). The error text is misleading.
- Fix: removed the fallback block (old `borrow.ladder.ts:116-122`) and made `lendable` a `const`; added a short comment on why. Kept the other hunks of `86781a8` in that file (transit window `max(180, windowDays*1440)`, parallel for URGENT when the top lender cannot cover): they do not cause the mismatch.
- Verified (read-only scripts in the session scratchpad, DB untouched):
  - BR-2026-000576 ladder before the fix: HB 351 + HE 6; after: nobody eligible (`NO_LENDABLE_STOCK`), no plan.
  - 26 open/acknowledged LOW_STOCK alerts that pass `loadNeed`: lenders found for 26 with the fallback, 25 without it (only a Sodium chloride VERY_URGENT alert of HE lost its lenders), 24 with the whole file as before 15 Nov.
  - `tsc --noEmit` exit 0; `tests/borrow.formulas.test.ts` + `tests/borrow.agent.test.ts` 19/19 pass.

- Fresh DB test (2026-11-17, after the fix): full DB dump + `agent.byok` row saved to the session scratchpad -> `npm run db:reset` -> `npm run db:demo-seed` -> AI config restored. Seed's own lender check now snoozes HC/HE Sodium chloride (no lender) instead of leaving an unapprovable plan.
  - F1 through the real API (scratchpad script, project test accounts): all 7 open HA alerts -> create (auto-propose) -> PENDING_APPROVAL -> approve 200 -> IN_PROGRESS -> every lender leg ACCEPT 200 (9 legs, HB/HC/HD/HE). Propose waits for the free Nemotron agent (30-60 s each).
  - Then reset + demo-seed again and AI config restored, so the DB the user clicks is clean (0 test requests). F2 was not run end to end; F2 code does not use `buildLadder` (only borrow and `demo.engine.ts` do).

- Second fix: `borrowService.create` auto-propose is now opt-in (`autoPropose === true`, was on unless `false`). Web (StockAlertsPage, ManualBorrowDialog), copilot and `demo-scenarios.ts` all call `POST /:id/propose` themselves, so every request ran propose + the lender agent twice (and the "draft" demo scenario could not stay DRAFT). Tested web-style: create -> DRAFT, propose once 50-60 s -> PENDING_APPROVAL, approve 200, lenders ACCEPT 200 (3 alerts, 5 legs).
- Then reset + demo-seed + AI config restored (clean DB for the user to click). F2 read-only check (no clicks): every DETECTED lot simulated as released and run through `poolLotBlocker` + `demandCandidates` + `ruleSplit`: 18 of 22 find receivers; DEMO-NE-HA1 (alcohol gel) and DEMO-NE-HB2 (ATK) have no receiver (UI round skips them with a message); PARA2608-9 (HB) and RABI2608-9 (HE) have releasable 0 (release button disabled when qty <= 0). Lots of the same drug share receivers (Sodium chloride HA4/HB NSS_2609-8; nitrile gloves HA5/HB3/HD1; Paracetamol syrup HA3/HC2): the first plan fills the shortfall (`plannedInbound`), later ones get less or none.

## Decisions

- Remove the rule instead of making approve + lender confirm follow it: the rule bends the keep-level guardrail (spec rule BR-F1b-013, lendable = usable - target), the demo seed engine (`demo.engine.ts:334`) already shapes lenders with the strict formula, and removing it is one small change. Making 3 places consistent would change lender guardrails and needs a team decision.
- Keep the other two hunks of `86781a8` (not the cause; reverting the whole file would lose 1 more alert's lender).

## Files touched

- `backend/src/modules/borrow/borrow.ladder.ts` (fallback block removed, comment added)
- Not touched: `backend/src/modules/demo/demo.engine.ts` (user's uncommitted change), the friend's other files in `86781a8` (copilot chat drawer, BorrowDrawer, autoPropose in `borrow.service.ts`)

## Errors

- `LADDER_STALE` on approve while stock was unchanged (see root cause). If it comes back, compare the three formulas first: `buildLadder` lendable, `approve()` re-check, `lendableNow` in `lender.service.ts`.

## Next steps

- BR-2026-000576 is gone (DB reset); fresh demo data seeded.
- Tell krittaphato3: the fallback was removed; copilot may find no lender on mock data where nobody has surplus. If emergency sharing below the keep-level is wanted, it must be added to `approve()` and the lender confirm too, and agreed with the team.
- Not committed.

## Lender queue: lot ticks, unit, context label (2026-11-17)

- Found: the lot checkboxes in `LenderQueuePage.tsx` were display-only (full answer sent `{decision: ACCEPT}`, server FEFO; partial sent lots in list order ignoring ticks). "VIAL" was a hard-coded string in `LotRow` (mockup leftover). "STOCK_ALERT" was the raw `context` code shown as text.
- Changed (`frontend/src/roles/pharmacist/pages/LenderQueuePage.tsx`): ticked lots + per-lot qty are sent as `lots` for ACCEPT and PARTIAL; default pick = FEFO for the quantity given (reset on switching full/partial or typing the partial qty); "เลือกแล้ว X จาก Y" line, buttons disabled until the sum equals the quantity and no lot exceeds what it holds; "เลือกตามหมดอายุก่อนให้" link; warning when a later lot is used while an earlier one is not taken in full (allowed). No lot choice for F3 `EMERGENCY` (server picks). Unit = request unit. Context shown as Thai (`TRIGGER_LABEL`); `req.trigger` keeps the code because the answer path checks `EMERGENCY`.
- Backend (`lender.service.ts`): rejects the same lot twice (422) before the free-stock check.
- Tested on a throwaway copy DB (`doorare_test`, backend on :3011, agent off; dropped afterwards): duplicate lot 422, sum != qty 422, lot <= 180 days 422, wrong lot 422, valid non-FEFO pick 200 and the server reserved exactly the chosen lots. Frontend `npm run build` and both `tsc` pass. UI not checked in the browser (demo-card login did not go through in the pane).
