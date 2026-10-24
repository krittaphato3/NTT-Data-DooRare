---
title: F2 allocation agent, objections and F3 late answers (feature feedback)
date: 2026-10-24
author: copte
ai: claude
tags: decision, f2, allocation, agent, objection, f3, emergency, borrow
summary: Agent via BYOK with F-22 fallback; region objections until dispatch; late emergency confirms.
---

# F2 / F3 feedback rules

Decisions (user choices, 2026-10-24):

1. **Allocation agent (AGT-F2-001) calls the BYOK LLM.** Read tools `get_pool_entry` / `get_demand_candidates`, output F2_T1.
   Code checks G-01 / G-03 / G-04; invalid twice, LLM error or BYOK = MOCK → code F-22 greedy split (`FALLBACK`), kill switch → `SKIPPED`.
   Every run writes `agent_run` + `agent_tool_call`; human actions on agent plans write `decision_log`.
2. **Only the origin pharmacist** sends a lot to the agent or writes a plan by hand (`POST /allocation-plans`), lines capped by F-22.
3. **Objection by any other hospital of the region**, with a reason, while the plan is open **or approved but nothing dispatched**
   (all tasks WAITING_DISPATCH; network auto-approve made every demo plan skip approval). The objector joins `plan_approval`
   as REJECTED → NEEDS_DISCUSSION; approved plans have their tasks cancelled and the lot back to RELEASED_TO_POOL; the meeting
   ("เห็นชอบตามมติ") re-creates transport. Objectors cannot cancel the plan.
4. **F3 late answer.** A TIMED_OUT emergency leg can still be confirmed while the request (open or ESCALATED) lacks goods and the
   incident is ACTIVE; first confirmation still wins; no late REJECT; not counted as on-time in `reliability_stat`.
   Timeouts stay per spec (3 / 5 min).

Consequences:
- Remainder of a lot in transport (ALLOCATED) waits until that plan arrives (unchanged transport.workflow rule).
- Spec BR-F3-019/020 behaviour is extended, not replaced; revisit if the team wants strict silence = decline.
