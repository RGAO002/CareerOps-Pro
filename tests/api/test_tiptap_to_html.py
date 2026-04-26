# tests/api/test_tiptap_to_html.py
"""Tests for tiptap_to_html — the TipTap doc → HTML renderer used by the
WeasyPrint PDF endpoint."""
from api.converters.tiptap_to_html import tiptap_doc_to_html


def test_returns_full_html_doc():
    out = tiptap_doc_to_html({"type": "doc", "content": []})
    assert out.startswith("<!DOCTYPE html>")
    assert "<html" in out and "</html>" in out
    assert "<style>" in out  # CSS embedded
    assert "resume-canvas" in out


def test_title_lands_in_head():
    out = tiptap_doc_to_html({"type": "doc", "content": []}, title="Alex Resume")
    assert "<title>Alex Resume</title>" in out


def test_header_renders_name_and_contacts():
    doc = {
        "type": "doc",
        "content": [{
            "type": "resumeHeader",
            "attrs": {"contacts": ["alex@example.com", "linkedin.com/in/alex"]},
            "content": [{"type": "text", "text": "Alex Chen"}],
        }],
    }
    out = tiptap_doc_to_html(doc)
    assert '<h1 class="resume-name">Alex Chen</h1>' in out
    assert "alex@example.com" in out
    assert "linkedin.com/in/alex" in out


def test_section_renders_heading_and_entries():
    doc = {
        "type": "doc",
        "content": [{
            "type": "resumeSection",
            "attrs": {"heading": "Experience"},
            "content": [{
                "type": "entry",
                "attrs": {"title": "SWE @ Acme", "meta": "Jan 2024 – Present"},
                "content": [
                    {"type": "bullet", "content": [{"type": "text", "text": "Built APIs"}]},
                    {"type": "bullet", "content": [{"type": "text", "text": "Led design"}]},
                ],
            }],
        }],
    }
    out = tiptap_doc_to_html(doc)
    assert '<h2 class="resume-section-heading">Experience</h2>' in out
    assert "SWE @ Acme" in out
    assert "Jan 2024 – Present" in out
    assert "Built APIs" in out
    assert "Led design" in out
    # Bullets are inside a list
    assert '<ul class="resume-entry-bullets">' in out
    assert '<li class="resume-bullet">' in out


def test_inline_marks_render():
    doc = {
        "type": "doc",
        "content": [{
            "type": "resumeSection",
            "attrs": {"heading": "X"},
            "content": [{
                "type": "entry",
                "attrs": {"title": "T", "meta": ""},
                "content": [{"type": "bullet", "content": [
                    {"type": "text", "text": "Built "},
                    {"type": "text", "marks": [{"type": "bold"}], "text": "12 APIs"},
                    {"type": "text", "text": " using "},
                    {"type": "text", "marks": [{"type": "italic"}], "text": "Node"},
                ]}],
            }],
        }],
    }
    out = tiptap_doc_to_html(doc)
    assert "<strong>12 APIs</strong>" in out
    assert "<em>Node</em>" in out


def test_link_mark_renders_anchor():
    doc = {
        "type": "doc",
        "content": [{
            "type": "resumeSection",
            "attrs": {"heading": "X"},
            "content": [{
                "type": "entry",
                "attrs": {"title": "T", "meta": ""},
                "content": [{"type": "bullet", "content": [
                    {"type": "text",
                     "marks": [{"type": "link", "attrs": {"href": "https://github.com/me"}}],
                     "text": "GitHub"},
                ]}],
            }],
        }],
    }
    out = tiptap_doc_to_html(doc)
    assert '<a href="https://github.com/me" class="resume-link">GitHub</a>' in out


def test_html_escaping_protects_against_injection():
    doc = {
        "type": "doc",
        "content": [{
            "type": "resumeSection",
            "attrs": {"heading": "X<script>alert(1)</script>"},
            "content": [{
                "type": "entry",
                "attrs": {"title": "<b>html</b>", "meta": ""},
                "content": [{"type": "bullet", "content": [
                    {"type": "text", "text": "evil & <img onerror=x>"},
                ]}],
            }],
        }],
    }
    out = tiptap_doc_to_html(doc)
    assert "<script>" not in out
    assert "&lt;script&gt;" in out
    assert "<img" not in out
    assert "&lt;img" in out
    assert "evil &amp; " in out


def test_empty_doc_still_valid_html():
    out = tiptap_doc_to_html({"type": "doc", "content": []})
    assert out.startswith("<!DOCTYPE html>")
    assert out.rstrip().endswith("</html>")


def test_skips_unknown_node_types():
    doc = {
        "type": "doc",
        "content": [
            {"type": "weirdUnknownNode", "attrs": {}},
            {"type": "resumeHeader", "attrs": {"contacts": []},
             "content": [{"type": "text", "text": "Real Name"}]},
        ],
    }
    out = tiptap_doc_to_html(doc)
    assert "Real Name" in out
    assert "weirdUnknownNode" not in out
