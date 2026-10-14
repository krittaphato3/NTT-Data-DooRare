---
title: Transport tracking UI (UI-14)
date: 2026-10-14
author: claude
ai: Claude Code
tags: session, frontend, transport, warehouse
summary: UI-only Transport tracking page (warehouse role) on feature/dashboard-transport-tracking
---

## Goal

- New branch `feature/dashboard-transport-tracking` from `feature/dashboard-pharma`; build UI-14 Transport tracking to match the Claude Design mockups (React, UI only).

## Done

- `roles/warehouse/{pages,components,data,transport.css}`: sync bar, direction tabs, SM-6 status tiles, filterable table, shipment drawer (stepper, items, photos, local queue, cancel consent), receiver-confirm form, audit history drawer.
- Shared chrome made configurable (defaults keep dashboard unchanged): `Sidebar` (nav/brand/footer props), `TopBar` (`variant="ops"` + `user`), `AccountMenu` (`user`, `chevron`), new `LangToggle`; extra icons in `common/icons.tsx`.
- `App.tsx`: `?page=transport` renders the warehouse screen (no router yet).
- Design refs copied to `Mockups/Transport Tracking/` (3 `.dc.html`, no vendored runtime).
- Verified: `npm run build` ok; 1440px matches both mockup screenshots (341 pending-sync, 334 receipt); confirm/undo, filters work; phone layout ok; dashboard unchanged.

## Update: pharmacist read-only view

- `TransportTrackingPage role="PHARMACIST"` (`?page=transport&role=pharmacist`): no photo upload/status/receipt/sync/cancel controls; read-only notice bar; pharmacist shell (standard TopBar + friend's `getNavForRole`).
- `App.tsx` `withLinks()` points the `tr` (and pharmacist `dash`) sidebar hrefs at real routes; `navigation.ts` untouched.
- Merged `origin/feature/dashboard-pharma`; conflicts resolved by adopting upstream `Sidebar items` API.

## Decisions

- Drawer auto-opens only at >=1024px (full-screen on phones would hide the list).
- Offline bar follows `navigator.onLine`; queue/photo actions are mock (no IndexedDB yet).
- Mock data mirrors the design (10 rows, HA = รพ.สมุทรปราการ).

## Files touched

- `frontend/src/roles/warehouse/**`, `components/layout/{Sidebar,TopBar,AccountMenu,LangToggle}.tsx`, `components/common/icons.tsx`, `data/{navigation,session}.ts`, `App.tsx`, `Mockups/Transport Tracking/`, `.claude/launch.json`.

## Errors encountered

- `node_modules` absent in checkout; ran `npm ci`.
- Row action buttons sit under the 500px drawer at 1440px (same as mockup).

## Next steps

- Driver PWA states (`ShipmentsStates.dc.html`: offline, sync error, 409, loading, empty), real IndexedDB queue, API wiring (API-F2a-012..017), proper routing.
