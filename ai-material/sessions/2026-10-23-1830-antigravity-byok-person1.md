---
title: Central Admin BYOK & Multi-Provider LLM Gateway (Person 1)
date: 2026-10-23
author: krittaphat
ai: antigravity
tags: session, byok, ai, admin, bedrock, openai, anthropic, azure, person1
summary: Implemented Central Admin BYOK engine, multi-provider LLM gateway (Mock, OpenAI, Anthropic, Bedrock, Azure), 5-minute TTL caching, credential masking, test-connection endpoint, and System Admin AI Config UI.
---

## Goal

Implement the complete **Person 1 (BYOK & Cloud Lead)** architecture from the AWS migration and Role-Based AI Agents design:
- Central Admin BYOK Engine with credential masking, audit trail, and budget threshold guards.
- Multi-provider LLM Client supporting Mock (offline), OpenAI, Anthropic, AWS Bedrock, and Azure OpenAI.
- Provider factory with in-memory caching (5-minute TTL) and automatic `agent.enabled` kill-switch enforcement.
- System Admin AI Config UI tab at `/admin` (`?page=admin&tab=ai-config`) with live connection testing and kill-switch control.

## Done

1. **Test-Driven Development (TDD)**:
   - Authored unit test suite `backend/tests/ai.byok.test.ts` covering API key masking, provider constraints validation, mock provider connection testing, chat completion, kill switch enforcement, provider caching with TTL, and missing credential handling.
   - Verified initial RED and subsequent GREEN status (all 57 backend tests passing).

2. **Backend Multi-Provider Gateway (`backend/src/modules/ai/providers/`)**:
   - `types.ts`: Defined `ChatMessage`, `ToolDefinition`, `ToolCall`, `LLMResponse`, `ProviderConnectionResult`, and `ILLMProvider`.
   - `mock.provider.ts`: Implemented deterministic offline mock provider for zero-token cost local development.
   - `custom.provider.ts`: Implemented `CustomProvider` supporting custom base endpoints (e.g., vLLM, Ollama, OpenRouter, LiteLLM) and multiple path formats (`/chat/completions`, `/responses`, `/v1/chat/completions`, `/api/generate`, or arbitrary custom paths).
   - `openai.provider.ts`: Implemented OpenAI client using native Node.js `fetch` with latency measurement.
   - `anthropic.provider.ts`: Implemented Anthropic Messages API client with system prompt and tool mapping.
   - `bedrock.provider.ts` & `azure.provider.ts`: Implemented AWS Bedrock and Azure OpenAI adapters.
   - `factory.ts`: Implemented `LLMProviderFactory` with 5-minute TTL cache and kill-switch check (`agent.enabled`).

3. **Central BYOK Service & Endpoints (`backend/src/modules/ai/byok/`)**:
   - `byok.utils.ts`: Implemented `maskSecretKey` (e.g. `sk-...cdef`) and `maskCredentials`.
   - `byok.service.ts`: Implemented `getConfig()`, `updateConfig()`, and `testConnection()`. Updates are audited via `writeAudit()`.
   - `byok.routes.ts`: Exposed `GET /api/v1/admin/ai-config`, `PUT /api/v1/admin/ai-config`, and `POST /api/v1/admin/ai-config/test-connection` gated to `SYSTEM_ADMIN`. Mounted in `backend/src/app.ts`.

4. **Frontend System Admin Console (`frontend/src/roles/admin/`)**:
   - `adminApi.ts`: Added TypeScript interfaces and client API functions (`getAiConfig`, `updateAiConfig`, `testAiConnection`).
   - `AiConfigTab.tsx`: Built the System Admin BYOK Console with visual provider selection, model configuration, masked credential inputs, monthly safety budget gauge, live connection testing with round-trip latency display, and global kill-switch status with modal confirmation.
   - `AdminHeader.tsx` & `AdminPage.tsx`: Integrated the `ai-config` tab into the System Admin navigation.

## Decisions

- **Zero Heavy SDK Dependencies**: Built OpenAI and Anthropic HTTP clients using Node.js native `fetch`, eliminating large third-party client packages and security footprint.
- **Offline Mock Provider First**: Ensured that development can proceed without incurring API costs or requiring live cloud credentials.
- **Security & Privacy**: Credentials are never sent in plain text to the browser; `GET /admin/ai-config` returns masked keys (`sk-...tail`). Unmodified masked keys on save preserve existing credentials in the vault.

## Files Touched

- `backend/src/modules/ai/byok/byok.types.ts`
- `backend/src/modules/ai/byok/byok.utils.ts`
- `backend/src/modules/ai/byok/byok.service.ts`
- `backend/src/modules/ai/byok/byok.routes.ts`
- `backend/src/modules/ai/providers/types.ts`
- `backend/src/modules/ai/providers/mock.provider.ts`
- `backend/src/modules/ai/providers/openai.provider.ts`
- `backend/src/modules/ai/providers/anthropic.provider.ts`
- `backend/src/modules/ai/providers/bedrock.provider.ts`
- `backend/src/modules/ai/providers/azure.provider.ts`
- `backend/src/modules/ai/providers/factory.ts`
- `backend/src/app.ts`
- `backend/tests/ai.byok.test.ts`
- `frontend/src/services/adminApi.ts`
- `frontend/src/roles/admin/components/AdminHeader.tsx`
- `frontend/src/roles/admin/components/AiConfigTab.tsx`
- `frontend/src/roles/admin/pages/AdminPage.tsx`

## Errors Encountered

- Initial `withTransaction` import referenced `db/client.js` instead of `db/tx.js`; resolved.
- Property `primaryRole` on `AuthSessionUser` needed to check `user.role` / `user.allRoles`; resolved.
- `PUT /api/v1/admin/ai-config` save failed with 400 (PG 22P02 `invalid_text_representation`): `audit_log.entity_id` is a UUID column in PostgreSQL schema, while `CONFIG_KEY` ('agent.byok') was a text string. Changed `entityId: null` in `writeAudit`, identical to `config.service.ts`. Verified with live E2E test.

## Next Steps

- Person 2: Connect ReAct Agent loop and streaming chat drawer (`<DooRareChatDrawer />`) to `providerFactory.getProvider()`.
- Persons 3, 4, 5: Implement role-specific tools using the shared `ToolDefinition` schemas.
