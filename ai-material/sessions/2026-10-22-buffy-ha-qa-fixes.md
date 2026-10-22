# HA (Step 8) QA fixes — FIX mode

## Goal
Fix the findings from the HOSPITAL_ADMIN Step 8 QA sweep, in severity order, one branch per
finding group, each gated, merged into `feature/backend-api` and pushed.

## Done
- F-01 (High) + F-02 (Medium) — `fix/role-hospital-admin-users-errors` @ `6e986a4`, merge `0ebb5bd`
- F-03 (Medium) — `fix/role-hospital-admin-route-guard` @ `fdece12`, merge `2f0352f`
- F-04 (Medium) — `fix/role-hospital-admin-hospital-scope` @ `b42da60`, merge `2e704dc`
- All three pushed; `feature/backend-api` is 0/0 with origin.
- Servers started for testing stopped (backend PID 6854, Vite PID 7078).

## Findings
- **F-01 High** — HA write errors (409 CONFLICT, 422 ROLE_CONFLICT, 409 SELF_LOCKOUT/LAST_ADMIN)
  rendered only in a page banner *behind* the modal scrim (z-index 100), so invite/edit/suspend
  dialogs gave no feedback. FIXED: `error` prop on `UserFormModal` + `ReasonDialog`, rendered inside
  the dialog; stale banner cleared when each dialog opens.
- **F-02 Medium** — 4 garbled Thai strings in `UserManagementPage` errors. FIXED (ขถืข→ของ,
  รพาย→โรงพยาบาล, ไม่สามาร→ไม่สามารถ ×2).
- **F-03 Medium** — `?page=users|audit|config` rendered the full HA screen for any logged-in role;
  the guard only ran when `hospitalAdmin` was true. Server already 403'd the data, so no leak, but
  the shell rendered. FIXED: guard now denies those 3 pages to every role that is not
  HOSPITAL_ADMIN/SYSTEM_ADMIN. Capability flags alone could NOT be used — PHARMACIST legitimately
  holds `viewAudit`/`configureRules` in `lib/rbac.ts` while `/admin/*` still rejects them.
- **F-04 Medium** — 8 hardcoded "โรงพยาบาลสมุทรปราการ" display sites on the HA screens told any
  other hospital's admin they were viewing the wrong hospital (top bar was already correct).
  FIXED: `useAuth().user.hospitalName` in UserManagementPage / ConfigurationPage / AuditTable /
  UserFormModal.
- **F-05 Low (NEW, not fixed)** — the *live* user-detail modal renders mock `SESSIONS` login-history
  rows (`data/session.ts`) whose device/loc strings still say สมุทรปราการ/บางพลี for a บางบ่อ admin.
  Same class as the known "uses mock data" gaps; left alone per instructions (add to report, don't
  fix).

## Decisions
- Guard by explicit role set (HOSPITAL_ADMIN/SYSTEM_ADMIN) rather than by capability, to match what
  `backend/src/modules/admin/{users,audit,config}.routes.ts` actually allow (`requireRole(...)`).
- Left `HOSPITAL_ADMIN_USER` in `roles/hospital-admin/data/session.ts` untouched: it is only the
  pre-login top-bar fallback and a mock audit actor, not a scope label.

## Files touched
- frontend/src/App.tsx
- frontend/src/roles/hospital-admin/pages/{UserManagementPage,ConfigurationPage}.tsx
- frontend/src/roles/hospital-admin/components/{UserFormModal,ReasonDialog,AuditTable}.tsx

## Errors encountered
- Two `git push` attempts hit tool timeouts; resolved by running push in the foreground with
  `http.lowSpeed*` bounds. Merge commits were unaffected.
- A heredoc commit message containing an apostrophe broke bash parsing; switched to `git commit -F`.

## Next steps
- Consider fixing F-05 (mock login history in the live user-detail modal) or folding it into the
  wider "mock data in live screens" cleanup.
