# tests/api/test_legacy_converter.py
"""Tests for legacy parser JSON → TipTap doc conversion."""
from api.converters.resume import legacy_json_to_tiptap_doc


def test_minimal_resume_yields_header_and_no_sections():
    legacy = {
        "name": "Alex Chen",
        "role": "SWE",
        "contact": ["alex@example.com"],
    }
    doc = legacy_json_to_tiptap_doc(legacy)

    assert doc["type"] == "doc"
    header = doc["content"][0]
    assert header["type"] == "resumeHeader"
    assert header["content"][0]["text"] == "Alex Chen"
    assert "alex@example.com" in header["attrs"]["contacts"]


def test_experience_becomes_section_with_entries_and_bullets():
    legacy = {
        "name": "Alex",
        "contact": [],
        "experience": [
            {
                "company": "Snapbrillia",
                "role": "Founding Engineer",
                "date": "Jan 2024 – Present",
                "bullets": ["Built the API", "Led the architecture"],
            }
        ],
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    sections = [n for n in doc["content"] if n["type"] == "resumeSection"]
    exp = next(s for s in sections if s["attrs"]["heading"] == "Experience")

    entry = exp["content"][0]
    assert entry["type"] == "entry"
    assert "Snapbrillia" in entry["attrs"]["title"]
    assert "Founding Engineer" in entry["attrs"]["title"]
    assert "Jan 2024" in entry["attrs"]["meta"]
    assert len(entry["content"]) == 2
    assert entry["content"][0]["type"] == "bullet"
    assert entry["content"][0]["content"][0]["text"] == "Built the API"


def test_skills_becomes_section_with_one_entry_per_category():
    legacy = {
        "name": "X",
        "contact": [],
        "skills": {
            "Languages": "Python, Go, TypeScript",
            "Cloud": "AWS, GCP",
        },
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    skills = next(s for s in doc["content"] if s.get("attrs", {}).get("heading") == "Skills")
    headings = [e["attrs"]["title"] for e in skills["content"]]
    assert "Languages" in headings
    assert "Cloud" in headings


def test_summary_string_becomes_one_entry_one_bullet():
    legacy = {
        "name": "X",
        "contact": [],
        "summary": "Experienced backend engineer with 5 years in Python.",
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    summary = next(s for s in doc["content"] if s.get("attrs", {}).get("heading") == "Summary")
    bullet_text = summary["content"][0]["content"][0]["content"][0]["text"]
    assert "backend engineer" in bullet_text


def test_section_order_is_summary_skills_experience_projects_education():
    legacy = {
        "name": "X",
        "contact": [],
        "summary": "S",
        "skills": {"Lang": "Py"},
        "experience": [{"company": "A", "role": "R", "date": "D", "bullets": ["b"]}],
        "projects": [{"name": "P", "tech": "T", "bullets": ["b"]}],
        "education": [{"school": "S", "degree": "D", "date": "D"}],
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    headings = [n["attrs"]["heading"] for n in doc["content"] if n["type"] == "resumeSection"]
    assert headings == ["Summary", "Skills", "Experience", "Projects", "Education"]


def test_empty_legacy_still_returns_valid_doc():
    doc = legacy_json_to_tiptap_doc({})
    assert doc["type"] == "doc"
    assert doc["content"][0]["type"] == "resumeHeader"
