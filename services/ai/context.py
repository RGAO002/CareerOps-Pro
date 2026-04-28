"""Context payload builders for per-agent contextContract (spec § 4.2).

build_skeleton(resume)        -> light structural view (~200 tokens for 1-page)
build_section_detail(resume, roles) -> full nesting for matching roles, skeleton for others
build_focus_block(resume, id) -> single block tagged with `kind`
"""
from __future__ import annotations
from typing import Optional


def _section_skeleton(s: dict) -> dict:
    if s.get("role") == "experience":
        # experience defaults to richer skeleton — entry titles always carry useful signal
        return {
            "id": s["id"], "heading": s["heading"], "role": s["role"],
            "entries": [
                {"id": e["id"], "title_excerpt": e.get("title", ""), "bullet_count": len(e.get("bullets", []))}
                for e in s.get("entries", [])
            ],
        }
    # other sections: just count entries
    return {
        "id": s["id"], "heading": s["heading"], "role": s.get("role", ""),
        "entry_count": len(s.get("entries", [])),
    }


def build_skeleton(resume: dict) -> dict:
    return {
        "header": {"id": resume["header"]["id"], "name": resume["header"].get("name", "")},
        "sections": [_section_skeleton(s) for s in resume.get("sections", [])],
    }


def build_section_detail(resume: dict, roles: list) -> dict:
    role_set = set(roles or [])
    out_sections = []
    for s in resume.get("sections", []):
        if s.get("role") in role_set:
            # full nesting
            out_sections.append({
                "id": s["id"], "heading": s["heading"], "role": s.get("role", ""),
                "entries": [
                    {
                        "id": e["id"],
                        "title": e.get("title", ""),
                        "meta": e.get("meta", ""),
                        "bullets": [
                            {"id": b["id"], "content": b["content"]} for b in e.get("bullets", [])
                        ],
                    }
                    for e in s.get("entries", [])
                ],
            })
        else:
            out_sections.append(_section_skeleton(s))
    return {
        "header": {"id": resume["header"]["id"], "name": resume["header"].get("name", "")},
        "sections": out_sections,
    }


def build_focus_block(resume: dict, block_id: str) -> Optional[dict]:
    if resume["header"]["id"] == block_id:
        return {**resume["header"], "kind": "header"}
    for s in resume.get("sections", []):
        if s["id"] == block_id:
            return {**s, "kind": "section"}
        for e in s.get("entries", []):
            if e["id"] == block_id:
                return {**e, "kind": "entry"}
            for b in e.get("bullets", []):
                if b["id"] == block_id:
                    return {**b, "kind": "bullet"}
    return None
