---
name: "requesting-code-review"
description: "Use before merging any non-trivial change — request red-team-qa adversarial review with diff, tests, and explicit scope. Use to gate commits and PRs."
---
# Requesting Code Review

Non-trivial changes get adversarial review before commit. Review is a gate, not a courtesy.

## WHEN TO USE

- Any PR, any multi-file change, any security/auth/payment/data-migration touch.
- After GREEN suite, before `git commit/push` or PR open.

## WHEN NOT TO USE

- Trivial doc/comment/whitespace-only changes — self-review + suite green suffices.
- Active SEV rollback — review after restore, note in postmortem.

## DECISION TREE

1. **Package the change** — surgical diff, test output, lint/typecheck clean, scope + out-of-scope stated.
2. **Dispatch red-team-qa** — brief includes: files, behavior change, threat surface, acceptance criteria. Reviewer is `edit:deny`; output is findings + patches, never direct edits.
3. **Triage findings** — CRITICAL/HIGH block merge; MEDIUM fix or file issue; LOW/INFO optional with reason.
4. **Re-verify** — fixes get re-tested + re-reviewed if scope changed.

## PATTERNS

- Review brief template: Scope | Threat surface | Tests | Perf impact | Rollback plan.
- Interrogate: every input, query (parameterized?), endpoint (authenticated?), file op (traversal-safe?), async (race-safe?), error (leak-safe?).
- Verdict vocabulary: PASS | FAIL | CONDITIONAL (ship with listed follow-ups).

## FAILURE MODES & MITIGATIONS

- **Rubber-stamp review** — approved without findings on a non-trivial diff. DETECT: zero checklist items checked. FIX: re-dispatch with explicit threat-surface questions.
- **Reviewing too late** — review after push/merge. FIX: gate defined in brief; red-team-qa before commit per system-instructions.
- **Scope creep in review** — reviewer redesigns the feature. FIX: findings limited to correctness/security/perf of the briefed scope.

## QUANTITATIVE RULES

- Non-trivial = >5 lines or >1 file or touches auth/data/money. Review turnaround one pass; re-review only if scope changed.

## VERIFICATION GATE

- Review verdict attached (PASS/CONDITIONAL/FAIL) + findings list with severity + test/lint evidence. Merge without verdict = gate skip.
