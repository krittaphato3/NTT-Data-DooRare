---
title: Run database and load mock data
date: 2026-10-15
author: ZCode
ai: ZCODE
tags: session, database, postgres, mock-data, venv, python
summary: Fixed CRLF in db.sh, uninstalled Python 3.15, reset DB.
---

## Goal

Remove Python 3.15, diagnose installation failures, fix shell line endings for Windows, generate mock data, and reset PostgreSQL database.

## Done

- Uninstalled pre-release Python 3.15 (`pythoncore-3.15-64`) via Windows PythonManager, removed stale directories, and removed `AppData\Local\Python\bin` from User PATH.
- Configured Python 3.13 venv (`.venv`) with `.venv/bin` compatibility symlink for Git Bash on Windows.
- Installed `numpy` and `pyyaml` into `.venv`.
- Generated 48 mock CSV dataset files (1,412,636 rows) via `.venv/bin/python db/mock/generate.py`.
- Fixed MSYS path translation issue in `scripts/db.sh` for Windows Git Bash by setting `export MSYS_NO_PATHCONV=1`.
- Converted `scripts/db.sh` from CRLF to LF line endings and added `.gitattributes` to enforce `*.sh text eol=lf`.
- Added clear step-by-step progress logging in `scripts/db.sh` so users can see each phase (stopping, starting, health check, loading, views) in real time.
- Executed and verified `npm run db:reset` in both Git Bash and PowerShell.
- Verified record counts: 5 hospitals, 624,492 daily usage rows, 637 borrow requests, and 15,173 stock lots.
- Verified database and Adminer web UI status at http://localhost:8082.

## Decisions

- Set `export MSYS_NO_PATHCONV=1` in `scripts/db.sh` so `docker compose exec -w /mock/csv` executes correctly in Git Bash on Windows without affecting Linux/macOS.
- Created symlink `.venv/bin -> Scripts` so POSIX-style `.venv/bin/python` and `.venv/bin/pip` work on Windows.
- Set default Python to stable Python 3.13.16.
- Added `.gitattributes` with `*.sh text eol=lf` to prevent Git from converting shell scripts to CRLF on Windows.

## Files touched

- `scripts/db.sh`: Added `export MSYS_NO_PATHCONV=1`, converted CRLF to LF, added progress logs.
- `.gitattributes`: Added to enforce LF line endings on `.sh` scripts.
- `ai-material/sessions/2026-10-15-2107-zcode-run-database.md`: Recorded session details.

## Errors

- `OCI runtime exec failed: exec failed: Cwd must be an absolute path` in `scripts/db.sh load` under Windows Git Bash. Resolved with `MSYS_NO_PATHCONV=1`.
- PyYAML wheel build failure on Python 3.15 due to missing pre-built wheels and missing MSVC compiler. Resolved by removing Python 3.15 and using Python 3.13.
- `: invalid option name: set: pipefail` caused by Windows CRLF line endings (`\r\n`) in `scripts/db.sh`. Converted to LF (`\n`).

## Next steps

- Connect frontend or backend services to `postgresql://doorare:doorare_dev@127.0.0.1:5442/doorare`.
- Access Adminer at `http://localhost:8082` (server: `db`, user: `doorare`, pass: `doorare_dev`, db: `doorare`).
