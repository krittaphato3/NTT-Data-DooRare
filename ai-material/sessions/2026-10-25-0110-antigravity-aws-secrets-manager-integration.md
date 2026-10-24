---
title: AWS Secrets Manager Integration and Dual Load Strategy (SEC-010)
date: 2026-10-25
author: EgqZ
ai: ANTIGRAVITY
tags: session, aws, secrets-manager, security, sec-010, config, backend
summary: Integrated AWS Secrets Manager SDK into DooRare backend for enterprise credential management, added top-level await loader in env.ts, provided scripts/pull-secrets.mjs CLI, and added unit tests.
---

## Goal
1. Implement AWS Secrets Manager integration for DooRare backend conforming to specification SEC-010.
2. Provide seamless secret injection for RDS credentials, Location Service API Key, and application secrets.
3. Support both runtime in-memory preload and CLI pull to `.env`, with 0ms offline/unit test overhead and graceful fallback.

## Done
- Installed `@aws-sdk/client-secrets-manager` in `backend/`.
- Created `backend/src/config/secrets.ts`:
  - `loadAwsSecrets()`: Connects to AWS Secrets Manager using `AWS_SECRET_NAME` (e.g. `doorare/production/backend`) and region `ap-southeast-1`.
  - Merges secret key-values into `process.env`.
  - Gracefully recovers from network/credential failures with warning and local fallback (never crashes the server).
- Integrated `await loadAwsSecrets()` into `backend/src/config/env.ts` directly after `dotenv.config()`.
- Added `location` configuration (`apiKey`, `region`) to `config` object in `backend/src/config/env.ts`.
- Documented `AWS_SECRET_NAME`, `AWS_SECRETS_ENABLED`, and `AWS_LOCATION_API_KEY` in `backend/.env.example`.
- Created CLI utility `scripts/pull-secrets.mjs` and added `"secrets:pull": "node scripts/pull-secrets.mjs"` to root `package.json`.
- Created unit test suite `backend/tests/secrets.test.ts` (100% test pass).
- Verified TypeScript compilation (`npm --prefix backend run build` passed with exit code 0).

## Decisions
- Used top-level `await` in ES Modules (`backend/src/config/env.ts`) so database pools and dependent services receive decrypted credentials before attempting connection.
- Gated AWS network calls behind `AWS_SECRET_NAME` / `AWS_SECRETS_ENABLED` to preserve 0ms instant startup during unit testing and offline development.

## Files touched
- `backend/src/config/secrets.ts` (new)
- `backend/src/config/env.ts`
- `backend/.env.example`
- `scripts/pull-secrets.mjs` (new)
- `package.json`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/tests/secrets.test.ts` (new)
- `ai-material/sessions/2026-10-25-0110-antigravity-aws-secrets-manager-integration.md` (new)

## Next steps
- On EC2, run `npm run secrets:pull` or set `AWS_SECRET_NAME=doorare/production/backend` to start the backend with AWS Secrets Manager.
