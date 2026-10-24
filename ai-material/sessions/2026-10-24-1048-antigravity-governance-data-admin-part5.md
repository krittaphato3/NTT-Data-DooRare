# Session: Data Admin Governance Tools (Person 5 Scope - Part 5)

**Goal:** Implement Part 5 of 9 for Person 5: build `backend/src/modules/ai/tools/governance/dataAdmin.tools.ts` containing 4 tools (`get_unmapped_catalog_items`, `get_mapping_suggestions`, `audit_ved_classifications`, `submit_data_admin_proposal`).

## Done
- Verified schema tables, columns, and types in `specification/schema.sql`:
  - `hospital_drug`: `ved` is defined `NOT NULL DEFAULT 'E'`, whereas `abc` is nullable.
  - `drug_mapping`: `UNIQUE (hospital_drug_id)` guarantees 1:1 relationship with `hospital_drug`.
  - `mapping_candidate`: links to `tmt_reference(tmt_id)`, which has `gp_id`, `name`, `level`.
  - `drug_master`: does not store local hospital VED/ABC classifications.
- Identified that `DATA_ADMIN` is a central/global role operating across all hospitals (no mandatory hospitalId context restriction; accepts optional `hospitalId` filter).
- Added `HIGH_COST_VED_REVIEW_THRESHOLD_THB = 10000` to `governance.utils.ts` as an assumption constant.
- Created `backend/src/modules/ai/tools/governance/dataAdmin.tools.ts` with all 4 tools adhering to AGT-GEN-001 (read-only/calculation, proposal cards only):
  - Supported pagination (`limit`, `offset`, `total`, `truncated`) on all list queries.
  - Supported mutual exclusion validation on `hospitalDrugId` vs `mappingId` in `getMappingSuggestionsTool`.
  - Checked multi-hospital VED conflict across verified mappings in `auditVedClassificationsTool`.
  - Formatted proposals for `API-F2b-004` (verify mapping), `API-F2b-005` (reject mapping), and `API-F2b-008` (central items).
- Executed smoke tests via `npx tsx -e` against live Postgres database verifying all 4 tools and proposal generation.
- Ran `npm --prefix backend run build` with 0 errors.

## Decisions
- Maintained pure `z.ZodObject` on `getMappingSuggestionsTool.parameters` to preserve complete compatibility with `zodToJsonSchema`.
- Noted that `MISSING_VED` is structurally prevented by database schema `NOT NULL` constraint; only `MISSING_ABC` checks for nulls.

## Files Touched
- `backend/src/modules/ai/tools/governance/dataAdmin.tools.ts` (created)
- `backend/src/modules/ai/tools/governance/governance.utils.ts` (added `HIGH_COST_VED_REVIEW_THRESHOLD_THB`)
- `ai-material/sessions/2026-10-24-1048-antigravity-governance-data-admin-part5.md` (created)

## Errors Encountered
- None.

## Next Steps
- Proceed to Part 6 when requested.
