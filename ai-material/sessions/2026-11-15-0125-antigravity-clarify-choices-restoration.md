# AI Session: Clarify Question Clickable Choices Restoration and Auto-Fill Guardrails

## Goal
Diagnose and permanently resolve why clickable choices disappeared from the Copilot clarification cards (`ask_operator`), and ensure options are always generated, schema-normalized, and viewable with selection retention.

## Done
1. **Schema & Argument Lenience (`askOperator.tool.ts`):**
   - Added support for `choices`, `items`, and comma-separated/pipe-delimited string options in `QuestionSchema` and `OptionSchema`.
   - Added parameter aliases (`prompt`, `title`, `text` for `question`, and `title`, `label` for `header`).
   - Implemented `getDefaultClarifyOptions(header, question)` to automatically inject high-fidelity clinical choices (e.g. Paracetamol tablet 500mg, syrup 120mg/5mL, IV injection; lender ranking; urgency levels) whenever a model omits `options`.
2. **ReAct Engine Prompt & Recovery Hardening (`react.engine.ts`):**
   - Updated Rule 9 in system prompt to explicitly enforce `MANDATORY CLICKABLE OPTIONS: For EVERY question in the questions array, you MUST ALWAYS provide 2 to 4 recommended choices in the 'options' field`.
   - Upgraded `isAskOperator` fallback in `react.engine.ts` to iterate across all questions in `toolArgs`, recover options from `options` / `choices` / `items` / strings, and apply `getDefaultClarifyOptions` instead of hardcoding `options: []`.
   - Linked `getDefaultClarifyOptions` into `questionsFromValidation` so argument errors present clinical choices rather than empty inputs.
3. **Frontend Choice Preservation & State Restoring (`ClarifyPanel.tsx` & `DooRareChatDrawer.tsx`):**
   - Added `savedAnswers` to `DisplayChatMessage` in `chatSessionStore.ts` and wired persistence on submit.
   - Initialized `picked` and `custom` state from `savedAnswers` in `ClarifyPanel.tsx` so selected pills remain highlighted (`.selected`) even when navigating historical cards or upon page reload.
   - Added frontend `getDefaultOptions` fallback so questions never display without choices even if backend sends empty options.
   - Hardened `.doorare-clarify-option.selected:disabled` in `chatDrawer.css` to keep full contrast and clarity in view-only state.
4. **Verification & Build:**
   - 12 unit tests pass in `backend/tests/ai.clarify.test.ts` (0 errors).
   - Frontend and backend production builds passed with 0 TypeScript errors.
   - Docker containers `doorare-backend` and `doorare-frontend` rebuilt and restarted cleanly.

## Decisions
- Never let an LLM's schema omission result in an empty choice card: fallback to clinical domain options (dosage, hospital ranking, urgency) automatically when omitted.
- Store user's selected answers in message state to preserve selected pill visual state across chat history and re-renders.

## Files Touched
- `backend/src/modules/ai/tools/askOperator.tool.ts`
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/tests/ai.clarify.test.ts`
- `frontend/src/components/ai/ClarifyPanel.tsx`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/chatDrawer.css`
- `frontend/src/services/chatSessionStore.ts`

## Errors Encountered & Fixed
- Zod stripped `choices` because only `options` was declared in `QuestionSchema`. Added `choices` and `items` unions.
- ReAct engine fallback previously initialized `options: []`, dropping options during tool parsing recovery. Replaced with full recovery walker and `getDefaultClarifyOptions`.
- `ClarifyPanel` had duplicate tail block during replacement; fixed and verified clean build.

## Next Steps
- Verify operator interactions in live browser on `localhost:8080`.
