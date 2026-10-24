# Session: Region Admin Governance Tools (Person 5 Scope - Part 3)

**Goal:** Implement Part 3 of 9 for Person 5: build `backend/src/modules/ai/tools/governance/regionAdmin.tools.ts` containing 5 tools (`get_regional_stock_heatmap`, `get_regional_surge_signals`, `simulate_pool_allocation`, `get_regional_directives`, `submit_region_admin_proposal`).

## Done
- Verified schema tables, columns, and types in `specification/schema.sql` (`region.name_th`, `hospital.region_id`, `hospital_distance`, `stock_alert.suggested_borrow_qty`, `context_signal.valid_from` / `valid_to` as `date`, `config_setting.scope`, `allocation_plan`).
- Verified OpenAPI specs and service implementations for proposal actions:
  - `POST /api/v1/context-signals`: accepts `regionId`, `signalType`, `payload`, `validFrom`, optional `validTo`, `source`. Standard signal types: `OUTBREAK`, `SEASON`, `EVENT`, `ABNORMAL_DEMAND`.
  - `POST /api/v1/allocation-plans/:id/option`: accepts `option` from `['MERGE_SHIPMENTS', 'RAISE_VALUE', 'DONATE_OR_DISCARD', 'HOLD']`, `version`, and optional `reason`.
- Created `backend/src/modules/ai/tools/governance/regionAdmin.tools.ts` with all 5 tools adhering to AGT-GEN-001 (read-only/calculation, proposal cards only) and tenant isolation via `ensureRegionScope`.
- Redacted sensitive tokens matching `/secret|key|token|password/i` in directives tool.
- Executed comprehensive smoke-check via `npx tsx -e` against live Postgres database verifying heatmap calculation, surge signals lookup, greedy pool simulation, directives merge, and both proposal types.
- Ran `npm --prefix backend run build` with 0 errors.

## Decisions
- Used `date` comparison `CURRENT_DATE` for `context_signal` since `valid_from` and `valid_to` are PostgreSQL `date` types.
- Included justifiable global policies (`agent.%`, `expiry.%`, `borrow.%`, `emergency.%`) alongside `REGION:<id>` config settings in directives briefing.

## Files Touched
- `backend/src/modules/ai/tools/governance/regionAdmin.tools.ts` (created)
- `ai-material/sessions/2026-10-24-1038-antigravity-governance-region-admin-part3.md` (created)

## Errors Encountered
- None.

## Next Steps
- Proceed to Part 4 when requested.
