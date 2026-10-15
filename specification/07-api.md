## 13. API Specification (REST, OpenAPI 3.1)

Machine-readable contract: `openapi.yaml` (validated with openapi-spec-validator; 82 operations). If prose and `openapi.yaml` differ, the YAML wins.

### 13.1 Conventions
| Topic | Rule |
|---|---|
| Base path | `/api/v1`; JSON UTF-8; timestamps ISO-8601 UTC; money THB with 2 decimals; quantities in canonical base unit after `unit_conversion_factor` |
| Auth | Cognito JWT Bearer; role + hospital from claims; server sets Postgres session vars for RLS (`app.hospital_id`, `app.role`, `app.region_id`) |
| Idempotency | All side-effecting POSTs marked `Idem.=Y` require header `Idempotency-Key`; same key + same body returns the stored response; different body ⇒ 422 |
| Concurrency | `version` integer on mutable resources; send `If-Match: <version>` or `version` in body; mismatch ⇒ 409 `VERSION_CONFLICT` |
| Pagination | cursor: `?cursor=&limit=` (default 50, max 200) → `{items, nextCursor}` |
| Errors | `application/problem+json` with `code`: `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `NO_LENDER`, `MAPPING_NOT_VERIFIED`, `LOT_HELD`, `GUARDRAIL_REJECTED`, `ALREADY_DECIDED`, `RATE_LIMITED` |
| Rate limit | 300 req/min/user, 30 req/min for agent-triggering endpoints (ASSUMPTION) |
| Agent safety | Endpoints never accept numeric calculation fields from agents; agent output is stored in `agent_run` and shown for approval |
| Realtime | Server-Sent Events `GET /api/v1/events` (borrow leg updates, incident updates); fallback polling 15 s |

### 13.2 Endpoint catalogue
| ID | Method | Path | Purpose | Roles | Idem. |
|---|---|---|---|---|---|
| API-PL-001 | GET | `/api/v1/me` | Current user profile & permissions | all authenticated |  |
| API-PL-002 | GET | `/api/v1/hospitals` | List hospitals (region scope) | all authenticated |  |
| API-PL-003 | GET | `/api/v1/hospitals/{hospitalId}` | Hospital detail | all authenticated |  |
| API-PL-004 | GET | `/api/v1/notifications` | List my notifications | all authenticated |  |
| API-PL-005 | POST | `/api/v1/notifications/{id}/read` | Mark notification read | all authenticated |  |
| API-PL-006 | GET | `/api/v1/dashboard` | Dashboard summary tiles | all authenticated |  |
| API-F1a-001 | GET | `/api/v1/forecasts` | Latest forecast results (filter hospital, drug, ved) | PHARMACIST,PROCUREMENT_OFFICER,HOSPITAL_ADMIN,REGION_ADMIN |  |
| API-F1a-002 | GET | `/api/v1/forecasts/{hospitalDrugId}` | Forecast detail with history and backtest | PHARMACIST,PROCUREMENT_OFFICER,HOSPITAL_ADMIN |  |
| API-F1a-003 | POST | `/api/v1/forecasts/runs` | Trigger forecast run (admin) | SYSTEM_ADMIN,REGION_ADMIN | Y |
| API-F1a-004 | PATCH | `/api/v1/hospital-drugs/{id}/classification` | Set VED / expiry threshold | PHARMACIST,HOSPITAL_ADMIN |  |
| API-F1a-005 | GET | `/api/v1/alerts` | Stock alert queue (ordered by ABC then days cover) | PHARMACIST,PROCUREMENT_OFFICER,HOSPITAL_ADMIN |  |
| API-F1a-006 | POST | `/api/v1/alerts/{id}/ack` | Acknowledge alert | PHARMACIST,PROCUREMENT_OFFICER |  |
| API-F1a-007 | POST | `/api/v1/alerts/{id}/snooze` | Snooze alert | PHARMACIST |  |
| API-F1b-001 | POST | `/api/v1/borrow-requests` | Create borrow request (DRAFT) from alert or manual | PHARMACIST | Y |
| API-F1b-002 | GET | `/api/v1/borrow-requests` | List requests (as borrower or lender) | PHARMACIST,HOSPITAL_ADMIN,PROCUREMENT_OFFICER,REGION_ADMIN |  |
| API-F1b-003 | GET | `/api/v1/borrow-requests/{id}` | Request detail with legs, ladder, agent proposal | PHARMACIST,HOSPITAL_ADMIN,PROCUREMENT_OFFICER,REGION_ADMIN |  |
| API-F1b-004 | POST | `/api/v1/borrow-requests/{id}/propose` | Run calculation + agent proposal | PHARMACIST | Y |
| API-F1b-005 | POST | `/api/v1/borrow-requests/{id}/approve` | Approve ladder (HITL) | PHARMACIST | Y |
| API-F1b-006 | POST | `/api/v1/borrow-requests/{id}/reject` | Reject / cancel | PHARMACIST |  |
| API-F1b-007 | PATCH | `/api/v1/borrow-requests/{id}/ladder` | Edit ladder before approval | PHARMACIST |  |
| API-F1b-008 | GET | `/api/v1/lender-queue` | Incoming requests awaiting my response | PHARMACIST |  |
| API-F1b-009 | POST | `/api/v1/borrow-legs/{legId}/respond` | Lender accept / partial / reject | PHARMACIST | Y |
| API-F1b-010 | POST | `/api/v1/borrow-legs/{legId}/load` | Warehouse confirms LOADED (stock out) | WAREHOUSE_OFFICER | Y |
| API-F1b-011 | POST | `/api/v1/borrow-legs/{legId}/receive` | Borrower confirms receipt (stock in) | WAREHOUSE_OFFICER,PHARMACIST | Y |
| API-F1b-012 | POST | `/api/v1/borrow-requests/{id}/escalate-manual` | Add manual lender after escalation | PHARMACIST,HOSPITAL_ADMIN |  |
| API-F1b-013 | GET | `/api/v1/borrow-requests/{id}/agent-runs` | Agent decision log for request | PHARMACIST,AUDITOR,HOSPITAL_ADMIN |  |
| API-XC-001 | GET | `/api/v1/documents/{id}` | Get document metadata + signed URL | all authenticated |  |
| API-XC-002 | POST | `/api/v1/documents` | Generate document for a ref | PHARMACIST,WAREHOUSE_OFFICER | Y |
| API-XC-003 | GET | `/api/v1/return-obligations` | List return obligations | PHARMACIST,HOSPITAL_ADMIN,WAREHOUSE_OFFICER |  |
| API-XC-004 | POST | `/api/v1/return-obligations/{id}/return` | Record return in kind (same drug, same quantity; partial allowed); blood = replacement via blood bank (BR-XC-013) | WAREHOUSE_OFFICER,PHARMACIST | Y |
| API-XC-005 | POST | `/api/v1/return-obligations/{id}/waive` | Waive obligation | HOSPITAL_ADMIN |  |
| API-XC-006 | GET | `/api/v1/value` | Value dashboard metrics | HOSPITAL_ADMIN,REGION_ADMIN,PROCUREMENT_OFFICER |  |
| API-XC-007 | GET | `/api/v1/context-signals` | List context signals | PHARMACIST,REGION_ADMIN |  |
| API-XC-008 | POST | `/api/v1/context-signals` | Create / approve context signal | REGION_ADMIN,DATA_ADMIN |  |
| API-F2a-001 | GET | `/api/v1/near-expiry` | Near-expiry items for my hospital | PHARMACIST,HOSPITAL_ADMIN |  |
| API-F2a-002 | POST | `/api/v1/near-expiry/{id}/release` | Release lot to regional pool | PHARMACIST | Y |
| API-F2a-003 | POST | `/api/v1/near-expiry/{id}/keep` | Keep & re-evaluate later | PHARMACIST |  |
| API-F2a-004 | POST | `/api/v1/near-expiry/{id}/dismiss` | Dismiss | PHARMACIST |  |
| API-F2a-005 | POST | `/api/v1/near-expiry/{id}/withdraw` | Withdraw from pool (no active plan) | PHARMACIST |  |
| API-F2a-006 | GET | `/api/v1/pool` | Regional central pool | PHARMACIST,REGION_ADMIN,HOSPITAL_ADMIN |  |
| API-F2a-007 | GET | `/api/v1/allocation-plans` | List allocation plans | PHARMACIST,REGION_ADMIN,HOSPITAL_ADMIN |  |
| API-F2a-008 | GET | `/api/v1/allocation-plans/{id}` | Plan detail incl. cost check & 4 options | PHARMACIST,REGION_ADMIN,HOSPITAL_ADMIN |  |
| API-F2a-009 | POST | `/api/v1/allocation-plans/{id}/decision` | Approve / reject as involved hospital | PHARMACIST | Y |
| API-F2a-010 | POST | `/api/v1/allocation-plans/{id}/option` | Choose option for uneconomical lot | PHARMACIST,REGION_ADMIN |  |
| API-F2a-011 | POST | `/api/v1/allocation-plans/{id}/cancel` | Cancel (mutual consent, waiting dispatch) | PHARMACIST |  |
| API-F2a-012 | GET | `/api/v1/transport-tasks` | Transport tasks | WAREHOUSE_OFFICER,DRIVER,PHARMACIST |  |
| API-F2a-013 | POST | `/api/v1/transport-tasks/{id}/status` | Advance transport status with photos | WAREHOUSE_OFFICER,DRIVER | Y |
| API-F2a-017 | POST | `/api/v1/transport-tasks/{id}/events:sync` | Offline-first batch sync of driver events (idempotent by clientEventId) | WAREHOUSE_OFFICER,DRIVER | Y |
| API-F2a-014 | POST | `/api/v1/transport-tasks/{id}/photos` | Get presigned upload URL | WAREHOUSE_OFFICER,DRIVER |  |
| API-F2a-015 | GET | `/api/v1/repeat-expiry` | Repeated-expiry flags | PHARMACIST,PROCUREMENT_OFFICER |  |
| API-F2a-016 | POST | `/api/v1/repeat-expiry/{id}/dismiss` | Dismiss flag (90 days) | PHARMACIST |  |
| API-F2b-001 | POST | `/api/v1/imports/drug-list` | Upload HIS drug list (CSV/XLSX) | DATA_ADMIN,PHARMACIST | Y |
| API-F2b-002 | GET | `/api/v1/mappings` | Mapping queue (status filter) | DATA_ADMIN,PHARMACIST |  |
| API-F2b-003 | GET | `/api/v1/mappings/{id}` | Mapping detail with candidates | DATA_ADMIN,PHARMACIST |  |
| API-F2b-004 | POST | `/api/v1/mappings/{id}/verify` | Verify (confirm or choose candidate) | DATA_ADMIN | Y |
| API-F2b-005 | POST | `/api/v1/mappings/{id}/reject` | Reject mapping | DATA_ADMIN |  |
| API-F2b-006 | GET | `/api/v1/drug-master` | Search canonical drugs | all authenticated |  |
| API-F2b-007 | GET | `/api/v1/central-items` | List central-list items (non-drug supplies, blood) | all authenticated |  |
| API-F2b-008 | POST | `/api/v1/central-items` | Create/update a central-list item | DATA_ADMIN | Y |
| API-F3-001 | POST | `/api/v1/incidents` | Create incident | ER_STAFF,PHARMACIST | Y |
| API-F3-002 | GET | `/api/v1/incidents` | List incidents | ER_STAFF,PHARMACIST,HOSPITAL_ADMIN,REGION_ADMIN |  |
| API-F3-003 | GET | `/api/v1/incidents/{id}` | Incident detail with plan | ER_STAFF,PHARMACIST,HOSPITAL_ADMIN |  |
| API-F3-004 | PATCH | `/api/v1/incidents/{id}/counts` | Update triage counts (new plan revision) | ER_STAFF |  |
| API-F3-005 | POST | `/api/v1/incidents/{id}/plan` | Calculate / recalculate plan | ER_STAFF,PHARMACIST | Y |
| API-F3-006 | POST | `/api/v1/incidents/{id}/plan/approve` | Approve plan (HITL) | PHARMACIST,HOSPITAL_ADMIN | Y |
| API-F3-007 | POST | `/api/v1/incidents/{id}/emergency-borrow` | Send urgent whole-set requests | PHARMACIST | Y |
| API-F3-008 | POST | `/api/v1/emergency-legs/{legId}/confirm` | Lender officer confirms (first wins) | WAREHOUSE_OFFICER,PHARMACIST | Y |
| API-F3-009 | GET | `/api/v1/kit-tasks` | Kit preparation tasks | WAREHOUSE_OFFICER,PHARMACIST |  |
| API-F3-010 | POST | `/api/v1/kit-tasks/{id}/confirm` | Confirm pack done (stock moves) | WAREHOUSE_OFFICER | Y |
| API-F3-011 | POST | `/api/v1/incidents/{id}/usage` | Record usage | ER_STAFF,PHARMACIST |  |
| API-F3-012 | POST | `/api/v1/incidents/{id}/close` | Request close -> reconciliation | ER_STAFF,PHARMACIST | Y |
| API-F3-013 | GET | `/api/v1/incidents/{id}/reconciliation` | Borrow/return + usage summary | PHARMACIST,HOSPITAL_ADMIN,AUDITOR |  |
| API-F3-014 | GET | `/api/v1/kit-stock` | Ready-set stock | PHARMACIST,WAREHOUSE_OFFICER,ER_STAFF |  |
| API-F3-015 | PUT | `/api/v1/kit-stock/{kitTypeId}` | Set ready-set count | WAREHOUSE_OFFICER |  |
| API-F3-016 | GET | `/api/v1/kit-types` | Kit types & recipes | all authenticated |  |
| API-AD-001 | GET | `/api/v1/config` | List configuration | HOSPITAL_ADMIN,REGION_ADMIN,SYSTEM_ADMIN |  |
| API-AD-002 | PUT | `/api/v1/config/{key}` | Update configuration (audited) | HOSPITAL_ADMIN,REGION_ADMIN,SYSTEM_ADMIN |  |
| API-AD-003 | GET | `/api/v1/audit-log` | Query audit log | AUDITOR,SYSTEM_ADMIN,HOSPITAL_ADMIN |  |
| API-AD-004 | POST | `/api/v1/agent/kill-switch` | Toggle agent kill switch | SYSTEM_ADMIN,REGION_ADMIN |  |
| API-AD-005 | GET | `/api/v1/reports/{reportId}` | Run / download report | HOSPITAL_ADMIN,REGION_ADMIN,AUDITOR |  |
| API-AD-006 | GET | `/api/v1/users` | List users | HOSPITAL_ADMIN,SYSTEM_ADMIN |  |
| API-AD-007 | POST | `/api/v1/users` | Create / invite user | HOSPITAL_ADMIN,SYSTEM_ADMIN | Y |

### 13.3 Example — create and approve a borrow request (Worked example 4.4 shape)
```http
POST /api/v1/borrow-requests
Idempotency-Key: 5f1c...e9
{"context":"STOCK_ALERT","stockAlertId":"7c1e0a3e-0000-4000-8000-000000000001",
 "items":[{"drugMasterId":"2b9a0000-0000-4000-8000-0000000000a1","qtyRequested":27}],"urgency":"URGENT"}
```
Response `201`:
```json
{"id":"…","requestNo":"BR-2026-000123","status":"DRAFT","version":1,
 "items":[{"drugMasterId":"…","qtyRequested":27,"rValue":41.43}]}
```
Then `POST /borrow-requests/{id}/propose` returns the ladder `[B 0.7357, C 0.6200, E 0.5348, D 0.4599]` plus the agent's draft messages; `POST …/approve {"version":2}` freezes the ladder and sends leg 1 (or 3 parallel legs if VERY_URGENT).

### 13.4 Domain events (internal, EventBridge/SQS)
`ForecastReady`, `AlertRaised`, `BorrowApproved`, `LegSent`, `LegResponded`, `LegTimedOut`, `RequestFulfilled`, `LotReleased`, `PlanReadyForApproval`, `PlanApproved`, `TransportAdvanced`, `IncidentOpened`, `EmergencyLegConfirmed`, `ReturnDue`. Each event carries `eventId`, `occurredAt`, `entityId`, `hospitalId`, and is consumed idempotently (dedupe on `eventId`).
