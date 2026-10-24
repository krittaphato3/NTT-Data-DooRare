# Session: 2026-10-24 12:18 - Person 5 Scope: Governance Tests (Part 8c)

## Goal
Implement Part 8c of Person 5 scope: comprehensive RBAC Matrix verification (`backend/tests/ai/rbac-matrix.test.ts`), SHA-256 Audit Integrity verification (`backend/tests/ai/audit-integrity.test.ts`), and Root Test Bridge Runner (`backend/tests/ai.governance.test.ts`).

## Done
- Pre-flight discovery for audit requirements in `byok-plan.md` vs codebase:
  - `agent_run` & `agent_tool_call`: AI react engine does not write into `agent_run` or `agent_tool_call`. `agent_tool_call` has zero INSERT statements in the entire codebase.
  - `audit_log` with `agent_run_id`: Written only in `borrow.service.ts:313` and `plan.service.ts:327`.
  - Recommendation: Read-only contract and hash calculation testing with zero DB side effects.
- Implemented `backend/tests/ai/rbac-matrix.test.ts` (DB-free):
  - Inventory assertions: `ALL_ROLES` length 10, clinicalTools 12, logisticsTools 15, governanceTools 22, domain total 49, total registry 51 (derived samples: `ping_system`, `submit_sample_action_proposal`).
  - Static invariants: ZodObject parameters, non-empty allowedRoles, unique tool names matching `/^[a-z][a-z0-9_]*$/`. Only `ping_system` allows all roles (`*`).
  - Registry behavior discovery: SYSTEM_ADMIN bypasses allowedRoles restrictions; undefined, empty, lowercase, and unknown roles (e.g. `'HACKER'`) are denied for domain tools with `Permission denied`.
  - Full matrix evaluation: 10 roles x 51 tools (510 total evaluations) with mocked `execute` spy proving zero SQL invocation on denied roles.
  - Role separation: clinical and field roles see 0 governance tools.
  - Governance proposal privilege boundaries: all 5 `submit_` tools scoped strictly to authorized admin roles; AUDITOR has zero executable endpoints in `PROPOSAL_ACTION_WHITELIST`.
- Implemented `backend/tests/ai/audit-integrity.test.ts` (read-only):
  - Live execution of `audit_chain_verify()` returning 0 problems.
  - Independent SQL decomposition (genesis anomaly, forks, missing parents, tampered rows) matching `audit_chain_verify()` sum.
  - Cryptographic hash equivalence: PostgreSQL `encode(sha256(convert_to($1, 'UTF8')), 'hex')` strictly equals Node.js `crypto.createHash('sha256')` including multi-byte Thai UTF-8 text. Single-character change tamper sensitivity verified.
  - Window analysis: bounded `LIMIT 50` query with `analyzeAuditWindow` and Map-by-row_hash verification (safely skips window topology when `audit_log` has 0 rows).
  - Registry execution of `verify_tamper_evidence` with AUDITOR role compared to DB `audit_chain_verify()`.
  - Pure synthetic cryptographic chain verification: intact chain accepted, rejects modified field, deleted middle row, swapped order, and forks.
- Implemented `backend/tests/ai.governance.test.ts` (bridge):
  - Side-effect imports all 7 test files in `tests/ai/`.
  - Implemented idempotent `pool.end()` wrapper preventing duplicate pool teardown errors.
  - Guard test asserting all `*.test.ts` files under `tests/ai/` are explicitly imported.
  - Runs all 58 governance tests in ~450ms - 660ms and exits promptly without hanging.
  - Tested running with clinical and logistics test suites: 151 tests pass cleanly.
- Updated `backend/tests/ai/helpers.ts` with `toNumber` helper.
- Resolved type error in `backend/tests/ai/systemAdmin.tools.test.ts` mock `byokService.testConnection` (`ok: true`).
- Verified builds:
  - `npm --prefix backend run build`: 0 errors.
  - Temporary tsconfig check across all test files and bridge: 0 errors.
  - `npm --prefix backend test` (twice): 221 tests (217 passed, 4 skipped, 0 failed).
- Git commits:
  - `c7f4748` `test(ai): governance rbac matrix`
  - `149d29a` `test(ai): governance audit integrity`
  - `e17778c` `test(ai): governance bridge runner`

## Decisions
- Wrapped `pool.end()` idempotently in `ai.governance.test.ts` to accommodate pre-existing `pool.end()` calls in Part 8a test files without needing to modify existing test logic.

## Files Touched
- `backend/tests/ai/rbac-matrix.test.ts` (created)
- `backend/tests/ai/audit-integrity.test.ts` (created)
- `backend/tests/ai.governance.test.ts` (created)
- `backend/tests/ai/helpers.ts` (modified: added toNumber)
- `backend/tests/ai/systemAdmin.tools.test.ts` (modified: added ok: true in mock)
- `ai-material/sessions/2026-10-24-1218-antigravity-governance-tests-part8c.md` (created)

## Errors Encountered & Resolved
- `pg` pool double-closure: `pool.end()` was called in Part 8a `after` hooks. Resolved via idempotent proxy wrapper in `ai.governance.test.ts`.
- `toNumber` missing in `helpers.ts`: added `toNumber` helper to `helpers.ts`.
- `analysis.totalRows`: `AuditWindowAnalysis` has `edgeRows` instead of `totalRows`. Updated assertion in `audit-integrity.test.ts`.
