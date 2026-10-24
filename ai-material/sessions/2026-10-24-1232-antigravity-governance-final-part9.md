# Session: 2026-10-24 12:32 - Person 5 Scope: Governance Final Verification & Capstone (Part 9 - Corrected)

## Goal
Provide a strictly evidence-based capstone session note and verification record for Person 5 (Governance, Compliance & QA Lead), replacing all unverified or inaccurate claims with facts verified directly from source code, the tool registry, test runner outputs, and PostgreSQL database queries.

## Done
- **Registry & Toolset Auditing**:
  - Queried `defaultToolRegistry` and toolset exports via read-only script.
  - Established ground truth counts: 22 governance tools, 15 logistics tools, 12 clinical tools, 2 sample tools (`ping_system`, `submit_sample_action_proposal`), for a total of 51 registered tools in `defaultToolRegistry`.
  - Reconciled all 22 real governance tool names across the 5 domains (hospitalAdmin: 4, regionAdmin: 5, systemAdmin: 5, dataAdmin: 4, auditor: 4).
- **Test Suite Execution & Skip Accounting**:
  - Ran `npx tsx --test tests/ai.governance.test.ts`: 62 tests (58 passed, 4 skipped, 0 failed) in 386ms.
  - Ran `npm test`: 225 tests (221 passed, 4 skipped, 0 failed) in ~31s.
  - Verified that all 4 skips in `npm test` originate entirely from data absence in the seed database across 4 specific governance test files (0 from clinical/logistics).
- **Architecture & Technical Debt Grounding**:
  - Audited `tests/ai.governance.test.ts`: confirmed the bridge runs in a single Node process using direct ES module side-effect imports (`import './ai/hospitalAdmin.tools.test.js'`, etc.) with an idempotent monkeypatch of `pool.end`, rather than spawning child processes.
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
- **Originating Test Files and Database Reasons for the 4 Skipped Tests**:
  1. Origin: `backend/tests/ai/hospitalAdmin.tools.test.ts`
     - Test: `hospitalAdmin.tools: APPROVE_INCIDENT_PLAN proposal success-path`
     - Reason: Skipped because `SELECT count(*) FROM emergency_plan WHERE status = 'READY_FOR_APPROVAL'` is **0**.
  2. Origin: `backend/tests/ai/regionAdmin.tools.test.ts`
     - Test: `regionAdmin.tools: Region scoping and tenant isolation`
     - Reason: Skipped cross-region denial because `SELECT count(DISTINCT region_id) FROM hospital` is **1** (single-region seed DB).
  3. Origin: `backend/tests/ai/auditor.tools.test.ts`
     - Test: `auditor.tools: inspect_agent_run_provenance list mode, metadata restriction, and single-run mode > single-run mode inspection with real database row`
     - Reason: Skipped because `SELECT count(*) FROM agent_run` is **0**.
  4. Origin: `backend/tests/ai/audit-integrity.test.ts`
     - Test: `audit-integrity: 4. Bounded window topology and Map-by-row_hash verification > Audit log window checks (vacuous execution: audit_log table has 0 rows)`
     - Reason: Skipped because `SELECT count(*) FROM audit_log` is **0**.

### 3. Coverage Honesty (Real Data vs. Vacuous Execution)

- **Items Vacuous due to Seed Data Absence**:
  - `inspect_agent_run_provenance` (single-run mode): Vacuous on live DB rows (`agent_run` count = 0); the `toolCalls` fetching branch (`SELECT ... FROM agent_tool_call`), correlation join to `audit_log`, and private `sanitizeAndTruncate` formatting helper on run outputs are unexercised against real DB rows.
  - `audit-integrity` Test 4 window topology: Vacuous in execution against seed DB (subtest skips due to `audit_log` count = 0).
  - `audit_chain_verify()` and independent SQL decomposition: Vacuous regarding row content and tamper detection on seed data; evaluates empty table formula where `count(*) = 0` yields `0` anomalies.
  - `verify_tamper_evidence` vs `audit_chain_verify()`: Vacuous for hash correctness (both evaluate 0 rows and return 0 vs 0).
  - `APPROVE_INCIDENT_PLAN` success path: Vacuous on seed DB (0 emergency plans with `READY_FOR_APPROVAL`).
  - Cross-region denial in `regionAdmin.tools`: Vacuous on seed DB (only 1 region in hospital table).
- **Items Non-Vacuous (Real Data & Algorithmic Proofs)**:
  - Hash method equivalence: Non-vacuous. Computes live PostgreSQL `encode(sha256(convert_to(..., 'UTF8')), 'hex')` vs Node.js `crypto.createHash('sha256')` across ASCII and complex Thai UTF-8 strings.
  - Synthetic cryptographic chain tests (Test 6): Non-vacuous. 100% pure in-memory cryptographic verification of valid chains, field modifications, row deletions, row reorderings, and chain forks.
  - Pure unit functions: Non-vacuous.
    - `analyzeAuditWindow`: verified for partitioning, anomaly detection, and genesis candidates.
    - `detectCustodyGaps`: verified for all 7 compliance finding codes defined in `NarcoticsTaskFinding` (`auditor.tools.ts#L386-394`):
      1. `MISSING_DRIVER`
      2. `MISSING_TIMESTAMP`
      3. `TIMESTAMP_ORDER_VIOLATION`
      4. `NO_EVENT_TRAIL`
      5. `NO_HANDOVER_PHOTO`
      6. `STALE_IN_TRANSIT`
      7. `CONTROLLED_IN_ALLOCATION`
  - RBAC matrix: Non-vacuous. Evaluates 510 combinations (10 roles x 51 tools) with spy mocking to verify exact denied status codes and 0 SQL tool execution for unauthorized roles.
  - Real database queries: Non-vacuous.
    - `get_unmapped_catalog_items`: queries 191 hospital drugs (`hospital_drug`).
    - `get_mapping_suggestions`: queries 48 candidates (`mapping_candidate`).
    - `audit_ved_classifications`: queries drug mappings (`drug_mapping`, 191 rows).
    - `get_regional_stock_heatmap`: queries active stock across hospital inventory.
    - `inspect_narcotics_chain_of_custody`: queries 3 controlled substances (`drug_master` where `is_controlled = true`) across 679 transport tasks (`transport_task`).

### 4. Findings (Security & Architecture)

- **Wildcard Permission in `registry.ts`**:
  - Tool `ping_system` defines `allowedRoles: ['*']`.
  - Source location: [`backend/src/modules/ai/tools/sample.tools.ts#L8-L27`](file:///Users/sun/Documents/ntt-data/NTT-Data-DooRare/backend/src/modules/ai/tools/sample.tools.ts#L8-L27).
  - Its `execute` function returns:
    ```ts
    return {
      success: true,
      data: {
        pong: true,
        echo: args.echo || 'OK',
        serverTime: new Date().toISOString(),
        callerRole: context.role || 'ANONYMOUS',
        hospitalId: context.hospitalId || null,
      },
    };
    ```
  - In [`backend/src/modules/ai/tools/registry.ts#L139`](file:///Users/sun/Documents/ntt-data/NTT-Data-DooRare/backend/src/modules/ai/tools/registry.ts#L139):
    ```ts
    if (role !== 'SYSTEM_ADMIN' && !tool.allowedRoles.includes('*') && (!role || !tool.allowedRoles.includes(role))) {
      return { success: false, error: `Permission denied: Role '${role || 'ANONYMOUS'}' is not authorized...` };
    }
    ```
  - Because `!tool.allowedRoles.includes('*')` evaluates to false, role checks are bypassed for `ping_system`. It executes successfully for `undefined`, empty string `""`, invalid strings (e.g. `'HACKER'`), and standard domain roles (e.g. `PHARMACIST`).
  - Severity: Low/Informational (it performs no database queries or writes; returns server timestamp, role echo, and pong).
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
  - Bridge runner `tests/ai.governance.test.ts#L10-L17` handles this in a single process by monkeypatching `pool.end` to be idempotent:
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
    1. `specification/schema.sql#L549-560`: Table `audit_chain_head` maintains the chain tail. Trigger function `audit_log_chain()` executes:
       ```sql
       SELECT last_hash INTO p FROM audit_chain_head WHERE singleton FOR UPDATE;
       ```
       Line 556 holds an exclusive row-level lock on `audit_chain_head` until transaction commit/rollback, potentially blocking writers.
    2. `specification/schema.sql#L533`: `audit_log.id` is generated by `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`; aborted inserts create permanent sequence number gaps.
    3. `specification/schema.sql#L565`: `audit_log_ro` trigger enforces strict append-only immutability.
    4. `specification/schema.sql#L558-559`: Cryptographic chain inputs:
       ```sql
       NEW.row_hash := encode(sha256(convert_to(coalesce(p,'') || extract(epoch FROM NEW.occurred_at)::text || coalesce(NEW.actor_id::text,'') || NEW.action || NEW.entity_type || coalesce(NEW.entity_id::text,'') || coalesce(NEW.after::text,'') || coalesce(NEW.reason,''), 'UTF8')), 'hex');
       ```
       Hash formula includes `actor_id` and `after`, requiring valid foreign keys and realistic payloads.
    5. Synthetic chain unit tests in Test 6 already provide 100% non-vacuous verification of the hashing and tampering detection algorithms.

### 7. Assertion History Across Parts 8a-8d & 9

- **Part 8a-fix (`commit 02914c0`)**:
  - `hospitalAdmin.tools.test.ts`: Replaced hardcoded `test.skip('hospitalAdmin.tools: APPROVE_INCIDENT_PLAN proposal (Real tool bug in hospitalAdmin.tools.ts: table incident has no title column)')` with:
    - Path 2a: `assert.equal(resUnknownInc.success, false)` asserting unknown incident UUID failure message.
    - Path 2b: `assert.equal(resNoReadyPlan.success, false)` asserting no READY_FOR_APPROVAL plan failure message.
    - Conditional test: `hospitalAdmin.tools: APPROVE_INCIDENT_PLAN proposal success-path` with explicit payload assertions (`assert.equal(resApprove.success, true)`, `assert.equal(resApprove.data.requiresHumanApproval, true)`, endpoint, method, and `planId`) and row-count stability assertions on `incident` and `emergency_plan`.
- **Part 8b (`commits 0f7638e, 041d067`)**:
  - Created `dataAdmin.tools.test.ts` (106 static asserts) and `auditor.tools.test.ts` (109 static asserts) covering schema validation, queries against real seed data, pure helpers (`detectCustodyGaps`, `analyzeAuditWindow`), and proposal contracts.
- **Part 8c (`commits c7f4748, 149d29a`)**:
  - `systemAdmin.tools.test.ts`: Added `ok: true` property to `byokService.testConnection` mock response.
  - `helpers.ts`: Added `toNumber` conversion helper.
  - Created `rbac-matrix.test.ts` (55 static asserts) testing 510 combinations across 10 roles x 51 tools, and `audit-integrity.test.ts` (24 static asserts) testing database SHA-256 vs Node crypto and synthetic chain corruption.
- **Part 8d (`commit 2283a75`)**:
  - `dataAdmin.tools.test.ts`: Added subtests for `VERIFY_DRUG_MAPPING` warnings on already `VERIFIED` and `REJECTED` mappings, and 5 subtests asserting validation on required fields for `UPDATE_CENTRAL_ITEM` (`itemType`, `internalCode`, `genericName`, `baseUnit`, invalid enum).
  - `audit-integrity.test.ts`: Added vacuity and test rigor classification comment header.
  - `ai.governance.test.ts`: Added `mock-leak guard` test verifying no residual mocks on `tool.execute` or `byokService`.
- **Part 9 (`commit 9901718`)**:
  - `audit-integrity.test.ts#L156`: Replaced `assert.ok(analysis.edgeRows >= 0)` with `assert.equal(analysis.linkedPairs + analysis.edgeRows + analysis.genesisCandidatesInWindow, windowRows.length, ...)`.
  - Updated Test 5 vacuity comment noting empty table compares 0 to 0.

### 8. Limitations & Known Verification Boundaries

- **Task 1 Assertion Unexecuted on Live Database**: The partition identity assertion in `backend/tests/ai/audit-integrity.test.ts#L156` (`analysis.linkedPairs + analysis.edgeRows + analysis.genesisCandidatesInWindow === windowRows.length`) is situated inside Test 4 behind an `if (windowRows.length === 0)` guard that skips. Because `audit_log` has 0 rows in the seed database, this assertion has **never executed against real rows** in the test suite.
- **`analyzeAuditWindow` Partition Edge-Case**: In `backend/src/modules/ai/tools/governance/auditor.tools.ts#L852-856`, if a self-referential loop occurs (`String(parent.id) === String(r.id)`), `anomalies` is populated but `linkedPairs` is not incremented, nor is `edgeRows` incremented. In that specific corruption scenario, `linkedPairs + edgeRows + genesisCandidatesInWindow` would equal `rows.length - 1`, not `rows.length`.
- **Single-Run Provenance Helper Untested on Real DB Rows**: In `inspect_agent_run_provenance`, because `agent_run` has 0 rows in the seed database, the single-run test skips. The internal `sanitizeAndTruncate` formatting helper and the `toolCalls` mapping loop over `agent_tool_call` are unexercised against real database output.
- **ReAct Telemetry Unreachable in Production**: The ReAct execution loop does not write to `agent_run` or `agent_tool_call`, making provenance tools return empty sets in production until runtime telemetry logging is implemented.
- **Point-in-Time Database Figures**: All database figures cited (191 hospital drugs, 191 drug mappings, 48 mapping candidates, 679 transport tasks, 3 controlled substances) reflect the seed database state at the time of testing.

## Files Touched
- `ai-material/sessions/2026-10-24-1232-antigravity-governance-final-part9.md` (this corrected session note)

## Errors Encountered
- None. Corrected all documentation claims to align 100% with verified runtime output and source code.

## Next Steps
- Scope for Person 5 is fully documented, verified, and ready for review.
