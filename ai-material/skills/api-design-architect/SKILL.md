---
name: api-design-architect
description: Design API contracts — REST/GraphQL/gRPC services, endpoints, OpenAPI
  specs, and API versioning. Use when a public or multi-client interface must be specified
  with consistent naming, error shape, pagination, and versioning before implementation.
metadata:
  version: 0.2.0
  grade: G2
  domain: architecture
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: api-architect
---

# API DESIGN ARCHITECT

Design clean, consistent, well-documented APIs.

## RULES
1. API-first: Design contract before implementation
2. Consistent: Same patterns across all endpoints
3. Versioned: Always plan for breaking changes
4. Documented: OpenAPI spec is source of truth

## REST PATTERNS
- Nouns not verbs: `/users`, `/orders`
- Plural collections: `/users/{id}`
- Max 3 nesting levels
- Version in URL: `/v1/users`

## STATUS CODES
| Code | Use |
|------|-----|
| 200 | Success |
| 201 | Created |
| 204 | No content (delete) |
| 400 | Validation error |
| 401 | Auth required |
| 403 | Not authorized |
| 404 | Not found |
| 409 | Conflict |
| 422 | Business logic error |
| 429 | Rate limit |
| 500 | Server error |

## PAGINATION (Cursor-based preferred)
```json
{"data": [...], "pagination": {"next_cursor": "abc", "has_more": true}}
```

## ERROR RESPONSE (RFC 7807)
```json
{"type": "...", "title": "...", "status": 422, "detail": "...", "errors": [...]}
```

## GRAPHQL
- DataLoader for N+1 prevention
- Query complexity analysis
- Depth limiting (max 10)

## gRPC
- Package versioning: `users.v1`
- Backward compatible field additions
- Reserved fields for removed fields

## OUTPUT
```text
[API DESIGN]
Service: {name}
Protocol: {REST|GraphQL|gRPC}
Endpoints: {list}
OpenAPI: {path}
```

## WHEN TO USE
- Design a public/external contract consumed by other teams, clients, or third parties.
- Multiple heterogeneous clients (web, mobile, partners) need a stable, versioned interface.
- You must enforce consistency of naming, error shape, and pagination across many endpoints.
- A machine-readable contract (OpenAPI/Protobuf) is required for codegen, mocks, or governance.
- Backward/forward compatibility matters — the surface will outlive the current implementation.

## WHEN NOT TO USE
- **Internal function calls** — a private method or in-process call needs no HTTP contract, versioning, or OpenAPI spec; use a plain function signature.
- **Streaming or batch fits better** — a one-shot HTTP request/response is wrong for unbounded/long-lived streams, high-volume replay, or large bulk transfers. Prefer message streaming (gRPC streaming / async events) or a batch protocol.
- A true request/response round-trip does not model the problem (pub/sub fan-out, event sourcing) — async events are the wrong-free answer.
- Prototyping/exploration with no consumers yet — premature contract versioning and specing slows iteration.

## DECISION TREE
```text
1. IS A ROUND-TRIP THE RIGHT SHAPE?
   Data pulled by request, one response? → continue.
   Unidirectional stream, fan-out, replay, or batch ingestion? → ASYNC EVENTS.
2. CLIENT DIVERSITY
   Many heterogeneous clients with different shapes & needs? → GRAPHQL (let them query).
   Few, known clients needing full control + strong typing? → gRPC.
   Broad HTTP/JSON ecosystem, simple tooling, caching? → REST.
3. CONSISTENCY NEEDS
   Strict typing + cross-language schema validation at build time? → gRPC (Protobuf) wins.
   Loose document / ad-hoc queries? → GraphQL or REST.
4. STREAMING NEEDS
   Long-lived bidirectional or server-streaming data? → gRPC / WebSockets, not REST.
   Large payloads / file binary? — not a JSON REST fit; stream or blob.
5. LIFETIME vs MOMENTUM — weigh contract lifespan and versioning burden against the
   ecosystem/tooling each protocol brings; pick the one that minimizes total owner+consumer cost.
```
Never jump to a protocol without answering steps 1–4; the wrong shape is the most expensive bug.

## FAILURE MODES & MITIGATIONS
- **Breaking changes shipped without versioning** — consuming clients break silently.
  DETECT: a field is removed/renamed or a type changes in place; no `/vN` bump; clients deploy to a 422/500 surge.
  FIX: additive changes only within a version; add a `## versioning` policy and bump the major version before any breaking change.
- **Inconsistent error shapes** — every endpoint returns a different error body, so clients can't parse failures.
  DETECT: some errors return `{"error":...}`, others a string, others nothing; no unified problem schema.
  FIX: standardize on RFC 7807 problem+json with `type/title/status/detail`; enforce via contract test per endpoint.
- **Unbounded page sizes** — a client asks for all records in one request and OOMs memory or DB.
  DETECT: a limit with no maximum, no cursor, no pagination schema; one request returns the whole table.
  FIX: cursor-based pagination with a hard `max_page_size`, `has_more`/`next_cursor`; load-test the largest allowed page.
- **Missing idempotency on retryable writes** — a retried POST/PUT applies the mutation twice.
  DETECT: retries (timeout/network) create duplicate orders/records; no `Idempotency-Key` on the write.
  FIX: accept client idempotency keys, key a `UNIQUE` column (or token table), and return the original result on replay (see idempotency replay test).
- **N+1 in GraphQL resolvers** — each list item triggers its own resolver DB query.
  DETECT: a list of N items yields N+1 backing queries; high latency grows with result size, not payload.
  FIX: DataLoader or field-level batching; CAP the resolver arity / complexity budget.
- **Sync-over-async deadlock** — a handler blocks the event loop (or pool) waiting synchronously on an async call.
  DETECT: a sync `.get_result()`/`.join()` inside async context; worker threads freeze, requests pile up, "server hang".
  FIX: keep the whole call stack async; never block on async inside a serving path; move IO to a dedicated pool.

## VERIFICATION GATE
- **OpenAPI contract validation**: the served responses conform to the OpenAPI 3.x schema (validate live bodies with a validator).
- **Contract test per endpoint**: each endpoint has an automated test asserting status, headers, and RFC 7807 error shape; runs in CI.
- **Idempotency replay test**: submit the same `Idempotency-Key` twice and assert exactly one persistent side effect, identical response.
- **Load test on pagination**: hammer the paged endpoint at max supported `page_size` and under concurrency; assert bounded latency and no runaway memory.
- **red-team-qa review**: an adversarial reviewer hunts for versioning, error-shape, and retry bugs across the whole surface.
- Record the protocol decision rationale, the spec path, and a passing validation run.

## REFERENCES
- Google — *API Design Guide* (naming, versioning, pagination, resource model).
- RFC 7807 — Problem Details for HTTP APIs (unified error payload).
- OpenAPI 3.x Specification — contract schema, codegen, validation.
- gRPC — Best Practices / Protobuf conformance guidance.
