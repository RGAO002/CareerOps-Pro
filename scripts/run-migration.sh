#!/usr/bin/env bash
# Big-bang migration runner: backup -> convert -> validate.
# Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.

set -euo pipefail

# Source nvm so `npx tsx` resolves node 20 without requiring the caller to
# have manually run `nvm use 20`.
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null 2>&1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Resolve to absolute paths so later `cd` calls don't break relative args.
SOURCE_DIR="$(cd "${1:-$REPO_ROOT/saved_sessions/resumes}" && pwd)"
OUT_DIR="${2:-$REPO_ROOT/saved_sessions/resumes_v3_staging}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# Python: prefer project venv, fall back to system python3.
PYTHON="${REPO_ROOT}/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
    PYTHON="$(command -v python3 || command -v python)"
fi

echo "==> Source: $SOURCE_DIR"
echo "==> Staging output: $OUT_DIR"
echo

# Step 1: Convert (script writes .v2-backup.json next to each source file).
echo "==> [1/2] Running v2->v3 conversion..."
cd "$REPO_ROOT/scripts"
npx tsx migrate-v2-to-v3.ts "$SOURCE_DIR" "$OUT_DIR"
echo

# Step 2: Validate.
echo "==> [2/2] Validating v3 corpus..."
cd "$REPO_ROOT"
"$PYTHON" scripts/validate-v3-corpus.py "$OUT_DIR"

echo
echo "==> Migration complete. Staged v3 files in: $OUT_DIR"
echo "==> .v2-backup.json files preserved in: $SOURCE_DIR"
echo
echo "Next step (manual): once you've verified the staging output, replace"
echo "the source files atomically:"
echo "    cp $OUT_DIR/*.json $SOURCE_DIR/"
