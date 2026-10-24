---
title: ER plan agent AGT-F3-001 (plan narrative & staff questions) on the live ER flow
date: 2026-10-25
author: copte
ai: claude
tags: session, f3, er, agent, llm, byok, frontend, backend
summary: LLM assesses the F-27 rule plan per incident type (keep/remove/ask), banner + card like the prototype
---

## Goal
- ER plan step on live data should be proposed by our own LLM (BYOK) like the prototype (banner "Agent เสนอแผน", "Agent ประเมินเหตุการณ์" card, staff questions). Branch `feat/er-plan-agent` (from `feat/agents-f1-f3`).

## Done
- `backend/src/modules/incidents/plan.agent.ts`: F3_T1_PLAN_NARRATIVE. Input = incident type/description/counts + rule plan lines (`baselinePlan`, no location). Output per line KEEP / REMOVE / ASK + summary, highlights, confidence. Guardrails G-01, G-04, G-CRIT (no REMOVE when critical > 0), G-03 (numbers only from data). Background run + `agent_run` (input_hash = basis; `stale` when counts/type/rules change).
- Routes `GET|POST /incidents/{id}/plan/agent`; config `emergency.agent_timeout_s` (default 90); `askJson` gets `modelTier: 'fast'` and clears its timeout timer (test suite no longer waits 60 s).
- Frontend `roles/er/live/AgentPlanCard.tsx` (hook, card, banner) in `LiveIncidentFlow`: auto-asks on the plan step, applies the agent's removals once (restorable), questions remove / keep a line.
- Tests `plan.agent.test.ts` (no DB), `plan.agent.db.test.ts`.

## Decisions
- The LLM never computes quantities (spec §14.2 forbidden list): F-27 numbers stay; the agent only chooses among the code's lines. Rule plan includes every kit for every incident type, which is what the agent fixes.
- Runs in the background instead of the spec's 8 s blocking budget (free OpenRouter model needs ~35-45 s).

## Files touched
- backend: incidents/{plan.agent,plan.service (baselinePlan),incidents.config,incidents.routes}, ai/agents/askJson; tests plan.agent, plan.agent.db.
- frontend: services/incidentApi, roles/er/live/{AgentPlanCard,LiveIncidentFlow}.

## Errors encountered
- Free nemotron model: 45 s timeout, cut-off JSON at 1800 tokens, empty `question_th` on KEEP lines -> timeout 90 s, maxTokens 4000, only REMOVE/ASK lines in the answer, empty texts ignored.

## Next steps
- Agree with Alongkorn on F3_T2 (extras with quantities, not in spec) vs F3_T1; his F1 agent still calls the LLM inside a DB transaction.
- Optional: decision_log rows when staff answer questions; pharmacist console read-only card.
