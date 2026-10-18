---
title: Real Database-Backed Login Panel & Architecture Separation (backend/ and frontend/)
date: 2026-10-18
author: ZCode
ai: zcode
tags: session, frontend, backend, architecture, auth, login, database, postgres, docker
summary: Separated clean backend/ service from frontend/, PostgreSQL connection pool, Nginx reverse proxy, and 10-role login
---

## Goal

- Separate backend logic into a dedicated, scalable `backend/` service at repository root.
- Revert `frontend/` to pure client code with Nginx reverse proxy and Vite dev proxy.
- Ensure Docker Compose and dev environments run `db`, `backend`, `frontend`, and `adminer` seamlessly.

## Done

- Created `backend/` service at repo root with enterprise clean layered architecture:
  - `backend/src/config/env.ts`: strongly typed configuration from environment.
  - `backend/src/db/`: client pool (`pg`) and query helpers (`parsePgArray`).
  - `backend/src/middleware/`: client metadata parser and RFC 7807 problem details error handler.
  - `backend/src/modules/auth/`: routes, controller, service, repository, and DTOs.
  - `backend/src/modules/health/`: `/api/v1/health` endpoint with PostgreSQL live check.
  - `backend/src/app.ts` & `backend/src/index.ts`: Express application on port 3001.
  - `backend/Dockerfile`: multi-stage Node 20 build.
- Cleaned up `frontend/`:
  - Removed `frontend/server/`.
  - Uninstalled `pg` and `@types/pg` from frontend dependencies.
  - Configured `frontend/vite.config.ts` proxy: `/api` -> `http://localhost:3001`.
  - Created `frontend/nginx.conf` with gzip, SPA fallback (`try_files $uri $uri/ /index.html`), and reverse proxy `/api/` -> `http://backend:3001`.
  - Restored `frontend/Dockerfile` to multi-stage Nginx production build.
- Updated root configuration:
  - `docker-compose.yml`: added `backend` container (`doorare-backend:3001`), wired networking and health check dependencies.
  - `package.json`: added monorepo helper scripts (`dev:frontend`, `dev:backend`, `build:frontend`, `build:backend`).
- Verification:
  - `npm run build:frontend` and `npm run build:backend` compile cleanly.
  - `docker compose up -d --build` builds and starts all 4 containers (`doorare-db`, `doorare-backend`, `doorare-frontend`, `doorare-adminer`).
  - `curl http://localhost:8080/api/v1/health` verified 200 OK via Nginx proxy -> backend.
  - Tested browser login in in-app browser with real PostgreSQL accounts and role navigation.

## Decisions

- Adopted standard enterprise monorepo layout: `frontend/` (React/Vite/Nginx), `backend/` (Node/Express/TypeScript), `db/` (PostgreSQL schemas & mocks).
- Nginx proxies `/api/` in Docker, while Vite proxies `/api/` in local dev, keeping client API calls identical (`/api/v1/...`).

## Files touched

- `backend/*` (created)
- `frontend/server/*` (removed)
- `frontend/vite.config.ts`
- `frontend/nginx.conf` (created)
- `frontend/Dockerfile`
- `frontend/package.json`
- `frontend/package-lock.json`
- `docker-compose.yml`
- `package.json`
- `ai-material/sessions/2026-10-18-zcode-database-backed-login-panel.md`
- `ai-material/INDEX.md`
- `ai-material/.index.json`
