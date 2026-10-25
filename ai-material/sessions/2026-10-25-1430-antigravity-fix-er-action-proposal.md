# Session: Fix `submit_er_action_proposal` Tool Argument Parsing and Execution Timeout

- Date: 2026-10-25
- Goal: Pull latest changes from `backend-byok` and fix `submit_er_action_proposal` tool errors ("Invalid tool arguments: summary expected record, received string" and execution timeout).

## Done

- Pulled latest changes from `origin/backend-byok`.
- Analyzed screenshot and logs showing two failures on `submit_er_action_proposal`:
  1. Zod schema validation error: `summary` expected record/object, but LLM passed a string: `"Casualties: 3; Blood Type: A Negative; Action: Urgent borrow request; Critical: Yes"`.
  2. `zodToJsonSchema` previously converted `z.record()` and `z.preprocess()` to `"type": "string"`, causing LLM tool call schemas to instruct models that `summary` and `payload` were string types rather than objects.
  3. LLM argument stringification: LLM providers passing stringified JSON strings in arguments were rejected when a record was expected.
  4. Execution timeout (30000ms): ReAct loop timed out after repeated failed tool invocations and retry loops.
- Fixed `zodToJsonSchema` in `backend/src/modules/ai/tools/registry.ts`:
  - Properly unwrap `z.ZodRecord`, `z.ZodPreprocess`, and pipeline inner schemas.
  - Correctly map `z.ZodRecord` to `"type": "object"`.
- Enhanced `ToolRegistry.executeTool`:
  - Added recursive stringified JSON parsing for incoming tool arguments.
- Enhanced `submitErActionProposalTool` in `backend/src/modules/ai/tools/clinical/er.tools.ts`:
  - Wrapped `summary` and `payload` in `z.preprocess` to accept both key-value string narratives and JSON objects seamlessly.
  - Added automatic payload normalization for `DECLARE_INCIDENT` (populating default title, description, and patientCounts).
  - Normalizing `REQUEST_URGENT_ANTIDOTE` reason and incident linkage.
- Enhanced `ReActEngine` in `backend/src/modules/ai/engine/react.engine.ts`:
  - Configured configurable timeout `AI_AGENT_TIMEOUT_MS` (default 60,000ms).
  - Added explicit system prompt instructions guiding `ER_STAFF` to use `DECLARE_INCIDENT` for emergency trauma casualties.
- Verified test coverage with TDD (red/green) in `tests/ai.tools.test.ts` and `tests/ai.clinical.test.ts` (all 51 tests pass).

## Files Touched

- `backend/src/modules/ai/tools/registry.ts`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/tests/ai.tools.test.ts`
- `backend/tests/ai.clinical.test.ts`
