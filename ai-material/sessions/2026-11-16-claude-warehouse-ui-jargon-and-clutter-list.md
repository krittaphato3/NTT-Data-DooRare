---
title: Warehouse role UI - jargon removal and clutter to-do list
date: 2026-11-16
author: claude
ai: Claude Code
tags: session, frontend, ui-cleanup, warehouse, f3, transport, backlog
summary: Removed spec codes, feature codes and English tags from the 4 warehouse pages (dashboard, work inbox, transport tracking, emergency) and wrote the list of crowded spots to fix page by page later
---

## Goal

- Warehouse officer pages (Dashboard, Work inbox, Transport tracking, Emergency/kit): hide jargon users should not see; list crowded screens for later (list only, no layout changes yet).

## Done

- Dashboard: dropped "/ Dashboard, / To-do, / Transport, / Recent activity" tags, English KPI sublabels, "SM-6", enum line under each transport status, "(Warehouse officer)", "F3 ฝั่งผู้ให้" -> "เหลือเวลา mm:ss". Activity badge role code mapped to Thai (`ROLE_TH` in `WhActivityPanel`).
- Work inbox: dropped "/ Work inbox · F1 · F2 · F3", KPI tags (TO PACK, TRANSPORT, INCOMING), "Feature:" -> "ประเภท:", F1/F2/F3 labels -> ยืมยา / โอนยาใกล้หมดอายุ / ฉุกเฉิน, notes without FEFO, "Emergency (F3)" button -> "เหตุฉุกเฉิน".
- Transport tracking: dropped "/ Transport tracking"; drawer: no BLOOD_REPLACEMENT, (F1)/(F2), FEFO, "audit log", BORROW_SLIP/TRANSFER_SLIP.
- Emergency: dropped "/ Emergency (F3)", KPI tags (LENDER, PACK TASKS, KITS, INCIDENTS), "WH ... (F1/F2 ...)" hint text, "เวลา/ETA", "F3" in badges and aria-labels; ETA badge on lender card -> "ของถึงหลังผู้ป่วย" (`roles/er/live/LiveInbox.tsx`, shared with ER).
- Work inbox table: urgent row showed "เหลือ —" (live data passes a blank timer); now shows the real due text. Button "ไปยืนยันที่ Emergency" -> "ไปยืนยันที่หน้าเหตุฉุกเฉิน" (`RequestsTable`).
- Login page (`pages/LoginPage.tsx`): dropped PostgreSQL/port, table names (app_user, login_event), SEC-001/ADM-01/UI-xx, MFA/OTP/Authenticator, Cognito OIDC, English labels in parentheses, raw role enums on cards (demo cards keep the coloured role badge, now short Thai: ฉุกเฉิน/เภสัชกร/คลังยา/คนขับ via `ROLE_SHORT`); removed hospital-code pills and the repeated demo password line (kept once next to the field, OTP hint in the OTP step); security footer cut to 2 short lines.
- Pharmacist dashboard alerts table (`AlertsPanel`): removed the "เลื่อน 4 ชม." snooze button for now (backend snooze API untouched; it only existed on the dashboard, fixed 4 h, no reason input). Then (user: all nav buttons do the same, so one button): each row has ONE button, "ดูรายละเอียด" ("ดูคำขอ" when the alert already has a request), solid blue when a request still has to be created; "รับทราบ" stays as a quiet link because it really saves. Table uses `qt sa-table`; layout via `.sa-actions-dash` in index.css. Known: at ~1440px the alerts card is ~570px wide and `.qt` has min-width 640, so the table scrolls sideways (was already so); fix = rebalance the dashboard grid or narrow the table.
- ER incident list (`roles/er/live/LiveIncidentList.tsx`, user asked for a redesign, not committed): underline tabs; 5 columns (เหตุการณ์ / ผู้ป่วย / แจ้งเมื่อ / คำขอยืม / สถานะ); title = incident type (no more duplicated type + place), muted line = incident no. + place; date with year + time on 2nd line; borrow cell shows the one thing that needs attention (ไม่มีผู้ให้ / รอตอบ / รับครบแล้ว) + "จาก N รายการ"; closed/cancelled shown as quiet text, only live states are badges; whole row clickable; "/ Incidents" tag removed. CSS `.il-*` at the end of index.css. Round 2 (user: "too plain"): 3 summary cards with coloured left border (active incidents / borrow requests waiting / patients in open incidents, counted over all incidents via `useIncidentList('all', 0)`), red left bar on rows that are still live, triage dots (round 2), which the user then asked to remove (round 3): patient column is now just the number, triage breakdown only as hover tooltip. The older mock `pages/IncidentListPage.tsx` left unchanged.
- ER incident list round 4: user liked the cards; page restored to the original template (button filters, 6 columns) + 3 summary cards; table cells cleaner (type bold + place muted, one-line borrow status, no row-click / `.il-*` CSS). "/ Incidents" tag dropped.
- ER "รับเหตุและวางแผน" plan step (`roles/er/live/LiveIncidentFlow.tsx`, `PlanTables.tsx`): API read first (`previewPlan` -> `ApiPlan.kits/extras`, edits via `PlanEdits`, approve via `calculatePlan`+`approvePlan`; logic untouched). Added `PlanCards` (needed / can cover / must borrow, coloured left border) replacing the side "สรุปความต้องการ" table; kit table 7 -> 5 columns (ต้องใช้ with ขั้นต่ำ below, มีพร้อมใช้ with stock below, จัดจากของแยก stepper, ต้องยืม red pill or green "ครบ"), extras table 7 -> 5 (rule moved under name); rows that need borrowing get a light red wash; jargon removed (Preset Kit, NO_RECIPE, FALLBACK, agent_run, LLM, "/ Incident -> plan -> borrow"). Steps 1,3,4,5 not redesigned.
- ER "ติดตามคำขอและจัดชุด" (3 tabs): redesigned once, then REVERTED at the user's request (files back to the committed version: LiveTrackPage, LiveBorrowStatus, LivePack, LiveInbox). Then user liked the incident-list table style and asked only the 'ยืมฉุกเฉิน' tab to be redone: `LiveBorrowStatus` now = one summary table (item + BR no. / confirmed of asked / status text), one table per live lender (timer once in the header), hospitals that gave nothing folded in one line, 'no ETA' note once; Then (user: pack tab too plain, other-hospitals tab hard to read): pack tab = left colour bar per task, 'picked n of m', short-stock rows red, 3 columns, KIT_PACK text gone, stock card 4 columns (pack-more as sub line, no sideways scroll); other-hospitals tab = left bar, requester first, facts as chips, one rule line on top, no dead buttons when our stock is 0 (message instead). Round after (user: colours too loud, make smaller, other-hospitals tab like the pharmacist table): colour bars removed everywhere (only status badges/text keep colour), pack cards smaller; `LiveInbox` is now a table (item+request / qty / requester / status / time left / buttons, give-part and decline inputs open in a row below). No summary cards (user removed them). `LiveInbox` shared with the warehouse emergency page. Earlier ideas: per-item progress cards, one timer per lender, fold hospitals that gave nothing, summary cards on the other-hospitals tab.
- Sidebar subtitles: removed "(F1 · F2 · F3)", "(F3)", "(F2)".
- `npm run build` passes; re-checked all 4 pages in the browser (page text scan).

## Decisions

- Keep reference numbers users quote (BR-…, TR-…, INC-…); only dev/spec codes removed.
- Layout untouched this round; crowding goes to the backlog below.

## Backlog: crowded or hard-to-use spots (fix page by page later)

Dashboard
- 5 KPI cards in one row, each with a title + 1-2 lines of small text; too many numbers at once.
- KPI says inbox 5 / urgent 2, but the "งานที่ต้องทำ" tabs show 0 (mock KPI vs live list out of sync).
- Transport status list (6 rows) duplicates the KPI cards; two top buttons duplicate the sidebar.
- "กิจกรรมล่าสุด" rows carry an extra document-number line; low value for the main screen.

Work inbox
- 3 KPI cards + 2 direction tabs + a long hint sentence + 3 filters + wide table (5 columns + action).
- Two header buttons (Emergency, Transport) duplicate the sidebar.
- Footer sentence repeats the hint.

Transport tracking
- 3 lines of description under the title, then sync bar, then direction tabs with another sentence.
- 6 status tiles AND 4 dropdown filters AND a sort label; pick one way to filter.
- Table has 8 columns (route, status, step bar, photos, updated, action).
- Footnote about cancelling is permanent; header buttons "ประวัติ" and "พิมพ์เอกสาร" compete with row actions.

Data bug (not layout)
- Dashboard "งานที่ต้องทำ" and KPI cards use transport tasks only; urgent lender requests (emergency legs) shown in Work inbox never reach the dashboard, so its inbox/urgent counts stay 0.
- Inbox row button "ไปที่ขนส่ง TR-…" still carries the task number.

Emergency (kit)
- 4 KPI cards + 5 tabs + hint line before any card.
- Each urgent request card has 3 badges, a yellow warning box, a long rule sentence and 2 buttons; the long sentence repeats on every card.
- "ดูประวัติคำขอ (21)" at the bottom is easy to miss.

Still jargon, not touched (outside the 4 pages or not checked with data)
- Sidebar: "สต็อก · ผลทำนาย · Agent", English subtitle lines; top bar badge "WAREHOUSE_OFFICER"; "Agent พร้อม" chip.
- Pack tab: English kit names; Inbox/pack/returns drawers and decline reasons not reviewed with real rows.
- Other WH pages (stock, borrow requests, near-expiry, drug master, documents) not reviewed.

## Files touched

- roles/warehouse: components/{WhKpiRow,WhPageHeader,WhTodoPanel,WhTransportPanel,WhActivityPanel,ShipmentDrawer,IncidentsTab,PackTab}, data/{dashboard,inbox,navigation,session}, pages/{InboxPage,KitPage,LiveKitPage,TransportTrackingPage}
- roles/er/live/LiveInbox.tsx

## Errors encountered

- Login page: "ลืมรหัสผ่าน?" is a dead link (not touched).
- Browser session was logged out after the dev server restarted; logged in again with the demo account.

## Next steps

- User picks one page from the backlog; redesign one page at a time (start with whichever the user names).
