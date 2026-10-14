---
name: doubt-driven-development
description: Adversarial fresh-context review of a claimed solution — CLAIM → EXTRACT
  → DOUBT → RECONCILE → STOP. Use as the review METHOD companion to the red-team-qa
  gate.
metadata:
  version: 1.0.0
  grade: G3
  domain: delivery
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: red-team-qa
---

# DOUBT-DRIVEN DEVELOPMENT

Reviews fail when the reviewer already "knows" the answer. Doubt-driven development forces a cold, adversarial re-read of a claimed solution: you state its core claim, extract its hidden assumptions, attack each with fresh evidence, then reconcile only what survives to a decision. It is the method beneath the red-team-qa gate — the human-disposable stance, applied before every merge.

## WHEN TO USE

- You are reviewing a complex change, a subsystem, or a "done" claim where correctness depends on many interacting choices (concurrency, caching, schema, retry logic).
- You need a fresh-context audit: the change was written by someone else, or by you long enough ago that your memory of why is no longer trustworthy.
- A "done" or "it works" claim is on the table and it will cost the team real money, time, or trust if it is wrong — pre-merge, pre-deploy, pre-release.
- The earlier review was done by the author, pair, or primary subject-matter expert; you want independence from that bias.
- You suspect a solution works for the happy path that was tested but has not been challenged on edge cases, invariants, or integration boundaries.

## WHEN NOT TO USE

- **Tiny mechanical diff already covered by CI** — a one-line constant change or an auto-generated migration that unit and integration tests already exercise needs no adversarial pass.
- **Evidence is complete and verified** — when the claim is backed by tests, a trace, or a written contract that someone else has already confirmed, and no new doubt vector exists, skip the cycle.
- Time-bounded greenfield where the cost of the review exceeds the cost of the mistake (a throwaway script with a one-day half-life).
- You are reviewing merely to appear diligent — if there is no live claim to attack, there is nothing for the method to do.

## DECISION TREE

```text
START
 1. FRESH CONTEXT — open the file/PR/design alone, with no chat history.
    Do not read the previous review first. State the reviewer's stated
    goal and the change's stated effect in your own words.
 2. CLAIM — write, in one sentence, the solution's core claim.
    "This change fixes X without breaking Y at Z cost."
    One claim per pass. If the solution hides more than one, list them
    and take them one at a time (see QUANTITATIVE RULES).
 3. EXTRACT — enumerate the concrete assumptions the claim rests on.
    Implicit ordering guarantees, single-writer invariances, cache
    validity windows, negative-number/over-range inputs, latency/timeouts,
    idempotency, and re-entrancy. Write them as an explicit inventory.
 4. DOUBT — attack each assumption separately with at least three
    distinct vectors (success-path, edge-case, invariant, integration).
    For each: "what would have to be true for this to fail?"
 5. RECONCILE — for every attack, match against evidence: a unit test, an
    integration test, a log, a data sample, or a stated invariant. An
    attack that has evidence backing the survival is reconciled and dropped.
 6. STOP — escalate only real defects, never the doubt that a defense
    defeated. Escalate → the red-team-qa gate. Absent one, accept and stop.
```
Never skip a step, and never move from EXTRACT to ACCEPT: doubt without evidence is not review, it is anxiety.

## PATTERNS

### Fresh-context read
Read the artifact cold: no branch memory, no "I already looked at this". The first pass is for disorientation — a review that already knows the answer will pattern-match the failures away. If you came in with a prior, write one sentence on what you think it does and then read to falsify it.

### Single-claim focus
One pass attacks one claim. Multi-claim reviews dilute the doubt budget and rubber-stamp the unexamined parts. Split a multi-claim change into one write per claim.

### Assumption inventory
Build a table of concrete the claim depends on, e.g. one write-er per key, TTL≥max-latency, single-replica ordering, key always under the data-partition. Keep the list narrow and explicit: the fewer written-down ones, the more that are hidden.

### Evidence-backed doubt
Every attack must point at the evidence that would refute or confirm it. No evidence, weaker attack. Evidence of the happy path is not evidence for the edge; each edge needs its own test or trace.

### Escalate-or-accept decision
Collector: any attack that lands (a real reproduction, a missing branch, a violated invariant) is escalated; an attack that a defense defeated is accepted. Splitting stays only on real defects. Record decisions as escalated or accepted.

## FAILURE MODES & MITIGATIONS

- **Rubber-stamp acceptance** — the review says "LGTM" with no attack that threatened the claim.
  DETECT: zero doubt, zero assumptions attacked, all five steps collapsed into "code looks fine".
  FIX: run at least three distinct doubt vectors per claim and write down the outcome; a review with nothing attempted is a failed pass for the gate.
- **No fresh context** — you are reviewing the change you (or the author) already reviewed, carrying prior conclusions forward.
  DETECT: the review reuses a prior line of reasoning and skips re-reading the changed region cold.
  FIX: re-establish fresh context by having the change re-read, or by a new reviewer; never reuse the prior disposition.
- **Attacking style instead of substance** — naming, formatting, structure harpooned while the core assumptions go untested.
  DETECT: comments and objections are about how code looks, not whether the claim holds on the invariants and edges.
  FIX: keep the doubt on the claim (does it hold at the boundaries?) and leave style to the style gate; it is not a correctness attack.
- **False-positive doubt on verified claims** — a doubt you raise was already proven stable by test or trace; raising it again erodes the reviewer's credibility and the pipeline's trust.
  DETECT: the attacked vector has a green integration test and a documented invariant; the doubt is in writing but not in defense.
  FIX: run the reconciling evidence before escalating; a negative that the evidence answers is accepted, never escalated.
- **Missing integration risk** — a claim holds in isolation but fails once it meets the real calling context (timing, ordering, cross-host, delegation, overflow).
  DETECT: the review only tested the function in a unit harness, never the connected flow, retry, or peer layer.
  FIX: add integration doubt to the vector set — the claim must fire in the surrounding system, not only on a clean bench.
- **Deferred defects** — a real failure is found and parked as "we'll fix in a follow-up", so it violates the gate today.
  DETECT: an escalated defect is re-labeled as a future task instead of a gate/revert.
  FIX: an escalated defect either fails the gate or is routed to red-team-qa for reproduction risk; a deferred defect is not an accepted disposition.

The first failure mode decides the pipeline tolerates; the last decides it is on-schedule. Both are the most damaging and both are watched on every pass.

## QUANTITATIVE RULES

- **Doubt budget**: one claim per pass. If the solution expresses more than one claim, split into separate passes.
- **Vector count**: at least 3 distinct doubt vectors per claim — pick from edge-case, invariant, integration, input-domain, ordering, and failure-injection.
- **Confidence cutoff**: only escalate a doubt that lands at ≥80% reproduction confidence (a real code path, a failing test, or a trace); mere "I think it might be" stays a note for the gate, never called a defect.
- **Timebox**: cap a single pass at 20-30 minutes of adversarial review; past that, the cost of the doubt is rising faster than the diversity of attacks, and the residual risk is outside the review budget unless a real defect is landing.

## VERIFICATION GATE

- **Connection check**: for the given claim, did you attack it with at least 3 distinct doubt vectors (fresh, integration, edge, invariant, injection)?
- **Evidence check**: for every attacked vector, did you confirm or refute it against the matching evidence (test, trace, invariant, or a directly stated, still-valid invariant)?
- **Disposition check**: did you escalate only where at least one vector landed at the confidence cutoff, and accept (not defer) every vector the evidence defeated?
- Gate fails if: a review is produced that is all endorsements with no undertaking, or a risky claim that broken vectors were unresolved.
- Record: the claim, the assumption inventory, the three vectors, and an escalated-or-accepted line per vector.

## REFERENCES

- Our red-team-qa gate — the defensive production pipeline this method feeds; a lightly different standpoint of the same review discipline.
- requesting-code-review — the contract for what a reviewer is asked to attack and return.
- verification-before-completion — where the review pass sits in the delivery lifecycle, before merge.
- The CLAIM → EXTRACT → DOUBT → RECONCILE → STOP stance draws on adversarial-review practice and Microsoft's "attack yourself before launching" review norm.