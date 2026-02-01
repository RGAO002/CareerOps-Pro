"""
Resume Parser Service - Extract structured data from PDF
Supports: Text-based PDF + Scanned PDF (OCR via GPT-4 Vision)
"""
import json
import base64
import re
from langchain_core.messages import SystemMessage
from services.llm import get_llm, clean_json


RESUME_SCHEMA = """
{
    "name": "Full Name",
    "role": "Job Title / Headline",
    "contact": ["email@example.com", "(123) 456-7890", "github.com/username", "linkedin.com/in/username"],
    "skills": {
        "Category Name 1": "Skill items as comma-separated string",
        "Category Name 2": "More skills..."
    },
    "summary": "Full profile summary paragraph - copy EXACTLY as written",
    "experience": [
        {
            "company": "Company Name",
            "role": "Job Title",
            "date": "Start Date – End Date",
            "bullets": ["Bullet point 1", "Bullet point 2"]
        }
    ],
    "projects": [
        {
            "name": "Project Name",
            "tech": "Tech stack used",
            "link": "https://github.com/... or demo URL",
            "bullets": ["Bullet point 1", "Bullet point 2"]
        }
    ],
    "education": [
        {
            "school": "University Name",
            "degree": "Degree Type, Major",
            "date": "Start - End Date",
            "gpa": "GPA if mentioned",
            "coursework": ["Course 1", "Course 2"],
            "note": "Any additional notes"
        }
    ]
}
"""


def parse_resume(raw_text, model_choice, api_key):
    """Parse resume text into structured JSON."""
    llm = get_llm(model_choice, api_key)
    
    text_to_parse = raw_text.strip()
    
    system_text = f"""You are an expert resume parser. Extract information from this resume into structured JSON.

RESUME TEXT:
{text_to_parse}

CRITICAL CLASSIFICATION RULES:

1. **CONTACT** - ONLY these 4 items belong in contact array:
   - Email address (contains @)
   - Phone number (digits with dashes/parentheses)
   - GitHub profile URL (github.com/username) - NOT project repo links
   - LinkedIn URL or Personal website/blog URL
   
   DO NOT put project links (like "GitHub Repo", "Live Demo", "mooc.global") in contact!

2. **PROJECTS** - Each project should have:
   - name: The project title
   - tech: Technology stack (if mentioned)
   - link: The project's GitHub repo URL or demo URL (NOT the person's GitHub profile)
   - bullets: Description bullet points

3. **EXPERIENCE** - Each job should have:
   - company: Company name OR "Independent/Freelance" for freelance work
   - role: Job title
   - date: Employment period
   - bullets: ALL bullet points for that job, copied exactly

4. **SKILLS** - Group by category as shown in the resume

5. **EDUCATION** - Include:
   - All coursework/courses listed
   - GPA if mentioned
   - Any notes

OUTPUT FORMAT:
{RESUME_SCHEMA}

IMPORTANT:
- Copy all text EXACTLY as written
- Include ALL bullet points
- Return ONLY valid JSON
"""
    
    messages = [SystemMessage(content=system_text)]
    
    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        return {"success": True, "data": clean_json(res.content)}
    except Exception as e:
        print(f"[DEBUG] Parse error: {e}")
        return {"success": False, "error": str(e)}


def extract_pdf_links(pdf_bytes):
    """Extract all hyperlinks from PDF using PyMuPDF."""
    try:
        import fitz
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        links = []
        
        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]
            for link in page.get_links():
                if link.get("uri"):
                    # Get the text near this link
                    rect = link.get("from")
                    if rect:
                        # Get text in the link area
                        text = page.get_text("text", clip=rect).strip()
                        links.append({
                            "text": text,
                            "url": link["uri"]
                        })
        
        pdf_doc.close()
        return links
    except Exception as e:
        print(f"[DEBUG] Link extraction error: {e}")
        return []


def merge_pdf_links(result_data, pdf_links):
    """Merge extracted PDF links into the parsed result.
    
    Format: Uses markdown-style links [text](url) for items with hyperlinks.
    Avoids duplicates by tracking seen URLs and display texts.
    """
    if not pdf_links:
        return result_data
    
    contact = result_data.get("contact", [])
    
    # Create a mapping of URL to display text from PDF links
    url_to_text = {}
    for link in pdf_links:
        text = link.get("text", "").strip()
        url = link.get("url", "")
        if url:
            url_to_text[url.lower().rstrip("/")] = text if text else url
    
    # Track what we've seen to avoid duplicates
    seen_urls = set()
    seen_display_texts = set()
    updated_contact = []
    
    for item in contact:
        item_str = str(item).strip()
        if not item_str:
            continue
        
        # Extract URL if present
        url_match = re.search(r'(https?://[^\s\)\]]+)', item_str)
        url = url_match.group(1).rstrip("/") if url_match else None
        
        # Extract display text (clean version without URLs)
        display = item_str
        display = re.sub(r'\s*\((?:https?://|mailto:)[^)]+\)', '', display)  # Remove (url) or (mailto:)
        display = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', display)  # Extract text from [text](url)
        display = re.sub(r'https?://\S+', '', display)  # Remove standalone URLs
        display = display.strip()
        
        # Skip if we've already seen this display text (avoid duplicates)
        display_lower = display.lower()
        if display_lower in seen_display_texts:
            continue
        
        # Skip if we've already seen this URL
        if url and url.lower() in seen_urls:
            continue
        
        # If we have a URL, mark it as seen
        if url:
            seen_urls.add(url.lower())
        
        # Mark display text as seen
        if display:
            seen_display_texts.add(display_lower)
        
        # Format the contact item
        if url:
            if not display:
                display = url_to_text.get(url.lower(), url.replace("https://", "").replace("http://", ""))
            updated_contact.append(f"[{display}]({url})")
        elif display:
            # Check if we have a PDF link for this text
            matched_url = None
            for pdf_url, pdf_text in url_to_text.items():
                if pdf_text.lower() == display_lower or display_lower in pdf_text.lower() or pdf_text.lower() in display_lower:
                    if pdf_url not in seen_urls:
                        matched_url = pdf_url
                        break
            
            if matched_url:
                updated_contact.append(f"[{display}]({matched_url})")
                seen_urls.add(matched_url)
            else:
                updated_contact.append(display)
    
    # Don't add remaining PDF links - they likely cause duplicates
    # The Vision model should have captured all contact info
    
    result_data["contact"] = updated_contact
    return result_data


def parse_resume_from_image(pdf_bytes, api_key):
    """Use GPT-4 Vision to extract resume from scanned PDF."""
    try:
        import fitz  # PyMuPDF
        
        # First, extract hyperlinks from PDF
        pdf_links = extract_pdf_links(pdf_bytes)
        links_info = ""
        if pdf_links:
            links_info = "\n\nHYPERLINKS FOUND IN PDF (use these exact URLs):\n"
            for link in pdf_links:
                links_info += f"- '{link['text']}' links to: {link['url']}\n"
        
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

CRITICAL INSTRUCTIONS:
- Extract EVERY bullet point completely - do not summarize or paraphrase
- Copy text EXACTLY as written, preserving all details
- Include ALL contact information (email, phone, links)
- Capture ALL skills mentioned with their categories
- Extract complete work experience with dates and ALL bullets

FORMATTING:
- For bullet points, preserve emphasis using **bold** for key terms/metrics
- Example: "Increased revenue by **40%** through **ML-driven** recommendations"
- Keep project links in the "link" field, not mixed with name

CONTACT LINKS:
- For contact items that have hyperlinks, include the full URL
- Format as "text (url)" or just the URL if it's self-explanatory
{links_info}

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
            model="gpt-5.2",
            messages=[{"role": "user", "content": content}],
            max_completion_tokens=4096,
            response_format={"type": "json_object"}
        )
        
        result_text = response.choices[0].message.content
        result_data = json.loads(result_text)
        
        # Post-process: ensure PDF links are included in contact
        result_data = merge_pdf_links(result_data, pdf_links)
        
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
