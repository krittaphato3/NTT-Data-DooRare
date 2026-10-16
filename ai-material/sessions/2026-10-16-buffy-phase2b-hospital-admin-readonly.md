---
title: Hospital Admin read-only adaptations (Phase 2B)
date: 2026-10-16
author: buffy
ai: Buffy (Freebuff)
tags: session, frontend, hospital-admin, rbac, read-only
summary: HOSPITAL_ADMIN opens the pharmacist/warehouse screens read-only via an optional role prop and can() in lib/rbac.ts
---

## Goal

- Phase 2B: let HOSPITAL_ADMIN open the existing pharmacist/warehouse pages (dashboard, alerts,
  borrow requests, lender queue, near-expiry, pool/allocation, incidents, transport, documents,
  reports) read-only, gating every write through `can()` in `lib/rbac.ts` — no page forked, no
  pharmacist/warehouse behaviour changed.

## Done

- Optional `role?: RoleCode` added to 10 pages + 10 components/drawers; default is the owning role,
  so `App` only passes `HOSPITAL_ADMIN` for that shell and every other caller keeps today's DOM.
- `App.tsx`: passes `role` per page, allows the 10 operational pages for HA (`HA_READ_ONLY_PAGES`),
  and no longer flips to the warehouse shell when HA opens transport.
- `data/navigation.ts`: `withRole`/`ROLE_QUERY` moved here from `App.tsx` and exported, plus
  `homeHrefFor(role)`; every page's breadcrumb now uses it. `VISIBLE_KEYS.HOSPITAL_ADMIN` = the full
  allowed set (13 links + admin group). Lender queue's `window.location.search` redirect uses `withRole`.
- `lib/rbac.ts`: 6 new actions (`createBorrowRequest`, `acknowledgeAlert`, `transportStatus`,
  `manageIncident`, `printDocuments`, `cancelRequest`), `mayActFor()`, `roleName()`, `ACTION_OWNERS`,
  `requiredRoleHint()` → `ต้องเป็นเภสัชกร (PHARMACIST)` style tooltips.
- PageHeader: HA gets the own-hospital scope label and a locked (disabled) hospital selector; its two
  action buttons are hidden for HA.
- Verified: `npm run build` green after every batch; browser suite 97/97 with 0 console/page errors.

## Decisions

- **Hide vs disable**: authoring/sending actions are hidden (incident writes, alert ack/snooze,
  create-borrow, kit pack, incident close, ETA/actual-used inputs); per-row decisions the viewer can
  see stay visible but `disabled` with a tooltip naming the owning role.
- `mayActFor(role, ownerRole, action)` = `role === ownerRole || can(role, action)`. The page's owner
  keeps its existing demo controls (rule 3 of the brief), any other role is gated strictly by §5.2.
- Transport's operate/read-only split is an *endpoint* rule (API-F2a-012), so it uses the new
  `transportStatus` action (`canOperate = can(role, 'transportStatus')`) instead of `updateInventory`,
  which PHARMACIST also has.
- `cancelRequest` was added beyond the 5 actions listed in the approved plan: the borrow-drawer
  "ยกเลิกคำขอ" button (§4.4, PHARMACIST only) had no other action that would produce an honest tooltip.
- Reports stays gate-free (read-only by construction) and incident **scenario switcher** stays open as
  a demo control; near-expiry/pool CSV+PDF exports stay (read-only data export).
- Spec conflicts left as-is and flagged: §5.2/§7 give HA ❌ on viewing F1/reports, the brief puts them
  in 2B scope — the brief wins; pharmacist keeps F3 controls it only views (👁) in §4.3.

## Files touched

- `frontend/src/App.tsx`, `frontend/src/data/navigation.ts`, `frontend/src/lib/rbac.ts`
- `frontend/src/roles/pharmacist/pages/*` (Dashboard, StockAlerts, BorrowRequests, LenderQueue,
  NearExpiry, PoolAllocation, IncidentConsole, Documents, Reports)
- `frontend/src/roles/pharmacist/components/*` (PageHeader, AlertsPanel, AgentSuggestion,
  RequestStatusPanel, MiddleRow, StockAlertTable, BorrowDrawer, NearExpiryDrawer, AllocationDrawer,
  DocumentDrawer)
- `frontend/src/roles/warehouse/pages/TransportTrackingPage.tsx`
- Untouched: `AGENTS.md`, `specification/**`, all `data/*.ts`, `KpiRow`, `BottomRow`,
  `StockAlertSummary`, `StockAlertToolbar`, `BorrowTable`, `BorrowBadges`, `BorrowStatusTiles`,
  `DocPaper`, warehouse components.

## Errors encountered

- tsconfig has `noUnusedLocals`/`noUnusedParameters`, so a page could not simply *accept* `role`
  without using it — each page therefore got its breadcrumb switched to `homeHrefFor(role)` in the
  same pass, and components got their prop only in the batch that implements the gate.
- Port 5173-5176 were already held by stale dev servers; the new one came up on 5177 and binds IPv6
  `[::1]` only, so tests must use `http://localhost:5177`, not `127.0.0.1`.

## Next steps

- Phase 2C: return-obligations sub-tab in Borrow requests + HOSPITAL_ADMIN-only Waive (API-XC-005,
  reason required) and escalate-manual (API-F1b-012).
- §23 vs `config-defaults.yaml` divergences to settle (security/retention groups absent from §23;
  §23's emergency travel speeds 20/35/60 km/h have no key in the defaults file).
