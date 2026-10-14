# ai-material

Shared AI context, quality, and token-efficiency system for the team.

Use it as portable memory for AI sessions. Do not treat it as a dump folder.
Store only concise notes, decisions, reusable knowledge, and curated context.

## Folder meanings

- `templates/` - reusable note templates
- `context/` - current project context: task, status, architecture, conventions, quality checklist, runbook
- `decisions/` - numbered decision records
- `skills/` - curated agent skills (one folder per skill; see `skills/README.md`)
- `prompts/` - reusable prompt starters
- `errors/` - recurring error notes and fixes
- `sessions/` - short session notes
- `INDEX.md` - generated index of relevant Markdown files
- `.index.json` - machine-readable index
- `.ai-config.json` - per-user commands and limits

## Naming rules

- Use lowercase kebab-case for filenames where practical.
- Use numbers for decisions: `0001-*.md`, `0002-*.md`, and so on.
- Keep session filenames descriptive and short.
- Do not create duplicate files for the same topic.

## How to search using INDEX.md

- Read ai-material/INDEX.md first.
- Scan the table by title, tags, or summary.
- Open only files that match the current task.
- If nothing matches, read a relevant curated context file before opening old sessions.

## How to create session notes

- Start from `ai-material/templates/session.md` or run:
  - `node scripts/ai-session.mjs <ai-name> [topic...]`
- Keep session notes between 150 and 250 words when possible.
- Record goal, done, decisions, files touched, errors, and next steps.

## How to promote reusable knowledge from sessions

- If the same lesson, pattern, or fix appears more than once, promote it:
  - decisions -> `ai-material/decisions/`
  - reusable skill notes -> `ai-material/skills/`
  - recurring fixes -> `ai-material/errors/`
  - stable context -> `ai-material/context/`
- Do not promote one-off session detail. Summarize it if needed, then delete or archive the session note.

## How to run the helper scripts

- Build or refresh the index:
  - `node scripts/ai-index.mjs`
- Start a new session file:
  - `node scripts/ai-session.mjs <ai-name> [topic...]`
- If you have a package.json with the scripts added:
  - `npm run ai:index`
  - `npm run ai -- <ai-name> [topic...]`

If Node is not available, edit `ai-material/INDEX.md` and `ai-material/.index.json` by hand.
