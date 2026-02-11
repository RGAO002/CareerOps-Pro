"""
Job Matcher Service - Match resume to job opportunities
"""
import json
import re
import requests
from bs4 import BeautifulSoup
from langchain_core.messages import SystemMessage
from services.llm import get_llm, clean_json


def fetch_jd_from_url(url):
    """Fetch job description content from a URL."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove script and style elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()
        
        # Try to find main content area (common job site patterns)
        main_content = None
        
        # Common job posting containers
        selectors = [
            'article', 
            '[class*="job-description"]',
            '[class*="jobDescription"]',
            '[class*="job_description"]',
            '[class*="description"]',
            '[id*="job-description"]',
            '[id*="jobDescription"]',
            'main',
            '.content',
            '#content'
        ]
        
        for selector in selectors:
            main_content = soup.select_one(selector)
            if main_content and len(main_content.get_text(strip=True)) > 200:
                break
        
        if main_content:
            text = main_content.get_text(separator='\n', strip=True)
        else:
            # Fallback: get body text
            text = soup.get_text(separator='\n', strip=True)
        
        # Clean up excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        
        # Limit text length to avoid token limits
        if len(text) > 8000:
            text = text[:8000] + "..."
        
        return {"success": True, "content": text}
        
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timed out. Please try pasting the JD text directly."}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Failed to fetch URL: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Error processing URL: {str(e)}"}


def parse_custom_jd(jd_input, resume_data, model_choice, api_key):
    """
    Parse a custom JD (from URL or text) and return a structured job object
    with match analysis against the provided resume.
    """
    llm = get_llm(model_choice, api_key)
    
    # Check if input is a URL
    jd_text = jd_input.strip()
    is_url = jd_text.startswith('http://') or jd_text.startswith('https://')
    
    if is_url:
        fetch_result = fetch_jd_from_url(jd_text)
        if not fetch_result["success"]:
            return {"success": False, "error": fetch_result["error"]}
        jd_text = fetch_result["content"]
    
    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)
    
    system_text = f"""You are an expert career advisor. Your task is to:
1. Parse the job description and extract structured information
2. Analyze how well the candidate's resume matches this job

JOB DESCRIPTION TEXT:
{jd_text}

CANDIDATE'S RESUME:
{resume_json}

Return a JSON object with the following structure:
{{
    "id": "custom_1",
    "title": "<Job Title>",
    "company": "<Company Name or 'Unknown Company' if not found>",
    "location": "<Location or 'Not specified'>",
    "salary": "<Salary range or 'Not specified'>",
    "description": "<Brief 1-2 sentence summary of the role>",
    "requirements": ["Requirement 1", "Requirement 2", "..."],
    "type": "<Full-time/Part-time/Contract/Not specified>",
    "category": "<Engineering/Marketing/Finance/Healthcare/Design/Business/Sales/HR/Other>",
    "match_score": <0-100 based on how well resume matches>,
    "match_reasons": ["Why candidate is a good fit 1", "Why 2", "Why 3"],
    "gaps": ["Gap or missing qualification 1", "Gap 2"],
    "tailoring_tips": ["Specific tip to improve resume for this job 1", "Tip 2", "Tip 3"]
}}

EXTRACTION GUIDELINES:
- Extract the job title WITHOUT the company name (e.g., "Software Engineer", not "Software Engineer @ Suno")
- Identify company name separately from the JD
- List 5-8 key requirements/qualifications
- Be specific in match_reasons (reference actual skills/experience from resume)
- Be specific in gaps (what's required but missing from resume)
- Provide actionable tailoring_tips (how to modify resume for this specific job)

MATCHING CRITERIA:
- Skills match: Technical and soft skills alignment
- Experience level: Years and type of experience
- Domain knowledge: Industry relevance
- Keywords: Important terms from JD that should be in resume

Return ONLY valid JSON.
"""
    
    messages = [SystemMessage(content=system_text)]
    
    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        result = clean_json(res.content)
        
        # Ensure all required fields exist
        required_fields = {
            "id": "custom_1",
            "title": "Unknown Position",
            "company": "Unknown Company",
            "location": "Not specified",
            "salary": "Not specified",
            "description": "",
            "requirements": [],
            "type": "Full-time",
            "category": "Other",
            "match_score": 50,
            "match_reasons": [],
            "gaps": [],
            "tailoring_tips": []
        }
        
        for field, default in required_fields.items():
            if field not in result:
                result[field] = default
        
        return {"success": True, "job": result}
        
    except Exception as e:
        print(f"[DEBUG] Custom JD parsing error: {e}")
        return {"success": False, "error": f"Failed to parse JD: {str(e)}"}


# Sample job database (can be replaced with API in production)
SAMPLE_JOBS = [
    # === Engineering / Tech ===
    {
        "id": "1",
        "title": "Senior Software Engineer",
        "company": "TechCorp Inc.",
        "location": "New York, NY (Hybrid)",
        "salary": "$150,000 - $200,000",
        "description": "Looking for an experienced software engineer to build scalable backend systems using Python, AWS, and microservices architecture.",
        "requirements": ["5+ years Python", "AWS", "Microservices", "SQL", "Docker"],
        "type": "Full-time",
        "category": "Engineering"
    },
    {
        "id": "2", 
        "title": "Data Scientist",
        "company": "AI Innovations",
        "location": "San Francisco, CA (Remote)",
        "salary": "$140,000 - $180,000",
        "description": "Join our ML team to build predictive models and data pipelines for our recommendation engine.",
        "requirements": ["Python", "TensorFlow/PyTorch", "SQL", "Statistics", "3+ years experience"],
        "type": "Full-time",
        "category": "Data Science"
    },
    {
        "id": "3",
        "title": "Full Stack Developer",
        "company": "StartupX",
        "location": "Austin, TX (On-site)",
        "salary": "$120,000 - $160,000",
        "description": "Build end-to-end features for our SaaS platform using React and Node.js.",
        "requirements": ["React", "Node.js", "PostgreSQL", "TypeScript", "2+ years experience"],
        "type": "Full-time",
        "category": "Engineering"
    },
    
    # === Marketing ===
    {
        "id": "4",
        "title": "Marketing Manager",
        "company": "BrandBoost Agency",
        "location": "Los Angeles, CA (Hybrid)",
        "salary": "$90,000 - $130,000",
        "description": "Lead marketing campaigns across digital channels, manage brand strategy, and drive customer acquisition for Fortune 500 clients.",
        "requirements": ["5+ years marketing experience", "Digital marketing", "Brand management", "Analytics", "Team leadership"],
        "type": "Full-time",
        "category": "Marketing"
    },
    {
        "id": "5",
        "title": "Digital Marketing Specialist",
        "company": "GrowthLab",
        "location": "Miami, FL (Remote)",
        "salary": "$65,000 - $85,000",
        "description": "Execute SEO, SEM, and social media campaigns. Analyze performance metrics and optimize conversion funnels.",
        "requirements": ["Google Ads", "SEO/SEM", "Social media marketing", "Google Analytics", "2+ years experience"],
        "type": "Full-time",
        "category": "Marketing"
    },
    {
        "id": "6",
        "title": "Content Marketing Manager",
        "company": "ContentFirst Media",
        "location": "New York, NY (Hybrid)",
        "salary": "$80,000 - $110,000",
        "description": "Develop content strategy, manage editorial calendar, and create compelling content that drives engagement and leads.",
        "requirements": ["Content strategy", "Copywriting", "SEO", "CMS platforms", "3+ years experience"],
        "type": "Full-time",
        "category": "Marketing"
    },
    
    # === Finance ===
    {
        "id": "7",
        "title": "Financial Analyst",
        "company": "Goldman Sachs",
        "location": "New York, NY (On-site)",
        "salary": "$100,000 - $140,000",
        "description": "Conduct financial modeling, valuation analysis, and support M&A transactions for institutional clients.",
        "requirements": ["Financial modeling", "Excel/VBA", "Valuation", "CFA preferred", "2+ years experience"],
        "type": "Full-time",
        "category": "Finance"
    },
    {
        "id": "8",
        "title": "Investment Banking Associate",
        "company": "Morgan Stanley",
        "location": "New York, NY (On-site)",
        "salary": "$150,000 - $200,000",
        "description": "Support deal execution, prepare pitch materials, and conduct due diligence for M&A and capital markets transactions.",
        "requirements": ["Investment banking experience", "Financial modeling", "PowerPoint", "Strong analytical skills", "MBA preferred"],
        "type": "Full-time",
        "category": "Finance"
    },
    {
        "id": "9",
        "title": "Corporate Accountant",
        "company": "Deloitte",
        "location": "Chicago, IL (Hybrid)",
        "salary": "$70,000 - $95,000",
        "description": "Manage financial reporting, reconciliations, and support audit processes for enterprise clients.",
        "requirements": ["CPA", "GAAP knowledge", "SAP/Oracle", "Excel", "2+ years experience"],
        "type": "Full-time",
        "category": "Finance"
    },
    
    # === Healthcare ===
    {
        "id": "10",
        "title": "Healthcare Administrator",
        "company": "Mayo Clinic",
        "location": "Rochester, MN (On-site)",
        "salary": "$85,000 - $120,000",
        "description": "Oversee hospital operations, manage staff scheduling, and ensure compliance with healthcare regulations.",
        "requirements": ["Healthcare administration", "HIPAA compliance", "Staff management", "Budget management", "MHA preferred"],
        "type": "Full-time",
        "category": "Healthcare"
    },
    {
        "id": "11",
        "title": "Clinical Research Coordinator",
        "company": "Pfizer",
        "location": "Boston, MA (On-site)",
        "salary": "$65,000 - $85,000",
        "description": "Coordinate clinical trials, manage patient recruitment, and ensure regulatory compliance for pharmaceutical studies.",
        "requirements": ["Clinical research experience", "FDA regulations", "GCP certification", "Patient coordination", "2+ years experience"],
        "type": "Full-time",
        "category": "Healthcare"
    },
    
    # === Design / Creative ===
    {
        "id": "12",
        "title": "Senior UX Designer",
        "company": "Airbnb",
        "location": "San Francisco, CA (Hybrid)",
        "salary": "$140,000 - $180,000",
        "description": "Design intuitive user experiences for our global platform. Lead user research, create wireframes, and collaborate with engineering.",
        "requirements": ["Figma/Sketch", "User research", "Prototyping", "Design systems", "5+ years experience"],
        "type": "Full-time",
        "category": "Design"
    },
    {
        "id": "13",
        "title": "Graphic Designer",
        "company": "Creative Studios",
        "location": "Portland, OR (Remote)",
        "salary": "$55,000 - $75,000",
        "description": "Create visual assets for brand campaigns, social media, and marketing materials across print and digital.",
        "requirements": ["Adobe Creative Suite", "Typography", "Brand design", "Motion graphics", "2+ years experience"],
        "type": "Full-time",
        "category": "Design"
    },
    
    # === Business / Operations ===
    {
        "id": "14",
        "title": "Business Analyst",
        "company": "McKinsey & Company",
        "location": "Boston, MA (Hybrid)",
        "salary": "$95,000 - $130,000",
        "description": "Analyze business processes, gather requirements, and develop data-driven recommendations for Fortune 500 clients.",
        "requirements": ["Business analysis", "SQL", "Data visualization", "Stakeholder management", "3+ years experience"],
        "type": "Full-time",
        "category": "Business"
    },
    {
        "id": "15",
        "title": "Project Manager",
        "company": "Amazon",
        "location": "Seattle, WA (Hybrid)",
        "salary": "$110,000 - $150,000",
        "description": "Lead cross-functional teams to deliver complex projects on time and within budget. Drive process improvements.",
        "requirements": ["PMP certification", "Agile/Scrum", "Stakeholder management", "Risk management", "5+ years experience"],
        "type": "Full-time",
        "category": "Business"
    },
    {
        "id": "16",
        "title": "Operations Manager",
        "company": "FedEx",
        "location": "Memphis, TN (On-site)",
        "salary": "$80,000 - $110,000",
        "description": "Oversee daily operations, optimize logistics processes, and manage a team of 50+ employees.",
        "requirements": ["Operations management", "Logistics", "Team leadership", "Process improvement", "3+ years experience"],
        "type": "Full-time",
        "category": "Operations"
    },
    
    # === Human Resources ===
    {
        "id": "17",
        "title": "HR Business Partner",
        "company": "Google",
        "location": "Mountain View, CA (Hybrid)",
        "salary": "$120,000 - $160,000",
        "description": "Partner with business leaders on talent strategy, employee relations, and organizational development initiatives.",
        "requirements": ["HR experience", "Employee relations", "Talent management", "HRIS systems", "5+ years experience"],
        "type": "Full-time",
        "category": "Human Resources"
    },
    {
        "id": "18",
        "title": "Talent Acquisition Specialist",
        "company": "LinkedIn",
        "location": "San Francisco, CA (Remote)",
        "salary": "$75,000 - $100,000",
        "description": "Source, screen, and hire top talent. Manage full-cycle recruiting for technical and non-technical roles.",
        "requirements": ["Recruiting experience", "ATS systems", "Sourcing", "Interviewing", "2+ years experience"],
        "type": "Full-time",
        "category": "Human Resources"
    },
    
    # === Sales ===
    {
        "id": "19",
        "title": "Account Executive",
        "company": "Salesforce",
        "location": "San Francisco, CA (Hybrid)",
        "salary": "$80,000 - $150,000 + Commission",
        "description": "Drive new business sales for enterprise SaaS solutions. Manage full sales cycle from prospecting to close.",
        "requirements": ["B2B sales", "CRM software", "Negotiation", "Presentation skills", "3+ years experience"],
        "type": "Full-time",
        "category": "Sales"
    },
    {
        "id": "20",
        "title": "Sales Development Representative",
        "company": "HubSpot",
        "location": "Boston, MA (Remote)",
        "salary": "$50,000 - $70,000 + Commission",
        "description": "Generate qualified leads through outbound prospecting. Set meetings for Account Executives.",
        "requirements": ["Sales experience", "Cold calling", "Email outreach", "CRM tools", "1+ years experience"],
        "type": "Full-time",
        "category": "Sales"
    }
]


def match_jobs(resume_data, model_choice, api_key, jobs=None):
    """Match resume to best-fit job opportunities."""
    if jobs is None:
        jobs = SAMPLE_JOBS
    
    llm = get_llm(model_choice, api_key)
    
    resume_json = json.dumps(resume_data, ensure_ascii=False, indent=2)
    jobs_json = json.dumps(jobs, ensure_ascii=False, indent=2)
    
    system_text = f"""You are a career advisor matching candidates to job opportunities.

CANDIDATE RESUME:
{resume_json}

AVAILABLE JOBS:
{jobs_json}

Analyze the candidate's skills, experience, and background, then rank the jobs by fit.

Return JSON in this format:
{{
    "matches": [
        {{
            "job_id": "1",
            "match_score": <0-100>,
            "match_reasons": ["Reason 1", "Reason 2"],
            "gaps": ["Gap 1", "Gap 2"],
            "tailoring_tips": ["Tip 1 to improve resume for this job", "Tip 2"]
        }}
    ],
    "candidate_summary": "Brief summary of candidate's strongest qualifications",
    "recommended_focus": "What type of role the candidate should focus on"
}}

RANKING CRITERIA:
- Skills match: Do they have the required skills?
- Experience level: Does their experience match the requirements?
- Domain knowledge: Any relevant industry experience?
- Growth potential: Can they grow into the role?

Order matches from best to worst fit. Include all jobs in the ranking.
Return ONLY valid JSON.
"""
    
    messages = [SystemMessage(content=system_text)]
    
    try:
        res = llm.invoke(messages, response_format={"type": "json_object"})
        result = clean_json(res.content)
        
        matched_jobs = []
        for match in result.get("matches", []):
            job_id = match.get("job_id")
            job_info = next((j for j in jobs if j["id"] == job_id), None)
            if job_info:
                matched_jobs.append({
                    **job_info,
                    "match_score": match.get("match_score", 0),
                    "match_reasons": match.get("match_reasons", []),
                    "gaps": match.get("gaps", []),
                    "tailoring_tips": match.get("tailoring_tips", [])
                })
        
        return {
            "success": True,
            "matches": matched_jobs,
            "candidate_summary": result.get("candidate_summary", ""),
            "recommended_focus": result.get("recommended_focus", "")
        }
    except Exception as e:
        print(f"[DEBUG] Job matching error: {e}")
        return {"success": False, "error": str(e)}

