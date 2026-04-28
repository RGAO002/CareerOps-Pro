"""Write tools emit Suggestion records but never mutate resume.

Spec § 3.3 + § 5.1. Verify each tool produces a correctly-shaped record with
emit-time `before` / `beforeChildIds` snapshots and stable UUIDs for inserts.
"""
import json
import pytest

from services.ai.tools import write_tools
from services.ai import suggestions


@pytest.fixture
def setup(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "schema_version": 2, "title": "T",
        "header": {"id": "h", "name": "Fred", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience", "entries": [
                {"id": "e1", "title": "T1", "meta": "M1", "bullets": [
                    {"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                    {"id": "b2", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                ]},
            ]},
        ],
        "metadata": {"created_at": "", "updated_at": "", "target_company": None,
                     "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    return tmp_path


def _ctx():
    return {"resumeId": "r1", "agentId": "PolishAgent", "runId": "run_1"}


def test_update_bullet_emits_update_suggestion_with_before(setup):
    new_doc = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]}
    sid = write_tools.update_bullet("b1", new_doc, ctx=_ctx())
    items = suggestions.list_for_resume("r1")
    [s] = items
    assert s["id"] == sid and s["op"] == "update"
    assert s["field"] == {"kind": "bullet.content", "id": "b1"}
    assert s["before"] == {"type": "doc", "content": [{"type": "paragraph"}]}
    assert s["after"] == new_doc


def test_update_entry_title_captures_string_before(setup):
    write_tools.update_entry_title("e1", "New Title", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "update" and s["field"]["kind"] == "entry.title"
    assert s["before"] == "T1" and s["after"] == "New Title"


def test_update_section_heading_captures_before(setup):
    write_tools.update_section_heading("s1", "EXP", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["before"] == "Experience" and s["after"] == "EXP"


def test_update_header_name_no_blockId_arg(setup):
    write_tools.update_header_name("Frederick", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["field"] == {"kind": "header.name"}
    assert s["before"] == "Fred" and s["after"] == "Frederick"


def test_insert_bullet_mints_uuid_and_captures_beforeChildIds(setup):
    new_content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "n"}]}]}
    write_tools.insert_bullet("e1", at_index=1, content=new_content, ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "insert"
    assert s["parentId"] == "e1" and s["atIndex"] == 1
    assert s["beforeChildIds"] == ["b1", "b2"]
    assert s["insertedBlock"]["kind"] == "bullet"
    assert isinstance(s["insertedBlock"]["id"], str) and len(s["insertedBlock"]["id"]) >= 16
    assert s["insertedBlock"]["content"] == new_content


def test_insert_entry_mints_ids_for_entry_and_each_bullet(setup):
    payload = {
        "title": "New Entry", "meta": "2026",
        "bullets": [
            {"type": "doc", "content": [{"type": "paragraph"}]},
            {"type": "doc", "content": [{"type": "paragraph"}]},
        ],
    }
    write_tools.insert_entry("s1", at_index=1, payload=payload, ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "insert"
    assert s["beforeChildIds"] == ["e1"]
    ib = s["insertedBlock"]
    assert ib["kind"] == "entry" and len(ib["bullets"]) == 2
    assert all(isinstance(b["id"], str) and len(b["id"]) >= 16 for b in ib["bullets"])
    assert len({ib["id"], *(b["id"] for b in ib["bullets"])}) == 3  # all distinct ids


def test_delete_bullet_captures_deleted_block(setup):
    write_tools.delete_bullet("b1", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "delete" and s["blockId"] == "b1"
    assert s["parentId"] == "e1"
    assert s["beforeChildIds"] == ["b1", "b2"]
    assert s["deletedBlock"]["id"] == "b1" and s["deletedBlock"]["kind"] == "bullet"


def test_move_bullet_captures_both_parent_snapshots(setup, monkeypatch):
    # Add a second entry so we have a real cross-entry move target.
    p = setup / "r1.json"
    r = json.loads(p.read_text())
    r["sections"][0]["entries"].append({"id": "e2", "title": "T2", "meta": "M2",
                                        "bullets": [{"id": "b3", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]})
    p.write_text(json.dumps(r))
    write_tools.move_bullet("b1", to_parent_id="e2", to_index=0, ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "move" and s["blockId"] == "b1"
    assert s["fromParentId"] == "e1" and s["fromBeforeChildIds"] == ["b1", "b2"]
    assert s["toParentId"] == "e2" and s["toBeforeChildIds"] == ["b3"]


def test_unknown_target_raises_tool_error(setup):
    with pytest.raises(write_tools.ToolError):
        write_tools.update_bullet("nope", {"type": "doc", "content": []}, ctx=_ctx())


def test_status_starts_streaming(setup):
    """Per spec § 4.4 / Q10: agent's tool calls fire as `streaming` until run completes."""
    write_tools.update_entry_title("e1", "X", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["status"] == "streaming"
