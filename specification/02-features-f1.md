---

## 7. Feature Specifications

Conventions for this section: each feature lists the 20 mandated items 7.1–7.20. Business-rule IDs (`BR-…`) are defined in §8, formulas (`F-nn`) in §9, flows (`FL-nn`) in §10, state machines (`SM-n`) in §11, tables in §12, endpoints in §13, agent items in §14, screens (`UI-nn`) in §15, jobs (`JOB-nn`) in §17, config keys (`CFG-…`) in §23.

Feature index:

| Code | Feature | Source |
|---|---|---|
| F1a | Stock Forecast & Alerts | F1 §2, §3, §11 |
| F1b | Borrow Orchestration (Agent-assisted) | F1 §4–§9, §10.2, §10.3 |
| XC-1 | Transfer/Return Documents & Return Tracking | F1 §10.1, F2 §2.7, F3 §7 |
| XC-2 | Manual Request | F1 §10.3, F2 §7 |
| XC-3 | Context Agent | F1 §10.2 |
| XC-4 | Value Dashboard & Metrics | F1 §11 |
| F2a | Near-Expiry Release & Allocation (incl. auto-approve, transport tracking) | F2 §1–§2, §4, §5 |
| F2b | Repeated-Expiry Detection | F2 §3 |
| F3 | Emergency Preparedness | F3 §1–§9 |
| F4 (sub-feature of F2) | Drug Code Normalization | F2 §6 |

---

### 7.A Feature F1a — Stock Forecast & Alerts (ระบบทำนายสต็อก)

**7.1 Feature Overview.** Uses usage history to forecast the quantity each hospital needs per **week** and per **month**, derives a *Total Target* by drug importance (VED), compares with real stock, and raises alerts. Forecasting is two steps per item: (1) pattern and price select the **method**; (2) VED selects the **buffer level**. Classification is per item, not per disease group (a diabetes drug may be V).

**7.2 Business Objective.** Detect shortage risk early enough to buy or borrow; avoid over-holding; give pharmacists a prioritised queue (V-A first).

**7.3 Actors.** Scheduler (system), PHARMACIST, PROCUREMENT_OFFICER (receives order-ahead notices), DATA_ADMIN (item overrides), HOSPITAL_ADMIN.

**7.4 Preconditions.**
- Drug exists in `drug_master` with a **Verified** local mapping (F4) for the hospital.
- ≥ 90 days of usage history for per-item models; otherwise cold-start path (ASM-08). ≥ 6 months for MA/ES; ≥ 12 months recommended to capture seasonality.
- VED class set for the item (default E, ASM-36); unit price known; standard lead time known.
- Usage feed fresh (last record ≤ 7 days old, ASM-37), else forecast status `STALE`.

**7.5 Inputs.** Daily usage (`usage_history`), lots/stock (`inventory_lot`), unit price, VED/ABC class (`hospital_drug_profile`), open POs, standard lead time, holiday/season calendar, context signals (optional features), config thresholds.

**7.6 Outputs.** `forecast_result` rows (per hospital × drug × granularity × period): method, P50 (Predict), P90, P95, Total Target, residual stats, model version; `stock_alert` rows; `forecast_metric` rows (pinball loss, coverage, stock-out/overstock); notifications; Agent trigger events (weekly alerts only).

**7.7 Main Process Flow** (see FL-01, FL-02)
1. `JOB-02` loads the last 12–24 months of daily usage, aggregates to weekly and monthly series.
2. For each item compute pattern features (CV, active-day ratio, history length, seasonality flag, unit price tier).
3. Router picks the method (BR-F1a-003…007; ASM-09, ASM-33).
4. Run the method; produce P50/P90/P95. MA/ES: residual quantiles from rolling backtest. Quantile: model outputs directly. Min-Max: min/max settings only.
5. Total Target = Predict + buffer (V: P95, E: P90; D: none).
6. `JOB-03` evaluates stock (usable lots) against targets and opens/updates/closes alerts (BR-F1a-013…017).
7. Alerts ordered V before E before D, then ABC value descending (V-A first).
8. Weekly alerts with stock < Predict for V/E trigger F1b; monthly alerts notify with "order earlier" advice (+ propose escalating to week level).

**7.8 Alternative Flows.**
- A1 Pharmacist forces re-forecast of one item (rate limit 3 per item per day).
- A2 New item (< 90 days): quantile cold-start path (flag `LOW_CONFIDENCE`).
- A3 Item has `method_override`: honour override (audit event).
- A4 Item VED = D: only Min-Max/notification path, never F1b.
- A5 Month alert and no order can arrive in time (lead time > days of stock): notify officer to consider regional warehouse draw or escalate as a week-level request (BR-F1a-017).

**7.9 Exception/Error Flows.**
- E1 Usage feed stale ⇒ item `STALE`, alerts suppressed, banner "usage data not updated since <date>".
- E2 Model training/prediction error ⇒ fallback to MA with last 8 weeks (`method_used = MA_FALLBACK`), alert to DATA_ADMIN.
- E3 Not enough residuals ⇒ normal approximation (ASM-07), flag `RESIDUAL_FALLBACK`.
- E4 Quantile crossing (P50 > P90…) ⇒ sort quantiles ascending, log.
- E5 Negative or absurd usage values ⇒ quarantine row in `ingestion_batch.errors`, exclude from series.

**7.10 Business Rules.** BR-F1a-001 … BR-F1a-023.

**7.11 Calculation Rules.** F-01 pattern metrics, F-02 method routing, F-03 MA/ES forecast, F-04 residual quantile, F-05 quantile model, F-06 Total Target, F-07 ABC value & class, F-24 forecast evaluation metrics.

**7.12 Approval Rules.** None for forecasting itself. Method/VED overrides require PHARMACIST (VED) or DATA_ADMIN (method) with reason; logged.

**7.13 Agent Involvement.** None in forecasting (deterministic). The Context Agent (XC-3) may supply optional features/flags. F1b Agent starts only after a weekly alert.

**7.14 UI Screens.** UI-01 Dashboard, UI-02 Stock Alert Queue, UI-03 Forecast Detail, UI-17 Configuration.

**7.15 API Requirements.** `GET /forecasts`, `GET /forecasts/{id}`, `POST /forecasts/rerun` (single item), `GET /stock-alerts`, `PATCH /stock-alerts/{id}` (acknowledge/dismiss with reason), `GET /hospital-drug-profiles`, `PATCH /hospital-drug-profiles/{id}` (VED/method override), `POST /usage-history:ingest`.

**7.16 Database Entities Used.** `usage_history`, `inventory_lot`, `stock_balance`, `hospital_drug_profile`, `forecast_run`, `forecast_result`, `forecast_metric`, `stock_alert`, `open_purchase_order`, `app_config`, `ingestion_batch`.

**7.17 Notifications.** "Stock below Total Target — order ahead" (PROCUREMENT_OFFICER + PHARMACIST), "Stock below Predict — month: order earlier", "Alert escalated to agent", "Data stale", "Forecast fallback used".

**7.18 Documents/Reports.** Forecast accuracy report (coverage, pinball loss, stock-out/overstock) per hospital and global; daily summary section.

**7.19 Edge Cases.**

| # | Case | Required behaviour |
|---|---|---|
| 1 | Item with all-zero history | `INSUFFICIENT_DATA`; no forecast; no alert; listed in data-quality report |
| 2 | Discontinued item (`active = N`) | Excluded from forecasts and alerts |
| 3 | Outlier day (e.g., ward stock transfer posted as usage) | MA/ES: winsorise at P99 of the item's daily series (config); Quantile: unchanged. Flag shown on Forecast Detail |
| 4 | Missing days in feed | Hospital reported zero ⇒ 0; no record at all ⇒ NaN, interpolate ≤ 14 days, else item `STALE` |
| 5 | Mid-period price change | ABC recomputed monthly with latest price; history in quantity, not value |
| 6 | Lots with null expiry | Counted in stock but flagged; excluded from F2; DATA_ADMIN task created |
| 7 | Stock negative after ledger | Clamp to 0 for alerts, create data-quality incident |
| 8 | Seasonal item with 6–11 months history | MA/ES without seasonality + notice "seasonality not yet observable" |
| 9 | Item has pending PO arriving in time | Alert still created (info); F1b Agent will choose "wait for PO" |
| 10 | VED changed mid-week | Takes effect in next evaluation; audit |
| 11 | Holiday week (Songkran, New Year) | Holiday feature in quantile model; MA/ES shows banner |
| 12 | Same drug at two local codes | Aggregated by canonical `drug_id` via mapping (units normalised) |

**7.20 Acceptance Criteria** — see §29 AC-F1a-01…AC-F1a-06.

**Functional requirements**

| ID | Requirement |
|---|---|
| FR-F1a-001 | The system shall ingest daily usage per hospital × drug idempotently (upsert by hospital, drug, date). |
| FR-F1a-002 | The system shall reject/quarantine usage rows with negative quantity, future date, unmapped drug or missing hospital. |
| FR-F1a-003 | The system shall compute pattern features (CV, active-day ratio, history days, seasonality flag) per item per run. |
| FR-F1a-004 | The system shall select the forecast method per item with the precedence in F-02 and store `method_used` and `method_reason`. |
| FR-F1a-005 | The system shall forecast weekly (horizon ≥ 4 weeks) and monthly (horizon ≥ 3 months) and store P50/P90/P95 for each period. |
| FR-F1a-006 | The system shall compute Total Target as P95 for V, P90 for E, none for D. |
| FR-F1a-007 | For MA/ES the system shall derive residual quantiles from the weekly rolling backtest (ASM-07). |
| FR-F1a-008 | The system shall compare usable stock with Predict and Total Target and open/update/close alerts per BR-F1a-013…017 with at most one open alert per hospital × drug × granularity. |
| FR-F1a-009 | The alert queue shall be ordered V → E → D, then by ABC value descending; V-A first. |
| FR-F1a-010 | D items shall only trigger Min-Max/notification alerts and never an agent run. |
| FR-F1a-011 | The system shall compute and store pinball loss, P90/P95 coverage, stock-out rate, overstock rate and value impact per run (F-24). |
| FR-F1a-012 | Authorised users shall rerun a single item's forecast (≤ 3/day/item). |
| FR-F1a-013 | The system shall mark forecasts `STALE` when no usage was received for ≥ 7 days and suppress their alerts. |
| FR-F1a-014 | PHARMACIST shall be able to set VED per item; DATA_ADMIN shall be able to override method with a reason; both audited. |
| FR-F1a-015 | The system shall recompute ABC monthly (F-07) and show class per item. |
| FR-F1a-016 | The Forecast Detail screen shall show history, P50/P90/P95 bands, method, reason, residual stats and last model version. |

---

### 7.B Feature F1b — Borrow Orchestration with Agent (การจัดหาอัตโนมัติ)

**7.1 Feature Overview.** When a V/E drug is below Predict at week level, the code calculates how much to borrow and from whom (Hard Filter + Si ranking), the Agent assesses and proposes a plan, a pharmacist approves/adjusts/rejects, requests go to lender hospitals whose staff confirm before shipping, and the loop continues by round until the stop rule is met or the ladder is exhausted. The Agent reasons; **code calculates; humans approve**.

**7.2 Business Objective.** Convert a shortage signal into confirmed supply in hours with minimal staff effort and full traceability.

**7.3 Actors.** PHARMACIST (requester approver), lender hospital's PHARMACIST (confirm), PROCUREMENT_OFFICER (draft/manual, PO decisions), WAREHOUSE_OFFICER (load/receive), Agent, Context Agent, Scheduler.

**7.4 Preconditions.**
- Weekly alert for item with VED ∈ {V, E}, stock < Predict, item not controlled, mapping Verified at requester and candidate lenders.
- Agent enabled (global and hospital kill switch off) — otherwise rule-based draft is produced.
- Distance matrix has pairs for candidate lenders; lenders have `agent_participation = true`.

**7.5 Inputs.** Alert, forecasts (P50 week/month, σ), stock, incoming (confirmed legs), open PO + ETA, standard lead time, lender stock/Total Target/usage, distance matrix, request history, cold-chain flag, context signals, config.

**7.6 Outputs.** `borrow_request` + `borrow_request_item` + `borrow_leg` + `borrow_response`; `agent_run` log; documents (XC-1); return obligations; notifications; daily summary.

**7.7 Main Process Flow** (FL-03…FL-09, SM-1)
1. **Trigger.** Weekly alert (V/E, stock < Predict) or manual request.
2. **Code computes** `u`, `L`, `σ`, `need`, `borrow_qty` (F-08…F-10), days-to-stock-out and **urgency** (F-11).
3. **Channel decision** (Agent proposes, rules validate): wait for PO if it arrives before stock-out → draw from regional warehouse if stock data exists → otherwise borrow.
4. **Lender candidates**: Hard Filter (F-12, F-13), then Si (F-14…F-18) ranking; each candidate's shareable quantity = LendableStock.
5. **Agent plan** (AGT-F1-001…): adjusts urgency +1 (with reason; Context Agent signals), chooses single vs multiple lenders, quantities per lender (≤ lendable, total ≤ borrow_qty), parallel (≤ 3, only very urgent) vs sequential; outputs JSON validated by the Guardrail Engine; on failure → rule-based fallback (rank by Si, split by lendable).
6. **Pharmacist review**: approve / adjust quantity (ASM-11) / reject. Approval freezes the **ladder** (ASM-10). Status `PENDING_APPROVAL → APPROVED`.
7. **Send round 1**: legs in `SENT`; timeouts and reminders scheduled (F-19).
8. **Lender response**: lender pharmacist confirms **before shipping**: full/partial quantity, ship ETA, note. A partial like "30, ships tomorrow morning" is recorded with structured fields; the Agent reads the note as data.
9. **Stop rules** after each response: V → stop when total confirmed ≥ 90 % of the *first-round* required quantity; E → stop when confirmed ≥ 100 % of normal-use quantity (excl. buffer); recompute with confirmed counted as incoming (F-08). Otherwise next round asks the next hospital on the ladder **without re-asking those that rejected or timed out**.
10. **Completion** (stop rule met): cancel unsent/unanswered legs, generate borrow/return document (XC-1), lender loads goods (`LOADED` → lender stock out), transport tracking, borrower confirms receipt (stock in), return obligation tracking.
11. **Exhaustion/escalation**: ladder used up with no supply, all reject, or little time left ⇒ escalate to staff with options (urgent purchase, regional warehouse draw, alternative drug) — `ESCALATED`.
12. **Daily summary** to pharmacists: which drugs at risk, pending requests, decisions needed.

**7.8 Alternative Flows.**
- A1 Single-lender can cover everything ⇒ one leg (even if multiple pass the filter).
- A2 Very urgent ⇒ up to 3 legs in parallel in the same round; confirmed totals may exceed need ⇒ system trims later confirmations (lender notified) or accepts over-supply only if lender and pharmacist agree.
- A3 Lender confirms a ship ETA later than `Window_max` ⇒ flagged `LATE_FOR_WINDOW`; Agent proposes additional leg from another hospital.
- A4 Pharmacist rejects plan ⇒ request `REJECTED` with reason; alert stays open; Agent will not re-propose for 24 h unless urgency rises.
- A5 Manual request (XC-2) ⇒ same approval, timeout and documents.
- A6 Context signal (e.g., many hospitals in the area raising the same drug) raises urgency by one level (Agent, with reason).
- A7 Month-level alert escalated to week-level by officer ⇒ treated as weekly alert.
- A8 Agent disabled ⇒ rule-based fallback plan created with `decision_source = FALLBACK`/`RULES_ONLY`.
- A9 Borrower cancellation ⇒ allowed in `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `IN_PROGRESS`, and `ESCALATED` (provided no leg is `LOADED`, `IN_TRANSIT`, or `RECEIVED`). Unsent/pending legs cancelled, accepted lot holds released, lender notified, request moves to `CANCELLED`. Requests in `PARTIALLY_FULFILLED` cannot be cancelled.

**7.9 Exception/Error Flows.**
- E1 Agent timeout/invalid JSON/guardrail violation ⇒ fallback plan; `decision_source = FALLBACK`; logged.
- E2 No candidate passes Hard Filter ⇒ escalate immediately with reasons per excluded hospital.
- E3 `borrow_qty ≤ 0` ⇒ no request; alert shows "covered by incoming".
- E4 Lender confirms more than its current usable stock ⇒ blocked (validation).
- E5 Lender confirms after timeout ⇒ response stored as `LATE`; pharmacist may accept it manually if request still open.
- E6 Concurrent approvals by two pharmacists ⇒ optimistic lock (`version`) returns 409.
- E7 Lender's stock changed since planning (below Total Target) ⇒ lender sees warning; lender decides (final authority).
- E8 Remaining stock time < smallest timeout ⇒ effective timeout = remaining time (F-19); if < 15 min, auto-escalate.
- E9 Requester dispatches stock to others after approval ⇒ plan flagged `STALE_INPUTS`, recompute before sending next round.
- E10 Mapping deprecated mid-process ⇒ request blocked, pharmacist notified.

**7.10 Business Rules.** BR-F1b-001 … BR-F1b-040.

**7.11 Calculation Rules.** F-08 daily usage, F-09 required-until-arrival and borrow quantity, F-10 Window_max, F-11 urgency, F-12 Hard Filter, F-13 LendableStock, F-14…F-18 Si and components, F-19 timeout/reminder, F-20 stop rules, F-21 round allocation.

**7.12 Approval Rules.** A1 plan approval (PHARMACIST requester); A2 lender confirmation (PHARMACIST lender); override rules ASM-11; plan locked after approval; later rounds within ladder need no new approval (ASM-10); changes outside ladder ⇒ new approval; all by audited action.

**7.13 Agent Involvement.** Tasks 1–6 per source §4.1: assess need; adjust urgency (+1); choose single/multiple lender; read response and plan next round; escalate; daily summary. Tools, schema, guardrails, fallback in §14.

**7.14 UI Screens.** UI-02, UI-04, UI-05, UI-06, UI-10, UI-14, UI-15, UI-01.

**7.15 API Requirements.** `POST /borrow-requests` (manual), `GET /borrow-requests`, `GET /borrow-requests/{id}`, `POST /borrow-requests/{id}/approve|reject|cancel`, `PATCH /borrow-requests/{id}/items/{itemId}` (adjust), `POST /borrow-legs/{id}/respond`, `POST /borrow-requests/{id}/escalate`, `GET /agent/runs`, `POST /agent/kill-switch`, `GET /lender-candidates?requestItemId=` (Hard Filter + Si preview).

**7.16 Database Entities Used.** `stock_alert`, `forecast_result`, `borrow_request`, `borrow_request_item`, `borrow_leg`, `borrow_response`, `return_obligation`, `agent_run`, `agent_tool_call`, `distance_matrix`, `open_purchase_order`, `regional_warehouse_stock`, `inventory_lot`, `inventory_transaction`, `transfer_document`, `transport_record`, `context_signal`, `notification`, `audit_log`.

**7.17 Notifications.** Approval needed (V-A first); lender: "request received" and reminders at 50 %; requester: response received, partial, timeout, completed, escalation; delivery status changes; daily summary; kill-switch changes.

**7.18 Documents/Reports.** Borrow/return document at lender confirmation; daily summary; per-request decision log.

**7.19 Edge Cases.**

| # | Case | Required behaviour |
|---|---|---|
| 1 | V drug, stock 0, lead time 14 d | Window_max = 0 ⇒ Hard Filter excludes everyone unless Ttransit = 0; escalate with "stock already out" and offer urgent options |
| 2 | Lender is also in alert | LendableStock = max(0, …) = 0 ⇒ excluded |
| 3 | Same lender appears in two requests | Reservation on confirm; second confirmation recomputes lendable |
| 4 | Lender confirms 0 | Treated as rejection, recorded `REJECTED` |
| 5 | Rounding | Quantities ceil to base units (ASM-04) and ≤ lendable |
| 6 | σ missing (< 28 days) | Use pooled σ for VED class, flag `LOW_CONFIDENCE` |
| 7 | Over-supply in parallel round | Trim in confirmation order; notify surplus lenders to release holds |
| 8 | Cold-chain drug | Only lenders with cold-chain capability and `Ttransit ≤ box_validity_hours` |
| 9 | Controlled drug | No automation; manual template; Agent not invoked |
| 10 | Requester becomes lender mid-process | Not allowed: a hospital with an open borrow for a drug is excluded as lender for that drug |
| 11 | Duplicate send (retry) | Idempotency key on `POST …/approve` and send worker; legs unique `(request_item_id, lender_hospital_id, round_no)` |
| 12 | All three parallel lenders reject | Next round; counts toward ladder exhaustion |

**7.20 Acceptance Criteria** — §29 AC-F1b-01…AC-F1b-10.

**Functional requirements**

| ID | Requirement |
|---|---|
| FR-F1b-001 | On a weekly alert for V/E with stock < Predict the system shall compute `u`, `L`, `σ`, required-until-arrival and borrow quantity by code (F-08, F-09). |
| FR-F1b-002 | The system shall derive urgency from days-to-stock-out and VED (F-11) before the Agent runs. |
| FR-F1b-003 | The system shall exclude lenders that fail Hard Filter (F-12, F-13, cold-chain, controlled-drug, lot-expiry rules) and rank the rest by Si. |
| FR-F1b-004 | The Agent shall output a plan that validates against `agent_plan.schema` and passes all guardrails, otherwise the rule-based fallback shall be used. |
| FR-F1b-005 | Requests shall be sent only after approval by an authorised pharmacist of the requesting hospital. |
| FR-F1b-006 | Approvers shall be able to approve, adjust quantities (ASM-11) or reject with a mandatory reason on reject/adjust-up. |
| FR-F1b-007 | Very-urgent plans may send ≤ 3 legs in parallel; all other urgency levels send one leg at a time. |
| FR-F1b-008 | Lender staff shall confirm quantity (full/partial/reject), ship ETA and note before any goods are shipped. |
| FR-F1b-009 | The system shall apply the V 90 % and E 100 % stop rules recalculating with confirmed quantities as incoming. |
| FR-F1b-010 | Timeouts shall follow F-19; a reminder shall be sent at 50 % of the effective timeout; silence shall be treated as rejection and the next ladder hospital asked without re-asking. |
| FR-F1b-011 | When the ladder is exhausted, all reject, or time is nearly out, the system shall escalate to staff with purchasing/warehouse/alternative-drug options. |
| FR-F1b-012 | The kill switch (global and per hospital) shall switch the system to rule-based plans and manual requests without redeploy. |
| FR-F1b-013 | Every agent decision, tool call, rule check, approval and outcome shall be logged (§14.7). |
| FR-F1b-014 | The system shall send a daily summary of at-risk drugs, pending requests and required decisions to pharmacists. |
| FR-F1b-015 | The system shall update stock ledgers only on officer confirmations (`LOADED`, receipt) per ASM-13. |
| FR-F1b-016 | Borrow/return document and return obligation shall be generated at lender confirmation (XC-1). |
| FR-F1b-017 | The system shall prevent the same hospital from being both borrower and lender for the same drug concurrently. |
