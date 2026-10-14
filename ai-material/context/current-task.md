# Current Task

Goal: Pharmacist Hospital Dashboard frontend (React+TS, Docker, npm) — mockup-faithful, now role-structured and responsive to phones/tablets.

Status: Reverted to remote `2e1313b` and continued from it. Restructured to `src/roles/pharmacist/{pages,components,data}` + shared `components/{common,layout}` and `data/{session,navigation}`. Responsive pass done (drawer nav <1024, phone top bar grid <768, 2-col KPI/tiles <640). Build passes; Docker rebuilt; :8080 HTTP 200. Collapsed rail overlap fixed and expand/collapse animated; UI capture snapshot committed to `artifacts/`.

Blockers: Browser-panel screenshots were unavailable ("webview not composited") — verified via DOM geometry; a visual pass is still worth doing.

Next action: Review preview at http://127.0.0.1:5173 (vite dev) or http://localhost:8080 (docker). Then wire real API replacing mock data, and add the remaining role pages on the new structure.

Relevant files: `frontend/src/App.tsx`, `frontend/src/roles/pharmacist/pages/DashboardPage.tsx`, `frontend/src/index.css`, `frontend/src/README.md`


## Branch feature/dashboard-transport-tracking

- UI-14 Transport tracking (warehouse role) built UI-only; open `/?page=transport`. See `sessions/2026-10-14-transport-tracking-ui.md`.
- Next: driver PWA states, IndexedDB queue, API wiring.

## UI-02 Stock alert queue (branch feature/notification)

- UI-02 built UI-only (pharmacist role); open `/?page=alerts`; sidebar "แจ้งเตือนสต็อก" links there. See `sessions/2026-10-14-stock-alert-queue-ui02.md`.
- Files: `frontend/src/roles/pharmacist/{data/stockAlerts.ts,components/StockAlert*.tsx,pages/StockAlertsPage.tsx}`, `frontend/src/index.css` (`.sa-*`), `frontend/src/App.tsx`.
- Verify: `cd frontend && npm run build`; page checks via `vite preview` + Playwright.
- Next: wire `GET /alerts` (API-F1a-005) + ack/snooze POSTs, "สร้างคำขอ" → API-F1b-001; then UI-03 / UI-07.
