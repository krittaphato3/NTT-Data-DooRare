# Session: ER Clinical Stock Plan & Universal Task Editing

## Goal
Enrich ER Role Copilot emergency intake with grounded clinical stock/kit planning and triage clarifying questions without over-assuming, enable task editing (borrow requests & incidents) across all agents, upgrade proposal cards with dedicated emergency UI and full end-to-end plan generation, and resolve kit code name aliases (e.g., Trauma Resus).

## Done
- **ER Clinical Stock Planning & Grounded Questioning (`react.engine.ts`)**:
  - ReAct engine directs ER_STAFF to calculate recipe-based kit requirements (`get_incident_kit_recommendations`) and check antidote/blood availability (`get_antidote_locator`) when casualties or toxins are reported.
  - Added anti-over-assumption guardrail: if emergency details are vague, Copilot prompts the operator via `ask_operator` with clickable options for mechanism, casualty estimate (Red/Yellow/Green), and dispatch mode.
- **Universal Task Editing (`borrow.service.ts`, `borrow.routes.ts`, `pharmacist.tools.ts`, `er.tools.ts`)**:
  - Added `PATCH /api/v1/borrow-requests/:id` and `UPDATE_BORROW_REQUEST` proposal action allowing pharmacists to edit quantity, urgency, and reason on pending requests.
  - Added `UPDATE_INCIDENT` proposal action allowing ER staff to update casualty counts, severity, location, or notes on active incidents.
  - Instructed ReAct agents to update existing tasks instead of creating duplicate records when asked to edit.
- **Rich Emergency Proposal Cards & End-to-End Incident Plan Automation (`DooRareChatDrawer.tsx`, `chatDrawer.css`, `LiveConsole.tsx`, `incidents.service.ts`, `incidents.shared.ts`, `er.tools.ts`)**:
  - Rendered dedicated emergency cards featuring colored Triage Casualty Counter (🔴/🟡/🟢/⚫), incident metadata grid, itemized emergency stock and kit supply plan, and action plan box.
  - Fixed casualty counts dropping to 0: Created `extractIncidentDetails` in `er.tools.ts` with multi-source extraction (nested/flat properties, summary, and Thai/English clinical text regex), case-insensitive parsing in `incidents.shared.ts`, and fallback safeguards in `DooRareChatDrawer.tsx`.
  - Fixed missing emergency plan and medicines on incident creation: `incidents.service.ts` now automatically invokes `createRevision` upon incident creation whenever patient counts or edits are present, immediately transitioning the incident to `PLAN_REVIEW` with calculated kits, recipes, and medications.
  - Automatically triggered `/api/v1/incidents/:id/plan` and `/api/v1/incidents/:id/plan/agent` upon approval in `DooRareChatDrawer.tsx`.
  - Fixed `INC-2026-0072` in database with 3 Red casualties, 50-minute ETA, and active calculated plan with trauma kits, burn kits, and supportive medications.
  - Wired direct navigation button to open the exact incident in Incident Console (`LiveConsole.tsx` synchronizes with URL query param `?id=` and `?incident=`).
- **Kit Code Normalization (`plan.service.ts`, `er.tools.ts`, `DooRareChatDrawer.tsx`)**:
  - Fixed `ไม่พบชุดยา ชุดช่วยชีวิตผู้บาดเจ็บ (Trauma Resus)`: Built `resolveKitCode` to normalize Thai names, English names, UUIDs, and mixed label strings (e.g. `"ชุดช่วยชีวิตผู้บาดเจ็บ (Trauma Resus)"` -> `"TRAUMA_RESUS"`).
  - Integrated `resolveKitCode` in `parseEdits` and `generate` in `plan.service.ts`, `extractIncidentDetails` in `er.tools.ts`, and `handleApprove` in `DooRareChatDrawer.tsx`.
  - Added UUID guardrail for `setExtras` so non-UUID labels do not trigger database validation errors.

## Decisions
- Formula-driven kit calculation preferred over free-form hallucination: ensures clinical quantities match institutional triage guidelines.
- In-place task editing updates existing rows and recalculates ladders/plans rather than creating duplicate records.
- Automatic plan calculation upon incident creation: an incident with declared casualties should never be left stranded with "no plan" (`ยังไม่มีแผน`).
- Kit code normalization allows human-readable labels from AI proposals to cleanly map to database schema codes (`TRAUMA_RESUS`, `INTUBATION`, `IV_SET`, `BURN`, `CHEST_TUBE`, `SPLINT`, `MINOR_WOUND`).

## Files Touched
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/src/modules/ai/tools/clinical/pharmacist.tools.ts`
- `backend/src/modules/borrow/borrow.routes.ts`
- `backend/src/modules/borrow/borrow.service.ts`
- `backend/src/modules/incidents/incidents.service.ts`
- `backend/src/modules/incidents/incidents.shared.ts`
- `backend/src/modules/incidents/plan.service.ts`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/answerChips.ts`
- `frontend/src/components/ai/chatDrawer.css`
- `frontend/src/roles/er/data/navigation.ts`
- `frontend/src/roles/er/live/IncidentPicker.tsx`
- `frontend/src/roles/er/live/LiveConsole.tsx`
- `frontend/src/roles/er/live/LiveIncidentFlow.tsx`
- `frontend/src/roles/er/live/LiveIncidentList.tsx`

- Single smart button navigation: Unified dual button actions across LiveDashboard and ProposalCard. Unfinalized incidents show a single blue button `ทำต่อ →` leading directly to the preparation flow. Once finalized / sent, shows a single button leading directly to that exact incident page.
- Extracted `ProposalCard.tsx`: Moved `ProposalCard` from `DooRareChatDrawer.tsx` into standalone modular component `frontend/src/components/ai/ProposalCard.tsx` with clean typing and kit resolver.
- BYOK AES-256-GCM Encryption-at-Rest: Implemented `backend/src/modules/ai/byok/byok.crypto.ts` with authenticated encryption, key derivation, and backward-compatible transparent decryption in `byok.service.ts`.
- Tool Staging Safety Pin: Configured explicit `ROLE_PROPOSAL_TOOL` mapping in `backend/src/modules/ai/tools/selector.ts` guaranteeing primary proposal tools and `ask_operator` are never staged away across all 10 roles.
- AWS Bedrock Converse API with SigV4: Replaced Bedrock stub with authentic AWS SigV4 signer and Bedrock Runtime Converse API in `backend/src/modules/ai/providers/bedrock.provider.ts`.
- Comprehensive Unit Tests: Added test suites in `tests/ai.byok.crypto.test.ts`, `tests/bedrock.provider.test.ts`, and `tests/selector.test.ts` (37/37 passed).

## Errors Encountered
- `ไม่พบชุดยา ชุดช่วยชีวิตผู้บาดเจ็บ (Trauma Resus)`: Proposal card passed Thai string instead of database enum code `TRAUMA_RESUS`. Resolved via `resolveKitCode` in both frontend and backend.
- "Open incident" routing to all incidents page: Proposal card navigated to `?page=incident&id=...` without role context. In ER mode (`role=er`), `page=incident` was not a valid page in `ER_ITEMS`, falling back to `dashboard` (all incidents). Fixed by preserving role, routing to `?page=incidents&incident=${incId}&role=er`, listening to `doorare:open-incident` in `LiveIncidentList`, and adding a direct Flow action button.

## Next Steps
- Verify in browser and check user experience.
