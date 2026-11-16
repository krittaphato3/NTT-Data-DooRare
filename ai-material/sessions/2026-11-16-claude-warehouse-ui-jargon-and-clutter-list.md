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
- Login page (`pages/LoginPage.tsx`): dropped PostgreSQL/port, table names (app_user, login_event), SEC-001/ADM-01/UI-xx, MFA/OTP/Authenticator, Cognito OIDC, English labels in parentheses, raw role enums on cards; removed hospital-code pills and the repeated demo password line (kept once next to the field, OTP hint in the OTP step); security footer cut to 2 short lines.
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
