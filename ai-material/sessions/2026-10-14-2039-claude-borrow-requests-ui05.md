---
title: Borrow requests UI-05
date: 2026-10-14
author: claude
ai: Claude Code
tags: session, frontend, borrow-requests, pharmacist
summary: UI-only Borrow requests page with detail drawer for pharmacist
---

## Goal

- Build UI-05 Borrow requests (our hospital = borrower) to match the design capture `UI-05 Borrow requests – BR-2026-000124 detail.pdf` (user-supplied, not in repo).

## Done

- `roles/pharmacist/pages/BorrowRequestsPage.tsx` at `?page=requests` (sidebar `req` link wired in `App.tsx`): UI-05/UI-06 tabs, SM-1 status tiles (5 groups), search plus urgency/context/period filters, 9-row table, detail drawer (banner + live countdown, F-20 stop rule, lender legs, Agent note).
- Components: `BorrowTable`, `BorrowDrawer`, `BorrowStatusTiles`, `BorrowBadges`; data `data/borrow.ts`; styles `borrow.css`; new `send` icon.
- Approve/reject on pending rows is local state (row moves to IN_PROGRESS or CANCELLED).
- Verified: `npm run build` ok; 1440px matches the capture; 390px has no overflow, tiles go to 2 columns, drawer starts closed.

## Decisions

- Generic ops CSS (`.dirs/.dir*`, `.tbl*`, `.sel`, `.tr-search`, `.tr-filters`, `.tr-drawer*`, `.dlr`, `.tr-title`, `.sec-h`, `.sub`) moved verbatim from `warehouse/transport.css` into `index.css` because it is now shared by two roles. Class names are unchanged.
- UI-05 uses the ops top bar (scope pill, Agent, TH/EN) with the pharmacist user and no footer, as in the capture.
- The UI-06 tab is inert until that screen exists.
- Detail drawer starts closed and opens only when a row is clicked (user request).
- Detail data for rows other than 000124 is invented to match the table text.

## Files touched

- `frontend/src/roles/pharmacist/**` (new borrow files), `App.tsx`, `index.css`, `roles/warehouse/transport.css`, `components/common/icons.tsx`.

## Errors encountered

- Running `npm ci` while `npm run dev` is running wipes `node_modules` and then fails with EPERM on the locked rollup binary. Recover with `npm install` (no wipe, lockfile unchanged).

## Next steps

- UI-06 lender queue, UI-10 manual request form, history drawer, API wiring.
