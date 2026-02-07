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


def _get_section_specific_instructions(section_name):
    """Return section-specific tailoring instructions."""
    instructions = {
        "summary": (
            "For the SUMMARY section:\n"
            "- Rewrite to position the candidate for this specific role\n"
            "- Lead with the most relevant experience and skills\n"
            "- Include keywords from the job requirements\n"
            "- Keep it to 2-4 impactful sentences\n"
            "- The section_data should be a string"
        ),
        "skills": (
            "For the SKILLS section:\n"
            "- Reorder skill categories to put the most relevant ones first\n"
            "- Within each category, put the most relevant skills first\n"
            "- You MAY add a few skills that are explicitly required by this job AND the candidate plausibly has based on their experience — but keep additions minimal\n"
            "- Do NOT add generic or unrelated skills\n"
            "- Do NOT significantly expand the length of any category\n"
            "- The section_data should be a dict of category: comma-separated-skills-string"
        ),
        "experience": (
            "For the EXPERIENCE section:\n"
            "- Rephrase bullet points to use keywords from the job description\n"
            "- Add quantifiable metrics and impact where plausible (e.g., percentages, dollar amounts, user counts)\n"
            "- Emphasize responsibilities that align with the target role\n"
            "- KEEP ALL bullet points - do NOT remove or merge any\n"
            "- KEEP ALL experience entries - do NOT remove any\n"
            "- The section_data should be a list of experience dicts with the same structure"
        ),
        "projects": (
            "For the PROJECTS section:\n"
            "- Highlight aspects most relevant to the target job\n"
            "- Rephrase bullets to use job-relevant keywords\n"
            "- Add impact metrics where plausible\n"
            "- KEEP ALL bullet points - do NOT remove or merge any\n"
            "- KEEP ALL project entries - do NOT remove any\n"
            "- The section_data should be a list of project dicts with the same structure"
        )
    }
    return instructions.get(section_name, "")


def _constrain_section_length(section_name, original, tailored, max_growth=1.2):
    """
    Prevent AI from inflating section content beyond original length.
    max_growth: e.g. 1.2 means allow at most 20% longer than original.
    """
    if original is None or tailored is None:
        return tailored

    # --- summary (string) ---
    if section_name == "summary" and isinstance(original, str) and isinstance(tailored, str):
        max_len = int(len(original) * max_growth)
        if len(tailored) > max_len:
            # Truncate to last complete sentence within limit
            truncated = tailored[:max_len]
            last_period = truncated.rfind('.')
            if last_period > len(original) * 0.5:
                tailored = truncated[:last_period + 1]
            else:
                tailored = truncated.rstrip()
            print(f"[DEBUG] Constrained summary: {len(original)} → {len(tailored)} chars (max {max_len})")
        return tailored

    # --- skills (dict of category: comma-separated string) ---
    if section_name == "skills" and isinstance(original, dict) and isinstance(tailored, dict):
        constrained = {}
        for cat, skills_str in tailored.items():
            if cat in original:
                orig_count = len([s.strip() for s in original[cat].split(',') if s.strip()])
                new_skills = [s.strip() for s in skills_str.split(',') if s.strip()]
                max_count = orig_count + 2  # allow at most 2 new skills per category
                if len(new_skills) > max_count:
                    new_skills = new_skills[:max_count]
                    print(f"[DEBUG] Constrained skills[{cat}]: {len(new_skills)+len(new_skills)-max_count} → {max_count}")
                constrained[cat] = ', '.join(new_skills)
            else:
                # New category added by AI — only keep if original has few categories
                if len(tailored) <= len(original) + 1:
                    constrained[cat] = skills_str
                else:
                    print(f"[DEBUG] Dropped new skills category: {cat}")
        return constrained

    # --- experience / projects (list of dicts with bullets) ---
    if section_name in ("experience", "projects") and isinstance(original, list) and isinstance(tailored, list):
        for i, new_item in enumerate(tailored):
            if i >= len(original) or not isinstance(new_item, dict) or not isinstance(original[i], dict):
                continue
            orig_bullets = original[i].get("bullets", [])
            new_bullets = new_item.get("bullets", [])
            # Constrain each bullet's length
            constrained_bullets = []
            for j, bullet in enumerate(new_bullets):
                if j < len(orig_bullets):
                    orig_len = len(orig_bullets[j])
                    max_bullet_len = int(orig_len * max_growth)
                    if len(bullet) > max_bullet_len and orig_len > 20:
                        bullet = bullet[:max_bullet_len].rstrip()
                        # Try to end at a word boundary
                        last_space = bullet.rfind(' ')
                        if last_space > max_bullet_len * 0.7:
                            bullet = bullet[:last_space]
                        print(f"[DEBUG] Constrained {section_name}[{i}].bullet[{j}]: {len(new_bullets[j])} → {len(bullet)} chars")
                constrained_bullets.append(bullet)
            new_item["bullets"] = constrained_bullets
        # Don't allow adding new entries
        if len(tailored) > len(original):
            tailored = tailored[:len(original)]
            print(f"[DEBUG] Constrained {section_name} entries: trimmed to {len(original)}")
        return tailored

    return tailored


def tailor_section(section_name, current_data, target_job, user_instructions, model_choice, api_key):
    """Tailor a specific resume section for a target job. Returns only the modified section data."""
    llm = get_llm(model_choice, api_key)

    current_json_str = json.dumps(current_data, ensure_ascii=False, indent=2)

    requirements = target_job.get('requirements', [])
    match_reasons = target_job.get('match_reasons', [])
    gaps = target_job.get('gaps', [])
    tailoring_tips = target_job.get('tailoring_tips', [])

    reqs_text = chr(10).join(f"- {r}" for r in requirements) if requirements else "- (none listed)"
    strengths_text = chr(10).join(f"- {r}" for r in match_reasons) if match_reasons else "- (none)"
    gaps_text = chr(10).join(f"- {g}" for g in gaps) if gaps else "- (none identified)"
    tips_text = chr(10).join(f"- {t}" for t in tailoring_tips) if tailoring_tips else "- (none)"

    user_instr_block = ""
    if user_instructions and user_instructions.strip():
        user_instr_block = f"""
== ADDITIONAL USER INSTRUCTIONS ==
{user_instructions.strip()}
"""

    section_instructions = _get_section_specific_instructions(section_name)

    system_text = f"""You are "CareerOps", an elite resume tailoring specialist.

== FULL RESUME (read-only context — do NOT return the full resume) ==
{current_json_str}

== TARGET JOB ==
Title: {target_job.get('title')}
Company: {target_job.get('company')}

Requirements:
{reqs_text}

Job Description:
{target_job.get('description', '')}

Why the candidate already matches:
{strengths_text}

Gaps to address:
{gaps_text}

Tailoring tips:
{tips_text}
{user_instr_block}
== YOUR TASK ==
Tailor ONLY the "{section_name}" section of this resume for the target job.

GUIDELINES:
- Incorporate keywords and phrases from the job requirements naturally
- Address the identified gaps where possible through strategic rephrasing
- Follow the tailoring tips provided above
- You MAY add quantifiable metrics, impact numbers, and achievements to make bullets more compelling (be realistic but impactful)
- For skills: you MAY add a few skills explicitly required by this job that the candidate plausibly has, but keep additions minimal and job-relevant only
- DO NOT fabricate entire new job experiences or projects
- Maintain the same JSON structure/schema as the original section

{section_instructions}

== RESPONSE FORMAT ==
Return ONLY valid JSON with exactly two keys:
{{
    "section_data": <the modified {section_name} data>,
    "message": "Brief summary of changes made (1-2 sentences)"
}}
"""

    messages = [SystemMessage(content=system_text)]

    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        result = clean_json(res.content)

        if "section_data" not in result:
            return {"error": f"AI response missing section_data for {section_name}"}

        # Protect bullet counts for experience/projects (prevent deletion)
        if section_name in ("experience", "projects"):
            original_section = current_data.get(section_name, [])
            new_section = result["section_data"]
            if isinstance(new_section, list) and isinstance(original_section, list):
                for i, new_item in enumerate(new_section):
                    if i < len(original_section) and isinstance(new_item, dict) and isinstance(original_section[i], dict):
                        orig_bullets = original_section[i].get("bullets", [])
                        new_bullets = new_item.get("bullets", [])
                        if len(new_bullets) < len(orig_bullets):
                            print(f"[DEBUG] Tailor protected {section_name}[{i}] bullets: {len(new_bullets)} → {len(orig_bullets)}")
                            new_item["bullets"] = orig_bullets

        # Constrain length to prevent inflation
        original_section = current_data.get(section_name)
        result["section_data"] = _constrain_section_length(
            section_name, original_section, result["section_data"]
        )

        return result

    except Exception as e:
        print(f"[DEBUG] Tailor section error ({section_name}): {e}")
        return {"error": f"Failed to tailor {section_name}: {str(e)}"}
