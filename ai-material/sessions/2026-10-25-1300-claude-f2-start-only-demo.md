# F2 demo: start-only mode (flow by hand)

## Goal
- User: the F2 demo data should only seed the START (near-expiry lots found, other hospitals' lots already in the pool); pool round, plans, approvals, transport must come from clicking through the UI.
- Branch fix/agents-f1-f2, local Docker DB only, nothing pushed.

## Done
- `backend/scripts/demo-f2.ts`: two new env options.
  - `CLEAN=1`: first cancels plans in READY_FOR_APPROVAL / NEEDS_DISCUSSION (reason required, 3+ chars) and withdraws lots still in the pool, all through the API (history kept; TRANSPORTING plans are not touched). Then it also tries the DETECTED lots that already exist (earlier demo data), so no new stock is needed when every drug already has a DEMO-NE lot.
  - `KEEP_DETECTED=HA`: those hospitals release nothing; their lots stay DETECTED ("waiting for the pharmacist").
- Run used: `CLEAN=1 RELEASE=2 HOSPITALS=HA,HB,HC KEEP_DETECTED=HA bash scripts/db.sh scenarios-f2`.
- Result in Docker DB: pool = 2 lots (HB NSS_2609-8, HC DEMO-NE-HC1, receivers HC / HB+HA); HA has 4 DETECTED lots; 0 plans waiting for approval; 1 old TRANSPORTING plan (HB lot ALLOCATED) remains.
- Docker images rebuilt (all layers cached = no code change), containers recreated.

## Decisions
- Do not delete rows; history stays, only live F2 state is reset via API.
- `scripts/db.sh` pins DB_* to the Docker DB for scenarios (uncommitted; asked user whether to commit).

## Errors
- Plan cancel without reason -> 400; withdraw of a lot with an active plan -> 409 (cancel plan first). Candidate query returned 0 new lots (drugs already have DEMO-NE lots), hence the reuse of existing DETECTED lots.

## Next
- User walks through: scan -> release HA lot -> pool round (agent) -> plans -> approve -> transport.
- Decide whether to commit `scripts/db.sh` + demo-f2.ts changes.

## Borrow hub changes (same session, later)
- Backend: `POST /borrow-requests/:id/legs/:legId/skip` (`borrowService.skipLeg`): leg SENT -> CANCELLED (reject_reason SKIPPED_BY_BORROWER), lender notified (BORROW_LEG_CANCELLED), audit REQ_LEG_SKIPPED, then `advanceRequest` sends the next lender. Not for EMERGENCY. Tested via API on BR-2026-000580 (HB cancelled, HC sent), then restored by SQL.
- `escalateManual` now answers 422 NOT_SUPPORTED when the request has no stored ladder (F3 kit) instead of a 500 TypeError.
- Frontend: drawer button "ส่งต่อลำดับถัดไปเลย" on a waiting leg (confirm dialog); the lender list now also shows the not-yet-asked ladder entries as reserve plus `ladderNote` (max lenders to cover the quantity); EMERGENCY requests are hidden on the borrow page (context filter "ไม่รวมเหตุฉุกเฉิน", link to the incident page).
- Mistake: my first add-lender test on BR-2026-000575 really sent a leg to HB; reverted by SQL (leg + notification deleted, status ESCALATED; audit rows stay).
- Not verified in the browser (login in the preview pane did not complete); typecheck clean, images rebuilt.

## Later in the same session
- Mock/demo mode switched off for the whole app (`services/dataSource.ts`: `?mock=1` ignored, stale localStorage flag removed). Fixtures and mock pages stay in the code, unused.
- Warehouse work inbox: urgent F3 requests still waiting for the lender (`useEmergencyInbox('pending')`) are listed as rows with a link to the Emergency page (`RequestItem.href`).
- Lender answer "ให้บางส่วน" (`LenderQueuePage.tsx`): explicit quantity field, lots picked FEFO from it, button disabled until valid. Backend already asked the remainder from the next lender (`advanceRequest`) and transport qty comes from `borrow_leg_lot`.
- F2 plans were all auto-approved because the 5 hospitals share one network (rule in `expiry/matching.ts`: every receiver in the origin's network). `db/demo/03-networks.sql` (+ `npm run db:networks`) moves HD, HE to "เครือข่ายตัวอย่าง B" (data only, idempotent). Verified: HD lot -> plan READY_FOR_APPROVAL (receivers HB, HA).
- DB reset 3 times for testing; final state = start-only (pool 4 lots, HA 4 DETECTED). LLM still not configured (agents on rules fallback).
- F3 note: with no hospital inside the ETA only the fastest lender is asked (spec BR-F3-021); change to parallel not done, needs a decision.

## Plan revision (after the meeting) and login cards
- `POST /allocation-plans/:id/revise` (`plansService.revise`): involved pharmacist changes line quantities of an open plan (READY_FOR_APPROVAL / NEEDS_DISCUSSION). Own lines are removed first so F-22 caps ignore the plan itself; lines re-validated (cap, pool qty), value / transport cost / F-23 recomputed, option reset, version+1, all approvals PENDING except the reviser (APPROVED), status READY_FOR_APPROVAL; audit PLAN_REVISED. All approve -> existing `decision` starts transport. Tested via API on AP-2026-00087 (NEEDS_DISCUSSION -> READY_FOR_APPROVAL v5); the approvals + transport step was not run.
- `AllocationDrawer`: meeting / adjust box moved to the top for NEEDS_DISCUSSION; form has a note field and "ส่งขอความเห็นชอบรอบใหม่"; old "approve all now" button only remains when no `onRevise` (mock). Only existing receivers can be edited (0 drops one); adding receivers not done.
- Login page: demo role cards grouped per hospital (HA..HE), compact 4 per row, styled like the other-role cards; added pharmacist HB/HD/HE, warehouse HB/HD/HE, driver HD/HE.
- `db/demo/README.md`: Thai guide to rebuild the demo scenario in a friend's Docker (needs db/mock/csv and forecasts artifacts, which are not in git).
