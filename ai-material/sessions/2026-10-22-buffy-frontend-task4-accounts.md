# Frontend TASK 4 — SYSTEM_ADMIN AccountCrudTab wired to /users

## Goal
Wire the SA console accounts tab (mock CRUD) to the real users API: list, invite, edit, deactivate /
reactivate. Frontend only; no backend, DB, dependency or commit changes.

## Done
- `AccountCrudTab.tsx` rewritten around `adminApi` (`listUsers` / `createUser` / `updateUser`):
  - list `GET /users?limit=50` + cursor "โหลดเพิ่ม"; server-side filters `q`, `role`, `status`, `hospitalId`
  - create `POST /users` with one `Idempotency-Key` per intended submission (regenerated after success,
    reused on retry); reason mandatory; roles[] + primaryRole; hospitalId/regionId per role
  - edit `PATCH /users/{id}` sends only changed fields; reason forced when roles / primaryRole /
    hospitalId / regionId change, optional for profile-only edits
  - mock "delete" replaced by ปิดใช้งานบัญชี (`PATCH {active:false, reason}`) + เปิดใช้งาน; no delete wording,
    self-deactivation disabled client-side (SELF_LOCKOUT tooltip); server still enforces
  - Thai messages for CONFLICT / ROLE_CONFLICT / LAST_ADMIN / SELF_LOCKOUT / VALIDATION / 403 / 404
  - `?mock=1` still works via `mockFallbackEnabled()` (fixtures mapped into the same row shape)
- `AdminPage.tsx`: passes hospitals/externalQuery/onShowToast/onUsersCount; removed the mock
  add/update/delete handlers; header count uses the exact live total when the list fits one page.
- `App.tsx`: dropped accounts/config/audit/admin tabs from the "ข้อมูลตัวอย่าง" note (all are live now);
  the note remains only for the WH inbox.

## Mock-only fields
- `status: INACTIVE` → API `active:false` (SUSPENDED); INVITED is server-derived (active + never signed in).
- single `role` → `roles[]` + `primaryRole` (primary marked ★).
- free-text `hospitalName` → `hospital.name` (+ `hospital.code`) or `region.code`; "— ไม่ผูกโรงพยาบาล —".
- `lastLogin` text → `lastLoginAt` (Thai format); mock fixtures keep their pre-formatted label.

## Verification
- `npx tsc --noEmit` exit 0; `npm run build` exit 0 (`✓ built in 820ms`).
- Live HTTP script `/tmp/test_users.py` against `doorare_fe_test`: **41/41 assertions** — SA list/cursor,
  create 201, idempotent replay 201 (same id), key reuse 422, duplicate email 409, ROLE_CONFLICT 422,
  missing reason 400, operational role without hospital 400, SA role without hospital 201,
  PATCH roles w/o reason 400 / with reason 200, profile-only 200, primary swap 400/200,
  deactivate 200 → SUSPENDED, reactivate 200, SELF_LOCKOUT 409 (self deactivate + self demote),
  LAST_ADMIN 409 (deactivate and demote of the only active HA), HA-A grant SYSTEM_ADMIN 403,
  HA-A list scope = own hospital only.
- Browser (logged in as SA on the Vite dev server): 49–50 live rows render, status/roles/hospital/region/
  last login correct, create duplicate shows the Thai 409, create 201 adds the row, role edit blocked
  without reason then 200 with reason, deactivate→reactivate toggles SUSPENDED/INVITED, only the expected
  409s in the console.
- Screenshot: `artifacts/task4-accounts.png` (untracked).

## Files touched
- `frontend/src/roles/admin/components/AccountCrudTab.tsx`
- `frontend/src/roles/admin/pages/AdminPage.tsx`
- `frontend/src/App.tsx`

## Gaps
- Region picker has no `GET /regions`; options are derived from regions seen in the loaded accounts
  (hospital create still auto-derives regionId server-side).
- Admin dashboard tab and hospital-detail staff lists still use fixtures (separate screens).
- `loginCount` is per-account login events (fine) but the tab has no total row count endpoint, so the
  header count falls back to fixtures while more than one page is loaded.
- Test-DB accounts created during verification cannot be deleted (DB trigger) and remain.
