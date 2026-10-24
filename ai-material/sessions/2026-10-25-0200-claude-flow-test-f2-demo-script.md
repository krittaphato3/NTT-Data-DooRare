# Main-flow test on the local Docker DB + F2 demo script

## Goal
- User: add an F2 scenario to the demo script (branch feat/demo-scenarios-f2, from origin/backend-byok), then test the main flows end to end on the local database (Docker `doorare-db`, not RDS).

## Done
- `backend/scripts/demo-f2.ts` (+ `npm run db:scenarios-f2`, `scripts/db.sh scenarios-f2`, `db/demo/README.md`): adds near-expiry stock lots sized to what other hospitals can absorb, runs the scan, owner pharmacists release lots through the API, receivers checked with `/pool/:id/candidates` (no-receiver lot withdrawn, next tried). Repeatable (new `DEMO-F2-<code><run>-<k>` names); needs DB access for the stock-lot inserts. No schema change.
- Smoke test (pages open, API calls 2xx): pharmacist 10 pages, warehouse 9, ER 8, driver 3.
- F2 end to end: UI round over 4 pool lots with the real LLM (nvidia nemotron free) -> 3 plans (1 auto-approved), 1 lot skipped (receiver need already planned) -> approvals (HC via UI, HB/HA via API) -> transport tasks -> load/depart/arrive/receive (API) -> plans COMPLETED, lots TRANSFERRED / back in pool for the remainder.
- F1: BR-2026-000607 approved in the UI (HA), accepted in the UI (HC lender queue), shipment moved via API, HA received 142 (request PARTIALLY_FULFILLED, next leg asked automatically).
- F3: ER requested close, pharmacist co-signed (API) -> RECONCILED.

## Bug fixed
- `AllocationDrawer`: after the owner picked the cost option the approve / reject buttons disappeared until a reload (the "decision saved" banner replaced them). Banner now replaces the controls only when the viewer has nothing left to approve.

## Observations (not fixed)
- Round with the free LLM takes ~35-40 s per lot (4 lots ~2.5 min).
- Receiver of an uneconomical (>20%) plan sees a disabled approve button; the reason is only a tooltip.
- Agent text can call a >20% cost "worth it"; humans still decide.
- Warehouse load / driver depart / arrive / receive were done by API (photo upload not driven in the UI).
- Documents pages are empty; Si formula still shown in the borrow drawer (hub drawer simplification still open).
- Local DB now has leftover DEMO-F2 near-expiry lots (HB / HC waiting) from repeated script runs.

## Next
- Not pushed. Branch feat/demo-scenarios-f2 has the script commit + this fix.
