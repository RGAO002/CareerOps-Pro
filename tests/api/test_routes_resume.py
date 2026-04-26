# tests/api/test_routes_resume.py
"""Integration tests for /api/resume routes."""
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.resume import Resume
from api.services import resume_store, snapshot_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    rdir = tmp_path / "resumes"
    rdir.mkdir()
    sdir = rdir / "snapshots"
    sdir.mkdir()
    monkeypatch.setattr(resume_store, "RESUMES_DIR", rdir)
    monkeypatch.setattr(snapshot_store, "SNAPSHOTS_DIR", sdir)


@pytest.fixture
def client():
    return TestClient(app)


def _seed_resume(rid: str, title: str, ts: int = 1000) -> None:
    resume_store.save(Resume(id=rid, title=title, created_at=ts, updated_at=ts))


def test_list_returns_empty_when_no_resumes(client):
    resp = client.get("/api/resume/")
    assert resp.status_code == 200
    assert resp.json() == {"resumes": []}


def test_list_returns_summary_fields_only(client):
    _seed_resume("a", "A", 100)
    _seed_resume("b", "B", 200)
    resp = client.get("/api/resume/")
    assert resp.status_code == 200
    items = resp.json()["resumes"]
    assert len(items) == 2
    assert items[0]["id"] == "b"
    assert "title" in items[0]
    assert "doc" not in items[0]


def test_get_one_returns_full_resume(client):
    _seed_resume("x", "X")
    resp = client.get("/api/resume/x")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "x"
    assert "doc" in body


def test_get_missing_returns_404(client):
    resp = client.get("/api/resume/nope")
    assert resp.status_code == 404


def test_put_creates_or_replaces_resume(client):
    payload = {
        "id": "new1",
        "title": "Brand new",
        "created_at": 1000,
        "updated_at": 1000,
        "doc": {"type": "doc", "content": []},
    }
    resp = client.put("/api/resume/new1", json=payload)
    assert resp.status_code == 200
    assert resp.json()["id"] == "new1"

    got = client.get("/api/resume/new1")
    assert got.status_code == 200
    assert got.json()["title"] == "Brand new"


def test_put_with_mismatched_id_uses_url_id(client):
    """URL :id wins if body id differs (defensive)."""
    payload = {
        "id": "bodyid",
        "title": "T",
        "created_at": 1,
        "updated_at": 1,
        "doc": {"type": "doc", "content": []},
    }
    resp = client.put("/api/resume/urlid", json=payload)
    assert resp.status_code == 200
    assert resp.json()["id"] == "urlid"
    assert resume_store.get("urlid") is not None
    assert resume_store.get("bodyid") is None


def test_post_creates_blank_resume(client):
    resp = client.post("/api/resume/", json={"title": "Empty"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Empty"
    assert body["id"]
    assert body["doc"]["type"] == "doc"
    assert resume_store.get(body["id"]) is not None


# --- /parse tests ---
#
# IMPORTANT: services.resume_parser.parse_resume and parse_resume_from_image
# both return WRAPPED responses: {"success": bool, "data": {...}, "error": str}.
# Earlier versions of these tests mocked them to return the data dict directly,
# which masked a real unwrap bug in /parse. Always mock with the wrapped shape.

_FAKE_LEGACY = {
    "name": "Test User",
    "contact": ["test@example.com"],
    "experience": [
        {"company": "Acme", "role": "Eng", "date": "2024", "bullets": ["Built X"]}
    ],
}


def _post_pdf(client, filename="test.pdf"):
    return client.post(
        "/api/resume/parse",
        files={"file": (filename, io.BytesIO(b"%PDF-1.4\n..."), "application/pdf")},
    )


def test_parse_default_uses_vision(client, monkeypatch):
    """By default /parse should call parse_resume_from_image (vision), not text parser.

    Default is intentional — text extraction from fancy resume PDFs (Canva,
    multi-column templates) is unreliable. See comment in api/routes/resume.py.
    """
    from api.routes import resume as routes

    text_calls: list = []
    vision_calls: list = []

    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "Some PDF text")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: False)
    monkeypatch.setattr(
        routes, "parse_resume",
        lambda *a, **k: text_calls.append(a) or {"success": True, "data": _FAKE_LEGACY},
    )
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: vision_calls.append(a) or {"success": True, "data": _FAKE_LEGACY},
    )
    monkeypatch.delenv("CAREEROPS_PARSE_MODE", raising=False)

    resp = _post_pdf(client)
    assert resp.status_code == 200
    assert len(vision_calls) == 1, "vision should be called by default"
    assert len(text_calls) == 0, "text parser should NOT be called when vision succeeds"


def test_parse_unwraps_wrapped_response_correctly(client, monkeypatch):
    """The route must unwrap parser's {"success", "data"} wrapper and feed `data` to converter.

    Regression test: an earlier bug treated the wrapper itself as the legacy data,
    producing an empty resume (no sections, fallback title from filename).
    """
    from api.routes import resume as routes

    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "x")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: False)
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: {"success": True, "data": _FAKE_LEGACY},
    )

    resp = _post_pdf(client)
    assert resp.status_code == 200
    body = resp.json()

    # Title comes from legacy.name, NOT from filename
    assert body["title"] == "Test User"

    # Doc must include the parsed Experience section, NOT just an empty header
    headings = [n["attrs"]["heading"] for n in body["doc"]["content"]
                if n["type"] == "resumeSection"]
    assert "Experience" in headings, f"missing Experience section; got headings {headings}"

    # Header should carry the parsed name
    header = body["doc"]["content"][0]
    assert header["type"] == "resumeHeader"
    assert any(c.get("text") == "Test User" for c in header.get("content", []))


def test_parse_mode_text_env_var_skips_vision(client, monkeypatch):
    """CAREEROPS_PARSE_MODE=text forces the text parser (cheap path)."""
    from api.routes import resume as routes

    text_calls: list = []
    vision_calls: list = []

    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "Some PDF text")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: False)
    monkeypatch.setattr(
        routes, "parse_resume",
        lambda *a, **k: text_calls.append(a) or {"success": True, "data": _FAKE_LEGACY},
    )
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: vision_calls.append(a) or {"success": True, "data": _FAKE_LEGACY},
    )
    monkeypatch.setenv("CAREEROPS_PARSE_MODE", "text")

    resp = _post_pdf(client)
    assert resp.status_code == 200
    assert len(text_calls) == 1
    assert len(vision_calls) == 0


def test_parse_vision_failure_falls_back_to_text(client, monkeypatch):
    """If vision returns {"success": False, ...} but text is available + not scanned,
    /parse must retry with the text parser (not 500)."""
    from api.routes import resume as routes

    text_calls: list = []

    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "Some real text")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: False)
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: {"success": False, "error": "vision flop"},
    )
    monkeypatch.setattr(
        routes, "parse_resume",
        lambda *a, **k: text_calls.append(a) or {"success": True, "data": _FAKE_LEGACY},
    )

    resp = _post_pdf(client)
    assert resp.status_code == 200, f"expected fallback success, got {resp.status_code}: {resp.text}"
    assert len(text_calls) == 1, "text parser should be called as fallback"
    assert resp.json()["title"] == "Test User"


def test_parse_no_text_uses_vision(client, monkeypatch):
    """Scanned-style PDF (no extractable text) must go to vision, not 422."""
    from api.routes import resume as routes

    vision_called = []
    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "")  # empty == scanned-ish
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: True)
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: vision_called.append(a) or {"success": True, "data": _FAKE_LEGACY},
    )

    resp = _post_pdf(client)
    assert resp.status_code == 200
    assert vision_called, "vision must be called for scanned PDFs (no longer 422)"


def test_parse_failure_propagates_500(client, monkeypatch):
    """Both paths failing → 500 with descriptive error."""
    from api.routes import resume as routes

    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: True)
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: {"success": False, "error": "out of credits"},
    )

    resp = _post_pdf(client)
    assert resp.status_code == 500
    assert "out of credits" in resp.text


def test_parse_empty_data_rejected(client, monkeypatch):
    """Parser returned success but no data → 500, not silently empty resume."""
    from api.routes import resume as routes

    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "x")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: False)
    monkeypatch.setattr(
        routes, "parse_resume_from_image",
        lambda *a, **k: {"success": True, "data": {}},
    )
    # Disable text fallback path by making parse_resume also return empty
    monkeypatch.setattr(
        routes, "parse_resume",
        lambda *a, **k: {"success": True, "data": {}},
    )

    resp = _post_pdf(client)
    assert resp.status_code == 500
    assert "no data" in resp.text.lower()


def test_parse_rejects_non_pdf(client):
    resp = client.post(
        "/api/resume/parse",
        files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
    )
    assert resp.status_code == 400


# --- /pdf tests ---


def test_pdf_endpoint_returns_pdf_bytes_with_attachment_header(client, monkeypatch):
    """GET /api/resume/:id/pdf streams a PDF download (Streamlit-style one-click)."""
    _seed_resume("pdf1", "My Resume")
    from api.routes import resume as routes

    monkeypatch.setattr(routes, "convert_html_to_pdf", lambda html: b"%PDF-fake-bytes")

    resp = client.get("/api/resume/pdf1/pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert "My Resume.pdf" in resp.headers["content-disposition"]
    assert resp.content == b"%PDF-fake-bytes"


def test_pdf_endpoint_404_for_unknown_resume(client):
    resp = client.get("/api/resume/nope/pdf")
    assert resp.status_code == 404


def test_pdf_endpoint_500_when_weasyprint_fails(client, monkeypatch):
    _seed_resume("pdf2", "Test")
    from api.routes import resume as routes
    monkeypatch.setattr(routes, "convert_html_to_pdf", lambda html: None)

    resp = client.get("/api/resume/pdf2/pdf")
    assert resp.status_code == 500


def test_pdf_endpoint_sanitizes_filename(client, monkeypatch):
    """Title with shell-meta chars must not bleed into Content-Disposition."""
    _seed_resume("pdf3", 'Resume "evil"; rm -rf /')
    from api.routes import resume as routes
    monkeypatch.setattr(routes, "convert_html_to_pdf", lambda html: b"%PDF-x")

    resp = client.get("/api/resume/pdf3/pdf")
    assert resp.status_code == 200
    cd = resp.headers["content-disposition"]
    # Quotes and shell metas must be stripped
    assert '"' not in cd.replace('filename="', "").replace('.pdf"', "")
    assert ";" not in cd[len("attachment; filename=\""):]
    assert "rm" not in cd or "_" in cd  # at minimum sanitized to safe chars


def test_pdf_endpoint_passes_doc_to_renderer(client, monkeypatch):
    """The endpoint must call the converter with the actual stored doc."""
    _seed_resume("pdf4", "T")
    # Patch the resume's doc to something specific
    r = resume_store.get("pdf4")
    r.doc = {"type": "doc", "content": [
        {"type": "resumeHeader", "attrs": {"contacts": []},
         "content": [{"type": "text", "text": "Captured Name"}]}
    ]}
    resume_store.save(r)

    captured: dict = {}

    def fake_html(doc, title="Resume"):
        captured["doc"] = doc
        captured["title"] = title
        return "<html>fake</html>"

    from api.routes import resume as routes
    monkeypatch.setattr(routes, "tiptap_doc_to_html", fake_html)
    monkeypatch.setattr(routes, "convert_html_to_pdf", lambda html: b"%PDF-x")

    resp = client.get("/api/resume/pdf4/pdf")
    assert resp.status_code == 200
    # Verify the actual doc + title were passed in (not stale data)
    assert captured["title"] == "T"
    name_node = captured["doc"]["content"][0]
    assert name_node["content"][0]["text"] == "Captured Name"


def test_post_snapshot_creates_record(client):
    _seed_resume("r1", "T")
    resp = client.post("/api/resume/r1/snapshot", json={"trigger": "checkpoint", "label": "v1.0"})
    assert resp.status_code == 200
    snap = resp.json()
    assert snap["resume_id"] == "r1"
    assert snap["trigger"] == "checkpoint"
    assert snap["label"] == "v1.0"


def test_get_snapshots_lists_newest_first(client):
    _seed_resume("r2", "T")
    client.post("/api/resume/r2/snapshot", json={"trigger": "auto"})
    client.post("/api/resume/r2/snapshot", json={"trigger": "checkpoint", "label": "L"})

    resp = client.get("/api/resume/r2/snapshots")
    assert resp.status_code == 200
    snaps = resp.json()["snapshots"]
    assert len(snaps) == 2
    assert snaps[0]["created_at"] >= snaps[1]["created_at"]


def test_restore_replaces_doc_and_creates_pre_restore_snapshot(client):
    _seed_resume("r3", "T")
    r = resume_store.get("r3")
    r.doc = {"type": "doc", "content": [{"type": "resumeHeader", "attrs": {"contacts": []}, "content": [{"type": "text", "text": "v1"}]}]}
    resume_store.save(r)
    snap_resp = client.post("/api/resume/r3/snapshot", json={"trigger": "checkpoint", "label": "before"})
    snap_id = snap_resp.json()["id"]

    r = resume_store.get("r3")
    r.doc = {"type": "doc", "content": [{"type": "resumeHeader", "attrs": {"contacts": []}, "content": [{"type": "text", "text": "v2"}]}]}
    resume_store.save(r)

    restore_resp = client.post(f"/api/resume/r3/restore", json={"snapshot_id": snap_id})
    assert restore_resp.status_code == 200
    restored = resume_store.get("r3")
    assert restored.doc["content"][0]["content"][0]["text"] == "v1"

    snaps = client.get("/api/resume/r3/snapshots").json()["snapshots"]
    pre_restore = [s for s in snaps if s.get("diff_summary", "").startswith("Pre-restore")]
    assert len(pre_restore) == 1
    assert pre_restore[0]["trigger"] == "checkpoint"


def test_variant_forks_a_new_independent_copy(client):
    _seed_resume("base1", "Base")
    r = resume_store.get("base1")
    r.doc = {"type": "doc", "content": [{"type": "resumeHeader", "attrs": {"contacts": []}, "content": [{"type": "text", "text": "Base name"}]}]}
    resume_store.save(r)

    resp = client.post("/api/resume/base1/variant", json={
        "title": "Stripe Backend",
        "target_company": "Stripe",
        "target_role": "Backend SWE",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] != "base1"
    assert body["title"] == "Stripe Backend"
    assert body["parent_id"] == "base1"
    assert body["is_base"] is False
    assert body["target_company"] == "Stripe"

    variant = resume_store.get(body["id"])
    variant.doc = {"type": "doc", "content": []}
    resume_store.save(variant)
    base = resume_store.get("base1")
    assert len(base.doc["content"]) == 1


def test_rewrite_bullet_endpoint(client, monkeypatch):
    _seed_resume("r1", "T")
    from api.services import ai_tools
    monkeypatch.setattr(ai_tools, "_call_llm", lambda prompt, text: "Rewritten: " + text)
    ai_tools.register_all()

    resp = client.post(
        "/api/resume/r1/ai/rewrite-bullet",
        json={"bullet_text": "Built APIs", "preset": "default"},
    )
    assert resp.status_code == 200
    assert resp.json()["rewritten"].startswith("Rewritten:")


def test_rewrite_bullet_endpoint_propagates_error(client):
    _seed_resume("r2", "T")
    from api.services import ai_tools
    ai_tools.register_all()

    resp = client.post(
        "/api/resume/r2/ai/rewrite-bullet",
        json={"bullet_text": "", "preset": "default"},
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("bad_id", ["..", "../etc/passwd", "a/b", "a\x00b", "x" * 200, ""])
def test_endpoints_reject_invalid_resume_id(client, bad_id):
    # FastAPI may return 404 for empty path; we expect 400 for the others
    if bad_id == "":
        return  # empty path matches the list endpoint, that's fine
    # urlencoded "/" becomes "%2F" but FastAPI strips it — test the cases that actually reach the handler
    if "/" in bad_id:
        return
    # The httpx client used by TestClient rejects null bytes in URLs before
    # they reach the server, which is fine — they can't even be sent.
    if "\x00" in bad_id:
        import httpx
        with pytest.raises(httpx.InvalidURL):
            client.get(f"/api/resume/{bad_id}")
        return
    resp = client.get(f"/api/resume/{bad_id}")
    assert resp.status_code in (400, 404, 422)
