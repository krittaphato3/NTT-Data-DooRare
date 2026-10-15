# Current Task

Goal: Pharmacist Hospital Dashboard frontend (React+TS, Docker, npm) — mockup-faithful, now role-structured and responsive to phones/tablets.

Status: Reverted to remote `2e1313b` and continued from it. Restructured to `src/roles/pharmacist/{pages,components,data}` + shared `components/{common,layout}` and `data/{session,navigation}`. Responsive pass done (drawer nav <1024, phone top bar grid <768, 2-col KPI/tiles <640). Build passes; Docker rebuilt; :8080 HTTP 200. Collapsed rail overlap fixed and expand/collapse animated; UI capture snapshot committed to `artifacts/`.

Blockers: Browser-panel screenshots were unavailable ("webview not composited") — verified via DOM geometry; a visual pass is still worth doing.

Next action: Review preview at http://127.0.0.1:5173 (vite dev) or http://localhost:8080 (docker). Then wire real API replacing mock data, and add the remaining role pages on the new structure.

Relevant files: `frontend/src/App.tsx`, `frontend/src/roles/pharmacist/pages/DashboardPage.tsx`, `frontend/src/index.css`, `frontend/src/README.md`


## Branch feature/dashboard-transport-tracking

- UI-14 Transport tracking (warehouse role) built UI-only; open `/?page=transport`. See `sessions/2026-10-14-transport-tracking-ui.md`.
- Next: driver PWA states, IndexedDB queue, API wiring.

## UI-05 Borrow requests (pharmacist)

- Built UI-only at `/?page=requests`; see `sessions/2026-10-14-2039-claude-borrow-requests-ui05.md`.
- Shared ops CSS (table/filters/drawer/tabs) now lives in `index.css`.
- Next: UI-06 lender queue, UI-10 manual request, API wiring.

## Branch feature/dashboard-Incident

- UI-11 – UI-13 Incident Console (`?page=incident`) built matching 4 mockup screens.
- All 4 tabs implemented: แผนเวชภัณฑ์ UI-12, ยืมฉุกเฉิน, จัดชุด UI-13, สรุปหลังเหตุการณ์.
- Zero emojis used; standard SVG icons and `.badge` tokens used throughout.
- Docker rebuilt and serving on port 8080.
- Next: integration with live backend events and WebSocket incident updates.

## UI-02 Stock alert queue (branch feature/notification)

- UI-02 built UI-only (pharmacist role); open `/?page=alerts`; sidebar "แจ้งเตือนสต็อก" links there. See `sessions/2026-10-14-stock-alert-queue-ui02.md`.
- Files: `frontend/src/roles/pharmacist/{data/stockAlerts.ts,components/StockAlert*.tsx,pages/StockAlertsPage.tsx}`, `frontend/src/index.css` (`.sa-*`), `frontend/src/App.tsx`, `frontend/src/components/common/icons.tsx` (`upload`).
- Visual-fix pass done: design alignment (no English glosses, accent borders, badge icons, two bar markers, underline tabs, etc.); build exit 0; DOM probe 46/46; 25 `ui-02-*.png` re-captured fresh.
- Verify: `cd frontend && npm run build`; page checks via `vite` + Playwright (`?page=alerts`).
- Next: wire `GET /alerts` (API-F1a-005) + ack/snooze POSTs, "สร้างคำขอ" → API-F1b-001; then UI-03 / UI-07.
