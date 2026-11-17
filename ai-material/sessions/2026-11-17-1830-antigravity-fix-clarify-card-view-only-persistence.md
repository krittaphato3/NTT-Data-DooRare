# Session: Fix Clarify Card Persistence & Read-Only State Upon Completion

- **Date:** 2026-11-17 18:30
- **Author:** Antigravity

## Goal
Fix clarify question asking card (`ClarifyPanel.tsx`) in the DooRare AI Chat Drawer remaining clickable and sentable after questions have been answered, proposal accepted, and session revisited.

## Done
- Identified root causes:
  1. Stale state closure in `DooRareChatDrawer.tsx`: `onSubmit` queued `setDisplayMessages` to mark `questionsAnswered: true` and `savedAnswers`, then immediately called `handleSend(...)` without passing the updated array. `handleSend` read the old uncommitted state and overwrote the queue, wiping out `questionsAnswered` and `savedAnswers`.
  2. Missing persistence: `onSubmit` did not invoke `persistCurrentSession` immediately, so if reloaded or revisited from history, `questionsAnswered` was undefined.
  3. No historical/reconciliation fallback: `ClarifyPanel` relied strictly on `msg.questionsAnswered === true`, meaning any existing or unhealed session in `localStorage` rendered the interactive question form instead of the read-only summary card.
- Implemented `resolveQuestionState` helper in `DooRareChatDrawer.tsx`:
  - Detects if an assistant question turn has already been answered by checking `msg.questionsAnswered` OR whether subsequent turns/user answers exist in the conversation.
  - Automatically parses and reconstructs `savedAnswers` from the following `ตอบคำถาม: ...` user prompt if unpersisted.
  - Passes `isAnswered: true` and reconstructed `savedAnswers` so `ClarifyPanel` renders the read-only executive summary (`✓ บันทึกแล้ว`).
- Fixed `onSubmit` handler in `DooRareChatDrawer.tsx`:
  - Creates explicit `updatedList` with `questionsAnswered: true` and `savedAnswers`.
  - Persists immediately via `persistCurrentSession(updatedList, proposals)`.
  - Passes `updatedList` as `customBaseMessages` to `handleSend`, ensuring the turn history and background persistence retain the answered status.
- Added session auto-healing in `handleSelectSession`:
  - Automatically backfills `questionsAnswered: true` and `savedAnswers` for legacy sessions when selected from the history sidebar and saves back to `localStorage`.
- Enhanced `ClarifyPanel.tsx`:
  - Added reactive `useEffect` hooks for `isAnswered` and `savedAnswers` prop updates.
  - Improved fuzzy header matching in the executive summary view so question answers match cleanly even with minor casing or punctuation variations.
- Verified build: `npm --prefix frontend run build` passed with 0 errors, and dist files synchronized to `doorare-frontend` container.

## Decisions
- Clarify cards must transition to read-only summary mode as soon as answered or whenever subsequent conversational turns exist.
- Historical sessions must auto-heal dynamically without requiring manual database or storage purges.

## Files Touched
- `frontend/src/components/ai/ClarifyPanel.tsx`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `ai-material/sessions/2026-11-17-1830-antigravity-fix-clarify-card-view-only-persistence.md`

## Errors Encountered
- None.

## Next Steps
- Report findings and fix confirmation to user.
