# Session: Fix `submit_er_action_proposal` Hallucinated UUID and Emergency Borrow Payload

- Date: 2026-10-25
- Goal: Fix `Incident '...' not found` error caused by hallucinated targetId UUIDs and missing payload fields on `REQUEST_URGENT_ANTIDOTE`.

## Root Causes Identified from User Screenshot

1. `Incident 'da7c42c8-5cea-4366-a2f3-3fcc1116f4da' not found`:
   - When models don't know the exact UUID of the newly declared incident, they hallucinate a random UUID into `targetId`.
   - The backend query `SELECT hospital_id FROM incident WHERE id = $1` found 0 rows and returned `Incident '...' not found`.
2. `ER_STAFF cannot create standalone borrow requests directly without an active incident`:
   - After the hallucinated UUID failed, the model attempted to retry without `targetId`.
   - Even though the hospital had a running incident created just seconds earlier, `targetId` was not bound, so the tool assumed it was a standalone request and rejected it.
3. Strict `payloadSchema` on `REQUEST_URGENT_ANTIDOTE`:
   - The model sent `{ requiredUnits: 3, bloodGroup: "A Negative", transfusionProtocol: "..." }`.
   - The previous schema strictly required `items: [{ drugMasterId, qtyRequested }]`, which is impossible for models to know for blood requests.
4. Execution timed out after 60,000ms:
   - Successive tool retries and thinking loops triggered cumulative timeout aborts.

## Done

- **Hallucinated UUID Recovery**:
  - `backend/src/modules/ai/tools/clinical/er.tools.ts`: If `effectiveIncidentId` is not found in the DB (or hallucinated), it automatically recovers by binding to the hospital's running active/open incident (`OPEN`, `PLAN_REVIEW`, `ACTIVE`).
- **Flexible Urgent Antidote / Blood Borrow Payload**:
  - `backend/src/modules/ai/tools/clinical/er.tools.ts`: Allowed optional `items`, added `.passthrough()` for emergency borrow attributes (`requiredUnits`, `bloodGroup`, `transfusionProtocol`, etc.).
- **Frontend Active Incident Routing**:
  - `frontend/src/components/ai/DooRareChatDrawer.tsx`: Updated `getRouteContext()` to read `incident` and `incidentId` from query params, and dispatches incident creation events.
- **Guidance & Headroom**:
  - `backend/src/modules/ai/engine/react.engine.ts`: Instructed models to leave `targetId` empty if unknown so the system automatically binds to the hospital's running incident.
- **Verification**:
  - Added unit test in `backend/tests/ai.clinical.test.ts` asserting automatic recovery from hallucinated targetId.
  - All 45 tests in `ai.clinical.test.ts` and 7 tests in `ai.tools.test.ts` pass green.
  - Both `frontend` and `backend` build cleanly (`npm run build`).

## Files Touched

- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/tests/ai.clinical.test.ts`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
