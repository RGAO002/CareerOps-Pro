"""
Diff Utilities - Compare resume data changes
"""

def compute_diff(old_data, new_data):
    """Compare two resume data dicts and return changed fields."""
    if not old_data or not new_data:
        return {}
    
    diff = {}
    all_keys = set(old_data.keys()) | set(new_data.keys())
    
    for key in all_keys:
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        
        if key == "section_order":
            if old_val != new_val:
                diff[key] = True
            continue
        
        if old_val == new_val:
            continue
        
        if old_val is None and new_val is not None:
            if isinstance(new_val, list):
                diff[key] = list(range(len(new_val)))
            else:
                diff[key] = True
            continue
        
        if old_val is not None and new_val is None:
            continue
        
        if isinstance(new_val, str):
            diff[key] = True
        elif isinstance(new_val, list):
            old_list = old_val if old_val else []
            changed_indices = []
            for i, item in enumerate(new_val):
                if i >= len(old_list):
                    changed_indices.append(i)
                elif item != old_list[i]:
                    changed_indices.append(i)
            if changed_indices:
                diff[key] = changed_indices
        elif isinstance(new_val, dict):
            old_dict = old_val if old_val else {}
            changed_keys = [k for k in new_val if new_val.get(k) != old_dict.get(k)]
            if changed_keys:
                diff[key] = changed_keys
    
    return diff


def highlight_text(text, is_changed):
    """Return highlighted HTML if changed."""
    if is_changed:
        return f'<span class="diff-highlight">{text}</span>'
    return text


def highlight_bullet(text, is_changed):
    """Return highlighted list item if changed."""
    if is_changed:
        return f'<li class="diff-highlight-li">{text}</li>'
    return f'<li>{text}</li>'
