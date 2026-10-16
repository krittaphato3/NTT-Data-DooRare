---
title: Return obligations + Waive (Phase 2C)
date: 2026-10-16
author: buffy
ai: Buffy (Freebuff)
tags: session, frontend, hospital-admin, borrow-requests, return-obligations, rbac, audit
summary: HOSPITAL_ADMIN gets a read-only ภาระการคืน sub-tab on Borrow requests plus the API-XC-005 waive and the API-F1b-012 escalate-manual, gated in lib/rbac.ts and audited
---

## Goal

- Phase 2C (approved scope): "ภาระการคืน · Return obligations" sub-tab in Borrow requests for
  HOSPITAL_ADMIN (drug, hospital, qty, due date, state OPEN/REMINDED/RETURNED/OVERDUE/WAIVED,
  own hospital + counter-party legs on our own requests only).
- HOSPITAL_ADMIN-only waive (API-XC-005): confirm dialog + required reason, success banner,
  state → WAIVED, row appears in the audit mock data.
- "เพิ่มผู้ให้ยืมด้วยตนเอง" (escalate-manual, API-F1b-012): confirm dialog + reason, after escalation only.
- New `data/obligations.ts`; new `can()` actions only in `lib/rbac.ts` with spec citations.

## Done

- **Data** `roles/pharmacist/data/obligations.ts` — 7 `RO-…` rows derived from our own borrows (we are
  always the debtor): OPEN 3 · REMINDED 1 · RETURNED 1 · OVERDUE 1 · WAIVED 1, with SM-7 /
  FR-XC-003 (due−7, due−1) / F-30 (partial returns) / BR-XC-013 (`BLOOD_REPLACEMENT`) metadata and
  `WAIVABLE_STATES = ['OPEN','OVERDUE']`.
- **UI** `roles/pharmacist/components/ObligationTable.tsx` (state tiles + table + exported `waiveGate()`);
  `BorrowRequestsPage` adds the HA-only third `.dirs` card, a `view` state that swaps the table card,
  the success banner and the two ReasonDialogs; `BorrowDrawer`'s escalate button now carries
  `escalateManual` and exists only when `status === 'ESCALATED'`.
- **RBAC** `escalateManual` added to the Action union, all 10 matrix rows and `ACTION_OWNERS`
  (PHARMACIST + HOSPITAL_ADMIN, API-F1b-012). `waiveReturn` already existed from Phase 2A.
- **Audit** `appendAuditEntry()` (new row's `prev_hash` = current head, `borrow_request` added to
  `ENTITY_TYPES`); `verifyAuditChain()` replaced the canned `CHAIN_VERIFY_OK` with a real walk.
- **Verified** `npm run build` exit 0; module check 43/43; browser check 80/80, 0 console/page errors.

## Decisions

- (a) Sub-tab **HA-only** (`role === 'HOSPITAL_ADMIN'`); the waive is additionally `can(role,'waiveReturn')`
  and blocked controls are disabled with a tooltip. Gate asserted at module level per role and in the
  DOM for the state branch (no other shell ever sees the tab).
- (b) Waive appends to `AUDIT_ENTRIES` at runtime through one helper; the chain continues from the head
  so "ตรวจสอบ hash chain" still passes. In memory only, no localStorage → **lost on reload** (recorded
  as a mock limitation and asserted as such).
- SM-7 links only `OPEN → WAIVED` and `OVERDUE → WAIVED`, so REMINDED/RETURNED/WAIVED rows show a
  disabled button with the SM-7 reason instead of a silent no-op.
- escalate-manual keeps the request `ESCALATED` and adds one manual leg, rendered without an invented
  Si (`BorrowLeg.si` became optional); the dialog stays reason-only per the approved plan, so the
  mock cannot name the added lender yet.
- Two obligation rows belong to requests outside the request table's curated 9 (BR-2026-000081,
  BR-2026-000068) to carry the REMINDED and WAIVED states; `RO-2026-000071` reuses the reason/actor of
  audit fixture AUD-0005817 so UI-18 and the sub-tab agree.

## Files touched

- new: `frontend/src/roles/pharmacist/data/obligations.ts`,
  `frontend/src/roles/pharmacist/components/ObligationTable.tsx`
- edited: `roles/pharmacist/pages/BorrowRequestsPage.tsx`, `roles/pharmacist/components/BorrowDrawer.tsx`,
  `roles/pharmacist/data/borrow.ts` (`si?: number`), `lib/rbac.ts`,
  `roles/hospital-admin/data/audit.ts`, `roles/hospital-admin/pages/AuditLogPage.tsx`
- **not** touched: `AGENTS.md`, `specification/rbac.md` (both were already dirty before this session)
- temp, deleted after the run: `.verify-2c.mjs`, `frontend/.verify-2c-ssr-entry.tsx` + its bundle

## Errors

- Two browser assertions were wrong expectations, not app defects: a FULFILLED request's drawer has no
  action buttons at all (no "ยกเลิกคำขอ"), and a non-HA shell does reach `?page=audit` (pre-existing 2A
  routing). Replaced with stronger checks (escalate control absent, not merely disabled; no obligations
  DOM in any non-HA shell).
- `vite preview` binds IPv6 localhost only on macOS — probe `http://localhost:4173`, not `127.0.0.1`.
- The appended audit row cannot be seen in UI-18 in a browser run: every in-app link is a full-page
  navigation, so the in-memory log resets before Audit renders. Proven instead by rendering the real
  `AuditLogPage` right after the append (SSR probe): row id, obligation, actor and WAIVE label present,
  chain ok over 10 rows; the verifier also fails on a deliberately broken link (negative control).

## Next steps

- Phase 2D+ per the user's plan.
- Optional: commit the browser suite as `scripts/e2e-return-obligations.mjs` (80 checks, currently deleted).
- A real API or session persistence would let a waive survive navigation and reload.
