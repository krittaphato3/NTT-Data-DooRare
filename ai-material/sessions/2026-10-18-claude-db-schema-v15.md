---
title: DB schema v1.5 (UI data gaps, multi-role, login history)
date: 2026-10-18
author: Alongkorn
ai: claude
tags: session, database, schema, postgres, mock
summary: schema v1.5 + enrich_v15.py mock; v_transport_item view; several roles per user
---

## Goal

- Make every role's UI feedable from the DB (schema gaps found in the UI-vs-schema audit).

## Done

- Branch `feature/db-inbound-view` (from `frontend`, local, not pushed).
- `db/schema.sql` v1.5 (66 tables), synced to `specification/schema.sql`:
  - hospital profile cols; `vehicle`; transport_task task_no/vehicle_id/eta_at/cancel_reason; transport_event.temperature_c
  - triage_level +UNKNOWN; incident.cancel_reason; audit_log.reason/agent_run_id (reason inside hash)
  - `app_user_role` (several roles/user; `app_user.role` = primary, kept in sync by trigger), role-history per (user, role), SoD rules (SYSTEM_ADMIN/AUDITOR single role; HOSPITAL_ADMIN never with operational roles)
  - `login_event`, app_user.mfa_enabled/last_login_at/last_seen_at (no Cognito)
  - `v_transport_item` (security-definer-style view): receiver sees drug/lot/expiry/qty/plate/driver of inbound tasks; SYSTEM_ADMIN/AUDITOR excluded
- `db/mock/enrich_v15.py` (called at end of `generate.py`, own RNG seed+15): v1.4 values unchanged (41 files byte-identical, 7 only gained columns/rows). `config/mock_config.yaml` has a `v15:` block.
- `verify.py`: 8 new v1.5 checks (all pass on the reloaded DB). `GUIDE-POSTGRES.md` updated.

- Catalogue 37 → 41: vitamin C 100 mg (GP 665277), povidone iodine 10% (GP 901938; both verified in TMTRF20261005), cotton SUP-0007, wound plaster SUP-0008 (all VED D). `tools/build_tmt.py` + `config/tmt_real.json` (old 30 entries identical, +2).
- Because the catalogue changed, the random stream shifted: ALL mock CSVs are new (not byte-identical to v1.4); `npm run db:reset` + all `verify.py` expectation checks pass.

## Decisions

- No storage location on stock_lot (dropped). HIS gateway/sensor health stays mock in the UI.
- Login history 90 days; 4 extra roles in mock.
- (v1.5 enrichment alone kept v1.4 values; the 4 new items regenerated everything.) `regional_warehouse_stock.csv` of v1.4 differed from what the committed generator produces (1 qty 391 vs 392): pre-existing, now regenerated.

## Files touched

- `db/schema.sql`, `specification/schema.sql`, `db/mock/{generate.py,enrich_v15.py,config/mock_config.yaml,load.sql,verify.py,GUIDE-POSTGRES.md}`.

## Errors

- numpy missing for system python3 → used a scratch venv (not in repo).
- A first edit of incident.cancel_reason silently did not apply (conditional replace) → fixed and re-checked.

## Next steps

- API/frontend still need to read `v_transport_item`, `app_user_role`, `login_event`; teammates run `python3 db/mock/generate.py` then `npm run db:reset`.
- Seed "today" live data and empty system tables (forecast, agent, document, audit, notification).
- `app_user` has no RLS (not changed here).
