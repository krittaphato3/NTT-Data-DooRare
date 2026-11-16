---
title: Hide dev/spec codes on pharmacist screens
date: 2026-11-16
author: claude
ai: Claude Code
tags: session, frontend, ui-cleanup, pharmacist, transport, incident
summary: Removed spec IDs, enum codes and model names from user-visible text on pharmacist Dashboard, Borrow & Lend, Incident console, Transport tracking
---

## Goal

- User-facing screens for PHARMACIST must not show dev artefacts (UI-xx, API-xx, FR/SM/BR/ASM/F-xx, enum codes, table names, model names).

## Done

- Borrow & Lend: dropped UI-05/06/10, SM-1/1b/7, API-*, FR-*, F-20/F-13/F-30, BR-XC-013, STOCK_ALERT/MANUAL prefixes, status-tile enum lines, Agent code + model name, Si score, R value, "Legs".
- Incident console (shared with ER): dropped F-27, BR-F3-*, AGT-F3, ASM-13, PATIENTS_ARRIVED, kit_stock, INCIDENT_REPORT/UCEP_REPORT, "one-pass".
- Transport (shared with WH): dropped UI-14/15, SM-6, F1/F2/F3, LOADED/RECEIVED notes, BORROW_LEG/ALLOCATION_LINE, enum line on status tiles and drawer steps; "WH" → "คลัง".
- Sidebar: removed `title={item.ui}` tooltip (all roles). Chat full-screen tooltip → "ขยายเต็มจอ".
- `npm run build` passes.

## Decisions

- Keep Thai descriptions; keep spec codes in comments only.
- Agent fallback text now "ระบบจัดลำดับให้อัตโนมัติ".

## Files touched

- roles/pharmacist: pages/BorrowRequestsPage, pages/LenderQueuePage, components/{BorrowDrawer,BorrowStatusTiles,BorrowTable,ManualBorrowDialog,ObligationTable}, data/{borrow,borrowLive}
- roles/er/live: PlanTables, AgentExtrasPanel, IncidentHeader, LivePack, LiveSummary
- roles/warehouse: pages/TransportTrackingPage, components/{ShipmentTable,ShipmentDrawer,StatusTiles}
- components/layout/Sidebar, components/ai/DooRareChatDrawer

## Errors

- Unused import `maySeePeerStock` after removing Si line; removed.

## Transport UX fixes (same session)

- Paging 20 rows/page (`ShipmentTable` `paging` prop, page state in `TransportTrackingPage`).
- Period filter 7/30/90/all (default 7) on finished tasks only; open tasks always show. Uses new `Shipment.updatedIso` (live only).
- Photo column: "N รูป" or "—" (no "/ 10"). Seed `transport_event.photo_keys` are all empty.
- Backend bug: `concat_ws` returns '' not NULL, so `COALESCE(DRUG_NAME, kt.name)` never fell back to kit name → blank kit rows. Fixed with `NULLIF(..., '')` in transport.repository, documents.service, driver.tools (incidents/returns already had it). Needs backend container rebuild to take effect.

## Next steps

- Backend kit-name fix is NOT in the feat/ui-ux-polish commit (user asked to keep backend out); it stays uncommitted for a backend branch.
- Other roles' pages (warehouse inbox F3 labels, login page UI-xx) still show codes.

## ER screens (same session, branch feat/ui-ux-polish)

- Removed UI-11/12/13/15, "F3 §11", BR-F3-008/032, F-27, ASM-13, F-26 from ER subtitles, plan cards, mock data.
- Agent cards: dropped "F3_T1 · model · status" line (keeps latency) and model name in extras summary.
- Track: "(LATE_FOR_ETA)" removed; travel minutes rounded; inbox "คืนเป็น BLOOD_REPLACEMENT" → "คืนเป็นเลือดทดแทน".
- Documents: status ISSUED/VOID → badge "ออกแล้ว"/"ยกเลิก". Kit picker shows name only (no KIT code).
- Drugs page (shared WhDrugsPage): "WH ดูอย่างเดียว" → "ดูอย่างเดียว"; removed hard-coded "ข้อมูลตัวอย่าง จาก mock" label (mock banner already exists).
- Env: `doorare-db` container was created from another checkout (.gemini/antigravity-ide/scratch) whose schema.sql became a directory; recreated from this repo (named volume `doorare_pgdata`, data kept).
- Open: ER documents page lists mock DOCUMENTS (INC-2026-0014) even in live mode.

## Realtime updates (branch edit-real-time)

- DB: `db/realtime.sql` statement-level triggers on 15 tables → `pg_notify('doorare_change', table)`; mounted as 02-realtime.sql for fresh DBs. Existing DBs (RDS) must run it once.
- Backend: `core/realtime.ts` (LISTEN, auto-reconnect) + `GET /api/v1/events` SSE (requireAuth, 25 s ping).
- Frontend: `lib/liveEvents.ts` shared fetch-based SSE stream (Bearer header), `useLiveRefresh(tables, reload)`; wired into useBorrowRequests, useLenderQueue, useStockAlerts, useDashboardTiles, useNotifications, useTransport (poll 10 s → 60 s fallback), ER `useLoaded`.
- Verified: no-op UPDATE on borrow_request → borrow + lender lists refetch within ~2 s.
- PR #19 review fixes: untracked `.agents/`, `skills-lock.json`, empty `rds-backup-before.sql` (came from commit 7392aaa) + .gitignore; SSE client stops on 401/403 and waits for a token instead of giving up; dashboard also listens to plan_approval/transport_event; near-expiry card link `#UI-07` → `?page=expiry`; nginx `proxy_read_timeout` 300s.
