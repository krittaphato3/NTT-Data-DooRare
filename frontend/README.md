# MedSupply Link — Pharmacist Dashboard (frontend)

Vite + React + TypeScript replica of `Mockups/Dashboard - Pharmacist Hospital/Main.dc.html`.

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
