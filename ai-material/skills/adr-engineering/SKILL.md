---
name: adr-engineering
description: Use when recording Architecture Decision Records (ADRs), documenting
  trade-offs, or enforcing doc-freshness for API/inline/README docs. Companion to
  system-design-architect.
metadata:
  version: 1.0.0
  grade: G3
  domain: architecture
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: solution-architect
---

# ADR ENGINEERING

The most expensive mistakes are decisions made without being remembered: the team re-derives, re-argues, or quietly reverses an irreversible choice because no one wrote down why. ADR engineering records every architectural decision as a small, living document — Context, Decision, Consequences, Alternatives — and keeps the surrounding engineering docs (API, inline, README) fresh and discoverable so a decision, once accepted, stays true long after the author moves on.

## WHEN TO USE

- You are making an architectural decision with genuine alternatives and trade-offs: a storage engine, a protocol, a concurrency model, a deployment topology, a sharding key, a library that will be expensive to leave later.
- You are changing an API surface — a public contract, request/response shape, or a versioning boundary — where downstream callers depend on your choices living past this change.
- You need to document code that is non-obvious: a subtle invariant, a correctness reason, a decision a future reader cannot recover from the code alone.
- A trade-off exists that more than one contributor will influence, now or in six months, and the delivered decision should outlast any one person's memory.
- You are changing existing decided behavior and need the reasoning visible so the change is a conscious reversal, not a silent drift.

## WHEN NOT TO USE

- **Trivial implementation choices** — an in-process constant, a loop structure, a naming preference, or a micro-choice with one obvious right answer needs no ADR.
- **Churn documentation** — you are editing docs for changes that are being reworked daily in this sprint; write facts, not a running commentary, and let the implementation land first.
- The decision is already decided, locked, and not changeable — re-deriving the ADR adds ritual, not information; record only the remaining open subset.
- A decision with no plausibly-rejected alternative — if only one option survives, the "rejected alternatives" step reduces to a conclusion, which is a note, not an ADR gate.

## DECISION TREE

```text
START
 1. CLASSIFY — is this a decision with lasting consequences?
    a. Has ≥2 real alternatives with a genuine trade-off?  → ADR.
    b. Irreversible or high-change-cost (contract, storage, topology)?  → ADR.
    c. Both absent → not a decision; stop, no document.
 2. WRITE THE ADR — follow the template in PATTERNS and keep each field:
    status, context, decision, consequences, alternatives (≥2).
    context and decision must be specific and concrete, one sentence,
    never "it depends".
 3. REGISTER — put the ADR where the team reads it, named and dated,
    linked next to the code it governs (see doc-as-code in PATTERNS).
 4. KEEP FRESH — on every PR that touches the chosen behavior, update the
    ADR in the same PR (see QUANTITATIVE RULES); on supersession, walk the
    superseded chain so nothing points to a dead decision.
 5. DOCUMENT — determine the discoverability surface:
    API reference (public contract) → README (orientation) 
    inline doc (non-obvious code) — and choose the right file for each.
```
The two collapsing rows — status never updated, and a decision recorded but never revisited — are the two that silently rot an architecture.

## PATTERNS

### ADR format (status, context, decision, consequences, alternatives)
- **status**: one of proposed / accepted / deprecated / superseded — a decision without a status is a note, not an ADR.
- **context**: the forcing pressures (numbers, constraints, deadlines) that make the decision necessary — no numbers, the reader can't re-derive its desirability.
- **decision**: the concrete choice, singular and decisive; one sentence like "schema X stores ALL reads in store X, de-normalized at write time". No "it depends", no two options joined with "perhaps".
- **consequences**: the positive and negative effects that follow, including what you accept giving away; negative consequences recorded make the trade-off honest.
- **alternatives**: every option considered and why each was rejected, with the evidence that ruled it out; this is what lets a future reader reverse or keep the choice without re-arguing.

### Status lifecycle
**proposed** → **accepted** (on approval) → **deprecated** or **superseded** (when a newer ADR replaces the decision). A superseded ADR points at its replacement; the replacement points back at what it supersedes, so the chain stays intact and a reader can walk modern both directions to find what governs now.

### Doc-as-code
Docs live with the code they describe, in the same repo and the same review flow: the ADR is a file next to the change, pull-referenced by the PR, not a wiki a separate team maintains. If the change deletes the behavior a doc describes, the care for the doc is in the same PR or the doc is already stale.

### API documentation conventions
For a public contract, specify: purpose, input and output schema/units/limits, errors (codes and when they occur), versioning policy, and a quick example. Document the observable behavior, not the implementation that produced it — the API README is a contract, not a code autobiography.

### Inline doc only where non-obvious
Comment where the code cannot express the reason (a subtle invariant, a required ordering, a correctness argument, a deliberate trade-off), and let the code itself stay the truth on the happy path. A comment that restates the code is noise; one that captures the "why" is the deliverable.

## FAILURE MODES & MITIGATIONS

- **ADRs that never get accepted or revisited** — a decision is written and ignored; nobody ever moves it to accepted or re-walks it when the world changes.
  DETECT: the ADR list grows, but no ADR's status ever changes; the registry is a graveyard.
  FIX: tie every decision to explicit accepted/update trigger and a scheduled re-walk (see QUANTITATIVE RULES); a recorded-but-never-acknowledged decision is undead docs.
- **Doc-code drift** — the code moves, the docs and ADR stay frozen at the old shape, so the doc contradicts the shipped truth.
  DETECT: an attribute or a behavior in the docs that the current code does not have; a doc that names options removed by a later change.
  FIX: update the doc in the same PR as the behavior change (one-PR rule); when the code lands without a doc, treat the drift as a gate miss, not a follow-up.
- **Docs in wrong place** — the ADR/API reference is buried in PR body text or a private note where no contributor can search it, or important behavior only in inline comments.
  DETECT: the decision is not registered in the repo when a later contributor searches for it, and the authoritative answer is only "ask the author".
  FIX: place the ADR in the doc-as-code location linked from the code it governs, register it, and open only "non-obvious" as inline.
- **Stub docs** — a header that says "TBD", an empty README, or an ADR skeleton with no decision or consequences.
  DETECT: placeholder sections, TBD tokens, empty alternative arrays, and 1-line content.
  FIX: gate on a completed ADR checklist (see VERIFICATION GATE) and push every stub to a real decision or file a complaint to fill it before merge.
- **ADR as bureaucracy** — the ritual (write, register, link) becomes the whole effect; decisions are recorded but nothing is decided.
  DETECT: ADRs full of process but no trade-offs, no rejected alternatives, and decisions that are sometimes deferring the value.
  FIX: enforce the (≥2 alternatives, consequence) requirement and remove the empty ones; a ritual that records nothing decides nothing.
- **Status not updated when superseded** — the new ADR is written and the old one stays **accepted**, so two "accepted" decisions conflict.
  DETECT: the superseded ADR still shows accepted; no pointer from old to new or new to old.
  FIX: when a decision is changed, mark the old one **superseded** and point it to the replacement, and the replacement to it, in the same PR.

## QUANTITATIVE RULES

- Each ADR is 1 to 2 pages of prose-scoped decision, context, one decision, consequences, and ≥2 rejected alternatives. Over that it is a design doc, not an ADR.
- Every decision with ≥2 plausible alternatives and a real trade-off merits an ADR; a decision with only one option, no alternatives, and no consequences that anyone has to weigh is a note.
- **Doc freshness**: the doc changes in the same PR as the code that makes it wrong. "Update docs" is not a follow-up ticket; a PR that changes behavior and ships without its doc is a doc-drift incident.
- A decision, once **accepted**, is re-walked when a trigger fires: a new option appears, a requirement number changes, or the supersession chain adds a hop.

## VERIFICATION GATE

- **ADR checklist — the gate passes only when all of these are true:**
  - context: the forcing pressures / numbers that make the decision necessary are written.
  - decision: one concrete choice, singular, and explicit — no two options, no deferral.
  - alternatives: at least two, with the evidence that rejected each.
  - consequences: the negative and positive effects are listed, including what is given up.
  - status: **proposed** / **accepted** / **deprecated** / **superseded** is set and current.
  - superseded chain: any supersession both points forward and backwards and no two **accepted** decisions contradict at a node.
- **Freshness check**: any code change that touched decided behavior updated the governing doc/ADR in the same PR.
- **Discoverability check**: the ADR/ref is registered and linked where its readers look, not buried or inline-only.
- Gate fails on any missing ADR field, on un-resolved conflict in the supersession chain, or on a shipped behavior change without the companion doc.

## REFERENCES

- Michael Nygard — the ADR pattern originator (context / decision / consequence), foundational to the format this skill enforces.
- Our system-design-architect — the architecture skill that records these ADRs; this skill is the write-the-doc companion discipline.
- The documentation-engineer agent — owns the docs that this skill systematizes into the ADR and doc conventions.
- RFC 2119 — the MUST/SHOULD/MAY vocabulary and its precision modal authority, which inform the normative language of the decisions above.