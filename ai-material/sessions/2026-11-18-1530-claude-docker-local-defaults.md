---
title: Docker compose works locally with no .env (backend could not reach DB)
date: 2026-11-18
ai: CLAUDE
tags: session, docker, compose, backend, db, byok, local-dev
summary: Compose defaulted to unreachable RDS; defaults now local db + NODE_ENV=development.
---

## Goal

- Find why the Docker frontend could not reach the backend; make `docker compose up` work on a teammate's machine with no setup.

## Done

- Root cause: no root `.env`, so `docker-compose.yml` defaulted `DB_HOST` to AWS RDS (`DB_SSL=true`). RDS timed out (also from the host via `nc`), so backend was unhealthy and every API call hung. nginx `/api/` proxy was fine.
- `docker-compose.yml` backend: defaults now local (`DB_HOST=db`, `doorare_dev`, `DB_SSL=false`), `NODE_ENV=${NODE_ENV:-development}`, `BYOK_ENCRYPTION_KEY:-` (no blank-var warning), `depends_on: db (service_healthy)`. Removed the committed RDS password default.
- `.env.example`: LOCAL = no .env; AWS mode must set `NODE_ENV=production`, all `DB_*`, `BYOK_ENCRYPTION_KEY`.
- `ai-material/context/runbook.md` Docker line updated.
- Verified with an empty env file: env shows db/false/development, health 200, BYOK resolves a 32-byte key via the dev fallback.

## Decisions

- Local-first defaults (user choice). BYOK local = backend's built-in dev fallback (only allowed when NODE_ENV != production) instead of committing a key.
- Mock data is NOT auto-loaded (user choice): still `npm run db:reset` on a fresh DB (needs `db/mock/csv`, gitignored).

## Errors encountered

- None in code; RDS unreachable from this network.

## Next steps

- Any AWS host that ran compose relying on the RDS default must now have a `.env` (see `.env.example`), else it will use the local `db` service.
- Hardcoded `AWS_LOCATION_API_KEY` / Cognito IDs still in `docker-compose.yml`.
