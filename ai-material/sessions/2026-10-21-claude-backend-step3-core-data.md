---
title: Backend step 3 - hospitals, catalogues, inventory, notifications, dashboard
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, backend, inventory, catalog, hospitals, dashboard
summary: Read APIs for core data plus hospital create/update; WH drug list and dashboard wired; 55 checks pass
---

## Goal

- Step 3 of the solo API plan, on branch `feature/backend-step3-core-data-reads` (from `feature/backend-api`).

## Done

- `GET/POST/PATCH /hospitals` (+ `/{id}`): any role reads, SYSTEM_ADMIN writes with version lock and audit.
- `GET /drug-master`, `/central-items`, `/kit-types`, `/hospital-drugs` (+ `/{id}` with mapping candidates).
- `GET /inventory` (`view=lots|summary`, FEFO order, own hospital only), `GET /notifications` + `POST .../read`, `GET /dashboard`.
- Frontend: WH/ER drug list reads `/hospital-drugs`; WH dashboard transport tiles use live tasks.
- Tests (scratch scripts, not in repo): 55 step-3 checks pass; earlier suites still pass.

## Decisions

- `/dashboard` counts straight from tables, so it works before F1/F2/F3 APIs exist; same tiles for every role.
- Region-wide users (no hospital, no region) see all hospitals; hospital-bound users stay in their region.
- `/hospital-drugs` and `/inventory` are not in openapi; added for the warehouse and ER screens.

## Files touched

backend/src/modules/{hospitals,catalog,inventory,notifications,dashboard}, core/scope.ts; frontend drug/dashboard components, services/catalogApi.ts.

## Errors

- Duplicate `id` column (hospital_drug + drug_master) made list ids wrong; fixed by not selecting `dm.id`.
- System admin got an empty hospital list (null region); fixed in the region filter.

## Known gaps

- Admin hospitals tab still mock: DB has 5 hospitals vs 12 mock ones, and its request statistics need F1 data.
- No producer of notifications yet; the header bell is still mock. WH stock/expiry pages need alerts and F2 APIs.
- Dashboard panel shows at most 200 transport tasks (list limit).

## Next steps

- Step 4 (F1a: `/alerts`, classification, `POST /forecasts/runs`) on a new branch from this one.
