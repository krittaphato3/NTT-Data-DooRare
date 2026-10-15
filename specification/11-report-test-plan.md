## 24. Reporting and Analytics
| ID | Report | Audience | Definition | Source |
|---|---|---|---|---|
| RPT-01 | Forecast accuracy | Pharmacist, Admin | coverage of P90/P95 vs actual, MAPE per method | forecast_backtest |
| RPT-02 | Alert response time | Admin | alert created → request approved (median, p90) | stock_alert, borrow_request |
| RPT-03 | Borrow performance | Admin, Region | fulfilment %, time-to-first-accept, timeouts, rounds per request | borrow_leg |
| RPT-04 | Lender reliability | Region | ApprovalRate, AvgTimeoutRate per hospital (F-18) | reliability_stat |
| RPT-05 | Near-expiry value | Admin, Region | THB released / redistributed / expired; transport cost ratio | near_expiry_item, allocation_plan |
| RPT-06 | Repeated expiry | Procurement | flagged drugs, suggested order change, projected saving (F-25 example 14,400 THB/yr) | repeat_expiry_flag |
| RPT-07 | Incident reconciliation | Pharmacist, Auditor | borrow/return + usage summary for พ.ร.บ./UCEP | incident_usage, return_obligation |
| RPT-08 | Value dashboard | Executives | stock-outs avoided, waste avoided, time saved (metric defaults ASM-40) | value_record |
| RPT-09 | Agent quality | SYSTEM_ADMIN | fallback rate, guardrail hits, acceptance rate of proposals | agent_run, decision_log |
| RPT-10 | Mapping coverage | Data admin | % drugs VERIFIED, queue age vs SLA 3 d | drug_mapping |
Exports: CSV/PDF; scheduled monthly email (SES).

## 25. Testing Strategy
| Level | Scope | Tooling | Gate |
|---|---|---|---|
| Unit | every formula F-01..F-32 vs worked examples (R=41.43, borrow 27; intermittent R=38, borrow 23, Si 0.7357/0.6200/0.5348/0.4599, V-stop 108, E 21/14, alloc 180, 15.6 %/26.7 %, ETA 25, pack 3/borrow 1, confidence 0.938) | pytest | 100 % of examples |
| Property | invariants: borrow ≥ 0; Σ allocation = lot qty; Si ∈ [0,1]; stock never negative; held ≤ on_hand; ladder order = descending Si; R monotone in Z | hypothesis | no counterexample |
| State machine | every allowed transition passes; every disallowed transition rejected; audit written | pytest | all SM tables |
| DB | schema applies on PG16; RLS isolation per table (hospital X cannot read Y); audit append-only; partial unique indexes | pytest + testcontainers | all |
| API contract | OpenAPI schemathesis fuzz; role matrix per endpoint (x-roles) | schemathesis | 0 failures |
| Agent eval | golden set: Example 4.4 order preserved; injected instruction in lender reply ignored (G-09); invented lender id rejected (G-04); number tampering rejected (G-03); urgency lowering rejected (G-05); schema violation ⇒ FALLBACK | pytest + recorded tool results | 100 % guardrail cases |
| Integration | jobs idempotency, timeout job, SQS retry, import validation | pytest + LocalStack | all |
| E2E | scenarios SC-1..SC-6 through UI | Playwright | green |
| Non-functional | load: 100 hospitals nightly forecast < 2 h; API p95 | k6 | NFR-002/004 |
| Security | authz bypass, IDOR, injection, file upload | OWASP ZAP, manual | no High |
| Data quality | forecast backtest on mock data (10 years × 36 drugs, incl. real COVID waves and a pre-COVID baseline; train pre-COVID, test on COVID to show drift): P90/P95 coverage within ±0.05 | script | coverage_ok |

## 26. Seed Data and End-to-End Scenarios
Files: `seed-data.json` (hospitals HA–HE, 7 drugs from the source sample, scenario fixtures).

| ID | Scenario | Key steps | Expected |
|---|---|---|---|
| SC-1 | Stock alert → borrow (REGULAR; plus intermittent variant R = 38, borrow 23) | HA drug 1000147 (V), stock 15, u 10, L 3, σ 4; alert; create request; propose; approve | R = 41.43, borrow 27; lenders ranked B, C, E, D (Need 120 case); V stop at 108; E 21 / stop 14 |
| SC-2 | Lender silence | VERY_URGENT, stock 15, u 10; leg sent; no reply | T_eff 120 min; reminder at 60; at 120 timeout ⇒ next lender; no re-ask of previous |
| SC-3 | Near-expiry redistribution | lot 180 units released; split to 2 receivers; transport 700 THB vs value 4,500 | ratio 15.6 % economical ⇒ plan; with cold chain 1,200 THB ratio 26.7 % ⇒ uneconomical ⇒ 4 options; approvals; transport LOADED→ARRIVED with photos |
| SC-4 | Mass casualty | triage counts; ETA 25 min (reported or real-time route); Intubation Set need 4, ready 0, loose-packable 3 | pack 3, borrow 1 whole set (never single component); first confirm wins; reconcile |
| SC-5 | Mapping | import rows 1000016 / 1000017 (same TMT concept, different units); plus a supply row mapped from the central list | suggestions with confidence (e.g. 0.938); unit conversion factor required before VERIFIED; agents see only VERIFIED |

## 27. Implementation Plan
| Phase | Weeks | Deliverables | Exit criteria |
|---|---|---|---|
| P0 Foundations | 1–2 | repo, CI, CDK skeleton, Cognito, schema.sql migrated, RLS tests, audit chain, config service, `transition()` | RLS + audit tests green |
| P1 Data & mapping | 3–4 | imports (INT-01), drug mapping F2b UI-16, ledger/snapshots | SC-5 passes; mock data (3 y) loaded |
| P2 Forecast + alerts (F1a) | 5–7 | formulas, JOB-02/03, UI-01..03 | backtest coverage ok; AC-F1a-* |
| P3 Borrowing (F1b) | 8–11 | request/ladder/legs/timers, XC-1 docs/returns, UI-04..06,10,15 | SC-1, SC-2; AC-F1b-*, AC-XC1/2 |
| P4 Agent | 10–12 | Bedrock runner, 12 tools, guardrails, fallback, kill switch | agent eval 100 % guardrails |
| P5 Near-expiry (F2a) | 13–15 | scan, pool, allocation, cost check, approvals, transport, UI-07..09,14 | SC-3; AC-F2a-* |
| P6 Emergency (F3) | 16–18 | incident, kit calc, plan, emergency borrow, reconciliation, UI-11..13 | SC-4; AC-F3-* |
| P7 Value, reports, hardening | 19–20 | XC-3/XC-4, reports, security test, load test, UAT | NFR gates, UAT sign-off |
MVP cut for the challenge demo: P0 + P1 + P2 + P3 (+ agent minimal) + one F2a/F3 happy path. (ASSUMPTION: team size 3–4.)

## 28. Backlog
| ID | Epic | Task | Priority | Depends |
|---|---|---|---|---|
| T-001 | P0 | Apply `schema.sql`, Alembic baseline, RLS test harness | P0 | — |
| T-002 | P0 | Cognito + JWT → session vars (`app.*`) middleware | P0 | T-001 |
| T-003 | P0 | `audit_log` writer + hash verify job | P0 | T-001 |
| T-004 | P0 | `transition()` service + SM tables as data | P0 | T-001 |
| T-005 | P0 | Config service (scope lookup) + load `config-defaults.yaml` | P0 | T-001 |
| T-006 | P1 | CSV/XLSX import pipeline + validation (JOB-01) | P0 | T-001 |
| T-007 | P1 | Mapping suggester (TMT for drugs, F-29) + central-list mapping for supplies + UI-16 | P0 | T-006 |
| T-008 | P1 | Mock data generator (3 y daily, ~24 drugs) | P0 | T-006 |
| T-009 | P2 | Formulas F-01..F-08 pure functions + tests | P0 | — |
| T-010 | P2 | MA/ES + backtest residual quantiles | P0 | T-009 |
| T-011 | P2 | LightGBM quantile task | P1 | T-010 |
| T-012 | P2 | Alert evaluator (JOB-03) + UI-02/03 | P0 | T-010 |
| T-013 | P3 | Borrow calc F-09..F-13 + lender filter | P0 | T-009 |
| T-014 | P3 | Si scoring F-14..F-18 + ladder | P0 | T-013 |
| T-015 | P3 | Legs, timers (JOB-04), stop rules F-19/F-20 | P0 | T-014 |
| T-016 | P3 | UI-04/05/06 approval & response | P0 | T-015 |
| T-017 | P3 | Documents/returns (XC-1), UI-15 | P1 | T-015 |
| T-018 | P3 | Manual request XC-2, UI-10 | P1 | T-014 |
| T-019 | P4 | Agent runner + tools + schemas | P0 | T-014 |
| T-020 | P4 | Guardrails G-01..G-12 + fallback + kill switch | P0 | T-019 |
| T-021 | P4 | Agent eval suite | P0 | T-020 |
| T-022 | P5 | Near-expiry scan + UI-07 | P0 | T-006 |
| T-023 | P5 | Pool + allocation F-22/F-23 + 4 options + UI-08/09 | P0 | T-022 |
| T-024 | P5 | Approvals / auto-approve / 48 h timeout | P0 | T-023 |
| T-025 | P5 | Transport + photos (S3) + UI-14 | P1 | T-024 |
| T-026 | P5 | Repeat-expiry detection F-25 | P2 | T-022 |
| T-027 | P6 | Incident intake + duplicate check + UI-11 | P0 | T-004 |
| T-028 | P6 | Kit calc F-27, plan ladder, UI-12 | P0 | T-027 |
| T-029 | P6 | Emergency borrow (first-confirm-wins) + ETA F-26 | P0 | T-028 |
| T-030 | P6 | Kit prep + ready-set stock UI-13 | P1 | T-028 |
| T-031 | P6 | Reconciliation + UCEP report | P1 | T-029 |
| T-032 | P7 | Context signals XC-3 | P2 | T-012 |
| T-033 | P7 | Value dashboard XC-4 + RPT-01..10 | P1 | T-015 |
| T-034 | P7 | Security tests, load tests, UAT | P0 | all |
| T-035 | P7 | IaC (CDK), staging/prod pipelines | P0 | T-001 |

## 29. Acceptance Criteria (Gherkin)
```gherkin
Feature: F1a Forecast and alerts
  Scenario: AC-F1a-01 Method chosen by pattern and price
    Given a drug with CV <= 0.5, active-day ratio > 0.30 and 12 months of history
    When the nightly forecast runs
    Then method is MA_ES and P90/P95 come from weekly rolling backtest residuals
  Scenario: AC-F1a-02 Cheap D item uses Min-Max and never enters the agent
    Given a D-class drug priced below 50 THB
    When the forecast runs
    Then method is MIN_MAX and no agent_run exists for it
  Scenario: AC-F1a-03 VED buffer
    Given a V drug and an E drug with identical demand
    Then V target uses P95 (Z 1.65) and E target uses P90 (Z 1.28); D has no buffer
  Scenario: AC-F1a-04 Cold start
    Given a drug with fewer than 90 days of history
    Then confidence_flag is LOW_CONFIDENCE and no ML method is used
  Scenario: AC-F1a-05 Alert severity
    Given V drug stock covering 2 days or less
    Then a VERY_URGENT alert is created once, and a repeat evaluation does not duplicate it
  Scenario: AC-F1a-06 Stale data
    Given no stock update for 7 days
    Then a DATA_STALE alert is raised and forecast-based LOW_STOCK alerts are suppressed

Feature: F1b Borrowing
  Scenario: AC-F1b-01 Required quantity
    Given u=10, L=3, sigma=4, Z=1.65, stock=15, incoming=0
    Then R is 41.43 and borrow quantity is 27
  Scenario: AC-F1b-11 Intermittent demand uses quantile buffer
    Given a V drug with demand_pattern INTERMITTENT, lead-time P95 demand 38, stock 15, incoming 0
    Then R is 38 and borrow quantity is 23 and Z*sigma*sqrt(L) is not used
  Scenario: AC-F1b-02 Hard time filter
    Given a lender whose Ttransit exceeds Window_max
    Then the lender is excluded from the ladder
  Scenario: AC-F1b-03 Ranking
    Given the Worked example 4.4 data
    Then Si values are 0.7357, 0.6200, 0.5348, 0.4599 and the order is B, C, E, D
  Scenario: AC-F1b-04 Human approval required
    Given a DRAFT request with an agent proposal
    Then no leg is sent until a pharmacist approves
  Scenario: AC-F1b-05 Parallel sending only when very urgent
    Given a VERY_URGENT request
    Then up to 3 lenders are asked in parallel; for URGENT or NORMAL only one
  Scenario: AC-F1b-06 Timeout equals rejection
    Given a leg unanswered at its deadline
    Then it becomes TIMED_OUT and the next lender is asked without re-asking earlier lenders
  Scenario: AC-F1b-07 Reminder at 50 percent
    Given VERY_URGENT with T_eff 120 minutes
    Then one reminder is sent at 60 minutes
  Scenario: AC-F1b-08 Stop rules
    Given V first round 120 and fulfilled 108
    Then the request is FULFILLED; for E, stop only at 100 percent of normal use
  Scenario: AC-F1b-09 Agent output rejected on tampering
    Given an agent output whose lender order differs from the code ladder
    Then the output is rejected, status FALLBACK, and the template message is used
  Scenario: AC-F1b-10 Stock moves on confirmation
    Given an ACCEPTED leg
    Then lender stock decreases only at LOADED and borrower stock increases only at RECEIVED

Feature: XC cross-cutting
  Scenario: AC-XC1-01 Borrow slip
    Given an accepted leg
    Then a PDF slip with lot, expiry, quantity, local and canonical unit is stored with its hash
  Scenario: AC-XC1-02 Default return
    Given a completed borrow
    Then a return obligation is created due in 30 days for the same drug and same base-unit quantity, and no payment option exists
  Scenario: AC-XC1-04 Return must match
    Given an obligation of 27 ampoules of drug X
    When the borrower records a return of drug Y, or 30 ampoules of drug X
    Then the return is rejected with RETURN_DRUG_MISMATCH or over-return error
    And returning 10 then 17 ampoules of drug X closes the obligation
  Scenario: AC-XC1-03 Return reminders
    Given an open obligation
    Then reminders are sent 7 days and 1 day before due and it becomes OVERDUE after due date
  Scenario: AC-XC2-01 Manual request
    Given a pharmacist creates a manual request with a reason
    Then the same filter, scoring and approval rules apply with context MANUAL
  Scenario: AC-XC2-02 Duplicate
    Given an open request for the same drug exists
    Then creation shows a warning with a link and is blocked while an agent request is active
  Scenario: AC-XC3-01 Context signal is advisory
    Given an approved outbreak signal
    Then the agent may suggest raising urgency by one level but code urgency is unchanged
  Scenario: AC-XC4-01 Value metrics
    Given fulfilled requests and redistributed lots
    Then value_record rows are aggregated daily and displayed on the dashboard

Feature: F2a Near-expiry redistribution
  Scenario: AC-F2a-01 Detection
    Given a lot with 170 days left and threshold 180
    Then a near-expiry item DETECTED is created
  Scenario: AC-F2a-02 Release holds the lot
    When the pharmacist releases the lot
    Then it is HELD at the origin hospital, excluded from usable stock, and listed in the regional pool
  Scenario: AC-F2a-03 Split
    Given a 180-unit lot and two receivers
    Then allocated quantities sum to 180 and each receiver can use its share before expiry
  Scenario: AC-F2a-04 Cost check
    Given transport 700 THB and value 4,500 THB
    Then ratio is 15.6 percent and the plan is economical
  Scenario: AC-F2a-05 Uneconomical lot
    Given transport 1,200 THB (cold chain) and value 4,500 THB
    Then ratio is 26.7 percent and the 4 options are offered
  Scenario: AC-F2a-06 Approvals
    Given a cross-network plan
    Then all involved pharmacists must approve; any rejection or 48 hours without reply sets NEEDS_DISCUSSION
  Scenario: AC-F2a-07 Auto-approve in network
    Given all hospitals are in one network with auto_approve true
    Then the plan is AUTO_APPROVED and audited
  Scenario: AC-F2a-08 Transport and cancel
    Given transport WAITING_DISPATCH
    Then cancel requires both hospitals' consent; after LOADED cancel is rejected

Feature: F2a offline transport
  Scenario: AC-F2a-09 Offline queue and sync
    Given a driver with no signal who changes status to LOADED and takes 3 photos
    Then the events are stored locally with client event ids and shown as pending sync
    When signal returns
    Then they upload in order, the server stores captured_at and received_at, and re-sending the same event creates no duplicate

Feature: F2b Drug code mapping
  Scenario: AC-F2b-01 Only verified mappings are used
    Given a SUGGESTED mapping
    Then no agent tool or matching job returns that drug
  Scenario: AC-F2b-03 Pack size per hospital
    Given hospital A orders in หลอด (pack 1) and hospital B in กล่อง (10 หลอด per กล่อง)
    Then both mappings store their own factor and pack data, and a lend of 30 base units shows as 30 หลอด for A and 3 กล่อง for B
  Scenario: AC-F2b-04 Supply mapped from the central list (rev 1.3)
    Given a hospital row "ถุงมือไนไตรล์ M" of item_type SUPPLY and a central-list item with internal_code SUP-0004
    When the data admin selects that central-list item, enters the unit factor and pack data, and verifies
    Then the mapping has method CENTRAL_LIST, no confidence score, and agents may use the row
  Scenario: AC-F2b-05 Drug requires TMT (rev 1.3)
    Given a row of item_type DRUG without a TMT GP
    Then it cannot be VERIFIED and stays UNMATCHED
  Scenario: AC-F2b-06 24-digit column ignored (rev 1.3)
    Given an imported file containing a 24-digit code column
    Then the column is ignored and nothing from it is stored
  Scenario: AC-F2b-02 Unit conflict
    Given two local drugs mapped to the same TMT concept with different units
    Then verification requires a unit conversion factor

Feature: F3 Emergency preparation
  Scenario: AC-F3-01 Counts to plan
    Given triage counts entered
    Then Estimated (all levels) and Critical Minimum (red only) are computed by code, and buffer is their difference
  Scenario: AC-F3-02 Plan order
    Then the ladder is ready sets, pack from loose stock, borrow whole set, expand, item-level borrow
  Scenario: AC-F3-03 Whole set only
    Given need 4 Intubation Sets, ready 0, loose-packable 3
    Then pack 3 and borrow 1 whole set, never a single component
  Scenario: AC-F3-04 Real sets untouched
    Then ready sets are never opened to supply loose items
  Scenario: AC-F3-05 First confirm wins
    Given simultaneous requests to several hospitals
    Then the first confirmation wins and others are cancelled
  Scenario: AC-F3-06 Partial
    Given a partial confirmation
    Then a follow-up request for the remainder is created
  Scenario: AC-F3-07 Timeouts
    Then critical items time out at 3 minutes, supportive at 5, never exceeding ETA
  Scenario: AC-F3-08 ETA
    Given no reported ETA and a real-time route result of 25 minutes
    Then ETA is 25 minutes from the route call and no cached or speed-table value is used
  Scenario: AC-F3-11 Route service down
    Given no reported ETA and the route service times out twice
    Then ETA_UNAVAILABLE is set, staff are told to use radio, and no estimated number is shown
  Scenario: AC-F3-12 Blood PRC O borrow
    Given an emergency incident and both hospitals have a blood bank
    When the pharmacist adds 4 units of PRC group O as an extra line
    Then the line is created with the notice "blood bank confirmation required" and a BLOOD_REPLACEMENT return obligation is generated on confirmation
  Scenario: AC-F3-13 Other blood products
    Given the plan needs FFP or platelets
    Then only the reminder "request via blood bank" is shown and no plan line or stock row is created
  Scenario: AC-F3-14 Blood excluded from F1 and F2
    Given a drug_master with is_blood_product true
    Then the nightly forecast and the monthly near-expiry scan skip it
  Scenario: AC-F3-09 Duplicate incident
    Given an incident within 10 minutes and 500 m
    Then the user is prompted to merge
  Scenario: AC-F3-10 Reconciliation
    When the incident is closed
    Then a borrow/return summary and usage summary report are generated

Feature: F4 Platform
  Scenario: AC-F4-01 Audit
    Then every state change writes an audit row and the chain verifies
  Scenario: AC-F4-02 Tenant isolation
    Given user of hospital X
    Then rows of hospital Y are invisible except borrow parties
  Scenario: AC-F4-03 Kill switch
    Given kill switch ON
    Then agent is SKIPPED and workflows continue with templates
  Scenario: AC-F4-04 Optimistic lock
    Given two pharmacists approve the same version
    Then the second receives 409 VERSION_CONFLICT
```

## 30. Machine-Readable Deliverables
| File | Content | Validation done |
|---|---|---|
| `schema.sql` | PostgreSQL 16 DDL, 62 tables, enums, RLS (18 policies), triggers, views | executed on real PostgreSQL; audit chain + append-only verified |
| `openapi.yaml` | 82 operations, schemas, parameters, problem+json | openapi-spec-validator |
| `agent-tool-schemas.json` | 12 tools, 8 output schemas, model params | JSON Schema check + positive/negative examples |
| `config-defaults.yaml` | all configurable thresholds | YAML parse |
| `seed-data.json` | scenario fixtures SC-1..SC-6 | JSON parse |
| `.env.example`, `docker-compose.yml` | local environment | YAML parse |
