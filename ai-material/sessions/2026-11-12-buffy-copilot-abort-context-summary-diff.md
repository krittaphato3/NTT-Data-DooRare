# Copilot stop / screen context + plan summary change-diff

Date: 2026-11-12 · Branch: `backend-byok` · AI: buffy

## Goal
Fix the copilot chat (stop never cancelled, screen context never reached the model) and make the AI summary say what changed since the previous run.

## Done
- `frontend/src/components/ai/DooRareChatDrawer.tsx`: one `AbortController` per turn, stored in `abortControllerRef` and passed as the 4th `signal` arg to `streamAiChat`. Abort now cancels the SSE read; partial answer kept and session persisted, real errors render in the bubble, `finally` clears the ref.
- `backend/src/modules/ai/engine/react.engine.ts`: `buildSystemPrompt` adds `Current Screen` (`pageTitle`/`currentPath`) and `Record Open On This Screen` (`activeId`), plus guideline 6 — resolve "this / อันนี้" from the open record instead of asking.
- `backend/src/modules/incidents/plan.agent.ts`: new `what_changed_th` in `TOP_KEYS`, required once a previous OK run exists; `previousAssessment()` loads the last OK run (summary, confidence, counts, decisions) into `data.previous_assessment`; previous numbers added to `allowedNumbers` for G-03; `PlanAgentView.whatChanged`.
- `frontend/src/services/incidentApi.ts`, `frontend/src/roles/er/live/AgentPlanCard.tsx`: `whatChanged` on `ApiPlanAgent` + "เปลี่ยนจากครั้งก่อน" block.

## Decisions
- `what_changed_th` stays optional on a first assessment (empty string): the field is guaranteed only when there is something to compare, which keeps the existing prompt/test contract.
- The input hash covers incident + plan only, deliberately **excluding** `previous_assessment`; otherwise every new run would make the current run look stale.

## Verification
- `npm --prefix backend run build` exit 0.
- `npx tsx --test tests/plan.agent.test.ts` 5/5 pass.
- `cd frontend && npm run build` exit 0.

## Errors
- Git refused every command with "dubious ownership" (folder owned by another Windows SID). Worked around per command with `-c safe.directory=D:/Library/Project/NTT-Data-DooRare`; global git config left untouched.

## Part 2 — keyless web tools (same day)
- New `backend/src/modules/ai/tools/web/web.tools.ts`: `web_fetch` (one URL → readable text, no dependency) and `web_search` (reads the public Google SERP, DuckDuckGo HTML fallback, no key/vendor). Registered in `tools/index.ts` (+2 tools, registry 51 → 53).
- Untrusted-content marking: results carry `trust: 'UNTRUSTED_WEB_CONTENT'`; system prompt guideline 7 says DooRare tools are authoritative for stock/plans/incidents, web only for outside knowledge, and web text is data not instructions (G-09).
- SSRF guard `assertPublicUrl`: http(s) only; blocks localhost/*.local/*.internal, private/loopback/link-local IPv4 and IPv6. 12 s timeout, 600 KB cap, 8 KB text, 8 results.
- Roles are an explicit subset (6 roles), not `'*'`, because `tests/ai/rbac-matrix.test.ts` asserts only `ping_system` is wildcard.
- `tests/ai/rbac-matrix.test.ts` counts updated 51 → 53 / 510 → 530, plus a `webTools` block.

## Decisions
- No new config key / AI-config toggle for web tools yet; they ride the existing agent kill switch. Add `agent.webSearch.enabled` if the admin needs a separate switch.
- Google is tried first (explicit request) with DuckDuckGo as fallback, even though Google's SERP HTML yields no parseable links from this environment.

## Part 3 — Docker run (local) + AWS split
- Docker Desktop engine was down (per-user install at `%LOCALAPPDATA%\Programs\DockerDesktop`); started it, engine 29.9.2.
- Root `.env` (gitignored) so the stack uses the compose `db` service, not the RDS default: `DB_HOST=db`, `DB_PORT=5432`, `DB_PASSWORD=doorare_dev`, `DB_SSL=false`. Root `.env.example` documents both modes (leave `DB_*` unset → docker-compose.yml RDS defaults + `DB_SSL=true`).
- `npm run db:load` into the empty volume: 5 hospitals, 676,378 usage_daily, 574 borrow_requests, 16,613 lots.
- `docker-compose.yml`: added a backend healthcheck on `/api/v1/health` (node fetch — the image has no curl), usable as an ALB / ECS target-group check.
- Verified: 4 containers up (`doorare-backend` healthy); `:8080` HTML 200; `/api/v1/health` 200 through nginx (Postgres 16.15); `POST /ai/chat` 401 without a token; login issues `sess_*` (pharmacist1.ha); SSE streams through nginx with the route context; the built image reports 53 tools including `web_fetch` / `web_search`.
- Not done: no cloud deploy; the AWS Location API key is still hardcoded in `docker-compose.yml` (pre-existing) and should move to env/secret before any public deploy.

## Part 4 — real streaming, change-diff for the other agents, answer chips
- **Real streaming**: `ChatOptions.onDelta` + `providers/streaming.ts` (`consumeSse`, `readOpenAiCompatStream`). OpenAI / Azure / Custom send `stream: true`, reassemble tool-call fragments by index, and fall back to JSON when the endpoint ignores streaming; Anthropic parses `content_block_delta` (`text_delta`, `input_json_delta`). Bedrock stays non-streaming (whole answer forwarded once). `react.engine.ts` no longer fakes word pacing (the 15 ms/18 ms `setTimeout` loops are gone) and forwards each delta as it arrives.
- **what_changed_th** added to AGT-F1 (`borrow.agent.ts`, previous = ladder stored on the request), AGT-F2 (`allocation.agent.ts`, previous = last OK `agent_run` for the pool entry), AGT-F3 extras (`extras.agent.ts`, previous = last OK run for the incident). Mandatory once a previous run exists; the view/API exposes `whatChanged`.
- **Answer chips**: `frontend/src/components/ai/answerChips.ts` (pure) + `AnswerInsights.tsx` render citation chips (BR-/INC- records → `?page=`, external URLs) and 2–3 follow-up questions derived from the answer's tool names and text; click sends the prompt. Styles appended to `chatDrawer.css`.
- System prompt gained a language rule (answer in the operator's language; Thai UI → Thai) — the live model had been replying in English to a Thai question.
- Gotcha: on Windows `answerInsights.ts` + `AnswerInsights.tsx` collide (TS1261); the pure module is `answerChips.ts`.

## Verification (part 4)
- `npm --prefix backend run build` + `cd frontend && npm run build` exit 0.
- 29 agent/rbac tests pass (`borrow`, `extras`, `allocation`, `plan`, `rbac-matrix`).
- Docker rebuilt; backend healthy; `:8080` 200. Live SSE after the change: **170 token events**, Thai answer, 4 tool calls, 5 iterations, ~9.4 s.

## Next
- Not exercised against a running stack: stop button, drawer close, and the "เปลี่ยนจากครั้งก่อน" block were only compiled.
- Same what-changed diff for AGT-F2-001 (allocation) and AGT-F3 extras summaries if wanted.
- `web_search`: Google returns 0 parseable results from this machine (consent/JS page), so every search costs the DDG fallback round-trip; consider making DDG first if latency matters.
- SSRF guard is host-literal only — DNS names that resolve to private IPs are not caught (no DNS-rebinding defence).

## Verification (part 2)
- `npm --prefix backend run build` exit 0.
- `npx tsx --test tests/ai/rbac-matrix.test.ts` 7/7 pass, 53 tools, 530 matrix combinations.
- Live smoke: `web_fetch https://example.com` → title "Example Domain" + text; `localhost:8080` and `169.254.169.254` both refused; `web_search` → DuckDuckGo, 8 results, WHO essential-medicines URL first.
