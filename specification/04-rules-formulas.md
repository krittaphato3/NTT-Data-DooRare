
---

## 8. Detailed Business Rules

Column "Cfg" = configurable. "Default" refers to the key in §23 (`config-defaults.yaml`). "Source" = section of the source document (F1 §x, F2 §x, F3 §x); `ASM` = filled gap; `(ข้อเสนอ)` = proposal in the source treated as configurable.

### 8.1 F1a — Forecast & Alerts

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-F1a-001 | Forecast has two independent steps: method by pattern/price (step 1), buffer by VED (step 2) | Forecast run | per item | Select method then compute buffer; never couple them | No | – | F1 §2 |
| BR-F1a-002 | VED/pattern are classified **per item**, not per disease group | Classification | – | Store on `hospital_drug_profile` | No | – | F1 §2 |
| BR-F1a-003 | Steady use (e.g., hypertension, diabetes, lipid drugs) → Moving Average / Exponential Smoothing from ≥ 6 months of usage (12 months reveals seasonality); output P50 and quantiles from residuals of weekly rolling backtest | Router chose MA_ES | history ≥ 6 months | Run F-03/F-04 | Partly | `forecast.min_history_months_maes: 6` | F1 §2.1 |
| BR-F1a-004 | Seasonal/outbreak-driven, expensive, or rarely used items (vaccines, seasonal drugs, expensive drugs, antivenom) → Quantile forecasting; P50 and quantiles directly from model | Router chose QUANTILE | – | Run F-05 | Partly | `forecast.price_high_thb: 1000` | F1 §2.1 |
| BR-F1a-005 | Items that need no forecast, are cheap, may run out, and may be overstocked (plaster, cotton, alcohol, cheap vitamins) → simple Min-Max set in the cut-off-stock system (e.g., below 10 boxes order up to 50); **not** sent to Agent borrowing | Router chose MIN_MAX | VED = D and price ≤ low (ASM-09, ASM-33) | Store min/max; alert on min | Yes | `forecast.price_low_thb: 50` | F1 §2.1 |
| BR-F1a-006 (ข้อเสนอ) | Pattern criteria: CV (std/mean) > 0.5 ⇒ volatile; share of days with usage ≤ 30 % ⇒ intermittent ("used rarely"); thresholds set from real data | Pattern evaluation | see F-01 | Mark pattern | Yes | `forecast.cv_threshold: 0.5`, `forecast.active_day_ratio_threshold: 0.30` | F1 §2.1 (Q-01) |
| BR-F1a-007 (ข้อเสนอ) | Items with < 3 months of history (e.g., new drugs) default to Quantile because it is more cautious | history < 90 days | – | Use pooled quantile model, flag LOW_CONFIDENCE | Yes | `forecast.min_history_days_cold_start: 90` | F1 §2.1, ASM-08 |
| BR-F1a-008 | VED = V: Total Target = P95 (Z = 1.65) | Total Target calc | ved = V | TT = P95 | Yes | `ved.quantile.V: 0.95`, `ved.z.V: 1.65` | F1 §2.2 |
| BR-F1a-009 | VED = E: Total Target = P90 (Z = 1.28) | Total Target calc | ved = E | TT = P90 | Yes | `ved.quantile.E: 0.90`, `ved.z.E: 1.28` | F1 §2.2 |
| BR-F1a-010 | VED = D: no buffer; notification only; **never enters the Agent borrowing process regardless of forecasting method** | Alert eval | ved = D | Notify only | No | – | F1 §2.2 |
| BR-F1a-011 | ABC (value = usage × unit price) is used **only** to order checks/alerts: V first, then by value high→low (V-A first); buffer level is set only by VED | Queue build | – | Sort | Partly | `abc.cutoff_a: 0.70`, `abc.cutoff_b: 0.90` | F1 §2.3, ASM-35 |
| BR-F1a-012 | Predict = P50; Total Target = Predict + buffer (V uses P95, E uses P90) | Forecast | – | Store both | No | – | F1 §3 |
| BR-F1a-013 | Stock ≥ Total Target ⇒ no action | Alert eval | stock ≥ TT | Close open alert | No | – | F1 §3 |
| BR-F1a-014 | Predict ≤ stock < Total Target ⇒ notify hospital to prepare ordering in advance | Alert eval | – | Open `ORDER_AHEAD` alert | No | – | F1 §3 |
| BR-F1a-015 | stock < Predict ⇒ **Week**: send to Agent to consider procurement/borrowing; **Month**: notify and recommend placing the next order cycle sooner | Alert eval | stock < Predict | Week: `AGENT_TRIGGER`; Month: `ORDER_EARLIER` | No | – | F1 §3 |
| BR-F1a-016 | Available channels by timeframe: Month = government purchase/procurement (lead time weeks–months); Week = draw from regional/central warehouse, and if none, consider borrowing from hospitals | Agent run | – | Channel order per BR-F1b-002 | No | – | F1 §3 |
| BR-F1a-017 (ข้อเสนอ) | If a Month alert cannot be satisfied by ordering in time, notify the officer to consider drawing from the regional warehouse or raising it as a Week-level request | Month alert | lead time > days of stock | Notify + "escalate to week" action | Yes | – | F1 §3 |
| BR-F1a-018 | The buffer has two uses: (1) Total Target (P95/P90) sets the weekly/monthly level and the lender's keep-level; (2) the quantity to borrow uses Safety Stock `Z×σ×√L` (Z: V 1.65, E 1.28) **only for REGULAR demand**; for INTERMITTENT demand the borrow quantity uses the quantile-model buffer directly (V P95, E P90) | Calc | demand_pattern | F-09 A or B | No | – | F1 §3, owner review |
| BR-F1a-019 | Stock counts only lots still usable (not expired, not held; lender side also excludes lots under 6 months for lending) | Stock calc | – | Sum usable lots | Partly | `borrow.lot_min_remaining_days: 180` | F1 §5, §6.1 |
| BR-F1a-020 | Min-Max items: below `min` raise `MIN_MAX` alert; order-up-to `max`; never an agent run | Alert eval | method = MIN_MAX | Notify | Yes | per item | F1 §2.1 |
| BR-F1a-021 | Stale usage data suppresses forecasts/alerts | Daily | no usage ≥ 7 days | Mark STALE, banner | Yes | `forecast.stale_days: 7` | ASM-37 |
| BR-F1a-022 | Residual quantiles come from a **weekly** rolling backtest | Training | – | F-04 | Yes | `forecast.min_residuals: 26` | F1 §2.1, ASM-07 |
| BR-F1a-023 | Quality targets: P90/P95 coverage should be close to 90 %/95 % in reality | Evaluation | – | Report and alert when |coverage − τ| > 0.05 for 4 consecutive weeks | Yes | `forecast.coverage_tolerance: 0.05` | F1 §11 |
| BR-F1a-024 | Blood products (`drug_master.is_blood_product`) are excluded from forecasting, thresholds and auto-procurement | Nightly run | – | Skip item | No | – | ASM-47 |

### 8.2 F1b — Borrow Orchestration & Agent

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-F1b-001 | Only V and E items enter the Agent flow; D items never | Alert | ved ∈ {V,E} | Create agent run | No | – | F1 §2.2 |
| BR-F1b-002 | Channel order the Agent considers: wait for open PO (if in time) → draw from regional warehouse → borrow from hospitals | Agent task 1 | – | Choose channel with reason | Partly | – | F1 §4.1-1 |
| BR-F1b-003 | Required until new lot arrives = `u × L + SafetyStock(L)` for REGULAR demand, or `Q_q(L)` (P95/P90 quantile over lead time) for INTERMITTENT demand; borrow = required − stock − incoming | Calc | demand_pattern | F-08/F-09 | No | – | F1 §5, owner review |
| BR-F1b-004 | Result ≤ 0 ⇒ no borrowing needed | Calc | borrow ≤ 0 | Close agent run as `NO_NEED` | No | – | F1 §5 |
| BR-F1b-005 | L = days until the new lot arrives: open PO ETA; if none, standard lead time of the drug | Calc | – | F-08 | No | – | F1 §5 |
| BR-F1b-006 | Daily use = P50_week ÷ 7; if L > 7 days use P50_month ÷ 30 | Calc | – | F-08 | No | – | F1 §5 |
| BR-F1b-007 | Daily use must use P50 only, to avoid double counting the buffer | Calc | – | Use P50 | No | – | F1 §5 |
| BR-F1b-008 (ข้อเสนอ) | Urgency from days-to-stock-out and VED: V: ≤ 2 d very urgent, 3–7 d urgent, > 7 d normal; E: ≤ 2 d urgent, otherwise normal | Alert | – | F-11 | Yes | `borrow.urgency.*` | F1 §8 |
| BR-F1b-009 | Agent may raise urgency by one level (e.g., many hospitals in the area increasing simultaneously) with a stated reason; cannot lower | Agent task 2 | context signals | Set `urgency_final` | Yes | `agent.urgency_raise_max: 1` | F1 §4.1-2 |
| BR-F1b-010 | Hard Filter 1: `Ttransit ≤ Window_max` where Window_max = stock ÷ daily use; Ttransit from the pre-stored distance table (excludes picking/packing time) | Candidate build | – | Exclude failing hospital | No | – | F1 §6.1 |
| BR-F1b-011 | Hard Filter 2: `LendableStock = max(0, CurrentStock − TotalTarget) > 0` | Candidate build | – | Exclude | No | – | F1 §6.1 |
| BR-F1b-012 (ข้อเสนอ) | Temperature-controlled drugs: lender must have cold-chain equipment and Ttransit ≤ box validity | Candidate build | drug.cold_chain | Exclude | Yes | `coldchain.default_box_hours: 6` (ASM, unverified) | F1 §6.1 |
| BR-F1b-013 (ข้อเสนอ) | Lend only lots with remaining shelf life > 6 months; LendableStock computed from those lots; lots closer to expiry go through F2 | Candidate build | – | Filter lots | Yes | `borrow.lot_min_remaining_days: 180` | F1 §6.1 |
| BR-F1b-014 (ข้อเสนอ) | Specially controlled drugs (narcotics/psychotropics) never enter the automatic process; regulated manual flow only | Candidate/Agent | drug.controlled | Block automation | Yes | flag per drug | F1 §6.1 |
| BR-F1b-015 | Hospital score Si = w1·ScoreTime + w2·ScoreFulfill + w3·ScoreStockSafety + w4·ScoreRouteReliability; highest Si is rank 1 and is asked first | Ranking | – | F-14 | Yes | `borrow.score.w1..w4: 0.45, 0.28, 0.17, 0.10` | F1 §6.2 |
| BR-F1b-016 | Weights sum to 1.00; w1 adjustable in 0.40–0.50, w2 in 0.25–0.30, then w3 is adjusted so sum = 1 (w4 fixed 0.10) | Config save | – | Validate | Yes | – | F1 §6.2 |
| BR-F1b-017 (ข้อเสนอ) | Hospitals without history use ScoreRouteReliability = 0.5 | Ranking | no history | Default | Yes | `borrow.reliability_default: 0.5` | F1 §6.2 |
| BR-F1b-018 (ข้อเสนอ) | The 30 days in ScoreStockSafety is adjustable | Ranking | – | Parameter | Yes | `borrow.stock_safety_days: 30` | F1 §6.2 |
| BR-F1b-019 | ApprovalRate = approved ÷ answered; AvgTimeoutRate = timed out ÷ all requests (each 0–1) | Ranking | – | F-18 | Yes (window) | `borrow.reliability_window_months: 12` | F1 §6.2, Q-25 |
| BR-F1b-020 | V: stop requesting when total **confirmed** ≥ 90 % of the quantity needed in the **first round** | After each response | drug V | Stop | Yes | `borrow.stop_ratio_V: 0.90` | F1 §7 |
| BR-F1b-021 | E: request until 100 % of **normal use** (excluding buffer) = `(u × L) − stock − incoming` | After each response | drug E | Stop | Yes | `borrow.stop_ratio_E: 1.00` | F1 §7 |
| BR-F1b-022 | D: not in borrowing; notify only | – | drug D | – | No | – | F1 §7 |
| BR-F1b-023 | After receiving a partial amount, recompute the formula of §5 counting confirmed as "incoming" to see whether more is needed | After response | – | F-20 | No | – | F1 §7 |
| BR-F1b-024 | Very urgent: send to **up to 3** hospitals simultaneously; other levels one at a time | Plan | urgency | Parallel/sequential | Yes | `borrow.max_parallel: 3` | F1 §8-2 |
| BR-F1b-025 | Officer reviews Agent's proposal (drug, quantity, destinations by Si) and may approve / adjust / reject (stock to keep comes from Predict and may not require ordering) | Plan | – | Human decision | No | – | F1 §8-1 |
| BR-F1b-026 | "Shareable portion" = LendableStock = lender stock − Total Target; requests are issued to hospitals in Si order from largest share to smallest share | Plan | – | F-21 | No | – | F1 §8-2 |
| BR-F1b-027 | The lender hospital's officer **confirms before real shipping** | Response | – | Confirm UI | No | – | F1 §8-3 |
| BR-F1b-028 (ข้อเสนอ) | Timeout by urgency (very urgent 1–2 h, urgent 4–6 h, normal ≤ 48 h) and never longer than the requester's remaining stock time; reminder once at 50 % | Send | – | F-19 | Yes | `borrow.timeout.*` | F1 §8-4, ASM-32 |
| BR-F1b-029 | Reminder once per leg at 50 % of effective timeout | Timer | – | Notify lender | Yes | `borrow.reminder_ratio: 0.5` | F1 §8-4 |
| BR-F1b-030 | No answer in time = rejection; ask the shortfall from the next hospital in the next round **without re-asking the same hospital** | Timeout | – | Next round | No | – | F1 §8-5 |
| BR-F1b-031 | Ladder exhausted and still not supplied: notify staff to arrange via purchasing channel or regional warehouse | Exhaustion | – | Escalate | No | – | F1 §8-6 |
| BR-F1b-032 | Guardrails: no request above needed quantity; no hospital failing Hard Filter; no request above lender's LendableStock; ≤ 3 parallel (very urgent) | Plan validate | – | Reject plan → fallback | No | – | F1 §4.3 |
| BR-F1b-033 | If agent answers wrongly/invalidly or not at all, use rule-based plan: ask by Si order | Agent failure | – | Fallback | No | – | F1 §4.3 |
| BR-F1b-034 | Agent can be switched off immediately; system continues with rule-based plans and manual requests | Admin | – | Kill switch | Yes | `agent.enabled` | F1 §4.3 |
| BR-F1b-035 | Every decision stores data used, result, reason and rule-check result | Every run | – | Write `agent_run` | No | – | F1 §4.3 |
| BR-F1b-036 | Real requests are sent only after officer approval | Send | – | Gate | No | – | F1 §4.3 |
| BR-F1b-037 | Manual request: same approval, timeout and document flow as the Agent's | Manual | – | Reuse | No | – | F1 §10.3 |
| BR-F1b-038 | Agent never decides numbers; code computes Predict, Total Target, borrow quantity, Si, urgency; Agent reads situation and applies judgement under validated rules | All | – | Tool-only numerics | No | – | F1 §4 |
| BR-F1b-039 | Context Agent signals (outbreaks, events, abnormal demand) are inputs to the urgency judgement | Agent task 1/2 | – | Provide signals | Yes | – | F1 §10.2 |
| BR-F1b-040 | Daily summary tells pharmacists which drugs are at risk, which requests are pending and what decisions are needed | Daily 07:30 | – | Notify | Yes | `agent.daily_summary_time: "07:30"` | F1 §4.1-6 |

### 8.3 F2a — Near-Expiry Release & Allocation

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-F2a-001 | Near-expiry items are pulled from each hospital's stock per criteria **set by pharmacist per drug** | Nightly | remaining ≤ threshold | Create item | Yes | `expiry.threshold_days_default: 180` | F2 §2.1, ASM-14 |
| BR-F2a-002 | Owner pharmacist verifies, edits and confirms release | Item detected | – | Review UI | No | – | F2 §2.2 |
| BR-F2a-003 | Released lots enter a central pool visible to all hospitals in the health region | Release | – | Insert pool entry | No | – | F2 §2.3 |
| BR-F2a-004 | Pool lots carry status "ถูกกันไว้"; goods remain at origin hospital until shipped | Release | – | `held_qty += q` | No | – | F2 §2.3 |
| BR-F2a-005 | Held quantity is excluded from usable stock and F1 lending | Stock calc | – | Exclude | No | – | ASM-12 |
| BR-F2a-006 | Matching considers: receiver stock below safe level with usage; deficit vs F1 forecast; receiver usage rate; remaining life > transit + expected consumption | Match | – | Candidate filter | No | – | F2 §2.4 |
| BR-F2a-007 | A lot larger than one hospital can use is split across hospitals by need and urgency | Match | – | Greedy split (F-22) | No | – | F2 §2.4 |
| BR-F2a-008 | Agent uses only items whose code pairs are Verified (F4) | Match | – | Filter | No | – | F2 §2.4 |
| BR-F2a-009 | Uneconomical shipping (cost not worth the value, e.g., cold chain all the way) ⇒ agent does not recommend shipping and notifies the owner pharmacist | Plan | F-23 test | Flag line | Yes | `expiry.transport_cost_ratio_max: 0.20` | F2 §2.5, ASM-15 |
| BR-F2a-010 | Options for uneconomical lots: return to manufacturer/distributor; adjust use in own hospital; destroy per regulation; accept shipping as planned | Flag | – | Offer 4 options | No | – | F2 §2.5 |
| BR-F2a-011 | Pharmacist is the chooser and final confirmer of the option | Decision | – | Record | No | – | F2 §2.5 |
| BR-F2a-012 | Every involved hospital's pharmacist reviews and approves the plan | Plan ready | – | Approval tasks | No | – | F2 §2.6 |
| BR-F2a-013 | If not all approve, a meeting is held to split drugs appropriately; plan is editable | Reject/timeout | – | `NEEDS_DISCUSSION` | Yes | `expiry.plan_approval_timeout_h: 48` | F2 §2.6, ASM-16 |
| BR-F2a-014 | When allocation is settled, transfer/return documents are generated automatically | Approved | – | XC-1 | No | – | F2 §2.7 |
| BR-F2a-015 | Same-network hospitals can create requests directly and skip §2.6 approval; request defaults to approved; one-step send; pharmacists can edit/cancel | Manual same-network | network equal | Auto-approve | Yes | `network.auto_approve: true` | F2 §4 |
| BR-F2a-016 | Transport statuses: waiting dispatch → loaded → in transit → arrived; set by officers | Update | – | Status update | No | – | F2 §5.1 |
| BR-F2a-017 | Transport officer may photograph goods and attach photos as evidence | Update | – | Upload | Yes | `transport.photos_max: 10`, size ≤ 10 MB | F2 §5.1 |
| BR-F2a-018 | Cancel button only while status = waiting dispatch and needs consent of both hospitals; lot returns to owner's stock | Cancel | – | Mutual consent | No | – | F2 §5.2 |
| BR-F2a-019 | Stock out at origin at LOADED; stock in at receiver on receipt confirmation | Status | – | Ledger | No | – | ASM-13 |
| BR-F2a-020 | Manual multi-hospital requests need approval of all involved pharmacists | Manual | – | §2.6 flow | No | – | F2 §7 |
| BR-F2a-021 | Manual same-network requests follow Auto Approve | Manual | – | §4 flow | No | – | F2 §7 |
| BR-F2a-022 | Release quantity ≤ available non-held quantity | Release | – | Validate | No | – | ASM |
| BR-F2a-023 | Dispatch blocked if remaining life at dispatch < transit time | LOADED | – | Block | No | – | ASM |
| BR-F2a-024 | Lot expiring before shipment becomes EXPIRED and counts for F2b | Daily | expiry < today | Write-off event | No | – | ASM |
| BR-F2a-025 | Matching tie-break: receivers with fewest days-of-stock first, then shortest Ttransit | Match | – | Ordering | Yes | – | ASM (no source scoring) |
| BR-F2a-026 | Cold-chain lots require cold-chain handling instruction on the document | Document | flag | Add text | No | – | F1 §9 (reuse) |
| BR-F2a-027 | Controlled drugs are excluded from automatic matching | Match | controlled | Skip | Yes | – | F1 §6.1 (reuse) |
| BR-F2a-028 | Photos visible only to the two hospitals, region admin, auditors | Access | – | RLS | No | – | ASM-27 |
| BR-F2a-029 | Plan edit increments `version`; approvals reset for changed lines | Edit | – | Re-approve | No | – | ASM |
| BR-F2a-030 | Pool entry visible fields: drug, quantity, expiry, origin hospital, price; not origin's stock level | Pool view | – | Projection | No | – | Q-19 |
| BR-F2a-031 | Blood products are excluded from near-expiry scan and redistribution | Monthly scan | – | Skip item | No | – | ASM-47 |

### 8.4 F2b — Repeated-Expiry Detection

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-F2b-001 | Unit of counting = same drug (GPU level in TMT) at the same hospital; count every lot that actually expired or was released to central pool because of near-expiry | Nightly | – | Count | No | – | F2 §3 |
| BR-F2b-002 | Watch level: ≥ 2 lots in 12 months | Count | ≥ 2 | `WATCH` | Yes | `expiry.repeat.watch_count: 2` | F2 §3 |
| BR-F2b-003 | Recommend purchasing adjustment: ≥ 3 lots in 12 months **or** cumulative lost value over pharmacist-set threshold | Count | – | `RECOMMEND` | Yes | `expiry.repeat.recommend_count: 3`, `expiry.repeat.recommend_value_thb: 10000` | F2 §3 |
| BR-F2b-004 | Exclusions: events with a specific cause (recall, change in treatment direction) identified by pharmacist | Review | – | Exclude | Yes | – | F2 §3 |
| BR-F2b-005 | Suggested figure: order-quantity reduction per cycle from average expired leftover vs order quantity per cycle and actual usage, with expected savings | Recommend | – | F-25 | No | – | F2 §3 |
| BR-F2b-006 | Dismissed finding is suppressed for 90 days unless count increases | Dismiss | – | Suppress | Yes | `expiry.repeat.dismiss_days: 90` | ASM |

### 8.5 F3 — Emergency Preparedness

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-F3-001 | Preset Kit is defined **per patient** | Assessment | – | Kit quantity = patients × kits-per-patient | Yes (rules) | seed (Q-11) | F3 §3.1 |
| BR-F3-002 | Agent selects kits from incident characteristics (e.g., burns, bus crash, heavy bleeding/respiratory failure) | Assessment | – | Choose kits | No | – | F3 §3.1 |
| BR-F3-003 | Items outside sets are assessed alongside the kits | Assessment | – | Add extra items | Yes | rules | F3 §3.2 |
| BR-F3-004 | Show set-level result by default; full item list only after spreading | UI | – | Display | No | – | F3 §3 |
| BR-F3-005 | Estimated = needed counting all triage levels | Calc | – | F-27 | No | – | F3 §3.4 |
| BR-F3-006 | Critical Minimum = needed counting critical level only | Calc | – | F-27 | No | – | F3 §3.4 |
| BR-F3-007 | Difference between the two is the buffer helping staff prioritise | Display | – | Show | No | – | F3 §3.4 |
| BR-F3-008 | Staff verify, confirm, add and remove lines before inventory check | Plan | – | HITL gate | No | – | F3 §3.5 |
| BR-F3-009 | Spread kit items by recipe, together with loose items, and compare against ready sets and loose stock **in a single calculation** | Check | – | F-27 | No | – | F3 §4.1 |
| BR-F3-010 | Spreading is calculation only; **real packed sets are never opened** (sterilised, ready to use) | Check | – | – | No | – | F3 §4.1 |
| BR-F3-011 | Plan is presented in this order: (1) ready sets, (2) pack extra from loose items, (3) borrow whole set, (4) expand request to farther hospitals when none nearby has ready sets, (5) items outside sets borrowed per item | Plan | – | Table | No | – | F3 §4.2 |
| BR-F3-012 | Priority table rows are mutually exclusive per kit quantity: ready → pack → borrow set → (expand) | Plan | – | F-27 | No | – | F3 §4.2 |
| BR-F3-013 | A missing single component ⇒ borrow the **whole set**, never the single component (example: borrow 1 Intubation Set, not a stylet) | Plan | – | Borrow set | No | – | F3 §4.2 (v8) |
| BR-F3-014 | Staff can adjust how many sets to pack; the reduction automatically becomes borrow quantity | Plan | – | Recompute | No | – | F3 §4.2 |
| BR-F3-015 | On packing confirmation: deduct loose items by recipe, add ready sets | Confirm | – | Ledger | No | – | F3 §4.3 |
| BR-F3-016 | Items outside sets that are short are borrowed per item | Plan | – | Item lines | No | – | F3 §4.2 |
| BR-F3-017 | Emergency requests are sent **simultaneously** to nearby hospitals that have the goods and can arrive in time, flagged as emergency/express | Send | Ttransit ≤ ETA | Parallel legs | No | – | F3 §5.1 |
| BR-F3-018 | The first hospital to confirm gets the confirmed quantity; remaining requests adjusted/cancelled automatically and other hospitals informed immediately | Confirm | – | Trim | No | – | F3 §5.1 |
| BR-F3-019 | Partial supply ⇒ system opens a request for the remainder | Confirm | partial | New leg | No | – | F3 §5.1 |
| BR-F3-020 | No hospital answers within time ⇒ expand to farther hospitals | Timeout | – | Expand | No | – | F3 §5.1 |
| BR-F3-021 | No hospital can deliver in time ⇒ request fastest hospital and warn staff goods will arrive after casualties | Plan | – | Warn | No | – | F3 §5.1 |
| BR-F3-022 | All nearby hospitals reject ⇒ emergency alert to staff | Reject | – | Alert | No | – | F3 §5.1 |
| BR-F3-023 | Timeouts: critical (immediate) items 3 min; supportive/backup (urgent) items 5 min; never later than ETA | Send | – | F-28 | Yes | `emergency.timeout_critical_min: 3`, `emergency.timeout_supportive_min: 5` | F3 §5.2 |
| BR-F3-024 (ข้อเสนอ) | Critical/supportive class stored per drug | Config | – | `drug_master.emergency_class` | Yes | – | F3 §5.2 |
| BR-F3-025 | ETA: officer enters per rescue-unit information; if unknown, obtain route travel time from Amazon Location Service in **real time** (no cache, no speed-table fallback); if the service fails ⇒ `ETA_UNAVAILABLE`, ETA is not guaranteed, notify staff to use radio; the same rule applies to lender `Ttransit` in F3 | Intake / Send | – | F-26 | No | `emergency.location_timeout_s: 3`, `emergency.location_retries: 1` | F3 §6, owner review |
| BR-F3-026 | Staff can update casualty counts/details; Agent re-plans on the new numbers | Update | – | New plan version | No | – | F3 §6 |
| BR-F3-027 | After the incident: collect which hospital/item/type/quantity was borrowed and track returns | Reconcile | – | Summary | No | – | F3 §7 |
| BR-F3-028 | Issue automatic borrow/return summary between hospitals so lenders get goods back and avoid carrying cost | Reconcile | – | Document | No | – | F3 §7 |
| BR-F3-029 | Issue a usage summary for the treating hospital's claim (พ.ร.บ./UCEP) through the normal channel; system does not file claims | Reconcile | – | Document | No | – | F3 §7 |
| BR-F3-030 | Scope: consumables (drugs, fluids, disposables, in-kit and out-of-kit) in; kit packing and borrowing in; reconciliation in. Out: equipment (ventilator, AED, infusion pump), blood and components other than PRC group O (BR-F3-031/032), choosing the receiving hospital (1669) | Always | – | Reject out-of-scope lines | No | – | F3 §8 |
| BR-F3-031 | PRC group O may be an extra out-of-kit borrow line | EMERGENCY incident and `emergency.blood.enabled` | request ≤ `prc_o_max_units`; lender and borrower both `has_blood_bank`; lot remaining life ≥ `prc_o_min_remaining_days` | Create blood line with notice "blood bank confirmation required"; exclude from kit packing and from F1/F2 | Yes (pharmacist + blood-bank confirmation) | `emergency.blood.*` | ASM-47 |
| BR-F3-032 | Any other blood product (other PRC groups, FFP, platelets, cryo, whole blood) is reminder-only | Plan calculated | – | Show "request via blood bank"; no plan line, no stock tracking | No | – | ASM-47 |

### 8.6 F4 — Drug Code Normalization

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-F4-001 | Import only rows with active = Y | Import | – | Filter | No | – | F2 §6.1 |
| BR-F4-002 | Suggest TMT mapping at GPU/TPU (name, strength, dosage form) and GPP/TPP (package type, e.g., foil strip vs jar) | Import | – | Suggest | No | – | F2 §6 |
| BR-F4-003 | Supplies and blood are not coded in TMT: a hospital row of `item_type` SUPPLY/BLOOD is mapped by selecting an item of the admin central list (`method = CENTRAL_LIST`); no suggestion score | Import/Verify | item_type ≠ DRUG | Select from central list | No | – | ASM-48 |
| BR-F4-004 | Confidence score on each suggestion, esp. for abbreviations/typos | Suggest | – | F-29 | Yes | weights ASM-17 | F2 §6 |
| BR-F4-005 | If the structure of a Verified row changed (name hash, unit, package), pharmacist/data team must check and press Verify again | Verify | structure changed | Safety gate | No | – | F2 §6 |
| BR-F4-006 | Verified pairs are stored and reused automatically | Re-import | name/unit unchanged | Reuse | No | – | F2 §6 |
| BR-F4-007 | Agents only use verified pairs; unverified or below-threshold items are excluded from matching/allocation | Agent | – | Filter | Yes | `mapping.threshold_low: 0.60` | F2 §6 |
| BR-F4-008 | Mapping versions kept; a change creates a new version | Change | – | History | No | – | ASM |
| BR-F4-009 | Verification requires canonical unit conversion factor **and** this hospital's pack data (`local_pack_unit`, `base_units_per_pack`; optional `manufacturer`) | Verify | – | Validate | No | – | Q-26, ASM-45, F-32 |
| BR-F4-010 | Tall-man casing and parenthetical tags are normalised and stored separately | Normalise | – | Parse | No | – | Sample data |
| BR-F4-011 | Unverified backlog older than SLA triggers reminder | Daily | > 3 days | Notify | Yes | `mapping.sla_days: 3` | ASM |
| BR-F4-012 | Bulk verify (optional) only when confidence ≥ 0.95 and identical verified mapping exists at ≥ 2 hospitals | Bulk | – | Allow | Yes | `mapping.bulk_verify_enabled: false` | ASM |

### 8.7 Cross-cutting (XC)

| Rule ID | Rule | Trigger | Condition | Action | Cfg | Default | Source |
|---|---|---|---|---|---|---|---|
| BR-XC-001 | Borrow/return document printable immediately when shipment approved | Lender confirm | – | Generate | No | – | F1 §10.1 |
| BR-XC-002 | Document content: number, lender/borrower, items, quantity, lot, expiry, delivery method (incl. cold chain), return terms (in kind or value), due date, both parties' signature fields | Generate | – | Template | No | – | F1 §10.1 |
| BR-XC-003 (ข้อเสนอ) | Track "outstanding" returns and notify near due | Daily | – | Reminders | Yes | `return.reminder_days: [7,1]` | F1 §10.1 |
| BR-XC-004 | Return is in kind only: same drug, same quantity (base units); no payment option | Create | – | Obligation | No | – | ASM-24 |
| BR-XC-005 | Default return due after 30 days | Create | – | Due date | Yes | `return.default_days: 30` | ASM-24 |
| BR-XC-006 | Issued documents immutable; correction = new version | Edit | – | Void + reissue | No | – | ASM |
| BR-XC-007 | Document numbering `DR-<hospital>-<yyyy>-<seq6>` per type | Generate | – | Sequence | No | – | ASM |
| BR-XC-008 | PDF stored with SHA-256 | Generate | – | Store | No | – | ASM |
| BR-XC-009 | Audit log append-only and hash-chained | Always | – | Write | No | – | SEC |
| BR-XC-010 | Admin sees Value for all hospitals; hospital sees its own | View | – | RLS | No | – | F1 §11 |
| BR-XC-011 | Value metric includes % reduction of under/overstock | Report | – | F-31 | Partly | ASM-40 | F1 §11 |
| BR-XC-012 | Model metrics: pinball loss, coverage P90/P95, stockout rate | Report | – | F-24 | No | – | F1 §11 |
| BR-XC-013 | Blood borrow is returned by replacement through the blood bank (`return_obligation.return_mode = BLOOD_REPLACEMENT`), not by in-kind stock return | Blood leg RECEIVED | – | Create obligation; reminders as BR-XC-003 | No | `return.default_days` | ASM-47 |

---

## 9. Calculation and Algorithm Specification

All formulas live in `packages/formulas` as pure, unit-tested functions. **No LLM output may be used as a numeric input.** Common conventions: units are base dispensing units; days are decimals until stated otherwise; `ceil` = round up to integer; `Q_τ` = empirical quantile with linear interpolation (numpy `method="linear"`); all timestamps `Asia/Bangkok`.

### 9.1 F1a formulas

**F-01 Pattern metrics**

| Field | Spec |
|---|---|
| Purpose | Describe how an item is used to route the forecast method |
| Formula | `history_days = days since first usage record`; `CV = std(w_k) / mean(w_k)` over weekly totals `w_k` of the trailing 52 weeks (≥ 26 weeks required); `active_day_ratio = days with usage > 0 / days in window` (trailing 365 d or `history_days` if shorter); `price_tier = HIGH if unit_price ≥ forecast.price_high_thb, LOW if ≤ forecast.price_low_thb else MID` |
| Variables | `w_k` (units/week, `usage_history`); `unit_price` (THB, `hospital_drug_profile`) |
| Units | CV dimensionless; ratio 0–1 |
| Rounding | CV and ratio stored to 4 decimals |
| Edge cases | mean = 0 ⇒ CV undefined ⇒ pattern `NO_USAGE`; < 26 weeks ⇒ CV computed on available weeks, flag `SHORT_HISTORY`; Q-01 ambiguity: `intermittent = active_day_ratio ≤ 0.30` |
| Example | Weekly totals mean 70, std 22.4 ⇒ CV = 0.32; 342 of 365 days active ⇒ ratio 0.937 |

**F-02 Method routing**

| Field | Spec |
|---|---|
| Purpose | Choose forecasting method per item |
| Formula (precedence) | 1) if `method_override` ⇒ use it. 2) if `VED = D` and `price_tier = LOW` ⇒ `MIN_MAX`. 3) else if `history_days < 90` or `price_tier = HIGH` or `CV > 0.5` or `active_day_ratio ≤ 0.30` or `is_seasonal` ⇒ `QUANTILE`. 4) else ⇒ `MA_ES` (needs `history_days ≥ 180`, else `QUANTILE`) |
| Variables | `VED`, `price_tier`, `history_days`, `CV`, `active_day_ratio`, `is_seasonal` (manual flag or auto when ≥ 24 months and seasonal strength > 0.64) |
| Rounding | – |
| Edge cases | V/E never `MIN_MAX` (ASM-09): rule 2 only for D; an override that sets MIN_MAX on V/E is rejected |
| Example | VED = E, price 15 THB, history 400 d, CV 0.32, ratio 0.94 ⇒ `MA_ES`. New vaccine, history 45 d ⇒ `QUANTILE` (cold-start) |

**F-03 Moving Average / Exponential Smoothing forecast**

| Field | Spec |
|---|---|
| Purpose | P50 for steady items |
| Formula | `MA_N = mean(last N weekly totals)`, N = 26. `ES: ℓ_t = α·y_t + (1−α)·ℓ_{t−1}`, α ∈ {0.1,…,0.5} chosen by min backtest MAE, `ℓ_0 = y_1`. Seasonal index `SI_m = mean_usage_in_month_m / mean_usage_all` (only if ≥ 12 months), clipped to [0.5, 2.0]. `P50_week(t+h) = level × SI_{month(t+h)}`; `P50_month` computed on the monthly series the same way. Choose MA or ES by lower rolling-backtest MAE |
| Variables | `y_t` weekly or monthly usage (units); `α` |
| Rounding | P50 rounded **half-up to 3 decimals** in storage; display to integer; calculations use unrounded |
| Edge cases | < 6 months ⇒ router should not select MA_ES; negative forecast ⇒ 0; holiday weeks ⇒ SI unchanged (flag) |
| Example | Weeks [68,72,70,66,74,70], α = 0.3, ℓ₀ = 68 ⇒ ℓ = 70.06; MA₆ = 70.00 ⇒ choose per MAE |

**F-04 Residual quantile (buffer for MA/ES)**

| Field | Spec |
|---|---|
| Purpose | Buffer sizes P90/P95 for MA/ES |
| Formula | For each backtest week k (expanding window, 1-step-ahead for week; h-aggregated for month): `e_k = y_k − ŷ_k`. `Bτ = max(0, Q_τ({e_k}))`, τ = 0.90/0.95. If `n < 26` ⇒ `Bτ = z_τ × std(e)` with z = 1.28/1.65 and flag `RESIDUAL_FALLBACK`. Quantile levels: `P90 = P50 + B0.90`, `P95 = P50 + B0.95` |
| Variables | `y_k` actual; `ŷ_k` forecast made with data before k |
| Rounding | 3 decimals |
| Edge cases | All residuals ≤ 0 ⇒ B = 0; very short n ⇒ fallback; outliers winsorised at P99 when training MA/ES |
| Example | P50_week = 70, empirical Q0.95(e) = 24 ⇒ P95 = 94 |

**F-05 Quantile model**

| Field | Spec |
|---|---|
| Purpose | P50/P90/P95 directly for spiky/seasonal/expensive/rare/cold-start items |
| Formula | LightGBM with `objective = "quantile"`, `alpha ∈ {0.5, 0.9, 0.95}`, one model per (granularity, quantile), global across items with item features. Features: lag 1,2,3,4,8,13,26,52 weeks; rolling mean/std (4, 13, 26 w); week-of-year and month (sin/cos); holiday flags (Songkran, New Year, long weekends); price tier; VED; hospital tier; context signal index; item id embedding via target-encoded mean. Target: usage over next week/month. Post-process: enforce `q50 ≤ q90 ≤ q95` by sorting; clip at 0 |
| Variables | as above |
| Rounding | 3 decimals |
| Edge cases | Cold start ⇒ features from VED-class pooled stats (ASM-08); model retrained monthly, weekly inference; training window ≥ 12 months of pooled data |
| Example | Outputs q50 = 70, q90 = 88, q95 = 96 ⇒ V Total Target = 96 |

**F-06 Total Target**

| Field | Spec |
|---|---|
| Purpose | Hold level and lender's keep level |
| Formula | `TT = P95` if V, `P90` if E, undefined if D. Always `TT ≥ P50` (`TT = max(TT, P50)`) |
| Variables | P50/P90/P95 (units) |
| Rounding | **Round up** to whole base unit (`ceil`) when stored for comparison |
| Edge cases | D ⇒ null; stale ⇒ not computed |
| Example | P50 = 70, P95 = 94 (MA/ES) ⇒ TT_V = 94; TT_E (P90 = 88) = 88 |

**F-07 ABC value and class**

| Field | Spec |
|---|---|
| Purpose | Order alerts (V-A first) |
| Formula | `value_i = Σ usage_12m_i × unit_price_i`; sort descending; `cum_share_i = Σ_{j ≤ i} value_j / Σ value`; `A if cum_share ≤ 0.70`, `B if ≤ 0.90`, else `C` (cut-offs inclusive of the item that crosses: item that makes cum_share cross 0.70 is A) |
| Variables | usage (units), price (THB) |
| Rounding | value to 2 decimals |
| Edge cases | ties by item id; price 0 ⇒ C |
| Example | Values 700, 150, 100, 50 (sum 1,000): cum 0.70, 0.85, 0.95, 1.00 ⇒ A, B, C, C |

### 9.2 F1b formulas

**F-08 Lead time, daily usage and σ**

| Field | Spec |
|---|---|
| Purpose | Inputs of the borrow quantity |
| Formula | `L = max(1, ceil(PO_eta_date − today))` using the earliest open PO with remaining quantity and not overdue; if none or PO overdue ⇒ `L = standard_lead_time_days`. `u = P50_week ÷ 7` if `L ≤ 7`; `u = P50_month ÷ 30` if `L > 7`. `σ = sample_std(daily usage, trailing 90 d, min 28 d)` with missing days = 0 |
| Variables | `P50_*` (units), `L` (days), `u` (units/day), `σ` (units/day); sources: forecast, PO table, drug master, usage |
| Rounding | `L` integer days; `u`, `σ` 3 decimals |
| Edge cases | `u = 0` ⇒ no need; `σ` unavailable ⇒ pooled σ of VED class + flag; P50 missing ⇒ use last valid forecast (≤ 14 days old) else block |
| Example | P50_week = 70 ⇒ u = 10/day (L = 3) |

**F-09 Required until arrival and borrow quantity**

| Field | Spec |
|---|---|
| Purpose | Quantity to request |
| Pattern switch | `demand_pattern` (stored on `forecast_result`) decides the formula. **REGULAR** (not intermittent, normal-like demand): classical formula (A). **INTERMITTENT / lumpy** (`active_day_ratio ≤ 0.30` or Quantile method chosen by BR-F1a-004/006/007, incl. cold start): quantile formula (B). Classical Safety Stock is **never** used for intermittent items because σ of lumpy demand is unreliable (a month of 100 then 0) |
| Formula A (REGULAR) | `R = u × L + Z × σ × √L`; Z = 1.65 (V), 1.28 (E) |
| Formula B (INTERMITTENT) | `R = Q_q(L)` where `Q_q(L)` is the quantile-model demand quantile over the lead-time window L (**P95 for V, P90 for E**, i.e. the same quantile as Total Target). The buffer comes straight from the Quantile Model (F-05), no `Z×σ×√L` term |
| Borrow | `borrow_qty = ceil(max(0, R − stock − incoming))`; `incoming = Σ confirmed leg quantity not yet received` |
| Variables | `stock` = usable lots (units); `incoming` (units) from `borrow_leg` with status confirmed; `Q_q(L)` from `forecast_result.lead_time_quantile` (units over L days) |
| Computing Q_q(L) | ASSUMPTION ASM-43: the quantile model is also trained on the target "sum of demand over the next L days" (L = lead time rounded up to whole days); if only weekly/monthly quantiles exist, `Q_q(L) = P_q(week) × L/7` for L ≤ 7, else `P_q(month) × L/30`, rounded up (conservative). Flag `LEAD_TIME_QUANTILE_APPROX` when the approximation is used |
| Rounding | `ceil` to whole base units; if `lend_in_packs`, ceil to pack multiple (F-32) |
| Edge cases | `borrow_qty = 0` ⇒ no request; stock ≥ R ⇒ none; very large R vs lender capacity ⇒ partial plan; quantile unavailable (model failed) ⇒ use formula A with `confidence_flag = FALLBACK_CLASSICAL`; pattern changes between runs ⇒ use the pattern of the latest forecast run |
| Example A | u = 10, L = 3, σ = 4, Z = 1.65 (V), REGULAR: R = 30 + 1.65×4×√3 = **41.43**; stock = 15, incoming = 0 ⇒ borrow = ceil(26.43) = **27** |
| Example B | INTERMITTENT V drug, L = 3 d, model P95 demand over 3 days = 38 (illustrative), stock = 15, incoming = 0 ⇒ R = **38**, borrow = ceil(38 − 15) = **23** (classical formula with u = 10, σ = 12 would give 30 + 1.65×12×1.732 = 64.29, over-requesting 42 units) |

**F-10 Window_max**

| Field | Spec |
|---|---|
| Purpose | Time until the requester runs out |
| Formula | `Window_max_days = stock ÷ u`; hours = days × 24 |
| Variables | `stock` (units), `u` (units/day) |
| Rounding | 2 decimals |
| Edge cases | `u = 0` ⇒ capped to 365 d; stock 0 ⇒ 0 |
| Example | stock 15, u 10 ⇒ 1.5 days = 36 h |

**F-11 Urgency**

| Field | Spec |
|---|---|
| Purpose | Urgency level |
| Formula | `d = Window_max_days`. V: `d ≤ 2 ⇒ VERY_URGENT`; `2 < d ≤ 7 ⇒ URGENT`; else `NORMAL`. E: `d ≤ 2 ⇒ URGENT`; else `NORMAL`. Agent may set `urgency_final = min(VERY_URGENT, urgency + 1)` with reason; never lower |
| Variables | `d` days |
| Rounding | compare unrounded |
| Edge cases | Context signal severity 3 may justify +1 (never +2) |
| Example | V drug, d = 1.5 ⇒ VERY_URGENT |

**F-12 Hard Filter**

| Field | Spec |
|---|---|
| Purpose | Eligible lender test |
| Formula | `eligible = (Ttransit ≤ Window_max) ∧ (LendableStock > 0) ∧ (¬cold_chain ∨ (lender.cold_chain_capable ∧ Ttransit ≤ box_hours)) ∧ ¬controlled ∧ lender.active ∧ lender.agent_participation ∧ mapping_verified ∧ lender ≠ requester` |
| Variables | `Ttransit` hours from `distance_matrix.travel_minutes/60`; `box_hours` config |
| Rounding | – |
| Edge cases | Missing distance pair ⇒ not eligible (log `NO_DISTANCE`) |
| Example | Window_max 36 h; D: Ttransit 30 h ⇒ passes; hospital F: 40 h ⇒ excluded |

**F-13 LendableStock**

| Field | Spec |
|---|---|
| Purpose | What the lender can give without dropping below its Total Target |
| Formula | `usable_for_lending = Σ lots (not held, not expired, remaining_days > 180)`; `LendableStock = max(0, usable_for_lending − TT_lender)`; `shareable = min(LendableStock, borrow_remaining)` |
| Variables | `TT_lender` weekly Total Target (ASM-06) |
| Rounding | integer, floor |
| Edge cases | lender D-class for that drug ⇒ TT undefined ⇒ treat TT = P50×1 (ASM) and flag; Total Target missing ⇒ not eligible |
| Example | usable 120, TT 94 ⇒ 26 |

**F-14 … F-18 Hospital Priority Score (Si)**

| Field | Spec |
|---|---|
| Purpose | Rank lenders |
| Formula | **F-14** `Si = w1·ScoreTime + w2·ScoreFulfill + w3·ScoreStockSafety + w4·ScoreRouteReliability`; w = 0.45, 0.28, 0.17, 0.10. **F-15** `ScoreTime = max(0, 1 − Ttransit / Window_max)`. **F-16** `ScoreFulfill = min(1, LendableStock / borrow_qty)`. **F-17** `ScoreStockSafety = min(1, days_after / 30)` with `days_after = (CurrentStock − qty_lend) / u_lender`, `qty_lend = min(LendableStock, borrow_qty)`. **F-18** `ScoreRouteReliability = ApprovalRate × (1 − AvgTimeoutRate)`; ApprovalRate = approved ÷ answered; AvgTimeoutRate = timed-out ÷ all requests (trailing 12 months); no history ⇒ 0.5 |
| Variables | as defined; `u_lender` = lender's daily use (F-08 definition) |
| Units | all scores 0–1 |
| Rounding | scores 4 decimals; Si 4 decimals; ties broken by shorter Ttransit then hospital id |
| Edge cases | `borrow_qty = 0` ⇒ no ranking; `u_lender = 0` ⇒ `ScoreStockSafety = 1`; Window_max = 0 ⇒ nobody eligible |
| Example | Need 120, Window_max 36 h. B: Ttransit 4 h, lendable 80, stock 200, u 10, approval 0.9, timeout 0.10 ⇒ time 0.8889, fulfill 0.6667, safety (200−80)/10/30 = 0.4, reliability 0.81 ⇒ **Si = 0.7357**. C: 5 h, 60, stock 150, u 12, no history ⇒ 0.8611, 0.5, 0.25, 0.5 ⇒ **0.6200**. E: 8 h, 40, stock 90, u 8, approval 0.7, timeout 0.2 ⇒ 0.7778, 0.3333, 0.2083, 0.56 ⇒ **0.5348**. D: 30 h, 100, stock 300, u 15, approval 0.8, timeout 0.05 ⇒ 0.1667, 0.8333, 0.4444, 0.76 ⇒ **0.4599**. Order **B, C, E, D** (matches source §4.4) |

**F-19 Timeout and reminder**

| Field | Spec |
|---|---|
| Purpose | Deadline per leg |
| Formula | `T_table = {VERY_URGENT: 120 min, URGENT: 360 min, NORMAL: 2880 min}`; `T_eff = min(T_table, Window_remaining_min)` where `Window_remaining_min = (stock_now / u) × 1440`; reminder at `0.5 × T_eff` after send; `T_eff < 15 min` ⇒ auto-escalate |
| Variables | `stock_now` (current), `u` |
| Rounding | minutes, floor |
| Edge cases | Stock reached 0 ⇒ T_eff = 0 ⇒ escalate at once; range lower bounds 60/240 min are config minimums for admin settings |
| Example | VERY_URGENT, stock 15, u 10 ⇒ Window_remaining = 2,160 min; T_eff = min(120, 2160) = 120; reminder at 60 min |

**F-20 Stop rules**

| Field | Spec |
|---|---|
| Purpose | When to stop asking |
| Formula | V: stop if `confirmed_total ≥ 0.90 × borrow_qty_round1`. E: stop if `confirmed_total ≥ normal_use_qty` where `normal_use_qty = max(0, u×L − stock_at_request − incoming_at_request)`. After each response recompute `borrow_remaining = ceil(max(0, R − stock − incoming − confirmed))` (confirmed counted as incoming); if stop not met ask `borrow_remaining` from next ladder hospital |
| Variables | `confirmed_total` units |
| Rounding | ceil |
| Edge cases | Over-supply ⇒ trim; E example below; lender late confirmation counted only if request still open |
| Example | V: need 120, first-round; B 80 + C 20 = 100 < 108 ⇒ continue, remaining 20 from E; E confirms 20 ⇒ 120 ⇒ stop. E drug: u = 8, L = 3, stock 10, σ = 3, Z = 1.28 ⇒ first request ceil(24+1.28×3×√3 − 10) = **21**; stop threshold `24 − 10 = 14` |

**F-21 Round allocation**

| Field | Spec |
|---|---|
| Purpose | Quantities per lender in a round |
| Formula | Sort eligible lenders by Si desc. `remaining = borrow_remaining`. For lender j: `q_j = min(shareable_j, remaining)`; `remaining −= q_j`. Parallel (very urgent): take the first ≤ 3 lenders until `remaining = 0`. Sequential: first lender only, next rounds continue |
| Rounding | integer |
| Edge cases | Σ shareable < need ⇒ partial plan + escalation note |
| Example | B(80), C(60) with need 120 ⇒ B 80, C 40 ⇒ remaining 0 (D, E not asked) — matches source §4.4 step 2 |

### 9.3 F1a evaluation, forecasting specification

**F-24 Forecast evaluation metrics**

| Field | Spec |
|---|---|
| Purpose | Measure quality of P50/P90/P95 and the policy |
| Formulas | Pinball loss `L_τ = (1/N) Σ max(τ(y−q), (τ−1)(y−q))`. Coverage `cov_τ = (1/N) Σ 1[y ≤ q_τ]` (target τ). Stock-out rate (forecast) = share of backtest periods where `y > TT`; operational stock-out rate = V/E item-days with usable stock 0 ÷ item-days. Overstock rate = item-days with `stock > 2 × TT` ÷ item-days (`forecast.overstock_multiple = 2`). Value impact: under = `Σ max(0, y − TT) × price`; over = `avg(max(0, stock − TT)) × price`. MAE of P50 for method selection |
| Variables | `y` actual period usage; `q` forecast quantile; `N` periods |
| Rounding | 4 decimals; THB 2 decimals |
| Edge cases | N < 26 ⇒ metrics marked `LOW_N`; coverage tolerance ±0.05 |
| Example | 52 weeks, `y ≤ P95` in 50 weeks ⇒ coverage 0.9615 (ok vs 0.95) |

**Forecasting specification (summary)**

| Topic | Specification |
|---|---|
| Data window | Training: trailing 24 months (min 12 for quantile pooled; 6 for MA/ES); monthly series from ≥ 6 months |
| Minimum history | MA/ES ≥ 180 days; per-item quantile ≥ 90 days; < 90 days ⇒ pooled cold-start |
| Missing data | Hospital-reported zero = 0; missing ≤ 14 days interpolated; longer ⇒ `STALE`; negative usage quarantined |
| Seasonality | MA/ES seasonal index when ≥ 12 months; quantile uses calendar features; auto seasonal flag at ≥ 24 months (seasonal strength > 0.64) |
| Backtesting | Expanding window, weekly steps, 1-step weekly and 4-step/3-month aggregated; first 26 weeks used for warm-up |
| Quantile evaluation | Pinball loss per τ, coverage per τ, reliability plot (binned), tolerance ±0.05 |
| Retraining | Quantile models monthly; MA/ES parameters weekly |
| Reproducibility | Store model version, feature set hash, training window, random seed |

### 9.4 F2 formulas

**F-22 Expiry feasibility and allocation**

| Field | Spec |
|---|---|
| Purpose | Decide whether and how much of a lot a receiver can use before expiry |
| Formula | `remaining_days = expiry_date − today`. Near-expiry if `remaining_days ≤ threshold_days`. For receiver r: `deficit_r = max(0, TT_r − stock_r − incoming_r)`; `days_avail_r = remaining_days − Ttransit_days − handling_days (default 1)`; `consumable_r = floor(max(0, days_avail_r) × u_r)`; `alloc_r = min(qty_remaining, deficit_r, consumable_r)`. Feasible if `alloc_r > 0` and `alloc_r / u_r ≤ days_avail_r`. Greedy order: receivers by ascending `days_of_stock_r = stock_r / u_r`, tie shorter `Ttransit` |
| Variables | `TT_r` receiver Total Target (Q-05); `u_r` receiver daily use; `Ttransit_days = travel_minutes/1440` |
| Units | units, days |
| Rounding | floor for consumable, integer allocations |
| Edge cases | `u_r = 0` ⇒ not feasible; Σ alloc < qty ⇒ remainder stays in pool; mapping unverified ⇒ skip |
| Example | Lot 500, expiry in 90 d, Ttransit 1 d, handling 1 d; receiver u = 10, TT 300, stock 120 ⇒ deficit 180, days_avail 88, consumable 880 ⇒ alloc = **180** (consumed in 18 days) |

**F-23 Transport cost vs value**

| Field | Spec |
|---|---|
| Purpose | Detect uneconomical shipments |
| Formula | `value = alloc_qty × unit_price`; `cost = base_fee + per_km × distance_km + (cold_chain ? cold_surcharge : 0)` (defaults 300 / 8 / 500 THB); `uneconomical = cost ≥ ratio_max × value` (ratio_max = 0.20) |
| Variables | `distance_km` from `distance_matrix` |
| Rounding | THB 2 decimals |
| Edge cases | value = 0 ⇒ uneconomical; cost model missing ⇒ no flag but warning |
| Example | alloc 180 × 25 THB = 4,500; 50 km: cost = 300 + 8×50 = 700 ⇒ 15.6 % ⇒ economical; with cold chain 1,200 ⇒ 26.7 % ⇒ **uneconomical** |

**F-25 Repeated expiry and recommended reduction**

| Field | Spec |
|---|---|
| Purpose | Recommend lower order quantity |
| Formula | `n_lots` = lots expired or released-near-expiry in trailing 12 months (excluding flagged exceptions) per hospital × GPU; `lost_value = Σ leftover_qty × unit_cost`. Level: `WATCH if n_lots ≥ 2`; `RECOMMEND if n_lots ≥ 3 or lost_value ≥ recommend_value_thb`. `avg_leftover = mean(leftover_qty)`; `new_order = max(order_qty_avg − avg_leftover, ceil(u × order_cycle_days))`; `reduction = order_qty_avg − new_order`; `cycles_per_year = floor(365 / order_cycle_days)`; `expected_savings_thb = reduction × cycles_per_year × unit_cost` |
| Variables | `order_qty_avg` units per order; `order_cycle_days`; `u` units/day; `unit_cost` THB |
| Rounding | quantities `ceil`; THB 2 decimals |
| Edge cases | No order history ⇒ no numeric recommendation; `reduction ≤ 0` ⇒ no recommendation (usage already covers order) |
| Example | 3 lots left 400, 300, 500 ⇒ avg 400; order 2,000 per 120 d cycle; u = 13/day; cost 12 THB ⇒ new_order = max(1,600, 1,560) = 1,600; reduction 400; cycles 3 ⇒ savings **14,400 THB/year** |

### 9.5 F3 formulas

**F-26 ETA**

| Field | Spec |
|---|---|
| Purpose | Time until casualties arrive, and lender transit time for F3 |
| Formula | `ETA_min = ETA_reported` if entered and `eta_unsure = false`; else `ETA_route`; if `eta_unsure` and both exist ⇒ `min(ETA_reported, ETA_route)`. `ETA_route` is a **real-time** call to Amazon Location Service (traffic-aware, departure time = now). **No distance ÷ speed fallback exists in F3** |
| Variables | `ETA_reported` (minutes, from rescue unit via officer), `ETA_route` (minutes, Amazon Location Service), `eta_unsure` (boolean) |
| Rounding | floor to whole minutes, min 1 |
| Failure | Route call timeout `emergency.location_timeout_s` (3 s), 1 retry. Still failing and no reported ETA ⇒ `ETA_UNAVAILABLE`: banner "ไม่สามารถการันตี ETA — ใช้วิทยุสื่อสาร", notification to ER_STAFF + PHARMACIST, lender `Ttransit ≤ ETA` filter cannot be evaluated automatically (staff choose lenders by phone/radio); timeouts then use the fixed 3/5 min without ETA cap. Each failure is audited |
| Edge cases | ETA elapsed ⇒ 0 and `PATIENTS_ARRIVED` banner; reported ETA present ⇒ route failure does not block (flag `ROUTE_UNAVAILABLE` only) |
| Example | Route 26 min; reported 25 min, unsure ⇒ min = **25**. Route service down, nothing reported ⇒ `ETA_UNAVAILABLE` (no number is invented) |

**F-27 Kit requirement, spreading and plan**

| Field | Spec |
|---|---|
| Purpose | Quantities of kits/items, shortages and the plan |
| Formulas | Patients `p_R, p_Y, p_G`. Kit rule `k[type,t,kit]` (kits per patient), extra-item rule `e[type,t,item]`, recipe `r[kit,item]` (units per kit). **Estimated:** `Est_kit = ceil(Σ_t p_t·k[type,t,kit])`, `Est_extra_i = ceil(Σ_t p_t·e[type,t,i])`. **Critical Minimum:** same with `t = RED` only. **Buffer** = Est − Crit. **Spread:** `need_i = Σ_kit Est_kit·r[kit,i] + Est_extra_i`; `A_i = loose_i + Σ_kit ready_kit·r[kit,i]`; `shortage_i = max(0, need_i − A_i)` (informational). **Plan per kit** (kits ordered critical class first; loose components allocated sequentially): `use_ready = min(Est, ready)`; `rem = Est − use_ready`; `pack = min(rem, min_i floor(loose_i_left / r[kit,i]))`, then `loose_i_left −= pack·r[kit,i]`; `borrow_set = rem − pack`. Extra items: `borrow_item_i = max(0, Est_extra_i − loose_i_left)`. Staff override `pack' ≤ pack` ⇒ `borrow_set += (pack − pack')`. Each plan line stores `qty_est`, `qty_crit` (same algorithm with Crit) and `emergency_class` |
| Variables | `loose_i` loose stock units; `ready_kit` sets; recipes from `kit_component` |
| Rounding | `ceil` for requirement, `floor` for pack capacity |
| Edge cases | Missing recipe ⇒ `NO_RECIPE` line (manual); shared components across kits ⇒ sequential allocation (critical first); fractional kit-per-patient accumulates before ceil; zero patients ⇒ empty plan |
| Example | **Intubation Set**: Est 8, ready 4, recipe (ET tube 1, stylet 1, blade 1, 10 mL syringe 1); loose stylet 3 ⇒ use 4, pack min(4, 3) = **3**, borrow **1 whole set**. **Bus crash** red 5 / yellow 10 / green 20 with seed rules (Trauma Set 1 per patient all levels; IV Set 1 for red & yellow; Intubation Set 0.5 per red): Trauma Est 35 / Crit 5; IV Est 15 / Crit 5; Intubation Est 3 / Crit 3 |

**F-28 Emergency timeout**

| Field | Spec |
|---|---|
| Purpose | Deadline per emergency leg |
| Formula | `T_class = 3 min (critical)` or `5 min (supportive)`; `T_eff = max(1, min(T_class, ETA_remaining))` minutes |
| Variables | `ETA_remaining` minutes |
| Rounding | whole minutes |
| Edge cases | ETA ≤ 0 ⇒ 1 min, banner |
| Example | Critical, ETA remaining 2 min ⇒ T_eff = 2 |

### 9.6 F4 and cross-cutting formulas

**F-29 Mapping confidence**

| Field | Spec |
|---|---|
| Purpose | Score a suggested mapping |
| Formula | `conf = 0.40·name + 0.30·strength + 0.20·form + 0.10·pack`; `name = max(token_set_ratio, jaro_winkler)` of normalised names (0–1); `strength ∈ {1 exact normalised value+unit, 0.5 convertible, 0 mismatch}`; `form ∈ {1 exact, 0.5 compatible, 0}`; `pack ∈ {1 exact, 0.5 unknown, 0}`; if `strength = 0` then `conf = min(conf, 0.40)`. Status: ≥ 0.85 `SUGGESTED`; 0.60–0.85 `LOW_CONFIDENCE`; < 0.60 `UNMAPPED` |
| Rounding | 4 decimals |
| Edge cases | Missing strength in either name ⇒ strength = 0.5 and flag |
| Example | "AMLOdipine" 5 mg เม็ด vs "Amlodipine 5 mg tablet": name 0.97, strength 1, form 1, pack 0.5 ⇒ 0.388 + 0.30 + 0.20 + 0.05 = **0.938** `SUGGESTED` |

**F-30 Return quantity reconciliation**

| Field | Spec |
|---|---|
| Purpose | Check a return equals what was borrowed (same drug, same quantity) |
| Formula | `outstanding_base = borrowed_base − Σ returned_base` per (`obligation`, `drug_master_id`); `returned_base = Σ (qty_local × unit_conversion_factor)` (F-32). Obligation is `RETURNED` only when `outstanding_base = 0`. Returned drug must have the same `drug_master_id` as borrowed |
| Variables | `borrowed_base`, `returned_base` (canonical base units) from `borrow_leg.qty_received` and `return_receipt.qty_base` |
| Rounding | integers in base units; no rounding tolerance |
| Edge cases | Different drug ⇒ rejected (`RETURN_DRUG_MISMATCH`); over-return ⇒ rejected (excess must be handled as a new borrow by the other side); different pack size/manufacturer ⇒ allowed if totals match; lot with remaining life below `borrow.lot_min_remaining_days` ⇒ warning, lender may refuse |
| Example | Borrowed 27 ampoules; returns 10 then 17 (one lot from another manufacturer, pack of 10) ⇒ outstanding 17 → 0 ⇒ `RETURNED` |

**F-31 Value saved**

| Field | Spec |
|---|---|
| Purpose | Value dashboard THB figure |
| Formula | `value_saved = expiry_avoided + overstock_reduction − transport_cost`; `expiry_avoided = Σ acquisition_cost of units redistributed and consumed before expiry`; `overstock_reduction = (baseline_avg_excess_value − current_avg_excess_value) × holding_cost_rate` (default 0.10/yr, pro-rated); also report % reduction of under-/overstock vs baseline |
| Edge cases | No baseline ⇒ metric hidden; negative result shown as is |
| Example | expiry_avoided 4,500; baseline excess 200,000 → 150,000 over a year at 10 % ⇒ 5,000; transport 700 ⇒ **8,800 THB** |

**F-32 Unit and pack conversion**

| Field | Spec |
|---|---|
| Purpose | Compare quantities between hospitals that order in different units and pack sizes (หลอด vs กล่อง; different manufacturers) |
| Formula | `qty_base = qty_local × unit_conversion_factor` (base units per ONE local dispensing unit). Packs: `qty_base = packs × pack_size_base`, where `pack_size_base = stock_lot.pack_size_base_units` if set, else `drug_mapping.base_units_per_pack`. Lending round-up (when `lend_in_packs`): `lend_base = ceil(need_base / pack_size_base_lender_lot) × pack_size_base_lender_lot` |
| Variables | `unit_conversion_factor`, `base_units_per_pack`, `local_pack_unit`, `manufacturer` (from `drug_mapping`); `pack_size_base_units`, `manufacturer` (optional, per lot, from `stock_lot`) |
| Units | base units (tablet, ampoule, vial …) |
| Rounding | integers; conversions that produce fractions are rejected at verification (`FRACTIONAL_FACTOR` warning, pharmacist must confirm) |
| Edge cases | Missing factor or pack data ⇒ mapping cannot be VERIFIED; lot pack size differs from mapping ⇒ lot value wins; receiver shown both local and base units on documents |
| Example | Hospital A orders หลอด (factor 1, pack 1). Hospital B orders กล่อง (factor 10, pack 10 หลอด). B needs 3 กล่อง ⇒ 30 base; A's lot comes in packs of 5 ⇒ lend = ceil(30/5)×5 = 30 base (6 packs of 5) ⇒ B receives 30 base = 3 กล่อง. If A's pack is 12: lend = ceil(30/12)×12 = 36 base, B is shown 36 base (3.6 กล่อง), over-supply 6 is flagged for B to confirm or reduce to 24/36 by pharmacist decision |
