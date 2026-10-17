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

## Decisions

- Page stays one file for now; splitting the 2,010-line page into `roles/er/components/*` is a follow-up.

## Files touched

- `frontend/src/App.tsx`, `frontend/src/roles/er/**`, `frontend/src/README.md`.

## Errors

- DOM-hash snapshot script lost after reload; verified instead by pure-rename diff (0 line changes), `tsc`, `npm run build`, and visual check of ER + pharmacist views.

## Next steps

- Optional: split page into components; add ER read-only transport / drug pages.
- Do not push/merge until the user says so.
