"""One-shot migration: v1 ProseMirror doc → v2 domain schema.

Usage:
    python -m api.services.migration_v1_to_v2 --dry-run        # default
    python -m api.services.migration_v1_to_v2 --apply          # write to resumes_v2/
    python -m api.services.migration_v1_to_v2 --apply --in-place  # DANGEROUS

Auto-migrate on read also calls migrate_one_dict() (no file I/O).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple

PROJECT_ROOT = Path(__file__).parent.parent.parent
V1_DIR = PROJECT_ROOT / "saved_sessions" / "resumes"
V1_BACKUP_DIR = PROJECT_ROOT / "saved_sessions" / "resumes_v1_backup"
V2_OUT_DIR = PROJECT_ROOT / "saved_sessions" / "resumes_v2"


_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def infer_role(heading: str) -> str:
    """Best-effort mapping from a v1 section heading to a v2 SectionRole.

    Falls back to "custom" for anything we don't recognise — operators can
    re-label after migration via the editor.
    """
    h = (heading or "").lower()
    if "summary" in h or "about" in h:
        return "summary"
    if "skill" in h:
        return "skills"
    if "experience" in h or "work" in h:
        return "experience"
    if "project" in h:
        return "projects"
    if "education" in h:
        return "education"
    if "award" in h or "honor" in h:
        return "awards"
    if "publication" in h:
        return "publications"
    return "custom"


def parse_contact_lines(s: str) -> list:
    """Split a v1 contact string by `|`/newline, detecting `[label](url)` markdown."""
    if not s:
        return []
    items: list = []
    for chunk in re.split(r"[|\n]+", s):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = _MD_LINK_RE.search(chunk)
        if m:
            items.append({"type": "link", "label": m.group(1), "url": m.group(2)})
        else:
            items.append({"type": "text", "value": chunk})
    return items


def migrate_bullet(node: dict, id_map: dict) -> dict:
    """v1 bullet ProseMirror node → v2 BulletBlock dict."""
    bullet_id = str(uuid.uuid4())
    id_map[f"bullet-{len(id_map)}"] = bullet_id
    inline_content = node.get("content", []) or []
    # v1 bullets had inline text directly under the bullet; wrap in a paragraph
    # so v2's stored ProseMirrorBulletDoc is a complete doc node.
    return {
        "id": bullet_id,
        "content": {
            "type": "doc",
            "content": [{"type": "paragraph", "content": inline_content}],
        },
    }


def migrate_entry(node: dict, id_map: dict) -> dict:
    entry_id = str(uuid.uuid4())
    id_map[f"entry-{len(id_map)}"] = entry_id
    attrs = node.get("attrs", {}) or {}
    return {
        "id": entry_id,
        "title": attrs.get("title", "") or "",
        "meta": attrs.get("meta", "") or "",
        "bullets": [
            migrate_bullet(c, id_map)
            for c in (node.get("content") or [])
            if isinstance(c, dict) and c.get("type") == "bullet"
        ],
    }


def migrate_section(node: dict, id_map: dict) -> dict:
    section_id = str(uuid.uuid4())
    id_map[f"section-{len(id_map)}"] = section_id
    attrs = node.get("attrs", {}) or {}
    heading = attrs.get("heading", "") or ""
    return {
        "id": section_id,
        "role": infer_role(heading),
        "heading": heading,
        "entries": [
            migrate_entry(c, id_map)
            for c in (node.get("content") or [])
            if isinstance(c, dict) and c.get("type") == "entry"
        ],
    }


def migrate_header(node, id_map: dict) -> dict:
    header_id = str(uuid.uuid4())
    id_map["header"] = header_id
    if not node:
        return {"id": header_id, "name": "", "contact_lines": []}
    attrs = node.get("attrs", {}) or {}
    return {
        "id": header_id,
        "name": attrs.get("name", "") or "",
        "contact_lines": parse_contact_lines(attrs.get("contact", "") or ""),
    }


def migrate_one_dict(v1: dict) -> dict:
    """Pure function: v1 dict → v2 dict. Used by both CLI and read-path."""
    id_map: dict = {}
    doc = v1.get("doc", {}) or {}
    content = doc.get("content", []) or []
    header_node = next(
        (n for n in content if isinstance(n, dict) and n.get("type") == "resumeHeader"),
        None,
    )
    header = migrate_header(header_node, id_map)
    sections = [
        migrate_section(n, id_map)
        for n in content
        if isinstance(n, dict) and n.get("type") == "resumeSection"
    ]
    now = datetime.utcnow().isoformat() + "Z"
    return {
        "schema_version": 2,
        "id": v1.get("id", str(uuid.uuid4())),
        "title": v1.get("title", "Untitled Resume"),
        "template_id": "minimal-single-column",
        "header": header,
        "sections": sections,
        "metadata": {
            "created_at": v1.get("created_at", now),
            "updated_at": now,
            "target_company": v1.get("target_company"),
            "target_role": v1.get("target_role"),
            "parent_id": v1.get("parent_id"),
        },
    }


def migrate_one_file(v1_path: Path) -> Tuple[dict, dict]:
    """Read a v1 JSON file and return ``(v2_dict, id_map)``.

    The id_map captures synthetic source-keys (``header``, ``section-0``,
    ``entry-1``, ``bullet-3``) → freshly-minted UUIDs so we can write a
    sidecar file for downstream traceability.
    """
    v1 = json.loads(v1_path.read_text(encoding="utf-8"))
    # Re-run migration through migrate_one_dict but capture the id_map by
    # threading through migrate_header/section/entry/bullet directly so the
    # sidecar reflects the same UUIDs as the written v2 doc.
    id_map: dict = {}
    doc = v1.get("doc", {}) or {}
    content = doc.get("content", []) or []
    header_node = next(
        (n for n in content if isinstance(n, dict) and n.get("type") == "resumeHeader"),
        None,
    )
    header = migrate_header(header_node, id_map)
    sections = [
        migrate_section(n, id_map)
        for n in content
        if isinstance(n, dict) and n.get("type") == "resumeSection"
    ]
    now = datetime.utcnow().isoformat() + "Z"
    v2 = {
        "schema_version": 2,
        "id": v1.get("id", str(uuid.uuid4())),
        "title": v1.get("title", "Untitled Resume"),
        "template_id": "minimal-single-column",
        "header": header,
        "sections": sections,
        "metadata": {
            "created_at": v1.get("created_at", now),
            "updated_at": now,
            "target_company": v1.get("target_company"),
            "target_role": v1.get("target_role"),
            "parent_id": v1.get("parent_id"),
        },
    }
    return v2, id_map


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="DANGEROUS: overwrite saved_sessions/resumes/",
    )
    args = parser.parse_args()

    if args.in_place and not args.apply:
        sys.exit("--in-place requires --apply")

    out_dir = V1_DIR if args.in_place else V2_OUT_DIR

    if args.apply:
        out_dir.mkdir(exist_ok=True)
        V1_BACKUP_DIR.mkdir(exist_ok=True)

    for v1_path in sorted(V1_DIR.glob("*.json")):
        if "_backup" in str(v1_path) or "_v2" in str(v1_path):
            continue
        try:
            v2, id_map = migrate_one_file(v1_path)
            if args.dry_run and not args.apply:
                print(
                    f"[DRY-RUN] {v1_path.name}: ok ({len(v2['sections'])} sections)"
                )
                continue

            shutil.copy(v1_path, V1_BACKUP_DIR / v1_path.name)

            target = out_dir / v1_path.name
            target.write_text(
                json.dumps(v2, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

            sidecar = out_dir / f"{v1_path.stem}.idmap.json"
            sidecar.write_text(
                json.dumps(
                    {
                        "from_schema_version": 1,
                        "migrated_at": datetime.utcnow().isoformat() + "Z",
                        "id_map": id_map,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            print(f"[OK] {v1_path.name}: backed up + migrated")
        except Exception as e:  # pragma: no cover - reported, not raised
            print(f"[ERR] {v1_path.name}: {e}")


if __name__ == "__main__":
    main()
