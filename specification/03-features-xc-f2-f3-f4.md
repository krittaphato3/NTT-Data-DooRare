
---

### 7.C Feature XC-1 — Transfer/Return Documents & Return Tracking (เอกสารยืม-คืนอัตโนมัติ)

**7.1 Overview.** Generates printable, versioned documents the moment a shipment is approved, and tracks goods owed back ("ค้างคืน") until returned. Used by F1b borrowing, F2a transfers and F3 emergency borrowing.
**7.2 Objective.** Meet warehouse and audit formalities without manual typing; no borrowed item left unaccounted for.
**7.3 Actors.** Lender PHARMACIST/WAREHOUSE_OFFICER, borrower PHARMACIST/WAREHOUSE_OFFICER, system, AUDITOR (read).
**7.4 Preconditions.** Lender confirmation recorded (F1b/F3) or allocation plan approved (F2a); lots selected; both hospitals have legal names/addresses/signatories configured.
**7.5 Inputs.** Leg/plan data, lot numbers and expiry dates, delivery method incl. cold-chain handling, return terms, due date, hospital master data.
**7.6 Outputs.** `transfer_document` (+ lines) with PDF in S3, `return_obligation`, reminders.

**7.7 Main flow** (FL-10)
1. Event `LEG_CONFIRMED` / `PLAN_APPROVED` / `INCIDENT_BORROW_CONFIRMED` → document job.
2. Build document: number, lender and borrower names, item lines (drug, quantity, lot no., expiry date), delivery method (cold-chain instruction if flag), return terms (in kind only: same drug, same quantity; due date), signature blocks for both hospitals.
3. Render PDF (Sarabun font), store in S3 with SHA-256, mark `ISSUED`; printable immediately.
4. Create `return_obligation` for borrow documents (not for F2 transfers, which are permanent transfers without return, ASM-38).
5. Reminder job: due−7 d, due−1 d, daily when overdue (ASM-24) to borrower and lender pharmacists.
6. Return: borrower creates return document (lots/qty in base units; must equal the outstanding quantity of the same drug, F-30) → lender confirms receipt → obligation `RETURNED`. For blood (`return_mode = BLOOD_REPLACEMENT`) the borrower's blood bank replaces the units and the lender blood bank confirms receipt (BR-XC-013).

**7.8 Alternatives.** Quantity changed after issue ⇒ new document version, old `VOID`; return partially in several shipments (each recorded; obligation closes only when cumulative returned = borrowed); both parties agree to extend due date (audit).
**7.9 Errors.** PDF render failure ⇒ retry 3×, then alert and allow HTML print view; missing hospital signatory ⇒ document still issues with blank signature line and a warning; sequence collision ⇒ retry with next number.
**7.10 Rules.** BR-XC-001…BR-XC-008.
**7.11 Calculation.** F-30 return quantity reconciliation.
**7.12 Approval.** Document issue is automatic **after** the approval events; signatures are physical/offline; electronic acknowledgement button for both parties (audited).
**7.13 Agent.** None (agent may draft free-text delivery notes only; excluded from legal fields).
**7.14 UI.** UI-15 Document Printing, UI-05 Request Detail (documents tab), UI-01 overdue widget.
**7.15 API.** `GET /documents`, `GET /documents/{id}`, `GET /documents/{id}/pdf`, `POST /documents/{id}/void`, `GET /return-obligations`, `POST /return-obligations/{id}/returns`, `POST /return-obligations/{id}/extend`.
**7.16 DB.** `transfer_document`, `transfer_document_line`, `return_obligation`, `transport_record`, `notification`, `audit_log`.
**7.17 Notifications.** Document issued; return due soon; overdue; return received.
**7.18 Documents.** BORROW_RETURN, TRANSFER, INCIDENT_BORROW_SUMMARY, INCIDENT_USAGE_SUMMARY.
**7.19 Edge cases.** Lot split across two lots ⇒ two lines; borrowed lot later recalled ⇒ document annotated, obligation stays in kind (replacement lot of same drug); drug unit differs between hospitals ⇒ document shows both local unit and canonical unit; duplicate print is allowed, content identical (hash).
**7.20 Acceptance.** AC-XC1-01…03.

| ID | Requirement |
|---|---|
| FR-XC-001 | Documents shall be generated automatically on lender confirmation (F1b/F3) and on allocation-plan approval (F2a) and be printable immediately. |
| FR-XC-002 | A document shall contain: number, lender, borrower, items with quantity, lot number and expiry date, delivery method (incl. cold chain), return terms and due date, and signature fields for both parties. |
| FR-XC-003 | The system shall track outstanding returns ("ค้างคืน") and notify at due−7 d, due−1 d and daily while overdue. |
| FR-XC-004 | The system shall support returns **in kind only** (same drug, same base-unit quantity; F-30) and partial returns; payment-based return shall not exist. Blood (PRC O) is returned by replacement through the blood bank (BR-XC-013). |
| FR-XC-005 | Document content shall be immutable once issued; corrections create a new version and void the previous one. |
| FR-XC-006 | Document PDFs shall be stored with hash and be accessible only to the two involved hospitals, region admin and auditors. |

---

### 7.D Feature XC-2 — Manual Request (การสร้างคำขอแบบ Manual)

**7.1 Overview.** Officers can create borrow requests (F1 §10.3) and near-expiry transfer requests (F2 §7) themselves when the Agent is unavailable or the need is outside the automatic flow.
**7.2 Objective.** Keep the process usable when automation is off, and allow needs the forecast cannot see.
**7.3 Actors.** PROCUREMENT_OFFICER (draft), PHARMACIST (approve), ER_STAFF (emergency items), lender staff.
**7.4 Preconditions.** User has permission; drug mapping Verified; not a controlled drug (those use `CONTROLLED_MANUAL` template without automation).
**7.5 Inputs.** Drug(s), quantity, urgency, preferred lender(s) optional, reason (mandatory), needed-by time.
**7.6 Outputs.** A `borrow_request` with `source = MANUAL` (F1) or `allocation_plan` with `source = MANUAL` (F2).

**7.7 Main flow** (FL-13)
1. Officer chooses drug and quantity; system shows computed need, days-to-stock-out and urgency for reference.
2. System lists lender candidates with Hard-Filter result and Si for each.
3. Validation: **hard blocks** — lender = requester, quantity > lender usable stock, controlled drug, cold-chain capability missing, mapping not Verified. **Warnings** (reason required) — `Ttransit > Window_max`, quantity > calculated need, quantity > LendableStock.
4. Submit ⇒ same approval, timeout, reminders, documents and logging as Agent requests (F1 §10.3: same flow and documents).
5. F2 manual: multi-hospital plans need approval of all involved pharmacists (F2 §2.6); same-network plans follow Auto Approve (F2 §4, see F2a).
**7.8 Alternatives.** Save as draft; clone a previous request; add several items (F1 header supports multiple items).
**7.9 Errors.** Validation failure ⇒ inline message and no submit; stale stock numbers ⇒ refreshed with banner.
**7.10 Rules.** BR-F1b-037, BR-F2a-020, BR-F2a-021.
**7.11–7.13** As F1b/F2a. Agent not required; Agent may be asked to explain/rank only.
**7.14 UI.** UI-10 Manual Request Creation. **7.15 API.** `POST /borrow-requests` (`source = MANUAL`), `POST /allocation-plans` (`source = MANUAL`).
**7.16 DB.** `borrow_request`, `borrow_request_item`, `allocation_plan`, `allocation_line`.
**7.17 Notifications.** Same as F1b/F2a. **7.18 Documents.** Same as XC-1.
**7.19 Edge cases.** Duplicate of an existing open request for the same drug ⇒ warning with link; request for a drug with an active Agent request ⇒ blocked unless the Agent request is cancelled.
**7.20 Acceptance.** AC-XC2-01…02.

| ID | Requirement |
|---|---|
| FR-XC-010 | Authorised officers shall be able to create manual borrow requests with drug, quantity, urgency and reason. |
| FR-XC-011 | Manual borrow requests shall go through the same approval, timeout, reminder and document flow as Agent requests. |
| FR-XC-012 | The system shall enforce the hard blocks and show warnings listed in 7.7-3 before submit. |
| FR-XC-013 | Manual multi-hospital near-expiry requests shall require approval of all involved pharmacists; manual same-network requests shall use Auto Approve. |

---

### 7.E Feature XC-3 — Context Agent (ตัวช่วยบริบทภายนอก)

**7.1 Overview.** Gathers external context (disease outbreaks/seasons, events in the area, abnormal demand in nearby hospitals) so the F1 Agent can judge urgency better (F1 §10.2).
**7.2 Objective.** Raise urgency early when many hospitals show the same abnormal demand or an outbreak is under way.
**7.3 Actors.** HOSPITAL_ADMIN/REGION_ADMIN/SYSTEM_ADMIN (enter signals), Context Agent, F1 Agent (consumer).
**7.4 Preconditions.** Context sources configured (Q-10). Initial build: manual signals + seasonal calendar.
**7.5 Inputs.** Signals: type (`OUTBREAK`, `SEASON`, `EVENT`, `ABNORMAL_DEMAND`), scope (hospital/region), related drug groups/drugs, severity 0–3, validity window, free-text note, source.
**7.6 Outputs.** `context_signal` rows; computed `abnormal_demand` signals (code, not LLM): a drug is abnormal in a region when ≥ 3 hospitals show `stock < Predict` or usage > P90 in the same week (config).
**7.7 Main flow.** (1) Job `JOB-12` computes abnormal-demand signals nightly. (2) Admins add outbreak/event signals. (3) Context Agent summarises active signals per drug into ≤ 300-character text snippets with source IDs. (4) F1 Agent receives signals as **data**; it may raise urgency one level citing signal IDs.
**7.8 Alternatives.** No signals ⇒ F1 Agent runs without context. **7.9 Errors.** Source unavailable ⇒ keep last signals until expiry; free-text containing instructions ⇒ treated as data (prompt-injection rule AGT-F1-012).
**7.10 Rules.** BR-F1b-039, AGT-F1-009.
**7.11 Calculation.** Abnormal-demand test (deterministic, config thresholds). **7.12 Approval.** None for read; creating signals requires admin role. **7.13 Agent.** Summarisation only; no numbers.
**7.14 UI.** UI-17 Configuration (signals tab), UI-05 (signals shown on request detail). **7.15 API.** `GET/POST/PATCH /context-signals`.
**7.16 DB.** `context_signal`. **7.17 Notifications.** "Abnormal demand detected for drug X in region Y". **7.18 Reports.** Signals history.
**7.19 Edge cases.** Conflicting signals (outbreak ends) ⇒ latest `valid_to` wins; expired signals ignored; signal about a drug not mapped ⇒ rejected.
**7.20 Acceptance.** AC-XC3-01.

| ID | Requirement |
|---|---|
| FR-XC-020 | The system shall store context signals with type, scope, drug tags, severity, validity window and source. |
| FR-XC-021 | The system shall compute abnormal-demand signals by code from region data nightly. |
| FR-XC-022 | The F1 Agent shall receive active signals for the drug/region as structured data and may only raise urgency by one level, citing signal IDs. |

---

### 7.F Feature XC-4 — Value Dashboard & Metrics (ตัวชี้วัด Value)

**7.1 Overview.** Shows how much under-/overstock and expiry loss Doo Rare reduced, in % and THB (F1 §11). Admin sees all hospitals; each hospital sees only itself.
**7.2 Objective.** Prove value; support improvement.
**7.3 Actors.** SYSTEM_ADMIN, REGION_ADMIN, HOSPITAL_ADMIN, PHARMACIST, AUDITOR.
**7.4 Preconditions.** ≥ 3 months of operation for trends; baseline period defined per hospital (config) or pre-onboarding import.
**7.5 Inputs.** Stock history, alerts, requests, expiry events, transport costs, forecasts.
**7.6 Outputs.** `value_metric_snapshot` (daily/weekly/monthly), dashboards, exports.
**7.7 Flow.** `JOB-11` aggregates metrics (F-31 value saved, §24 definitions) → snapshots → dashboard queries with RLS scope.
**7.8 Alternatives.** Export CSV/PDF. **7.9 Errors.** Missing baseline ⇒ metric shows "no baseline", not zero.
**7.10 Rules.** BR-XC-010…012. **7.11 Calculation.** F-24, F-31. **7.12 Approval.** None. **7.13 Agent.** Optional natural-language explanation of metric trends (no numbers computed by LLM).
**7.14 UI.** UI-01, UI-19. **7.15 API.** `GET /reports/value`, `GET /reports/operations`, `GET /reports/forecast-accuracy`.
**7.16 DB.** `value_metric_snapshot`, `report_definition`. **7.17 Notifications.** Monthly report ready. **7.18 Reports.** §24.
**7.19 Edge cases.** Hospital leaves region ⇒ historical snapshots stay scoped to it; currency always THB. **7.20 Acceptance.** AC-XC4-01.

| ID | Requirement |
|---|---|
| FR-XC-030 | The system shall compute and store value metrics (under/overstock reduction %, expired value avoided, shortage-to-supply time, THB saved) per hospital, region and global. |
| FR-XC-031 | SYSTEM_ADMIN shall see all hospitals; hospital users shall see only their own hospital's metrics. |
| FR-XC-032 | Metrics shall state their definition and baseline in the UI. |

---

### 7.G Feature F2a — Near-Expiry Release & Allocation (ระบบจัดการยาและเวชภัณฑ์ใกล้หมดอายุ)

**7.1 Feature Overview.** Hospitals' near-expiry lots are detected, reviewed and released by the owning pharmacist into a regional pool (data only; goods stay at origin, status ถูกกันไว้). The Agent plans matches and splits to hospitals that will use the goods in time. Pharmacists of all involved hospitals approve (unless same-network auto-approve). Transport is tracked with photos; documents are auto-generated.
**7.2 Business Objective.** Convert potential expiry loss into used stock; reduce pharmacist workload; fix stock imbalance between hospitals.
**7.3 Actors.** Owner PHARMACIST, receiver PHARMACIST, WAREHOUSE_OFFICER, DRIVER, REGION_ADMIN (resolve discussion), Agent, scheduler.
**7.4 Preconditions.** Lot has expiry date and positive usable quantity; drug mapping Verified (F4) at origin and candidate receivers; receivers' forecasts/usage available.
**7.5 Inputs.** Lots, per-drug thresholds, pool, receiver stock/Total Target/usage, F1 forecast, distance matrix, transport cost model, cold-chain flag.
**7.6 Outputs.** `near_expiry_item`, `allocation_plan` + `allocation_line`, `transport_record`/`transport_event`, documents, `expiry_finding` (via F2b).

**7.7 Main Process Flow** (FL-11, FL-12, FL-14; SM-2, SM-5, SM-6)
1. **Detect** (`JOB-05`): lots with remaining days ≤ drug threshold (ASM-14) and available quantity > 0 ⇒ `near_expiry_item` `DETECTED` → `PENDING_PHARMACIST_REVIEW`; notify owner pharmacist.
2. **Review & release**: pharmacist checks, may **edit** the quantity to release (≤ available), confirms release or keeps for own use. Confirm ⇒ `RELEASED_TO_POOL`: quantity becomes `held` (ASM-12), visible to all hospitals in the health region as pool data.
3. **Match** (`JOB-06`, event on pool change): deterministic candidate generation + Agent plan (AGT-F2-001…). Considered: receiver stock below safe level with usage; deficit vs F1 forecast; receiver usage rate; remaining life > transit + consumption time (F-22); verified mapping only; split if lot exceeds one hospital's consumption.
4. **Economics** (F-23): each line with `transport_cost ≥ ratio × value` is flagged `UNECONOMICAL`; Agent does **not** recommend shipping; owner pharmacist is notified and chooses: return to manufacturer/distributor (ส่งคืนผู้ผลิต/ผู้จัดจำหน่าย), adjust use in own hospital, destroy per regulation, or accept shipping as is. Pharmacist decides and confirms (final).
5. **Approval** (ยกเว้น auto-approve): each involved hospital's pharmacist reviews and approves. All approved ⇒ plan `APPROVED`. Any rejection/timeout (ASM-16) ⇒ `NEEDS_DISCUSSION`: pharmacists meet, plan lines edited, re-approval.
6. **Documents**: transfer document generated automatically for printing (XC-1).
7. **Transport**: officer updates status `WAITING_DISPATCH → LOADED → IN_TRANSIT → ARRIVED`; the driver (a hospital employee) can photograph goods and add photos as evidence, even offline (photos and status events are queued on the device and synced when signal returns, FR-F2a-016); lender stock decreases at `LOADED`; receiving officer confirms receipt ⇒ receiver stock increases ⇒ item `DELIVERED`.
8. **Cancellation**: allowed only while `WAITING_DISPATCH` and with consent of **both** hospitals; lot returns to origin hospital stock (held quantity released).

**7.8 Alternative Flows.**
- A1 Same-network auto-approve (F2 §4, FL-14): requests among hospitals of one network skip step 5; documents are issued and the request is sent in one step, default status `APPROVED` (auto); involved pharmacists can still edit or cancel before `LOADED`.
- A2 Manual request (XC-2) replaces step 3.
- A3 Partial allocation: remaining quantity stays in pool for the next matching run.
- A4 Pharmacist declines to release ⇒ item `KEPT_LOCAL`; re-detected only if threshold crossed again by a different lot.
- A5 Lot reaches expiry before shipment ⇒ item `EXPIRED`; write-off recorded; counts for F2b.
**7.9 Exception/Error Flows.** Mapping not Verified ⇒ lot excluded from matching, owner told to verify; no receiver found ⇒ stays in pool, owner shown options (same four as uneconomical); plan edit conflicts ⇒ version check 409; photo upload fails ⇒ transport update saved, photo retry queued; remaining life < transit time at dispatch ⇒ block `LOADED` with message.
**7.10 Business Rules.** BR-F2a-001 … BR-F2a-030.
**7.11 Calculation Rules.** F-22 expiry feasibility and allocation quantity, F-23 transport economics.
**7.12 Approval Rules.** A3 owner release; A4 all involved pharmacists approve; A5 uneconomical option; A6 mutual cancel consent; auto-approve exception for same network.
**7.13 Agent Involvement.** Plans matching and splitting; explains each line; may not change quantities beyond tool-computed feasibility; fallback = greedy deterministic allocation (F-22).
**7.14 UI.** UI-07 Near-Expiry Review, UI-08 Central Pool, UI-09 Allocation Plan Review, UI-10 Manual Request, UI-14 Transport Tracking, UI-15 Documents.
**7.15 API.** `GET /near-expiry-items`, `POST /near-expiry-items/{id}/release`, `POST /near-expiry-items/{id}/keep`, `GET /pool`, `GET /allocation-plans`, `POST /allocation-plans/{id}/approve|reject|cancel`, `PATCH /allocation-plans/{id}/lines/{lineId}`, `POST /allocation-lines/{id}/uneconomical-decision`, `PATCH /transport-records/{id}` (status), `POST /transport-records/{id}/photos`, `POST /allocation-lines/{id}/receipt`.
**7.16 DB.** `near_expiry_item`, `inventory_lot`, `allocation_plan`, `allocation_plan_approval`, `allocation_line`, `transport_record`, `transport_event`, `transfer_document`, `distance_matrix`, `inventory_transaction`.
**7.17 Notifications.** Review needed; plan awaiting approval (+50 % reminder); plan needs discussion; uneconomical decision needed; dispatch/arrival; cancellation request/consent; document issued.
**7.18 Documents.** Transfer document; weekly expiry report.
**7.19 Edge Cases.**

| # | Case | Behaviour |
|---|---|---|
| 1 | Lot expires while plan pending approval | Plan line invalidated, plan flagged `STALE`, pharmacists notified |
| 2 | Lot partly dispensed locally after release | Origin cannot dispense held quantity; if physically short, origin reduces release (audit) |
| 3 | Receiver stock rises (e.g., purchase arrives) before approval | Line recomputed; if need = 0 line dropped |
| 4 | Cold-chain item | Transit time must be ≤ cool-box validity; document includes handling; extra surcharge in cost |
| 5 | Same drug released by two hospitals | Matching treats pool as one supply; prefers closer origin for the same receiver |
| 6 | Receiver's unit or pack size differs | Quantities converted by `unit_conversion_factor` and pack size (F-32); unconverted ⇒ blocked; pack-rounded surplus flagged |
| 7 | Photo contains people | Upload guidance + reporting; photos not shown outside the involved hospitals |
| 8 | Network membership changed | Auto-approve evaluated at plan creation time and re-checked at dispatch |
| 9 | Plan approval timeout | `NEEDS_DISCUSSION`; reminder to REGION_ADMIN |
| 10 | Cancel after LOADED | Not allowed; use a new return transfer |

**7.20 Acceptance.** AC-F2a-01…AC-F2a-08.

| ID | Requirement |
|---|---|
| FR-F2a-001 | The system shall scan lots nightly and create near-expiry items for lots with remaining days ≤ the drug's threshold. |
| FR-F2a-002 | The owner pharmacist shall be able to review, edit the release quantity, and confirm or decline release. |
| FR-F2a-003 | Released quantities shall appear in a region-wide central pool with status "ถูกกันไว้" while goods stay at the origin hospital. |
| FR-F2a-004 | The Agent shall plan matching and splitting across receivers using only Verified mappings, F1 forecasts, receiver usage rate and the remaining-life rule (F-22). |
| FR-F2a-005 | The system shall flag uneconomical shipping (F-23), withhold the recommendation and offer the four options to the owner pharmacist who makes the final choice. |
| FR-F2a-006 | Plans shall require approval of every involved hospital's pharmacist, except same-network auto-approve (FR-F2a-010). |
| FR-F2a-007 | Incomplete approval or approval timeout shall move the plan to `NEEDS_DISCUSSION` and allow editing and re-approval. |
| FR-F2a-008 | The system shall auto-generate printable transfer documents once a plan is approved. |
| FR-F2a-009 | Officers shall update transport status (waiting, loaded, in transit, arrived); drivers shall be able to attach photos. |
| FR-F2a-016 | The transport screen (UI-14) shall be offline-first: status changes and photos are saved in a local queue (IndexedDB) with a client event id and capture time, shown as "รอซิงก์ / pending sync", and uploaded automatically in order when connectivity returns; the server shall accept each event idempotently and keep both `captured_at` (device) and `received_at` (server). |
| FR-F2a-010 | Hospitals of the same network shall be able to create requests directly with Auto Approve: default approved, sent in one step, editable/cancellable by involved pharmacists. |
| FR-F2a-011 | Cancellation shall be allowed only in `WAITING_DISPATCH`, require consent of both hospitals, and return the lot to the origin hospital's stock. |
| FR-F2a-012 | Stock shall move only on `LOADED` (origin out) and on receipt confirmation (receiver in). |
| FR-F2a-013 | Held (pool) quantities shall be excluded from F1 usable and lendable stock. |
| FR-F2a-014 | The system shall allow manual requests (XC-2) in addition to Agent plans. |
| FR-F2a-015 | Every release, approval, edit, cancel, transport update and photo shall be audit-logged. |

---

### 7.H Feature F2b — Repeated-Expiry Detection (ระบบตรวจจับยาหมดอายุซ้ำ)

**7.1 Overview.** Finds drugs that expire (or must be released because of near-expiry) repeatedly in the same hospital and recommends smaller purchase quantities, with expected savings (F2 §3).
**7.2 Objective.** Remove the root cause of expiry waste (over-ordering) and show money saved.
**7.3 Actors.** PHARMACIST, PROCUREMENT_OFFICER, scheduler.
**7.4 Preconditions.** ≥ 12 months of lot/expiry history or the period available; GPU-level mapping (F4).
**7.5 Inputs.** Expired write-offs, near-expiry releases, order quantities per cycle, usage rate, price, thresholds.
**7.6 Outputs.** `expiry_finding` with level `WATCH`/`RECOMMEND`, recommended order reduction, expected savings.
**7.7 Main flow** (JOB-07): for each hospital × GPU, count in the trailing 12 months the **lots that actually expired or were released to the pool because of near-expiry**, excluding events a pharmacist flagged as exceptions (recall, change of treatment protocol). Count ≥ 2 ⇒ `WATCH`. Count ≥ 3 **or** cumulative lost value ≥ threshold (pharmacist-configurable) ⇒ `RECOMMEND` with F-25 numbers.
**7.8 Alternatives.** Pharmacist dismisses with reason (suppress 90 days); excludes an event with reason.
**7.9 Errors.** Missing order history ⇒ recommendation without quantity, shows "needs order data".
**7.10 Rules.** BR-F2b-001…006. **7.11 Calc.** F-25. **7.12 Approval.** Pharmacist accepts/dismisses; the system never changes purchasing. **7.13 Agent.** Optional explanation text.
**7.14 UI.** UI-01 (widget), UI-19 (report tab), UI-07 (history). **7.15 API.** `GET /expiry-findings`, `PATCH /expiry-findings/{id}`, `POST /expiry-events/{id}/exclude`.
**7.16 DB.** `expiry_finding`, `near_expiry_item`, `inventory_lot`, `open_purchase_order`. **7.17 Notifications.** New WATCH/RECOMMEND finding. **7.18 Reports.** Quarterly expiry report.
**7.19 Edge cases.** Different local codes of the same GPU are counted together; event excluded after finding created ⇒ recalculated; recommended order below usage need ⇒ clamped (F-25).
**7.20 Acceptance.** AC-F2b-01…02.

| ID | Requirement |
|---|---|
| FR-F2b-001 | The system shall count per hospital and GPU-level drug the lots expired or released due to near-expiry in the trailing 12 months. |
| FR-F2b-002 | The system shall flag `WATCH` at ≥ 2 lots and `RECOMMEND` at ≥ 3 lots or when accumulated lost value exceeds the pharmacist-set threshold. |
| FR-F2b-003 | The pharmacist shall be able to exclude specific events (recall, treatment change) with a reason. |
| FR-F2b-004 | A `RECOMMEND` finding shall show the recommended order-quantity reduction per cycle and the expected savings in THB. |

---

### 7.I Feature F3 — Emergency Preparedness (ระบบจัดเตรียมเวชภัณฑ์เพื่อรับมือเหตุการณ์ฉุกเฉิน)

**7.1 Feature Overview.** For a mass-casualty incident the ER reports type, casualty counts by triage level and ETA. The system selects **Preset Kits** (per patient) and additional items, shows **Estimated** (all triage levels) vs **Critical Minimum** (critical only), checks inventory in **one calculation** (spreading kits by recipe), proposes: use ready sets → pack from loose stock → borrow whole sets → expand/borrow items; sends **simultaneous** emergency borrow requests; and reconciles afterwards. Staff verify every step.
**7.2 Objective.** Prepare in minutes: right sets, right numbers, fast sourcing of shortages, clean reconciliation.
**7.3 Actors.** ER_STAFF (reporter, verifier, packer), lender PHARMACIST/ER_STAFF, WAREHOUSE_OFFICER, Agent (assessment), PHARMACIST (view/usage records), REGION_ADMIN (view).
**7.4 Preconditions.** Kits and recipes configured; kit and loose stock maintained; distance matrix present; hospital in an active region.
**7.5 Inputs.** Incident type, free-text description, patient counts (red/yellow/green), ETA (or location for ETA estimate), kit recipes, kit-per-patient rules, extra-item rules, stock (ready sets, loose items), lenders' ready-set and item availability, Ttransit.
**7.6 Outputs.** `emergency_incident`, `emergency_plan` versions + lines, emergency `borrow_request` legs, pack records, documents (borrow/return summary, usage summary), `reconciliation_report`.

**7.7 Main Process Flow** (FL-15…FL-18; SM-3)
1. **Intake**: ER_STAFF records type, counts per triage level, ETA (from rescue unit, approximate). If unknown, ETA is calculated by code (F-26) from the incident location to the hospital using a real-time call to the route service (no speed-table fallback). If the route service is unavailable, the system shows `ETA_UNAVAILABLE`, warns that ETA cannot be guaranteed and tells staff to use radio / phone; staff may type an ETA manually.
2. **Agent assessment**: reads the incident (type, description) and picks Preset Kits and extra items using rule baseline `incident_kit_rule` / `incident_extra_rule`; **code** computes quantities (F-27). Output: kit list + additional items with **Estimated** and **Critical Minimum**.
3. **Staff verify and edit**: add/remove/change lines; edits flagged.
4. **Inventory check (one pass)**: spread kit counts by recipe into component items (calculation only; never unpack real sets), combine with loose item requirements, compare with ready sets and loose stock, producing item shortages and per-kit plan (BR-F3-010…016).
5. **Plan** (priority order): (1) use ready sets; (2) pack extra sets from loose stock if **all** components exist; (3) borrow **whole sets** if sets still short and components missing (partial packing allowed for the part that is complete); (4) if no nearby hospital has ready sets, expand the set request to farther hospitals; (5) items outside sets that are short ⇒ borrow per item. Staff may adjust how many sets to pack themselves; the reduction automatically becomes borrow quantity.
6. **Approve & send**: ER_STAFF approval of the plan sends **emergency requests simultaneously** to nearby hospitals that have the goods and are expected to arrive in time (`Ttransit ≤ ETA`), flagged as emergency; lender staff confirm before shipping. The first to confirm gets the job for the confirmed quantity; remaining requests are reduced/cancelled automatically and other hospitals informed immediately.
7. **Follow-ups**: partial delivery ⇒ new request for remainder; nobody confirms within timeout ⇒ expand to farther hospitals; nobody can arrive in time ⇒ send to the fastest and warn staff goods will arrive after casualties; all reject ⇒ emergency alert to staff.
8. **Timeouts** (F-28): critical items 3 min, supportive items 5 min, never later than ETA.
9. **Packing confirmation**: when packing is finished, staff confirm; system deducts loose items by recipe and adds ready sets (stock = reality).
10. **Updates**: patient counts/ETA can change at any time ⇒ new plan **version**; the Agent re-plans; diffs shown; open legs adjusted.
11. **Reconciliation** (after the situation ends): summarise what was borrowed (hospital, item, type, quantity) and track returns; produce borrow/return summary between hospitals and a **usage summary** of supplies used in the incident for the treating hospital's claim (พ.ร.บ./UCEP) through its normal channels.
**7.8 Alternative Flows.** Incident cancelled (false alarm) ⇒ `CANCELLED`, unconfirmed legs cancelled, confirmed legs returned; no suitable kit ⇒ items-only plan; stock sufficient ⇒ no borrowing; Agent unavailable ⇒ rule-based assessment from `incident_kit_rule` (decision source `FALLBACK`); route service unavailable ⇒ `ETA_UNAVAILABLE`, no speed-table estimate, staff told to use radio (F-26).
**7.9 Exception/Error Flows.** Agent over 8 s ⇒ rule fallback; kit recipe missing ⇒ plan line marked `NO_RECIPE`, staff must handle manually; lender confirms after ETA ⇒ recorded with `LATE_FOR_ETA`; duplicate confirmations beyond need ⇒ trim and notify; stock inconsistency (negative loose stock) ⇒ block packing confirm.
**7.10 Business Rules.** BR-F3-001 … BR-F3-030.
**7.11 Calculation Rules.** F-26 ETA, F-27 kit requirement/spreading/plan, F-28 emergency timeout.
**7.12 Approval Rules.** A8 ER_STAFF verifies and approves plan; A9 lender confirms; packing confirmation; reconciliation approval by ER_STAFF + PHARMACIST.
**7.13 Agent Involvement.** Kit/extra-item selection from incident characteristics; explanations; re-planning on updates. Not allowed: free-form quantities, sending requests without approval.
**7.14 UI.** UI-11 Incident Console, UI-12 Plan Review, UI-13 Kit Preparation, UI-15 Documents, UI-14 Transport Tracking.
**7.15 API.** `POST /incidents`, `GET /incidents/{id}`, `PATCH /incidents/{id}` (counts/ETA), `POST /incidents/{id}/assess`, `GET /incidents/{id}/plans`, `PATCH /incidents/{id}/plans/{planId}/lines/{lineId}`, `POST /incidents/{id}/plans/{planId}/approve`, `POST /incidents/{id}/pack-confirm`, `POST /incidents/{id}/usage`, `POST /incidents/{id}/reconcile`, `POST /incidents/{id}/close`, `GET/PUT /preset-kits`, `GET/PUT /incident-rules`.
**7.16 DB.** `emergency_incident`, `preset_kit`, `kit_component`, `kit_stock`, `incident_kit_rule`, `incident_extra_rule`, `emergency_plan`, `emergency_plan_line`, `kit_pack_record`, `incident_usage_record`, `reconciliation_report`, `borrow_request` (`context = EMERGENCY`), `borrow_leg`, `transfer_document`.
**7.17 Notifications.** Incident created (ER, pharmacy, admins); plan ready; lender urgent request (push + sound + SMS optional); confirmation; partial; expanded; no-one-in-time; all-rejected emergency alert; plan version changed; reconciliation ready.
**7.18 Documents.** Incident borrow/return summary; usage summary; incident timeline.
**7.19 Edge Cases.**

| # | Case | Behaviour |
|---|---|---|
| 1 | ETA < 3 min | Timeouts shrink to ETA (min 1 min); banner "patients arriving" |
| 2 | Patient counts increase mid-borrow | New version; additional legs for the delta only; existing confirmations kept |
| 3 | Counts decrease | Reduce unconfirmed legs; confirmed legs retained and flagged for early return |
| 4 | Kit shares a component with another kit | Spreading allocates loose components in priority order: critical kits first |
| 5 | Only part of a set shortage is one item (e.g., stylet) | Whole-set borrowing rule; do not borrow single component (BR-F3-013) |
| 6 | Lender has loose items but no ready sets | Not eligible for set lines; may serve item lines |
| 7 | Same hospital confirms set and items | Allowed, separate lines |
| 8 | Blood needed | PRC group O: may be added as an extra out-of-kit borrow line between blood-bank hospitals (BR-F3-031). Any other blood product: reminder "request via blood bank", no line created (BR-F3-032) |
| 9 | Equipment needed | Out of scope warning |
| 10 | Reconciliation: borrowed but unused | Return in kind; used items documented as consumed with value |
| 11 | Staff edits plan after legs sent | Allowed only to increase; decreases cancel open legs (never confirmed) |
| 12 | Incident duplicates (two reporters) | Duplicate-incident warning within 10 min / 500 m |

**7.20 Acceptance.** AC-F3-01…AC-F3-10.

| ID | Requirement |
|---|---|
| FR-F3-001 | ER_STAFF shall record an incident with type, description, counts per triage level and ETA. |
| FR-F3-002 | If ETA is unknown the system shall obtain travel time from Amazon Location Service in real time on every calculation; it shall never use a speed-table or cached value; on failure it shall set `ETA_UNAVAILABLE`, notify ER staff and the pharmacist to use radio communication, and require a manual ETA (F-26). |
| FR-F3-003 | The Agent shall choose Preset Kits and additional items for the incident; the system shall compute all quantities by code (F-27). |
| FR-F3-004 | Preset Kits shall be defined **per patient**; additional items shall be listed separately. |
| FR-F3-005 | The system shall display Estimated and Critical Minimum for every item; the buffer is their difference. |
| FR-F3-006 | Staff shall be able to confirm, add and remove lines before the inventory check. |
| FR-F3-007 | The inventory check shall spread kits by recipe and compare against ready sets and loose items in one calculation without unpacking any real set. |
| FR-F3-008 | The plan shall follow the 5-step priority in BR-F3-012 and allow staff to adjust the pack count; any reduction becomes borrow quantity automatically. |
| FR-F3-009 | Emergency borrow requests shall be sent simultaneously to eligible nearby hospitals after ER_STAFF approval, marked as emergency. |
| FR-F3-010 | Lender staff shall confirm before shipping; first confirmation wins for the confirmed quantity; others are adjusted/cancelled and informed immediately. |
| FR-F3-011 | Partial confirmation shall create a follow-up request for the remainder; silence after timeout shall expand to farther hospitals; no hospital able in time ⇒ send to the fastest and warn staff; all reject ⇒ emergency alert. |
| FR-F3-012 | Timeouts shall be 3 min (critical) / 5 min (supportive) and never later than ETA (F-28). |
| FR-F3-013 | Staff shall be able to update counts and ETA; the system shall create a new plan version and re-plan. |
| FR-F3-014 | On packing confirmation the system shall deduct loose items by recipe and add ready sets. |
| FR-F3-015 | After the incident the system shall list borrowed items per hospital, track returns and generate the borrow/return summary and the usage summary document. |
| FR-F3-016 | Reusable equipment, blood products other than PRC group O, and destination decisions shall be shown as out-of-scope reminders and shall not create plan lines. |
| FR-F3-017 | PRC group O shall be offered as an optional extra borrow line in an emergency incident only to/from hospitals with `has_blood_bank`, capped at `emergency.blood.prc_o_max_units`, with the notice "blood bank confirmation required (ABO/Rh, cross-match)". |
| FR-F3-018 | A blood borrow shall create a return obligation of type `BLOOD_REPLACEMENT` (replacement via the blood bank), not an in-kind stock return. |

---

### 7.J Feature F4 — Drug Code Normalization (ระบบจับคู่รหัสยามาตรฐาน) — a sub-feature of Feature 2 (source F2 §6)

> F4 is part of Feature 2 in the source document (§6). It is specified as its own module only because Feature 1, Feature 2 and Feature 3 all depend on its Verified mappings. Scope (rev 1.3, ASM-48): TMT is the only standard code; the สปสช. 24-digit code is not used; non-drug supplies use an admin central list.

**7.1 Feature Overview.** Imports each hospital's drug list from HIS and maps each local code to a standard item: **drugs** to TMT (GP/TPU) with suggestions and confidence, **non-drug supplies and blood** to the admin **central list** (selection, no TMT). Humans verify; only Verified rows are used for cross-hospital matching by agents.
**7.2 Objective.** Make "the same drug" identifiable across hospitals so borrowing, forecasting aggregation and redistribution do not mix up drugs.
**7.3 Actors.** DATA_ADMIN, PHARMACIST (verify), system.
**7.4 Preconditions.** Reference data loaded: TMT concepts (GPU/TPU/GPP/TPP) and the central list of supplies (maintained by DATA_ADMIN).
**7.5 Inputs.** Per row: local code, drug name, unit price, unit, TMT code (optional), GP code (optional), active flag (Y/N); any 24-digit code column in the file is ignored and not stored. Import only active rows.
**7.6 Outputs.** `drug_local_mapping` rows with status, confidence, suggestion; `drug_mapping_history` versions; `drug_master` link.

**7.7 Main flow** (FL-19, FL-20; SM-4)
1. Import batch (`POST /drug-imports`): validate columns; keep only `active = Y`; store raw rows.
2. Normalise name (case-fold incl. tall-man lettering such as "AMLOdipine"; strip parenthetical tags like "(HAD)", "(CASE)" into `name_tags`; expand abbreviations; unit dictionary).
3. **Suggested mapping**, by item type: (a) **DRUG** — **TMT mapping**: match by generic name, strength, dosage form at GPU/TPU level and package type at GPP/TPP level (e.g., foil strip vs jar); the canonical key is the TMT GP. (b) **SUPPLY / BLOOD** — no TMT and no suggestion score: the data admin picks the matching item from the **central list** (`method = CENTRAL_LIST`); the central list is created and edited by DATA_ADMIN (name, size/spec, base unit, `internal_code`).
4. Compute **confidence** (F-29) and set status: `SUGGESTED` (≥ 0.85), `LOW_CONFIDENCE` (0.60–0.85), `UNMAPPED` (< 0.60). Emphasise low confidence for abbreviated or misspelt names.
5. **Verification queue**: DATA_ADMIN/pharmacist inspects suggestion with confidence and evidence (name, strength, form, package, price/unit), then **Verify**, **Change** (pick another concept), or **Reject**. If the structure (name hash, unit or package) changed since the last Verified mapping, the verifier must confirm explicitly (safety condition).
6. **Reuse**: once Verified, the pair is stored and reused automatically in later imports for the same hospital + local code while the identifying fields (name hash, unit, price unit) are unchanged.
7. **Agent gating**: items not Verified, or confidence below threshold, are not used by F1b/F2a/F3 matching until verified.
**7.8 Alternatives.** Bulk-verify rows with confidence ≥ 0.95 *and* an identical verified mapping at ≥ 2 other hospitals (optional config, off by default); re-verify after TMT release update.
**7.9 Errors.** Duplicate local code in batch ⇒ last wins with warning; unknown unit ⇒ `UNIT_UNKNOWN` blocks verify; strength mismatch ⇒ cap confidence; reference catalog missing ⇒ TMT-only suggestion with flag.
**7.10 Rules.** BR-F4-001…012. **7.11 Calc.** F-29. **7.12 Approval.** A7 verification. **7.13 Agent.** Optional LLM assist for ambiguous Thai/English names (suggest only; never auto-verify). **7.14 UI.** UI-16 Drug Code Mapping. **7.15 API.** `POST /drug-imports`, `GET /drug-local-mappings`, `POST /drug-local-mappings/{id}/verify|reject|change`, `GET /tmt-concepts?q=`, `GET /central-items`, `POST /central-items` (API-F2b-007/008), `GET /drug-local-mappings/{id}/history`.
**7.16 DB.** `drug_local_mapping`, `drug_mapping_history`, `tmt_concept`, `drug_master` (with `item_type` and central-list `internal_code`), `ingestion_batch`.
**7.17 Notifications.** Items awaiting verification; verification SLA breach (3 days).
**7.18 Reports.** Mapping coverage %, verified %, low-confidence backlog.
**7.19 Edge Cases.**

| # | Case | Behaviour |
|---|---|---|
| 1 | Two local codes → same TMT concept (or same central-list item) but different units (sample: 5-FU `DOSE` 0.25 vs `SYRINGE` 120; Ag sulfadiazine `ตลับ` 50 vs `กระปุก` 310) | Allowed; each needs `unit_conversion_factor` to canonical unit, else verification blocked (Q-26) |
| 2 | Same drug, brand vs generic | Same GPU, different TPU; agents match at GPU level only if pharmacist enables brand-substitution flag per drug |
| 3 | Name typos/abbreviations | Fuzzy match + lower confidence |
| 4 | Tall-man casing, tags in name | Normalised, tags stored |
| 5 | TMT release changes concept | Mapping `DEPRECATED`; re-suggest; old version kept |
| 6 | Supply or blood item not in the central list | DATA_ADMIN adds it to the central list first (new `internal_code`), then the hospital row is mapped; a medicine not in TMT is not accepted as `DRUG` until TMT is updated (hold as UNMATCHED) |
| 7 | Hospital inactivates a code | Mapping `DEPRECATED`; open requests blocked |
| 8 | Mapping changed while requests open | Open requests keep snapshot; new requests use new mapping |

**7.20 Acceptance.** AC-F4-01…04.

| ID | Requirement |
|---|---|
| FR-F4-001 | The system shall import drug and supply lists with local code, name, unit price, unit, TMT code, GP code and active flag, importing only active rows; 24-digit code columns shall be ignored and not stored. |
| FR-F4-002 | The system shall suggest TMT mappings for drugs (GPU/TPU for name, strength, form; GPP/TPP for package). |
| FR-F4-003 | Each suggestion shall have a confidence score, with lower scores for abbreviated or misspelt names. |
| FR-F4-004 | Pharmacist or data admin shall verify, change or reject suggestions; unverified items shall not be used by agents. |
| FR-F4-005 | Verified pairs shall be stored and reused automatically in later imports for the same hospital and local code. |
| FR-F4-006 | Mappings shall be versioned; each change stores who, when and the previous value. |
| FR-F4-007 | The system shall require explicit confirmation when the identifying structure of a Verified row (name hash, unit, package) has changed (safety condition). |
| FR-F4-009 | The system shall let DATA_ADMIN maintain a central list of non-drug supplies and blood items (each with `internal_code`), and let hospitals map supply rows by selecting a central-list item; such rows need no suggestion score but still need the unit conversion factor, pack data and verification before agents use them. |
| FR-F4-010 | Every catalogue item shall have an `item_type` (`DRUG`, `SUPPLY`, `BLOOD`); a `DRUG` shall carry a TMT GP and `SUPPLY`/`BLOOD` shall not. |
| FR-F4-008 | The system shall require a unit conversion factor to a canonical base unit and the hospital's pack data (pack unit, base units per pack, manufacturer) before verification; lots may override pack size (F-32). |
