# AI Session: WebFetch Pre-fetch Script, Single-Round Clarification Wizard, Optional Web Search & File Attachment

**Date:** 2026-11-14 21:45 (UTC+7)
**Branch:** backend-byok
**Author:** Antigravity

## Goal
1. Fix Google AI Studio / Gemini `Function call is missing a thought_signature in functionCall parts` error during multi-turn ReAct loops.
2. Implement script-based web fetching (`web_fetch`) so models without native web search tools can read and summarize web pages when URLs are provided.
3. Solve vague-prompt sequential interrogation: prompt models to collect all necessary clarifications in a single round, rendered as a wizard-stepped card with navigation (`Next Question →`, stepper tabs, `Submit All`).
4. Add an optional Web Search toggle button (`🌐 ค้นหาเว็บ: เปิด/ปิด`, default OFF) in the chat input toolbar.
5. Add a file attachment button (`📎 แนบไฟล์`) allowing operators to attach CSV, TXT, JSON, Excel, or Markdown files as reference data for stocks, drug inventories, or clinical queries.

## Done
- **Google `thought_signature` Protocol Preservation:**
  - Extended `ToolCall` in `backend/src/modules/ai/providers/types.ts` with `extra_content?: Record<string, unknown>`.
  - Preserved `extra_content` across incoming and outgoing tool calls in `backend/src/modules/ai/providers/custom.provider.ts`.
  - Updated SSE streaming parser in `backend/src/modules/ai/providers/streaming.ts` to map and retain `extra_content` chunks.
- **Automated URL Pre-fetch Script:**
  - In `backend/src/modules/ai/engine/react.engine.ts`, added regex URL extraction on incoming user prompt before the ReAct loop starts.
  - Automatically fetches public HTTP/HTTPS URLs via `web_fetch` and injects page content into the system reference context so any model has immediate access without relying on model-initiated tool calls.
- **Single-Round Multi-Question Clarification Stepper & Sequential Navigation:**
  - Added strict multi-question instructions in `react.engine.ts` system prompt prohibiting 1-by-1 interrogations and enforcing asking all questions simultaneously.
  - Updated `backend/src/modules/ai/tools/askOperator.tool.ts` to reflect the multi-question schema.
  - Redesigned `frontend/src/components/ai/ClarifyPanel.tsx` into a stepped wizard card with step indicators ("ข้อที่ X จาก Y"), tab bubbles with completion checkmarks, "← ย้อนกลับ", "ข้อถัดไป →", and "ส่งคำตอบทั้งหมด".
  - Refined button progression rules:
    - On steps before the last question, "ส่งคำตอบทั้งหมด" is strictly hidden; only "ข้อถัดไป →" is shown.
    - "ข้อถัดไป →" is disabled until the operator either selects an option or types at least 1 character in the custom input.
    - On the final question, "ข้อถัดไป →" is replaced by "ส่งคำตอบทั้งหมด", which is disabled until answered.
    - Added a "ข้าม (ไม่ระบุ)" (Skip) button on all questions for when the operator is unsure: advances to the next question or submits all answers on the last question with "ไม่ระบุ".
    - Updated stepper tab badges: green `✓` when answered, neutral `–` when skipped, and index number when untouched.
  - Post-submission read-only state:
    - Once submitted, the card remains visible in read-only mode with a green "✓ ส่งคำตอบแล้ว" banner.
    - All option buttons and custom inputs are disabled, and all sending/skipping buttons are removed.
  - Option auto-progression (QOL improvement):
    - When selecting a single-select option on any non-terminal question, the wizard automatically advances to the next question after a 180ms visual confirmation delay.
  - In-turn HITL proposal persistence (preventing bottom push-down):
    - Re-architected proposal state to bind directly to the assistant message (`DisplayChatMessage.proposal` and `proposalStatus`) where it was generated.
    - Rendered `ProposalCard` inline inside the message bubble rather than in a detached list below all chat history.
    - When the operator accepts/approves, the decision status (`อนุมัติข้อเสนอเรียบร้อย`) stays pinned at that specific historical turn.
    - Subsequent user prompts appear chronologically below it without pushing the proposal card down.
- **Drug Master ID Healing & Borrow Request Approval Fix:**
  - `backend/src/modules/ai/tools/clinical/pharmacist.tools.ts`:
    - Updated `getStockAndAlertsTool` to project `hd.drug_master_id AS "drugMasterId"` so Copilot receives canonical drug UUIDs directly.
    - In `submitPharmacistProposalTool` (`CREATE_BORROW_REQUEST`), implemented auto-healing for hallucinated or `hospital_drug_id` UUIDs into the hospital's verified mapped `drug_master_id` via DB lookup and semantic name search.
  - `backend/src/modules/borrow/borrow.inputs.ts`: Updated `loadDrugFacts` with fallback resolution to resolve `hospital_drug.id` into `drug_master`.
  - `backend/src/modules/borrow/borrow.service.ts`: Updated `create()` to heal and validate `drugMasterId` against `drug_master` and `hospital_drug` mapping, eliminating 404 "ไม่พบรายการยา" errors when approving HITL proposals.
- **Optional Web Search & File Attachments:**
  - Added `webSearchEnabled` toggle button in `frontend/src/components/ai/DooRareChatDrawer.tsx` (default OFF).
  - Added file attachment input and pill preview in `DooRareChatDrawer.tsx` supporting `.csv, .xlsx, .xls, .txt, .json, .md, .pdf, .png, .jpg` up to 2MB (text extracted and injected into the prompt).
  - Updated backend route context in `frontend/src/services/aiChatApi.ts` and `backend/src/modules/ai/chat/chat.routes.ts` to filter web tools when search is toggled off.

- **Dynamic Thinking Capability & Thinking Box Auto-Toggle:**
  - `backend/src/modules/ai/engine/react.engine.ts`:
    - Removed synthetic thought events (`วิเคราะห์ขั้นตอนการทำงาน...` and observation reflection thoughts) that were artificially injected when models lacked native reasoning.
    - Emits `type: 'thought'` strictly when the model natively provides reasoning / thinking tokens (`response.thought`).
  - `backend/src/modules/ai/providers/streaming.ts`:
    - Added comprehensive multi-field reasoning extraction (`reasoning_content`, `reasoning`, `thought`) from both streaming SSE deltas and non-streaming responses.
  - `backend/src/modules/ai/providers/mock.provider.ts`:
    - Gated mock thought outputs to reasoning models (`/think|reason|r1|qwq/i`).
  - `frontend/src/components/ai/DooRareChatDrawer.tsx`:
    - Initialized `isThinking: false` (previously hardcoded to `true`), so models without thinking capability do not display thinking boxes before or after streaming.
    - Rendered `<ThinkingAccordion>` strictly when `Boolean(msg.thought && msg.thought.trim().length > 0)`.
    - If a model has no thinking capability, the thinking box completely disappears and is not rendered.
    - For models with thinking capability: Auto-toggles open during thinking (`isThinking: true`), and auto-collapses to minimized state (`Thought for Xs`) when normal content generation begins.
  - `frontend/src/components/ai/ThinkingAccordion.tsx`:
    - Added guard: `if (!thought || !thought.trim()) return null;`.

- **Duplicate Open Borrow Request Handling (Confirm to Send Again):**
  - Updated `backend/src/modules/borrow/borrow.service.ts`:
    - Evaluated `force`, `confirmDuplicate`, and `allowDuplicate` flags in `create()`.
    - Bypassed the 409 `มีคำขอยืมยานี้ที่ยังไม่ปิดแล้ว (${dup.rows[0].request_no})` check and `need.borrow <= 0` lock when `force` is explicitly provided by the operator.
  - Updated `frontend/src/components/ai/DooRareChatDrawer.tsx`:
    - Detected duplicate conflict errors (`ยังไม่ปิด` / `409` / `CONFLICT`) in `ProposalCard`.
    - Maintained the proposal card active without marking it as permanently failed.
    - Rendered an actionable warning banner explaining the existing open request (`BR-...`).
    - Provided an explicit confirmation button: `[ 🔁 ยืนยันส่งคำขอซ้ำอีกครั้ง (Confirm & Send Again) ]`.
    - Generates a fresh `Idempotency-Key` on force-confirm and transmits `force: true` to bypass the duplicate restriction and create the borrow request immediately upon operator confirmation.
  - Added warning banner and button styling in `frontend/src/components/ai/chatDrawer.css`.
  - Redesigned `ProposalCard` in `frontend/src/components/ai/DooRareChatDrawer.tsx` into an authoritative clinical order proposal document:
    - Formal header with clinical document icon, category title ("ใบเสนอคำขอยืมยาทางการแพทย์ (Clinical Order Proposal)"), and pending badge ("รอการอนุมัติ (Pending Authorization)").
    - 2-column clinical specification grid:
      - รายการยา & รูปแบบ (Drug & Strength)
      - จำนวนที่ขอยืม (Requested Quantity & Units)
      - โรงพยาบาลผู้ให้ยืม (Lender Hospital)
      - ระดับความเร่งด่วน (Urgency level pill: ด่วนมาก / ด่วน / ปกติ)
      - เวลาขนส่งโดยประมาณ (Est. Transit Time ~30-45 นาที)
      - ช่องทางขนส่งเวชภัณฑ์ (Delivery Logistics Channel)
    - Clinical Rationale callout box highlighting safety stock alerts and clinical necessity.
    - Safety & Compliance verification strip (network stock verified, accredited lender hospital, auditable trail).
    - Executive action buttons: "ยืนยันอนุมัติคำขอยืม (Authorize & Approve)" and "ปฏิเสธคำขอ (Decline)".
    - Decided state: Renders a formal clinical authorization banner (emerald checkmark for approved, slate/gray for declined) with order summary chips and zero interactive buttons.
- **DeepSeek Light-Mode Input Capsule:**
  - Redesigned bottom chat input bar in `frontend/src/components/ai/DooRareChatDrawer.tsx` to match DeepSeek design specifications in light mode:
    - Outer pill container (`border-radius: 22px`, white background `#ffffff`, subtle border `#e2e8f0`, soft shadow, focus-within glow `#2563eb`).
    - Top area: Auto-growing textarea with clean placeholder and attached file badge preview.
    - Bottom controls:
      - Left: `[🌐 Search]` toggle pill button (no DeepThink pill) and subtle hospital scope badge (`• โรงพยาบาล...`).
      - Right: `📎` SVG paperclip attachment button and circular upward-arrow `↑` send button (and circular stop button during streaming).
  - Added comprehensive CSS in `frontend/src/components/ai/chatDrawer.css`.

## Decisions
- URL pre-fetch runs before LLM execution: ensures web content is retrieved deterministically without depending on LLM decision-making or model tool capabilities.
- Web search defaults to OFF: protects internal hospital data and prevents unnecessary public web searches for internal pharmacy inventory.
- Retain `extra_content` losslessly: complies with Google's proprietary `thought_signature` requirement on Gemini 2.0/1.5 tool call completions.
- Light mode for chat input capsule: maintains consistent clinical cleanliness and aligns with user specification.

## Files Touched
- `backend/src/modules/ai/providers/types.ts`
- `backend/src/modules/ai/providers/custom.provider.ts`
- `backend/src/modules/ai/providers/streaming.ts`
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/src/modules/ai/tools/askOperator.tool.ts`
- `backend/src/modules/ai/tools/clinical/pharmacist.tools.ts`
- `backend/src/modules/borrow/borrow.inputs.ts`
- `backend/src/modules/borrow/borrow.service.ts`
- `backend/src/modules/ai/chat/chat.routes.ts`
- `frontend/src/components/ai/ClarifyPanel.tsx`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/chatDrawer.css`
- `frontend/src/services/aiChatApi.ts`

## Errors Encountered
- `Property 'extra_content' does not exist on type '{ id: string; name: string; args: string; }'`: Fixed by updating type in streaming pending Map.
- Shadowed variable `prompt` in `DooRareChatDrawer.tsx`: Fixed variable scope.
- `error TS1005: ';' expected` in `react.engine.ts` from unescaped backticks in template literal: Replaced with single quotes.

## Next Steps
- Verify live UI at `http://localhost:8080`.
