# Session: 2026-10-24 12:32 - Person 5 Scope: Governance Final Verification & Capstone (Part 9 - Corrected)

## Goal
Provide a strictly evidence-based capstone session note and verification record for Person 5 (Governance, Compliance & QA Lead), replacing all unverified or hallucinated claims with facts verified directly from source code, the tool registry, test runner outputs, and PostgreSQL database queries.

## Done
- **Registry & Toolset Auditing**:
  - Queried `defaultToolRegistry` and toolset exports via read-only script.
  - Established ground truth counts: 22 governance tools, 15 logistics tools, 12 clinical tools, 2 sample tools (`ping_system`, `submit_sample_action_proposal`), for a total of 51 registered tools in `defaultToolRegistry`.
  - Reconciled all 22 real governance tool names across the 5 domains (hospitalAdmin: 4, regionAdmin: 5, systemAdmin: 5, dataAdmin: 4, auditor: 4).
- **Test Suite Execution & Skip Accounting**:
  - Ran `npx tsx --test tests/ai.governance.test.ts`: 62 tests (58 passed, 4 skipped, 0 failed) in 386ms.
  - Ran `npm test`: 225 tests (221 passed, 4 skipped, 0 failed) in ~31s.
  - Verified that all 4 skips in `npm test` originate entirely from data absence in the seed database within the governance suite (0 from clinical/logistics).
- **Architecture & Technical Debt Grounding**:
  - Audited `tests/ai.governance.test.ts`: confirmed the bridge uses single-process side-effect imports (`import './ai/hospitalAdmin.tools.test.js'`, etc.) with an idempotent monkeypatch of `pool.end`, not child process spawning.
  - Verified 3 test files calling `pool.end()` directly: `hospitalAdmin.tools.test.ts:516`, `regionAdmin.tools.test.ts:428`, `systemAdmin.tools.test.ts:512`.
  - Confirmed telemetry gaps in runtime ReAct engine: zero `INSERT INTO agent_tool_call` in the repository, zero `INSERT INTO agent_run` or `audit_log` in `backend/src/modules/ai/`.

## Decisions & Technical Details

### 1. Final Inventory (Ground Truth from Registry)

- **Toolset Array Lengths**:
  - `governanceTools`: **22 tools**
    - `hospitalAdminTools` (4 tools): `get_hospital_kpi_dashboard`, `get_waiver_impact_analysis`, `audit_hospital_anomalies`, `submit_hospital_admin_proposal`
    - `regionAdminTools` (5 tools): `get_regional_stock_heatmap`, `get_regional_surge_signals`, `simulate_pool_allocation`, `get_regional_directives`, `submit_region_admin_proposal`
    - `systemAdminTools` (5 tools): `get_llm_health_metrics`, `test_llm_connectivity`, `verify_audit_chain_integrity`, `get_system_configuration_status`, `submit_system_admin_proposal`
    - `dataAdminTools` (4 tools): `get_unmapped_catalog_items`, `get_mapping_suggestions`, `audit_ved_classifications`, `submit_data_admin_proposal`
    - `auditorTools` (4 tools): `inspect_agent_run_provenance`, `inspect_narcotics_chain_of_custody`, `verify_tamper_evidence`, `submit_auditor_finding_proposal`
  - `logisticsTools`: **15 tools**
  - `clinicalTools`: **12 tools**
  - Built-in / Sample in `registry.ts`: **2 tools** (`ping_system`, `submit_sample_action_proposal`)
  - **`defaultToolRegistry.getAll()` Total**: **51 tools**
- **Test Files and Static Assertion Counts** (Static regex match `assert\.`):
  - `tests/ai/hospitalAdmin.tools.test.ts`: 518 lines, **69 static asserts**
  - `tests/ai/regionAdmin.tools.test.ts`: 430 lines, **52 static asserts**
  - `tests/ai/systemAdmin.tools.test.ts`: 513 lines, **68 static asserts**
  - `tests/ai/dataAdmin.tools.test.ts`: 758 lines, **106 static asserts**
  - `tests/ai/auditor.tools.test.ts`: 658 lines, **109 static asserts**
  - `tests/ai/rbac-matrix.test.ts`: 398 lines, **55 static asserts**
  - `tests/ai/audit-integrity.test.ts`: 403 lines, **24 static asserts**
  - `tests/ai/helpers.ts`: 143 lines, **6 static asserts**
  - `tests/ai.governance.test.ts`: 87 lines, **5 static asserts**

### 2. Test Execution Results & Skip Breakdown

- **Governance Bridge Suite (`npx tsx --test tests/ai.governance.test.ts`)**:
  - Tests: **62**
  - Pass: **58**
  - Fail: **0**
  - Skipped: **4**
  - Duration: **~386ms**
- **Full Backend Suite (`npm test`)**:
  - Tests: **225**
  - Pass: **221**
  - Fail: **0**
  - Skipped: **4**
  - Duration: **~31.1s**
- **Exact Reasons for the 4 Skipped Tests** (All 4 caused by data absence in seed database):
  1. `hospitalAdmin.tools: APPROVE_INCIDENT_PLAN proposal success-path`: Skipped because `SELECT count(*) FROM emergency_plan WHERE status = 'READY_FOR_APPROVAL'` is **0**.
  2. `regionAdmin.tools: Region scoping and tenant isolation`: Skipped cross-region denial because `SELECT count(DISTINCT region_id) FROM hospital` is **1** (single-region seed DB).
  3. `auditor.tools: inspect_agent_run_provenance ... single-run mode`: Skipped because `SELECT count(*) FROM agent_run` is **0**.
  4. `audit-integrity: 4. Bounded window topology ... Audit log window checks`: Skipped because `SELECT count(*) FROM audit_log` is **0**.

### 3. Coverage Honesty (Real Data vs. Vacuous Execution)

- **Items Vacuous due to Seed Data Absence**:
  - `inspect_agent_run_provenance` (single-run mode): Vacuous on live DB rows (`agent_run` count = 0); the toolCalls fetching branch, correlation join to `audit_log`, and private `sanitizeAndTruncate` formatting helper on run outputs are unexercised against real DB rows.
  - `audit-integrity` Test 4 window topology: Vacuous in execution against seed DB (subtest skips due to `audit_log` count = 0).
  - `audit_chain_verify()` and independent SQL decomposition: Vacuous regarding row content and tamper detection on seed data; evaluates empty table formula where `count(*) = 0` yields `0` anomalies.
  - `verify_tamper_evidence` vs `audit_chain_verify()`: Vacuous for hash correctness (both evaluate 0 rows and return 0 vs 0).
  - `APPROVE_INCIDENT_PLAN` success path: Vacuous on seed DB (0 emergency plans with `READY_FOR_APPROVAL`).
  - Cross-region denial in `regionAdmin.tools`: Vacuous on seed DB (only 1 region in hospital table).
- **Items Non-Vacuous (Real Data & Algorithmic Proofs)**:
  - Hash method equivalence: Non-vacuous. Computes live PostgreSQL `encode(sha256(convert_to(..., 'UTF8')), 'hex')` vs Node.js `crypto.createHash('sha256')` across ASCII and complex Thai UTF-8 strings.
  - Synthetic cryptographic chain tests (Test 6): Non-vacuous. 100% pure in-memory cryptographic verification of valid chains, field modifications, row deletions, row reorderings, and chain forks.
  - Pure unit functions: Non-vacuous. `analyzeAuditWindow` (partitioning, anomaly detection, genesis candidates) and `detectCustodyGaps` (all 7 compliance finding codes: `MISSING_DRIVER`, `MISSING_DEPARTURE_PHOTO`, `MISSING_ARRIVAL_PHOTO`, `TIMESTAMP_ANOMALY`, `STALE_TRANSIT`, `CONTROLLED_IN_ALLOCATION`, `UNEXPECTED_CARRIER`).
  - RBAC matrix: Non-vacuous. Evaluates 510 combinations (10 roles x 51 tools) with spy mocking to verify exact denied status codes and 0 SQL tool execution for unauthorized roles.
  - Real database queries: Non-vacuous. `get_unmapped_catalog_items` (191 hospital drugs), `get_mapping_suggestions` (48 candidates), `audit_ved_classifications`, `get_regional_stock_heatmap`, `inspect_narcotics_chain_of_custody` (3 controlled drugs in `drug_master`, 679 transport tasks).

### 4. Findings (Security & Architecture)

- **Wildcard Permission in `registry.ts`**:
  - Tool `ping_system` defines `allowedRoles: ['*']`.
  - In [`backend/src/modules/ai/tools/registry.ts#L139`](file:///Users/sun/Documents/ntt-data/NTT-Data-DooRare/backend/src/modules/ai/tools/registry.ts#L139):
    ```ts
    if (role !== 'SYSTEM_ADMIN' && !tool.allowedRoles.includes('*') && (!role || !tool.allowedRoles.includes(role))) {
      return { success: false, error: `Permission denied: Role '${role || 'ANONYMOUS'}' is not authorized...` };
    }
    ```
  - Because `!tool.allowedRoles.includes('*')` evaluates to false, role checks are bypassed for `ping_system`. It executes successfully for `undefined`, empty string `""`, invalid strings (e.g. `'HACKER'`), and standard domain roles (e.g. `PHARMACIST`).
  - Severity: Low/Informational (it performs no database queries or writes; returns server uptime and mock status).
- **SYSTEM_ADMIN Role Bypass**:
  - In `registry.ts#L139`, any user with `role === 'SYSTEM_ADMIN'` bypasses role gating and can execute any tool in the registry.
- **Product Telemetry Gap in AI ReAct Engine**:
  - Across the entire backend codebase, there is **zero** occurrences of `INSERT INTO agent_tool_call` (the only reference is a SELECT in `auditor.tools.ts:161`).
  - While business logic services insert into `agent_run` (`borrow.service.ts:300` on borrow request creation; `plan.service.ts:313` on incident plan generation), the chat/ReAct loop in `backend/src/modules/ai/` contains **zero** INSERT statements into `agent_run`, `agent_tool_call`, or `audit_log`.
  - As a result, audit tools inspecting agent execution return empty sets for interactive AI chat sessions until runtime telemetry logging is wired.

### 5. Technical Debt

- **Direct `pool.end()` Calls in Test Suites**:
  - Three test files from Part 8a call `pool.end()` directly in their post-suite teardown:
    - [`backend/tests/ai/hospitalAdmin.tools.test.ts#L516`](file:///Users/sun/Documents/ntt-data/NTT-Data-DooRare/backend/tests/ai/hospitalAdmin.tools.test.ts#L516)
    - [`backend/tests/ai/regionAdmin.tools.test.ts#L428`](file:///Users/sun/Documents/ntt-data/NTT-Data-DooRare/backend/tests/ai/regionAdmin.tools.test.ts#L428)
    - [`backend/tests/ai/systemAdmin.tools.test.ts#L512`](file:///Users/sun/Documents/ntt-data/NTT-Data-DooRare/backend/tests/ai/systemAdmin.tools.test.ts#L512)
  - Bridge runner `tests/ai.governance.test.ts` handles this in a single process by monkeypatching `pool.end` to be idempotent:
    ```ts
    const origPoolEnd = pool.end.bind(pool);
    let poolEnded = false;
    pool.end = (async () => {
      if (poolEnded) return;
      poolEnded = true;
      return origPoolEnd();
    }) as any;
    ```
  - *Recommendation*: In a future maintenance pass, remove explicit `pool.end()` calls from individual test files and let the root test harness manage pool lifecycle.

### 6. Rejected Options

- **Transactional Rollback Audit Test**:
  - Rejected writing a temporary row to `audit_log` inside a `BEGIN ... ROLLBACK` block to make `verify_tamper_evidence` non-vacuous against the live DB.
  - **Reasons**:
    1. `specification/schema.sql#L33`: Trigger function `audit_log_chain()` executes `SELECT last_hash INTO p FROM audit_chain_head WHERE singleton FOR UPDATE;` holding an exclusive row-level lock on `audit_chain_head` until transaction commit/rollback, potentially blocking writers.
    2. `audit_log.id` is generated by `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`; aborted inserts create permanent sequence number gaps.
    3. `audit_log_ro` trigger enforces strict append-only immutability.
    4. Cryptographic chain inputs in `schema.sql#L36`: `coalesce(p,'') || extract(epoch FROM NEW.occurred_at)::text || coalesce(NEW.actor_id::text,'') || NEW.action || NEW.entity_type || coalesce(NEW.entity_id::text,'') || coalesce(NEW.after::text,'') || coalesce(NEW.reason,'')` include `actor_id` and `after`, requiring valid foreign keys.
    5. Synthetic chain unit tests in Test 6 already provide 100% non-vacuous verification of the hashing and tampering detection algorithms.

### 7. Assertion History Across Parts 8a-8d & 9

- **Part 8a-fix**:
  - Replaced weak `> 0` assertions with strict enum checks:
    - In `hospitalAdmin.tools.test.ts`, verified step counts and status (`READY_FOR_APPROVAL`, `APPROVED`) rather than generic truthiness.
- **Part 8c**:
  - In `auditor.tools.test.ts`, verified exact transport task count `679` (58 `ALLOCATION_LINE`, 621 `BORROW_LEG`) instead of `> 0`.
- **Part 8d**:
  - Added 21 explicit assertion tests covering proposal payload shapes, role authorization gates, decimal override in `base_units_per_pack`, unknown UUID fallbacks, and tamper evidence contracts.
- **Part 9**:
  - In `audit-integrity.test.ts#L156`, replaced weak `assert.ok(analysis.edgeRows >= 0)` with the partition identity `analysis.linkedPairs + analysis.edgeRows + analysis.genesisCandidatesInWindow === windowRows.length`.
  - Documented that in execution against the seed DB, Test 4 takes the skip branch (`audit_log` count = 0), so this assertion is evaluated only when rows are present.

## Files Touched
- `ai-material/sessions/2026-10-24-1232-antigravity-governance-final-part9.md` (this corrected session note)
- `ai-material/INDEX.md` and `ai-material/.index.json` (synchronized via `scripts/ai-index.mjs`)

## Errors Encountered
- None. Corrected all documentation claims to align 100% with verified runtime output and source code.

## Next Steps
- Scope for Person 5 is fully documented, verified, and ready for review.
