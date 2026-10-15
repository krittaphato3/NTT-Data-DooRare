---
title: Stock alert queue UI (UI-02)
date: 2026-10-14
author: codebuff
ai: Buffy (Freebuff)
tags: session, frontend, alerts, forecast, pharmacist
summary: UI-only Stock alert queue page (pharmacist role) at ?page=alerts
---

## Goal

- Build UI-02 "แจ้งเตือนสต็อกและการพยากรณ์ / Stock alert queue" as a dedicated pharmacist page (React, mock data, UI only).

## Done

- `roles/pharmacist/data/stockAlerts.ts`: labels/meta (severity, status, `alert_type`), 5 summary cards, tabs, filter/sort options, 14 drug rows (8 with alerts = 5 LOW_STOCK + 2 OVERSTOCK + 1 LOW_CONFIDENCE), `sortAlertRows()` (V → ABC → days, BR-F1a-011), history entries.
- `roles/pharmacist/{components,StockAlertSummary,StockAlertToolbar,StockAlertTable}.tsx` + `pages/StockAlertsPage.tsx`: breadcrumb/header (pharmacy · ประเมิน · แจ้งเตือนล่าสุด · HIS ซิงก์), 5 summary cards, 2 tabs (8 / 14), search (`ชื่อยา / รหัส HIS`), severity + V/E/D chips, sort select, 8-column table (ยา · ABC · คงเหลือ · ใช้ได้อีก · Predict·Total Target + bar · วิธีพยากรณ์ · แจ้งเตือน · actions), ประวัติ + ส่งออก (real CSV of the filtered rows), detail dialog, local ack/snooze/create state.
- `index.css`: page-scoped `.sa-*` block (cards, toolbar, chips, bar, actions) + `contain: content` on `.sa-scroll`.
- `App.tsx`: `?page=alerts` route, `alerts` sidebar href, active nav key.

## Decisions

- Styling matched the repo (design-token CSS + built-in `Icon`) instead of Tailwind/lucide — no new dependencies (user confirmed).
- Scoped the containment fix to `.sa-scroll`; the same overflow exists on the shared `.scroll-x` (dashboard page still pans ~199 px at 390 px) and was left alone.

## Files touched

- `frontend/src/roles/pharmacist/{data/stockAlerts.ts,components/StockAlert*.tsx,pages/StockAlertsPage.tsx}`, `frontend/src/index.css`, `frontend/src/App.tsx`.
- `ai-material/sessions/2026-10-14-stock-alert-queue-ui02.md`, `ai-material/context/current-task.md`, `ai-material/INDEX.md` + `.index.json` (regenerated — 26 rows referenced session files never committed to git, so they were dangling).

## Errors encountered

- Wide table grew `documentElement.scrollWidth` (page panned sideways at ≤1024 px) even though `.scroll-x` clipped it; fixed with `contain: content` on the page's own scroll box.

## Verification

- `npm run build` (tsc + vite) passes.
- Playwright (chrome) on `vite preview` → 33 checks pass: header/breadcrumb, 5 cards with counts 5/2/1/0/3, 8/14 tabs, columns, sample rows, search by name + HIS code, severity/VED chips, sort, ack/create/detail/history, CSV (header + 8 rows), no x-overflow at 1440/1024/390, table still scrolls, no console errors, sidebar nav → UI-02 and back.

## Re-verification pass (report artifact)

- Re-ran build (`EXIT=0`) + headless-Chrome harness: **60/60 checks**, 0 console errors, no x-overflow at 1440/1280/1024/768/390/360 px. Thai labels 37/37. No new deps (`frontend/package.json` untouched). `index.css` = 225 insertions / **0 deletions**; `App.tsx` +17/−5.
- **Fix:** `StockAlertTable.actionsFor()` returned `kind:'primary'` for "ดูคำขอ", so it rendered blue instead of the spec's secondary (white + gray border) and the `'secondary'` union member was dead. Now `critical ? 'primary' : 'secondary'`.
- Noted, not changed: `AlertRef.alertId` is populated but unread (kept for API wiring); shared `.scroll-x` still pans the dashboard ~199 px at 390 px (out of the UI-02 file list).
- Report artifact: `artifact/UI-02-verification-report.md` (folder did not exist → default name/format).

## Artifacts reworked to screenshots

- Deleted the markdown report and the `artifact/` folder I had created (untracked; 0 tracked files).
- Captured **25 `ui-02-*.png`** into the existing `artifacts/screenshots/<viewport>/` folders, matching their conventions: PNG, kebab-case, one per section + `full-page`, `ui-02-` prefixed. 8 desktop (1440x900), 1 laptop, 7 phone (390x844), 1 phone-small, 7 tablet (1024x768), 1 tablet-portrait.
- **Nothing pre-existing touched**: pre-flight refused to overwrite, post-flight confirmed `removed=none`; `artifacts/` still 46 tracked, 0 modified/deleted.
- Verification: exit 0, 0/25 failing checks (PNG dims == element/doc box ±1px; blank detector via canvas: colors>10, sd>2, ink>1%). Layout probe: horizontal overflow 0 at all 6 viewports, no card/overlay overlaps, no clipped text.
- Skipped (no such section on UI-02): agent-suggestion, alerts-panel→used `ui-02-alert-table`, near-expiry, nearby-hospitals, recent-activity, request-status-panel, work-history; `ui-02-sidebar` skipped at phone (off-canvas → `ui-02-drawer-open`).
- Not done on purpose: `artifacts/manifest.json` + `index.html` not regenerated (would modify existing tracked files). Note: `npm run capture` does `rm -rf artifacts/screenshots`, so it would delete these unless the script is extended.

## Visual-fix pass (design alignment) — 2026-10-14

- **Goal:** align UI-02 with the design reference ("UI-02 Stock alert queue + UI-03 drawer") per the A–E fix list, then regenerate the screenshots.
- **Removed first:** the 25 `ui-02-*.png` (committed in `f52e89c`) so the new capture was provably fresh; `artifact/` folder and report already gone. Pre-existing Dashboard/Transport screenshots untouched.
- **Fixed (allowed files only):**
  - A: stripped all on-screen English glosses (summary cards, tabs, h1, subtitle, modals); Thai title + uppercase code as two elements with 8px column-gap; Thai-only sub-labels; exact design subtitle; tab = Thai label + count pill; Tenecteplase note = `ไม่ต้องดำเนินการ`.
  - B: verified rows 1–4 badges/actions/BR numbers; chip counts 8/1/3/4 and `แสดง 8 จาก 8` agree.
  - C: left accent border (no icon tile), dark numbers; V/E badge left of the name, triangle removed; severity badges get leading icons; `รับทราบแล้ว` → light-blue (design) not green; red day values when low; two bar markers (blue Predict, green Total Target), red fill below Predict; plain ABC; active chip solid blue; `เรียงตาม` on the sort row, extra sort line removed, count moved under the table; switch-like underline tabs (scoped, shared `.tab` untouched); new `upload` icon for ส่งออก.
  - D: topbar/sidebar differences left untouched (report-only).
- **Verification:** `npm run build` exit 0 (tsc clean, no unused, `package.json` unchanged). Headless-Chrome DOM probe **46/46 pass**. Re-captured **25 `ui-02-*.png`** (fresh) — all valid, size-matched, non-blank. No page h-overflow at 1440/1280/1024/768/390/360.
- **Errors/notes:** first capture used `minmax(220px,1fr)` on `.sa-cards` → 5 cards wrapped to 2 rows at 1440; reverted to `210px` (5 across, equal height 141). `.sa-bar` needed `overflow:visible` so the markers show.
- **Limitation:** the attached design image was not delivered as image data, so I implemented the written A–E list (could not pixel-compare); a visual pass against the actual image is still worth doing.

## Next steps

- Wire `GET /alerts` (API-F1a-005) + ack/snooze POSTs; "สร้างคำขอ" → API-F1b-001.
- UI-03 Forecast Detail from the row's Predict/TT cell; UI-07 link on the near-expiry card.
