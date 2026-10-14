---
name: privacy-compliance
description: Use when handling personal data or meeting privacy obligations — PII inventory, consent and lawful basis, minimization, retention, data-subject access/erasure/export, sub-processor and transfer inventory, and audit evidence for GDPR/CCPA. Application security controls route to security-hardening-specialist.
metadata:
  version: 1.0.0
  grade: G2
  domain: security
  status: active
  last-reviewed: '2026-10-10'
  owned-by-agent: compliance-engineer
---

# Privacy & Compliance

The cheapest privacy control is not collecting the data. The second cheapest is knowing exactly where it lives. This skill produces the artifact that makes a product defensible — a real data map tied to real fields in real stores — plus the code paths that honor a user's right to get their data back or have it deleted.

## WHEN TO USE

- **Handling personal data** — signup, profiles, payments, analytics, logs, support tooling.
- **Data-subject requests** — access, export, erasure, correction, objection.
- **Consent surfaces** — cookie banners, marketing opt-in, tracking.
- **Retention questions** — "how long do we keep this?" and "is this in backups?"
- **Reviews** — before launch, before a new vendor, before analytics instrumentation.

## WHEN NOT TO USE

- **Application security controls** (auth, input validation, secrets) — `security-hardening-specialist`.
- **General legal interpretation** — surface the obligation and its evidence for counsel; do not rule on the law.
- **Product analytics design** — instrumentation strategy is separate; this skill only governs what is collected.
- **Where the personal data is not involved** — do not add process to non-personal data.

## DECISION TREE

1. **Name the regime.** GDPR, CCPA/CPRA, or another — they grant different rights and clocks. Never hand-wave "best practice".
2. **Map before acting.** Enumerate every field of personal data by reading the write paths (`grep` models, schemas, logs, analytics calls). Docs are not evidence.
3. **Assign a lawful basis.** Consent, contract, legal obligation, vital interest, public task, or legitimate interest — per purpose, not per dataset.
4. **Minimize.** For each field: who consumes it, and what breaks if it is not collected? If nothing breaks, do not collect it.
5. **Set retention and a purge.** Every field gets a period and a mechanism; "forever" is an explicit, justified decision.
6. **Implement rights.** Access/export, erasure, correction, objection — with identity verification and a cascade across derived stores.
7. **Record evidence.** Consent records, DSR fulfillment, purge runs, vendor inventory — the audit trail is the deliverable.

## PATTERNS

### 1. Data map (the core artifact)
```text
field | category | purpose | lawful basis | store | retention | deletion path | shared with
```

### 2. Consent
- Specific, informed, freely given, and **recorded**: timestamp, source, and the exact text shown.
- Withdrawal is a first-class code path that stops the processing, not a support ticket.
- Pre-checked boxes are not consent. Separate purposes get separate toggles.

### 3. Data-subject requests
- **Access/export**: assemble a machine-readable bundle from every store within the statutory clock.
- **Erasure**: soft-delete + purge job across primary stores, caches, analytics, logs, and vendors — with a verifiable run and a documented backup horizon.
- **Correction**: propagate to derived and vendor stores.
- **Identity first**: an unauthenticated erasure endpoint is a data-destruction vulnerability.

### 4. Retention & minimization
- Pair each field with a purge job and a schedule; measure that the purge actually runs.
- Strip personal data from logs, error reports, and analytics where it is not required — prefer ids.
- Backups: state the horizon; deletion rolls forward when backups age out. Never claim instant deletion.

### 5. Vendors & transfers
- Sub-processor inventory: vendor, purpose, data categories, region, deletion path.
- Cross-border transfers need a named mechanism; surface it, do not assume it.
- A deletion request must reach vendors that received the data.

### 6. Audit trail
- Log consent changes, DSR fulfillment, retention purges, and access to sensitive datasets — with the log itself redacted.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **Unmapped stores** — DETECT: personal data found in logs/analytics absent from the map. FIX: grep write paths; extend the map.
2. **Deletion theater** — DETECT: a delete flag with no cascade or purge. FIX: implement and verify the cascade; document gaps.
3. **Consent by inference** — DETECT: data used for an unrecorded purpose. FIX: record the basis or stop the use.
4. **Unauthenticated DSR** — DETECT: erasure/export reachable without identity proof. FIX: authenticate + verify before acting.
5. **PII in logs/telemetry** — DETECT: emails/tokens in plaintext logs. FIX: redact, and rotate anything leaked.
6. **Over-collection** — DETECT: fields with no consumer. FIX: drop the field or document the purpose.
7. **Jurisdiction hand-wave** — DETECT: "we're GDPR compliant" with no mapping. FIX: name the regime and map it.
8. **Vendor blind spot** — DETECT: third party received data with no deletion path. FIX: inventory it and request deletion.
9. **Purge that never runs** — DETECT: retention policy with no assertion that the job executed. FIX: monitor the purge; record runs.

## QUANTITATIVE RULES

- Every personal-data field appears in the map with purpose, basis, retention, and deletion path — no blanks.
- Deletion cascade covers primary, cache, analytics, logs, and vendors, or the exception is documented.
- DSR served within the statutory clock (GDPR one month, extendable; CCPA 45 days) with a fulfilled-request audit record.
- Purge jobs exist for every field with a retention period, and their runs are observable.
- Identity verification required on 100% of DSR endpoints.
- Personal data removed from logs/telemetry unless explicitly justified.

## VERIFICATION GATE

- **Mapped?** Every personal-data field traced to a store via the code, with `file:line` evidence.
- **Based?** Each purpose has a named lawful basis.
- **Rights working?** Access/export and erasure demonstrated end-to-end (dry run acceptable) with evidence.
- **Retention enforced?** Purge jobs exist and have run, with the run recorded.
- **Vendors enumerated?** Sub-processors listed with data categories and deletion paths.
- **Residual risk stated?** What cannot be honored — and why — is written down.

```text
[PRIVACY / COMPLIANCE]
Regime: {GDPR | CCPA/CPRA | other}   Scope: {product/dataset}
Data map: {n} fields / {n} stores — {path}
Rights: access {ok|gap} · erasure {ok|gap} · correction {ok|gap} · objection {ok|gap}
Consent: {scopes + record}
Retention: {periods + purge job + last run}
Vendors: {n} sub-processors · transfers {mechanism}
Evidence: {paths}
Residual risk: {unhonorable items + reason}
```

## REFERENCES

- `security-hardening-specialist` — application security controls, carved out above.
- `data-pipeline-engineer` — deletion/retention cascades through data stores.
- `email-notifications` — consent scopes and suppression.
- `compliance-engineer` agent — the implementing role.

Ownership: maintained by compliance-engineer; privacy-compliance is the security-domain skill for personal-data obligations.
