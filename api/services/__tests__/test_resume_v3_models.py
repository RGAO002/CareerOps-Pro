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
