---
name: system-instructions
description: Use when orchestrating multi-step agentic work — delegation protocol,
  confidence gates, verification gates, and skill trigger policy for opencode.
metadata:
  version: 2.0.0
  grade: G2
  domain: doctrine
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: meta-architect
---

# System Instructions — opencode Native Doctrine (v2.1 — opencode → opencode port)

This is the operational doctrine for **opencode 1.18.23+**. It governs how the primary thread (`build`/`plan` agents, `mode: primary`) orchestrates subagents (`explore`, `general`, and all 23 custom agents in `~/.config/opencode/agents/`, `mode: subagent`) via the `task` tool, how skills in `~/.config/opencode/skills/*/SKILL.md` are triggered, and what gates every piece of work passes. Ported from opencode, now 100% opencode-native: config in `opencode.jsonc` (`$schema: https://opencode.ai/config.json`), agents in `.opencode/agent(s)/`, skills discovered via `**/SKILL.md`. A fresh subagent must be able to run orchestration from this document alone.


## WHEN TO USE

Use this doctrine when:

- **Multi-step work** — the task decomposes into two or more dependent steps (context gathering, planning, implementation, verification, delivery) that must be sequenced or gated.
- **Subagent dispatch** — the task requires file edits, builds, tests, browser automation, or any execution that must not run in the main thread (see DELEGATION PROTOCOL).
- **Conflict resolution** — two instructions disagree and a precedence decision is required (see PRECEDENCE RULES).
- **Skill selection** — deciding which skill to invoke, or whether several skills must be orchestrated together (see TRIGGER POLICY).

## WHEN NOT TO USE

- **Single-step tasks** — a task that needs no orchestration: answering a question, formatting a string, making a one-line decision. Handle it directly without dispatch.
- **Covered by a specific skill** — when one skill's trigger matches the work exactly, invoke that skill; do not route through orchestration.
- **No file work and no dependencies** — if nothing needs subagents and there is no sequence to gate, this doctrine adds nothing.

## DECISION TREE

Follow this tree for every task:

1. **Multi-step or single-step?** Single-step → execute directly, invoking the matching skill if one exists (TRIGGER POLICY). Multi-step → continue.
2. **Conflict?** Yes → apply PRECEDENCE RULES; if the chain still leaves ambiguity, ask the user.
3. **Needs research first?** Yes → dispatch deep-researcher; wait per WAITING PROTOCOL; re-enter the tree with its findings.
4. **Needs a plan?** Yes (non-trivial or multi-step) → plan before code with `deep-planner`; approve the plan, then continue. If confidence is still <80 after research, run `requirements-elicitation` first — never dispatch implementation below 80.
5. **Execution** → orchestrate with verification gates: dispatch subagents per DELEGATION PROTOCOL, then apply VERIFICATION GATES and WORKFLOW STANDARDS at every step.

## PRECEDENCE RULES

When instructions conflict, the winner is decided by precedence, highest first — verbatim from the Engineering Excellence plan (Global Constraints):

> task-specific skill > family skill > system-instructions > AGENTS.md > harness defaults

1. **Task-specific skill** — the skill whose trigger matches the current work exactly.
2. **Family skill** — a skill covering the domain family of the work.
3. **system-instructions** — this doctrine.
4. **AGENTS.md** — the short principles file.
5. **Harness defaults** — whatever the toolchain provides when no instruction exists.

Duplicate triggers are a lint error: two skills may not both claim the same trigger. If two skills appear to match the same work, pick the most task-specific one; when the match is ambiguous, compare the two descriptions before dispatching.

## DELEGATION PROTOCOL (opencode `task` tool)

**Golden rule: the primary thread orchestrates; ALL heavy work goes through `task` subagents.**

### Primary thread MAY do directly

- Orchestration decisions: choosing agents per `AGENTS.md` roster, sequencing via `deep-planner` graph, applying gates
- Light `read`/`grep`/`glob` for brief triage (keep <5 tool calls)
- `webfetch`/`websearch` for doc verification via `source-driven-development`
- `mcp` calls that are low-token: `playwright` navigation when delegated to `browser-automation` subagent is preferred, but direct `mcp_playwright_*` is allowed for single-step checks

### Primary thread must route through `task` subagents

- File `edit`/`write`, multi-file `read` sweeps → `code-implementer`, `ui-ux-architect`, etc.
- `bash` builds, lint, test runs → `test-engineer`, `devops-engineer`
- Browser automation (Playwright MCP `~/.config/opencode/opencode.jsonc: mcp.playwright`) → `browser-automation` or `mcp-agent` (token-isolated)
- Database ops → `db-architect`, `data-engineer`
- Any research that needs synthesis → `deep-researcher`

Example:
```
task(subagent_type="explore", description="audit auth", prompt="[MISSION] audit [CONTEXT] src/auth/** [OUTPUT] findings")
task(subagent_type="general", description="impl fix", prompt="[MISSION] patch [CONTEXT] src/auth/login.ts [OUTPUT] diff + tests")
```

### Confidence thresholds

Score confidence before dispatching any subagent:

| Confidence | Action |
|-----------|--------|
| ≥ 80 | Proceed with dispatch |
| 70–79 | Research more or ask the user |
| 50–69 | Deeper research required |
| < 50 | STOP — do not dispatch |

The agent registry (who dispatches for what) lives in AGENTS.md and the agent-skill matrix; this doctrine supplies the protocol, not the roster.

## WAITING PROTOCOL (opencode task isolation)

While `task` subagents are running:

- Do NOT run `read`/`grep`/`glob`/`bash`/`edit` in primary thread — it pollutes the orchestration context and defeats isolation
- `webfetch` for doc verification is the only permitted primary-thread tool while waiting
- Wait silently for `task` results; primary context stays clean, subagent contexts are isolated (token-budget discipline)

```text
[WAITING]
→ task dispatched: {agent: code-implementer, mcp-agent, test-engineer}
→ Status: Waiting for task results...
→ DO NOT: read files, explore, or run bash in primary
→ DO: wait silently, then gate results vs brief
```

When results arrive: compare each result against its `[OUTPUT]` contract, take the next DECISION TREE step, and dispatch again if required. If a subagent returns `edit: ask` (quarantined), re-dispatch with explicit permission after review.


## TRIGGER POLICY

- Skills declare their triggers in the frontmatter description — precise, behavior-first trigger text, never a blanket "invoke for ALL tasks" claim.
- **One skill matches** → invoke it directly.
- **Several skills match** → invoke them in the order the DECISION TREE requires; if the work is multi-skill, parallelizable, or needs a dependency graph and per-subtask gates, use general-orchestrator.
- **No skill matches** → proceed per this doctrine and AGENTS.md.
- **Trigger ambiguity** → compare descriptions; the more specific description wins; duplicate triggers are a lint error (PRECEDENCE RULES).

## VERIFICATION GATES

- **Before implementation:** confidence ≥ 80 (threshold table in DELEGATION PROTOCOL). Below 80 → run `requirements-elicitation` (underspecified) or `deep-researcher` (missing facts); never dispatch implementation on a guess.
- **Before commit:** tests passing, lint clean, `requesting-code-review` verdict PASS/CONDITIONAL from `red-team-qa`.
- **Phase gates:** `red-team-qa` contradiction review at every phase gate.

## WORKFLOW STANDARDS

- **TDD-first** — `test-driven-development`: failing test → minimal implementation → refactor → green; exceptions require justification
- **Verification-before-completion** — `verification-before-completion`: done means proof-based evidence (test output, benchmark tables); never "looks right" sign-offs; screenshots are supporting material only, never the sole proof
- **Definition of Done before starting** — agree the DoD checklist with the task before implementation begins
- **Measurement discipline** — performance claims need before/after benchmarks, a pinned environment, ≥ 5 runs, median + p90
- **Systematic debugging** — `systematic-debugging`: reproduce → isolate → root cause → fix → regression test; never symptom patches
- **Review gates** — `requesting-code-review` + `red-team-qa` at every phase gate; non-trivial changes get review before commit
- **Plan-before-code** — non-trivial tasks get a `deep-planner` plan before implementation

Protocols live in `skills/test-driven-development`, `skills/verification-before-completion`, `skills/systematic-debugging`, `skills/requesting-code-review`.

## FAILURE MODES & MITIGATIONS

| Failure mode | Mitigation |
|---|---|
| Context overflow while orchestrating | Keep reads out of the main thread; follow WAITING PROTOCOL; delegate all file reading to subagents |
| Duplicate subagent dispatch | Track every dispatch in the task plan; spawn each subagent exactly once; check before re-dispatching |
| Agent drift (result doesn't match the brief) | Write explicit briefs with expected outputs; verify each result against its brief at every gate; re-dispatch with corrections |
| Contradictory instructions | Apply PRECEDENCE RULES; document the resolution |
| Verification theater (asserting without evidence) | VERIFICATION GATES: require test output, lint JSON, benchmark tables; never accept "looks right" |
| Silent partial failures | Gate every subtask; check each subagent's output for completeness before proceeding |

## VERIFICATION GATE

This doctrine is verified when:

- **red-team-qa contradiction review passes** — no pair of statements in this file contradicts AGENTS.md or the rest of the catalog
- **Lint passes on system-instructions** — frontmatter `name` matches directory, `description` present with What+When trigger, body uses WHEN TO USE / WHEN NOT TO USE / DECISION TREE sections
- **No blanket auto-invoke descriptions anywhere** — no skill description claims to fire on every task, in any form
- **`skills/system-instructions/SKILL.md` + `general-orchestrator` gate protocol exists and matches** — its Definition of Done, TDD protocol, and verification rules agree with ## WORKFLOW STANDARDS above

## REFERENCES (opencode)

- `C:\Users\Oz\.config\opencode\agents\` — global subagents (23) + built-ins (`build`, `plan`, `explore`, `general`) — `opencode agent list` is source of truth
- `C:\Users\Oz\.config\opencode\skills\` — global skills (38) + `https://opencode.ai/config.json` schema (`$schema`, `mcp`, `permission`, `agent`, `plugin`)
- `C:\Users\Oz\.config\opencode\opencode.jsonc` — mcp: `playwright` (`npx -y @playwright/mcp@latest --headless --isolated --caps vision`)
- `general-orchestrator` + `deep-planner` + `requirements-elicitation` — the plan→orchestrate→gate pipeline
- Opencode docs: `https://opencode.ai/docs/agents` , `https://opencode.ai/docs/skills` , `https://opencode.ai/docs/mcp`


## SAFETY

Destructive actions — deleting files or directories, force operations, anything irreversible — PAUSE and ask the user before executing. Everything else runs autonomously per this doctrine.
