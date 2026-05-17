import pytest
from pydantic import ValidationError
from api.models.resume_v3 import ResumeV3, ResumeMetadataV3


def test_minimal_v3_doc_validates():
    doc = ResumeV3(
        schema_version=3,
        id="resume-1",
        title="Test",
        rows=[],
        groups=[],
        metadata=ResumeMetadataV3(
            created_at="2026-05-02T00:00:00Z",
            updated_at="2026-05-02T00:00:00Z",
        ),
    )
    assert doc.schema_version == 3
    assert doc.rows == []
    assert doc.groups == []


def test_rejects_schema_version_2():
    with pytest.raises(ValidationError):
        ResumeV3(
            schema_version=2,  # not allowed
            id="resume-1",
            title="Test",
            rows=[],
            groups=[],
            metadata=ResumeMetadataV3(
                created_at="2026-05-02T00:00:00Z",
                updated_at="2026-05-02T00:00:00Z",
            ),
        )


def test_all_row_kinds_validate():
    doc = ResumeV3(
        schema_version=3,
        id="r-2",
        title="Full",
        rows=[
            {"id": "h1", "kind": "header.name", "content": {"text": "Alice"}},
            {"id": "h2", "kind": "header.contact", "content": {"type": "text", "value": "a@b.c"}},
            {"id": "h3", "kind": "header.contact", "content": {"type": "link", "label": "site", "url": "https://x"}},
            {"id": "s1", "kind": "section.heading", "content": {"text": "Experience"}, "semanticGroupId": "gS"},
            {"id": "e1", "kind": "entry.title", "content": {"text": "Engineer"}, "semanticGroupId": "gE"},
            {"id": "e2", "kind": "entry.meta", "content": {"text": "2026"}, "semanticGroupId": "gE"},
            {"id": "b1", "kind": "bullet", "content": {"type": "doc", "content": []}, "semanticGroupId": "gE"},
            {"id": "p1", "kind": "plain", "content": {"type": "doc", "content": []}},
        ],
        groups=[
            {"id": "gS", "kind": "section", "role": "experience"},
            {"id": "gE", "kind": "entry", "parentSectionGroupId": "gS"},
        ],
        metadata=ResumeMetadataV3(
            created_at="2026-05-02T00:00:00Z",
            updated_at="2026-05-02T00:00:00Z",
        ),
    )
    assert len(doc.rows) == 8
    assert len(doc.groups) == 2


def test_rejects_unknown_row_kind():
    with pytest.raises(ValidationError):
        ResumeV3(
            schema_version=3, id="r", title="t",
            rows=[{"id": "x", "kind": "bogus", "content": {"text": ""}}],
            groups=[],
            metadata=ResumeMetadataV3(created_at="x", updated_at="x"),
        )


def test_section_group_requires_role():
    with pytest.raises(ValidationError):
        ResumeV3(
            schema_version=3, id="r", title="t",
            rows=[],
            groups=[{"id": "g", "kind": "section"}],  # missing role
            metadata=ResumeMetadataV3(created_at="x", updated_at="x"),
        )
