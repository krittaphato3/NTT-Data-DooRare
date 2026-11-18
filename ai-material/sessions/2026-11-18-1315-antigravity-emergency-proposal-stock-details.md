# Session: 2026-11-18-1315-antigravity-emergency-proposal-stock-details

## Goal
Enhance the Emergency Proposal Card to present itemized emergency kit allocation, stock sourcing, readiness metrics, and proper action microcopy for emergency supply management.

## Done
- Updated `frontend/src/components/ai/ProposalCard.tsx`:
  - Added `KIT_METADATA` and auto-derivation of emergency kit allocation from triage counts when missing in AI summary.
  - Added itemized emergency supply table displaying kit code, Thai name, quantities, critical minimum indicators, and in-stock vs. network borrowing status.
  - Added target preparation deadline (`~{eta} min`) and stock readiness percentage in the 4-box spec grid.
  - Removed generic audit checkmark pills for emergency incidents to reduce visual noise.
  - Updated action button microcopy to "อนุมัติแผนเวชภัณฑ์ฉุกเฉิน (Approve Emergency Supply Plan)".
- Updated `frontend/src/components/ai/chatDrawer.css`:
  - Added styles for `.doorare-supplies-table`, `.doorare-supply-row`, `.source-pill`, and `.doorare-stock-status-pill`.
- Updated `backend/src/modules/ai/tools/clinical/er.tools.ts`:
  - Auto-enriched `DECLARE_INCIDENT` proposals with standard recommended kit items in `args.summary.recommended_kits`.
- Verified production builds:
  - Frontend: `npm run build` (`tsc --noEmit && vite build`) passed with exit code 0.
  - Backend: `npm run build` (`tsc`) passed with exit code 0.

## Decisions
- Kept scope strictly on stock and inventory borrowing; excluded hospital facility/bed tracking and generic audit checkmarks.

## Files Touched
- `frontend/src/components/ai/ProposalCard.tsx`
- `frontend/src/components/ai/chatDrawer.css`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `ai-material/sessions/2026-11-18-1315-antigravity-emergency-proposal-stock-details.md`

## Errors Encountered
- None.

## Next Steps
- Verify visual presentation in live incident intake flow in the UI.
