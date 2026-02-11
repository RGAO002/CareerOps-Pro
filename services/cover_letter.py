"""
Cover Letter Service - Generate and edit cover letters with AI
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from services.llm import get_llm, clean_json


def generate_cover_letter(resume_data, target_job, question, model_choice, api_key, previous_letter=None, custom_instructions=""):
    """
    Generate a cover letter for a target job.

    Args:
        resume_data: Full resume data dict
        target_job: Target job dict (title, company, description, requirements, etc.)
        question: Optional application question (e.g. "Why do you want to work at X?")
        model_choice: LLM model identifier
        api_key: API key for the LLM
        previous_letter: Optional previous letter (to generate a different version)
        custom_instructions: Optional user instructions for how to write the letter

    Returns:
        {"success": True, "cover_letter": "..."} or {"success": False, "error": "..."}
    """
    llm = get_llm(model_choice, api_key)

    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)

    requirements = target_job.get('requirements', [])
    match_reasons = target_job.get('match_reasons', [])
    gaps = target_job.get('gaps', [])
    tailoring_tips = target_job.get('tailoring_tips', [])

    reqs_text = "\n".join(f"- {r}" for r in requirements) if requirements else "- (none listed)"
    strengths_text = "\n".join(f"- {r}" for r in match_reasons) if match_reasons else "- (none)"
    gaps_text = "\n".join(f"- {g}" for g in gaps) if gaps else "- (none identified)"
    tips_text = "\n".join(f"- {t}" for t in tailoring_tips) if tailoring_tips else "- (none)"

    question_block = ""
    if question and question.strip():
        question_block = f"""
APPLICATION QUESTION:
"{question.strip()}"

Write a professional response to this question. The response should read like a cover letter paragraph — persuasive, specific, and tailored to this role. Do NOT start with "Dear Hiring Manager" since this is a direct answer to a question.
"""
    else:
        question_block = """
Write a general cover letter for this position. Structure:
- Opening: Express interest in the specific role and company
- Body (1-2 paragraphs): Highlight the most relevant experience and skills from the resume
- Closing: Express enthusiasm and readiness to discuss further
- Keep it 250-400 words
- Start with "Dear Hiring Manager,"
"""

    previous_block = ""
    if previous_letter:
        previous_block = f"""
PREVIOUS VERSION (generate a DIFFERENT version — vary structure, emphasis, and wording):
{previous_letter}
"""

    instructions_block = ""
    if custom_instructions and custom_instructions.strip():
        instructions_block = f"""
USER INSTRUCTIONS (follow these closely):
{custom_instructions.strip()}
"""

    system_text = f"""You are "CareerOps", a professional cover letter writer.

CANDIDATE'S RESUME:
{resume_json}

TARGET JOB:
- Title: {target_job.get('title')}
- Company: {target_job.get('company')}

Requirements:
{reqs_text}

Job Description:
{target_job.get('description', '')}

Why the candidate matches:
{strengths_text}

Gaps to address:
{gaps_text}

Tailoring tips:
{tips_text}
{question_block}{previous_block}{instructions_block}
RULES:
- Reference REAL experience, skills, and achievements from the resume — do NOT fabricate
- Use specific examples and metrics from the resume where possible
- Match the tone to a professional cover letter
- Do NOT include the candidate's address or date header — just the letter body
- Write in first person

Return valid JSON:
{{"cover_letter": "the full cover letter text"}}
"""

    messages = [SystemMessage(content=system_text)]

    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        result = clean_json(res.content)
        letter = result.get("cover_letter", "")
        if not letter:
            return {"success": False, "error": "AI returned empty cover letter."}
        return {"success": True, "cover_letter": letter}
    except Exception as e:
        print(f"[DEBUG] Cover letter generation error: {e}")
        return {"success": False, "error": str(e)}


def edit_cover_letter(user_input, current_letter, resume_data, target_job, cl_timeline, model_choice, api_key):
    """
    AI Copilot: Edit or provide suggestions for a cover letter based on user instructions.

    Args:
        user_input: User's edit instruction
        current_letter: Current cover letter text
        resume_data: Full resume data dict (for context)
        target_job: Target job dict
        cl_timeline: Cover letter chat history (list of timeline entries)
        model_choice: LLM model identifier
        api_key: API key

    Returns:
        {"type": "edit", "cover_letter": "...", "message": "..."}
        {"type": "suggestion", "suggestion_list": [...], "message": "..."}
        {"type": "chat", "message": "..."}
        {"type": "error", "message": "..."}
    """
    llm = get_llm(model_choice, api_key)

    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)

    job_context = ""
    if target_job:
        job_context = f"""
TARGET JOB:
- Title: {target_job.get('title')}
- Company: {target_job.get('company')}
- Requirements: {', '.join(target_job.get('requirements', []))}
- Description: {target_job.get('description', '')}
"""

    system_text = f"""You are "CareerOps", a cover letter editing assistant.

CURRENT COVER LETTER:
{current_letter}

CANDIDATE'S RESUME (for reference — use real experience only):
{resume_json}
{job_context}
RESPONSE FORMAT:
1. For ADVICE/SUGGESTIONS → Return:
   {{"type": "suggestion", "suggestion_list": ["Suggestion 1", "Suggestion 2"], "message": "Here are my suggestions:"}}

2. For ANY EDIT (rewrite, rephrase, expand, shorten, change tone, etc.) → Return:
   {{"type": "edit", "cover_letter": "<the COMPLETE updated cover letter>", "message": "Description of what changed"}}

   RULES FOR EDITS:
   - Return the COMPLETE cover letter text (not just the changed part)
   - Only modify what the user asked for — keep the rest unchanged
   - Reference real experience from the resume — do NOT fabricate

3. If unclear → Return:
   {{"type": "chat", "message": "Could you clarify..."}}

IMPORTANT: "type" MUST be exactly "edit", "suggestion", or "chat".
Always respond with valid JSON only.
"""

    messages = [SystemMessage(content=system_text)]

    # Add recent chat history for context
    for item in cl_timeline[-2:]:
        if item['role'] == 'user':
            messages.append(HumanMessage(content=item['content']))
        elif item['role'] == 'assistant':
            messages.append(AIMessage(content=item['content']))

    messages.append(HumanMessage(content=user_input))

    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        result = clean_json(res.content)

        # Auto-correct type mismatches
        if result.get("cover_letter") and result.get("type") not in ["edit", "suggestion"]:
            result["type"] = "edit"
        if result.get("suggestion_list") and result.get("type") != "suggestion":
            result["type"] = "suggestion"

        return result

    except Exception as e:
        print(f"[DEBUG] Cover letter edit error: {e}")
        return {"type": "error", "message": f"Failed to parse AI response: {str(e)}"}
