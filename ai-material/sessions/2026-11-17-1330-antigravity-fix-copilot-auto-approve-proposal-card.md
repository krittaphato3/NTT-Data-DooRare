# Session: Fix Copilot Auto-Approve and Proposal Card Restoration

- Date: 2026-11-17 13:30 (Updated 14:05)
- Author: Antigravity

## Goal
Identify the root cause of Copilot automatically approving proposals and omitting the interactive Human-In-The-Loop (HITL) proposal card, restore the interactive pending approval card, and clean raw HTML tag leakage (`<b>ยืมยา</b>`) from proposal card titles and fields.

## Done
- Root Cause Identified: In commit 86781a8, an "Auto-reconciliation" useEffect was added inside `ProposalCard.tsx` intended to recover approved status for legacy history sessions. However, whenever any new proposal card mounted with `decided === null`, the hook executed `fetch('/api/v1/borrow-requests?role=borrower')`. If any historical or demo borrow request matched the drug name or `drugMasterId`, it immediately executed `setDecided('approved')` and `onActionComplete('approved')`. This instantaneously swapped the interactive pending proposal card (with "Authorize & Approve" and "Decline" buttons) for the decided green banner without human review.
- Removed Rogue Reconciliation Hook: Deleted the auto-reconciliation `useEffect` in `frontend/src/components/ai/ProposalCard.tsx`.
- Synchronized Status Reset: Updated the state synchronization `useEffect` in `ProposalCard.tsx` so unapproved proposals explicitly reset `decided` to `null` (`setDecided(null)`), ensuring freshly streamed proposals stay pending.
- Fixed Raw HTML Tag Leakage (`<b>ยืมยา</b>`):
  - Created `cleanText` helper in `ProposalCard.tsx` to strip raw HTML tags (`<b>`, `</b>`, `<strong>`, `<span>`, etc.) and markdown bold markers from `title`, `drug`, `lender`, `location`, `reason`, and `actionPlan`.
  - Added HTML sanitization in `DooRareChatDrawer.tsx` upon receiving `onProposal`.
  - Added backend sanitization in `react.engine.ts` before emitting `proposal` events, plus system prompt instruction forbidding HTML tags in proposal fields.
- Fixed Unit Duplication (`300 ขวด ชุด`): Parsed composite quantities in `ProposalCard.tsx` (`/^([\d,.]+)\s*([^\d\s].*)$/`) to separate numeric quantities and units cleanly so they do not concatenate default units.
- Build & Live Container Sync: Ran `npm --prefix frontend run build` (0 TS errors) and `npm --prefix backend run build` (0 TS errors), and synchronized compiled assets into running `doorare-frontend` and `doorare-backend` Docker containers.

## Decisions
- A proposal must never auto-approve based on loose drug name or catalog matching against historical database records. Human-In-The-Loop clinical safety requires explicit operator confirmation via the "Authorize & Approve" button.
- Clean text stripping at both frontend presentation and backend emission levels ensures robust defense against model-invented HTML tags.

## Files Touched
- `backend/src/modules/ai/engine/react.engine.ts`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/ProposalCard.tsx`
- `ai-material/sessions/2026-11-17-1330-antigravity-fix-copilot-auto-approve-proposal-card.md`

## Errors Encountered
- None. Both frontend and backend builds passed with 0 errors.

## Next Steps
- Operator tests Copilot in browser to verify proposal cards render interactively with clean typography.
