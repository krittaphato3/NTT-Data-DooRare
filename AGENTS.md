# AI assistants must follow this loading order:

1. Read AGENTS.md
2. Read ai-material/GUIDELINES.md
3. Read ai-material/INDEX.md
4. Read only relevant files whose title, tags, or summary match the task
5. Read ai-material/context/current-task.md before doing coding work
6. Follow ai-material/context/conventions.md
7. Use ai-material/context/runbook.md for commands
8. Check ai-material/context/quality-checklist.md before saying work is done

## What an AI session must record

Every AI session must record at least these fields:

- goal
- done
- decisions
- files touched
- errors encountered
- next steps

## What AI tools must update

After working, AI tools must:

- update the session file in ai-material/sessions/
- update ai-material/INDEX.md if needed
- promote reusable knowledge into curated files if it is worth keeping

## What AI tools must NOT do

- Do not read all files in ai-material.
- Do not read full old session logs unless necessary.
- Do not paste huge transcripts.
- Do not create duplicate context files.
- Do not make unrelated refactors.
- Do not store large generated files, logs, dependencies, or secrets inside ai-material.

## Session note size and style

- Keep notes short, scannable, and token-efficient.
- Prefer bullets over paragraphs.
- Prefer file paths plus a short explanation over pasted full code.
- Do not paste full transcripts or large code blocks unless absolutely necessary.
