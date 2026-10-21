#!/usr/bin/env bash
#
# Phase 8 close-out check: re-verify the F1 module end to end WITHOUT training.
#
# Deliberately absent: `cli train`. The WEEK and MONTH artifacts are frozen; retraining would
# silently replace the models every number in README / reports refers to.
#
# What runs, in order:
#   1. validate  — data-quality gate (read-only on data/)
#   2. features  — weekly rebuild + monthly build (writes gitignored data/, reports/feature_build.*)
#   3. evaluate  — score the SAVED artifact on the valid split, --no-report (no writes, no test look)
#   4. predict   — inference for WEEK and MONTH (writes artifacts/forecasts/<version>/forecast_*.json)
#   5. pytest    — 94 tests
#
# Any step failing aborts the script with that step's exit code (set -e + pipefail).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MODELS_DIR/../.." && pwd)"
PYTHON="${PYTHON:-$REPO_ROOT/.venv/bin/python}"

if [[ ! -x "$PYTHON" ]]; then
  echo "ERROR: python not found at $PYTHON" >&2
  echo "Create the repo-root venv first: python3 -m venv .venv && .venv/bin/pip install -r backend/models/requirements.txt" >&2
  exit 1
fi

cd "$MODELS_DIR"
echo "models:  $MODELS_DIR"
echo "python:  $PYTHON ($("$PYTHON" -c 'import sys; print(sys.version.split()[0])'))"

step() {
  local label="$1"
  shift
  printf '\n===== %s =====\n' "$label"
  "$@"
}

step "1/6 validate (data-quality gate)" \
  "$PYTHON" -m f1_forecast.cli validate

step "2/6 features (weekly rebuild + monthly build)" \
  "$PYTHON" -m f1_forecast.cli features

step "3/6 evaluate from the saved WEEK artifact (valid split, no report)" \
  "$PYTHON" -m f1_forecast.cli evaluate --granularity WEEK --split valid --no-report

step "3/6 evaluate from the saved MONTH artifact (valid split, no report)" \
  "$PYTHON" -m f1_forecast.cli evaluate --granularity MONTH --split valid --no-report

step "4/6 predict WEEK" \
  "$PYTHON" -m f1_forecast.cli predict --granularity WEEK

step "4/6 predict MONTH" \
  "$PYTHON" -m f1_forecast.cli predict --granularity MONTH

step "5/6 pytest" \
  "$PYTHON" -m pytest

printf '\n===== 6/6 done: every step passed (models were NOT retrained) =====\n'
