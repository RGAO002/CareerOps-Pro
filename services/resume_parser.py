"""
Resume Parser Service - Extract structured data from PDF
Supports: Text-based PDF + Scanned PDF (OCR via GPT-4 Vision)
"""
import json
import base64
from langchain_core.messages import SystemMessage
from services.llm import get_llm, clean_json


RESUME_SCHEMA = """
{
    "name": "Full Name",
    "role": "Job Title",
    "contact": ["Email", "Phone", "Link"],
    "skills": { "Category": "Items..." },
    "summary": "Full text summary...",
    "experience": [ { "company": "Name", "role": "Title", "date": "Date", "bullets": ["Detail 1"] } ],
    "projects": [ { "name": "Project Name", "tech": "Stack", "bullets": ["Detail"] } ],
    "education": [ { "school": "Name", "degree": "Degree", "date": "Date" } ]
}
"""


def parse_resume(raw_text, model_choice, api_key):
    """Parse resume text into structured JSON."""
    llm = get_llm(model_choice, api_key)
    
    system_text = f"""
    Task: Extract ALL resume data from raw text into JSON.
    Raw Text: {raw_text[:6000]}...
    
    CRITICAL: Extract Projects if present.
    Schema: {RESUME_SCHEMA}
    Rule: Return ONLY valid JSON.
    """
    
    messages = [SystemMessage(content=system_text)]
    
    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        return {"success": True, "data": clean_json(res.content)}
    except Exception as e:
        print(f"[DEBUG] Parse error: {e}")
        return {"success": False, "error": str(e)}


def parse_resume_from_image(pdf_bytes, api_key):
    """Use GPT-4 Vision to extract resume from scanned PDF."""
    try:
        import fitz  # PyMuPDF
        
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images_base64 = []
        
        for page_num in range(min(len(pdf_doc), 3)):
            page = pdf_doc[page_num]
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            images_base64.append(img_base64)
        
        pdf_doc.close()
        
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        content = [
            {
                "type": "text",
                "text": f"""You are a resume parser. Analyze this resume image and extract ALL information into structured JSON.

IMPORTANT:
- Extract EVERY bullet point completely - do not summarize
- Include ALL contact information (email, phone, links)
- Capture ALL skills mentioned
- Extract complete work experience with dates and bullets

Return JSON in this exact schema:
{RESUME_SCHEMA}

Return ONLY valid JSON, no other text."""
            }
        ]
        
        for img_b64 in images_base64:
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img_b64}",
                    "detail": "high"
                }
            })
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": content}],
            max_tokens=4096,
            response_format={"type": "json_object"}
        )
        
        result_text = response.choices[0].message.content
        result_data = json.loads(result_text)
        raw_text = extract_text_from_ocr_result(result_data)
        
        return {
            "success": True, 
            "data": result_data, 
            "raw_text": raw_text,
            "method": "vision_ocr"
        }
        
    except Exception as e:
        print(f"[DEBUG] Vision OCR error: {e}")
        return {"success": False, "error": str(e)}


def extract_text_from_ocr_result(data):
    """Reconstruct text from parsed data for reference."""
    lines = []
    
    if data.get("name"):
        lines.append(data["name"])
    if data.get("role"):
        lines.append(data["role"])
    if data.get("contact"):
        lines.extend(data["contact"])
    if data.get("summary"):
        lines.append(data["summary"])
    
    for exp in data.get("experience", []):
        lines.append(f"{exp.get('company', '')} - {exp.get('role', '')} ({exp.get('date', '')})")
        for bullet in exp.get("bullets", []):
            lines.append(f"• {bullet}")
    
    for proj in data.get("projects", []):
        lines.append(f"{proj.get('name', '')} ({proj.get('tech', '')})")
        for bullet in proj.get("bullets", []):
            lines.append(f"• {bullet}")
    
    for edu in data.get("education", []):
        lines.append(f"{edu.get('school', '')} - {edu.get('degree', '')} ({edu.get('date', '')})")
    
    return "\n".join(lines)


def is_scanned_pdf(raw_text):
    """Check if PDF is scanned (image-based) by analyzing extracted text."""
    if not raw_text:
        return True
    
    cleaned = raw_text.strip()
    
    if len(cleaned) < 100:
        return True
    
    words = cleaned.split()
    if len(words) < 20:
        return True
    
    return False
