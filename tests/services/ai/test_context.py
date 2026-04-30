"""Context payload builders matching per-agent contextContract (spec § 4.2)."""
import pytest

from services.ai import context


@pytest.fixture
def resume():
    return {
        "id": "r1", "schema_version": 2, "title": "Test",
        "header": {"id": "h", "name": "Fred", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience", "entries": [
                {"id": "e1", "title": "Eng @ Acme", "meta": "2024-now",
                 "bullets": [
                     {"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                     {"id": "b2", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                 ]},
                {"id": "e2", "title": "TPM @ Globex", "meta": "2022-2024",
                 "bullets": [{"id": "b3", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]},
            ]},
            {"id": "s2", "role": "skills", "heading": "Skills", "entries": [
                {"id": "e_sk1", "title": "Languages", "meta": "",
                 "bullets": [{"id": "b_sk1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]},
            ]},
        ],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None,
                     "target_role": None, "parent_id": None},
    }


def test_skeleton_minimal_shape(resume):
    sk = context.build_skeleton(resume)
    assert sk["header"]["id"] == "h" and sk["header"]["name"] == "Fred"
    s1 = sk["sections"][0]
    assert s1["id"] == "s1" and s1["role"] == "experience"
    assert s1["entries"][0] == {"id": "e1", "title_excerpt": "Eng @ Acme", "bullet_count": 2}
    s2 = sk["sections"][1]
    assert s2 == {"id": "s2", "heading": "Skills", "role": "skills", "entry_count": 1}


def test_section_detail_nests_named_roles(resume):
    out = context.build_section_detail(resume, roles=["experience"])
    s1 = next(s for s in out["sections"] if s["id"] == "s1")
    assert s1["entries"][0]["bullets"][0]["id"] == "b1"  # full nesting
    s2 = next(s for s in out["sections"] if s["id"] == "s2")
    assert "entry_count" in s2 and "entries" not in s2  # skills stays skeleton


def test_focus_block_returns_block_with_kind(resume):
    out = context.build_focus_block(resume, "b1")
    assert out["kind"] == "bullet" and out["id"] == "b1"
    out = context.build_focus_block(resume, "e2")
    assert out["kind"] == "entry" and out["title"] == "TPM @ Globex"
    out = context.build_focus_block(resume, "missing")
    assert out is None
