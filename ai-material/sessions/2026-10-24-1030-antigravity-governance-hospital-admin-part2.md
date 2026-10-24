# Session: Hospital Admin Governance Tools (Person 5 Scope - Part 2)

**Goal:** Implement Part 2 of 9 for Person 5: build `backend/src/modules/ai/tools/governance/hospitalAdmin.tools.ts` containing 4 tools (`get_hospital_kpi_dashboard`, `get_waiver_impact_analysis`, `audit_hospital_anomalies`, `submit_hospital_admin_proposal`).

## Done
- Verified schema tables, columns, types, and constraints in `specification/schema.sql` (`hospital.name_th`, `stock_alert.created_at`, `return_obligation`, `near_expiry_item`, `borrow_request`, `drug_master`, `hospital_drug`).
- Verified API endpoint schemas from backend routes and `specification/07-api.md`:
  - `POST /api/v1/return-obligations/:id/waive` (API-XC-005): expects `{ reason: string }` (min 3 chars in route, tool enforces min 10).
  - `POST /api/v1/incidents/:id/plan/approve` (API-F3-006): expects optional `planId` and `note`.
  - `POST /api/v1/borrow-requests/:id/escalate-manual` (API-F1b-012): endpoint expects `{ reason: string }`.
- Created `backend/src/modules/ai/tools/governance/hospitalAdmin.tools.ts` with all 4 tools adhering to AGT-GEN-001 (read-only/calculation, proposals only) and tenant isolation via `ensureHospitalScope`.
- Executed smoke check via `npx tsx -e` against live Postgres database verifying KPI dashboard metrics calculation, anomaly audits, and proposal creation.
- Ran `npm --prefix backend run build` with 0 errors.

## Decisions
- Kept `hospitalAdminTools` parameters as `z.ZodObject` to guarantee compatibility with `zodToJsonSchema`.
- Checked return obligation closure status ('WAIVED' or 'RETURNED') before generating a waiver proposal.

## Files Touched
- `backend/src/modules/ai/tools/governance/hospitalAdmin.tools.ts` (created)
- `ai-material/sessions/2026-10-24-1030-antigravity-governance-hospital-admin-part2.md` (created)

## Errors Encountered
- None.

## Next Steps
- Proceed to Part 3 when requested.
