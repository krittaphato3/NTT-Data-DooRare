## 15. UI Screens and User Journeys

Web app: Next.js (React, TypeScript), Thai-first (TH default, EN toggle), responsive (tablet for warehouse; mobile PWA for drivers with offline queue, service worker and IndexedDB, because loading docks and basements often have no signal). Every screen: loading/empty/error states, optimistic-lock conflict dialog (409), audit "history" drawer.

### 15.1 Screen catalogue
| ID | Screen | Roles | Key content & actions | APIs | Rules |
|---|---|---|---|---|---|
| UI-01 | Dashboard | all | tiles: open alerts by severity, pending approvals, near-expiry count, open incidents, value saved | API-PL-006, API-XC-006 | — |
| UI-02 | Stock Alert Queue | PHARMACIST, PROC | table ordered by ABC then days cover; badges VED/severity; actions ack/snooze/create borrow | API-F1a-005..007 | BR-F1a |
| UI-03 | Forecast Detail | PHARMACIST | chart history + P50/P90/P95 band, method, confidence flag, ROP, total target | API-F1a-002 | BR-F1a |
| UI-04 | Borrow Request Approval | PHARMACIST | R calc breakdown (u, L, Z, σ), ranked ladder with Si parts, agent summary + drafts (editable), approve/reject (HITL) | API-F1b-003..007 | BR-F1b |
| UI-05 | Request Detail | PHARMACIST, ADMIN | timeline of legs, timers, stop-rule progress, escalate-manual | API-F1b-003, 012, 013 | SM-1 |
| UI-06 | Lender Response Queue | PHARMACIST (lender) | incoming requests, lots offered (FEFO, ≥180 d), accept/partial/reject; countdown | API-F1b-008..010 | BR-F1b |
| UI-07 | Near-Expiry Review | PHARMACIST | lots below threshold, value, release/keep/dismiss/withdraw; repeat-expiry flags | API-F2a-001..005, 015 | SM-2 |
| UI-08 | Central Pool | PHARMACIST, REGION | held lots by region, status | API-F2a-006 | ASM-12 |
| UI-09 | Allocation Plan Review | PHARMACIST | split, cost ratio, 4 options if uneconomical, approve/reject; NEEDS_DISCUSSION banner | API-F2a-007..011 | F-23, SM-5 |
| UI-10 | Manual Request | PHARMACIST | choose drug (VERIFIED only), qty, reason, optional lender | API-F1b-001 | FL-13 |
| UI-11 | Incident Console | ER_STAFF | triage counts (R/Y/G/B), location, rescue ETA, duplicate warning | API-F3-001..004 | BR-F3 |
| UI-12 | Emergency Plan Review | PHARMACIST | estimated vs critical-min vs buffer, ordered plan ladder, shortfall, approve | API-F3-005, 006 | FL-16 |
| UI-13 | Kit Preparation | WAREHOUSE | pack tasks, ready-set stock, confirm pack | API-F3-009, 010, 014, 015 | ASM-13 |
| UI-14 | Transport Tracking (offline-first PWA) | WAREHOUSE, DRIVER | status stepper, photo capture (≤10, compressed ≤1.5 MB), local queue with "pending sync" badge, manual "sync now", cancel w/ consent | API-F2a-012..014, 017 | SM-6, FR-F2a-016 |
| UI-15 | Document Printing | PHARMACIST, WH | borrow/return/transfer slips, incident reports | API-XC-001, 002 | FL-10 |
| UI-16 | Drug Code Mapping | DATA_ADMIN | tabs: Drugs (TMT candidates with score parts) and Supplies (pick from central list; central-list editor); verify/reject, unit factor, bulk disabled by default | API-F2b-001..008 | FL-19/20 |
| UI-17 | Configuration | ADMINS | settings by scope, change reason, kill switch | API-AD-001, 002, 004 | §23 |
| UI-18 | Audit Log | AUDITOR | filter/export, hash-chain verify | API-AD-003 | SEC |
| UI-19 | Reports / Value | ADMIN, REGION | savings, stock-out avoided, fulfilment time, waste avoided | API-XC-006, API-AD-005 | §24 |

### 15.2 User journeys
| ID | Journey | Steps |
|---|---|---|
| UJ-1 | Low stock → borrow | UI-02 alert → create request → UI-04 review ladder & messages → approve → lender UI-06 accepts → UI-13/15 load & slip → borrower receives → value recorded |
| UJ-2 | Lender silence | leg timer 50 % reminder → timeout → next lender automatically (approved ladder) → escalate if ladder ends |
| UJ-3 | Near-expiry release | UI-07 release → UI-08 pool → UI-09 plan; involved pharmacists approve → UI-14 transport → receipt |
| UJ-4 | Mass-casualty | UI-11 counts → UI-12 plan approve → UI-13 pack + emergency requests → first confirm wins → reconcile |
| UJ-5 | Mapping onboarding | UI-16 import → review suggestions → verify → drugs become usable by agents |
| UJ-6 | Audit | UI-18 filter by entity → agent run replay → export |

## 16. Integrations
| ID | System | Direction | Method | Data | Fallback |
|---|---|---|---|---|---|
| INT-01 | Hospital HIS (stock, usage, lots, drug list) | in | CSV/XLSX upload (MVP) → SFTP/API (later); S3 + validation job | stock, daily usage, lots, drug list | manual upload; DATA_STALE alert after 7 d (ASM-37) |
| INT-02 | TMT reference (release files) | in | periodic file import to `tmt_reference` | codes, levels | manual refresh |
| INT-03 | Amazon Bedrock | out | SDK | agent calls | FALLBACK (§14.5) |
| INT-04 | Amazon Location Service | out | route matrix (F1 monthly) + real-time route (F3, every calculation) | distance, duration | F1: last stored matrix; **F3: none — `ETA_UNAVAILABLE` and radio notice (no speed table)** |
| INT-05 | Amazon SES | out | email | notifications | in-app only |
| INT-06 | LINE Messaging (optional) | out | webhook | urgent alerts | email (ASSUMPTION: optional, OPEN QUESTION Q-28) |
| INT-07 | Amazon Cognito | in | OIDC | users, MFA | — |
| INT-08 | S3 | both | presigned URLs | photos, PDFs, imports | — |
| INT-09 | 1669 / EMS | **out of scope** | — | — | staff enter rescue ETA manually |

## 17. Background Jobs
EventBridge Scheduler → SQS → workers (ECS Fargate). All jobs idempotent, record `job_run`, retry 3× with backoff, DLQ + alarm.

| ID | Job | Schedule | Purpose | Flow |
|---|---|---|---|---|
| JOB-01 | Import ingest/validate | on upload | parse files, ledger/snapshot update | INT-01 |
| JOB-02 | Forecast run | daily 01:00 (+weekly backtest Sun) | FL-01 | FL-01 |
| JOB-03 | Alert evaluation | every 15 min + on stock change | FL-02 | FL-02 |
| JOB-04 | Leg timers | every minute | reminders at 50 %, timeouts | FL-08 |
| JOB-05 | Near-expiry scan | daily 02:00 | FL-11 detection | FL-11 |
| JOB-06 | Pool matching | on release + hourly | FL-12 | FL-12 |
| JOB-07 | Repeat-expiry detection | weekly | ≥2 lots/12 m WATCH; ≥3 or value>10,000 RECOMMEND | F-25 |
| JOB-08 | Agent daily summary | 07:30 | AGT-F1-006 | — |
| JOB-09 | Return reminders / overdue | daily 08:00 | 7 d and 1 d before due | SM-7 |
| JOB-10 | Plan approval timeout | every 15 min | 48 h ⇒ NEEDS_DISCUSSION | FL-14 |
| JOB-11 | Value aggregation | daily 03:00 | XC-4 metrics | — |
| JOB-12 | Context signals refresh | daily | XC-3 | — |
| JOB-13 | Reliability stats | monthly | reliability window 12 m | F-17 |
| JOB-14 | Distance matrix refresh | monthly / on hospital change | `hospital_distance` | — |
| JOB-15 | Audit chain verify | nightly | detect tampering | SEC |
