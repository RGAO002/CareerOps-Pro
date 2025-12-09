"""
Resume Analyzer Service - Scoring and feedback analysis
"""
import json
from langchain_core.messages import SystemMessage
from services.llm import get_llm, clean_json


def analyze_resume(resume_data, model_choice, api_key):
    """Analyze resume and return scores with strengths/weaknesses."""
    llm = get_llm(model_choice, api_key)
    
    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)
    
    system_text = f"""You are an expert resume analyst. Analyze this resume and provide detailed feedback.

RESUME DATA:
{resume_json}

Provide analysis in the following JSON format:
{{
    "overall_score": <number 0-100>,
    "category_scores": {{
        "experience": <0-100>,
        "skills": <0-100>,
        "education": <0-100>,
        "presentation": <0-100>,
        "impact": <0-100>
    }},
    "strengths": [
        {{"title": "Strength Title", "description": "Detailed explanation", "icon": "✅"}}
    ],
    "weaknesses": [
        {{"title": "Weakness Title", "description": "Detailed explanation with suggestion", "icon": "⚠️"}}
    ],
    "quick_wins": [
        "Specific actionable improvement 1",
        "Specific actionable improvement 2"
    ],
    "summary": "2-3 sentence overall assessment"
}}

SCORING CRITERIA:
- Experience (0-100): Relevance, progression, achievements with metrics
- Skills (0-100): Technical depth, variety, modern/in-demand skills
- Education (0-100): Relevance, prestige, certifications
- Presentation (0-100): Clarity, organization, readability
- Impact (0-100): Quantified achievements, results-oriented language

Be constructive but honest. Provide specific, actionable feedback.
Return ONLY valid JSON.
"""
    
    messages = [SystemMessage(content=system_text)]
    
    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        return {"success": True, "analysis": clean_json(res.content)}
    except Exception as e:
        print(f"[DEBUG] Analysis error: {e}")
        return {"success": False, "error": str(e)}
