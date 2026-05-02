#!/usr/bin/env python3
"""Pre-pass: convert any v1 resume JSONs in source-dir to v2 and write to staging-dir.
v2 files are passed through (copied as-is). Used by run-migration.sh before the
TS v2→v3 migrator.

Usage: python scripts/_v1_to_v2_prepass.py <source-dir> <staging-dir>
"""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.services.migration_v1_to_v2 import migrate_one_dict


def is_resume_json(name: str) -> bool:
    if not name.endswith(".json"): return False
    if name.endswith(".suggestions.json"): return False
    if name.endswith(".backup.json"): return False
    if name.endswith(".v2-backup.json"): return False
    return True


def run(source: Path, staging: Path) -> int:
    staging.mkdir(parents=True, exist_ok=True)
    converted = 0
    passthrough = 0
    failed: list[str] = []
    for f in sorted(p for p in source.iterdir() if is_resume_json(p.name)):
        try:
            raw = json.loads(f.read_text(encoding="utf-8"))
            v = raw.get("schema_version")
            if v == 1:
                v2 = migrate_one_dict(raw)
                (staging / f.name).write_text(json.dumps(v2, indent=2, ensure_ascii=False), encoding="utf-8")
                print(f"v1→v2 {f.name}")
                converted += 1
            elif v == 2:
                shutil.copy2(f, staging / f.name)
                passthrough += 1
            else:
                print(f"SKIP {f.name}: unexpected schema_version={v}")
                failed.append(f.name)
        except Exception as e:
            print(f"FAIL {f.name}: {e}")
            failed.append(f.name)
    print(f"\nv1→v2 prepass: converted={converted}, passthrough(v2)={passthrough}, failed={len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python scripts/_v1_to_v2_prepass.py <source> <staging>", file=sys.stderr)
        sys.exit(2)
    sys.exit(run(Path(sys.argv[1]), Path(sys.argv[2])))
