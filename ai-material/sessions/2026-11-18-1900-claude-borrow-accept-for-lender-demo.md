---
title: Demo shortcut - borrower accepts the full quantity for a waiting lender (F1)
date: 2026-11-18
author: Alongkorn
ai: CLAUDE
tags: session, backend, frontend, borrow, f1b, demo, lender
summary: "ตอบรับแทน" button on waiting legs in BorrowDrawer; new POST /borrow-legs/:legId/accept-for-lender reuses lenderService.respond.
---

## Goal

- Demo without switching accounts: in the borrower's request drawer, a small button next to "รอตอบกลับ" makes that lender accept the full quantity, as if the lender pressed it.

## Done

- Branch `feat/demo-lender-quick-accept` (from `backend-byok-chatbot-fix-f3` at `02f9076`).
- Backend `backend/src/modules/borrow/lender.service.ts`: `respond(req, legId, onBehalf = false)`. With `onBehalf`: body forced to `{decision: 'ACCEPT'}`, the leg must belong to a request of the caller's hospital (borrower), and everything else runs in the name of `leg.lender_hospital_id` (lendable check, lots > 180 days, FEFO hold, transport task, reliability_stat, notify, `advanceRequest`). Audit `after` gets `onBehalfOfLender` + `by: 'BORROWER_DEMO_SHORTCUT'`. Normal lender path unchanged (hospitalId now taken from the leg after the ownership check, same value).
- Route `backend/src/modules/borrow-legs/borrow-legs.routes.ts`: `POST /borrow-legs/:legId/accept-for-lender` (PHARMACIST, idempotent).
- Frontend: `services/borrowApi.ts` `acceptForLender(legId)`; `BorrowDrawer.tsx` button "ตอบรับแทน" beside the badge for WAITING legs (same conditions as "ส่งต่อลำดับถัดไปเลย"; F3 EMERGENCY excluded), busy text "กำลังตอบรับ…", error shown under that lender; `BorrowRequestsPage.tsx` wires it (live mode only) and reloads.

## Decisions

- No on/off switch and no dev/prod split (user's choice): the shortcut is always available to the borrower's pharmacist.
- F1 only for now; F2 maybe later.
- Not enough lendable stock -> same 422 error as the lender would get; no forcing.

## Tests

- Throwaway copy DB `doorare_test` + backend on :3011, agent config removed (dropped afterwards), scratchpad `quick-accept.mjs`: 14/14 pass - other hospital 404; accept 200 ACCEPTED qty = asked; lender qty_held +asked; borrow_leg_lot sum = asked; 1 transport task; audit marker; lender queue shows ACCEPTED; second press 409; qty > lendable 422 (leg stays SENT); after deadline 409 TIMED_OUT; cancelled request 409; unknown leg 404; lender's own respond still 200 and not marked.
- backend + frontend `tsc` pass, `npm run build` pass, `borrow.formulas` + `borrow.agent` tests 19/19.
- Browser: logged in as HA, BR-2026-000578 drawer shows the button on the 2 waiting lenders only. Not clicked (user's demo DB untouched).

## Files touched

- `backend/src/modules/borrow/lender.service.ts`, `backend/src/modules/borrow-legs/borrow-legs.routes.ts`
- `frontend/src/services/borrowApi.ts`, `frontend/src/roles/pharmacist/components/BorrowDrawer.tsx`, `frontend/src/roles/pharmacist/pages/BorrowRequestsPage.tsx`

## Errors

- Test script first ran out of HA alerts on the copy DB (needed 4 requests); rebuilt the copy DB and used one HB request.

## Next steps

- Not committed / pushed.
- Possibly the same shortcut for F2 plan approvals.

## Emergency (F3) request no longer blocks a stock (F1) request (2026-11-18)

- Problem: HA pharmacist pressed "ขอยืม" on Epinephrine and got "มีคำขอยืมยานี้ที่ยังไม่ปิดแล้ว (BR-2026-000576)", but the request was not findable: it is an EMERGENCY request made by `er_staff1.ha` (ESCALATED), hidden on the borrow page by design (`BorrowRequestsPage.tsx:226`, commit `9866bff`), while the create duplicate check counted every context.
- Fix 1: `borrow.service.ts` duplicate query adds `br.context::text <> 'EMERGENCY'` (F1 still blocks a second F1). F3 creation has its own insert (`incidents/emergency.borrow.ts`), not affected.
- Fix 2: alerts list (`alerts.service.ts`) returns `emergencyRequest: { requestNo }` = newest open EMERGENCY request of the same hospital + drug; `alertsApi.ts` / `stockAlerts.ts` (`emergencyNo`) / `stockAlertRows.ts` map it; `StockAlertTable.tsx` shows "ER ยืมฉุกเฉินค้างอยู่ · BR-…" (amber, small) under the alert badges. Note only, nothing blocked.
- Not done (decided with user): counting accepted emergency goods as incoming in `loadNeed`. Emergency goods are used on the patient at once, so it could under-borrow; needs a team decision.
- Tests (copy DB, dropped): Epinephrine alerts carry the emergency note (BR-2026-000579, the newer of 2 open F3 requests); F1 create 201 while F3 open; second F1 same drug 409 naming the F1 request. Both `tsc`, frontend build pass. Browser: the note shows on the HA stock alert row next to "ขอยืม".
- Also explained (no change): ESCALATED "ต้องเพิ่มผู้ให้ยืม" on BR-2026-000585 = stock 0 -> response window `min(120 min, stock/u days)` floored to 1 min (`borrow.flow.ts:129`), 4 lenders timed out in ~4 min. "เพิ่มผู้ให้ยืม" dialog sends an empty lender id when none is picked (raw "lenderHospitalId ต้องเป็น UUID"); fix offered, not done.

## Borrow page numbers that did not match (2026-11-18)

- Found on HA: tab "ยาที่เราขอยืม" 12 and sidebar 10 counted 8 open EMERGENCY requests that the table hides; tile "ตอบรับแล้ว" vs row badge "กำลังขอยืม"; tile "กำลังขอยืม 1" was only the ESCALATED request already in the red banner; progress "364 / 328" used the stop threshold as denominator; BR-2026-000578 short 748 with no lender left showed only "กำลังดำเนินการ" (server escalates only after the confirmed goods arrive, `borrow.flow.ts` advanceRequest).
- Fixes (display / counting only):
  - `BorrowLendHubPage.tsx`: tab counts skip `context === 'EMERGENCY'`. `dashboard.routes.ts`: borrowRequests tile query skips EMERGENCY (sidebar badge, pharmacist KPI / action center). ER and warehouse counts come from incidents, unchanged.
  - `BorrowBadges.tsx`: `accepted` prop -> "ตอบรับแล้ว · รอขนส่ง" (green) for APPROVED / IN_PROGRESS when `tileOf(r) === 'accepted'`; used in `BorrowTable.tsx` and `BorrowDrawer.tsx`.
  - `data/borrow.ts`: `TileGroup` gets `escalated` (no tile); `tileOf` returns it for ESCALATED; progress tile subtitle "รอผู้ให้ยืมตอบ". `BorrowRequestsPage.tsx`: `?group=escalated`, deep links to an escalated request and the banner use `onlyNeedLender` with no tile. `WhBorrowPage.tsx` maps `escalated` back to `progress` (it has no banner).
  - `BorrowTable.tsx`: progress "ตอบรับ X / qty" (bar over requested qty, nowrap); stop threshold kept in the tooltip and the drawer.
  - `borrowLive.ts`: `noLenderLeft` note "ยังขาด N · ไม่มีผู้ให้ยืมเหลือ · เพิ่มผู้ให้ยืมได้เมื่อรับของที่ตอบรับแล้ว".
- Checked in the browser (HA, no clicks on data): tab 4, sidebar 2, tiles 1 / 0 / 2 / 101 / 25, badges and progress as above, 578 note shows the shortfall, banner filter lists only BR-2026-000585. Both `tsc` + frontend build pass.
- Follow-up: user saw open tiles 1 + 0 + 2 = 3 vs tab 4 / 4 rows (escalated was in no tile). Added a red tile "ต้องเพิ่มผู้ให้ยืม" (`TILES` in `data/borrow.ts`, grid 6 columns in `borrow.css`); banner click now toggles that tile (`group === 'escalated'`); `?group=escalated` and deep links use the tile; `WhBorrowPage.tsx` mapping removed (it shows the tile too). Browser: tiles 1 / 0 / 1 / 2 = tab 4 = 4 rows.
- Removed the red "ต้องเพิ่มผู้ให้ยืม N รายการ" banner (user: too loud; the red tile is enough) from `BorrowRequestsPage.tsx` + `.bl-need` CSS. Seen: sidebar badge is fetched once per login / URL change (`App.tsx` AuthenticatedShell), so it can lag after an approve (showed 2 while the API said 1).
- Sidebar badge refresh: new `frontend/src/lib/navBadges.ts` (`refreshNavBadges()` dispatches `doorare:refresh-nav-badges`); `App.tsx` listens and refetches GET /dashboard (`badgeTick` dep). Called from `BorrowRequestsPage.tsx` (`reloadAll()` replaces the 10 `live.reload()` calls: approve, reject, cancel, propose, add lender, skip, accept-for-lender, return...), `LenderQueuePage.tsx` `onResponded`, `StockAlertsPage.tsx` after create. Read-only: no request/body/flow change, no polling. Browser: dispatching the event fetched only `/api/v1/dashboard`.

## Borrow drawer redesign + wording (2026-11-18)

- Goal: see at a glance who asks, which drug, how much, from which hospitals. User likes the numbered lender list; keep it.
- `BorrowDrawer.tsx`: summary card under the title (`.br-sum`: "<borrower> ขอยืม", drug + big qty, bar "ตอบรับแล้ว X / qty" + "รับของแล้ว N"); status banner kept; lender list moved up, title "ขอยืมจาก"; details list moved below as "รายละเอียดคำขอ" ("ขอในครั้งแรก", "วิธีขอ").
- `borrowLive.ts`: leg lines "ขอยืม 11 amp · ตอบรับ 11 amp · 20:29" (round > 1 adds "(ขอต่อเพราะแห่งก่อนหน้าไม่พอ)"; SENT ends "ต้องตอบภายใน HH:MM", reused by the table note); planned rows "จะขอยืม N" / "ขอต่อถ้าแห่งก่อนหน้าไม่พอ" / "สำรอง · ให้ยืมได้ไม่เกิน N"; banner "รอ X ตอบ" without round; ladder note fixed ("ระบบจะขอสูงสุด 0 แห่ง" when the stop rule is met -> "ได้ตอบรับพอแล้ว ไม่ต้องขอเพิ่ม · มีสำรอง N แห่ง"; otherwise "ขอทีละแห่ง / ขอพร้อมกันได้สูงสุด 3 แห่ง จนได้ครบ …"); view gets `borrower`, `received`. CSS in `borrow.css`.
- Checked in the browser on BR-2026-000588. `tsc` + build pass.
- Seen, not fixed (pre-existing): sessions are an in-memory Map (`auth.service.ts`), so a backend restart logs everyone out; `/lender-queue?cursor=MjAw` returns the same cursor, so `apiJsonAll` fetches up to 10 identical pages per load.
- Correction: `/lender-queue` paging is fine (HA: 200 + 71 rows, page 2 `nextCursor: null`). The repeated `cursor=MjAw` calls were several hook instances (hub, page, status panel) each loading 2 pages on mount and on every realtime event. Fix: `services/borrowApi.ts` `shared()` lets calls to the same path that start within 300 ms share one in-flight request (no cache) for `listLenderQueue` and `listBorrowRequests`. Browser: switching tab twice -> lender-queue 2 loads (4 calls), borrow-requests 2.

## Edit first-round quantity per lender before approval (2026-11-18)

- Uses the existing `PATCH /borrow-requests/:id/ladder` (`editLadder`, had no UI). Total to borrow is not editable (would change qty_requested / stop threshold; BR-F1b-032).
- Backend `borrow.service.ts` editLadder: qty must be an integer; same hospital twice 422; at least 1 lender > 0; changed quantities get a new message (`draftMessage`, timeout from `stored.need`); `stored.edited = { by, at, original }` (original kept from the first edit). Request view: `proposal.edited`, ladder `rationale` only when the agent's pick qty still equals the plan. `borrow.flow.ts`: `StoredLadder.edited`; `sendLegs` uses stored drafts only for round 1, later rounds draft with the quantity really asked (was: backup drafts said min(lendable, borrow) with "รอบที่ 2").
- `first_round_qty` column NOT changed on edit: the stop threshold is based on it; lowering it would stop asking before the real need is covered.
- Frontend: `BorrowDrawer.tsx` quantity input per planned lender (PENDING_APPROVAL, live, pharmacist), "รวมที่จะขอ X / qty", client checks (integer >= 0, <= lendable, sum <= qty, >= 1 lender, 1 lender when sequential / 3 when very urgent), "บันทึกแผน" / "ยกเลิกการแก้", approve disabled while unsaved; save awaits the list reload (fresh version). `borrowLive.ts`: plan rows (`plan`), `parallel`, note "เภสัชกรแก้แผนเอง … เดิม Agent/ระบบเสนอ …" (label "เภสัชกร"), "ขอในครั้งแรก" from the current plan / round-1 legs, lender column shows the planned first lenders, priority-after shows names not codes. `BorrowRequestsPage.tsx` wires `editLadder`.
- Tests on a copy DB (dropped), scratchpad `edit-plan.mjs` 18/18 + `round2.mjs`: decimal / all zero / over lendable / 2 lenders on sequential / duplicate / unknown hospital 422; stale version 409; other hospital 4xx; valid edit 200 with new plan, new message (new qty), edited.original, old rationale hidden, version +1; approve sends only the edited lender and qty, leg message has the new qty; edit after approve 409; lender accepts; round-2 message carries its own qty. borrow tests 19/19, both `tsc`, build pass.
- Browser (HA BR-2026-000589, nothing saved): inputs show, sequential rule message appears, approve disabled with hint while unsaved, discard restores 81.
- Follow-up (user): inputs only after pressing "ปรับจำนวน" (`planOpen`); edit bar "บันทึก" / "ยกเลิก" (closes and restores); approve disabled while the edit bar is open; a reload closes it. "ยกเลิกคำขอ" hidden for PENDING_APPROVAL ("ไม่อนุมัติ" already cancels and records REJECTED); still shown for DRAFT and after approval. Browser (BR-2026-000590, nothing saved): closed = [ปรับจำนวน, อนุมัติและส่ง, ไม่อนุมัติ], open = 2 inputs + บันทึก (disabled until changed) + ยกเลิก, approve disabled.
- Removed the per-lender "Agent: <rationale>" text from planned rows (`borrowLive.ts` detail, drawer edit row); the agent box under the list already explains. Browser: rows "จะขอยืม 398 แคปซูล" / "สำรอง · ให้ยืมได้ไม่เกิน 298 แคปซูล", agent box kept.
- Spare rows after the stop rule is met now read "สำรอง · ไม่ต้องขอแล้ว (ได้ตอบรับพอแล้ว)" (was "ขอต่อถ้าแห่งก่อนหน้าไม่พอ" next to "ได้ตอบรับพอแล้ว"); `borrowLive.ts` only. Explained to user: BR-2026-000590 (E drug) stop threshold = normal use 89, accepted 388 -> no next lender by design (rule F-20, not the agent).
- Stock alert main button: "ขอยืม"/"ขอยืมด่วน" -> "สร้างคำขอยืม"/"สร้างคำขอยืมด่วน" (`StockAlertTable.tsx`). Busy state looked broken because the slot was 100px while spinner + "Agent กำลังทำงาน…" needs 157px (text spilled out of the button); `.sa-actions` columns now 72/72/164px, `.sa-actions-2` padding-right 86px (`index.css`). Measured off-screen in the browser: busy 157px, "สร้างคำขอยืมด่วน" 122px, both fit.
- User: button too wide -> `.sa-actions` main slot 128px (fits "สร้างคำขอยืมด่วน" 122px), busy text shortened to "Agent ทำงาน…" (128px with spinner), `.sa-actions-2` padding-right 68px.
- Parallel (very urgent) requests: every waiting lender dot is blue (`BorrowDrawer.tsx`, was only the first); banner "รอ N แห่งตอบพร้อมกัน" with the earliest deadline; table note "รอ N แห่ง · ต้องตอบภายใน …" (`borrowLive.ts`, waiting legs sorted by remaining time). Browser BR-2026-000586: 3 blue dots, banner and note as above.
- Pool page (`PoolAllocationPage.tsx`): opening "คลังกลาง · แผนจัดสรร" now lands on step 2 "คลังกลางเขต 6" (tab `pool`) instead of plans; `?tab=plans|approved|history` links unchanged. Browser: menu click -> step 2 highlighted. Also decided with user: no stop-rule line in the drawer UI.

## F2 demo shortcut: approve a plan for another hospital (2026-11-18)

- Backend `plans.service.ts` `decision(req, id, asHospitalId?)`; route `POST /allocation-plans/:id/approve-for` `{ hospitalId, version }` (`expiry.routes.ts`). Approve only; not for our own hospital (422); target must be in the plan and still PENDING (404 / 409); caller must be involved (loadPlan 404); same version check, uneconomical-without-option check (409 OPTION_REQUIRED) and the same effects (all approved -> APPROVED -> startTransport). Audit `after.by = 'DEMO_SHORTCUT'`, decision_log action `approve_for`.
- Frontend: `expiryApi.ts` `approvePlanFor`; `PlanApproval.hospitalId` (`pool.ts`, `poolLive.ts`); `AllocationDrawer.tsx` small "เห็นชอบแทน" next to "รอการตอบรับ" for other hospitals while the plan waits for approval; `PoolAllocationPage.tsx` `liveApproveFor` (reloads, no "decided" banner so our own approve button stays), passes `myHospitalId`.
- Also earlier today: withdraw of a pool lot with an active plan is blocked by design (explained, AP-2026-00088); UI still shows the withdraw button (not changed, user declined).
- Tests (copy DB, dropped; scratchpad `approve-for.mjs`, `approve-for2.mjs`): own hospital 422, wrong version 409, HB not involved 404, hospital not in plan 404, bad id 400, REJECTED via shortcut 422, approve for HE 200 (plan still waiting, HA untouched), twice 409, audit marker, HD 200 then HA itself -> TRANSPORTING with 2 tasks, shortcut after approval 409; AP-87 uneconomical -> 409 OPTION_REQUIRED, after choosing an option the last approval by shortcut starts transport. Both `tsc`, build pass.
- Browser (HA, AP-2026-00088, not clicked): HA row has no shortcut, บางบ่อ and บางเสาธง rows show "เห็นชอบแทน".
- F2 shortcut button now sits before the "รอการตอบรับ" badge and reads "DEMO" (`AllocationDrawer.tsx`; F1 "ตอบรับแทน" unchanged).

## New logo: PharmaSync+ (2026-11-18)

- Source image from the user (webp, transparent background). Cropped with a small Node PNG script (scratchpad `logo/cut.mjs`, no deps) into the heart mark and the wordmark, keeping the source alpha and turning white pixels transparent.
- Replaced `frontend/src/assets/logo-mark.png` (448x418) and `logo-wordmark.png` (1385x210): used by the sidebar (`Sidebar.tsx`) and the login page (`LoginPage.tsx`); alt text "PharmaSync+". `MockDemoPage.tsx` header text "DooRare" -> the same two images. Favicon: `public/favicon.png` (64px mark), `index.html` points to it (old `favicon.svg` left in place, unused).
- `.side-brand-wordmark` height 20 -> 17px: the wider wordmark was clipped by the brand column (~115px).
- Not changed (text, not logo): tab title "MedSupply Link – Dashboard", loading text "กำลังโหลดระบบ DooRare...", chat drawer name, other "DooRare" wording.
- Browser: sidebar shows the new mark + "PharmaSync+" with the region label; canvas check: no opaque black background in mark / wordmark / favicon.
