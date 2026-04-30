"""Tests for the v1 → v2 resume migration script."""
from api.services.migration_v1_to_v2 import (
    infer_role,
    migrate_one_dict,
    parse_contact_lines,
)


def test_infer_role():
    assert infer_role("Summary") == "summary"
    assert infer_role("Technical Skills") == "skills"
    assert infer_role("Work Experience") == "experience"
    assert infer_role("Projects") == "projects"
    assert infer_role("Education") == "education"
    assert infer_role("Awards & Honors") == "awards"
    assert infer_role("Publications") == "publications"
    assert infer_role("Cooking Hobbies") == "custom"


def test_parse_contact_lines():
    items = parse_contact_lines(
        "a@b.com | (555) 555-5555 | [GH](https://github.com/x)"
    )
    assert items[0] == {"type": "text", "value": "a@b.com"}
    assert items[1] == {"type": "text", "value": "(555) 555-5555"}
    assert items[2] == {
        "type": "link",
        "label": "GH",
        "url": "https://github.com/x",
    }


def test_migrate_one_dict_basic():
    v1 = {
        "id": "abc",
        "title": "My Resume",
        "doc": {
            "type": "doc",
            "content": [
                {"type": "resumeHeader", "attrs": {"name": "X", "contact": "x@y.com"}},
                {
                    "type": "resumeSection",
                    "attrs": {"heading": "Experience"},
                    "content": [
                        {
                            "type": "entry",
                            "attrs": {"title": "Eng", "meta": "Now"},
                            "content": [
                                {
                                    "type": "bullet",
                                    "content": [{"type": "text", "text": "did"}],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    }
    v2 = migrate_one_dict(v1)
    assert v2["schema_version"] == 2
    assert v2["id"] == "abc"
    assert v2["template_id"] == "minimal-single-column"
    assert v2["header"]["name"] == "X"
    assert v2["sections"][0]["role"] == "experience"
    assert v2["sections"][0]["heading"] == "Experience"
    bullet = v2["sections"][0]["entries"][0]["bullets"][0]
    assert bullet["content"]["type"] == "doc"
    assert bullet["content"]["content"][0]["type"] == "paragraph"
    assert bullet["content"]["content"][0]["content"][0]["text"] == "did"


def test_migrate_assigns_uuids():
    v1 = {
        "id": "x",
        "doc": {
            "type": "doc",
            "content": [
                {"type": "resumeHeader", "attrs": {}},
                {
                    "type": "resumeSection",
                    "attrs": {"heading": "E"},
                    "content": [
                        {
                            "type": "entry",
                            "attrs": {},
                            "content": [{"type": "bullet", "content": []}],
                        },
                    ],
                },
            ],
        },
    }
    v2 = migrate_one_dict(v1)
    assert v2["header"]["id"]
    assert v2["sections"][0]["id"]
    assert v2["sections"][0]["entries"][0]["id"]
    assert v2["sections"][0]["entries"][0]["bullets"][0]["id"]


def test_migrate_handles_empty_doc():
    v1 = {"id": "x", "doc": {"type": "doc", "content": []}}
    v2 = migrate_one_dict(v1)
    assert v2["sections"] == []
    assert v2["header"]["name"] == ""


def test_migrate_header_real_v1_shape():
    """v1 ResumeHeaderNode stored name as text content + contacts as attrs.contacts (list)."""
    v1 = {
        "id": "real",
        "doc": {
            "type": "doc",
            "content": [
                {
                    "type": "resumeHeader",
                    "attrs": {
                        "contacts": [
                            "rgao002@gmail.com",
                            "(555) 555-5555",
                            "[GitHub](https://github.com/rgao002)",
                        ],
                    },
                    "content": [{"type": "text", "text": "Ruoping Gao"}],
                },
            ],
        },
    }
    v2 = migrate_one_dict(v1)
    assert v2["header"]["name"] == "Ruoping Gao"
    assert len(v2["header"]["contact_lines"]) == 3
    assert v2["header"]["contact_lines"][0] == {"type": "text", "value": "rgao002@gmail.com"}
    assert v2["header"]["contact_lines"][2] == {
        "type": "link", "label": "GitHub", "url": "https://github.com/rgao002"
    }
