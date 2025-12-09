"""
Resume Editor Service - AI-powered resume modifications
"""
import json
import copy
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from services.llm import get_llm, clean_json


def protect_bullets(original, ai_data):
    """Prevent AI from accidentally shortening bullet points."""
    if not original or not ai_data:
        return ai_data
    
    result = copy.deepcopy(ai_data)
    
    for section in ["experience", "projects"]:
        orig_list = original.get(section, [])
        new_list = result.get(section, [])
        
        for i, new_item in enumerate(new_list):
            if i < len(orig_list) and isinstance(new_item, dict) and isinstance(orig_list[i], dict):
                orig_bullets = orig_list[i].get("bullets", [])
                new_bullets = new_item.get("bullets", [])
                
                if len(new_bullets) < len(orig_bullets):
                    print(f"[DEBUG] Protected {section}[{i}] bullets: {len(new_bullets)} → {len(orig_bullets)}")
                    new_item["bullets"] = orig_bullets
    
    return result


def edit_resume(user_input, current_data, timeline, model_choice, api_key, target_job=None):
    """Process user edit request and return updated resume data."""
    llm = get_llm(model_choice, api_key)
    
    current_json_str = json.dumps(current_data, ensure_ascii=False, indent=2)
    
    job_context = ""
    if target_job:
        job_context = f"""
TARGET JOB (tailor resume for this position):
- Title: {target_job.get('title')}
- Company: {target_job.get('company')}
- Requirements: {', '.join(target_job.get('requirements', []))}
- Description: {target_job.get('description', '')}

When making edits, optimize the resume for this specific job.
"""
    
    system_text = f"""You are "CareerOps", a powerful resume editing assistant with FULL control over the resume structure.

CURRENT RESUME DATA:
{current_json_str}
{job_context}
YOUR CAPABILITIES:
1. Edit any existing field (name, role, summary, experience, etc.)
2. ADD NEW SECTIONS - You can create ANY new section (certifications, awards, publications, languages, volunteer, etc.)
   - New sections should be a list of objects: [{{"name": "...", "date": "...", "description": "..."}}]
3. REORDER SECTIONS - Use "section_order" to control the order of main sections
   - Example: "section_order": ["summary", "experience", "certifications", "education", "projects"]
4. REMOVE sections by omitting them from the output
5. RENAME sections by creating a new one and removing the old

RESPONSE FORMAT:
1. For ADVICE/SUGGESTIONS → Return:
   {{"type": "suggestion", "suggestion_list": ["Suggestion 1", "Suggestion 2"], "message": "Here are my suggestions:"}}

2. For ANY EDIT (modify, add, delete, reorder, restructure) → Return:
   {{"type": "edit", "data": <COMPLETE_UPDATED_JSON>, "message": "Description of what changed"}}
   
   RULES FOR EDITS:
   - Return the COMPLETE JSON with ALL sections (don't lose any data)
   - ⚠️ KEEP ALL BULLET POINTS - DO NOT summarize or shorten bullets
   - Copy unchanged sections EXACTLY as they are, character by character
   - You CAN add new keys (sections) to the JSON
   - You CAN include "section_order" to control display order
   - To RENAME a section: create new key with desired name, copy content, set old key to null

3. If unclear → Return:
   {{"type": "chat", "message": "Could you clarify..."}}

IMPORTANT: "type" MUST be exactly "edit", "suggestion", or "chat".
"""
    
    messages = [SystemMessage(content=system_text)]
    
    for item in timeline[-2:]:
        if item['role'] == 'user': 
            messages.append(HumanMessage(content=item['content']))
        elif item['role'] == 'assistant': 
            messages.append(AIMessage(content=item['content']))
    
    messages.append(HumanMessage(content=user_input))

    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        result = clean_json(res.content)
        
        print(f"[DEBUG] AI Response type: {result.get('type')}")
        print(f"[DEBUG] AI Response keys: {result.keys()}")
        
        if result.get("data") and result.get("type") not in ["edit", "suggestion"]:
            print(f"[DEBUG] Auto-correcting type to 'edit'")
            result["type"] = "edit"
        
        if result.get("suggestion_list") and result.get("type") != "suggestion":
            print(f"[DEBUG] Auto-correcting type to 'suggestion'")
            result["type"] = "suggestion"
        
        if result.get("type") == "edit" and result.get("data"):
            result["data"] = protect_bullets(current_data, result["data"])
            
        return result
        
    except Exception as e:
        print(f"[DEBUG] Editor error: {e}")
        return {"type": "error", "message": f"Failed to parse AI response: {str(e)}"}
