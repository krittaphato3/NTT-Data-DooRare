# `backend/` — DooRare API (Express + Postgres)

TypeScript (ESM, `NodeNext`), Express 4, `pg`. Every response is `{ ok: true, ... }` on success and an
RFC 9457-style Problem JSON on failure (`src/middleware/errorHandler.ts`).

```bash
npm --prefix backend ci             # install (package-lock.json is committed)
npm --prefix backend run build      # tsc -> backend/dist (the verification gate; no lint configured)
npm --prefix backend run dev        # tsx watch src/index.ts
npm --prefix backend start          # node dist/index.js
```

## Configuration (`src/config/env.ts`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `127.0.0.1` / `5442` (5432 when `DB_HOST=db`) / `doorare` / `doorare` / `doorare_dev` | Postgres |
| `FORECASTS_DIR` | `models/artifacts/forecasts`, then `backend/models/artifacts/forecasts`, then `../models/artifacts/forecasts` (first that exists) | Python inference JSON (fallback source for forecasts) |
| `FORECASTS_STALE_AFTER_DAYS` | `30` | Marks `meta.stale` when the forecast `dataEnd` is older than this (`null` = unknown, e.g. the DB path, which stores no data end) |
| `CORS_ORIGIN`, `MASTER_PASSWORD`, `DEMO_OTP` | see source | as before |

**Docker:** the backend image does **not** include `backend/models/` (that directory holds the Python module,
derived data and artifacts). To serve the JSON fallback in a container, mount the forecasts directory and set
`FORECASTS_DIR`, e.g. `-v ./backend/models/artifacts/forecasts:/data/forecasts -e FORECASTS_DIR=/data/forecasts`.
`docker-compose.yml` was intentionally left unchanged in this phase.

## Endpoints

| Spec id | Method + path | Roles (`x-roles`) | Notes |
|---|---|---|---|
| API-F1a-001 | `GET /api/v1/forecasts` | PHARMACIST, PROCUREMENT_OFFICER, HOSPITAL_ADMIN, REGION_ADMIN | Latest forecast rows |
| API-F1a-002 | `GET /api/v1/forecasts/{hospitalDrugId}` | PHARMACIST, PROCUREMENT_OFFICER, HOSPITAL_ADMIN | Latest row + history + weekly backtest |
| API-F1a-003 | `POST /api/v1/forecasts/runs` | SYSTEM_ADMIN, REGION_ADMIN | **not implemented** — triggers a run (write/job, Idempotency-Key); this phase is read-only |
| API-PL-001 | `GET /api/v1/me` | authenticated | unchanged |
| — | `GET /api/v1/health`, `POST /api/v1/auth/*` | — | unchanged |

### `GET /api/v1/forecasts` (API-F1a-001)

Query parameters: `cursor` (opaque, from `nextCursor`), `limit` (1..200, default 50) per the spec, plus the
filters the spec's summary names — `hospitalId`, `hospitalDrugId`, `ved` — and `abc`, `granularity`
(`WEEK` default / `MONTH`). Invalid values return `400 INVALID_QUERY`.

```json
{
  "ok": true,
  "items": [ { "…ForecastItem…": "…" } ],
  "nextCursor": "Mg",
  "meta": { "source": "JSON_FALLBACK", "modelVersion": "…", "originUsed": "2026-09-21",
            "dataEnd": "2026-09-30", "calibration": { "enabled": true, "variant": "global" },
            "stale": false, "staleAfterDays": 30, "mockData": true, "caveat": "MOCK DATA - …" }
}
```

`cursor` is an offset token; an unparseable token is a 400, never a silent restart. Rows are ordered by
hospital code then item code so pagination is stable.

### `GET /api/v1/forecasts/{hospitalDrugId}` (API-F1a-002)

Returns the spec's `ForecastDetail` shape — `{ ok, id, version, data, meta }` — where `data` is the item plus
`history` and `backtest`. `version` is `null`: `forecast_result` has no version column, and `0` would look like
a real revision. `history`/`backtest` are `[]` when only the JSON contract is available (it stores the current
period only). Unknown id → `404 NOT_FOUND`.

### Forecast item fields

`id, granularity, periodStart, originUsed, hospitalId, hospitalCode, hospitalName, hospitalDrugId, itemCode,
itemName, genericName, baseUnit, method, demandPattern, ved, abc, p05…p95, totalTarget, rop, uPerDay,
sigmaPerDay, leadTimeDays, leadTimeQuantile, leadTimeQuantileApprox, stockOnHand, incoming,
projectedOnHand { p50, p90, p95 }, minLevel, maxLevel, borrowQty, confidenceFlag, confidenceFlags[], flags[],
coverageOk, modelVersion, calibration { enabled, variant }, computedAt`.

`confidenceFlag(s)` / `flags` / `method` / `calibration` / `modelVersion` are returned so the UI can label a
row. The API makes **no** decision from them: a `LOW_CONFIDENCE`, `COLD_START` or `FALLBACK_CLASSICAL` row is
returned like any other, with its flags.

### Fields the API does not produce

No column and no JSON field exists for these, so they are `null` (never invented) and listed in
`meta.fieldsUnavailable`:

| Field | DB source | JSON source | Returned |
|---|---|---|---|
| `minLevel`, `maxLevel` | `forecast_result.min_level / max_level` (nullable, not written yet) | none | `null` |
| `borrowQty` | none — F1b computes it from `rop`/`lead_time_quantile` | none | `null` |
| `p05`, `p10`, `p25`, `p75` | not stored | present | DB path `null`, JSON path the value |
| `stockOnHand`, `incoming`, `projectedOnHand` | not stored | present | DB path `null` / `{}` |
| `originUsed`, `dataEnd`, `calibration` | not stored (meta level) | present | DB path `null` / `unknown` |
| `hospitalName`, `itemName`, `genericName`, `baseUnit` | joined from `hospital` / `hospital_drug` / `drug_master` | absent | JSON path `null` |
| `history`, `backtest` | `forecast_result` / `forecast_backtest` | absent | JSON path `[]` |

## Forecast data source

1. **Postgres** — `v_latest_forecast` (latest period per series) joined to `hospital`, `hospital_drug`,
   `drug_master` and `forecast_run` (for `model_version`), through the shared `query()` helper. Detail also
   reads `forecast_result` history and (WEEK only) `forecast_backtest` — that table has no `granularity`
   column, so MONTH detail returns an empty backtest list rather than mislabelled weeks.
2. **JSON fallback** — when the DB is unreachable **or holds no forecast rows**: the newest
   `models/artifacts/forecasts/<modelVersion>/forecast_<GRAN>_<origin>.json`, chosen by `originUsed` then
   `modelVersion`, cached by mtime. The payload is the Phase 7a contract.

The chosen source is always reported in `meta.source` (`DB` / `JSON_FALLBACK`) and a DB failure also appears
in `meta.dbError` (the raw driver message only outside production).

**SEC-002**: a signed-in user bound to one hospital is scoped to that hospital — the query filter is
overridden for lists and another hospital's series returns 404 (not 403, to avoid confirming it exists).

**Data quality caveat**: `meta.caveat`/`meta.mockData` are present on every response —
`MOCK DATA - the F1 pack is synthetic; do not read these numbers as real accuracy`.

Writes are out of scope: this module performs SELECTs only and no schema/compose changes were made.
