---
title: Backend step 2 - transport, legs, documents, return obligations
date: 2026-10-21
author: alongkorn
ai: claude
tags: session, backend, transport, documents, returns, stock
summary: SM-6 workflow with stock moves, offline sync, slips, returns; 93 integration checks pass
---

## Goal

- Step 2 of the solo API plan: warehouse/driver transport and the cross-feature documents and returns.

## Done

- `GET /transport-tasks`, `/vehicles`; `POST /transport-tasks/{id}/status|photos|events:sync`; `POST /borrow-legs/{id}/load|receive`.
- `GET|POST /documents`, `GET /documents/{id}`; `GET /return-obligations`, `POST .../return|waive`.
- `core/transportTask.ts` `createTransportTask()` for F1 respond and F2 approval; FEFO picks in `core/stock.ts`.
- `db/seed/transport_pending.sql`: 4 in-flight shipments (the mock had only RECEIVED).
- Tests on a copy of the DB (scratch scripts, not in repo): 40 transport, 27 returns, 26 documents, 5 task-number checks, all pass.

## Decisions

- Photos stored on local disk (`backend/uploads`, gitignored); keys must be uploaded for that task. No S3.
- Documents are JSON snapshots (`payload`, sha256 of key-sorted JSON); no PDF renderer, `downloadUrl` is null.
- Receipt marks the request FULFILLED/PARTIALLY_FULFILLED by a provisional rule until F1b adds the F-20 stop rule.

## Files touched

backend/src/{modules/transport,borrow-legs,documents,returns}, core/{stock,settings,validate,pagination,transportTask,canonical}.ts, db/seed/.

## Known gaps

- Partial receipt: the unreceived remainder has no discrepancy record. Cancel flow, document void and PDF are not built.
- Blood and kit returns return 422; kit-leg stock lives in kit_stock (F3).
- BR-F2a-023 (shelf life vs transit time) not checked. RLS is on but bypassed (superuser); scope is enforced in code.
- Frontend pages (WH transport, driver, documents) still use mock data.

## Next steps

- Wire WH/driver/document pages to these APIs, then step 3 (inventory, hospitals, drug-master, dashboard).
