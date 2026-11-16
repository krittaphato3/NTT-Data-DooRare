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
- Added hover chat message action bar and cascade delete (`DooRareChatDrawer.tsx`, `chatDrawer.css`):
  - **User Messages:** On hover, displays (1) คัดลอก (Copy), (2) แก้ไข (Edit), (3) ลบ (Delete).
    - Edit mode renders an inline auto-focused textarea with Enter to submit and Escape to cancel.
    - Saving an edit cascades: deletes all messages below the edited prompt, saves session, and triggers a fresh streaming AI response with updated context.
    - Deleting a user prompt cascades: deletes that prompt and the entire conversation thread under it.
  - **Assistant Messages:** On hover, displays (1) ลองใหม่ (Retry), (2) คัดลอก (Copy).
    - Retry truncates subsequent turns and re-executes generation based on the preceding user prompt.
  - Styled with clean SVG icons, tooltip titles, and instant copy feedback state ("✓ คัดลอกแล้ว").
- Added borrow request lender proposal flow integrations (`BorrowDrawer.tsx`, `BorrowRequestsPage.tsx`, `DooRareChatDrawer.tsx`):
  - Added primary button "คำนวณและเสนอแผนผู้ให้ยืม" in `BorrowDrawer.tsx` when request is in `DRAFT` status, allowing one-click calculation of the Lender Ladder (`POST /borrow-requests/:id/propose`).
  - Added backend auto-propose in `borrowService.create`: newly created borrow requests automatically run `propose` immediately, transitioning directly to `PENDING_APPROVAL` with a ranked Lender Ladder without remaining in `DRAFT`.
  - Added `Idempotency-Key` header to frontend propose calls in `DooRareChatDrawer.tsx`.
- Resolved `NO_LENDABLE_STOCK` and `TRANSIT_TOO_LONG` calculation bottlenecks (`borrow.ladder.ts`):
  - Set realistic minimum transit window to 180 minutes so near hospitals are not disqualified when requester stock is critically depleted.
  - Implemented clinical emergency sharing: when strict surplus beyond monthly target is zero, hospitals with stock on hand can share excess above 1 day of their own daily usage.
  - Enabled multi-lender parallel distribution when a single top hospital cannot fulfill the entire requested quantity.
  - Seeded realistic Paracetamol 500 mg inventory across peer hospitals (HB, HC, HE).
- Minimized AI Copilot Drawer UX/UI layout optimization (`DooRareChatDrawer.tsx`, `chatDrawer.css`):
  - Fixed proposal card header word-wrapping: replaced rigid 2-column horizontal header flex (`doorare-proposal-header-formal`) with a stacked structure. Row 1 features a compact document meta tag (`[Icon] ใบเสนอคำขอยืมยาทางการแพทย์`) on the left and status chip (`รออนุมัติ (Pending)`) on the right. Row 2 displays `proposal.title` at full 100% width, eliminating single-word wrapping and badge clipping.
  - Eliminated native grey horizontal scrollbar: added `overflow-x: hidden;` and `box-sizing: border-box;` to `.doorare-chat-messages`, and added `box-sizing: border-box; max-width: 100%; overflow: hidden;` to `.doorare-chat-proposal-card.formal`.
  - Expanded default popup window size from `380px x 580px` to `440px x 640px` (`max-width: calc(100vw - 32px); max-height: calc(100vh - 40px)`), giving 60px extra width for clinical spec grids and action buttons.
  - Refined compact typography, spacing, and audit strip to fit seamlessly without cramped margins.
- Added direct "Open Proposal in System" action button on approved proposal card (`DooRareChatDrawer.tsx`, `chatDrawer.css`, `BorrowRequestsPage.tsx`, `useBorrowRequests.ts`, `chatSessionStore.ts`):
  - Added button `เปิดดูคำขอยืมนี้ในหน้ารายการ (BR-XXXX)` inside `.doorare-decided-actions-row` directly below the summary chips in `.doorare-chat-proposal-card.formal.decided-approved`.
  - Persisted created `requestNo` and `id` in `DisplayChatMessage` and session store so the button remains interactive across sessions and reloads.
  - Clicking the button minimizes/closes the Copilot drawer, updates the browser URL to `?page=requests&request=<requestNo>`, and dispatches `doorare:open-borrow-request`.
  - In `BorrowRequestsPage.tsx`, added event listener and enhanced `linkedRequest` matcher to check both `r.id` and `r.uuid`. If already on the page, it immediately reloads the live list and opens the right detail drawer (`BorrowDrawer`) for that exact request without needing a full-page refresh. If on another page, it navigates directly to `?page=requests&request=<requestNo>` and opens the drawer upon loading.
- Fixed proposal state persistence and history session reconciliation (`DooRareChatDrawer.tsx`):
  - Solved root cause where reopening chat from history reverted approved cards to pending: `onActionComplete` was only updating React state without invoking `persistCurrentSession`, meaning decisions were lost on reload or session switch.
  - Added immediate `persistCurrentSession` call upon action approval/rejection, permanently persisting `proposalStatus`, `proposalTargetId`, `proposalRequestNo`, and `proposal.status = 'APPROVED'` to `localStorage`.
  - Added reactive `useEffect` hooks in `ProposalCard` to synchronize state when switching sessions.
  - Implemented auto-reconciliation: when opening legacy history sessions where `proposalStatus` was unrecorded, `ProposalCard` automatically queries `/api/v1/borrow-requests?role=borrower` to verify if the request was already created in the backend. If matched, it restores the approved green banner with direct link button and backfills storage automatically.
- Removed specialist context badge from AI Copilot drawer header (`DooRareChatDrawer.tsx`, `chatDrawer.css`):
  - Removed `.doorare-chat-context-badge` (`ระบบสนับสนุนการประสานยืม-คืนยาเครือข่าย`) and its calculation hook `specialistContextTitle`.
  - Streamlined the drawer header to display clean branding ("DooRare Copilot" and bot icon) without visual clutter.
- Cleaned typography and removed decorative emojis per AGENTS.md rules.
- Refined Fullscreen Expand/Collapse Animation (`chatDrawer.css`, `DooRareChatDrawer.tsx`):
  - Fixed root cause of top-left unfolding: previously `.doorare-chat-drawer.fullscreen` declared `top: 0 !important; left: 0 !important;`, which caused the browser to instantly snap the element's positioning anchor from bottom-right to top-left (0,0) before running transitions on width/height.
  - Re-anchored both mini-card and fullscreen states consistently to `bottom` and `right` (`bottom: 0 !important; right: 0 !important; top: auto !important; left: auto !important;`). Now the drawer expands seamlessly outwards from the bottom-right floating card position to cover the full viewport, and contracts back directly into the floating card.
  - Upgraded transition curves to Apple/macOS-style swift-out cubic bezier (`cubic-bezier(0.16, 1, 0.3, 1)`) over 0.38s, with `transform-origin: bottom right;` and `will-change: width, height, bottom, right;`.
  - Added smooth slide-in entry animation (`doorareRailSlideIn`) for the leftmost mini-rail and session sidebar upon expanding.
  - Added smooth fade-in animation (`doorareOverlayFadeIn`) for the backdrop overlay.
  - Added fluid width/padding transitions on `.doorare-chat-messages` and `.doorare-chat-input-area` when widening to 860px centered layout.
  - In Fullscreen mode: removed the separate minimize button. Only the `✕` button is shown, which acts as minimize to restore back into the floating card version (`setIsFullScreen(false)`). In Mini Card mode, only `[⤢]` and `✕` are shown.
- Built both frontend and backend (`npm run build` - 0 errors) and synchronized to live Docker containers (`doorare-frontend`, `doorare-backend`).

## Decisions
- Unified single-card design chosen over multi-step carousel: operators in clinical workflows need scannable, low-friction forms without horizontal scrolling or paging through 3 separate screens.
- All-in-one 1-click submit provided so users can immediately confirm recommended defaults.
- Internal feature codes replaced with descriptive Thai operational terminology.
- Drawer header and proposal card converted to stacked hierarchy so clinical titles have 100% width without clashing with status chips.
- Seamless bridge between AI Copilot and UI-05: clicking the approved proposal button closes Copilot and opens the request detail drawer (`BorrowDrawer`) so the pharmacist has immediate access to full clinical details and audit actions.

## Files Touched
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/src/modules/borrow/borrow.ladder.ts`
- `backend/src/modules/borrow/borrow.service.ts`
- `frontend/src/components/ai/ClarifyPanel.tsx`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/ToolExecutionLogCard.tsx`
- `frontend/src/components/ai/chatDrawer.css`
- `frontend/src/roles/pharmacist/components/BorrowDrawer.tsx`
- `frontend/src/roles/pharmacist/data/useBorrowRequests.ts`
- `frontend/src/roles/pharmacist/pages/BorrowRequestsPage.tsx`
- `frontend/src/services/chatSessionStore.ts`
- `ai-material/sessions/2026-11-15-1530-antigravity-clarify-single-card-and-cdss-refinement.md`

## Errors Encountered
- Windows native horizontal scrollbar caused by `overflow-x: auto` on `.doorare-clarify-stepper` when tab labels exceeded container width. Resolved by eliminating the stepper carousel and using a vertical unified card.
- Emoji `⚡` flagged in code scan. Replaced with clean text.
- Minimized popup header cramped: 380px width left only ~58px for proposal titles when paired horizontally with status badges. Resolved by stacked layout and resizing popup to 440px.

## Next Steps
- Present changes to user.
- Await user approval before `git commit` and `git push` to `origin/backend-byok`.
