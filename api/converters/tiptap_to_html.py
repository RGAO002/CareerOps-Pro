# api/converters/tiptap_to_html.py
"""Convert a TipTap resume doc → standalone HTML for WeasyPrint.

Single-column layout matching the editor canvas's resume-editor.css. Output
is one self-contained HTML document with embedded CSS, ready to feed to
weasyprint.HTML(string=...).write_pdf().

Why we don't reuse templates/resume_template.html: that template assumes
the legacy two-column sidebar schema (name/skills/contact in left rail,
experience/projects/education in right). Our TipTap schema is single-column
(header → sections → entries → bullets), so we need a matching renderer.
Phase 1.5 may revive a two-column variant; for v1 the simple template
matches what the user sees in the editor.
"""
from html import escape
from typing import Any


# CSS mirrors resume-editor.css, with the EDITOR-ONLY chrome stripped
# (no .resume-canvas shadow, no z-index, no NodeView affordances). Embedded
# inline so the PDF is a fully self-contained HTML doc.
_CSS = """
@page { size: Letter; margin: 0; }

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: white;
  color: #374151;
  font-size: 14px;
  line-height: 1.5;
}

.resume-canvas {
  width: 8.5in;
  padding: 0.75in 0.9in;
  background: white;
}

.resume-canvas a, .resume-link {
  color: #2563eb;
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.4);
  text-underline-offset: 3px;
}

.resume-header { margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb; }
.resume-name { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; color: #111827; margin-bottom: 0.5rem; }
.resume-contact-line { font-size: 12.5px; color: #4b5563; line-height: 1.6; }

.resume-section { margin-top: 1.1rem; break-inside: auto; page-break-inside: auto; }
.resume-section-heading {
  font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
  color: #6b7280; margin-bottom: 0.5rem; padding-bottom: 0.25rem;
  border-bottom: 1px solid #e5e7eb;
  break-after: avoid; page-break-after: avoid;
}

.resume-entry { margin-bottom: 0.85rem; break-inside: avoid; page-break-inside: avoid; }
.resume-entry-title { font-weight: 600; color: #111827; font-size: 14px; line-height: 1.3; }
.resume-entry-meta { color: #6b7280; font-size: 12px; line-height: 1.3; margin-bottom: 0.3rem; }

.resume-entry-bullets { list-style: none; padding-left: 0; margin: 0; }
.resume-bullet {
  position: relative; padding-left: 1rem; margin-bottom: 0.25rem;
  break-inside: avoid; page-break-inside: avoid;
}
.resume-bullet::before {
  content: ""; position: absolute; left: 0.35rem; top: 0.65em;
  width: 4px; height: 4px; border-radius: 50%; background: #9ca3af;
}

.resume-canvas strong { color: #111827; font-weight: 600; }
.resume-canvas em { font-style: italic; }
.resume-canvas u { text-decoration: underline; text-underline-offset: 2px; }
"""


def tiptap_doc_to_html(doc: dict[str, Any], *, title: str = "Resume") -> str:
    """Render a TipTap resume doc as a complete HTML document for WeasyPrint."""
    body_parts: list[str] = []
    for node in doc.get("content", []) or []:
        if not isinstance(node, dict):
            continue
        ntype = node.get("type")
        if ntype == "resumeHeader":
            body_parts.append(_render_header(node))
        elif ntype == "resumeSection":
            body_parts.append(_render_section(node))

    body_html = "\n".join(body_parts)
    return (
        "<!DOCTYPE html>\n"
        "<html><head><meta charset=\"UTF-8\">"
        f"<title>{escape(title)}</title>"
        f"<style>{_CSS}</style>"
        "</head><body>"
        f"<div class=\"resume-canvas\">{body_html}</div>"
        "</body></html>"
    )


def _render_header(node: dict) -> str:
    name = ""
    for child in node.get("content", []) or []:
        if isinstance(child, dict) and child.get("type") == "text":
            name += child.get("text", "")
    contacts = (node.get("attrs") or {}).get("contacts") or []
    parts = ['<div class="resume-header">']
    if name.strip():
        parts.append(f'<h1 class="resume-name">{escape(name)}</h1>')
    for c in contacts:
        if c:
            parts.append(f'<div class="resume-contact-line">{escape(str(c))}</div>')
    parts.append("</div>")
    return "".join(parts)


def _render_section(node: dict) -> str:
    heading = (node.get("attrs") or {}).get("heading") or "Section"
    parts = [
        '<section class="resume-section">',
        f'<h2 class="resume-section-heading">{escape(heading)}</h2>',
        '<div class="resume-section-body">',
    ]
    for entry in node.get("content", []) or []:
        if isinstance(entry, dict) and entry.get("type") == "entry":
            parts.append(_render_entry(entry))
    parts.append("</div></section>")
    return "".join(parts)


def _render_entry(node: dict) -> str:
    attrs = node.get("attrs") or {}
    title = attrs.get("title") or ""
    meta = attrs.get("meta") or ""
    parts = ['<div class="resume-entry">']
    if title:
        parts.append(f'<div class="resume-entry-title">{escape(title)}</div>')
    if meta:
        parts.append(f'<div class="resume-entry-meta">{escape(meta)}</div>')
    parts.append('<ul class="resume-entry-bullets">')
    for bullet in node.get("content", []) or []:
        if isinstance(bullet, dict) and bullet.get("type") == "bullet":
            parts.append(f'<li class="resume-bullet">{_render_inline(bullet.get("content") or [])}</li>')
    parts.append("</ul></div>")
    return "".join(parts)


def _render_inline(content: list) -> str:
    out: list[str] = []
    for n in content:
        if not isinstance(n, dict):
            continue
        if n.get("type") == "text":
            text = escape(n.get("text", ""))
            for mark in n.get("marks", []) or []:
                mtype = mark.get("type")
                if mtype == "bold":
                    text = f"<strong>{text}</strong>"
                elif mtype == "italic":
                    text = f"<em>{text}</em>"
                elif mtype == "underline":
                    text = f"<u>{text}</u>"
                elif mtype == "link":
                    href = (mark.get("attrs") or {}).get("href", "")
                    text = f'<a href="{escape(href)}" class="resume-link">{text}</a>'
            out.append(text)
    return "".join(out)
