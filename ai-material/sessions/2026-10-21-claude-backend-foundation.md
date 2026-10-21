---
title: Backend foundation (stock ledger, audit, idempotency) on feature/backend-api
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, backend, foundation, stock, audit, idempotency
summary: Shared core for all write endpoints; 24 integration checks pass; known gaps listed
---

## Goal

- Step 1 of the solo API plan: shared pieces every write endpoint needs, so no module writes its own stock SQL.

## Done

- `db/tx.ts` `withTransaction`; `core/stock.ts` `adjustStock` / `holdStock` / `getLot`; `core/audit.ts` `writeAudit`;
  `middleware/idempotency.ts` `idempotent()`; `middleware/asyncHandler.ts`; PG error mapping in `errorHandler.ts`.
- Usage table and example in `backend/README.md` ("Shared foundation").
- 24 checks against real Postgres/HTTP passed (stock, audit chain, idempotency, 422 mapping); all rolled back, no data left.

## Decisions

- Only 2xx responses are stored for idempotency; a 4xx/5xx releases the key so the client can retry (spec silent).
- Stock reservation (`holdStock`) writes no ledger row; the later issue (LEND_OUT…) does.
- Audit hashes come from the DB trigger `audit_log_chain`; code never computes them.

## Files touched

backend/src/{db/tx.ts, core/stock.ts, core/audit.ts, middleware/idempotency.ts, middleware/asyncHandler.ts, middleware/errorHandler.ts}, backend/README.md

## Errors

- Test script outside the repo could not resolve `express`; fixed by symlinking `backend/node_modules` into the scratchpad.

## Known gaps / things to know

- No cleanup job for old `idempotency_key` rows; no Postgres RLS session variables (spec 13.1).
- No committed test suite: the 24 checks live in a scratch script (not in repo).
- `errorHandler.ts` belongs to the login author; only PG error mapping was added.
- DB seed gap: all 679 `transport_task` rows are RECEIVED; other tables' statuses unchecked.
- Request/response shapes not yet checked against `openapi.yaml` per module.

## Next steps

- Step 2: transport + warehouse (`transport-tasks`, `borrow-legs/load|receive`, `documents`, `return-obligations`, `GET /vehicles`).
- Read local `feature/api-demo` (unpushed transport API) first; add pending-status seed SQL as a separate file.
- Export `createTransportTask()` for the F1 and F2 steps.
