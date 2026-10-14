# Runbook

Install (frontend): `cd frontend && npm ci`
Install (repo tooling, for capture): `npm install` (repo root — playwright-core only)

Dev: `cd frontend && npm run dev` → http://localhost:5173
Build: `cd frontend && npm run build` (tsc --noEmit + vite build → `frontend/dist`)
Docker: `docker compose up --build -d` → http://localhost:8080 (nginx serves `frontend/dist`)
Test: none yet — `npm run build` is the verification gate
Lint: none configured yet

Database (Postgres 16, host port 5442, user doorare / pw doorare_dev / db doorare):
- `npm run db:up` start; `npm run db:reset` recreate from `db/schema.sql` + load `db/mock/csv` (~15 s); `npm run db:load` load into empty DB; `npm run db:psql` shell.
- DB web UI (Adminer): http://localhost:8082 → server `db`, user `doorare`, pw `doorare_dev`, db `doorare` (`docker compose up -d adminer`).
- Mock CSV is gitignored (`db/mock/csv/`, 133 MB): copy from the mock zip or run `python3 db/mock/generate.py`.

Other useful commands:
- UI artifacts (screenshots of every part + gallery): `npm run capture` (Docker at :8080) or `npm run capture:dev` (Vite at :5173) → `artifacts/` (see `artifacts/README.md`).
- View the gallery: open `artifacts/index.html`, or `python -m http.server 4174 --directory artifacts --bind 127.0.0.1` → http://127.0.0.1:4174.
- AI index/session helpers: `node scripts/ai-index.mjs`, `node scripts/ai-session.mjs <ai-name> [topic...]`.
