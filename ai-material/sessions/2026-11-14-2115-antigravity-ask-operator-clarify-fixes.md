# Session Note: ask_operator Tooling, Language Adaptation, and Clarify Card Fixes

- Date: 2026-11-14 21:15:00 +07:00
- Goal: Fix `ask_operator` display (hide from tool calling cards, show only clarify card), enforce question language matching prompt language, and resolve schema validation error that replaced the model's question with internal Zod error paths.
- Done:
  1. Hid `ask_operator` from tool calling list in `DooRareChatDrawer.tsx` (`onToolStart`, `onToolEnd`, and JSX render filter) and suppressed `tool_start` / `tool_end` in `react.engine.ts`.
  2. Enforced question language matching prompt language:
     - Updated `buildSystemPrompt` with explicit language alignment instruction for `ask_operator`.
     - Updated `askOperatorTool` description and schema.
     - Updated `questionsFromValidation` with Thai/English label dictionaries and language detection.
     - Updated `ClarifyPanel.tsx` with dynamic Thai/English labels and placeholders.
  3. Fixed question schema rejection:
     - `askOperatorTool.parameters` now supports string options (`string[]`), object options (`{label, description}[]`), flexible headers, and single question root objects.
     - `react.engine.ts` prevents `questionsFromValidation` from running on `ask_operator` and extracts question fallback from `toolArgs`.
     - Verified with 2 new unit tests in `backend/tests/ai.clarify.test.ts`. All 29 unit tests passing.
- Decisions:
  - Do not treat `ask_operator` as a technical background tool; render it exclusively via `ClarifyPanel`.
  - Coerce string choices into `{ label: str }` automatically to match standard LLM output conventions.
- Files Touched:
  - `backend/src/modules/ai/tools/askOperator.tool.ts`
  - `backend/src/modules/ai/engine/react.engine.ts`
  - `backend/tests/ai.clarify.test.ts`
  - `frontend/src/components/ai/ClarifyPanel.tsx`
  - `frontend/src/components/ai/DooRareChatDrawer.tsx`
- Errors Encountered:
  - LLMs emitting `options: string[]` triggered Zod validation errors on `ask_operator`, causing `questionsFromValidation` to generate `questions.0.options.0` technical questions. Resolved by adding union and preprocessing in Zod.
- Next Steps:
  - Test live chat in browser at `http://localhost:8080` with prompt "ขอยืมยาพารา 200 ชุด".
