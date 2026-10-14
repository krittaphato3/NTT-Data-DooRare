---
name: test-driven-development
description: Use when implementing any behavior change — write the failing test first (RED), then minimal code (GREEN), then refactor. Use for bug fixes, features, and refactors with pinned tests.
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-09-11'
  owned-by-agent: test-engineer
---

# Test-Driven Development

Failing test → minimal implementation → refactor → green. No behavior change ships without a test that failed first.

## WHEN TO USE

- Any feature, bug fix, or behavior change in production code.
- Refactors: pin behavior with characterization tests before touching code.
- Bug reports: reproduce as a failing test before fixing.

## WHEN NOT TO USE

- Pure exploration spikes (delete after); convert to TDD once direction is kept.
- Doc-only or config-only changes with no behavior (still run existing suite).
- User explicitly waived TDD for a trivial ≤5-line fix — record justification.

## DECISION TREE

1. **RED** — write one failing test defining the desired behavior. Run it; confirm it fails for the right reason.
2. **GREEN** — write the minimum code to pass. No extra features, no speculative abstraction.
3. **REFACTOR** — clean up while keeping tests green. Remove duplication, name clearly.
4. **COVERAGE** — new code ≥80% lines; edge cases: empty/null, boundaries, errors, concurrency, large inputs.
5. **PYRAMID** — prefer unit (<100ms) over integration (<1s) over E2E (<30s, critical paths only). Deterministic, never flaky.

## PATTERNS

- Arrange-Act-Assert; one behavior per test; name `should {expected} when {condition}`.
- Mock at boundaries (DB, network, clock); never mock the unit under test.
- Regression test per bug: the exact repro input that failed before the fix.

## FAILURE MODES & MITIGATIONS

- **Tests after code** → delete-or-revert to RED; a test that never failed proves nothing. DETECT: no RED run recorded. FIX: stash impl, show RED, re-apply.
- **Flaky test** → quarantine immediately, fix determinism (seed, fake timers, isolate). Never ship flaky green.
- **Coverage theater** → lines covered but behavior unasserted. FIX: assert outcomes, not calls.

## QUANTITATIVE RULES

- New code ≥80% line coverage; unit <100ms, integration <1s, E2E <30s.
- One RED-GREEN cycle per behavior; batching >3 behaviors per cycle is a violation.

## VERIFICATION GATE

- RED run output attached (failing test + reason) + GREEN run output (full suite passing) + coverage number. No RED evidence = not TDD.
