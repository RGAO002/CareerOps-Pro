"""Verify the canonical v3 fixture (the shape TS frontend emits) validates
against the Python Pydantic ResumeV3 model. Catches required/optional field
drift between the two implementations.
"""
import json
from pathlib import Path

from api.models.resume_v3 import ResumeV3

FIXTURE = Path(__file__).resolve().parents[1] / "migration" / "fixtures" / "v3" / "canonical-all-kinds.json"


def test_canonical_v3_fixture_validates_in_pydantic():
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    doc = ResumeV3.model_validate(raw)
    # All 7 row kinds present.
    kinds = {r.kind for r in doc.rows}
    expected = {"header.name", "header.contact", "section.heading", "entry.title", "entry.meta", "bullet", "plain"}
    assert kinds == expected, f"missing kinds: {expected - kinds}"
    # Both group kinds present.
    group_kinds = {g.kind for g in doc.groups}
    assert group_kinds == {"section", "entry"}
