# Session: 2026-11-15 15:30 Clarify Single-Card Layout & CDSS Clinical Formality Refinement

- **Date:** 2026-11-15 15:30
- **Author:** Antigravity

## Goal
1. Eliminate horizontal scrollbars and multi-step pagination friction from the Clarify Panel (`ClarifyPanel.tsx`) in the DooRare AI Chat Drawer.
2. Refine DooRare AI system instructions and UI presentation to a formal clinical CDSS standard, removing internal engineering badges (`F1`, `F2`, `F3`, `Engine`) and mandating SBAR structure for clinical summaries.

## Done
- Redesigned `ClarifyPanel.tsx` into a unified, all-in-one vertical card:
  - Eliminated `.doorare-clarify-stepper` and horizontal scrollbar (`overflow-x: auto`).
  - Added numbered question badges (`[1]`, `[2]`, `[3]`), clear question labels, and selectable pill options.
  - Retained single primary action button: `ส่งข้อมูลให้ Copilot ดำเนินการต่อ →` (removed experimental autofill button per user request).
  - Replaced stepped tab view with an executive summary in completed/view-only mode.
- Formalized clinical AI persona in `backend/src/modules/ai/engine/react.engine.ts`:
  - Upgraded role from chatbot assistant to CDSS (Clinical & Logistics Decision Support System for Health Region 6).
  - Prohibited casual filler, conversational pleasantries, and internal feature codes (`F1`, `F2`, `F3`, `Engine`).
  - Mandated SBAR framework (สถานการณ์, ภูมิหลัง, การประเมิน, ข้อเสนอแนะ) for clinical shortage and emergency recommendations.
- Updated `DooRareChatDrawer.tsx`:
  - Added dynamic clinical specialist subtitle in header based on current route/page (e.g. `ระบบสนับสนุนเวชภัณฑ์และแผนฉุกเฉินระดับเขต`, `ระบบสนับสนุนการจัดสรรยาคลังกลางระดับเขต`, `ระบบสนับสนุนการประสานยืม-คืนยาเครือข่าย`).
  - Formalized footer disclaimer to clinical regulatory standard.
- Removed `Mock Demo` navigation button from TopBar (`TopBar.tsx`); page is now only accessible via explicit URL (`/mock-demo`).
- Fixed MockDemoPage scroll position on load (`MockDemoPage.tsx`): added `window.scrollTo(0, 0)` and replaced terminal `scrollIntoView` with internal container `scrollTop = scrollHeight`, ensuring the browser window opens at the top instead of scrolling to the bottom.
  1. Engine Pre-Grounding (`react.engine.ts`): Automatically intercepts drug mentions in the user prompt, queries `drug_master` in PostgreSQL, and injects exact registered formulations into context with instructions never to invent other formulations.
  2. Prompt Mandatory Grounding Rule (`react.engine.ts`): Enforces executing `get_stock_and_alerts` in the initial turn before calling `ask_operator`. If only 1 formulation exists, the AI selects it automatically without asking. If multiple exist, options are strictly constrained to database results.
  3. Dynamic Tool Interceptor (`askOperator.tool.ts`): Checks `drug_master` when drug formulation questions are submitted, replacing any model-invented options (such as non-existent drops or IV) with actual database records.
- Enhanced `getStockAndAlertsTool` (`pharmacist.tools.ts`): Returns `catalogMatches` and `distinctFormulations` when querying by keyword, and defaults `status` to `'ALL'` when a drug search is performed.
  - Covered all 50+ registered tools across clinical, emergency, warehouse, driver, procurement, governance, admin, and web domains.
  - Replaced programmer snake_case function names (e.g. `get_stock_and_alerts`, `get_ranked_lender_ladder`) with intuitive bilingual purpose labels (e.g. `ตรวจสอบสต็อกและการแจ้งเตือน (Check Stocks & Alerts)`, `จัดลำดับโรงพยาบาลที่สามารถยืมยาได้ (Rank Lender Hospitals)`).
  - Added smart fallback formatter (`formatToolPurpose`) to convert any dynamic/unmapped snake_case tool name to natural Title Case words.
  - Translated argument preview keys (`PARAM_LABELS_TH`) so `drugCode`, `quantityNeeded`, `urgency` appear as `รหัสยา`, `จำนวนที่ต้องการ`, `ความเร่งด่วน`.
  - Updated active running status in `DooRareChatDrawer.tsx` to display `กำลังดำเนินการ: ${formatToolPurpose(tool.name)}...` instead of raw tool name.
- Cleaned typography and removed decorative emojis per AGENTS.md rules.
- Built both frontend and backend (`npm run build` - 0 errors) and synchronized to live Docker containers (`doorare-frontend`, `doorare-backend`).

## Decisions
- Unified single-card design chosen over multi-step carousel: operators in clinical workflows need scannable, low-friction forms without horizontal scrolling or paging through 3 separate screens.
- All-in-one 1-click submit provided so users can immediately confirm recommended defaults.
- Internal feature codes replaced with descriptive Thai operational terminology.

## Files Touched
- `backend/src/modules/ai/engine/react.engine.ts`
- `frontend/src/components/ai/ClarifyPanel.tsx`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/ToolExecutionLogCard.tsx`
- `frontend/src/components/ai/chatDrawer.css`
- `ai-material/sessions/2026-11-15-1530-antigravity-clarify-single-card-and-cdss-refinement.md`

## Errors Encountered
- Windows native horizontal scrollbar caused by `overflow-x: auto` on `.doorare-clarify-stepper` when tab labels exceeded container width. Resolved by eliminating the stepper carousel and using a vertical unified card.
- Emoji `⚡` flagged in code scan. Replaced with clean text.

## Next Steps
- Present changes to user.
- Await user approval before `git commit` and `git push` to `origin/backend-byok`.
