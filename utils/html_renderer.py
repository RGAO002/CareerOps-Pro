"""
HTML Renderer - Convert resume data to HTML
"""


def render_section_html(section_name, section_data, diff, show_diff):
    """Render a generic section to HTML."""
    if not section_data:
        return ""
    
    section_changed = diff.get(section_name, []) if show_diff else []
    title = section_name.replace("_", " ").title()
    
    content = ""
    for idx, item in enumerate(section_data):
        is_changed = idx in section_changed if isinstance(section_changed, list) else section_changed
        block_class = "job-block diff-highlight-block" if is_changed else "job-block"
        
        if isinstance(item, dict):
            main_title = item.get("name") or item.get("title") or item.get("company") or item.get("school") or ""
            subtitle = item.get("role") or item.get("issuer") or item.get("organization") or item.get("degree") or ""
            date = item.get("date") or item.get("year") or item.get("tech") or ""
            bullets = item.get("bullets") or item.get("details") or []
            description = item.get("description") or ""
            
            bullets_html = "".join([f'<li>{b}</li>' for b in bullets]) if bullets else ""
            
            content += f"""
            <div class="{block_class}">
                <div class="job-header">
                    <div class="company">{main_title}</div>
                    <div class="date">{date}</div>
                </div>
                {"<div class='job-role'>" + subtitle + "</div>" if subtitle else ""}
                {"<div style='font-size:10.5pt; margin-bottom:5px;'>" + description + "</div>" if description else ""}
                {"<ul>" + bullets_html + "</ul>" if bullets_html else ""}
            </div>
            """
        elif isinstance(item, str):
            item_class = "diff-highlight-block" if is_changed else ""
            content += f'<div class="job-block {item_class}" style="margin-bottom:10px;">{item}</div>'
    
    return f'<div class="main-section-title" style="margin-top:20px;">{title}</div>{content}'


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
    contact_items = data.get("contact", [])
    contact_changed = diff.get("contact", []) if show_diff else []
    contact_html = ""
    for i, item in enumerate(contact_items):
        if i in contact_changed:
            contact_html += f'<div class="contact-item diff-highlight-block"><span>•</span> {item}</div>'
        else:
            contact_html += f'<div class="contact-item"><span>•</span> {item}</div>'
    
    # Sidebar: Skills
    skills_changed = diff.get("skills", []) if show_diff else []
    skills_html = ""
    for category, items in data.get("skills", {}).items():
        if category in skills_changed:
            skills_html += f'<div class="skill-group diff-highlight-block"><div class="skill-label">{category}</div><div class="skill-text">{items}</div></div>'
        else:
            skills_html += f'<div class="skill-group"><div class="skill-label">{category}</div><div class="skill-text">{items}</div></div>'
    
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
    
    main_content = ""
    for section_name in ordered_sections:
        section_data = data.get(section_name)
        
        if isinstance(section_data, str) and section_data:
            display_title = section_name.replace("_", " ").title()
            section_content = section_data
            if show_diff and diff.get(section_name):
                section_content = f'<span class="diff-highlight">{section_content}</span>'
            main_content += f'<div class="main-section-title">{display_title}</div><div class="summary">{section_content}</div>'
        elif isinstance(section_data, list) and section_data:
            main_content += render_section_html(section_name, section_data, diff, show_diff)
    
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
            @page {{ size: A4; margin: 0; }}
            body {{ font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 0; font-size: 11pt; line-height: 1.5; color: #333; }}
            .container {{ display: flex; flex-direction: row; min-height: 297mm; }}
            .sidebar {{ width: 32%; background-color: #f4f6f8; padding: 40px 20px; border-right: 1px solid #e0e0e0; box-sizing: border-box; }}
            .main {{ width: 68%; padding: 40px 30px; background-color: #fff; box-sizing: border-box; }}
            h1 {{ font-size: 24pt; font-weight: 800; color: #2c3e50; margin: 0 0 10px 0; line-height: 1.1; text-transform: uppercase; word-wrap: break-word; }}
            .role {{ font-size: 14pt; color: #555; font-weight: 600; margin-bottom: 40px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }}
            .section-title {{ font-size: 11pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #2c3e50; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 30px; margin-bottom: 15px; }}
            .contact-item {{ font-size: 10pt; margin-bottom: 8px; color: #444; word-wrap: break-word; }}
            .skill-group {{ margin-bottom: 15px; }}
            .skill-label {{ font-weight: bold; font-size: 10pt; color: #2c3e50; }}
            .skill-text {{ font-size: 10pt; color: #555; }}
            .main-section-title {{ font-size: 14pt; font-weight: 800; text-transform: uppercase; color: #2c3e50; border-bottom: 2px solid #2c3e50; padding-bottom: 5px; margin-top: 0; margin-bottom: 20px; }}
            .job-block {{ margin-bottom: 25px; page-break-inside: avoid; }}
            .job-header {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }}
            .company {{ font-size: 12pt; font-weight: bold; color: #000; }}
            .date {{ font-size: 10pt; color: #666; font-style: italic; }}
            .job-role {{ font-size: 11pt; font-weight: bold; color: #444; margin-bottom: 5px; }}
            .summary {{ text-align: justify; margin-bottom: 30px; font-size: 11pt; }}
            ul {{ margin: 0; padding-left: 18px; }}
            li {{ margin-bottom: 3px; font-size: 10.5pt; text-align: justify; }}
            .edu-block {{ margin-bottom: 20px; }}
            {diff_styles}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="sidebar">
                <h1>{name}</h1>
                <div class="role">{role}</div>
                <div class="section-title">Contact</div>
                {contact_html}
                <div class="section-title">Skills</div>
                {skills_html}
            </div>
            <div class="main">
                {main_content}
            </div>
        </div>
    </body>
    </html>
    """
