---
title: QA sweep of every API-backed page - bugs found and fixed
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, qa, frontend, backend, borrow, dashboard, detailed
summary: Opened every API-backed screen per role against the main (seed) DB and compared numbers with SQL; fixed hidden kit/multi-item requests, silent list truncation, fixture numbers shown as real, key warnings
---

> Detailed on purpose (user asked for detailed notes).

## Method

- Browser, main DB (seed), logged in per role (pharmacist HA/HB/HC/HE, warehouse HA/HB, driver HA, hospital admin HA, system admin). For each page: API calls with status >= 400, text anomalies (NaN, undefined, [object, Invalid), banners, tab/tile counts versus SQL on the same DB, console errors/warnings.
- Branch `fix/live-pages-qa-sweep` (from `fix/lists-default-open-only`, which was committed but not yet pushed when this started).

## Bugs found and fixed

1. Borrow requests / lender legs for KIT items (F3) were missing and multi-item requests were duplicated: queries inner-joined `drug_master` (kit items have no drug) and `borrow_request_item` (598 items for 578 requests). Seed had 40 KIT items and 20 extra items; e.g. HA showed 140 of 143 requests. Now `JOIN LATERAL` first item + `LEFT JOIN drug_master / kit_type` (kit name, unit "ชุด"), view has `drug.kind` and `drug.extraItems`. propose / escalate-manual / respond return 422 NOT_SUPPORTED for kit requests. Per-hospital counts from the API now equal SQL (143/136/71/124/104 requests; 273/236/65/43/164 legs, no duplicates).
2. Lists were silently cut at one page (max 200 rows, 100 for documents): transport showed 120 out / 80 in instead of 252 / 163, so direction counts and history were wrong. `apiJsonAll` (services/apiFetch.ts) follows `nextCursor` (up to 10 pages) for transport, borrow requests, lender queue, documents, alerts, inventory summary, return obligations, hospital drugs, hospitals.
3. Sidebar badge "Work inbox" on the WH shell showed waiting/receive counts while the inbox itself (F3-only) is sample data: badge removed (kit badge = open incidents stays).
4. WH dashboard "urgent lender requests" card ran a fake countdown with 0 requests: now "ไม่มีคำขอเร่งด่วนค้างอยู่".
5. WH stock page "แผนและสรุปของ Agent" tab was a fixture shown as real: demo mode only.
6. Return-obligation tab counted history (142 for HA): now open ones (1), list defaults to still-owed; a state tile shows settled ones.
7. Dashboard KPI "lots expiring within 90 days" counted already-expired lots: API now returns `expiringWithin90Days` (future only) and `expired`; KPI shows both.
8. Driver: static "sync" badge and a fixed "last sync 19:12" text removed.
9. React duplicate-key warnings in WH activity panel (code + time not unique): keys include the index.
10. Admin dashboard mixed live numbers with fabricated ones (฿ values, 142 cases, 42.5 min, infra health, daily/hourly charts, top drugs), said "12 hospitals" and a fixed date, showed 109.2 % approved, header online 5 vs card 9, 10 mock accounts: executive value / health / charts / top drugs are demo-only; "12 hospitals" and the date are live; percentages use legs asked of the hospital as the base; users = active staff counted by the hospitals API (40); online = unexpired sessions; logins total shows "–" (no stats API).
11. EMERGENCY requests showed the "MANUAL" label in the drawer.

## Checked and fine (numbers equal SQL)

- PH dashboard KPIs (in progress 19 = 2 + 17, escalated 2, in transit 2, to receive 1), WH dashboard / transport (HA, HB), driver tasks (2 assigned), HA requests tabs (21 open, 116 fulfilled), HB alerts (1 linked alert), admin hospitals (5) and their stats, login feed.
- No API errors (>= 400) on any page after login; no NaN / undefined text.

## Known / not fixed

- Pages with no API still show sample data with the yellow note: ER, incidents, reports, near-expiry, pool, users, config, audit, WH inbox/kit. The accounts tab shows 10 fixture users while the header counts 40 real ones.
- Admin dashboard still has no real total-login statistics; the "approved/rejected/timeout" block counts lender legs, not requests (label unchanged).
- The step-3 notifications checks in my scratch script fail when it runs after the borrow suites (shared DB); pass on a fresh copy (55/55).
- Pages not opened this session: ER pages, near-expiry, pool, reports, HA users / config.
