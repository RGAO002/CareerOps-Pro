"""
HTML Renderer - Convert resume data to HTML
"""

import re
from html import escape


def _guess_contact_type(text: str) -> str:
    t = (text or "").strip().lower()
    if "@" in t and ("mailto:" in t or re.search(r"\b[\w.+-]+@[\w.-]+\.\w+\b", t)):
        return "email"
    if t.startswith("http://") or t.startswith("https://"):
        return "link"
    if "linkedin.com" in t:
        return "linkedin"
    if "github.com" in t:
        return "github"
    if re.search(r"\d{3}.*\d{3}.*\d{4}", t) or re.search(r"\+\d", t):
        return "phone"
    return "other"


def _wrap_contact_item(raw_item: str) -> str:
    item = (raw_item or "").strip()
    if not item:
        return ""
    # If already looks like HTML (<a ...>), keep it as-is.
    if "<a " in item or item.startswith("<a"):
        return item

    email_match = re.search(r"([\w.+-]+@[\w.-]+\.\w+)", item)
    if email_match:
        email = email_match.group(1)
        return f'<a href="mailto:{escape(email)}">{escape(email)}</a>'

    if item.startswith("http://") or item.startswith("https://"):
        safe = escape(item)
        return f'<a href="{safe}" target="_blank" rel="noopener noreferrer">{safe}</a>'

    return escape(item)


def _icon_svg(kind: str) -> str:
    # Minimal inline SVGs (adapted from the provided template).
    # Keep them small and monochrome for WeasyPrint compatibility.
    if kind == "email":
        return """
<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
</svg>
""".strip()
    if kind == "phone":
        return """
<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
</svg>
""".strip()
    if kind in {"link", "linkedin", "github"}:
        return """
<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
</svg>
""".strip()
    return """
<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M12 6v6l4 2"></path>
</svg>
""".strip()


def _render_bullets_as_paragraphs(bullets, changed: bool) -> str:
    if not bullets:
        return ""
    cls = "bullet-point diff-highlight-block" if changed else "bullet-point"
    parts = []
    for b in bullets:
        if not b:
            continue
        parts.append(f'<p class="{cls}">{b}</p>')
    return "\n".join(parts)


def render_section_html(section_name, section_data, diff, show_diff):
    """Render a generic section to HTML."""
    if not section_data:
        return ""
    
    section_changed = diff.get(section_name, []) if show_diff else []
    title = section_name.replace("_", " ").title()
    
    content = ""
    for idx, item in enumerate(section_data):
        is_changed = idx in section_changed if isinstance(section_changed, list) else section_changed
        block_class = "entry-block diff-highlight-block" if is_changed else "entry-block"
        
        if isinstance(item, dict):
            main_title = item.get("company") or item.get("school") or item.get("name") or item.get("title") or ""
            subtitle = item.get("role") or item.get("degree") or item.get("organization") or item.get("issuer") or ""
            date = item.get("date") or item.get("year") or ""
            tech = item.get("tech") or ""
            bullets = item.get("bullets") or item.get("details") or []
            description = item.get("description") or ""

            header_left = escape(main_title) if main_title else ""
            header_right = escape(date) if date else ""
            subtitle_line = escape(subtitle) if subtitle else ""
            tech_line = escape(tech) if tech else ""

            bullets_html = _render_bullets_as_paragraphs(bullets, is_changed)
            desc_html = f'<p class="desc">{description}</p>' if description else ""
            meta_html = ""
            if tech_line:
                meta_html = f'<p class="meta">{tech_line}</p>'

            content += f"""
            <div class="{block_class}">
              <div class="entry-header">
                <h3 class="entry-title">{header_left}</h3>
                <div class="entry-date">{header_right}</div>
              </div>
              {f'<p class="entry-subtitle">{subtitle_line}</p>' if subtitle_line else ''}
              {meta_html}
              {desc_html}
              <div class="entry-bullets">{bullets_html}</div>
            </div>
            """
        elif isinstance(item, str):
            item_class = "diff-highlight-block" if is_changed else ""
            content += f'<div class="entry-block {item_class}" style="margin-bottom:10px;">{item}</div>'
    
    return f'<section class="main-section"><h2>{escape(title)}</h2>{content}</section>'


def render_resume_html(data, diff=None, show_diff=False):
    """Render full resume to HTML with optional diff highlighting."""
    if diff is None:
        diff = {}
    
    name = data.get("name", "YOUR NAME")
    role = data.get("role", "Job Title")
    
    if show_diff:
        if diff.get("name"):
            name = f'<span class="diff-highlight">{name}</span>'
        if diff.get("role"):
            role = f'<span class="diff-highlight">{role}</span>'
    
    # Sidebar: Contact
    contact_items = data.get("contact", []) or []
    contact_changed = diff.get("contact", []) if show_diff else []
    contact_html = ""
    for i, raw in enumerate(contact_items):
        if raw is None:
            continue
        changed = i in contact_changed
        kind = _guess_contact_type(str(raw))
        wrapped = _wrap_contact_item(str(raw))
        row_cls = "contact-row diff-highlight-block" if changed else "contact-row"
        contact_html += f"""
          <div class="{row_cls}">
            {_icon_svg(kind)}
            <div class="contact-text">{wrapped}</div>
          </div>
        """
    
    # Sidebar: Skills
    skills_changed = diff.get("skills", []) if show_diff else []
    skills_html = ""
    for category, items in data.get("skills", {}).items():
        cat_safe = escape(str(category))
        val = items if isinstance(items, str) else ", ".join([str(x) for x in (items or [])])
        val_safe = escape(val)
        if category in skills_changed:
            skills_html += f'<div class="skill-group diff-highlight-block"><div class="skill-label">{cat_safe}</div><div class="skill-text">{val_safe}</div></div>'
        else:
            skills_html += f'<div class="skill-group"><div class="skill-label">{cat_safe}</div><div class="skill-text">{val_safe}</div></div>'
    
    # Main content sections
    default_order = ["summary", "experience", "projects", "education"]
    section_order = data.get("section_order", default_order)
    
    sidebar_keys = {"name", "role", "contact", "skills", "section_order"}
    all_main_keys = [k for k in data.keys() if k not in sidebar_keys]
    
    ordered_sections = []
    for s in section_order:
        if s in all_main_keys:
            ordered_sections.append(s)
    for s in all_main_keys:
        if s not in ordered_sections:
            ordered_sections.append(s)

    def _section_title(name_key: str) -> str:
        mapping = {
            "summary": "Profile Summary",
            "experience": "Professional Experience",
            "projects": "Selected Projects",
            "education": "Education",
        }
        return mapping.get(name_key, name_key.replace("_", " ").title())

    def _render_section(section_name: str) -> str:
        section_data = data.get(section_name)
        title = _section_title(section_name)
        if isinstance(section_data, str) and section_data:
            section_content = section_data
            if show_diff and diff.get(section_name):
                section_content = f'<span class="diff-highlight">{section_content}</span>'
            return f'<section class="main-section"><h2>{escape(title)}</h2><p class="summary">{section_content}</p></section>'
        if isinstance(section_data, list) and section_data:
            # Override the title from render_section_html's generic one
            section_changed = diff.get(section_name, []) if show_diff else []
            html = render_section_html(section_name, section_data, diff, show_diff)
            # render_section_html already wraps with <section><h2>Generic</h2>...</section>
            # Replace header with mapped title (safe + deterministic).
            return re.sub(r"<h2>.*?</h2>", f"<h2>{escape(title)}</h2>", html, count=1, flags=re.DOTALL)
        return ""

    # Page split like the provided template:
    # Page 1: Summary + Experience (if present)
    # Page 2: Remaining sections
    page1_keys = [k for k in ordered_sections if k in {"summary", "experience"}]
    page2_keys = [k for k in ordered_sections if k not in {"summary", "experience"}]

    main_content_page1 = "".join([_render_section(k) for k in page1_keys])
    main_content_page2 = "".join([_render_section(k) for k in page2_keys])
    
    # Diff highlight styles
    diff_styles = ""
    if show_diff and diff:
        diff_styles = """
            .diff-highlight { background: linear-gradient(120deg, #fef08a 0%, #fde047 100%); padding: 2px 4px; border-radius: 3px; animation: pulse-highlight 2s ease-in-out infinite; }
            .diff-highlight-block { background: linear-gradient(120deg, #fefce8 0%, #fef9c3 100%); border-left: 4px solid #eab308 !important; padding-left: 10px; animation: pulse-highlight 2s ease-in-out infinite; }
            @keyframes pulse-highlight { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        """
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            /* Letter-size layout (matches provided template) */
            @page {{ size: Letter; margin: 0; }}

            /* Link style (matches provided template) */
            a {{
              color: #2563eb;
              text-decoration: underline;
              text-decoration-color: rgba(37, 99, 235, 0.4);
              text-underline-offset: 3px;
            }}
            a:hover {{ color: #1d4ed8; text-decoration: underline; }}

            body {{
              font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              color: #111827;
            }}

            /* Frame */
            .page-container {{
              width: 8.5in;
              margin: 0;
              display: flex;
              flex-direction: column;
            }}

            .resume-page {{
              min-height: 11in;
              display: flex;
              width: 100%;
            }}

            /* Columns */
            .sidebar {{
              width: 36%;
              background-color: #f9fafb;
              padding: 2rem;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
            }}
            .main-content {{
              width: 64%;
              padding: 2rem;
              box-sizing: border-box;
            }}

            /* Typography */
            h1 {{
              font-size: 28pt;
              font-weight: 700;
              color: #1f2937;
              margin: 0;
              line-height: 1.15;
              word-wrap: break-word;
            }}

            .headline-role {{
              font-size: 12pt;
              color: #4b5563;
              margin-top: 0.25rem;
            }}

            h2 {{
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 6px;
              margin-bottom: 12px;
              margin-top: 16px;
              color: #111827;
              font-weight: 600;
              font-size: 14pt;
            }}
            h3 {{ font-size: 12pt; margin: 0; }}

            .main-section {{ margin-top: 0.25rem; }}
            .summary {{ color: #374151; font-size: 10pt; line-height: 1.55; }}

            /* Sidebar blocks */
            .sidebar-section-title {{
              font-size: 12pt;
              font-weight: 600;
              color: #1f2937;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 6px;
              margin: 1.5rem 0 0.75rem 0;
            }}

            .contact-row {{
              display: flex;
              align-items: center;
              gap: 10px;
              color: #374151;
              font-size: 9.5pt;
              margin: 0.55rem 0;
              word-break: break-word;
            }}
            .contact-text {{ line-height: 1.35; }}
            .icon {{
              width: 14px;
              height: 14px;
              color: #6b7280;
              flex: 0 0 auto;
            }}

            .skill-group {{ margin: 0.65rem 0; }}
            .skill-label {{ font-weight: 600; color: #374151; font-size: 9.5pt; margin-bottom: 2px; }}
            .skill-text {{ color: #4b5563; font-size: 9.5pt; line-height: 1.35; }}

            /* Entries */
            .entry-block {{ margin-bottom: 0.9rem; page-break-inside: avoid; }}
            .entry-header {{ display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }}
            .entry-title {{ font-size: 11.5pt; font-weight: 600; color: #111827; }}
            .entry-date {{ font-size: 9.5pt; color: #6b7280; }}
            .entry-subtitle {{ margin: 0.15rem 0 0.25rem 0; font-size: 10pt; color: #4b5563; font-weight: 500; }}
            .meta {{ margin: 0.1rem 0 0.25rem 0; font-size: 9.5pt; color: #6b7280; }}
            .desc {{ margin: 0.25rem 0; font-size: 10pt; color: #374151; }}

            /* Bullets */
            .bullet-point {{
              position: relative;
              padding-left: 18px;
              margin: 0.2rem 0 0.35rem 0;
              line-height: 1.45;
              color: #374151;
              font-size: 10pt;
            }}
            .bullet-point::before {{
              content: "■";
              position: absolute;
              left: 0;
              top: 0px;
              color: #6b7280;
              font-size: 8pt;
            }}

            {diff_styles}
        </style>
    </head>
    <body>
        <div class="page-container">
          <div class="resume-page">
            <aside class="sidebar">
              <section>
                <h1>{name}</h1>
                <p class="headline-role">{role}</p>
                <div class="sidebar-section-title">Contact</div>
                <div>{contact_html}</div>
              </section>
              <section>
                <div class="sidebar-section-title">Technical Skills</div>
                <div>{skills_html}</div>
              </section>
            </aside>
            <main class="main-content">
              {main_content_page1}
            </main>
          </div>

          <div class="resume-page">
            <aside class="sidebar"></aside>
            <main class="main-content">
              {main_content_page2}
            </main>
          </div>
        </div>
    </body>
    </html>
    """
