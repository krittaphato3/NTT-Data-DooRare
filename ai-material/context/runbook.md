# Runbook

Install (frontend): `cd frontend && npm ci`
Install (repo tooling, for capture): `npm install` (repo root — playwright-core only)

Dev: `cd frontend && npm run dev` → http://localhost:5173
Build: `cd frontend && npm run build` (tsc --noEmit + vite build → `frontend/dist`)
Docker: `docker compose up --build -d` → http://localhost:8080 (nginx serves `frontend/dist`)
Test: none yet — `npm run build` is the verification gate
Lint: none configured yet

Other useful commands:
- UI artifacts (screenshots of every part + gallery): `npm run capture` (Docker at :8080) or `npm run capture:dev` (Vite at :5173) → `artifacts/` (see `artifacts/README.md`).
- View the gallery: open `artifacts/index.html`, or `python -m http.server 4174 --directory artifacts --bind 127.0.0.1` → http://127.0.0.1:4174.
- AI index/session helpers: `node scripts/ai-index.mjs`, `node scripts/ai-session.mjs <ai-name> [topic...]`.
