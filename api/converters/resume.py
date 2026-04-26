# api/converters/resume.py
"""Convert legacy parser JSON (RESUME_SCHEMA) → TipTap doc JSON.

The legacy schema (services/resume_parser.py) outputs a flat dict with
keys: name, role, contact, skills, summary, experience, projects, education.

The TipTap schema (frontend/src/components/resume/extensions/) uses 4
node types: resumeHeader, resumeSection, entry, bullet.
"""
from typing import Any


def legacy_json_to_tiptap_doc(legacy: dict[str, Any]) -> dict[str, Any]:
    """Pure function. Order of sections in output: Summary, Skills, Experience, Projects, Education."""
    content: list[dict[str, Any]] = []

    name = (legacy.get("name") or "").strip()
    contacts = legacy.get("contact") or []
    if not isinstance(contacts, list):
        contacts = [str(contacts)]
    contacts = [str(c) for c in contacts if c]

    header_node: dict[str, Any] = {
        "type": "resumeHeader",
        "attrs": {"contacts": contacts},
        "content": [],
    }
    if name:
        header_node["content"].append({"type": "text", "text": name})
    content.append(header_node)

    summary = (legacy.get("summary") or "").strip()
    if summary:
        content.append(_section("Summary", [
            # title="" not "Summary" — section heading is already "SUMMARY",
            # repeating the word as an entry title is just visual duplication.
            _entry(title="", meta="", bullets=[summary]),
        ]))

    skills = legacy.get("skills") or {}
    if isinstance(skills, dict) and skills:
        entries = []
        for category, items in skills.items():
            items_str = items if isinstance(items, str) else ", ".join(map(str, items))
            entries.append(_entry(title=str(category), meta="", bullets=[items_str]))
        content.append(_section("Skills", entries))

    exp_items = legacy.get("experience") or []
    if exp_items:
        entries = [_experience_entry(item) for item in exp_items if isinstance(item, dict)]
        if entries:
            content.append(_section("Experience", entries))

    proj_items = legacy.get("projects") or []
    if proj_items:
        entries = [_project_entry(item) for item in proj_items if isinstance(item, dict)]
        if entries:
            content.append(_section("Projects", entries))

    edu_items = legacy.get("education") or []
    if edu_items:
        entries = [_education_entry(item) for item in edu_items if isinstance(item, dict)]
        if entries:
            content.append(_section("Education", entries))

    return {"type": "doc", "content": content}


def _section(heading: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    if not entries:
        entries = [_entry(title="", meta="", bullets=[""])]
    return {
        "type": "resumeSection",
        "attrs": {"heading": heading},
        "content": entries,
    }


def _entry(title: str, meta: str, bullets: list[str]) -> dict[str, Any]:
    bullet_nodes = [_bullet_node(text) for text in bullets] if bullets else [_bullet_node("")]
    return {
        "type": "entry",
        "attrs": {"title": title, "meta": meta},
        "content": bullet_nodes,
    }


def _bullet_node(text: str) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "bullet", "content": []}
    if text:
        node["content"].append({"type": "text", "text": text})
    return node


def _experience_entry(item: dict[str, Any]) -> dict[str, Any]:
    company = (item.get("company") or "").strip()
    role = (item.get("role") or "").strip()
    title = " @ ".join(p for p in (role, company) if p) or company or role or "(untitled)"
    date = (item.get("date") or "").strip()
    bullets = [str(b) for b in (item.get("bullets") or []) if b]
    return _entry(title=title, meta=date, bullets=bullets)


def _project_entry(item: dict[str, Any]) -> dict[str, Any]:
    name = (item.get("name") or "").strip()
    tech = (item.get("tech") or "").strip()
    title = name or "(untitled project)"
    meta = tech
    bullets = [str(b) for b in (item.get("bullets") or []) if b]
    return _entry(title=title, meta=meta, bullets=bullets)


def _education_entry(item: dict[str, Any]) -> dict[str, Any]:
    school = (item.get("school") or "").strip()
    degree = (item.get("degree") or "").strip()
    title = " · ".join(p for p in (degree, school) if p) or school or degree or "(untitled)"
    date = (item.get("date") or "").strip()
    gpa = (item.get("gpa") or "").strip()
    meta = " · ".join(p for p in (date, f"GPA {gpa}" if gpa else "") if p)
    coursework = item.get("coursework") or []
    bullets = []
    if isinstance(coursework, list) and coursework:
        bullets.append("Coursework: " + ", ".join(map(str, coursework)))
    note = (item.get("note") or "").strip()
    if note:
        bullets.append(note)
    return _entry(title=title, meta=meta, bullets=bullets or [""])
