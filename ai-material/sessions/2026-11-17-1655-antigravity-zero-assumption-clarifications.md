# Session: Zero-Assumption Policy & Mandatory Clarifications Enforcement

- **Date:** 2026-11-17 16:55
- **Author:** Antigravity

## Goal
Enforce Zero-Assumption Policy and mandatory interactive clarification dialogues in the DooRare AI Chatbot / CDSS engine. Specifically, prevent the AI from guessing or assuming mission-critical parameters (such as ETA, casualty triage counts, medication formulations, quantities, or urgency levels) when underspecified prompts are submitted.

## Done
1. **ReAct Engine Zero-Assumption System Instructions (`backend/src/modules/ai/engine/react.engine.ts`):**
   - Added Rule 11 `ZERO-ASSUMPTION POLICY FOR SAFETY-CRITICAL ATTRIBUTES (MANDATORY CLARIFICATION RULES)`.
   - Prohibited inventing or assuming Estimated Time of Arrival (ETA), casualty counts (Red/Yellow/Green), drug formulations, and urgency levels.
   - Clarified what the system computes automatically (Lender Ladder, Kit Recipes, user hospital context) vs. what must be asked from the operator.
   - Expanded field labels (`FIELD_LABELS_TH`, `FIELD_LABELS_EN`) for validation fallback mapping (`reportedEtaMin`, `incidentType`, `counts`, `patientCounts`, `urgency`).
2. **Dynamic Clarification Options (`backend/src/modules/ai/tools/askOperator.tool.ts`):**
   - Implemented rich, clinically realistic choice options in `getDefaultClarifyOptions` for:
     - **Reported ETA / Arrival Window:** EMS ambulance (~15-30 min), inter-hospital referral (~45-60 min), immediate walk-in, and unknown (`ETA_UNAVAILABLE`).
     - **Casualty Triage Counts:** Red 1-2 / Yellow 3-5, Red 3-5 / Yellow 5-10, Red > 5, and minimum default placeholder.
     - **Incident Type & Hazard:** Mass Trauma, Hazardous Chemical/Hazmat, Major Fire/Burn, Acute Toxidrome/Snakebite.
     - **Cold Chain & Temperature:** $2-8^\circ\text{C}$ cold chain vs. room temperature.
3. **Emergency Incident Guardrail (`backend/src/modules/ai/tools/clinical/er.tools.ts`):**
   - Added validation check in `submitErActionProposalTool` (`DECLARE_INCIDENT`): Rejects proposal creation if total casualty count is 0, enforcing an explicit `ask_operator` clarification turn.
4. **Unit Test Coverage (`backend/tests/ai.clinical.test.ts`):**
   - Added tests verifying `getDefaultClarifyOptions` returns options for ETA, triage, incident type, and cold chain.
   - Added test verifying `submitErActionProposalTool` blocks declaring incidents with 0 casualties.
   - Added test verifying `buildSystemPrompt` includes the Zero-Assumption Policy.
5. **Build & Live Container Sync:**
   - Compiled backend TypeScript (`npm --prefix backend run build` - 0 errors).
   - Synced built artifacts to Docker container `doorare-backend` and verified healthy status.

## Decisions
- Automated calculations (such as candidate lender ranking and kit formulas) are executed by backend tools rather than burdening the user with manual questions.
- Unspecified parameters with direct safety/operational consequences (ETA, casualty numbers) must trigger a single-round clarification card (`ask_operator`) with pre-populated clickable pills.

## Files Touched
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/src/modules/ai/tools/askOperator.tool.ts`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/tests/ai.clinical.test.ts`
- `ai-material/sessions/2026-11-17-1655-antigravity-zero-assumption-clarifications.md`

## Errors Encountered
- `ai.clarify.test.ts` asserted empty options array for standalone generic quantity prompt (`assert.deepEqual(..., [])`). Removed quantity auto-fill from `getDefaultClarifyOptions` so quantity retains free-text typing behavior while ETA and clinical choices receive structured pills.

## Next Steps
- Await user approval before committing or pushing changes.
