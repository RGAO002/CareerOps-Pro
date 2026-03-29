"""
Walkthrough Mode — AI-driven step-by-step resume optimization.

Analyzes resume vs JD, generates directional questions for the user,
then rewrites sections based on chosen directions.
"""
import asyncio
import copy
import json
from langchain_core.messages import SystemMessage
from services.llm import get_llm
from services.resume_editor import _constrain_section_length


def _clean_json(text: str):
    """Extract and parse JSON from LLM response."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # skip ```json
        end = next((i for i, l in enumerate(lines) if l.strip() == "```"), len(lines))
        text = "\n".join(lines[:end])
    return json.loads(text)


async def initial_analysis(
    resume_data: dict,
    job_data: dict,
    model_choice: str,
    api_key: str,
) -> list[dict]:
    """
    Analyze resume vs JD. Return a list of directional questions for the user.
    Only significant decisions — minor fixes are applied automatically later.
    Typically 3-6 questions, never more than 8.
    """
    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)
    job_title = job_data.get("title", "")
    job_company = job_data.get("company", "")
    requirements = job_data.get("requirements", [])
    gaps = job_data.get("gaps", [])
    tailoring_tips = job_data.get("tailoring_tips", [])
    description = job_data.get("description", "")

    reqs_text = "\n".join(f"- {r}" for r in requirements) if requirements else "- (none)"
    gaps_text = "\n".join(f"- {g}" for g in gaps) if gaps else "- (none)"
    tips_text = "\n".join(f"- {t}" for t in tailoring_tips) if tailoring_tips else "- (none)"

    system_text = f"""You are an expert resume optimization consultant. Analyze this resume against the target job and identify the KEY directional decisions that need user input.

== RESUME ==
{resume_json}

== TARGET JOB ==
Title: {job_title}
Company: {job_company}

Requirements:
{reqs_text}

Gaps to address:
{gaps_text}

Tailoring tips:
{tips_text}

Job Description:
{description}

== YOUR TASK ==
Carefully compare this resume to the JD. Identify 3-6 directional decisions where the user's input genuinely matters — places where you could go in meaningfully different directions and the user's preference would change the outcome.

DO NOT mechanically produce one question per section. Instead:
- Drill into SPECIFIC items: a particular bullet point that's weak, a specific experience entry that could be repositioned, a concrete skill gap
- If a section already aligns well with the JD, SKIP it entirely — don't ask about it just to have coverage
- Multiple questions on the SAME section are fine if there are genuinely different decisions (e.g., two different experience entries need different strategies)
- Focus on the GAP between what the resume says and what the JD needs. What specific mismatch would hurt the candidate most?

WHAT COUNTS AS A REAL QUESTION:
✅ "Your 2nd bullet at Fonzi AI mentions 'improved performance' without numbers. The JD emphasizes CI/CD pipeline optimization."
   → Option A: Reframe around CI/CD pipeline speed improvements
   → Option B: Add deployment frequency / downtime metrics instead
✅ "You have no mention of Kubernetes anywhere, but the JD lists it as required. Where should we add it?"
   → Option A: Add to the DevOps skill category
   → Option B: Weave into your Acme Corp experience bullets where relevant
✅ "Your summary leads with 'Full-stack developer' but this role is a backend infrastructure position."
   → Option A: Lead with backend / distributed systems focus
   → Option B: Lead with cloud infrastructure and scalability

WHAT DOES NOT COUNT (handle these silently as auto_fixes):
❌ "Your summary could use more keywords from the JD" — too vague
❌ "Your skills section could be improved" — no specific direction
❌ "This experience entry could be stronger" — says nothing actionable

== RESPONSE FORMAT ==
Return valid JSON:
{{
  "questions": [
    {{
      "id": "q1",
      "section": "summary|skills|experience|projects",
      "index": null,
      "field": null,
      "analysis": "1-2 sentence description of the SPECIFIC issue — what's weak/missing and why it matters for this JD",
      "options": [
        {{"id": "a", "label": "Short direction phrase", "recommended": true}},
        {{"id": "b", "label": "Alternative direction phrase"}},
        {{"id": "keep", "label": "Keep as is"}}
      ]
    }}
  ],
  "auto_fixes": [
    "Brief description of minor fix applied automatically"
  ]
}}

RULES:
- Exactly 2-3 direction options per question (not counting "keep as is")
- When two directions are compatible and combining them is clearly better, offer a "combine both" option and mark it recommended
- Mark one option as recommended — it must genuinely be the best choice for THIS JD
- Each option label: SHORT phrase, under 15 words, specific enough to act on
- "index": array index (0-based) for experience/projects entries, null for summary/skills
- "field": use "bullets[0]", "bullets[1]" etc. when the question targets a specific bullet, null for whole section/entry
- auto_fixes: list all minor improvements you'll handle without asking (keyword insertions, action verb upgrades, small metric additions, formatting fixes)
- 3-6 questions typical, absolute max 8. Quality over quantity — fewer sharp questions beats many vague ones
"""

    llm = get_llm(model_choice, api_key)
    loop = asyncio.get_event_loop()
    res = await asyncio.wait_for(
        loop.run_in_executor(
            None,
            lambda: llm.invoke(
                [SystemMessage(content=system_text)],
                response_format={"type": "json_object"},
            ),
        ),
        timeout=120,
    )
    result = _clean_json(res.content)
    return result.get("questions", []), result.get("auto_fixes", [])


async def apply_rewrite(
    question: dict,
    direction: str,
    direction_label: str,
    resume_data: dict,
    job_data: dict,
    model_choice: str,
    api_key: str,
) -> dict:
    """
    Rewrite a specific section/field based on the chosen direction.
    Returns {"section": ..., "index": ..., "new_content": ..., "description": ...}.
    """
    section = question["section"]
    index = question.get("index")
    field = question.get("field")

    # Get current content
    if section in ("experience", "projects") and index is not None:
        entries = resume_data.get(section, [])
        if index < len(entries):
            current = entries[index]
        else:
            return {"error": f"Index {index} out of range for {section}"}
    else:
        current = resume_data.get(section)

    current_json = json.dumps(current, ensure_ascii=False, indent=2)
    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)

    job_title = job_data.get("title", "")
    job_company = job_data.get("company", "")
    requirements = job_data.get("requirements", [])
    description = job_data.get("description", "")
    reqs_text = "\n".join(f"- {r}" for r in requirements) if requirements else "- (none)"

    system_text = f"""You are an expert resume writer. Rewrite the specified section following the user's chosen direction.

== FULL RESUME (context only) ==
{resume_json}

== TARGET JOB ==
Title: {job_title} at {job_company}
Requirements:
{reqs_text}
Description:
{description}

== SECTION TO REWRITE ==
Section: {section}{"[" + str(index) + "]" if index is not None else ""}
{f"Field: {field}" if field else ""}

Current content:
{current_json}

== USER'S CHOSEN DIRECTION ==
{direction_label}

== INSTRUCTIONS ==
- Rewrite ONLY this section/field following the chosen direction
- Incorporate relevant keywords from the JD naturally
- Keep the same JSON structure as the original
- For experience/projects: KEEP ALL bullet points, do NOT remove any
- Add quantifiable metrics where plausible
- Keep content concise — do not inflate length significantly
- Also apply any obvious minor improvements (keywords, action verbs, metrics)

== RESPONSE FORMAT ==
Return valid JSON:
{{
  "new_content": <the rewritten section data (same structure as original)>,
  "description": "1-sentence summary of what changed"
}}
"""

    llm = get_llm(model_choice, api_key)
    loop = asyncio.get_event_loop()
    res = await asyncio.wait_for(
        loop.run_in_executor(
            None,
            lambda: llm.invoke(
                [SystemMessage(content=system_text)],
                response_format={"type": "json_object"},
            ),
        ),
        timeout=120,
    )
    result = _clean_json(res.content)

    new_content = result.get("new_content")

    # Apply safety constraints
    if section in ("experience", "projects") and index is not None:
        # Wrap in list for constraint check
        original_list = resume_data.get(section, [])
        if index < len(original_list) and isinstance(new_content, dict):
            orig_entry = original_list[index]
            # Protect bullet count
            if isinstance(orig_entry, dict):
                orig_bullets = orig_entry.get("bullets", [])
                new_bullets = new_content.get("bullets", [])
                if len(new_bullets) < len(orig_bullets):
                    new_content["bullets"] = orig_bullets
    elif section == "summary" and isinstance(new_content, str):
        original = resume_data.get("summary", "")
        new_content = _constrain_section_length("summary", original, new_content)
    elif section == "skills" and isinstance(new_content, dict):
        original = resume_data.get("skills", {})
        new_content = _constrain_section_length("skills", original, new_content)

    return {
        "section": section,
        "index": index,
        "field": field,
        "new_content": new_content,
        "description": result.get("description", "Updated"),
    }


async def handle_user_input(
    user_text: str,
    question: dict,
    resume_data: dict,
    job_data: dict,
    model_choice: str,
    api_key: str,
) -> dict:
    """
    Process free-text user input for a question. Returns AI response.
    May include updated options or just an acknowledgment.
    """
    system_text = f"""You are a resume optimization consultant. The user is providing feedback on a resume improvement question.

Question context:
- Section: {question['section']}
- Issue: {question['analysis']}
- Options presented: {json.dumps(question['options'], ensure_ascii=False)}

User's input: "{user_text}"

Respond with JSON:
{{
  "type": "acknowledgment" or "new_options",
  "message": "Your brief response to the user",
  "options": [...]  // only if type is "new_options" — updated options based on user feedback
}}

If the user's input is clear enough to act on, respond with "acknowledgment" and a brief confirmation.
If the user's input is ambiguous, respond with "new_options" providing refined choices.
Keep your message under 2 sentences. Be concise.
"""

    llm = get_llm(model_choice, api_key)
    loop = asyncio.get_event_loop()
    res = await asyncio.wait_for(
        loop.run_in_executor(
            None,
            lambda: llm.invoke(
                [SystemMessage(content=system_text)],
                response_format={"type": "json_object"},
            ),
        ),
        timeout=60,
    )
    return _clean_json(res.content)


def apply_change(resume_data: dict, section: str, index, new_content) -> dict:
    """Apply rewritten content to resume_data. Returns updated copy."""
    data = copy.deepcopy(resume_data)
    if section in ("experience", "projects") and index is not None:
        entries = data.get(section, [])
        if index < len(entries):
            entries[index] = new_content
    else:
        data[section] = new_content
    return data


def revert_change(resume_data: dict, original_data: dict, section: str, index) -> dict:
    """Revert a section to its original content."""
    data = copy.deepcopy(resume_data)
    if section in ("experience", "projects") and index is not None:
        orig_entries = original_data.get(section, [])
        entries = data.get(section, [])
        if index < len(orig_entries) and index < len(entries):
            entries[index] = copy.deepcopy(orig_entries[index])
    else:
        data[section] = copy.deepcopy(original_data.get(section))
    return data
