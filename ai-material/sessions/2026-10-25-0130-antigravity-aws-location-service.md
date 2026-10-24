# Session: AWS Location Service Integration & Routing Engine (INT-04)

- **Date:** 2026-10-25 01:30
- **Author:** Antigravity

## Goal
Connect DooRare backend and frontend with Amazon Location Service v2 Routes API for real driving routes, distance calculations, and automatic `hospital_distance` matrix synchronization with Haversine fallback.

## Done
- Mounted `locationRouter` at `/api/v1/location` in [backend/src/app.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/app.ts).
- Integrated on-demand Location Service transit calculations in [backend/src/modules/borrow/borrow.ladder.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/borrow/borrow.ladder.ts) via `getOrRefreshHospitalDistance`.
- Added coordinate bounds and null/NaN guards to `estimateHaversineDistance` and `calculateRoute` in [backend/src/modules/location/location.service.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/location/location.service.ts).
- Created frontend client [frontend/src/services/locationApi.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/services/locationApi.ts) (`getLocationStatus`, `calculateHospitalRoute`, `calculatePointRoute`, `syncLocationMatrix`).
- Added unit tests in [backend/tests/location.test.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/tests/location.test.ts) (5/5 tests passing).
- Verified TypeScript build for both backend (`npm --prefix backend run build`, exit 0) and frontend (`npm --prefix frontend run build`, exit 0).

## Decisions
- Used Amazon Location Service v2 Routes endpoint (`POST https://routes.geo.<region>.amazonaws.com/v2/routes?key=<API_KEY>`) with geojson coordinate format `[lon, lat]`.
- Implemented automatic Haversine fallback (1.35 urban tortuosity factor, 45 km/h avg speed) when offline or API key is unconfigured.
- Seamless DB upsert into `hospital_distance` preserves query performance and avoids redundant API billing.

## Files Touched
- [backend/src/app.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/app.ts)
- [backend/src/modules/location/location.routes.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/location/location.routes.ts)
- [backend/src/modules/location/location.service.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/location/location.service.ts)
- [backend/src/modules/borrow/borrow.ladder.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/borrow/borrow.ladder.ts)
- [backend/tests/location.test.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/tests/location.test.ts)
- [frontend/src/services/locationApi.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/services/locationApi.ts)

## Errors Encountered
- `requireRole(['SYSTEM_ADMIN', 'REGION_ADMIN'])` type error in `location.routes.ts` fixed by changing to rest arguments `requireRole('SYSTEM_ADMIN', 'REGION_ADMIN')`.

## Next Steps
- Deploy updated backend container image or pull changes on EC2.
- Execute matrix sync via `POST /api/v1/location/sync-matrix` on production DB.
