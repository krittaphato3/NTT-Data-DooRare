---
title: Curated agent skills
date: 2026-10-14
author: buffy
ai: Codebuff Buffy
tags: skill, workflow, context
summary: Which agent skills this repo keeps, why, and how to add more.
---

# Curated agent skills

One folder per skill, each with a `SKILL.md` (frontmatter `name` + `description`, then instructions).
This is the team's portable skill library: any AI tool working in this repo reads only the folder that matches its task.

## Selection rule

Keep a skill only if it matches work this repo actually does:

- **Stack:** React + TypeScript + Vite, npm, Docker/nginx, Playwright capture scripts.
- **Domain:** hospital pharmacy supply collaboration, health data, multi-role web UI (pharmacist/admin), Thai users.
- **Workflow:** ai-material context/sessions/decisions, git branches + PRs.

Drop platform/stack skills for things we do not build (games, native mobile, Java, ML, payments, email, MCP servers)
and speculative backend/infra skills until that work starts.

## What we keep (26)

| Skill | Why it is here |
|---|---|
| frontend-web-engineer | Core stack: React/TS components, state, CSS |
| accessibility-audit | WCAG, keyboard, focus for hospital staff UI (dialogs, tabs, tables) |
| browser-automation | Playwright patterns behind `scripts/capture-screenshots.mjs` |
| container-optimizer | Dockerfile + nginx image in use |
| api-design-architect | Next milestone: real API replaces `src/roles/*/data` mocks |
| security-hardening-specialist | Auth, roles (pharmacist/admin), input validation |
| privacy-compliance | Health data + PDPA-style obligations |
| dependency-supply-chain-guardian | npm dependency/licence audits for an enterprise deliverable |
| performance-profiler | Heavy dashboard: bundle size, re-renders, DOM cost |
| refactoring-intelligence | Safe refactors (e.g. the `roles/` restructure) |
| systematic-debugging | Bug/flake discipline |
| test-driven-development | Quality gate (add a test runner when adopted) |
| verification-before-completion | Proof-based "done" claims; matches `context/quality-checklist.md` |
| doubt-driven-development | Adversarial check of claimed solutions |
| requirements-elicitation | Asks arrive via mockups and are often underspecified |
| deep-planner | Multi-role build needs executable plans |
| spec-driven-development | PRD-level features coming |
| source-driven-development | Framework claims must be grounded in real docs |
| adr-engineering | `decisions/` uses numbered ADRs |
| github-flow-master | Branch/PR/conventional-commit flow on this repo |
| session-continuity | Handoff notes; matches AGENTS.md session rules |
| readme-architect | README/doc quality |
| system-instructions | Multi-step agent orchestration used in this repo |
| requesting-code-review | Review-gate contract for non-trivial changes (cited by `system-instructions`, `doubt-driven-development`) |
| skill-creator | Create/improve project-specific skills |
| find-skills | Discover candidate skills before adding them here |

## Removed 2026-10-14 (28)

Not applicable to this repo today: `agent-browser`, `animation-web-builder`, `background-jobs-engineer`,
`concurrency-engineer`, `cybersecurity-specialist` (offensive only), `data-pipeline-engineer`, `database-at-scale`,
`desktop-app-developer`, `devops-pipeline-engineer`, `distributed-systems-engineer`, `email-notifications`,
`game-developer`, `general-orchestrator`, `incident-response-engineer`, `java-jvm-expert`, `llm-app-engineer`,
`mcp-builder`, `ml-python-scientist`, `mobile-developer`, `monorepo-workspace-architect`, `observability-sre`,
`payments-billing`, `query-performance-engineer`, `realtime-engineer`,
`resilience-pattern-engineer`, `roblox-lua-developer`, `system-design-architect`, `systems-core-architect`.

Re-add one only when the matching work starts (e.g. `database-at-scale` when a real database is introduced).

## Dangling references

Some kept skills route to skills/agents that live in the global tool setup rather than this folder
(e.g. `general-orchestrator`, `deep-researcher`, `animation-web-builder`, the `red-team-qa` agent).
Those pointers are informational — follow them only when that skill is available in your tool.

The full source collection lives in the Freebuff account skills library
(`~/.config/freebuff-desktop/account-skills/…`) and in the opencode global skills (`~/.config/opencode/skills/`).
Copy a folder back into this directory to re-add a skill.
