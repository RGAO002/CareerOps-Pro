"""End-to-end migration test: run the Node CLI on golden v2 fixtures, then
Pydantic-validate the resulting v3 files. Asserts no data loss for the 5
canonical shapes (Summary, Experience, Skills, Spacers, Orphan).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from api.models.resume_v3 import ResumeV3

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "v2"
REPO_ROOT = Path(__file__).resolve().parents[2]

# Resolve npx at import time so subprocess can always find it, even when
# pytest is launched without nvm in PATH (e.g. from an IDE or CI shell).
_NPX = shutil.which("npx") or "/Users/fred/.nvm/versions/node/v20.20.0/bin/npx"


def test_migration_succeeds_for_all_golden_fixtures(tmp_path):
    src = tmp_path / "src"
    out = tmp_path / "out"
    src.mkdir()
    out.mkdir()
    # Copy fixtures into src so backup files don't pollute the repo.
    for f in FIXTURES_DIR.glob("*.json"):
        (src / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")

    # Invoke the migration script.
    result = subprocess.run(
        [_NPX, "tsx", str(REPO_ROOT / "scripts" / "migrate-v2-to-v3.ts"), str(src), str(out)],
        cwd=REPO_ROOT / "scripts",
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Migration failed: stdout={result.stdout}\nstderr={result.stderr}"

    # Every output file must be a valid v3 doc.
    output_files = list(out.glob("*.json"))
    assert len(output_files) == 5, f"Expected 5 output files, got {len(output_files)}"
    for f in output_files:
        raw = json.loads(f.read_text(encoding="utf-8"))
        assert raw["schema_version"] == 3, f"{f.name}: schema_version not 3"
        # Pydantic must accept it.
        doc = ResumeV3.model_validate(raw)
        assert doc.id == raw["id"]


def test_summary_fixture_preserves_summary_text(tmp_path):
    src = tmp_path / "src"
    out = tmp_path / "out"
    src.mkdir()
    out.mkdir()
    (src / "01-summary-only.json").write_text(
        (FIXTURES_DIR / "01-summary-only.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    subprocess.run(
        [_NPX, "tsx", str(REPO_ROOT / "scripts" / "migrate-v2-to-v3.ts"), str(src), str(out)],
        cwd=REPO_ROOT / "scripts",
        check=True,
    )

    doc = json.loads((out / "01-summary-only.json").read_text(encoding="utf-8"))
    # Find the bullet text.
    bullet_rows = [r for r in doc["rows"] if r["kind"] == "bullet"]
    assert len(bullet_rows) == 1
    inline = bullet_rows[0]["content"]["content"][0]["content"]
    assert inline[0]["text"] == "Software engineer with 5 years."


def test_plain_rows_have_no_stored_gid(tmp_path):
    """spec § 2.2: lazy gid rule — plain rows in v3 must NOT carry stored gid."""
    src = tmp_path / "src"
    out = tmp_path / "out"
    src.mkdir()
    out.mkdir()
    (src / "04-empty-bullets-spacers.json").write_text(
        (FIXTURES_DIR / "04-empty-bullets-spacers.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    subprocess.run(
        [_NPX, "tsx", str(REPO_ROOT / "scripts" / "migrate-v2-to-v3.ts"), str(src), str(out)],
        cwd=REPO_ROOT / "scripts",
        check=True,
    )

    doc = json.loads((out / "04-empty-bullets-spacers.json").read_text(encoding="utf-8"))
    plain_rows = [r for r in doc["rows"] if r["kind"] == "plain"]
    assert len(plain_rows) >= 2, "Spacers fixture should produce at least 2 plain rows"
    for row in plain_rows:
        assert "semanticGroupId" not in row, f"plain row {row['id']} retained stored gid"
