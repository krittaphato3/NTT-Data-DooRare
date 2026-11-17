# Session: PR #18 Review Investigation & Fixes (BYOK Key, SSRF/DNS, Borrow Update)

- **Date:** 2026-11-17 19:00
- **Author:** Antigravity

## Goal
Investigate review feedback on GitHub PR #18 (`https://github.com/krittaphato3/NTT-Data-DooRare/pull/18#pullrequestreview-5937149375`) from reviewer `napatsun`. Verify claims, implement verified fixes, ensure tests pass, and draft a response.

## Done
1. **Blocker 1 (BYOK Crypto Fallback Key):**
   - *Finding:* Verified true. `getEncryptionKey()` in `byok.crypto.ts` fell back to `JWT_SECRET` and then a hardcoded string `PERSISTENT_FALLBACK_KEY`. Falling back to `JWT_SECRET` risks invalidating encrypted credentials upon JWT rotation; using a hardcoded key in production is unsafe.
   - *Fix:* Decoupled from `JWT_SECRET`. Fails closed in production (`NODE_ENV === 'production'`) throwing `[BYOK Crypto Security Blocker] BYOK_ENCRYPTION_KEY must be configured in production`. In non-production, logs a one-time prominent warning and uses a development fallback.
2. **Blocker 2 & Minor SSRF/IPv6/Redirects (`web.tools.ts`):**
   - *Finding:* Verified true.
     - `assertPublicHostDns` comment claimed defense against DNS rebinding / TOCTOU, but native Node `fetch()` performs an independent DNS lookup without socket IP pinning, creating a TOCTOU race condition against TTL=0 DNS records.
     - IPv6 reserved prefixes missed `ff00::/8` (multicast), `2001:db8::/32` (documentation), and hex-formatted IPv4-mapped addresses (e.g. `::ffff:7f00:1`).
     - On 3xx redirects, `res.body` was unconsumed, causing open sockets until GC in Node.js Undici.
   - *Fix:*
     - Treated all `::ffff:` and IPv4-mapped IPv6 variants as reserved.
     - Added `ff` (multicast) and `2001:db8` (documentation) to reserved prefix check regex.
     - Added explicit stream cancellation `if (res.body) { try { await res.body.cancel(); } catch {} }` on 3xx redirects.
     - Corrected `assertPublicHostDns` JSDoc to explicitly document residual TOCTOU risk with unpinned fetch and note mitigation via pinned dispatcher or egress firewall.
3. **Blocker 3 (`borrow.service.ts` update overwriting all items):**
   - *Finding:* Verified true. `UPDATE borrow_request_item SET qty_requested = $2 WHERE request_id = $1` overwrote `qty_requested` on every item in multi-item borrow requests.
   - *Fix:* Queried items for `request_id`. If `itemId` provided, updates that specific item. If single item and no `itemId`, updates it. If $>1$ item and no `itemId`, throws 400 `AMBIGUOUS_ITEM`.

## Decisions
- Fail-closed security in production for BYOK encryption key.
- Explicit residual risk acknowledgment in documentation for TOCTOU DNS rebinding with unpinned fetch.
- Defensive handling of multi-item borrow request quantity updates.

## Files Touched
- `backend/src/modules/ai/byok/byok.crypto.ts`
- `backend/src/modules/ai/tools/web/web.tools.ts`
- `backend/src/modules/borrow/borrow.service.ts`
- `backend/tests/ai.responsible-safeguards.test.ts`
- `frontend/src/components/ai/ClarifyPanel.tsx`
- `frontend/src/components/ai/DooRareChatDrawer.tsx`

## Verification
- `npm --prefix backend run build`: PASSED (0 errors)
- `npm --prefix frontend run build`: PASSED (0 errors)
- `tsx --test backend/tests/ai.byok.crypto.test.ts ...`: 114/114 PASSED
