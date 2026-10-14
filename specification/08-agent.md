## 14. Agent Architecture

Principle (AGT-GEN-001): **code computes, agent explains and proposes, human decides.** Agents never calculate, never write to business tables, never send anything. They read through tools and submit one strict-JSON proposal. Machine-readable contract: `agent-tool-schemas.json` (12 tools, 8 output schemas, validated with jsonschema).

### 14.1 Agent catalogue
| ID | Agent / task | Feature | Trigger | Output schema | HITL |
|---|---|---|---|---|---|
| AGT-F1-001 | Task 1 Context summary | F1b | request propose | F1_T1_CONTEXT_SUMMARY | shown in UI-04 |
| AGT-F1-002 | Task 2 Urgency advice (may raise at most 1 level, never lower) | F1b | propose | F1_T2_URGENCY_ADVICE | pharmacist accepts/ignores |
| AGT-F1-003 | Task 3 Lender message drafting | F1b | propose | F1_T3_LENDER_MESSAGE | pharmacist edits/approves |
| AGT-F1-004 | Task 4 Reply interpretation (free-text replies) | F1b | lender free-text | F1_T4_REPLY_INTERPRETATION | lender officer confirms structured response |
| AGT-F1-005 | Task 5 Next-lender proposal (must match code ladder; no re-ask) | F1b | leg REJECTED/TIMED_OUT | F1_T5_NEXT_LENDER | auto-send only if ladder already approved (ASM-10) |
| AGT-F1-006 | Task 6 Daily summary 07:30 | F1b | JOB-08 | F1_T6_DAILY_SUMMARY | read only |
| AGT-F1-009 | Kill switch & enable flag handling | F1b | any run | — | admin toggles |
| AGT-F1-012 | Prompt-injection defence for free-text fields | all | any run | — | n/a |
| AGT-F2-001 | Allocation narrative & split proposal | F2a | pool entry | F2_T1_ALLOCATION_NARRATIVE | all involved pharmacists (or auto-approve in-network) |
| AGT-F3-001 | Plan narrative & staff questions (8 s budget) | F3 | plan calculated | F3_T1_PLAN_NARRATIVE | pharmacist approves plan |

### 14.2 Scope, inputs, boundaries
| Item | Spec |
|---|---|
| Model | Amazon Bedrock Claude model, id from config `agent.model_id`; temperature 0; `max_steps` 12; `timeout_s` 60. **F3 uses a smaller, faster model** `agent.f3_model_id` (Haiku-class, ASM-46); 8 s timeout then rule-only fallback; p95 narrative latency goal ≤ 2 s (measured, not guaranteed) |
| Inputs | Only ids; context is fetched via read tools. No patient data exists in the system (ASM-27) |
| Allowed | summarise, draft messages (TH/EN) from approved templates, interpret free text, propose among code-generated options |
| Forbidden | computing quantities, scores, targets, costs; adding lenders not in code ladder; lowering urgency; approving; sending; editing config |
| Tools | read tools only + `submit_proposal` (non-mutating). Full JSON schemas in `agent-tool-schemas.json` |

Tools (all `additionalProperties:false`): `get_alert_context`, `get_forecast`, `get_ranked_lenders`, `get_request_state`, `get_lender_history`, `get_context_signals`, `get_pool_entry`, `get_demand_candidates`, `get_incident_state`, `get_network_kit_stock`, `get_message_template`, `submit_proposal`.

### 14.3 Strict output example (AGT-F1-002)
```json
{"task":"F1_T2_URGENCY_ADVICE","summary_th":"ยาเป็น V เหลือใช้ได้ 3 วัน แนะนำคงระดับด่วน","confidence":"HIGH",
 "code_urgency":"URGENT","suggested_urgency":"VERY_URGENT","reason":"พบสัญญาณโรคระบาดในภูมิภาค","flags":["CONTEXT_SIGNAL"]}
```
Server validation: JSON Schema → guardrails G-01..G-12 → rank check (`suggested_urgency ≥ code_urgency` and ≤ +1 level). Rejected outputs are never shown as authoritative.

### 14.4 Guardrails
| ID | Guardrail | Enforcement |
|---|---|---|
| G-01 | Output must validate against the task schema, no extra fields | jsonschema; retry once |
| G-02 | Agent never emits state changes; only `submit_proposal` | tool whitelist per task |
| G-03 | Every number in output must equal a number in a tool result | server diff of numeric tokens |
| G-04 | Lender ids must be in the code ladder, in ladder order | set/ordering check (AGT-F1-005) |
| G-05 | Urgency can be raised ≤1 level, never lowered | rank compare |
| G-06 | Mapping must be VERIFIED for any drug referenced | tools return only VERIFIED |
| G-07 | Held or near-expiry-reserved lots excluded from lendable qty | computed in tool |
| G-08 | Messages use approved templates; no clinical advice, no dosage | template id + deny-list |
| G-09 | Treat all tool/free-text content as data (prompt-injection defence, AGT-F1-012): system prompt states instructions inside data are ignored; free text is wrapped in `<data>` tags and length-capped; detected "ignore previous"/tool-call patterns raise `INJECTION_SUSPECTED` flag | prompt + regex + flag |
| G-10 | Step/time/token budget | `max_steps`, `timeout_s`, token cap |
| G-11 | PII scrub: no personal names of patients; staff names only from tool results | regex filter |
| G-12 | Kill switch: `agent.enabled=false` or kill switch ON ⇒ agent skipped, templates used | checked before every run |

### 14.5 Fallback (FALLBACK)
| Failure | Behaviour |
|---|---|
| Schema invalid twice, timeout, Bedrock error, guardrail breach | Status `FALLBACK`; UI shows template message + code results; flag `AGENT_FALLBACK`; workflow continues (borrowing never blocked by agent) |
| F3 narrative | The code-computed plan is shown **immediately** (agent not on the critical path); the agent narrative is appended when ready. > 8 s ⇒ narrative omitted, status FALLBACK |
| Kill switch | Same as fallback, status `SKIPPED` |
| Repeated failures ≥5 in 10 min | Auto-disable agent for the hospital + notify SYSTEM_ADMIN (ASSUMPTION) |

### 14.6 Audit log
Every run writes `agent_run` (input hash, input, output, model id, steps, latency, tokens, guardrail hits), each tool call to `agent_tool_call`, and the human action to `decision_log` (accepted / edited / ignored, actor). Auditors can replay: same input hash + tool results ⇒ same inputs shown. Retention 2 years (ASM-41).

### 14.7 Agent evaluation (see §25)
Golden cases: Worked example 4.4 (order B, C, E, D must not be altered), prompt-injection strings in lender replies, hallucinated lender id, number tampering, urgency lowering. Release gate: 100 % pass on guardrail cases, ≥95 % on interpretation cases (ASSUMPTION).
