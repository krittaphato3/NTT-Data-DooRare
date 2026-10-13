---
name: refactoring-intelligence
description: Detect code smells, apply SOLID principles, and perform safe AST-based
  refactoring. Use when a change preserves behavior but must reduce complexity, duplication,
  or technical debt, and tests already pin current behavior.
metadata:
  version: 0.2.0
  grade: G2
  domain: architecture
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: refactoring-specialist
---

# REFACTORING INTELLIGENCE

Detect code smells, enforce SOLID, perform AST-based refactoring.

## RULES
1. Test first — never refactor without tests
2. Incremental — small, safe steps
3. Preserve behavior — external behavior must remain identical
4. Measure — track metrics before/after

## CODE SMELLS → FIXES

| Smell | Fix |
|-------|-----|
| Long Method (>30 lines) | Extract Method |
| Large Class (>300 lines) | Extract Class |
| Long Parameter List (>4) | Parameter Object |
| Switch Statements | Polymorphism |
| Duplicate Code | Extract Method |
| Dead Code | Delete |
| Feature Envy | Move Method |
| Data Clumps | Extract Class |
| Shotgun Surgery | Move Method/Field |
| Middle Man | Remove Middle Man |

## SOLID PRINCIPLES
- **S**ingle Responsibility: One class = one reason to change
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Subtypes must be substitutable
- **I**nterface Segregation: Clients shouldn't depend on unused methods
- **D**ependency Inversion: Depend on abstractions, not concretions

## AST TOOLS
```bash
# JavaScript/TypeScript
npx jscodeshift -t transforms/rename.js src/
ast-grep --pattern 'console.log($$$)' --rewrite 'logger.info($$$)' src/

# Python
pip install libcst
python -m libcst.tool codemod transforms/ src/
```

## METRICS TO TRACK
- Cyclomatic Complexity: target <10
- Lines of Code per function: target <30
- Code Duplication: target <3%
- Test Coverage: target >80%

## OUTPUT
```text
[REFACTORING]
Target: {file|module}
Smells: {list}
SOLID Violations: {list}
Applied:
- {pattern}: {what changed}
Metrics:
- Complexity: {before} → {after}
- LOC: {before} → {after}
- Coverage: {before}% → {after}%
```

## WHEN TO USE
- Behavior is correct but a code smell / SOLID violation is impairing readability, change, or testability.
- Preparing a feature area for change: reduce friction before touching the logic.
- A characterization test suite already exists or is feasible to write.
- A definition-of-done gate where the change must preserve existing behavior exactly.

## WHEN NOT TO USE
- **Do NOT refactor without tests.** If no characterization test covers the path, write one first or stop; refactoring blind is behavior drift in disguise.
- **Rewrite vs refactor:** if requirements change, the architecture is wrong, or the coupling cannot be extracted incrementally, a **rewrite** is the decision — not this skill.
- Not for unmaintained dead code that will be deleted anyway; delete it instead.
- Not a fresh-greenfield activity — this is restructuring live behavior, not authoring.

## DECISION TREE
```text
1. CHARACTERIZE  → ensure a characterization test suite pins current behavior
   (green before any change). If absent, write it first.
2. SMELL INVENTORY → collect smells and SOLID violations from the change surface
   (see CODE SMELLS → FIXES); annotate each with a risk estimate.
3. RISK RANKING  → order by blast radius × difficulty; keep high-risk items owned
   by a test; leave out cosmetic churn.
4. INCREMENTAL  → apply one refactoring at a time (branch-by-abstraction or
   strangler-fig for large systems), keeping the build green after each step.
5. VERIFY  → re-run the characterization suite, review the diff for
   behavior-preservation, and compare before/after metrics.
```
Never reach step 5 without passing steps 1–4; skipping characterization makes every later gate meaningless.

## FAILURE MODES & MITIGATIONS
- **Refactor without characterization tests** — drift goes unnoticed.
  DETECT: no test is red on the pre-change behavior; no green baseline to compare.
  FIX: write characterization tests that assert exact current output/behavior before any change; treat them as the contract.
- **Behavior drift** — a rename/extract changes an observable edge case.
  DETECT: a test that was green goes red, or an output shifts on an untouched path.
  FIX: one small step at a time; re-run the full suite each step; let the failing test identify the exact behavior.
- **Over-refactoring** — "clean" churn with no behavior benefit.
  DETECT: large non-test diff with zero metric improvement and no user-visible gain.
  FIX: bound the work to the smell inventory; drop cosmetic renames far from the change surface; measure before adding churn.
- **Large-bang merge** — a giant refactor merged at once hides risk and masks regressions.
  DETECT: a single PR spanning many files/subsystems or long-lived branch.
  FIX: branch-by-abstraction or strangler-fig; small, reviewable, independently mergaable increments; keep every commit green.
- **Lost history** — git blame/revertability destroyed.
  DETECT: file contents rebased/rewritten en masse; history no longer shows per-change intent.
  FIX: commit each mechanical refactor separately with a descriptive message; preserve the original test contract; avoid squash-rewriting ownership evidence.

## VERIFICATION GATE
- **Characterization tests green** before the change and still green after.
- **Behavior-preserving diff review**: the diff changes structure, not observable behavior — reviewer signs off that inputs/outputs are unchanged.
- **Metric comparison**: complexity, duplication, and LOC before → after show the intended improvement and no regression.
- **red-team-qa review**: adversarial reviewer actively hunts for drift introduced by the change.
- Record each refactoring, its before/after metrics, and the passing test evidence.

## REFERENCES
- Fowler, *Refactoring: Improving the Design of Existing Code* — catalog of mechanics & motivations.
- Feathers, *Working Effectively with Legacy Code* — characterization tests, seams, dependency brakes.
- branch-by-abstraction & strangler-fig guidance — incremental extraction of large systems.
