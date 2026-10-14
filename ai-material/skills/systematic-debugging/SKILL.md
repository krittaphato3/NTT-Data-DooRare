---
name: systematic-debugging
description: Use when fixing any bug, flake, or gate failure — reproduce, isolate, root-cause, fix, regression-test. Use to block symptom patches.
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-09-11'
  owned-by-agent: code-implementer
---

# Systematic Debugging

Reproduce → isolate → root cause → fix → regression test. Never patch symptoms.

## WHEN TO USE

- Failing tests, red gates, production incidents, flakes, perf regressions.

## WHEN NOT TO USE

- Green-field design (use deep-planner); intentional behavior change (use test-driven-development).

## DECISION TREE

1. **Reproduce** — minimal repro steps + exact failing output. If it can't be reproduced, it can't be claimed fixed.
2. **Isolate** — bisect inputs, flags, commits; narrow to one component. Log hypothesis + confidence.
3. **Root cause** — name the mechanism (off-by-one, race, N+1, missing index, leaked handle). Quote the line/log proving it.
4. **Fix** — smallest change addressing the cause, not the symptom. No drive-by refactors.
5. **Regression test** — failing-test-first repro becomes a permanent test; full suite green.

## PATTERNS

- Bisect > guess; `git bisect`, binary-search inputs, toggle flags one at a time.
- Five Whys to the mechanism; stop at code, not vibes.
- Flakes: seed, fake timers, isolate shared state; record root cause even when retry passes.

## FAILURE MODES & MITIGATIONS

- **Symptom patch** — fix hides the error path. DETECT: root cause unnamed. FIX: revert to repro, find mechanism.
- **Fix without regression test** → the bug returns. FIX: add the repro as a test in the same change.
- **Multiple simultaneous changes** → unknowable cause. FIX: one change, re-test.

## QUANTITATIVE RULES

- One hypothesis at a time; repro script checked in or pasted in report; regression test mandatory per fix.

## VERIFICATION GATE

- Repro steps + failing output (before) + passing output (after) + regression test path + suite green. Missing root-cause line = not done.
