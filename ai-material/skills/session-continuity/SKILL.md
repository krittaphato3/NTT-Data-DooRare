---
name: session-continuity
description: Use when a coding session is long, is being resumed, or is handing off to a fresh session — compress working state into a durable handoff (goal, decisions, changed files, evidence, next action) so context loss never breaks the thread.
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-10-10'
  owned-by-agent: meta-architect
---

# Session Continuity

Long agentic sessions fail the same way every time: context fills, earlier decisions fall out of the window, and the agent confidently re-litigates something that was settled an hour ago — or silently forgets a constraint. This skill makes state **durable and external** so that any session can be resumed, by any agent, without re-deriving the work. It is the memory layer the rest of the doctrine assumes but does not provide.

## WHEN TO USE

- **Long session** — many turns, several subtasks, or clear context pressure (repeated re-reading of files already read).
- **Resuming** — the user says "continue", "where were we?", or opens a fresh session on unfinished work.
- **Handoff** — work is moving to a new session, another agent, another day, or another person.
- **Before risky context** — a big investigation, a destructive change, or a long-running job that may outlive the session.
- **After a plan is approved** — freeze the goal, decisions, and constraints so later stages cannot drift from them.
- **Interruption** — the user stops a task mid-flight; capture the resume point before the window clears.

## WHEN NOT TO USE

- **Short, self-contained task** — a single edit or question with nothing to resume.
- **Pure Q&A** — answers need no continuity artifact.
- **Before the goal is even known** — run `requirements-elicitation` first; a handoff of an unsettled goal just freezes confusion.

## DECISION TREE

1. **Decide the trigger.** Write continuity state at: plan approval, each completed milestone, any blocked step, and any explicit pause. Also write it the moment you notice context pressure.
2. **Choose the sink.** Prefer the repo's existing convention if one exists (`CONTEXT.md`, `NOTES.md`, a notes dir); otherwise write `./.agent/CONTEXT.md` at the repo root. Never bury state in a temp dir that a fresh session cannot find.
3. **Write the handoff.** Use the fixed schema below. Facts with file paths, not prose recollections.
4. **Separate durable from volatile.** Decisions, constraints, and the goal are durable; open questions, current errors, and next action are live. Update the live half every checkpoint; leave the durable half alone unless it genuinely changed.
5. **Verify it is resumable.** Read it back as if you were a fresh agent with no chat history: can you take the next action without asking anything? If not, add what is missing.
6. **Resume from it.** On resume, read the file **first**, restate the goal and next action, then continue. Do not re-derive; do not re-plan approved work.

## PATTERNS

### 1. The handoff schema (fixed — no blank cells)

```text
# CONTEXT — {project} · updated {ISO date}
GOAL:        {the outcome, one paragraph, why it matters}
STATUS:      {in-progress | blocked | review-ready | done}
DECISIONS:   {decided — rationale — date}   ← durable; do not re-litigate
CONSTRAINTS: {invariants, conventions, don'ts}   ← durable
DONE:        {completed items, each with its evidence path}
CHANGED:     {file path — one-line purpose}
NEXT:        {the single next action, concrete enough to start}
OPEN:        {unresolved questions, blockers, unknowns}
EVIDENCE:    {logs, test output, reports — paths}
```

### 2. What to record vs drop
- **Record:** decisions + why, constraints, paths, commands that worked, exact errors, evidence locations, the next action.
- **Drop:** conversational filler, superseded reasoning, anything already captured in the code or a committed doc.
- Prefer a **pointer to truth** (`src/auth/login.ts:42`) over a paraphrase of it.

### 3. Decision log discipline
Every non-obvious choice gets one line: *what, why, when*. The why is the part that is lost first and hurts most — a decision without its reason gets overturned accidentally.
When two options were weighed, record the rejected one and why, so it is not re-proposed.

### 4. Checkpoint cadence
Write a checkpoint at **every milestone** and at **every pause**, and refresh `NEXT`, `OPEN`, and `EVIDENCE` at each. `GOAL`, `DECISIONS`, and `CONSTRAINTS` change only when the user changes them.

### 5. Resume protocol (for the incoming session)
```text
1. Read CONTEXT.md first, before any file exploration.
2. Restate GOAL + STATUS + NEXT out loud in one line.
3. Confirm CONSTRAINTS still hold (the repo may have moved).
4. Verify DONE items still pass (a quick check beats trusting a stale claim).
5. Execute NEXT. Do not re-open DECISIONS; ask only if a constraint conflicts.
```

### 6. Keeping it fresh
- One file, overwritten in place — a growing pile of dated handoffs is itself context debt.
- If the repo has git, the file should be untracked or explicitly committed by the user; never silently staged.
- When the goal changes materially, start a fresh handoff rather than layering contradictions.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **Amnesia loop** — DETECT: the agent asks something already decided or re-reads the same files unchanged. FIX: stop, write/refresh the handoff, resume from it.
2. **Stale handoff** — DETECT: `NEXT` is already done, or `CHANGED` lists files that no longer match. FIX: update at every checkpoint; verify `DONE` before trusting it.
3. **Decision without rationale** — DETECT: `DECISIONS` says what but not why. FIX: add the why and the rejected alternative.
4. **Prose handoff** — DETECT: paragraphs instead of the fixed schema. FIX: reformat to the schema; the structure is what makes it machine-readable.
5. **Lost sink** — DETECT: state written to a temp path a fresh session cannot find. FIX: repo-root convention only.
6. **Premature freeze** — DETECT: the goal was never confirmed but is recorded as approved. FIX: run `requirements-elicitation`; mark the goal provisional until an explicit yes.
7. **Handoff as a substitute for work** — DETECT: long handoffs and untouched `NEXT`. FIX: cap the handoff; the artifact serves execution, it does not replace it.
8. **Constraint erosion** — DETECT: work violates a recorded constraint with no mention. FIX: on resume, re-read `CONSTRAINTS` before acting; ask before overriding one.

## QUANTITATIVE RULES

- One live handoff file per project; update cadence = every milestone and every pause.
- Handoff size soft cap ~60 lines — brevity is what keeps it readable by the next session.
- Every `DONE` item carries an evidence path; an evidence-free "done" is not done.
- `NEXT` holds exactly one action — a list of next actions is a plan, and plans live in `deep-planner`.
- Re-derivation is a failure: a resumed session re-reading the whole repo because the handoff was thin costs more than the handoff.

## VERIFICATION GATE

- **Resumable by a stranger?** A fresh agent can take `NEXT` without asking a question.
- **Schema complete?** No blank cell in the handoff; `DECISIONS` carry rationale.
- **Evidence attached?** Every `DONE` entry points to a real artifact path.
- **Live half fresh?** `STATUS`, `NEXT`, `OPEN`, `CHANGED`, `EVIDENCE` reflect the current moment.
- **No re-litigation risk?** Settled decisions are recorded with their reason so they are not reopened.

```text
[SESSION HANDOFF]
Sink:      {path}
Status:    {in-progress|blocked|review-ready|done}
Goal:      {one line}
Next:      {one action}
Evidence:  {paths}
Resumable: yes/no — {what a fresh session would still need}
```

## REFERENCES

- `requirements-elicitation` — establishes the goal this file freezes.
- `deep-planner` — owns plans; this skill owns the living state of executing one.
- `verification-before-completion` — the evidence rule for every `DONE` entry.
- `system-instructions` — the delegation/context discipline the handoff protects.
- `meta-architect` — owner; evolves the schema as sessions reveal what is lost.

Ownership: maintained by meta-architect; session-continuity is the doctrine-domain memory layer for long-running work.
