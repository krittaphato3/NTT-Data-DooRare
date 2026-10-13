---
name: find-skills
description: Use when discovering or installing agent skills — "how do I do X", "find
  a skill for X", or extending capabilities with new skills.
metadata:
  version: 0.2.0
  grade: G2
  domain: meta
  status: active
  last-reviewed: '2026-08-07'
  owned-by-agent: meta-architect
---

# Find Skills

This skill helps you discover and install skills from the open agent skills ecosystem.

## When to Use This Skill

Use this skill when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)

## What is the Skills CLI?

The Skills CLI (`npx skills`) is the package manager for the open agent skills ecosystem. Skills are modular packages that extend agent capabilities with specialized knowledge, workflows, and tools.

**Key commands:**

- `npx skills find [query] [--owner <owner>]` - Search for skills interactively or by keyword, optionally scoped to a GitHub owner
- `npx skills add <package>` - Install a skill from GitHub or other sources
- `npx skills update` - Update all installed skills

**Browse skills at:** https://skills.sh/

## How to Help Users Find Skills

### Step 1: Understand What They Need

When a user asks for help with something, identify:

1. The domain (e.g., React, testing, design, deployment)
2. The specific task (e.g., writing tests, creating animations, reviewing PRs)
3. Whether this is a common enough task that a skill likely exists

### Step 2: Check the Leaderboard First

Before running a CLI search, check the [skills.sh leaderboard](https://skills.sh/) to see if a well-known skill already exists for the domain. The leaderboard ranks skills by total installs, surfacing the most popular and battle-tested options.

For example, top skills for web development include:
- `vercel-labs/agent-skills` — React, Next.js, web design (100K+ installs each)
- `anthropics/skills` — Frontend design, document processing (100K+ installs)

### Step 3: Search for Skills

If the leaderboard doesn't cover the user's need, run the find command:

```bash
npx skills find [query] [--owner <owner>]
```

For example:

- User asks "how do I make my React app faster?" → `npx skills find react performance`
- User asks "can you help me with PR reviews?" → `npx skills find pr review`
- User asks "I need to create a changelog" → `npx skills find changelog`

### Step 4: Verify Quality Before Recommending

**Do not recommend a skill based solely on search results.** Always verify:

1. **Install count** — Prefer skills with 1K+ installs. Be cautious with anything under 100.
2. **Source reputation** — Official sources (`vercel-labs`, `anthropics`, `microsoft`) are more trustworthy than unknown authors.
3. **GitHub stars** — Check the source repository. A skill from a repo with <100 stars should be treated with skepticism.

### Step 5: Present Options to the User

When you find relevant skills, present them to the user with:

1. The skill name and what it does
2. The install count and source
3. The install command they can run
4. A link to learn more at skills.sh

Example response:

```
I found a skill that might help! The "react-best-practices" skill provides
React and Next.js performance optimization guidelines from Vercel Engineering.
(185K installs)

To install it:
npx skills add vercel-labs/agent-skills@react-best-practices

Learn more: https://skills.sh/vercel-labs/agent-skills/react-best-practices
```

### Step 6: Offer to Install

If the user wants to proceed, you can install the skill for them:

```bash
npx skills add <owner/repo@skill> -g -y
```

The `-g` flag installs globally (user-level) and `-y` skips confirmation prompts.

## Common Skill Categories

When searching, consider these common categories:

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## Tips for Effective Searches

1. **Use specific keywords**: "react testing" is better than just "testing"
2. **Try alternative terms**: If "deploy" doesn't work, try "deployment" or "ci-cd"
3. **Check popular sources**: Many skills come from `vercel-labs/agent-skills` or `ComposioHQ/awesome-claude-skills`

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using your general capabilities
3. Suggest the user could create their own skill with `npx skills init`

Example:

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill:
npx skills init my-xyz-skill
```

## WHEN NOT TO USE
- **You can solve the task directly** — if the ask is a plain, in-context capability with no likely ecosystem skill, no search is needed.
- **Enterprise/packaged skill discovery is the need** — navigating an internal skill store or catalog is a different, org-specific concern than the public `npx skills` ecosystem.
- **Security-sensitive discovery** — for a task with security/compliance constraints, verify the source before recommending installs (see STEP 4 verification); never install an unverified skill.
- **A request to install an unverified/promo package** — always run the quality gate (installs, source reputation, stars) before presenting an option.

## DECISION TREE
```text
1. ASK → is the user asking "how do I do X" or "is there a skill for X"? YES → continue.
   Can you just do it directly? → do it, stop.
2. DOMAIN → what is the concrete need (react, testing, deploy, docs, code-quality)? name 2-3 keywords.
3. LEADERBOARD → check skills.sh leaderboard for a well-known match first (top-install packages).
4. SEARCH → if not covered, `npx skills find <query> [--owner <owner>]`.
5. VERIFY → install count ≥1K, source reputation (official owners), GitHub stars. Reject <100-installs or
   unknown-author packages.
6. PRESENT → name + what it does + installs/source + install command + link.
7. INSTALL → on user confirmation: `npx skills add <owner/repo@skill> -g -y`.
```
Never recommend a skill without step 5 verification — search results alone are not enough.

## FAILURE MODES & MITIGATIONS
- **Recommending an unknown/unverified package.**
  DETECT: a skill is suggested with few installs, an unknown owner, or a low-star repo.
  FIX: enforce the STEP 4 quality gate (≥1K installs, reputable source, starred repo); for <100-installs or unknown authors, flag it and do not recommend without a demo.
- **Mis-scoped search / irrelevant results.**
  DETECT: a search returns off-topic skills because the query is too broad/"testing" matches many domains.
  FIX: narrow the query (`react testing` vs `testing`), add the owner filter, and compare to the category table before presenting.
- **Over-recommending vs solving inline.**
  DETECT: the agent installs a skill for a trivial, in-context capability the user could get directly.
  FIX: answer the request inline when it is simple; install a skill only when it genuinely adds capability (STEP 1 guard).
- **Stale/breaking skill from a trusted source.**
  DETECT: a highly-voted package is outdated or broken against the current runtime.
  FIX: prefer maintained versions, and when in doubt check the release date and last commit; offer `skills update` and re-verify.
- **Privacy/scope concern with installs.**
  DETECT: a package requires broad permissions or network at install you did not vet, or the user objects.
  FIX: describe what the skill will do, obtain explicit confirmation before `-y`, and refuse unverified or over-privileged packages.

## VERIFICATION GATE
- **Quality gate applied**: only skills meeting the install/reputation/stars threshold are recommended.
- **Result scoped to the ask**: the recommended skill matches the user's domain and task, not a keyword fuzz.
- **Install confirmed**: the user explicitly approves before `npx skills add -g -y` runs.
- **No unverified install**: nothing is installed that fails STEP 4 or requests excessive permissions.
- **Outcome validated**: after install, the skill is invoked correctly for the user's task or the user is told how.
- **red-team-qa review**: check that no low-trust package is recommended and that installs are user-confirmed.

## REFERENCES
- skills.sh leaderboard and skill catalog — `https://skills.sh/`.
- `npx skills` CLI documentation — find/add/update commands.
- Known high-trust sources (`vercel-labs/agent-skills`, `anthropics/skills`).
