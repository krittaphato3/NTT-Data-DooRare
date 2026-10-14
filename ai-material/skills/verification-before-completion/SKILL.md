---
name: verification-before-completion
description: Use when claiming any task is done — attach proof (test output, lint JSON, benchmark tables, diff evidence). Use to block looks-done sign-offs and verification theater.
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-09-11'
  owned-by-agent: test-engineer
---

# Verification Before Completion

Done = evidence attached. A claim without an artifact is not verified.

## WHEN TO USE

- Every subtask gate, PR, integration, and final report.
- Any statement of the form "fixed", "passes", "faster", "secure".

## WHEN NOT TO USE

- Planning or intent interviews (no artifact exists yet) — record confidence instead.
- Pure questions with cited sources — cite URL + quote, still an artifact.

## DECISION TREE

1. **State the criterion** — one checkable assertion written before the work (from the brief).
2. **Collect the artifact** — test output, lint JSON, typecheck log, benchmark table, diff, or screenshot-plus-log (screenshot alone never suffices).
3. **Match exactly** — the gate checks the briefed criterion, not a convenient proxy.
4. **Attach or it didn't happen** — artifact path + summary in the ledger/report.

## PATTERNS

- Gate vocabulary: GREEN (criterion met + artifact), RED (not met — fix/rollback), FLAKY (passed on retry ≤2, root cause recorded), UNGATED (never verified = RED).
- Perf claims: before/after, pinned env, ≥5 runs, median + p90.
- Security claims: repro steps + tool output (scanner, test, header dump).

## FAILURE MODES & MITIGATIONS

- **Verification theater** — gate checks the wrong thing. DETECT: artifact doesn't match brief criterion. FIX: re-run the exact criterion.
- **Looks-done** — "works on my machine", screenshot-only. FIX: attach logs/tests.
- **Partial evidence** — one slice proves the whole. FIX: completeness checklist from brief.

## QUANTITATIVE RULES

- ≥1 artifact per green gate; 0 artifacts = not green. Flaky retries ≤2 then FAIL.

## VERIFICATION GATE

- Every GREEN row names its artifact path; integration smoke test PASS/FAIL + artifact. Ledger with UNGATED rows is incomplete.
