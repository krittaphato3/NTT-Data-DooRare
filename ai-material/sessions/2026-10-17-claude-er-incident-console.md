---
title: ER role on incident console
date: 2026-10-17
author: claude
ai: Claude Code
tags: session, frontend, er, incident, rbac
summary: ER_STAFF shell plus role-aware incident console on team RBAC
---

## Goal

- Build the ER role pages (RBAC role 3, F3) on `feature/dashboard-er`, extending `IncidentConsolePage`. PR #12 targets `frontend`.

## Done

- Merged `origin/frontend` (29 commits: warehouse, driver and hospital-admin shells, `lib/rbac.ts`) and resolved conflicts on top of the team's RBAC.
- `?role=er` selects the ER_STAFF shell: `ROLE_QUERY.ER_STAFF = 'er'`, `ROLE_NAV.ER_STAFF = ['inc']`, `ER_HOME_HREF`; ops top bar, `ER_USER`, `ER_NOTIFICATIONS`; every ER URL lands on the incident console.
- `IncidentConsolePage`: owner role is now ER_STAFF (`mayActFor(role, 'ER_STAFF', 'manageIncident')`), so the pharmacist is view-only. Also added: a read-only notice, the "ยกเลิกเหตุ (แจ้งผิด)" button, and plan approval (an edit makes draft v3; approval needs `approveIncidentPlan`). Print uses `printDocuments`, so the pharmacist can still print.
- Verified in the browser: ER controls work (stepper → approve v3) and links keep `role=er`. The pharmacist sees the notice and disabled controls with tooltips. Build ok.

## Decisions

- Follow the team convention: disable controls and show a `requiredRoleHint` tooltip rather than hiding them.
- `lib/rbac.ts` makes the spec primary over rbac.md, so the ER pack-kit permission (`manageIncident`) is kept; rbac.md would make packing warehouse-only.
- Page stays in `roles/pharmacist/` to limit churn on a shared file.

## Files touched

- `frontend/src/App.tsx`, `data/navigation.ts`, `roles/pharmacist/pages/IncidentConsolePage.tsx`, `roles/er/data/session.ts`.

## Errors encountered

- `git switch -c X origin/<branch>` sets that branch as upstream; unset it before pushing.
- PR conflicts appeared because the PR base was `frontend`, not `frontend-pharma`. Check the PR base before branching.

## Next steps

- Team decision on the summary-tab text "ER และเภสัชกรอนุมัติร่วมกัน" vs pharmacist view-only. The existing S2 "บันทึก" still calls `alert()`.
