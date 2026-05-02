#!/usr/bin/env bash
# Big-bang migration runner: v1→v2 pre-pass → v2→v3 convert → validate.
# Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.

set -euo pipefail
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null 2>&1 || true

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR_RAW="${1:-$REPO_ROOT/saved_sessions/resumes}"
OUT_DIR_RAW="${2:-$REPO_ROOT/saved_sessions/resumes_v3_staging}"
SOURCE_DIR="$(cd "$SOURCE_DIR_RAW" && pwd)"
mkdir -p "$OUT_DIR_RAW"
OUT_DIR="$(cd "$OUT_DIR_RAW" && pwd)"

PYTHON="${REPO_ROOT}/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="$(command -v python3 || command -v python)"

V2_STAGING="$(mktemp -d -t v2-prepass-XXXXXX)"
trap 'rm -rf "$V2_STAGING"' EXIT

echo "==> Source: $SOURCE_DIR"
echo "==> v2 prepass staging: $V2_STAGING"
echo "==> v3 staging output: $OUT_DIR"
echo

echo "==> [1/3] v1→v2 pre-pass (Python)..."
"$PYTHON" "$REPO_ROOT/scripts/_v1_to_v2_prepass.py" "$SOURCE_DIR" "$V2_STAGING"
echo

echo "==> [2/3] v2→v3 conversion (Node tsx)..."
cd "$REPO_ROOT/scripts"
npx tsx migrate-v2-to-v3.ts "$V2_STAGING" "$OUT_DIR"
echo

echo "==> [3/3] Validating v3 corpus (Pydantic)..."
cd "$REPO_ROOT"
"$PYTHON" scripts/validate-v3-corpus.py "$OUT_DIR"

echo
echo "==> Migration complete. Staged v3 files in: $OUT_DIR"
echo "==> NOTE: .v2-backup.json files were created in the v2 prepass staging"
echo "==> dir (auto-cleaned on exit), not in $SOURCE_DIR. Real source files"
echo "==> are still v1/v2 — atomic swap happens in Task 2.5."
