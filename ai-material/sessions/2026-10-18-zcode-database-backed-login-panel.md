---
title: Real Database-Backed Login Panel & Multi-Role Authentication
date: 2026-10-18
author: ZCode
ai: zcode
tags: session, frontend, auth, login, database, postgres, rbac
summary: Real PostgreSQL-backed login panel, 10-role quick select, login_event logging, and admin live feed integration
---

## Goal

- Implement a real, working database-backed login panel for each role that connects to PostgreSQL (port 5442), records sign-in history to `login_event`, manages authentication sessions, and feeds live authentication events to System Admin and Hospital Admin dashboards.

## Done

- Branch `frontend-login-working` created off updated `frontend`.
- Installed `pg` and `@types/pg` in `frontend/`.
- Created backend database bridge & Vite middleware:
  - `frontend/server/db.ts`: PostgreSQL pool connecting to port 5442, queries `app_user`, `app_user_role`, `hospital`, and inserts into `login_event`.
  - `frontend/server/authPlugin.ts`: Vite connect middleware exposing `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/me`, `/api/v1/auth/role-accounts`, `/api/v1/auth/recent-logins`, and `/api/v1/health`.
  - Wired plugin into `frontend/vite.config.ts`.
- Implemented client authentication layer:
  - `frontend/src/types/auth.ts`: types for user profile, credentials, login response, and login event.
  - `frontend/src/services/authApi.ts`: API service with graceful offline fallback.
  - `frontend/src/context/AuthContext.tsx`: React auth context with `localStorage` persistence, role switching, and SEC-001 30-minute idle timeout.
- Built enterprise Login UI:
  - `frontend/src/pages/LoginPage.tsx`: DooRare branding, real-time database connection status badge, 10-role quick select panel, standard credentials form with password visibility toggle, MFA verification step for accounts with `mfa_enabled = true` (SEC-001), and compliance audit notice.
- Application shell & navigation integration:
  - `frontend/src/App.tsx`: Wrapped with `AuthProvider`, unauthenticated users see `LoginPage`, authenticated users land on their role's home view with scope and hospital set.
  - `frontend/src/components/layout/AccountMenu.tsx`: Displays real logged-in user profile, avatar, permitted role switcher, and working "Log out" button.
- System Admin & Hospital Admin live feed:
  - `frontend/src/roles/admin/components/AdminDashboardTab.tsx`: Connected Live Authentication Feed (`RECENT_LOGINS`) and online user count to `/api/v1/auth/recent-logins`.
  - `frontend/src/roles/hospital-admin/pages/AuditLogPage.tsx`: Integrated live `LOGIN` and `LOGIN_FAILED` entries from the database into the audit log.
- Verification: `npm --prefix frontend run build` compiles with zero errors (TypeScript + Vite).

## Decisions

- Embedded backend API inside Vite dev server middleware via `frontend/server/authPlugin.ts`, enabling real fullstack database querying during `npm run dev` without requiring a separate server process.
- Implemented dual-mode login: Quick Role Selector (10 roles) with 1-click test login plus standard credentials form.
- Connected real login actions to PostgreSQL `login_event` table so failed/successful logins are permanently logged for audit and visible in Admin consoles.

## Files touched

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.ts`
- `frontend/server/db.ts`
- `frontend/server/authPlugin.ts`
- `frontend/src/types/auth.ts`
- `frontend/src/services/authApi.ts`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/App.tsx`
- `frontend/src/components/layout/AccountMenu.tsx`
- `frontend/src/roles/admin/components/AdminDashboardTab.tsx`
- `frontend/src/roles/hospital-admin/pages/AuditLogPage.tsx`
- `ai-material/sessions/2026-10-18-zcode-database-backed-login-panel.md`
- `ai-material/INDEX.md`
- `ai-material/.index.json`

## Errors

- TypeScript duplicate variable declarations in `App.tsx` and type mismatch in `AuditLogPage.tsx` / `AdminDashboardTab.tsx` fixed during verification.

## Next steps

- Run `docker compose up -d db` or `npm run db:up` and `cd frontend && npm run dev` to test interactive login with live PostgreSQL data.
