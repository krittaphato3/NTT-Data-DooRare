# MedSupply Link — Pharmacist Dashboard (frontend)

Vite + React + TypeScript replica of `Mockups/Dashboard - Pharmacist Hospital/Main.dc.html`,
organized by role and responsive from phones up to wide desktops.

## Structure

Role-based: shared shell (layout/common components) + per-role pages/components/data.
See [src/README.md](src/README.md) for the folder rules.

## Responsive

- `≥1024px` — persistent sidebar (collapsible to a 64px icon rail).
- `<1024px` — sidebar becomes an off-canvas drawer (hamburger, scrim, Esc closes, scroll locks).
- `<768px` — compact top bar: menu · hospital · bell · account, search on its own row.
- `<640px` — two-column KPI/tiles, tighter card padding, buttons stretch full width.
- No horizontal page scroll at any width; tables scroll inside their card.

## Dev

```sh
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Build

```sh
cd frontend
npm install
npm run build # -> dist/
```

## Docker

From repo root:

```sh
docker compose up --build
# open http://localhost:8080
```

Image: multi-stage `node:20-alpine` build → `nginx:alpine` serving `dist/` on port 80.
