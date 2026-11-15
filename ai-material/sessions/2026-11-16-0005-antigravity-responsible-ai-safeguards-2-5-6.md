# Session: Responsible AI Hardening (Fixes 2, 5, 6)

- **Date:** 2026-11-16 00:05
- **Author:** Antigravity

## Goal
Implement three high-priority Responsible AI safeguards requested by the user:
1. Fix 2: SSRF redirect defense in `web_fetch`.
2. Fix 5: Indirect prompt injection sandboxing for untrusted external web content.
3. Fix 6: AI Chat API rate limiting and concurrent streaming connection controls.

## Done
- **Fix 2 (SSRF & Redirect Defense):**
  - Enhanced `assertPublicUrl` in `backend/src/modules/ai/tools/web/web.tools.ts` to block loopback, link-local, carrier-grade NAT, private RFC1918 networks, cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`), hex/integer-encoded IPs, and dangerous database ports (e.g. 5432, 6379).
  - Replaced `redirect: 'follow'` in `fetchPage` with manual hop validation (`redirect: 'manual'`, max 5 hops), re-evaluating `assertPublicUrl` at every redirect hop before fetching.
- **Fix 5 (Prompt Injection Sandboxing):**
  - Updated `backend/src/modules/ai/engine/react.engine.ts` to encapsulate all pre-fetched external web text inside `<untrusted_external_content>` tags with passive data notices.
  - Added Rule 12 into `buildSystemPrompt` directing the model to treat external text strictly as passive data and ignore any embedded command/override attempts.
  - Sanitized embedded closing tags in `web.tools.ts` to prevent delimiter escaping.
- **Fix 6 (Chat Rate Limiting):**
  - Built zero-dependency `ChatRateLimiter` middleware in `backend/src/middleware/chatRateLimiter.ts` (sliding window of 20 req/min per user, max 3 concurrent active SSE streams).
  - Mounted middleware on `POST /api/v1/ai/chat` in `backend/src/modules/ai/chat/chat.routes.ts`.
- **Verification:**
  - Added 9 unit tests in `backend/tests/ai.responsible-safeguards.test.ts`; all 9 passed (358ms).
  - TypeScript build (`npm --prefix backend run build`) passes cleanly with 0 errors.

## Decisions
- Used `redirect: 'manual'` in fetch loops rather than a third-party library to maintain zero runtime dependencies.
- Kept rate limiting in memory with periodic bucket cleanup, keyed on `req.user.id` from authenticated sessions.

## Files Touched
- `backend/src/modules/ai/tools/web/web.tools.ts`
- `backend/src/modules/ai/engine/react.engine.ts`
- `backend/src/middleware/chatRateLimiter.ts`
- `backend/src/modules/ai/chat/chat.routes.ts`
- `backend/tests/ai.responsible-safeguards.test.ts`

## Errors Encountered
- Initial regex in IPv6 check matched `fda.moph.go.th` due to `/^(fe80|fc|fd)/i`; resolved by restricting to hosts containing colons (`:`).

## Next Steps
- Run the full test suite when the local Postgres Docker container is online.
