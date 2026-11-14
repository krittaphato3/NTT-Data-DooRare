---
title: Central Admin BYOK - Google AI Studio API Key Preset
date: 2026-11-14
author: krittaphat
ai: antigravity
tags: session, byok, google-ai-studio, gemini, presets, admin, frontend, backend
summary: Added Google AI Studio (Gemini) 1-click Quick Preset into Central Admin BYOK with OpenAI compatibility endpoint, key masking, and model presets.
---

## Goal

Add a dedicated preset for Google AI Studio API Key (`AIzaSy...`) in the Central Admin BYOK (Bring Your Own Key) module, allowing hospital administrators to connect Google Gemini models seamlessly.

## Done

1. **Frontend Central BYOK Console (`frontend/src/roles/admin/components/AiConfigTab.tsx`)**:
   - Added `CUSTOM_PRESETS` toolbar featuring **Google AI Studio (Gemini)**, **OpenRouter**, **Ollama (Local)**, and **vLLM / LiteLLM Proxy**.
   - Configured Google AI Studio preset with 1-click configuration:
     - Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai`
     - Route Path: `/chat/completions` (OpenAI Compatibility)
     - Primary Model: `gemini-1.5-flash`
     - Fast Model: `gemini-1.5-flash`
   - Added official Google AI Studio models to `POPULAR_PRIMARY_MODELS` and `POPULAR_FAST_MODELS`:
     - `gemini-1.5-flash` (Recommended / < 3s High Speed)
     - `gemini-1.5-pro` (Deep Reasoning / High Intelligence)
     - `gemini-2.0-flash` (Fast Reasoning / < 2s Emergency)
   - Dynamic Google AI Studio credential detection: displays customized placeholder (`AIzaSy...`), direct link to Google AI Studio API key generator (`https://aistudio.google.com/app/apikey`), and compatibility confirmation badge.
   - Updated Central LLM Provider card 6 description to explicitly list Google AI Studio support.

2. **Backend Enhancements (`backend/src/modules/ai/byok/byok.service.ts` & `custom.provider.ts`)**:
   - Added environment variable fallback checks for `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and `GOOGLE_AI_STUDIO_API_KEY` in `ByokService.getDefaultConfig()`.
   - **Fixed Error Parsing for Google Generative Language API**: Google wraps OpenAI-compatible errors in a JSON array (`[{ error: { message: ... } }]`). Updated `CustomProvider.testConnection()` and `CustomProvider.chat()` to inspect array elements.
   - **Timeout Guard**: Added `AbortSignal.timeout(30000)` in `testConnection()` to prevent hanging for 50+ seconds when external providers queue requests.

3. **TDD Unit Testing (`backend/tests/ai.byok.test.ts`)**:
   - Added test verifying Google AI Studio OpenAI-compatible endpoint URL resolution (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`).
   - Added test confirming `maskSecretKey` correctly protects Google AI Studio keys (`AIza...tail`).
   - All 12 unit tests passing.

4. **Build & Docker Verification**:
   - Backend `tsc` passed with exit code 0.
   - Frontend `tsc --noEmit && vite build` passed with exit code 0.
   - Rebuilt and restarted `doorare-backend` and `doorare-frontend` Docker services.

## Decisions

- **Leveraged Google's Official OpenAI Compatibility Endpoint**: Rather than introducing an external Google GenAI SDK dependency, DooRare routes Google AI Studio calls through `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` with `Authorization: Bearer <API_KEY>`. This immediately supports existing SSE token streaming, Tool Calling / Function Calling, and latency measurement without altering backend engine architecture.
- **Dynamic Context**: When the Google AI Studio endpoint is active in the Custom provider tab, the UI adapts its labels, links, and placeholders specifically for Google AI Studio developers.

## Files Touched

- [AiConfigTab.tsx](file:///d:/Library/Project/NTT-Data-DooRare/frontend/src/roles/admin/components/AiConfigTab.tsx)
- [byok.service.ts](file:///d:/Library/Project/NTT-Data-DooRare/backend/src/modules/ai/byok/byok.service.ts)
- [ai.byok.test.ts](file:///d:/Library/Project/NTT-Data-DooRare/backend/tests/ai.byok.test.ts)
- [2026-11-14-1955-antigravity-byok-google-ai-studio-preset.md](file:///d:/Library/Project/NTT-Data-DooRare/ai-material/sessions/2026-11-14-1955-antigravity-byok-google-ai-studio-preset.md)

## Errors Encountered

None. Both unit tests and production builds succeeded cleanly on the first run.

## Next Steps

- Test live connection with a live Google AI Studio API key via Central Admin UI (`/admin?page=admin&tab=ai-config`).
