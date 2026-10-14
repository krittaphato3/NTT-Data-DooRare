---
name: spec-driven-development
description: Use when a feature or project is large enough to write a PRD (objectives,
  commands, structure, testing, boundaries) before any code — the PRD is the contract,
  code only starts after sign-off. Feeds deep-planner when the PRD becomes a plan.
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: planner
---

# Spec-Driven Development

The discipline that forces a written PRD before any code. Writing the PRD first is not a bureaucracy layer; it is the cheapest place to discover that the request is wrong, ambiguous, or over-scoped. The PRD is the contract between the requester and the implementer: it states objectives, the user-visible commands and behavior, the intended structure, the test strategy, and the boundaries — and no implementation starts until that contract is signed off. Code that exists before the PRD is not "a head start"; it is a sunk cost against an unvalidated contract. This skill consumes an intent confirmed upstream (requirements-elicitation) and produces the PRD that deep-planner turns into an executable task graph.

## WHEN TO USE

- **Feature or project before code** — any deliverable sized at approximately half a day or more of work; at this size the cost of a wrong contract exceeds the cost of writing it.
- **Reusable workflows** — logic, commands, or flows that other agents or systems will invoke repeatedly; a written contract is the only stable interface for reuse.
- **Multi-party expectations** — the work has a requester, an implementer, and a reviewer; the PRD is the single shared reference all three can read.
- **Underspecified ask** — the intent exists but the concrete shape (commands, data, structure, tests) is not yet decided; the PRD decides it.
- **Contract for handoff** — work that deep-planner will decompose needs a fixed PRD to plan against; planning against a moving contract produces a moving plan.
- **Anything the reviewer will gate** — any change that must pass review benefits from a written spec the review can be checked against.

## WHEN NOT TO USE

- **One-liner fixes** — a single-file correction with an obvious shape; the PRD is overhead and the fix can be implemented directly.
- **Exploration spikes already timeboxed** — a bounded research or prototype task with an explicit stop condition and no production contract; the spike itself is the discovery, not the deliverable.
- **Confirmed trivial scope** — the intent is unambiguous, the change touches one place, and no interface contract changes; skip.
- **Pure mechanical change** — renaming, formatting, or mechanical refactors where the "why" is fully captured by the code diff itself.

## DECISION TREE

Branch top-down; step 0 gates everything after it.

0. **Is the intent confirmed?** If who/why/success are still moving, run requirements-elicitation first; a PRD written against an unconfirmed intent inherits that uncertainty into every section.
1. **Write objectives** — state the problem and the measurable objectives in 1-2 sentences each. Every objective must later map to a testable acceptance criterion; if it cannot, it is not an objective, it is decoration.
2. **Define commands/UX** — specify the exact user-visible surface: command names, arguments, flags, inputs, outputs, error messages. Exact now, because code will mirror this section verbatim.
3. **Define structure** — name the components, files, modules, or services that will exist, and the data that flows between them. Ambiguity here is where drift starts.
4. **Define testing and boundaries** — state what will be tested (unit/integration/end-to-end), what is explicitly in scope, and what is explicitly out of scope. Out-of-scope is not optional; it is the anti-creep fence.
5. **Get sign-off** — the requester and the reviewer approve the PRD. No approval, no code. A PRD that passes the VERIFICATION GATE and gets explicit sign-off is the only legal input to build.
6. **Only then build** — implementation begins, and every piece of code traces back to a PRD line. Code that cannot trace to a PRD line is suspect and gets questioned at review.

## PATTERNS

### 1. PRD skeleton
- **Problem** — the pain, in one sentence, not the solution.
- **Objectives** — 2-5 measurable outcomes; each gets a number so traceability is mechanical.
- **User stories** — "As a <role>, I want <thing>, so that <value>"; each story is a candidate acceptance test.
- **Acceptance criteria** — each objective and each user story has a checkable criterion ("rejects input over 1000 chars with message X", not "validate input").
- **Out of scope** — the explicit list of things this PRD deliberately does not do; this is the fence against scope creep.
- **Risks** — the top 3-5 risks with likelihood and impact, so the reviewer can veto or accept them before build.

### 2. Test-first mapping
- Every acceptance criterion maps to a test that would fail before the feature and pass after it. If a criterion cannot map to a test, the criterion is not measurable and must be rewritten.
- The PRD's testing section is the ordering the test suite will follow; tests are the executable form of the PRD.

### 3. Boundary definition
- Boundaries are written as pairs: in-scope items and the out-of-scope list sit side by side in the PRD so the reviewer can see the cut line in one glance.
- Boundary changes are a PRD revision — a new version number, not a silent edit. Silent boundary moves are drift (FAILURE MODES 3).

### 4. One PRD = one vertical slice
- A PRD describes one deliverable slice that is independently demonstrable: it has its own objectives, its own tests, and its own end-to-end proof.
- If the work splits into two demonstrable slices, it splits into two PRDs. A PRD that is really three PRDs will fail review as over-broad.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **Underspecified acceptance criteria** — the PRD says "implement" without saying how to verify. *DETECT:* no acceptance criterion names a testable outcome or observable behavior. *FIX:* rewrite every criterion as a testable assertion before sign-off; refuse to sign off a PRD with a vague criterion.
2. **Scope creep** — the build grows beyond the PRD's out-of-scope fence. *DETECT:* implemented features with no PRD line, or a story count that grows during build. *FIX:* treat every unplanned feature as a PRD revision that re-enters the sign-off gate; no silent additions.
3. **PRD-vs-code drift** — code and PRD diverge over time. *DETECT:* the reviewer cannot trace a changed behavior back to a PRD line, or the PRD describes commands that no longer exist. *FIX:* the PRD is updated as a versioned revision and the diff is reviewed; code that contradicts the PRD is treated as a bug, not a feature.
4. **No boundaries** — out-of-scope is missing, so the PRD can grow without limit. *DETECT:* the PRD has no out-of-scope section or the section is empty. *FIX:* the out-of-scope list is mandatory; a PRD without it fails the gate.
5. **Gold-plating** — extra quality and features beyond the acceptance criteria. *DETECT:* implementation effort exceeds what the acceptance criteria require, or polish work has no criterion behind it. *FIX:* delete code with no criterion, or add the criterion as a deliberate PRD revision; never let polish ride in silently.
6. **Reviewer rubber-stamp** — sign-off given without checking the PRD against the checklist. *DETECT:* sign-off happened without the VERIFICATION GATE being run, or approval is recorded with no note on any criterion. *FIX:* sign-off is only valid on a PRD that has visibly passed the checklist; require the reviewer to mark each gate item, not just the header.

## QUANTITATIVE RULES

- **PRD size cap** — the economic size of a PRD is at most one page, or about 15-25 dense bullets. Below this, the PRD is probably missing content; above this, the slice is too broad and must be split.
- **Acceptance criteria measurability** — 100% of acceptance criteria must be checkable as test-pass/fail. Any criterion that cannot be turned into a test fails review.
- **Slice thinness** — a vertical slice is thin enough to demonstrably ship end-to-end in the shortest planning unit (S = 0.5-1d by deep-planner's sizing). If the slice exceeds it, split the PRD.
- **Traceability floor** — 100% of committed code lines trace to a PRD line or a PRD revision. Untraceable code is removed at review.
- **Sign-off requirement** — 0 lines of code before sign-off; the first commit exists only after the PRD passes the VERIFICATION GATE and the reviewer records approval.
- **Revision discipline** — any change to objectives, boundaries, or acceptance criteria is a version bump (1.0.0 → 1.1.0) and re-enters sign-off; unversioned edits are drift.

## VERIFICATION GATE

The PRD is verified before sign-off. Every item must be true; a single false item sends the PRD back to the section that caused it.

- **Every objective testable?** Each objective maps to a measurable acceptance criterion; no objective is decorative.
- **Boundaries explicit?** The out-of-scope list is present, non-empty, and names concrete exclusions.
- **Commands/UX exact?** Every user-visible command, argument, and output is specified — no "etc." or "similar" in the contract.
- **Testing stated?** The PRD names the test levels and which acceptance criteria they exercise.
- **Reviewer approved?** Sign-off is recorded after the checklist was run; rubber-stamp is not approval.
- **No code before sign-off?** Zero implementation exists until the PRD is approved; otherwise the build is declared unlicensed and re-gated.

Output shape — the PRD renders as one document with no blank cell:

```text
PROBLEM: {one sentence}
OBJECTIVES: O1..O5 (each measurable)
USER STORIES: {role / want / value}
ACCEPTANCE CRITERIA: {criterion → test mapping}
OUT OF SCOPE: {explicit exclusions}
RISKS: {top 3-5, likelihood x impact}
SIGN-OFF: {reviewer name, date, version}
```

A PRD with a blank acceptance cell, an empty out-of-scope list, or no recorded sign-off does not pass the gate and no code may start from it.

## REFERENCES

- addyosmani/agent-skills spec-driven-development — the upstream discipline this skill adapts: PRD-before-code, test-first mapping, and boundary definition.
- requirements-elicitation — the predecessor skill that confirms who/why/success so the PRD is written against a stable intent.
- superpowers writing-plans — the plan-format reference this skill complements: the PRD is the what, the plan is the how, and both must exist before build.
- deep-planner — the downstream consumer that decomposes a signed-off PRD into an executable task graph with per-task acceptance criteria.
- superpowers brainstorming — the intent-exploration phase that precedes the PRD; brainstorming generates options, the PRD locks one in.
- INVEST criteria — the user-story quality model (Independent, Negotiable, Valuable, Estimable, Small, Testable) that the user-stories and acceptance-criteria sections follow.
- Acceptance test-driven development — the practice of writing failing acceptance tests from criteria, which the test-first mapping pattern implements.
- Vertical slicing practice — the slice-thinness rule's source: one slice is a full thin vertical cut demonstrable end-to-end, not a horizontal layer.

Ownership: maintained by planner; spec-driven-development is a doctrine-domain skill that writes the contract before the build.