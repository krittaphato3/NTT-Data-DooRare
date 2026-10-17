---
title: Driver role and UI-14 Transport Tracking PWA implementation
date: 2026-10-17
author: antigravity
ai: Antigravity (Gemini 3.8 Flash Tiered)
tags: session, frontend, driver, transport, pwa, offline, rbac
summary: Implemented the DRIVER role with UI-14 offline PWA console, vehicle/queue monitoring, and role switcher.
---

## Goal

- Implement the `DRIVER` role according to `specification/01-foundation.md` (ASM-44, least privilege SEC-002: assigned tasks only), `specification/09-ui-integrations-jobs.md` (UI-14 offline-first PWA), `10-security-nfr-stack.md` (NFR-011), and state machine `SM-6`.
- Provide Driver console pages matching the existing application theme and design tokens.
- Support offline queue indicators, photo evidence capture with PDPA privacy guardrails (SEC-006, ASM-27), and milestone status transitions.

## Done

- **Driver Data**: Created `frontend/src/roles/driver/data/session.ts` with `DRIVER_USER` (`คุณสมชาย แก้วกล้า`, initial `ส`), vehicle profile, and mock notifications. Created `driverTasks.ts` with assigned shipment filters, cold chain guidelines (BR-F1b-012, 6-hour cool-box window), emergency contacts, and offline events.
- **Navigation**: Created `frontend/src/roles/driver/data/navigation.ts` with driver pages (`transport`, `sync`, `docs`). Updated shared `ROLE_QUERY` and `homeHrefFor('DRIVER')` in `src/data/navigation.ts`.
- **UI Components**:
  - `DriverTaskCard.tsx`: Responsive card for smartphone/tablet with milestone progress and quick action buttons.
  - `DriverPhotoModal.tsx`: Photo upload dialog with PDPA rules banner (no faces/patient identifiers) and compression indicator (≤ 1.5 MB).
  - `DriverTaskDrawer.tsx`: Full delivery timeline (SM-6), cargo specs, cold-chain guidelines, hospital dock contacts, photo gallery, and action buttons.
- **Pages**:
  - `DriverTransportPage.tsx`: Primary UI-14 Driver Mobile PWA task console with offline `SyncBar`, simulation toggle, filter tabs, task cards, drawer, and photo modal.
  - `DriverSyncPage.tsx`: Offline storage and IndexedDB quota monitor (NFR-011), event sync log table, vehicle status, and hospital emergency contact directory.
- **Shell & Navigation Integration**:
  - `AccountMenu.tsx`: Added interactive Role Switcher dropdown supporting seamless switching between Pharmacist, Warehouse, Hospital Admin, and Driver.
  - `App.tsx`: Wired `?role=driver`, routing, driver sidebar, ops-style TopBar, and main view rendering.
  - `TransportTrackingPage.tsx`, `ShipmentTable.tsx`, `ShipmentDrawer.tsx`: Updated `TransportRole` to include `'DRIVER'` and handled driver-specific actions.
- **Verification**: `cd frontend && npm run build` passed with zero errors (`tsc --noEmit` + `vite build`).

## Decisions

- Preserved least-privilege scoping: Driver sees only assigned tasks (`คุณสมชาย แก้วกล้า`) without access to hospital-wide inventory or unassigned requests.
- Maintained exact design tokens (`--bg`, `--surface`, `--ink`, `--primary`, typography, status badge chips) for complete consistency with Pharmacist and Warehouse themes.
- Driver milestone actions: `LOADED` → `ออกเดินทาง` (`IN_TRANSIT`), and `IN_TRANSIT` → `ถึงปลายทาง + รูป` (`ARRIVED`). Warehouse officer handles dispatch and final receipt.

## Files Touched

- `frontend/src/roles/driver/data/session.ts` (new)
- `frontend/src/roles/driver/data/navigation.ts` (new)
- `frontend/src/roles/driver/data/driverTasks.ts` (new)
- `frontend/src/roles/driver/components/DriverTaskCard.tsx` (new)
- `frontend/src/roles/driver/components/DriverPhotoModal.tsx` (new)
- `frontend/src/roles/driver/components/DriverTaskDrawer.tsx` (new)
- `frontend/src/roles/driver/pages/DriverTransportPage.tsx` (new)
- `frontend/src/roles/driver/pages/DriverSyncPage.tsx` (new)
- `frontend/src/roles/warehouse/pages/TransportTrackingPage.tsx`
- `frontend/src/roles/warehouse/components/ShipmentTable.tsx`
- `frontend/src/roles/warehouse/components/ShipmentDrawer.tsx`
- `frontend/src/data/navigation.ts`
- `frontend/src/components/layout/AccountMenu.tsx`
- `frontend/src/App.tsx`

## Errors Encountered

- Single unused import in `DriverTransportPage.tsx` (`TransportStatus`) flagged by `tsc --noEmit`; removed unused import and build passed cleanly.

## Next Steps

- Await user review and instructions.
