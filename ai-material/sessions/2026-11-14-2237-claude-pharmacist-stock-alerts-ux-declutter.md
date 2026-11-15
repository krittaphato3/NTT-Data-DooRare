---
title: Pharmacist stock alerts page - UX declutter (big rework reverted, jargon-only pass kept)
date: 2026-11-14
author: Alongkorn
ai: CLAUDE
tags: session, frontend, pharmacist, alerts, stock-alerts, ui-ux, dashboard
summary: Big rework reverted; second pass only removes technical terms and the forecast-method column
---

## STATUS: REVERTED

- User said the result was not good and asked for the original back. All code changes below were restored with `git checkout` (frontend pharmacist files, `index.css`, `dashboard.routes.ts`, `current-task.md`); backend restarted on the original code and `frontend/dist` rebuilt.
- A copy of the full diff is in the session scratchpad as `stock-alerts-ux.patch` (temporary; gone with the scratchpad). Nothing from the list below is in the repo now.
- Kept for the record: the problems found and the root causes of mismatching counts are still true of the original page.

## Second pass (kept, user request: only remove odd technical terms + the วิธีพยากรณ์ column)

- Layout, cards, filters, buttons all as in the original. Only text and one column changed.
- `StockAlertTable.tsx`: removed the วิธีพยากรณ์ column (QUANTILE_LGBM + LOW_CONFIDENCE badge); header "Predict · Total Target" -> "สต็อกเทียบเป้า"; values now "อย่างน้อย 39 · เป้า 71" (Min-Max rows "ขั้นต่ำ 5 · สูงสุด 20"); the low-confidence warning survives as a small "ข้อมูลพยากรณ์น้อย" line under the bar instead of the red badge.
- `StockAlertSummary.tsx` / `WhStockPage.tsx` / `index.css`: card code tags (`LOW_STOCK`, `ORDER_AHEAD`, `MIN_MAX`, `LOW_CONFIDENCE`) no longer rendered; `code` field removed from `SummaryCard`, builders and mock; `.sa-card-code` CSS removed. Warehouse stock page uses the same cards, so its tags are gone too.
- Texts in `stockAlertRows.ts` / `stockAlerts.ts`: Predict -> "ที่ควรมี", Total Target -> "เป้าสต็อก", Min / Max / Min-Max / "ไม่ผ่าน Agent" -> ขั้นต่ำ / สูงสุด, COLD_START and "UI-07" removed from card sub-lines, `ALERT_TYPE_META.MIN_MAX.th` -> "ต่ำกว่าระดับขั้นต่ำ", sort labels without "(V)" / "ABC", mock notes and history lines in plain Thai.
- `StockAlertsPage.tsx`: live banner no longer prints the model version / round; detail modal field "Predict · Total Target" and the วิธีพยากรณ์ row replaced with plain Thai (+ a caution line when data is thin); CSV export headers renamed and the method column dropped.
- Left as is on purpose: ABC column, V/E/D badge, HIS code under the drug name, "รหัส HIS" in the search box (domain terms pharmacists use), and everything on the backend.
- Verified: `npm run build` passes; browser DOM text of the page has none of LOW_STOCK / ORDER_AHEAD / MIN_MAX / LOW_CONFIDENCE / QUANTILE_LGBM / COLD_START / MA_ES / UI-0x / Predict / Total Target / Agent / Min / Max / วิธีพยากรณ์ / โมเดล; detail modal opens and reads correctly. Row buttons that write data were not clicked.

## Third pass (user: buttons, drop ABC, align the stock numbers, cut repeated words, shorter names)

- `StockAlertTable.tsx`: ABC column removed (sort option "มูลค่ายาสูงก่อน" still works on the data). Table has class `sa-table` (`vertical-align: middle`), and "ใช้ได้อีก" is now one line (daily use moved to a tooltip), so คงเหลือ / ใช้ได้อีก sit on the same line as the drug name.
- Names: row shows the generic name bold (`drugShort()` in `data/stockAlerts.ts`), with strength and HIS code on a small second line; dosage form and the full catalogue name are in the tooltip.
- Buttons: one line per row, order `รายละเอียด` (quiet link), `รับทราบ` (secondary button), main step last (`ขอยืมด่วน` / `ขอยืม` / `อนุมัติคำขอ` primary; `ติดตามคำขอ` / `ดูระเบียบ` secondary). Labels shortened, no `+` / arrow glyphs, BR number no longer in the label (it stays as a link in the แจ้งเตือน cell). Controlled drugs: the `ดูระเบียบ` button replaces the detail link. Min width 76 px, nowrap; wraps left under 640 px.
- Repeats removed: "รอจัดการ" badge on every pending row, the type + time line under the badge, "เหลือใช้ ~N วัน" and the numbers repeated in the note, `เตือนทั่วไป` badge (routine + pending rows show a dash), the extra low-confidence line (still in the detail modal). Notes are now one short reason ("ต่ำกว่าที่ควรมี", "ต่ำกว่าเป้า · เตรียมสั่งซื้อ", "ควรสั่งซื้อให้เร็วขึ้น").
- Shorter wording: title "แจ้งเตือนสต็อก"; tabs รอจัดการ / จัดการแล้ว / ทั้งหมด; chip "ทุกระดับ"; subtitle `รพ… · ประเมินล่าสุด · สต็อกอัปเดต`; banner "แจ้งเตือนจากระบบจริง"; card sub-lines and "ใกล้หมดอายุ / ภายใน 180 วัน"; status badges ขอยืมแล้ว / รออนุมัติ / กำลังยืม; notices without emoji ("รับทราบ X แล้ว").
- CSS: `.sa-actions` now a row, `.sa-links` and `.sa-alert-meta` removed, `.sa-sub` and `.sa-table td` added.
- Verified: build passes; at 1440 px every row has numbers on one line and the buttons in one line; at 375 px no page overflow (the table scrolls inside its box). Buttons that write data not clicked. Backend untouched (still the original code, sidebar still counts 24).

## Fourth pass (user screenshot: "looks crooked")

Causes found and fixed (all CSS / layout, no data or logic change):
- Second line of the drug cell started under the V/E badge, not under the name -> badge + one text column (`.sa-drug-cell`, `.sa-drug-text`).
- Number + unit sat in one right-aligned cell, so numbers ended at different x per unit (ถุง / amp / vial) -> fixed slots `.sa-n` (number, right) + `.sa-u` (unit, left); headers use the same slots.
- Buttons had different widths and positions per row (link / ack / primary missing in some rows) -> `.sa-actions` is a 3-slot grid (72 / 72 / 100 px), empty slots keep their place; `actionsFor()` now returns `{ detailLink, canAck, next }`.
- Toolbar controls had 4 heights (search 40, chips 32, V/E/D 34 wide, select 36) -> all 36; sort labels shortened ("เร่งด่วนที่สุดก่อน", "ใช้ได้อีกน้อยวันก่อน").
- Table was 25 px wider than its box at 1440 px (horizontal scroll) -> trimmed slot widths, alert column 130, target caption `nowrap` with column 190.
- Measured in the browser at 1440 px, 8 rows: number right edge, days right edge, ack-button left edge and name/detail left edge are identical in every row; control heights all 36; no horizontal overflow; row heights 76-78 px (one row 90 px where a long name wraps).

## Fifth pass (user: `/ui-ux-pro-max` "improve the stock alerts page UI a bit more")

Goal: small theme-safe polish only. Skill searches (ux domain) mostly confirmed what already holds: table scrolls inside its own box, severity is never colour-only (badge text + icon), controls have visible focus.
- `index.css`: `.sa-table tbody tr:hover td` light row highlight (`#f8fafc`) so the eye can follow a row across the 6 columns.
- `index.css`: `.sa-note` 11.5px -> 12px (smallest body text on the page now 12px).
- `StockAlertSummary.tsx`: a card whose count is 0 gets `sa-card-zero` (number colour `#64748b`), so cards with real work stand out. Accent border kept.
- Checked in browser (:5174, 1024 px wide pane): 18 rows, 2 zero cards dimmed, hover shades the row, note text computes to 12px, build passes. Console errors seen were old HMR leftovers from earlier edits; page rendered fresh.
- Deliberately NOT touched: the "ขอยืมยาด่วน" busy-state / double-click fix (user said they will ask for it later; must ask which branch first). Sidebar badge still 24 (backend original).
- Follow-up (user screenshot at ~1600 px: "rows still not lined up"): cause = `.qt th` is `text-align:left` and beats `.r`, so the headers "คงเหลือ" / "ใช้ได้อีก" sat at the left of their column while the numbers sat at the right. Fix: `.sa-table th.r { text-align: right }` in `index.css`. Measured in browser: header number-slot right edge == every row's right edge (596 / 716 px at the 1024 px pane).
- Follow-up (user screenshot of the action column, "should this be better?"): every row showed link + outlined "รับทราบ" + solid button, so the same 3 controls repeated 18 times. Now only the next step (ขอยืมด่วน / ขอยืม / อนุมัติ) is a solid/outlined button; "รับทราบ" is a borderless ghost button (`btn-g sa-ack`, body-grey, check icon, soft-blue hover) and "รายละเอียด" stays a link. Same 3 fixed slots, so alignment is unchanged (ack left edge identical in all rows, 32 px high). Handlers untouched. Files: `StockAlertTable.tsx`, `index.css`.
- Files: `frontend/src/index.css`, `frontend/src/roles/pharmacist/components/StockAlertSummary.tsx`, `StockAlertTable.tsx`.
- Next: nothing pending for this pass; commit only if the user asks.

## STATUS of the first, bigger rework: REVERTED

- User asked for a UX/UI review and rework of the pharmacist "แจ้งเตือนสต็อก" page (branch `feat/ui-ux-polish`), keeping the existing theme (navy ink, blue primary, same cards/badges/tokens).
- Known pain from the user: too much text, too many technical terms and codes.
- Backend allowed for exactly one point (sidebar count), no other logic changes.

## Problems found (before)

- Codes on screen: `LOW_STOCK`, `ORDER_AHEAD`, `MIN_MAX`, `LOW_CONFIDENCE`, `QUANTILE_LGBM`, `COLD_START`, "UI-07", "Agent", "Predict · Total Target", ABC / VED / HIS letters, catalogue code `E_61078`, the model version string `f1-WEEK-...` in a banner.
- 8 table columns, ~13 pieces of info per row; the same sentence repeated on every row; "รอจัดการ" badge on every row of the pending tab.
- Five summary cards, two of them 0, pushing the first drug below the fold.
- Numbers disagreed (see root causes below). Modal "รับทราบ" only closed the dialog. Emoji / glyphs used as icons (check mark, cross, `+`, arrows).

## Root causes of the mismatching numbers (read from code)

- Cards (`buildSummaryCards`): count every active alert incl. handled ones; severity line counts `LOW_STOCK` only.
- Chips: counted pending rows only and mixed `ORDER_AHEAD` / `ORDER_EARLIER` into "เตือนทั่วไป".
- Page rows: one row per drug (WEEK alert wins over MONTH in `buildStockAlertRows`), so 21 rows.
- Sidebar badge = `GET /dashboard` tile `stockAlerts.active` (`backend/src/modules/dashboard/dashboard.routes.ts`), which counted alert rows with status OPEN / ACKNOWLEDGED / LINKED_TO_REQUEST (WEEK + MONTH separately) = 24.
- `LOW_CONFIDENCE` card vs row badge: the card counts alerts of type LOW_CONFIDENCE, which `alerts.evaluate.ts` only opens when stock is at or above target; the row badge comes from the forecast flag. So the card was almost always 0 by design.

## Done

Backend (single point):
- `dashboard.routes.ts`: `stockAlerts.active` now = drugs whose preferred alert (WEEK over MONTH, among OPEN / ACKNOWLEDGED / LINKED / SNOOZED) is OPEN. Same rule as the page's "รอจัดการ" tab. `urgent` untouched. Checked in psql: Bang Sao Thong 24 -> 18 (page pending 18, 3 snoozed). `tsc --noEmit` clean.
- Side effect, intended: dashboard `KpiRow` and `PharmacistActionCenter` read the same `active`, so they also drop (e.g. 24 -> 18).
- Backend process is `tsx src/index.ts` (no watch) on :3001, so the new number only appears after a restart (not done from this session).

Frontend (`frontend/src/roles/pharmacist/`):
- `StockAlertSummary.tsx` deleted; the five cards and `.sa-card*` CSS are gone. Near-expiry stays as a header button "ยาใกล้หมดอายุ N" linking to `?page=expiry` (count still from `buildSummaryCards`, mock fallback `ALERT_SUMMARY`).
- `StockAlertTable.tsx` rewritten: 5 columns (ยา / ใช้ได้อีก / สต็อกเทียบเป้า / สถานะ / action). Drug name bold with strength + dosage form underneath (`drugLabel()` splits "FORM-Name strength"); no catalogue code. Days left is the big number. Bar caption is "อย่างน้อย N · เป้า M" with colour dots (Min-Max rows: "ขั้นต่ำ / สูงสุด"). One reason text per alert (`ALERT_REASON_TH`), status badge only when not "pending", urgency badge only for critical / urgent. One primary button; "รับทราบ" is the main button when nothing needs borrowing, otherwise a quiet link. Whole row / drug name opens details. Group headings "ต้องจัดการวันนี้" and "เตรียมสั่งซื้อล่วงหน้า" with counts (only for default sort, not the handled tab, urgency = all).
- `StockAlertToolbar.tsx`: urgency chips reduced to ทั้งหมด / ต้องจัดการวันนี้ (critical + urgent) / เตรียมสั่งซื้อล่วงหน้า (routine), V/E/D chips replaced by a "กลุ่มยา" select with plain Thai, sort labels in plain Thai.
- `StockAlertsPage.tsx`: title "แจ้งเตือนสต็อก", shorter subtitle (model version only in a tooltip); live banner only when forecast is missing or mock; emoji removed from notices (Icon `checkc` / `alertc`); history / export demoted to ghost buttons; CSV headers renamed (no "Predict / Total Target"), file name `stock-alerts.csv`; detail modal shows plain-Thai fields and folds code / VED / ABC / method into a "ข้อมูลเชิงเทคนิค" details block; modal "รับทราบ" now really acknowledges (via `handleAction`) and only shows when the alert is open and the role may acknowledge.
- `data/stockAlerts.ts`: replaced `SEVERITY_FILTERS` / `VED_FILTERS` with `URGENCY_FILTERS`, `urgencyOf`, `VED_OPTIONS`; added `ALERT_REASON_TH`, `drugLabel`; shorter `PHARMACY_CONTEXT.subtitle`; tab label "ทั้งหมด".
- `index.css`: removed unused `.sa-card*`, `.sa-note`, `.sa-alert-meta`, `.sa-links`, `.sa-cell-num`, `.sa-sort-label`; added `.sa-table`, `.sa-row`, `.sa-drug`, `.sa-sub`, `.sa-days`, `.sa-key`, `.sa-dot`, `.sa-badges`, `.sa-reason`, `.sa-group*`; mobile rules adjusted. Tokens reused (`--ink`, `--body`, `--primary`, `--border`).

## Decisions

- Keep the incumbent theme; refinement, not redesign. No new dependency.
- Severity thresholds are server rules (`urgencyFor`: V <= 2 days very urgent, <= 7 urgent; E <= 2 days urgent), so "ต้องจัดการวันนี้" = critical + urgent reuses them; nothing recomputed in the UI.
- `ORDER_AHEAD` and `ORDER_EARLIER` share one reason text.
- Sidebar count fixed in SQL (one query) rather than lifting page state into the shell.

## Verification

- `npm --prefix frontend run build` passes (tsc + vite). `impeccable detect` on the three changed components: no findings.
- Browser (dev server :5174, demo pharmacist of รพ.บางเสาธง): desktop 1440 and mobile 375 render with no page overflow; detail modal text checked; console clean after reload (earlier errors were HMR from mid-edit states).
- Backend restarted from the session (old `tsx src/index.ts` on :3001 stopped, new one started from `backend/` with `DB_SSL=false`, other values from `backend/.env`; it is a background task of this session, not `tsx watch`). Restart signs everyone out, so the demo pharmacist logged in again. After that the sidebar badge shows 18 = tab "รอจัดการ 18"; dashboard text says "แจ้งเตือนสต็อกทั้งหมด 18 รายการ"; all /api/v1 calls 200.
- Not verified: acknowledge / create-request clicks (they write data, not clicked); borrow-request flow after "ขอยืมยาด่วน".

## Errors

- Stale HMR errors in the browser console while files were half edited; gone after reload.
- macOS `sed -i` needs an empty suffix; used the Edit tool instead.

## Known gaps / next steps

- Use `suggestedBorrowQty` / `incomingQty` from `GET /alerts` for the primary button ("ขอยืม N หน่วย") once it is confirmed the column is filled.
- Other pages still show codes (`Borrow & Lend`, near-expiry, pool); same review can be repeated per page.
- `WhStockPage` still imports types / helpers from `pharmacist/data/stockAlerts.ts` (unchanged exports it uses were kept).

## Sixth pass (separate page: ยาใกล้หมดอายุ / near-expiry review, `?page=expiry`; user via `/ui-ux-pro-max`)

Request: better spacing, colour pairs, visual hierarchy; cut repeated words and text users should not see, especially technical terms. Same rules as before: theme kept, no logic changes, no new deps.
- Page head: title "ยาใกล้หมดอายุ" (matches the sidebar) instead of "หน้าใกล้หมดอายุ / Near-expiry review · UI-07"; subtitle one short line (removed JOB-05, FR-F2a-013, ตั้งค่าต่อรายการ; the "released lots don't count as usable stock" rule moved to the table footer once). Buttons: "ตรวจตอนนี้", "ส่งออก CSV", "พิมพ์" (was long label / CSV / PDF).
- KPI tiles: English tags (DETECTED / RELEASED · ALLOCATED / VALUE AVOIDED) no longer rendered (`en` kept only as data, key is now the label). Third tile was red for a good number -> blue (`#1D4ED8` on `#EFF6FF`; also the mock in `data/nearExpiry.ts`). Gap 12 -> 16, padding 14x16, sub text `#475569` (was `#64748B`).
- Tabs: "ตรวจรอบนี้" -> "รอตัดสินใจ" (same word as the tile); "ปล่อยแล้ว · จัดสรรแล้ว" -> "ปล่อยแล้ว".
- Table: header "ทย." removed (screen-reader text only); "ตัดสินใจ: เก็บไว้ใช้ / ปล่อยเข้าพูล" -> "ตัดสินใจ"; "พูล" -> "คลังกลาง"; sub-line under name no longer says "รหัส"; "ถูกกันไว้" -> "ปล่อยแล้ว"; "/ เกณฑ์ 180 วัน" removed from every row (kept in the bar tooltip); EXPIRED badge removed (the row already says หมดอายุแล้ว twice); repeat badge WATCH/RECOMMEND -> `REPEAT_LABEL` (หมดอายุซ้ำ / หมดอายุซ้ำบ่อย, 12px, tooltip); "FEFO ใช้ทันหมด" -> "ใช้ทันก่อนหมดอายุ"; "/ สูงสุด" -> "สูงสุด".
- Colour: lots with <= 30 days left get a red bar and red "เหลือ N วัน" (before: amber/orange only), so the most urgent rows read first.
- Status lines (`advice()`): removed write-off, Agent, plan ids; `cleanNote()` strips rule codes such as "(BR-F2a-024)" from system-written dismiss notes (page + drawer).
- Scan result note shows only non-zero parts.
- Drawer (`NearExpiryDrawer.tsx`): removed UI-07 / FEFO · F-22 / FR-F2a-002 / F2b / ASM-14 / JOB-06 / UI-14 / "(held)" / Agent / plan ids; "รหัส" prefix dropped.
- One stored string changed: auto "keep" reason now "ใช้ทันก่อนหมดอายุ ไม่ต้องปล่อยเข้าคลังกลาง" (was "FEFO ใช้ทันก่อนหมดอายุ ..."); only the text saved with the note, no logic. Older kept rows may still show the old text.
- Checked in browser at 1440 (:5174): 2 pending rows / 29 all, no listed jargon left in page, table or drawer; build passes. Left alone: shell text ("Near-expiry review" sidebar subtitle, "Agent พร้อม" top bar), hard-coded "รพ.สมุทรปราการ" in the drawer's hold text, lot codes like DEMO-F2X-HE1-1 (data), Pool page and other pages.
- Not verified: release / keep clicks (they write data).
- Files: `pages/NearExpiryPage.tsx`, `components/NearExpiryDrawer.tsx`, `data/nearExpiry.ts`, `near-expiry.css` (all under `frontend/src/roles/pharmacist/`).
- Follow-up (user screenshot: "too cramped"): the decision column was 330 px wide but its content (bar, input row, two buttons, detail link) needed ~340, so the second button touched the card edge and the value column sat right against the bar. Now: decision column min 400 px with 32/20 px side padding, value column +24 px right padding, rows 16 px top/bottom padding, `.ne-act` gap 6 -> 10, table min-width 1020. The per-row "รายละเอียด" link was removed (name and V/E badge already open the drawer, and the table hint says "กดแถวเพื่อดูรายละเอียด"). Measured at 1440 px: buttons end at x 1313-1316, card edge 1392, no clipping. Files: `near-expiry.css`, `pipeline.css` (`.ne-act*`, `.ne-split-txt`), `NearExpiryPage.tsx`.
- Redesign of the right-hand "ตัดสินใจ" cell (user: "ลองออกแบบด้านขวาใหม่"): now three lines instead of five. (1) split bar, (2) legend with colour dots, not coloured text ("เก็บไว้ใช้เอง 633 · ปล่อย 639 ชิ้น", plus "ใช้ค่าแนะนำ (N)" only when the quantity was edited), (3) one action line: quantity box with the unit inside (`.ne-qty`, 32 px, same height as `btn-sm`) + primary "ปล่อยเข้าคลังกลาง" + secondary "เก็บไว้ทั้งล็อต". Removed the "จำนวนที่จะปล่อย" label and "สูงสุด N" text (max kept in the box tooltip and enforced by the same clamp). Handlers (`setRelQty`, `setRowAction`, `keepAll`) unchanged. Row height 149 -> 99 px at 1440. Classes added in `pipeline.css` (`.ne-legend`, `.ne-lg`, `.ne-qty`, `.ne-act-line`); drawer's `.ne-qtyinput` untouched. Column min-width 420.
- Gap between ยา and คงคลัง (user: "too far apart"): the drug column took all spare width (~600 px at 1600 wide). Columns now use shares: ยา 28%, คงคลัง 11%, หมดอายุ 17%, มูลค่า 11%; the decision column keeps 420 min and takes the rest. At 1600 px the drug column is 347 px wide. Short names still leave some air before คงคลัง; long names fill the column.
- Not clicked: release / keep, and editing the quantity in the browser (typed edits not exercised).
- Decision cell, second redesign (user: previous one still crowded; "design it anew"): the split bar, colour legend and quantity box were repeated on every row. Now the default row is two lines: (1) summary text "ปล่อยได้ 639 ชุด · เก็บไว้ใช้เอง 633" (amount in primary blue), (2) actions: primary "ปล่อยเข้าคลังกลาง", ghost "เก็บไว้ทั้งล็อต" (`btn-g`, no border), link "ปรับจำนวน". The quantity box (`.ne-qty`, "ปล่อย [ ] ชุด จาก N · ใช้ค่าแนะนำ") replaces the summary line only after "ปรับจำนวน" is clicked (new state `editId`; also stays open while the amount differs from the suggestion). Split bar dropped from the table row (still in the drawer). "FEFO-covered" lots: text "ใช้ทันก่อนหมดอายุ · ไม่ต้องปล่อย" + "ยืนยันเก็บไว้ใช้เอง". Handlers unchanged. Row height 99 -> 80 px at 1440; buttons end at x 1315, card edge 1407. Checked in browser: toggling "ปรับจำนวน" / "ใช้ค่าแนะนำ" works; release/keep not clicked. Files: `NearExpiryPage.tsx`, `pipeline.css` (`.ne-sum`, `.ne-act-line`, `.ne-edit`, `.ne-qty`, `.ne-adjust`; old `.ne-legend/.ne-lg/.ne-reset` removed).
- Button colour (user: "isn't the button too dark?"): the solid `#1D4ED8` primary repeated on every row was heavy. In the near-expiry decision cell only (`.ne-act-line .btn-p`, `pipeline.css`) it is now a tinted blue (`#DBEAFE` fill, `#1E40AF` text, 600 weight, solid blue on hover); disabled state untouched. Global `.btn-p` unchanged. Verified computed colours in the browser; the pane was too narrow for a visual check of the button itself.
- Stock alerts action slots reordered (user: "make รายละเอียด sit next to อนุมัติคำขอ"): order is now [รับทราบ] [รายละเอียด] [next step]. When a row has no ack (e.g. อนุมัติคำขอ rows) the empty slot is on the far left, so the detail link touches the main button, and the link is still at the same x in every row (measured 1164 / button 1244, ack 1084). File: `StockAlertTable.tsx` only.
- Stock alerts, rows with no main button (user: "put the two-button rows in the middle?"): `sa-actions-2` class when `next` is null; grid is 2 columns with 50 px right padding, so ack + detail are centred under the 3-slot width (centres 1218 vs 1214 px). Trade-off: their x differs from rows that have a main button. Revert = delete `.sa-actions-2` rule in `index.css`. Files: `StockAlertTable.tsx`, `index.css`.

## Seventh pass (page: คลังกลาง · แผนจัดสรร, `?page=pool`; user via `/ui-ux-pro-max`: easier to use, cleaner, cut cluttered text / technical terms)

Same rules: theme kept, no logic/API changes. Files: `pages/PoolAllocationPage.tsx`, `components/AllocationDrawer.tsx`, `data/poolLive.ts`, `data/pool.ts`, `pool.css` (all in `frontend/src/roles/pharmacist/`).
- Head: title "คลังกลาง · แผนจัดสรร" only (removed "Central pool · UI-08 · Allocation plans · UI-09"); one short sub line (removed F-23 20% rule text, Agent). CSV / PDF buttons are still dead (no onClick) - left as they were.
- KPI cards: English tags (POOL · ASM-12, MY APPROVAL, XC-1, NEEDS_DISCUSSION · ASM-16) removed; labels "ในคลังกลาง / รอฉันเห็นชอบ / อนุมัติแล้ว / ต้องหารือ"; shorter sub texts; gap 16, padding 14x16, sub text `#475569`; zero counts dimmed (`.pl-zero`). Discussion alert: no code, no warning glyph.
- Tabs: "รอจับคู่ / รอเห็นชอบ / กำลังส่ง / จบแล้ว"; hint line per tab cut to one short sentence.
- Pool tab: bulk bar now "เลือกทั้งหมด (N)" + "ให้ระบบจัดสรร N ล็อต" (was "ให้ Agent จัดสรรรอบนี้") + one-line hint; the long explanation removed. Table: pool id column ("HB · DEMO-...") and the repeated "ถูกกันไว้" status column removed; checkbox moved to the first column (no "ให้ Agent จัดสรร" text per row); drug cell shows name + HIS code; expiry in two lines (days red when <= 30); "ปล่อยโดย" = hospital + time, no wrap; last column only for "สร้างแผนเอง" / "ไม่มีผู้รับที่ใช้ทัน" + "ถอนกลับมาใช้เอง". Matched-lots drawer table tidied the same way.
- Plans tab: header "ค่าขนส่ง / F-23" -> "ค่าขนส่ง"; "v1" and "Lot" removed/Thai; warning lines in plain Thai; empty-state texts shorter; footer "JOB-06 · จับคู่โดย Agent" and the cost formula removed.
- Messages: removed (audit_log), (UI-14), (XC-1), F-22, "Agent (model)" from notices and batch results.
- Drawer: removed UI-09, NEEDS_DISCUSSION, BR-F2a-013, ASM-16, FR-F2a-xxx, F-22/F-23 headings, A1/A4, XC-1, UI-14, audit_log; raw option code (MERGE_SHIPMENTS ...) now shown as Thai (`OPTION_TH`).
- `poolLive.ts`: agent card titles/notes now "ระบบเสนอแผนนี้" / "แผนจากสูตรสำรอง" / hand-made plan note in plain Thai (the model name and run id no longer shown). `pool.ts`: status labels "ต้องหารือ", "อนุมัติอัตโนมัติ".
- Checked in browser at 1440 (:5174): pool tab (2 lots, checkboxes, no horizontal overflow) and a finished plan drawer; scanned page + drawer text for UI-/JOB-/FR-/F-22/F-23/ASM-/XC-/NEEDS_/audit_log/Agent: none left. Build passes. Not clicked: เลือก/จัดสรร, approve, reject, cancel (they write data).
- Not touched: ManualPlanDialog, mock plan notes inside `pool.ts` (mock mode only), shell text ("Agent พร้อม" top bar).
- Pool page tabs (user: rename "กำลังส่ง" to "อนุมัติแล้ว เตรียมจัดส่ง" and design the tabs better): label is now "อนุมัติแล้ว · เตรียมจัดส่ง" (also in the batch notice and empty state). Tabs reuse the underline style of the stock alerts page (`sa-tabs`, `role=tablist/tab`, `aria-selected`); the hint sentence moved to its own line under the tabs; zero counts dimmed (`.sa-tabs .cnt-zero` in `index.css`). Checked in browser at 1440; build passes (one stray closing tag from my edit fixed). Files: `PoolAllocationPage.tsx`, `index.css`. Near-expiry page tabs still use the old pill style.
