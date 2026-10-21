---
title: Frontend - live data everywhere an API exists, no silent mock fallback
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, frontend, live-data, fallback, dashboard, notifications, detailed
summary: Central load-failure policy (error banner, 401 -> login, mock only with ?mock=1); dashboards, bell, sidebar counters, admin hospitals now from the API; no-API pages labelled as sample data
---

> Detailed on purpose (user asked for detailed notes).

## Goal / branch

- Stop screens from quietly showing mock data when an API exists (user saw wrong numbers / empty pages after a backend restart). Branch `feature/frontend-live-data-no-mock-fallback`, created from `feature/backend-api` (a8e24cc). Not pushed.

## Central fallback policy (`services/dataSource.ts`, `components/layout/DataStatusBanner.tsx`, `services/apiFetch.ts`)

- A failed load never returns mock by default: the hook stores an empty value, reports the error to a tiny store and `DataStatusBanner` (top of `<main>`) shows "โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ (...) · ลองใหม่".
- Demo mode: `?mock=1` (remembered in localStorage until `?mock=0`): hooks fall back to their fixtures and the banner says "โหมดข้อมูลจำลอง".
- A 401 with a stored token (expired / backend restarted) clears the session and reloads to the login page (`apiFetch`), so it can no longer leave stale or mock data on screen. `/auth/*` calls are exempt.
- Hooks converted to `onLoadFailure` / `onLoadSuccess`: useBorrowRequests, useLenderQueue, useDocuments, useStockAlerts, useTransport, useHospitalDrugs, notifications, dashboard tiles, hospitals. Pages that picked mock for "not live" (BorrowRequests, LenderQueue, StockAlerts, WhStock) now use mock only when `source === 'mock'`.

## Now live (was mock)

- Sidebar counters (all shells): `GET /dashboard` tiles via `App.tsx liveBadges` (pharmacist/HA: alerts, requests = pending+escalated, lender queue, near-expiry, pool, transport; WH: inbox = waiting dispatch + to receive, transport, kit = open incidents; driver: assigned tasks; ER: open incidents; system admin: hospital count). Failure hides the badges.
- Notification bell: `GET /notifications?unread=true`, "อ่านแล้ว" calls `POST /notifications/{id}/read`; refresh every 60 s (`lib/useNotifications.ts`, `services/notificationsApi.ts`, TopBar props `unreadCount`, `onRead`). Verified with a test row (shows 1 -> mark read -> badge gone; test row deleted).
- Pharmacist dashboard: KPI row from `/dashboard` (stockout-rate card shows "–", no API); alerts panel from `useStockAlerts` (ack / snooze call the API; buttons go to alerts/requests pages; tabs: all / low stock + order / linked); request status panel from `useBorrowRequests` (requests we made) and `useLenderQueue` (asked of us). The Agent suggestion, nearby hospitals, work history, near-expiry, network activity and Agent summary panels have no API: shown only with `?mock=1`.
- Admin hospitals tab: `GET /hospitals?stats=true` (new backend `stats` per hospital: requests as borrower, legs as lender, approved/rejected/timeout, dispatched/in transit, active staff), create/update via `POST` / `PATCH /hospitals` (version check). 5 real hospitals instead of 12 fixtures. `detailedLogs` is empty (no API).
- WH dashboard: to-do from live transport tasks (load waiting outbound, confirm arrived inbound), activity from live task history, inbox/pack counters 0 on live data, kit stock panel demo-only.

## Still sample data (no API yet) - labelled

- A yellow note in the shell ("หน้านี้ยังแสดงข้อมูลตัวอย่าง...") on: all ER pages, incidents, reports, near-expiry, pool & allocation, user management, config, audit log, admin accounts/config/audit tabs, WH inbox and kit pages. These wait for F2/F3/reports/admin APIs. The WH inbox is F3-only by design (confirm packing) so it is not derivable from existing endpoints (my earlier audit table listed it as "can be built from existing APIs" - that was wrong).

## Verification

- Browser on the main DB: login via 401 path (bad token -> login page), error banner with backend stopped (rows 0, badges hidden), badges 1/2/5/4 for HA pharmacist, WH HB dashboard (badge 1, 8 activity rows, no kit panel), admin hospitals (5 rows, badge 5), bell flow.
- `npx tsc --noEmit` clean (frontend and backend). No backend test suite re-run for the small `stats` addition (it only runs on `?stats=true`); API checked by curl.

## Gaps / next

- No automated frontend tests. Pages not individually opened in the browser this session: ER pages, near-expiry, pool, reports, HA user/config/audit (only the note logic was added).
- Cancel after approval API, EMERGENCY context, Agent still pending; WH/driver/ER sidebars use the new counters but were only spot-checked (WH).
