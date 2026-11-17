# Session: Responsible AI PR #18 Hardening & Review Fixes

- **Date:** 2026-11-16 18:55
- **Author:** Antigravity

## Goal
- Address reviewer napatsun's Request Changes review on PR #18 (branch `backend-byok-security-fix-3`), resolving the trailing-dot hostname bypass, true sliding window rate limiting, real multi-hop 302 unit test, untrusted content role separation, and POSIX path normalization in ai-material.
- Implement pre-fetch DNS validation and port allowlist defending against wildcard dynamic DNS services (nip.io, sslip.io) and DNS rebinding / TOCTOU attacks.

## Done
1. **SSRF Trailing-Dot FQDN Defense & Port Allowlist:**
   - Updated `assertPublicUrl` in `backend/src/modules/ai/tools/web/web.tools.ts` to strip trailing dots via `.replace(/\.+$/, '')`.
   - Replaced fragile port blacklist with a strict web port allowlist (`80`, `443`).
   - Added IPv6 checks for Teredo (`2002::/16`) and NAT64 (`64:ff9b::/96`).
2. **Pre-Fetch DNS Resolution Validation (`assertPublicHostDns`):**
   - Implemented zero-dependency `assertPublicHostDns` using `node:dns/promises` and `node:net`.
   - Resolves all A and AAAA records for target hostnames and validates every resolved IP against `isPrivateOrReservedIp` (RFC 1918, loopbacks, link-local, cloud metadata, carrier-grade NAT, multicast, reserved).
   - Defends against dynamic DNS wildcards (`*.nip.io`, `*.sslip.io`, `*.traefik.me`) and multi-record DNS rebinding / TOCTOU.
   - Evaluates DNS before initial fetch and at every 302/3xx redirect hop in `fetchPage`.
3. **True Sliding Window Log Rate Limiter:**
   - Refactored `ChatRateLimiter` in `backend/src/middleware/chatRateLimiter.ts` from fixed-window buckets to sliding timestamp arrays, preventing boundary burst traffic.
4. **Genuine Multi-Hop 302 Redirect & DNS Rebinding Tests:**
   - Allowed injecting `fetchFn` and `dnsLookupFn` into `fetchPage` in `web.tools.ts`.
   - Added comprehensive tests in `backend/tests/ai.responsible-safeguards.test.ts` verifying interception of nip.io, multi-record private IPs, and 302 redirects.
5. **Untrusted External Content Isolation:**
   - Switched pre-fetched external web context from `role: 'system'` to `role: 'user'` in `backend/src/modules/ai/engine/react.engine.ts`.
6. **Path Normalization:**
   - Updated `scripts/ai-index.mjs` to normalize paths with POSIX forward slashes, updating `ai-material/INDEX.md` and `.index.json`.

## Verification
- Unit test suite: `npx tsx --test tests/ai.responsible-safeguards.test.ts` (13/13 passed in 926ms).
- TypeScript build: `npm --prefix backend run build` (clean exit 0).
- Live Node reproduction confirmed:
  - `http://10.0.0.1.nip.io/` -> BLOCKED
  - `http://127.0.0.1.nip.io/` -> BLOCKED
  - `http://192-168-1-1.sslip.io/` -> BLOCKED
  - Docker containers built and restarted healthy.

## Next Steps
- Commit and push DNS validation fixes to `backend-byok-security-fix-3`.
