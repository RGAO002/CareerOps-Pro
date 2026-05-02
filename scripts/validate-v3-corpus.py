#!/usr/bin/env python3
"""Validate every v3 JSON in a directory against ResumeV3 Pydantic models.

Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.1.

Usage:
    python scripts/validate-v3-corpus.py <dir>

Exit 0 if all files validate; exit 1 if any fail. Prints a summary per file.
"""
import json
import sys
from pathlib import Path

# Allow running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.models.resume_v3 import ResumeV3


def validate_dir(directory: Path) -> int:
    files = sorted(p for p in directory.glob("*.json") if not p.name.endswith(".suggestions.json")
                   and not p.name.endswith(".backup.json")
                   and not p.name.endswith(".v2-backup.json"))
    failed: list[str] = []
    for path in files:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if raw.get("schema_version") != 3:
                print(f"FAIL {path.name}: schema_version={raw.get('schema_version')}, expected 3")
                failed.append(path.name)
                continue
            ResumeV3.model_validate(raw)
            print(f"OK   {path.name}")
        except Exception as e:
            print(f"FAIL {path.name}: {e}")
            failed.append(path.name)
    print(f"\nValidated {len(files) - len(failed)}/{len(files)} files. Failed: {len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/validate-v3-corpus.py <dir>", file=sys.stderr)
        sys.exit(2)
    sys.exit(validate_dir(Path(sys.argv[1])))
