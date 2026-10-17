---
title: ER role structure moved out of pharmacist
date: 2026-10-17
author: Alongkorn
ai: claude
tags: session, frontend, er, structure
summary: Incident console page/data moved to roles/er; ER owns its sidebar like warehouse/driver
---

## Goal

- Make ER folder layout match other roles; stop mixing ER code into `roles/pharmacist`.

## Done

- Branch `fix/frontend-emergency` (from `frontend`, local only).
- `git mv` pharmacist → er: `pages/IncidentConsolePage.tsx`, `data/incident.ts` (content unchanged, pure rename).
- New `roles/er/data/navigation.ts` (`getErNav`, `erHref`, `ErPage`), modeled on driver nav; adds group header "งานฉุกเฉิน (ER)".
- `App.tsx`: imports from `roles/er`; ER uses `getErNav('incident')`. Pharmacist/hospital-admin still render the same page (view-only via `mayActFor`).
- `frontend/src/README.md` layout updated.

- Split the 2,010-line page into `roles/er/components/*` (IncidentFrame, Plan/Borrow/Pack/Summary panels, Intake/Cancel modals, cards) with per-page state.
- 9 ER pages (`?role=er&page=`): dashboard, incidents, plan, borrow, pack, summary, documents, transport, drugs. `ErPageSwitch` renders them; `erPageFromQuery()` reads the URL.
- `IncidentConsolePage` is now a thin tabbed wrapper (pharmacist / hospital-admin, view-only).
- Reused WH pages: `TransportTrackingPage` (+ `ER_STAFF` read-only), `WhDrugsPage` (new `homeHref` prop).
- `ER_HOME_HREF` -> `?page=dashboard&role=er`.

## Decisions

- State is per page (like other roles), not shared across pages.

## Files touched

- `frontend/src/App.tsx`, `frontend/src/data/navigation.ts`, `frontend/src/roles/er/**`, `roles/warehouse/pages/{TransportTrackingPage,WhDrugsPage}.tsx`, `frontend/src/README.md`.

## Errors

- DOM-hash snapshot script lost after reload; verified instead by pure-rename diff (0 line changes), `tsc`, `npm run build`, and visual check of ER + pharmacist views.

## Next steps

- Verified: tsc, build, all 9 ER pages + pharmacist view render. No behavior diff checked pixel-wise.
- Do not push/merge until the user says so.
