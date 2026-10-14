---
name: deep-planner
description: Use when a goal or spec must become an executable plan before code is
  written — decompose into independently testable tasks, map a dependency graph and
  critical path, estimate with ranges, and register risks. Consumes research; produces
  the plan general-orchestrator executes.
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: planner
---

# Deep Planner

The discipline that turns a goal or spec into an executable plan rather than an impulse. Planning is the think-before-code layer of the engineering-excellence pipeline: it consumes verified research from deep-researcher, produces a task graph with a critical path and a risk register, and hands that plan to general-orchestrator for gate-driven execution. A plan is not a to-do list — it is a falsifiable model of the work: every task carries one testable acceptance criterion, every dependency is explicit, every estimate is a range, and every material risk has a mitigation and an escalation trigger. If a plan cannot be audited this way, it is not a plan yet.

## WHEN TO USE

- **Multi-task goals** — any goal that will decompose into two or more deliverables requiring sequencing, so the work needs a task graph, not a single instruction.
- **Spec to plan** — a requirements spec or interface contract that must become an executable sequence of tasks before code, schema, or UI work can be gated.
- **Research-informed planning** — a goal whose unknowns are material. When deep-researcher output exists, consume it first; when it does not, this skill flags the research gaps and emits the questions before finalizing (DECISION TREE step 0).
- **Handoff to execution** — the output is a plan consumed by general-orchestrator. If the work is non-trivial, AGENTS.md plan-before-code applies by mandate.
- **Dependency-heavy work** — tasks where order matters, where some things must finish before others start, and where the critical path determines duration.
- **Effort > one horizon** — work that will span multiple milestones or checkpoints and needs schedule commitment: only a plan with ranges can be re-planned deliberately instead of patched reactively.

## WHEN NOT TO USE

- **Single-step tasks** — one action with one acceptance criterion needs no decomposition or graph; handle it directly. Planning it is overhead.
- **The brainstorming/spec phase** — this skill is not a substitute for intent discovery. If requirements themselves are unclear or unspecified, go back to the spec phase first; do not plan against a moving target.
- **Research phase** — deep-researcher consumes questions and produces ground truth; this skill consumes that truth. If there is no research yet for a novel domain, research is the prerequisite, not a planning obliqueness.
- **Execution** — producing code, tests, or infrastructure is general-orchestrator's work, dispatched per task. This skill stops at the plan; it does not implement.
- **Trivial effort** — a task under the estimation floor (below S / half a day) has no graph worth drawing; do it inline rather than plan it.
- **Estimation theater** — if the goal is a fixed, externally dictated deadline with no scheduling freedom, planning adds no leverage; the decision is resource or scope, not schedule.

## DECISION TREE

Branch top-down; the first match decides, and step 0 gates everything after it.

0. **Is the goal clear and the domain known?** If the domain is unknown or knowledge is visibly missing, do not estimate a plan on a gap. Instead emit explicit research questions to deep-researcher first, wait for the synthesized answer, and re-enter here. A plan built on an unverified assumption inherits that assumption into every downstream estimate and risk.
1. **Decompose** — split the goal into independently testable tasks, one owner and one acceptance criterion per task (PATTERNS section 1). If a task cannot be independently tested, split it until every piece is.
2. **Build the dependency graph** — map which tasks must finish before which others start (PATTERNS section 2). If any cycle appears, the decomposition is wrong: re-decompose, never ship a cyclic graph to execution.
3. **Estimate** — assign a T-shirt size and a time range to every task; state the assumption behind it and flag every unknown as a research task (PATTERNS section 3, QUANTITATIVE RULES). Sum the critical path, not the raw task count.
4. **Register risks** — for each risk, record likelihood, impact, mitigation, and the trigger that escalates it (PATTERNS section 4). No un-mitigated risk travels silently into execution.
5. **Review the plan** — run the full audit in VERIFICATION GATE. A task without a testable outcome, a hidden dependency, or an orphan task fails review and returns to the step that caused it.
6. **Hand off** — emit the plan in the OUTPUT FORMAT (task table, critical path, risk register) for general-orchestrator to execute.

## PATTERNS

### 1. Task decomposition
- Each task is independently testable: it fails or passes on its own without reading another task's result.
- Each task has exactly one owner (one agent or role) and exactly one acceptance criterion.
- Each acceptance criterion is measurable — a checkable assertion, not a vibe ("validator rejects 1000-char input", not "validate input").
- The whole plan is traceable: every task links back to a spec requirement; no spec requirement is unreached (no negative-shadow scope).

### 2. Dependency graphs & critical path
- Draw an edge when one task writes state or artifacts another reads. No edge, no ordering constraint — those tasks are parallelizable.
- Compute the critical path: the longest sequence of dependent tasks from start to finish. It sets the minimum project end date; everything else has slack.
- Flag parallelizable groups for general-orchestrator waves, but never parallelize an edge. Cycles are a plan defect (see FAILURE MODES 3).
- Express the graph as an ID-to-dependency-list mapping per task so the checker can prove acyclicity and find orphans mechanically, not by eyeball.

### 3. T-shirt estimation with ranges
- Assign S / M / L / XL then a range whose MIN is a real lower bound, whose MAX is a responsible upper bound — never a single point.
- One-line assumption per task; if the assumption breaks, the range's lower bound is wrong and the estimate must be revisited.
- Every unknown ("research the API's rate limits", "confirm the legacy key format") is a separate research task in the table, not a footnote.
- Anchor ranges with reference-class outcomes (past builds of similar shape), not the optimistic ideal; early planning sits wide on the Cone of Uncertainty (REFERENCES).

### 4. Risk registers
One row per risk: likelihood (Low/Med/High), impact (Low/Med/High), mitigation, and the trigger that escalates the risk to the orchestrator. Likelihood x impact sets priority. A mitigation is an action — not a hope. A trigger is observable — not a feeling.

### 5. Plan review checklist
Before hand-off, verify every task has a testable outcome, dependencies are acyclic, the critical path is computed, no task is unreachable (orphan) and no task is unclosed (dangling), estimates are ranges, and acceptance criteria are measurable.

### 6. Milestones & checkpoints
Group tasks into milestones that each have a demonstrable outcome (a reviewable boundary), and insert a checkpoint after each. A milestone is a gate; it makes plan drift visible at the earliest safe moment, not at the end.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX. All that apply are checked at plan review.

1. **Over-decomposition (task explosion)** — the goal shatters into too many narrow tasks and the graph becomes unreadable. *DETECT:* task count explodes relative to SCOPE with many tasks that share the same owner and files. *FIX:* merge tasks with the same owner, skill, and acceptance family into one; replan granularity so each wave is reviewable.
2. **Under-specification (untestable tasks)** — a task's outcome can't be checked, so execution can't be gated. *DETECT:* no measurable acceptance criterion; the criterion says "implement X" not how to verify. *FIX:* rewrite every acceptance criterion as a testable assertion before execution begins.
3. **Hidden dependencies** — an edge the plan missed surfaces mid-execution as integration or ordering failures. *DETECT:* an execution task fails on input it did not declare; two parallel tasks touch the same state. *FIX:* trace shared state/artifacts at decomposition; never parallelize an inferred edge.
4. **Estimation optimism** — ranges are systematically too tight. *DETECT:* actuals repeatedly land above plan MAX; the plan's duration estimate sits at the optimistic edge with no reference-class anchor. *FIX:* benchmark against reference-class outcomes; widen MAX toward the Cone of Uncertainty's top; extend ranges early.
5. **Orphan tasks** — a task has no predecessor or no successor. *DETECT:* the graph has a task that nothing depends on, or a task that depends on nothing. *FIX:* orphan tasks are either a missed dependency edge (repair) or out-of-scope (remove). A task with no successor is scope creep.
6. **Plan drift** — execution diverges from the plan as reality hits. *DETECT:* > 20% of tasks slip in a planning horizon, or acceptance criteria change without a re-plan. *FIX:* a re-plan is its own managed event; re-derive from the graph with the new input, never patch individual deadlines.
7. **Circular dependencies** — the graph has a cycle, so no task can be scheduled. *DETECT:* critical-path computation hangs or the plan has a deadline loop. *FIX:* re-decompose the cycle — a cycle is never legal.
8. **Unclosed risk register** — a high-impact risk is recorded with no mitigation or no escalation trigger. *DETECT:* a risk row with blank mitigation/trigger. *FIX:* escalate a high-likelihood, high-impact risk to the orchestrator before execution; never plan around an unhandled high risk.
9. **Estimate-detail inversion** — the plan is precise where it is least known (dates on research tasks) and vague where it is most known (acceptance criteria on core tasks). *DETECT:* effort concentrated in assumptions while acceptance criteria stay prose. *FIX:* invert — put the testable assertion on every task, and let unknown tasks keep wide ranges rather than fake precision.
10. **Spec drift into the plan** — the plan silently absorbs scope changes without a re-decomposition. *DETECT:* a milestone checkpoint shows more tasks than the original graph. *FIX:* treat every added task as a plan change; re-run the review checklist before accepting it.

## QUANTITATIVE RULES

Numeric bounds that keep the plan honest and the execution schedulable.

- **Estimation ranges** (task effort NOW): S = 0.5–1d, M = 1–3d, L = 3–5d, XL = 5–10d. Any task estimated above 10d fails the granularity test — split it; no fit above XL.
- **Planning overhead**: planning itself consumes ≈ 10–15% of expected project time. Below that, the plan is likely under-decomposed; above that, over-planned for the scope.
- **Granularity floor**: a task under ~0.5d is too small for the plan's bookkeeping; merge it inline unless it is a research task that gates others.
- **Re-plan trigger**: re-plan (regenerate the graph) if > 20% of the planned tasks slip past their range or if any acceptance criterion changes. Slip below that threshold is absorbed as range variance.
- **Critical path vs raw count**: estimated duration is the summed critical path, never the summed task count; the latter is misleading and always an over-estimate of minimum time.
- **Slack discipline**: tasks not on the critical path carry explicit slack; do not spend slack before the critical path is secure. Guarding a float task while the chain slips is the classic scheduling error to avoid.
- **Research-task carve-out**: a research task gates estimates downstream; scope it as a bounded question with an explicit stopping point so it cannot become an open-ended investigation.
- **Risk priority threshold**: a likelihood x impact product of High-×-High (or High × Med with a hard dependency) is a blocker: it forces a mitigation step or an explicit escalation before that task is scheduled.
- **Fan-out to execution**: a plan handing more than ~10 tasks or ~5 parallel-wave gates to one orchestrator run is too granular; pass the goal intact through general-orchestrator instead.
- **Estimate recalibration**: after each milestone, compare actuals to ranges and shrink the residual uncertainty; the plan converges as the Cone of Uncertainty narrows, and the reconfigured ranges become the baseline for the next milestone.

## VERIFICATION GATE

The plan is verified by auditing it before hand-off. Every item below must be true to declare the plan complete; any false item returns it to the step that caused it.

- **Every task testable?** Each task names a measurable acceptance criterion; orphan and dependencies recorded.
- **Dependencies acyclic?** The dependency graph has zero cycles; the critical path computes to a finite duration.
- **Critical path computed?** The longest dependent chain is identified and it, not the raw count, drives duration and milestone schedule.
- **Risks mitigated?** Every high-likelihood × high-impact risk row has a mitigation and an escalation trigger.
- **Acceptance criteria measurable?** No task says "implement"; each says how it verifies — a test outcome, a validator, a checklist.

Hand-off shape — the plan is complete only when it renders this structure without a blank cell:

```text
TASK TABLE: id | description | deps | size (range) | acceptance criterion
CRITICAL PATH: t3 -> t5 -> t8 -> t11 (summed range)
RISK REGISTER: risk | likelihood | impact | mitigation | escalation trigger
MILESTONES: checkpoint at {task} — {demonstrable outcome}
```

A plan with a blank acceptance cell, an uncomputed critical path, or an unmitigated High-x-High risk does not pass the gate.

## REFERENCES

- Superpowers writing-plans — the canonical plan format (goal, task breakdown, dependencies, estimates, acceptance criteria) this skill's task-table and OUTPUT FORMAT generalize.
- Reference-class forecasting — the anti-optimism technique behind estimation ranges; calibrate plan ranges against prior build of similar scope rather than exclusively ideal assumptions.
- Cone of Uncertainty — the estimate-variance-with-time model justifying range-based (not point) estimates early in the lifecycle.
- Dependency-graph practice (CPM/network scheduling) — critical path and slack analysis, the basis for PATTERNS 2 and the QUANTITATIVE RULES critical-path-is-not-raw-sum rule.
- Predecessor skills: deep-researcher (research input), system-instructions v2 (delegation + confidence gates), general-orchestrator (consumes this plan). These are the documented edges of the pipeline.

Ownership: maintained by planner; deep-planner is the doctrine-domain flagship that turns research into executable, gateable plans.