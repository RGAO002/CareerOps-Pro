"""
Diff Utilities - Compare resume data changes with detailed tracking
"""


def compute_diff(old_data, new_data):
    """
    Compare two resume data dicts and return detailed change info.
    
    Returns dict like:
    {
        "name": True,  # simple field changed
        "summary": True,
        "experience": {
            0: {"company": True, "bullets": [1, 2]},  # exp 0 changed, bullets 1,2 changed
            2: "added"  # exp 2 is new
        },
        "projects": {
            1: {"name": True, "bullets": [0]}
        },
        "skills": ["Python", "AI"],  # these skill categories changed
        "contact": [0, 2],  # contact items 0 and 2 changed
    }
    """
    if not old_data or not new_data:
        return {}
    
    diff = {}
    
    # Simple string fields
    for key in ["name", "role", "summary"]:
        if old_data.get(key) != new_data.get(key):
            diff[key] = True
    
    # Contact (list of strings)
    old_contact = old_data.get("contact", [])
    new_contact = new_data.get("contact", [])
    contact_changes = []
    for i, item in enumerate(new_contact):
        if i >= len(old_contact) or item != old_contact[i]:
            contact_changes.append(i)
    # Check for deletions (new list is shorter)
    if len(new_contact) < len(old_contact):
        contact_changes.append(-1)  # Signal that items were deleted
    if contact_changes:
        diff["contact"] = contact_changes
    
    # Skills (dict)
    old_skills = old_data.get("skills", {})
    new_skills = new_data.get("skills", {})
    skills_changes = []
    for key in set(old_skills.keys()) | set(new_skills.keys()):
        if old_skills.get(key) != new_skills.get(key):
            skills_changes.append(key)
    if skills_changes:
        diff["skills"] = skills_changes
    
    # Experience (list of dicts with bullets)
    diff["experience"] = _compute_list_diff(
        old_data.get("experience", []),
        new_data.get("experience", []),
        ["company", "role", "date", "bullets"]
    )
    
    # Projects (list of dicts with bullets)
    diff["projects"] = _compute_list_diff(
        old_data.get("projects", []),
        new_data.get("projects", []),
        ["name", "tech", "link", "bullets"]
    )
    
    # Education (list of dicts)
    diff["education"] = _compute_list_diff(
        old_data.get("education", []),
        new_data.get("education", []),
        ["school", "degree", "date", "gpa", "coursework", "note"]
    )
    
    # Clean up empty diffs
    for key in ["experience", "projects", "education"]:
        if not diff.get(key):
            diff.pop(key, None)
    
    return diff


def _compute_list_diff(old_list, new_list, fields):
    """Compare two lists of dicts, tracking changes at field and bullet level."""
    if not old_list and not new_list:
        return {}
    
    changes = {}
    
    for i, new_item in enumerate(new_list):
        if not isinstance(new_item, dict):
            continue
            
        if i >= len(old_list):
            # New item added
            changes[i] = "added"
            continue
        
        old_item = old_list[i]
        if not isinstance(old_item, dict):
            changes[i] = "added"
            continue
        
        item_changes = {}
        
        for field in fields:
            old_val = old_item.get(field)
            new_val = new_item.get(field)
            
            if old_val == new_val:
                continue
            
            if field == "bullets":
                # Track individual bullet changes
                old_bullets = old_val or []
                new_bullets = new_val or []
                bullet_changes = []
                
                for j, bullet in enumerate(new_bullets):
                    if j >= len(old_bullets) or bullet != old_bullets[j]:
                        bullet_changes.append(j)
                
                if bullet_changes:
                    item_changes["bullets"] = bullet_changes
            else:
                item_changes[field] = True
        
        if item_changes:
            changes[i] = item_changes
    
    # Check for deletions
    if len(new_list) < len(old_list):
        changes[-1] = "deleted"
    
    return changes


def highlight_text(text, is_changed):
    """Return highlighted HTML if changed."""
    if is_changed:
        return f'<span class="diff-highlight">{text}</span>'
    return text


def highlight_bullet(text, is_changed):
    """Return highlighted list item if changed."""
    if is_changed:
        return f'<span class="diff-highlight">{text}</span>'
    return text
