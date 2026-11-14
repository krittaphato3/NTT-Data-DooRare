# Session Note: Gemini-Inspired White Theme & 30-Day Chat Retention

Date: 2026-11-15 01:45 (Asia/Bangkok)
Author: Antigravity Assistant

## Goal
- Refine Copilot page UX/UI using Gemini UX/UI as reference (clean white theme) adapted to healthcare components.
- Keep chat input UX/UI strictly adhering to the 4th picture style (white capsule, web search toggle, hospital scope, paperclip attachment, circular send button, clinical safety disclaimer).
- Change session retention from 24 hours to 30 days (`30 * 24 * 60 * 60 * 1000`).
- Categorize sidebar chat sessions into Today ("วันนี้"), Yesterday ("เมื่อวาน"), Previous 7 Days ("7 วันที่ผ่านมา"), and Previous 30 Days ("ก่อนหน้า (ภายใน 30 วัน)"). Auto-purge sessions older than 30 days.

## Done
- Updated `frontend/src/services/chatSessionStore.ts`:
  - Set `RETENTION_DAYS = 30` and `RETENTION_MS = 30 * 24 * 60 * 60 * 1000`.
  - Added `groupSessionsByDate(sessions: ChatSession[]): SessionDateGroup[]`.
  - Updated auto-purge logic in `loadSessions()` to purge items older than 30 days.
- Updated `frontend/src/components/ai/DooRareChatDrawer.tsx`:
  - Integrated `groupSessionsByDate()` into the session drawer.
  - Added mini icon rail (`doorare-chat-mini-rail`) for collapsed sidebar mode (Gemini Image 3 reference).
  - Removed quick tools (`คลังและสต็อกยา`, `คำขอยืมของฉัน`) per user request.
  - Removed `+ แชทใหม่` button from the top header bar (retained in sidebar/mini-rail).
  - Removed role badge / text (`เภสัชกร (Pharmacist)`) and blue background accents from the top header for a clean, minimalist header.
  - Restored default initial state to Mini Card floating popup (`isFullScreen = false`), keeping the card layout docked at bottom-right corner.
  - In Fullscreen mode: quit button (`✕`) acts as minimize to restore back into the Mini Card version (`setIsFullScreen(false)`).
  - In Mini Card mode: added expand button `⤢` to enter Fullscreen mode, and `✕` to close/minimize down to the floating launcher button.
  - Updated retention badge to "30 วัน".
  - Updated clear-all confirmation prompt to 30 days.
- Updated `frontend/src/components/ai/chatDrawer.css`:
  - Added styles for `.doorare-chat-mini-rail`, `.doorare-mini-rail-btn`, and avatar.
  - Cleaned header avatar background and border (transparent/white).
  - Styled session groups and Gemini-like rounded pill sessions (`border-radius: 20px`, active `#e8f0fe` with `#1a73e8` text).
  - Maintained the custom input capsule (Picture 4) layout and clinical disclaimer.
- Rebuilt frontend with Vite and updated Docker container `doorare-frontend`.
- Executed unit and regression test suite: 289 tests passed with 0 failures.

## Decisions
- Maintained strict separation between the Gemini sidebar/empty-state design and the custom hospital clinical input capsule (Image 4).
- Grouped sessions into natural Thai timeframes (วันนี้, เมื่อวาน, 7 วันที่ผ่านมา, ก่อนหน้า (ภายใน 30 วัน)).

## Files Touched
- `frontend/src/services/chatSessionStore.ts`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`
- `frontend/src/components/ai/chatDrawer.css`

## Errors Encountered
- `edit_file` tool encountered CRLF line ending differences in `chatDrawer.css`. Resolved via precise script update preserving file encoding.

## Next Steps
- Verify live behavior in the browser at http://localhost:8080.
- Check user feedback on the categorized sidebar and Gemini white theme.
