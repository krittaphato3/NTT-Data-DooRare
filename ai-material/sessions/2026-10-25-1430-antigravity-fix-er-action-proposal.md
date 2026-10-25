# Session: Fix `submit_er_action_proposal` TargetId UUID and IncidentType Validation

- Date: 2026-10-25
- Goal: Fix `targetId: ""` UUID validation error, `POST /api/v1/incidents` `ต้องระบุ incidentType` rejection, and premature iteration exhaustion.

## Root Causes Identified from User Screenshot

1. `targetId: ""` passed by LLM:
   - When models don't have an incident ID, they pass `"targetId": ""` instead of omitting it.
   - `z.string().uuid()` throws `Invalid UUID` on empty strings.
2. `ดำเนินการไม่สำเร็จ: ต้องระบุ incidentType` upon approving proposal card:
   - `ER_PROPOSAL_WHITELIST.DECLARE_INCIDENT` used `eventType` and `patientCounts`.
   - `POST /api/v1/incidents` strictly requires `body.incidentType` and `body.counts`.
   - When the user clicked "Approve" (อนุมัติ) on the card, the frontend called `POST /api/v1/incidents` with the proposal's payload, which was missing `incidentType`, failing with `400 Bad Request: "ต้องระบุ incidentType"`.
3. `ReAct loop reached the maximum allowed tool iterations (5)`:
   - Model attempted to propose an emergency borrow request immediately after proposing incident declaration, without waiting for the incident to be created/approved.
   - Default iteration ceiling of 5 was exhausted due to the initial invalid UUID retry and follow-up tools.

## Done

- **Cleaned Empty String IDs**:
  - `backend/src/modules/ai/tools/registry.ts`: `ToolRegistry.executeTool` removes empty string values for optional ID fields (`targetId`, `taskId`, `*Id`).
  - `backend/src/modules/ai/tools/clinical/er.tools.ts`: Preprocessed `targetId` to treat empty strings as `undefined`.
- **Aligned Incident Declaration Payload (`DECLARE_INCIDENT`)**:
  - `backend/src/modules/ai/tools/clinical/er.tools.ts`: Aligned `actionApi.payload` to produce canonical fields (`incidentType`, `description`, `locationText`, `counts`, `acknowledgeDuplicate: true`) alongside aliases (`eventType`, `title`, `patientCounts`).
  - `backend/src/modules/incidents/incidents.service.ts`: Updated `create` to accept `body.incidentType ?? body.eventType` and `body.counts ?? body.patientCounts` gracefully.
- **Engine Guidelines & Headroom**:
  - `backend/src/modules/ai/engine/react.engine.ts`: Increased `defaultMaxIterations` to 8 and updated prompt guidance instructing models that proposal tools are Terminal Tools and follow-up borrow requests must wait for incident creation.
- **Verification**:
  - All 51 tests across `ai.tools.test.ts` and `ai.clinical.test.ts` pass green.
  - Verified integration with `incidentsService.create`.

## Files Touched

- `backend/src/modules/ai/tools/registry.ts`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/src/modules/incidents/incidents.service.ts`
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/tests/ai.clinical.test.ts`
