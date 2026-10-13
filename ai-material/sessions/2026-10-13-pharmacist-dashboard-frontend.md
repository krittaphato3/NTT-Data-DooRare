---
title: Pharmacist dashboard frontend (npm + Docker)
date: 2026-10-13
author: opencode
ai: Muse Spark 1.3 Free
tags: session
summary: Built pharmacist dashboard React frontend with npm Docker build
---

## Goal

- Replicate `Mockups/Dashboard - Pharmacist Hospital` as React+TS frontend, Docker-runnable, npm (not Bun).

## Done

- Scaffolded `frontend/` (Vite React-TS, global CSS from mockup tokens) via subagent.
- Decision: npm + `node:20-alpine`; Bun rejected for enterprise stability.
- Hardened `frontend/Dockerfile` to `COPY package.json package-lock.json` + `npm ci --no-audit --no-fund`.
- Verified: `docker build ./frontend` ok, image 93.8MB, container serves HTTP 200 on :80.

## Decisions

- Keep `node:20-alpine` build + `nginx:alpine` serve; `npm ci` for reproducibility.
- Bun allowed implicitly for local dev only (scripts runtime-agnostic), no Dockerfile support.

## Files touched

- `frontend/Dockerfile` — npm ci reproducible install.
- `frontend/` (18 files, prior turn) + root `docker-compose.yml` — app + serve config.

## Errors

- `docker build ... | Select-Last` exited 1 despite success; re-verified via `docker images` + `Invoke-WebRequest` 200.

## Next steps

- `docker compose up --build` → open http://localhost:8080.
- Optional: visual diff vs mockup at 1440/768/360px; wire real API replacing `src/data/mock.ts`.

## Follow-up 2026-10-13 (fidelity check)

- Screenshot compare vs mockup: layout/colors matched but icons rendered as black blobs — stale image, fresh capture after rebuild was clean (41 icons verified verbatim, `.ic` stroke CSS intact, favicon 404 fixed).
- Wired Lending tab: `LENDING` (7 rows) in `frontend/src/data/mock.ts`, toggle in `RequestStatusPanel.tsx`; rebuilt + HTTP 200.
- Evidence: `tmp-compare/mockup-1440.png` vs `tmp-compare/frontend-1440.png`.
- Request Status: show-more toggle (first 5 + แสดงเพิ่มเติม), resets on tab/filter change.
- Equal heights: row stretch + column flex + shared 520px inner scroll, footers pinned (App.tsx:36, index.css:595-618).
- Removed Log-out-other-sessions button + state from session card (BottomRow.tsx).
- Removed entire Session & Login History card; Recent Activity now full width.
- Full-screen fluid: 1440px cap removed, sticky sidebar rail, auto-fit KPI grid, verified no overflow at 360/768/1024/1440.
