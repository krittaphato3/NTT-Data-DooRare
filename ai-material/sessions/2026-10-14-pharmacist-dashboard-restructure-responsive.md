---
title: Pharmacist dashboard restructure + responsive pass
date: 2026-10-14
author: buffy
ai: Codebuff Buffy
tags: session, frontend, structure, responsive
summary: Role-based frontend restructure and full responsive adaptation of dashboard
---

## Goal

- Revert the working tree to remote `feature/dashboard-pharma` (2e1313b) and continue from it.
- Fix two reported issues: unorganized `src/` and non-responsive UI vs the mockup.

## Done

- Revert: WIP attempt (partial `components/{common,dashboard,layout}` move) preserved in `stash@{0}`; tree reset to `2e1313b`.
- Structure: `roles/pharmacist/{pages,components,data}`, shared `components/{common,layout}`, split `data/mock.ts` into `data/session.ts`, `data/navigation.ts` + `roles/pharmacist/data/dashboard.ts`. Committed files moved with `git mv` (history kept).
- Responsive: drawer nav `<1024`, phone top-bar grid `<768`, 2-col KPI/tiles `<640`, 1-col KPI `<360`, touch-target bump on coarse pointers; popovers/dialogs clamp to viewport.
- Fixed bugs found en route: dropped `gap: 24` on `.mainpad` (invalid unitless) and 460px dialog overflowing via grid-overlay sizing.
- Verified: `npm run build` (tsc+vite) exit 0; geometry checks at 1440/1280/1024/768/390/360 (no horizontal overflow, correct column counts); drawer open/close via hamburger, scrim, Esc, nav click; collapse rail 240→64; popover + dialog fit at 390; docker rebuilt, `:8080` serves new bundle (HTTP 200).

## Decisions

- `src/roles/<role>/{pages,components,data}` convention; shared layout never imports role data (props instead).
- Drawer nav below 1024px instead of the mockup's horizontal scroll strip; breakpoints documented in `index.css` header.
- `Mockups/` stays at repo root (already tracked) instead of moving under `ai-material/` — `templates/` means note templates, and ai-material forbids generated/dependency bundles (the mockup ships a vendored runtime). Linked from `context/conventions.md`.

## Files touched

- `frontend/src/` — restructure (12 moved files), `App.tsx`, `index.css` responsive system, 8 components, 3 new data files, `src/README.md`, `frontend/README.md`.

## Errors

- Browser panel screenshot capture failed ("webview not composited") all session — verified via DOM geometry instead; screenshots would be a nice-to-have re-check.
- Heredoc through the shell runner truncated a CSS append; used a temp file + `cat` instead (avoid long heredocs in this environment).

## Follow-up 2026-10-14 (UI artifacts + cleanup)

- Screenshot pipeline added: `scripts/capture-screenshots.mjs` (playwright-core + system Edge) captures full pages at 6 device sizes, 12 tagged UI parts and the phone drawer state into `artifacts/screenshots/`, plus `manifest.json` and a review gallery `artifacts/index.html`. 42 images / 4.7 MB; desktop full page 1440×2447 matches the live DOM scrollHeight.
- Components now carry `data-part="…"` attributes (12 of them) — these are the capture hooks; keep them when editing.
- Root `package.json` + lock (tooling only: `npm run capture`, `capture:dev`, `ai:index`, `ai:session`); frontend Docker build untouched.
- Deleted `tmp-compare/` (8 tracked PNGs from the previous session) — superseded by `artifacts/`; deletion left uncommitted.
- Generated captures committed as a review snapshot on request (42 images + gallery, ~4.7 MB); scratch `tmp-*/` and local `.freebuff/` tooling stay ignored.
- Verified: gallery loads all 42 images (HTTP 200), frontend build exit 0, Docker rebuilt, :8080 HTTP 200.

## Follow-up 2026-10-14 (skills triage)

- Sorted the 54-skill collection copied into `ai-material/skills/` (untracked): kept 26 that match this repo (frontend stack, hospital/health domain, ai-material + PR workflow); removed 28 (games/native/Java/ML/payments/email/MCP, speculative DB/data/distributed/infra, offensive-only security, `agent-browser`, `animation-web-builder`, `general-orchestrator` — backend multi-agent doctrine).
- Cross-reference check after pruning found kept skills citing `requesting-code-review` as the review gate, so it was restored from the account-library source (copy verified byte-identical).
- Policy documented in `skills/README.md` (selection rule, kept/removed lists, dangling-reference note); `ai-material/README.md` folder meaning updated.
- `scripts/ai-index.mjs`: skills internals excluded from the index while keeping `skills/README.md`, so INDEX stayed at 14 files instead of 49.
- Removals were untracked files (no git history to recover from); the full source collection remains in the account skills library.

## Follow-up 2026-10-14 (collapsed rail + animation)

- Collapsed rail no longer overlaps the logo with the toggle: the brand stacks vertically in the rail and the toggle keeps `z-index: 2`; its chevron rotates 180 degrees when collapsed.
- Expand/collapse animates: sidebar width 0.22s cubic-bezier, labels shrink/fade via max-width+opacity instead of `display: none`, reduced-motion fallback.
- Environment note: a machine-global `commit-msg` hook (`core.hooksPath`) strips Codebuff attribution lines from commit messages by design — respect it, do not use `--no-verify`.

## Next steps

- Re-run `npm run capture` and re-commit `artifacts/` when the UI changes; the committed capture is the current review snapshot.
- Visual pixel review vs mockup using the new gallery.
- Wire real API replacing mock data; add remaining role pages (Stock, Requests, …) on the new structure.
