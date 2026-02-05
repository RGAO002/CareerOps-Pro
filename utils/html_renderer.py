"""
HTML Renderer - Convert resume data to HTML using fixed template
Supports contenteditable for inline editing
"""
import os
import re
from html import escape


def _format_bullet_text(text: str) -> str:
    """Format bullet text, preserving simple markdown formatting."""
    if not text:
        return ""
    
    # First escape HTML
    safe_text = escape(str(text))
    
    # Then convert markdown-like patterns to HTML
    # **bold** or __bold__
    safe_text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', safe_text)
    safe_text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', safe_text)
    
    # *italic* or _italic_ (but not inside words)
    safe_text = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'<em>\1</em>', safe_text)
    safe_text = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'<em>\1</em>', safe_text)
    
    return safe_text


# SVG icons for contact items
ICON_EMAIL = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
</svg>'''

ICON_PHONE = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
</svg>'''

ICON_GITHUB = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
</svg>'''

ICON_PORTFOLIO = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
</svg>'''

ICON_BLOG = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path>
</svg>'''

ICON_LINKEDIN = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2V9zm2-5a2 2 0 110 4 2 2 0 010-4z"></path>
</svg>'''

ICON_LINK = '''<svg class="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
</svg>'''


def _get_contact_icon(text: str) -> str:
    """Return appropriate icon based on contact type."""
    t = (text or "").lower()
    if "@" in t:
        return ICON_EMAIL
    if re.search(r"\d{3}.*\d{3}.*\d{4}", t) or "phone" in t:
        return ICON_PHONE
    if "github" in t:
        return ICON_GITHUB
    if "linkedin" in t:
        return ICON_LINKEDIN
    if "portfolio" in t or "vercel" in t or "netlify" in t:
        return ICON_PORTFOLIO
    if "blog" in t:
        return ICON_BLOG
    return ICON_LINK


def _format_contact_text(text: str) -> str:
    """Format contact text with appropriate links."""
    text = (text or "").strip()
    if not text:
        return ""
    
    # Already HTML
    if "<a " in text:
        return text
    
    # Markdown-style link: [text](url)
    md_match = re.match(r'\[(.+?)\]\((.+?)\)', text)
    if md_match:
        display_text = md_match.group(1)
        url = md_match.group(2)
        return f'<a href="{escape(url)}" target="_blank">{escape(display_text)}</a>'
    
    # Handle "text (url)" or "text (mailto:...)" format
    paren_match = re.match(r'^(.+?)\s*\(((?:https?://|mailto:)[^)]+)\)$', text)
    if paren_match:
        display_text = paren_match.group(1).strip()
        url = paren_match.group(2).strip()
        if url.startswith("mailto:"):
            return f'<a href="{escape(url)}">{escape(display_text)}</a>'
        return f'<a href="{escape(url)}" target="_blank">{escape(display_text)}</a>'
    
    # Email - just show email, not "mailto:..."
    email_match = re.search(r"([\w.+-]+@[\w.-]+\.\w+)", text)
    if email_match:
        email = email_match.group(1)
        return f'<a href="mailto:{escape(email)}">{escape(email)}</a>'
    
    # Full URL - shorten display
    if text.startswith("http://") or text.startswith("https://"):
        display = text.replace("https://", "").replace("http://", "").rstrip("/")
        return f'<a href="{escape(text)}" target="_blank">{escape(display)}</a>'
    
    # Domain-like patterns (github.com/xxx, linkedin.com/in/xxx, etc.)
    domain_patterns = [
        (r"github\.com", "https://"),
        (r"linkedin\.com", "https://"),
        (r"\.com", "https://"),
        (r"\.io", "https://"),
        (r"\.dev", "https://"),
        (r"\.org", "https://"),
        (r"\.net", "https://"),
    ]
    
    for pattern, prefix in domain_patterns:
        if re.search(pattern, text.lower()):
            url = text if text.startswith("http") else f"{prefix}{text}"
            display = text.replace("https://", "").replace("http://", "").rstrip("/")
            return f'<a href="{escape(url)}" target="_blank">{escape(display)}</a>'
    
    return escape(text)


def render_contact_html(contact_items: list, editable: bool = True, diff_indices: list = None) -> str:
    """Render contact section with optional diff highlighting."""
    if not contact_items:
        return ""
    
    diff_indices = diff_indices or []
    html_parts = []
    for i, item in enumerate(contact_items):
        if not item:
            continue
        icon = _get_contact_icon(str(item))
        text = _format_contact_text(str(item))
        edit_attr = f'contenteditable="true" data-field="contact" data-index="{i}"' if editable else ""
        
        # Apply diff highlight
        highlight_class = "diff-highlight" if i in diff_indices else ""
        
        html_parts.append(f'''
            <div class="contact-row {highlight_class}">
                {icon}
                <span {edit_attr}>{text}</span>
            </div>
        ''')
    return "\n".join(html_parts)


def render_skills_html(skills: dict, editable: bool = True, diff_keys: list = None) -> str:
    """Render skills section with optional diff highlighting."""
    if not skills:
        return ""
    
    diff_keys = diff_keys or []
    html_parts = []
    for category, items in skills.items():
        cat_safe = escape(str(category))
        # Handle both string and list formats
        if isinstance(items, list):
            val = ", ".join([str(x) for x in items])
        else:
            val = str(items)
        val_safe = escape(val)
        
        cat_edit = f'contenteditable="true" data-field="skill_cat" data-key="{cat_safe}"' if editable else ""
        val_edit = f'contenteditable="true" data-field="skill_val" data-key="{cat_safe}"' if editable else ""
        
        # Apply diff highlight
        highlight_class = "diff-highlight" if category in diff_keys else ""
        
        html_parts.append(f'''
            <div class="skill-group {highlight_class}">
                <p class="skill-label" {cat_edit}>{cat_safe}:</p>
                <p class="skill-text" {val_edit}>{val_safe}</p>
            </div>
        ''')
    return "\n".join(html_parts)


def render_experience_html(experience: list, editable: bool = True, diff_info: dict = None) -> str:
    """Render experience section with optional diff highlighting."""
    if not experience:
        return ""
    
    diff_info = diff_info or {}
    html_parts = []
    for i, exp in enumerate(experience):
        if not isinstance(exp, dict):
            continue
        
        company = exp.get("company") or exp.get("name") or ""
        role = exp.get("role") or exp.get("title") or ""
        date = exp.get("date") or ""
        bullets = exp.get("bullets") or []
        
        # Get diff info for this experience
        item_diff = diff_info.get(i, {})
        is_new = item_diff == "added"
        
        edit_attr = lambda field: f'contenteditable="true" data-field="exp_{field}" data-index="{i}"' if editable else ""
        
        # Determine highlights
        company_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("company")) else ""
        role_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("role")) else ""
        date_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("date")) else ""
        bullet_changes = item_diff.get("bullets", []) if isinstance(item_diff, dict) else (list(range(len(bullets))) if is_new else [])
        
        bullets_html = ""
        for j, bullet in enumerate(bullets):
            b_edit = f'contenteditable="true" data-field="exp_bullet" data-index="{i}" data-bullet="{j}"' if editable else ""
            formatted_bullet = _format_bullet_text(bullet)
            bullet_class = "diff-highlight" if j in bullet_changes else ""
            bullets_html += f'<p class="bullet-point text-gray-700 text-sm {bullet_class}" {b_edit}>{formatted_bullet}</p>\n'
        
        entry_class = "diff-entry-new" if is_new else ""
        
        html_parts.append(f'''
            <div class="exp-entry {entry_class}">
                <div class="exp-header">
                    <h3 class="exp-title {company_class}" {edit_attr("company")}>{escape(company)}</h3>
                    <p class="exp-date {date_class}" {edit_attr("date")}>{escape(date)}</p>
                </div>
                <p class="exp-subtitle {role_class}" {edit_attr("role")}>{escape(role)}</p>
                <div class="exp-bullets space-y-2">
                    {bullets_html}
                </div>
            </div>
        ''')
    return "\n".join(html_parts)


def render_projects_html(projects: list, editable: bool = True, diff_info: dict = None) -> str:
    """Render projects section with optional diff highlighting."""
    if not projects:
        return ""
    
    diff_info = diff_info or {}
    html_parts = []
    for i, proj in enumerate(projects):
        if not isinstance(proj, dict):
            continue
        
        name = proj.get("name") or proj.get("title") or ""
        tech = proj.get("tech") or ""
        link = proj.get("link") or ""
        bullets = proj.get("bullets") or []
        
        # Get diff info for this project
        item_diff = diff_info.get(i, {})
        is_new = item_diff == "added"
        
        edit_attr = lambda field: f'contenteditable="true" data-field="proj_{field}" data-index="{i}"' if editable else ""
        
        # Determine highlights
        name_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("name")) else ""
        tech_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("tech")) else ""
        bullet_changes = item_diff.get("bullets", []) if isinstance(item_diff, dict) else (list(range(len(bullets))) if is_new else [])
        
        # Build title with optional link
        title_text = escape(name)
        if link:
            link_text = "GitHub Repo" if "github" in link.lower() else "Live Demo" if "demo" in link.lower() or "netlify" in link.lower() else link
            title_text += f' - <a href="{escape(link)}" target="_blank">{escape(link_text)}</a>'
        
        # Tech subtitle
        tech_html = f'<p class="text-gray-500 text-sm {tech_class}">{escape(tech)}</p>' if tech else ""
        
        bullets_html = ""
        for j, bullet in enumerate(bullets):
            b_edit = f'contenteditable="true" data-field="proj_bullet" data-index="{i}" data-bullet="{j}"' if editable else ""
            formatted_bullet = _format_bullet_text(bullet)
            bullet_class = "diff-highlight" if j in bullet_changes else ""
            bullets_html += f'<p class="bullet-point text-gray-700 text-sm {bullet_class}" {b_edit}>{formatted_bullet}</p>\n'
        
        entry_class = "diff-entry-new" if is_new else ""
        
        html_parts.append(f'''
            <div class="project-entry {entry_class}">
                <h3 class="project-title {name_class}" {edit_attr("name")}>{title_text}</h3>
                {tech_html}
                <div class="project-bullets mt-2">
                    {bullets_html}
                </div>
            </div>
        ''')
    return "\n".join(html_parts)


def render_education_html(education: list, editable: bool = True, diff_info: dict = None) -> str:
    """Render education section with optional diff highlighting."""
    if not education:
        return ""
    
    diff_info = diff_info or {}
    html_parts = []
    for i, edu in enumerate(education):
        if not isinstance(edu, dict):
            continue
        
        school = edu.get("school") or edu.get("name") or ""
        degree = edu.get("degree") or ""
        date = edu.get("date") or ""
        gpa = edu.get("gpa") or ""
        coursework = edu.get("coursework") or edu.get("courses") or []
        note = edu.get("note") or ""
        
        # Get diff info for this education
        item_diff = diff_info.get(i, {})
        is_new = item_diff == "added"
        
        edit_attr = lambda field: f'contenteditable="true" data-field="edu_{field}" data-index="{i}"' if editable else ""
        
        # Determine highlights
        school_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("school")) else ""
        degree_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("degree")) else ""
        date_class = "diff-highlight" if is_new or (isinstance(item_diff, dict) and item_diff.get("date")) else ""
        
        # Degree line with optional GPA
        degree_text = escape(degree)
        if gpa:
            # Remove "GPA:" prefix if already present to avoid duplication
            gpa_value = str(gpa).strip()
            if gpa_value.lower().startswith("gpa:"):
                gpa_value = gpa_value[4:].strip()
            degree_text += f' | <span class="text-blue-600 font-bold">GPA: {escape(gpa_value)}</span>'
        
        # Coursework
        coursework_html = ""
        if coursework:
            if isinstance(coursework, list):
                items = "".join([f"<li>{escape(c)}</li>" for c in coursework])
                coursework_html = f'''
                    <div class="edu-coursework">
                        <p class="font-semibold">Relevant Coursework:</p>
                        <ul class="list-disc list-inside ml-2">{items}</ul>
                    </div>
                '''
            else:
                coursework_html = f'<div class="edu-coursework"><p>{escape(str(coursework))}</p></div>'
        
        # Note
        note_html = f'<p class="edu-note">{escape(note)}</p>' if note else ""
        
        entry_class = "diff-entry-new" if is_new else ""
        
        html_parts.append(f'''
            <div class="edu-entry {entry_class}">
                <p class="edu-school {school_class}" {edit_attr("school")}>{escape(school)}</p>
                <p class="edu-degree {degree_class}" {edit_attr("degree")}>{degree_text}</p>
                <p class="edu-date {date_class}" {edit_attr("date")}>{escape(date)}</p>
                {coursework_html}
                {note_html}
            </div>
        ''')
    return "\n".join(html_parts)


def render_resume_html(data: dict, diff=None, show_diff: bool = False, editable: bool = True) -> str:
    """
    Render resume data to HTML using the fixed template.
    
    Args:
        data: Resume data dictionary
        diff: Diff info for highlighting changes (optional)
        show_diff: Whether to show diff highlighting
        editable: Whether to enable contenteditable
    
    Returns:
        Complete HTML string
    """
    if diff is None:
        diff = {}
    
    # Extract data
    name = data.get("name", "Your Name")
    role = data.get("role", "Job Title")
    summary = data.get("summary", "")
    contact = data.get("contact", [])
    skills = data.get("skills", {})
    experience = data.get("experience", [])
    projects = data.get("projects", [])
    education = data.get("education", [])
    
    # Extract diff info for each section
    contact_diff = diff.get("contact", []) if show_diff else []
    skills_diff = diff.get("skills", []) if show_diff else []
    experience_diff = diff.get("experience", {}) if show_diff else {}
    projects_diff = diff.get("projects", {}) if show_diff else {}
    education_diff = diff.get("education", {}) if show_diff else {}
    
    # Render sections with diff info
    contact_html = render_contact_html(contact, editable, contact_diff)
    skills_html = render_skills_html(skills, editable, skills_diff)
    experience_html = render_experience_html(experience, editable, experience_diff)
    projects_html = render_projects_html(projects, editable, projects_diff)
    education_html = render_education_html(education, editable, education_diff)
    
    # Editable attributes for main fields
    name_edit = 'contenteditable="true" data-field="name"' if editable else ""
    role_edit = 'contenteditable="true" data-field="role"' if editable else ""
    summary_edit = 'contenteditable="true" data-field="summary"' if editable else ""
    
    # Diff highlighting styles
    diff_styles = ""
    if show_diff and diff:
        diff_styles = """
            .diff-highlight { 
                background: linear-gradient(120deg, #fef08a 0%, #fde047 100%); 
                padding: 2px 4px; 
                border-radius: 3px; 
            }
        """
    
    # Apply diff highlighting
    if show_diff:
        if diff.get("name"):
            name = f'<span class="diff-highlight">{escape(name)}</span>'
        else:
            name = escape(name)
        if diff.get("role"):
            role = f'<span class="diff-highlight">{escape(role)}</span>'
        else:
            role = escape(role)
        if diff.get("summary"):
            summary = f'<span class="diff-highlight">{summary}</span>'
    else:
        name = escape(name)
        role = escape(role)
    
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{name} - Resume</title>
  <style>
    /* ========== Base Reset & Fonts ========== */
    @page {{ size: Letter; margin: 0; }}
    
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    
    body {{
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: white;
      line-height: 1.5;
      color: #374151;
      font-size: 14px;
    }}

    /* ========== Link Styles ========== */
    a {{
      color: #2563eb;
      text-decoration: underline;
      text-decoration-color: rgba(37, 99, 235, 0.4);
      text-underline-offset: 3px;
    }}
    a:hover {{ color: #1d4ed8; }}

    /* ========== Page Container - flowing layout ========== */
    .page-container {{
      width: 8.5in;
      margin: 0 auto;
      background-color: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      position: relative;
    }}

    /* ========== Sidebar background (repeats on each page) ========== */
    .sidebar-bg {{
      position: fixed;
      left: 0;
      top: 0;
      width: 3.06in; /* 36% of 8.5in */
      height: 100%;
      background-color: #f9fafb;
      z-index: -1;
    }}

    /* ========== Sidebar content (first page only) ========== */
    .sidebar {{
      position: absolute;
      left: 0;
      top: 0;
      width: 3.06in;
      padding: 2rem;
    }}

    /* ========== Main Content (flowing) ========== */
    .main-content {{
      margin-left: 3.06in;
      padding: 2rem;
      background-color: white;
    }}
    
    /* ========== Section spacing ========== */
    .main-content section {{
      margin-bottom: 1.5rem;
    }}
    
    /* ========== Avoid breaking inside entries ========== */
    .exp-entry, .project-entry, .edu-entry {{
      break-inside: avoid;
      page-break-inside: avoid;
    }}

    /* ========== Typography ========== */
    .text-4xl {{ font-size: 2.25rem; line-height: 2.5rem; }}
    .text-xl {{ font-size: 1.25rem; line-height: 1.75rem; }}
    .text-lg {{ font-size: 1.125rem; line-height: 1.75rem; }}
    .text-sm {{ font-size: 0.875rem; line-height: 1.25rem; }}
    .text-xs {{ font-size: 0.75rem; line-height: 1rem; }}

    .font-bold {{ font-weight: 700; }}
    .font-semibold {{ font-weight: 600; }}
    .font-medium {{ font-weight: 500; }}

    .text-gray-800 {{ color: #1f2937; }}
    .text-gray-700 {{ color: #374151; }}
    .text-gray-600 {{ color: #4b5563; }}
    .text-gray-500 {{ color: #6b7280; }}
    .text-blue-600 {{ color: #2563eb; }}

    .uppercase {{ text-transform: uppercase; }}
    .italic {{ font-style: italic; }}
    .leading-relaxed {{ line-height: 1.625; }}

    /* ========== Spacing ========== */
    .mt-0 {{ margin-top: 0; }}
    .mt-1 {{ margin-top: 0.25rem; }}
    .mt-2 {{ margin-top: 0.5rem; }}
    .mt-4 {{ margin-top: 1rem; }}
    .mt-6 {{ margin-top: 1.5rem; }}
    .mt-8 {{ margin-top: 2rem; }}
    .ml-2 {{ margin-left: 0.5rem; }}

    .space-y-2 > * + * {{ margin-top: 0.5rem; }}
    .space-y-4 > * + * {{ margin-top: 1rem; }}
    .space-y-6 > * + * {{ margin-top: 1.5rem; }}

    /* ========== Icons ========== */
    .icon-svg {{
      width: 1rem;
      height: 1rem;
      margin-right: 0.75rem;
      color: #6b7280;
      flex-shrink: 0;
    }}

    /* ========== Lists ========== */
    .list-disc {{ list-style-type: disc; }}
    .list-inside {{ list-style-position: inside; }}

    /* ========== Section Headers ========== */
    h2 {{
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 12px;
      margin-top: 16px;
      color: #111827;
      font-weight: 600;
      font-size: 1.25rem;
    }}
    h2.mt-0 {{ margin-top: 0; }}

    h3 {{ font-size: 1.1rem; }}
    .sidebar-title {{
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0.5rem;
    }}

    /* ========== Bullet Points ========== */
    .bullet-point {{
      position: relative;
      padding-left: 18px;
      margin-bottom: 8px;
      line-height: 1.5;
    }}
    .bullet-point::before {{
      content: "■";
      position: absolute;
      left: 0;
      top: 0;
      color: #6b7280;
      font-size: 0.7rem;
    }}

    /* ========== Contact Row ========== */
    .contact-row {{
      display: flex;
      align-items: center;
      color: #374151;
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
    }}

    /* ========== Skill Group ========== */
    .skill-group {{ margin-bottom: 1rem; }}
    .skill-label {{ font-weight: 600; color: #374151; font-size: 0.875rem; }}
    .skill-text {{ color: #4b5563; font-size: 0.875rem; }}

    /* ========== Experience Entry ========== */
    .exp-entry {{ margin-bottom: 1.5rem; }}
    .exp-header {{ display: flex; justify-content: space-between; align-items: baseline; }}
    .exp-title {{ font-size: 1.125rem; font-weight: 600; color: #1f2937; margin: 0; }}
    .exp-date {{ font-size: 0.875rem; color: #6b7280; }}
    .exp-subtitle {{ font-size: 1rem; font-weight: 500; color: #4b5563; margin: 0; }}
    .exp-bullets {{ margin-top: 0.75rem; }}

    /* ========== Education Entry ========== */
    .edu-entry {{ margin-bottom: 1.5rem; }}
    .edu-school {{ font-weight: 700; color: #1f2937; text-transform: uppercase; font-size: 0.875rem; }}
    .edu-degree {{ color: #374151; font-weight: 500; font-size: 0.875rem; }}
    .edu-date {{ color: #6b7280; font-style: italic; font-size: 0.875rem; }}
    .edu-coursework {{ margin-top: 0.5rem; font-size: 0.75rem; color: #4b5563; }}
    .edu-note {{ color: #6b7280; font-size: 0.75rem; font-style: italic; margin-top: 0.25rem; }}

    /* ========== Project Entry ========== */
    .project-entry {{ margin-bottom: 1.5rem; }}
    .project-title {{ font-size: 1.125rem; font-weight: 600; color: #1f2937; margin: 0; }}
    .project-bullets {{ margin-top: 0.5rem; }}

    /* ========== Editable Highlight ========== */
    [contenteditable="true"] {{
      outline: none;
      transition: background-color 0.2s;
      cursor: text;
    }}
    [contenteditable="true"]:hover {{
      background-color: rgba(37, 99, 235, 0.05);
    }}
    [contenteditable="true"]:focus {{
      background-color: rgba(37, 99, 235, 0.1);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.3);
      border-radius: 2px;
    }}

    /* ========== Diff Highlight ========== */
    {diff_styles}
    
    .diff-entry-new {{
      border-left: 3px solid #22c55e;
      padding-left: 8px;
      background: rgba(34, 197, 94, 0.05);
    }}

    /* ========== Print Styles ========== */
    @media print {{
      body {{ background-color: white !important; padding: 0 !important; margin: 0 !important; }}
      .page-container {{ box-shadow: none !important; margin: 0 !important; }}
      .sidebar {{ background-color: #f9fafb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
      a {{ color: #2563eb !important; text-decoration: underline !important; }}
    }}
  </style>
</head>
<body>
  <div class="sidebar-bg"></div>
  <div class="page-container">
    <!-- Sidebar content (first page only) -->
    <aside class="sidebar">
      <section>
        <h1 class="text-4xl font-bold text-gray-800" {name_edit}>{name}</h1>
        <p class="text-lg text-gray-600 mt-1" {role_edit}>{role}</p>
        
        <div class="mt-8 space-y-4 text-sm">
          {contact_html}
        </div>
      </section>

      <section class="mt-8">
        <h3 class="sidebar-title">Technical Skills</h3>
        <div class="mt-4 space-y-4 text-sm">
          {skills_html}
        </div>
      </section>
    </aside>

    <!-- Main Content - flows naturally across pages -->
    <main class="main-content">
      <section>
        <h2 class="text-xl mt-0">Profile Summary</h2>
        <p class="text-gray-700 leading-relaxed text-sm" {summary_edit}>{summary}</p>
      </section>

      <section>
        <h2 class="text-xl">Professional Experience</h2>
        {experience_html}
      </section>

      <section>
        <h2 class="text-xl">Selected Projects</h2>
        <div class="space-y-6">
          {projects_html}
        </div>
      </section>

      <section>
        <h2 class="text-xl">Education</h2>
        <div class="mt-4 space-y-6 text-sm">
          {education_html}
        </div>
      </section>
    </main>
  </div>
</body>
</html>'''


def render_resume_html_for_pdf(data: dict) -> str:
    """Render resume HTML without contenteditable (for PDF generation)."""
    return render_resume_html(data, editable=False)
