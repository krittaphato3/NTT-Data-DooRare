# Session: Clinical & Emergency AI Toolsets (Person 3 Scope)

## Goal
Implement Person 3 deliverables on branch `backend-byok-clinical-tools`:
- 12 domain tools (7 PHARMACIST, 5 ER_STAFF) in `backend/src/modules/ai/tools/clinical/`
- Central registration in `backend/src/modules/ai/tools/index.ts`
- Comprehensive RBAC and unit test suite in `backend/tests/ai.clinical.test.ts`
- Strictly adhere to AGT-GEN-001 (read queries + terminal HITL proposals only)

## Done
- **Task 1: Baseline Verification**: Verified `zod` installation in `backend/`, ran baseline suite (70 tests passing).
- **Tasks 2–5: Pharmacist Toolset (`pharmacist.tools.ts`)**:
  - `get_stock_and_alerts`: Live usable stock, days of cover, ROP reorder alerts.
  - `get_forecast_trends`: F1 quantile demand trends (P50/P90/P95, ROP, method).
  - `get_ranked_lender_ladder`: Scoring candidate lenders by distance, stock safety, and Si score.
  - `draft_lender_communication`: Institutional Thai and English borrow request formatting.
  - `interpret_lender_response`: Parses free-text lender replies into `ACCEPT`, `PARTIAL`, `REJECT`, or `UNCLEAR` with G-09 injection defense.
  - `get_near_expiry_pool_status`: Regional pool candidates, days to expiry, and salvage benefits.
  - `submit_pharmacist_proposal`: Terminal Proposal tool mapping whitelisted endpoints for borrow creation, alert snoozing, and pool releases.
- **Tasks 6–8: ER Staff Toolset (`er.tools.ts`)**:
  - `get_antidote_locator`: 60-minute radius availability check for acute poisonings, returning only sanitized logistics info.
  - `get_incident_kit_recommendations`: Calculates emergency kit quantities from triage counts via core `needs()` formula.
  - `draft_emergency_incident`: Extracts Red/Yellow/Green/Black casualty counts from verbal triage descriptions without clinical advice.
  - `track_urgent_dispatch_eta`: Real-time transport status and courier ETA tracker for urgent deliveries.
  - `submit_er_action_proposal`: Terminal Proposal tool for declaring incidents, approving kit dispatches, or requesting urgent antidotes.
- **Task 9: Index & RBAC Registry Suite**:
  - Created `backend/src/modules/ai/tools/clinical/index.ts` exporting all 12 tools.
  - Registered all 12 tools into `defaultToolRegistry` in `backend/src/modules/ai/tools/index.ts`.
  - Added 42 tests verifying schema conversion, role authorization matrix (DRIVER/AUDITOR blocked, SYSTEM_ADMIN global, HOSPITAL_ADMIN read-only), and proposal payloads.
- **Task 10: Typecheck & Full Test Suite**:
  - Verified `npx tsc --noEmit` passes with 0 errors.
  - Full suite `npm test` passes 112/112 tests (100%).
- **Final Review Fixes**:
  - `submit_er_action_proposal`: Guarded `ER_STAFF` from requesting standalone borrow requests without `incidentId` (which target `/api/v1/borrow-requests`, restricted to `PHARMACIST`), returning a tool error instructing them to declare an incident first. Preserved standalone borrow requests for `PHARMACIST` and `SYSTEM_ADMIN`.
  - Added unit test cases for `ER_STAFF` without incidentId, `PHARMACIST` without incidentId, and `ER_STAFF` with incidentId.
  - Demonstrated that `interpret_lender_response` yields `UNCLEAR` with `NEEDS_CONFIRMATION` for "ไม่หมด" / "ยังไม่หมด" and `ACCEPT` for "พร้อมส่ง".

## Decisions
- Enforced tenant isolation across all 12 tools: queries verify `context.hospitalId` ownership unless caller is `SYSTEM_ADMIN`.
- Strictly forbade model-specified endpoints in terminal tools; endpoints and HTTP methods are mapped via code whitelists.
- Used core formula `needs()` from `backend/src/core/formulas/emergency.ts` for kit calculations to maintain institutional consistency.

## Files Touched
- `backend/src/modules/ai/tools/clinical/pharmacist.tools.ts`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/src/modules/ai/tools/clinical/index.ts`
- `backend/src/modules/ai/tools/index.ts`
- `backend/tests/ai.clinical.test.ts`
- `ai-material/sessions/2026-10-23-2250-antigravity-clinical-emergency-tools.md`
- `ai-material/INDEX.md`

## Errors Encountered
- `stock_lot` columns in schema are `qty_on_hand` and `qty_held` (not `quantity` / `reserved_quantity`). Handled in free stock queries.
- `near_expiry_item` FK is `lot_id` (not `stock_lot_id`), and pool status is `RELEASED_TO_POOL`. Corrected in query joins.
- Thai negation phrases "ไม่หมด" / "ยังไม่หมด" initially matched accept pattern; separated into `UNCLEAR` decision with `NEEDS_CONFIRMATION` flag.

## Next Steps
- Person 2 Copilot drawer integration: verify rendering of `ToolProposalPayload` action cards.
- Person 5 Governance QA: include clinical tools in end-to-end CLI security matrix.
