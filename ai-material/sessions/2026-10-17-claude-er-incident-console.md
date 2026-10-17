---
title: ER role on incident console
date: 2026-10-17
author: claude
ai: Claude Code
tags: session, frontend, er, incident, rbac
summary: ER shell plus role-aware incident console per RBAC v1.1
---

## Goal

- Build the ER role pages (RBAC role 3, F3) on branch `feature/dashboard-er` (from `origin/frontend-pharma`), extending the existing `IncidentConsolePage`.

## Done

- `?role=er`: ER shell with ops top bar, `ER_USER` (พว.กมลชนก ใจดี), `ER_NOTIFICATIONS`, nav `ER: ['inc']`; every ER URL lands on the incident console.
- `IncidentConsolePage` gets a `role` prop (`'ER' | 'PHARMACIST'`, default pharmacist).
  - ER: report incident, edit triage counts, manual ETA, kit steppers, Agent questions, add lender, request close, actual-used input.
  - New for ER: "ยกเลิกเหตุ (แจ้งผิด)" and plan approval (an edit makes draft v3, then "อนุมัติแผน v3 และส่งคำขอยืมเร่งด่วน").
  - Pharmacist: read-only notice bar; edit controls hidden; print buttons kept.
- Pack tab is view-only for both roles: packing is confirmed by the warehouse officer (RBAC 4.3).
- Verified: `npm run build` ok. Not yet checked in a browser.

## Decisions

- Page left in `roles/pharmacist/` to avoid churn on a teammate's file (Atiwit); ER-only data lives in `roles/er/data/session.ts`.
- Followed RBAC v1.1 (pharmacist F3 view-only) over the summary-tab text "ER และเภสัชกรอนุมัติร่วมกัน". The team should confirm which applies.
- Read-only notice uses inline styles; `.syncbar` lives only in warehouse `transport.css`.

## Files touched

- `frontend/src/App.tsx`, `data/navigation.ts`, `roles/pharmacist/pages/IncidentConsolePage.tsx`, `roles/er/data/session.ts`.

## Errors encountered

- `git switch -c X origin/frontend-pharma` sets the upstream to frontend-pharma. Ran `git branch --unset-upstream` so a plain `git push` cannot land on frontend-pharma.
- `npm run dev` must run inside `frontend/` (the root package.json only has the capture scripts).

## Next steps

- Browser pass for both roles; decide the joint-close wording; existing S2 "บันทึก" still calls `alert()`.
