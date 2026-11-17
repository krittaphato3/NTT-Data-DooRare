# Session: Inter-Hospital Data Governance & Confidentiality Rules Restriction

- Date: 2026-11-17
- Author: Antigravity AI
- Status: Completed

## Goal
Implement strict cross-hospital data governance and confidentiality rules to prevent DooRare AI Copilot from exposing peer hospitals' internal stock counts, warehouse balances, safety stocks, or consumption rates (even between hospitals in the same regional network/branch).

## Done
1. **Defined Inter-Hospital Data Governance & Confidentiality Rules (Layer 1 - System Prompt)**:
   - Added Rule 14 to `buildSystemPrompt` in `backend/src/modules/ai/engine/react.engine.ts`.
   - Explicitly restricted disclosure:
     - **Strictly Forbidden (What MUST NOT be disclosed)**:
       - Exact numerical stock counts, batch quantities, units on hand, or warehouse balance (e.g. `คลังพร้อมใช้: 2,500 เม็ด`, `มีสต็อก 1,807 เม็ด`).
       - Safety stock thresholds ($S$), consumption rates ($u$), lead times, reorder thresholds, or runout days ($R$).
       - Purchase costs, unit prices, or total salvage valuations.
     - **Allowed Disclosure (What CAN be disclosed about candidate lenders)**:
       - Hospital Name and Hospital Code (e.g. `โรงพยาบาลบางพลี (HB)`).
       - Candidate Ranking & Recommendation Priority (e.g. `อันดับ 1 (ความเหมาะสมสูงสุด)`).
       - Estimated Transit / Delivery Duration (e.g. `ระยะเวลาขนส่งประมาณ ~25.4 นาที`).
       - Cold chain transport capability.
       - Qualitative Stock Readiness ONLY (`มีสต็อกพร้อมสนับสนุน` / `มีสต็อกสนับสนุนได้บางส่วน` / `สต็อกไม่เพียงพอ`).
     - **Standardized Presentation Format**: Prescribes exact formatting for lender ladder and locator outputs without quantity numbers.

2. **Tool-Level Privacy Shielding (Layer 2 - Tool Sanitization)**:
   - In `backend/src/modules/ai/tools/clinical/pharmacist.tools.ts` (`getRankedLenderLadderTool`):
     - Retained internal composite scoring ($S_i$) and ranking calculations.
     - Stripped raw `usableStock` from candidate object outputs.
     - Injected qualitative readiness fields: `stockAvailability` (`'SUFFICIENT'` | `'PARTIAL'` | `'INSUFFICIENT'`), `availabilityStatus` (`'มีสต็อกพร้อมสนับสนุน'` | `'มีสต็อกสนับสนุนได้บางส่วน'` | `'สต็อกไม่เพียงพอ'`), and boolean `canFulfill`.
   - In `backend/src/modules/ai/tools/clinical/er.tools.ts` (`getAntidoteLocatorTool`):
     - Stripped raw `availableQuantity` for peer hospitals.
     - Replaced with qualitative `stockAvailability` (`'SUFFICIENT'` | `'PARTIAL'`) and `availabilityStatus` (`'มีสต็อกพร้อมสนับสนุน'` | `'มีสต็อกจำกัด'`).

3. **Automated Verification & Tests**:
   - Updated `backend/tests/ai.clinical.test.ts` to assert that `usableStock` and `availableQuantity` are never exposed in candidate lender or antidote locator responses, while `stockAvailability` and `availabilityStatus` are strictly verified.
   - All 45 tests in `backend/tests/ai.clinical.test.ts` passed (100%).
   - All 4 tests in `backend/tests/ai.controlled-drugs.test.ts` passed.
   - Built backend (`tsc`) with 0 errors.
   - Built frontend (`vite build`) with 0 errors.
   - Synced artifacts to live Docker containers (`doorare-backend` and `doorare-frontend`).

## Decisions
- **Dual-Layer Defense-in-Depth**: Relying solely on prompt instructions can lead to subtle model leaks when raw numbers are visible in tool observations. By removing raw integer quantities from the tool output payload (`Layer 2`), the LLM physically lacks the numbers in its context and cannot disclose them under any circumstance.
- **Preserved Ranking Quality**: The backend algorithm continues to compute ranking using exact stock balances and distances, ensuring the most optimal hospital is recommended first without sacrificing operational efficiency.

## Files Touched
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/src/modules/ai/tools/clinical/pharmacist.tools.ts`
- `backend/src/modules/ai/tools/clinical/er.tools.ts`
- `backend/tests/ai.clinical.test.ts`
- `ai-material/sessions/2026-11-17-1430-antigravity-inter-hospital-data-governance-rules.md`

## Errors Encountered
- None.

## Next Steps
- Await user feedback or additional scenario testing in the Copilot UI.
