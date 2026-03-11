"""
Keyword Profile Service — Extract, normalize, aggregate, and cache
skill keywords from tracked job requirements.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

from langchain_core.messages import SystemMessage
from services.llm import get_llm, clean_json

SESSIONS_DIR = Path(__file__).parent.parent / "saved_sessions"
KEYWORD_CACHE_FILE = SESSIONS_DIR / "keyword_cache.json"

# ── Skill aliases: map common variants → canonical name ──────
SKILL_ALIASES = {
    # --- Programming & Engineering ---
    "nodejs": "Node.js", "node": "Node.js", "node.js": "Node.js",
    "reactjs": "React", "react.js": "React", "react": "React",
    "nextjs": "Next.js", "next.js": "Next.js",
    "vuejs": "Vue.js", "vue.js": "Vue.js", "vue": "Vue.js",
    "angular": "Angular", "angularjs": "Angular",
    "svelte": "Svelte",
    "typescript": "TypeScript", "ts": "TypeScript",
    "javascript": "JavaScript", "js": "JavaScript",
    "python": "Python", "python3": "Python", "py": "Python",
    "java": "Java",
    "golang": "Go", "go": "Go",
    "rust": "Rust",
    "c#": "C#", "csharp": "C#",
    "c++": "C++", "cpp": "C++",
    "ruby": "Ruby",
    "php": "PHP",
    "swift": "Swift",
    "kotlin": "Kotlin",
    "postgres": "PostgreSQL", "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongo": "MongoDB", "mongodb": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "dynamodb": "DynamoDB",
    "sql": "SQL",
    "nosql": "NoSQL",
    "graphql": "GraphQL",
    "rest": "REST APIs", "rest api": "REST APIs", "rest apis": "REST APIs",
    "restful": "REST APIs", "restful apis": "REST APIs", "restful api": "REST APIs",
    "aws": "AWS", "amazon web services": "AWS",
    "gcp": "GCP", "google cloud": "GCP", "google cloud platform": "GCP",
    "azure": "Azure", "microsoft azure": "Azure",
    "docker": "Docker",
    "k8s": "Kubernetes", "kubernetes": "Kubernetes",
    "terraform": "Terraform", "tf": "Terraform",
    "ci/cd": "CI/CD", "cicd": "CI/CD",
    "jenkins": "Jenkins",
    "github actions": "GitHub Actions",
    "linux": "Linux",
    "nginx": "Nginx",
    "ml": "Machine Learning", "machine learning": "Machine Learning",
    "ai": "AI", "artificial intelligence": "AI",
    "deep learning": "Deep Learning", "dl": "Deep Learning",
    "nlp": "NLP", "natural language processing": "NLP",
    "computer vision": "Computer Vision", "cv": "Computer Vision",
    "tensorflow": "TensorFlow", "tf": "TensorFlow",
    "pytorch": "PyTorch",
    "langchain": "LangChain",
    "llm": "LLM",
    "rag": "RAG",
    "pandas": "Pandas",
    "spark": "Apache Spark", "apache spark": "Apache Spark",
    "kafka": "Kafka", "apache kafka": "Kafka",
    "rabbitmq": "RabbitMQ",
    "express": "Express.js", "expressjs": "Express.js", "express.js": "Express.js",
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "spring": "Spring Boot", "spring boot": "Spring Boot",
    "tailwind": "Tailwind CSS", "tailwindcss": "Tailwind CSS",
    "sass": "Sass", "scss": "Sass",
    "webpack": "Webpack",
    "vite": "Vite",
    "redux": "Redux",
    "figma": "Figma",
    "git": "Git",
    "agile": "Agile",
    "scrum": "Scrum",
    "jira": "Jira",
    "s3": "AWS S3",
    "ec2": "AWS EC2",
    "lambda": "AWS Lambda",
    "serverless": "Serverless",
    "microservices": "Microservices",
    "monorepo": "Monorepo",
    "drizzle": "Drizzle", "drizzle orm": "Drizzle",
    "trpc": "tRPC", "trpc": "tRPC",
    "prisma": "Prisma", "prisma orm": "Prisma",
    "supabase": "Supabase",
    "vercel": "Vercel",
    "netlify": "Netlify",
    "remix": "Remix",
    "astro": "Astro",
    "nuxt": "Nuxt.js", "nuxtjs": "Nuxt.js", "nuxt.js": "Nuxt.js",
    "storybook": "Storybook",
    "playwright": "Playwright",
    "cypress": "Cypress",
    "jest": "Jest",
    "vitest": "Vitest",
    # --- Business & Strategy ---
    "strategy": "Strategy", "strategic planning": "Strategy",
    "business development": "Business Development", "biz dev": "Business Development",
    "p&l": "P&L Management", "p&l management": "P&L Management",
    "revenue growth": "Revenue Growth",
    "market analysis": "Market Analysis", "market research": "Market Analysis",
    "competitive analysis": "Competitive Analysis",
    "business intelligence": "Business Intelligence", "bi": "Business Intelligence",
    "okr": "OKR", "okrs": "OKR",
    "kpi": "KPI", "kpis": "KPI",
    "go-to-market": "Go-to-Market", "gtm": "Go-to-Market",
    "roi": "ROI",
    "due diligence": "Due Diligence",
    # --- Finance & Accounting ---
    "financial modeling": "Financial Modeling",
    "forecasting": "Forecasting", "financial forecasting": "Forecasting",
    "budgeting": "Budgeting",
    "gaap": "GAAP",
    "ifrs": "IFRS",
    "valuation": "Valuation",
    "m&a": "M&A", "mergers and acquisitions": "M&A",
    "excel": "Excel", "microsoft excel": "Excel",
    "quickbooks": "QuickBooks",
    "sap": "SAP",
    "bloomberg": "Bloomberg Terminal",
    # --- Marketing & Growth ---
    "seo": "SEO", "search engine optimization": "SEO",
    "sem": "SEM", "search engine marketing": "SEM",
    "ppc": "PPC", "pay per click": "PPC",
    "content marketing": "Content Marketing",
    "social media marketing": "Social Media Marketing", "smm": "Social Media Marketing",
    "email marketing": "Email Marketing",
    "google analytics": "Google Analytics", "ga4": "Google Analytics",
    "google ads": "Google Ads", "adwords": "Google Ads",
    "facebook ads": "Facebook Ads", "meta ads": "Facebook Ads",
    "hubspot": "HubSpot",
    "marketo": "Marketo",
    "salesforce": "Salesforce",
    "crm": "CRM",
    "a/b testing": "A/B Testing", "ab testing": "A/B Testing",
    "conversion optimization": "Conversion Optimization", "cro": "Conversion Optimization",
    "brand management": "Brand Management", "branding": "Brand Management",
    "copywriting": "Copywriting",
    "content strategy": "Content Strategy",
    # --- Product & Design ---
    "product management": "Product Management",
    "product strategy": "Product Strategy",
    "user research": "User Research",
    "ux design": "UX Design", "ux": "UX Design",
    "ui design": "UI Design", "ui": "UI Design",
    "ui/ux": "UI/UX Design",
    "wireframing": "Wireframing",
    "prototyping": "Prototyping",
    "sketch": "Sketch",
    "adobe xd": "Adobe XD",
    "invision": "InVision",
    "design thinking": "Design Thinking",
    "user testing": "User Testing", "usability testing": "User Testing",
    # --- Data & Analytics (non-ML) ---
    "tableau": "Tableau",
    "power bi": "Power BI", "powerbi": "Power BI",
    "looker": "Looker",
    "data visualization": "Data Visualization",
    "data analysis": "Data Analysis",
    "r": "R",
    "spss": "SPSS",
    "stata": "Stata",
    "etl": "ETL",
    "data warehousing": "Data Warehousing",
    "snowflake": "Snowflake",
    "redshift": "Redshift",
    "bigquery": "BigQuery",
    "dbt": "dbt",
    # --- Operations & Supply Chain ---
    "supply chain": "Supply Chain Management",
    "logistics": "Logistics",
    "procurement": "Procurement",
    "lean": "Lean", "lean six sigma": "Lean Six Sigma",
    "six sigma": "Six Sigma",
    "erp": "ERP",
    "inventory management": "Inventory Management",
    # --- HR & People ---
    "talent acquisition": "Talent Acquisition", "recruiting": "Talent Acquisition",
    "employee engagement": "Employee Engagement",
    "performance management": "Performance Management",
    "compensation": "Compensation & Benefits",
    "dei": "DEI", "diversity and inclusion": "DEI",
    "hris": "HRIS",
    "workday": "Workday",
    # --- Legal & Compliance ---
    "contract negotiation": "Contract Negotiation",
    "compliance": "Compliance",
    "regulatory": "Regulatory Affairs",
    "gdpr": "GDPR",
    "sox": "SOX",
    "risk management": "Risk Management",
    # --- Sales ---
    "account management": "Account Management",
    "lead generation": "Lead Generation",
    "pipeline management": "Pipeline Management",
    "negotiation": "Negotiation",
    "cold calling": "Cold Calling",
    "consultative selling": "Consultative Selling",
    "b2b": "B2B Sales", "b2b sales": "B2B Sales",
    "b2c": "B2C Sales", "b2c sales": "B2C Sales",
    # --- Soft Skills (canonical buckets) ---
    # Leadership
    "leadership": "Leadership", "team leadership": "Leadership",
    "people management": "Leadership", "team management": "Leadership",
    "lead teams": "Leadership", "leading teams": "Leadership",
    "executive leadership": "Leadership", "senior leadership": "Leadership",
    "servant leadership": "Leadership",
    # Communication
    "communication": "Communication", "communication skills": "Communication",
    "written communication": "Communication", "verbal communication": "Communication",
    "oral communication": "Communication", "strong communicator": "Communication",
    "excellent communication": "Communication", "effective communication": "Communication",
    "presentation skills": "Communication", "public speaking": "Communication",
    "storytelling": "Communication", "technical writing": "Communication",
    # Collaboration
    "collaboration": "Collaboration", "teamwork": "Collaboration",
    "team player": "Collaboration", "cross-functional": "Collaboration",
    "cross-functional collaboration": "Collaboration",
    "cross-functional teams": "Collaboration",
    "work collaboratively": "Collaboration", "collaborative": "Collaboration",
    "interdepartmental": "Collaboration",
    # Problem Solving
    "problem solving": "Problem Solving", "problem-solving": "Problem Solving",
    "troubleshooting": "Problem Solving", "root cause analysis": "Problem Solving",
    "critical thinking": "Problem Solving", "complex problem solving": "Problem Solving",
    "debugging": "Problem Solving",
    # Analytical Thinking
    "analytical thinking": "Analytical Thinking", "analytical skills": "Analytical Thinking",
    "analytical": "Analytical Thinking", "data-driven": "Analytical Thinking",
    "data driven": "Analytical Thinking", "quantitative analysis": "Analytical Thinking",
    "strategic thinking": "Analytical Thinking",
    # Adaptability
    "adaptability": "Adaptability", "flexibility": "Adaptability",
    "fast-paced": "Adaptability", "fast paced": "Adaptability",
    "fast-paced environment": "Adaptability", "ambiguity": "Adaptability",
    "comfortable with ambiguity": "Adaptability", "resilience": "Adaptability",
    "growth mindset": "Adaptability", "continuous learning": "Adaptability",
    # Initiative
    "initiative": "Initiative", "self-starter": "Initiative",
    "self-motivated": "Initiative", "proactive": "Initiative",
    "ownership": "Initiative", "take ownership": "Initiative",
    "entrepreneurial": "Initiative", "drive": "Initiative",
    "self-directed": "Initiative", "autonomous": "Initiative",
    # Attention to Detail
    "attention to detail": "Attention to Detail", "detail-oriented": "Attention to Detail",
    "detail oriented": "Attention to Detail", "meticulous": "Attention to Detail",
    "thoroughness": "Attention to Detail", "accuracy": "Attention to Detail",
    "quality-focused": "Attention to Detail", "precision": "Attention to Detail",
    # Time Management
    "time management": "Time Management", "prioritization": "Time Management",
    "multitasking": "Time Management", "multi-tasking": "Time Management",
    "deadline-driven": "Time Management", "meet deadlines": "Time Management",
    "organizational skills": "Time Management", "work under pressure": "Time Management",
    # Creativity
    "creativity": "Creativity", "creative thinking": "Creativity",
    "innovation": "Creativity", "innovative": "Creativity",
    "out-of-the-box": "Creativity", "ideation": "Creativity",
    # Mentoring
    "mentoring": "Mentoring", "coaching": "Mentoring", "mentorship": "Mentoring",
    "training": "Mentoring", "knowledge sharing": "Mentoring",
    "talent development": "Mentoring",
    # Stakeholder Management
    "stakeholder management": "Stakeholder Management",
    "stakeholder engagement": "Stakeholder Management",
    "client management": "Stakeholder Management",
    "client-facing": "Stakeholder Management",
    "relationship building": "Stakeholder Management",
    "relationship management": "Stakeholder Management",
    "customer focus": "Stakeholder Management",
    # Conflict Resolution
    "conflict resolution": "Conflict Resolution",
    "dispute resolution": "Conflict Resolution",
    "mediation": "Conflict Resolution",
    # Decision Making
    "decision making": "Decision Making", "decision-making": "Decision Making",
    "sound judgment": "Decision Making", "judgment": "Decision Making",
    # Emotional Intelligence
    "emotional intelligence": "Emotional Intelligence", "eq": "Emotional Intelligence",
    "empathy": "Emotional Intelligence", "interpersonal skills": "Emotional Intelligence",
    "interpersonal": "Emotional Intelligence", "people skills": "Emotional Intelligence",
}

# ── Skill categories ─────────────────────────────────────────
# Categories are intentionally broad to accommodate any job type.
SKILL_CATEGORIES = {
    # --- Engineering ---
    "Languages & Frameworks": {
        "react", "vue.js", "angular", "next.js", "svelte", "html", "css",
        "tailwind css", "sass", "bootstrap", "typescript", "javascript",
        "redux", "webpack", "vite", "remix", "astro", "nuxt.js", "storybook",
        "node.js", "python", "java", "go", "ruby", "c#", ".net", "c++",
        "rust", "php", "swift", "kotlin",
        "express.js", "fastapi", "django", "flask", "spring boot",
        "rest apis", "graphql", "microservices", "r",
        "drizzle", "prisma", "trpc",
        "jest", "vitest", "playwright", "cypress",
    },
    "Cloud & DevOps": {
        "aws", "gcp", "azure", "docker", "kubernetes", "terraform",
        "ci/cd", "jenkins", "github actions", "linux", "nginx",
        "serverless", "aws s3", "aws ec2", "aws lambda",
        "vercel", "netlify", "supabase",
    },
    "Data & AI": {
        "sql", "nosql", "postgresql", "mysql", "mongodb", "redis",
        "elasticsearch", "dynamodb",
        "machine learning", "deep learning", "nlp", "computer vision",
        "tensorflow", "pytorch", "langchain", "llm", "rag",
        "pandas", "apache spark", "kafka", "rabbitmq", "ai",
        "data analysis", "data visualization", "etl", "data warehousing",
        "snowflake", "redshift", "bigquery", "dbt",
        "tableau", "power bi", "looker", "spss", "stata",
    },
    # --- Business ---
    "Business & Strategy": {
        "strategy", "business development", "p&l management",
        "revenue growth", "market analysis", "competitive analysis",
        "business intelligence", "okr", "kpi", "go-to-market", "roi",
        "due diligence", "financial modeling", "forecasting", "budgeting",
        "gaap", "ifrs", "valuation", "m&a", "excel", "quickbooks",
        "sap", "bloomberg terminal",
    },
    "Marketing & Growth": {
        "seo", "sem", "ppc", "content marketing", "social media marketing",
        "email marketing", "google analytics", "google ads", "facebook ads",
        "hubspot", "marketo", "salesforce", "crm", "a/b testing",
        "conversion optimization", "brand management", "copywriting",
        "content strategy",
    },
    "Sales & BD": {
        "account management", "lead generation", "pipeline management",
        "negotiation", "cold calling", "consultative selling",
        "b2b sales", "b2c sales",
    },
    "Product & Design": {
        "product management", "product strategy", "user research",
        "ux design", "ui design", "ui/ux design", "wireframing",
        "prototyping", "figma", "sketch", "adobe xd", "invision",
        "design thinking", "user testing",
    },
    "Operations & HR": {
        "supply chain management", "logistics", "procurement",
        "lean", "lean six sigma", "six sigma", "erp", "inventory management",
        "talent acquisition", "employee engagement", "performance management",
        "compensation & benefits", "dei", "hris", "workday",
        "contract negotiation", "compliance", "regulatory affairs",
        "gdpr", "sox", "risk management",
    },
    # --- Universal ---
    "Soft Skills": {
        "leadership", "communication", "collaboration", "problem solving",
        "analytical thinking", "adaptability", "initiative", "attention to detail",
        "time management", "creativity", "mentoring", "stakeholder management",
        "conflict resolution", "decision making", "emotional intelligence",
    },
    "Tools & Platforms": {
        "git", "jira", "monorepo", "confluence", "notion", "asana",
        "trello", "slack", "microsoft office", "google workspace",
        "agile", "scrum", "project management",
    },
}


def _normalize(skill_text: str) -> str:
    """Normalize a skill string to canonical form."""
    cleaned = skill_text.strip().lower()
    cleaned = re.sub(r"[^\w\s./#+-]", "", cleaned)
    return SKILL_ALIASES.get(cleaned, skill_text.strip())


def _categorize(skill: str) -> str:
    """Determine category for a normalized skill."""
    low = skill.lower()
    for cat, keywords in SKILL_CATEGORIES.items():
        if low in keywords:
            return cat
    return "Other"


# Canonical soft skill names (the 15 buckets)
SOFT_SKILL_NAMES: set[str] = {s.lower() for s in SKILL_CATEGORIES["Soft Skills"]}


def is_soft_skill(skill: str) -> bool:
    """Check if a skill is a soft skill."""
    return skill.lower() in SOFT_SKILL_NAMES


# ── Cache management ─────────────────────────────────────────

def load_keyword_cache() -> dict:
    """Load cache: {job_id: {"keywords": [...], "extracted_at": "..."}}."""
    if KEYWORD_CACHE_FILE.exists():
        try:
            with open(KEYWORD_CACHE_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_keyword_cache(cache: dict):
    SESSIONS_DIR.mkdir(exist_ok=True)
    with open(KEYWORD_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def cache_keywords(job_id: str, keywords: list):
    """Cache extracted keywords for one job."""
    cache = load_keyword_cache()
    cache[job_id] = {
        "keywords": keywords,
        "extracted_at": datetime.now().isoformat(),
    }
    save_keyword_cache(cache)


def update_job_keywords(job_id: str, keywords: list):
    """Replace a job's cached keywords entirely."""
    cache_keywords(job_id, keywords)


def add_keyword_to_job(job_id: str, skill: str, category: str):
    """Append one keyword to a job's cache. Dedup by skill name."""
    cache = load_keyword_cache()
    entry = cache.get(job_id, {"keywords": [], "extracted_at": ""})
    if not any(k["skill"].lower() == skill.lower() for k in entry["keywords"]):
        entry["keywords"].append({"skill": skill, "category": category})
        entry["extracted_at"] = datetime.now().isoformat()
        cache[job_id] = entry
        save_keyword_cache(cache)


def remove_keyword_from_job(job_id: str, skill: str):
    """Remove a keyword from a job's cache by skill name."""
    cache = load_keyword_cache()
    if job_id in cache:
        cache[job_id]["keywords"] = [
            k for k in cache[job_id]["keywords"] if k["skill"] != skill
        ]
        cache[job_id]["extracted_at"] = datetime.now().isoformat()
        save_keyword_cache(cache)


# ── Extraction ───────────────────────────────────────────────

def _merge_keywords(primary: list[dict], secondary: list[dict]) -> list[dict]:
    """Merge two keyword lists, deduplicating by lowercase skill name.

    Primary results take precedence (appear first, keep their category).
    Secondary results fill in anything the primary missed.
    """
    seen: set[str] = set()
    merged = []
    for kw in primary:
        low = kw["skill"].lower()
        if low not in seen:
            seen.add(low)
            merged.append(kw)
    for kw in secondary:
        low = kw["skill"].lower()
        if low not in seen:
            seen.add(low)
            merged.append(kw)
    return merged


def extract_keywords_llm(
    requirements: list[str], model_choice: str, api_key: str
) -> list[dict]:
    """Use LLM to extract structured keywords, then merge with regex results.

    Hybrid approach: LLM catches unknown/new skills, regex catches known
    skills the LLM might miss. Returns list of {"skill": str, "category": str}.
    """
    req_text = "\n".join(f"- {r}" for r in requirements)
    prompt = f"""Extract ALL individual technical skills, tools, frameworks, libraries,
languages, platforms, and professional competencies from these job requirements.

REQUIREMENTS:
{req_text}

Return a JSON object with this format:
{{
  "keywords": [
    {{"skill": "React", "category": "Languages & Frameworks"}},
    {{"skill": "AWS", "category": "Cloud & DevOps"}},
    {{"skill": "Leadership", "category": "Soft Skills"}}
  ]
}}

CATEGORIES (pick one per keyword):
Languages & Frameworks, Cloud & DevOps, Data & AI,
Business & Strategy, Marketing & Growth, Sales & BD,
Product & Design, Operations & HR, Soft Skills, Tools & Platforms, Other

RULES:
- Extract EVERY named tool, framework, library, language, or platform — even
  lesser-known or newer ones (e.g. Drizzle, tRPC, dbt, Remix).
  If it has a proper name, extract it.
- Do NOT include experience-level phrases ("5+ years", "senior-level")
- Do NOT include vague descriptions ("strong engineering culture", "fast paced")
- Normalize names: "NodeJS" → "Node.js", "Postgres" → "PostgreSQL"
- For SOFT SKILLS: only use these canonical names (pick the closest match):
  Leadership, Communication, Collaboration, Problem Solving,
  Analytical Thinking, Adaptability, Initiative, Attention to Detail,
  Time Management, Creativity, Mentoring, Stakeholder Management,
  Conflict Resolution, Decision Making, Emotional Intelligence.
  Do NOT invent new soft skill names — map to the list above.
- Deduplicate — each skill appears only once
- Return ONLY valid JSON"""

    llm = get_llm(model_choice, api_key)
    try:
        res = llm.invoke(
            [SystemMessage(content=prompt)],
            response_format={"type": "json_object"},
        )
        parsed = clean_json(res.content)
        llm_results = parsed.get("keywords", [])
    except Exception:
        llm_results = []

    # Normalize all LLM results through alias map (catches LLM deviations)
    for kw in llm_results:
        kw["skill"] = _normalize(kw["skill"])
        kw["category"] = _categorize(kw["skill"])

    # Always merge with regex results as a safety net
    regex_results = extract_keywords_regex(requirements)
    return _merge_keywords(llm_results, regex_results)


def extract_keywords_regex(requirements: list[str]) -> list[dict]:
    """Regex/dictionary-based fallback extraction (no API cost)."""
    # Build lookup: lowercase term → canonical name
    # Categories first (lowercase), then aliases overwrite with proper casing
    known: dict[str, str] = {}
    for cat_skills in SKILL_CATEGORIES.values():
        for s in cat_skills:
            known[s.lower()] = s
    # Aliases override with properly-cased canonical names
    for alias, canonical in SKILL_ALIASES.items():
        known[alias] = canonical

    found = []
    seen: set[str] = set()

    # Sort terms longest-first to match "node.js" before "node"
    sorted_terms = sorted(known.items(), key=lambda x: len(x[0]), reverse=True)

    for req in requirements:
        req_lower = req.lower()
        for term, canonical in sorted_terms:
            # Word-boundary-ish matching
            pattern = r"(?:^|[\s,;/(\-])(" + re.escape(term) + r")(?:[\s,;/)\-.]|$)"
            if re.search(pattern, req_lower) and canonical not in seen:
                found.append({"skill": canonical, "category": _categorize(canonical)})
                seen.add(canonical)

    return found


def extract_and_cache_all(
    jobs_with_reqs: list[dict],
    model_choice: str,
    api_key: str,
) -> dict:
    """Batch extract: skip cached, LLM-extract the rest.

    Args:
        jobs_with_reqs: [{"job_id": str, "requirements": [str]}]

    Returns: {job_id: [{"skill": str, "category": str}]}
    """
    cache = load_keyword_cache()
    results: dict = {}
    uncached: list[dict] = []

    for item in jobs_with_reqs:
        jid = item["job_id"]
        if jid in cache:
            # Re-normalize cached keywords (handles old entries with non-canonical names)
            keywords = cache[jid]["keywords"]
            for kw in keywords:
                kw["skill"] = _normalize(kw["skill"])
                kw["category"] = _categorize(kw["skill"])
            results[jid] = keywords
        else:
            uncached.append(item)

    # For uncached jobs, batch them into one LLM call when possible
    if uncached:
        for item in uncached:
            jid = item["job_id"]
            reqs = item["requirements"]
            if reqs:
                keywords = extract_keywords_llm(reqs, model_choice, api_key)
            else:
                keywords = []
            cache_keywords(jid, keywords)
            results[jid] = keywords

    return results


# ── Aggregation ──────────────────────────────────────────────

def aggregate_keywords(
    keyword_data: dict,
    job_ids: list[str] | None = None,
) -> dict:
    """Aggregate keyword counts across jobs.

    Returns:
        {
            "skill_counts": {"React": 3, "Python": 2, ...},
            "category_counts": {"Frontend": 8, ...},
            "skills_by_category": {"Frontend": {"React": 3, ...}, ...},
            "total_jobs": int,
        }
    """
    skill_counter: Counter = Counter()
    category_counter: Counter = Counter()
    cat_skills: dict[str, Counter] = {}

    ids = job_ids if job_ids else list(keyword_data.keys())

    for jid in ids:
        if jid not in keyword_data:
            continue
        seen_in_job: set[str] = set()
        for kw in keyword_data[jid]:
            skill = kw["skill"]
            cat = kw.get("category", _categorize(skill))
            if skill not in seen_in_job:
                skill_counter[skill] += 1
                category_counter[cat] += 1
                if cat not in cat_skills:
                    cat_skills[cat] = Counter()
                cat_skills[cat][skill] += 1
                seen_in_job.add(skill)

    return {
        "skill_counts": dict(skill_counter.most_common()),
        "category_counts": dict(category_counter.most_common()),
        "skills_by_category": {
            cat: dict(counter.most_common()) for cat, counter in cat_skills.items()
        },
        "total_jobs": len(ids),
    }


# ── Resume gap analysis ─────────────────────────────────────

def compute_resume_gaps(
    aggregated: dict,
    resume_skills: dict,
) -> dict:
    """Compare aggregated job keywords against resume skills.

    Args:
        aggregated: output of aggregate_keywords()
        resume_skills: {"Frontend": "React, TypeScript, ...", ...}

    Returns:
        {
            "matched": [{"skill": str, "count": int, "category": str}],
            "gaps":    [{"skill": str, "count": int, "category": str}],
            "match_percentage": float,
        }
    """
    # Build flat set of resume skills (normalized, lowered)
    # Handles compound entries like "Next.js/React", "TypeScript/JavaScript",
    # "AWS (EC2, S3, Lambda)", "PostgreSQL(pgvector)"
    resume_set: set[str] = set()
    for _cat, skills_str in resume_skills.items():
        # Split on commas that are NOT inside parentheses
        tokens = re.split(r",\s*(?![^()]*\))", skills_str)
        for s in tokens:
            s = s.strip()
            # Split on / to handle "Next.js/React"
            parts = re.split(r"/", s)
            for part in parts:
                # Also extract parenthetical items: "AWS (EC2, S3, Lambda)"
                main = re.sub(r"\(.*?\)", "", part).strip()
                parens = re.findall(r"\(([^)]+)\)", part)
                if main:
                    resume_set.add(_normalize(main).lower())
                for p in parens:
                    for sub in p.split(","):
                        sub = sub.strip()
                        if sub:
                            resume_set.add(_normalize(sub).lower())

    matched = []
    gaps = []

    soft_skills_summary: Counter = Counter()

    for skill, count in aggregated["skill_counts"].items():
        # Determine category
        cat = "Other"
        for category, skills in aggregated["skills_by_category"].items():
            if skill in skills:
                cat = category
                break

        # Separate soft skills from hard skills
        if is_soft_skill(skill):
            soft_skills_summary[skill] += count
            continue

        entry = {"skill": skill, "count": count, "category": cat}

        if skill.lower() in resume_set:
            matched.append(entry)
        else:
            gaps.append(entry)

    # Match percentage based on hard skills only
    total = len(matched) + len(gaps)
    pct = (len(matched) / total * 100) if total > 0 else 0

    return {
        "matched": sorted(matched, key=lambda x: x["count"], reverse=True),
        "gaps": sorted(gaps, key=lambda x: x["count"], reverse=True),
        "match_percentage": round(pct, 1),
        "soft_skills": dict(soft_skills_summary.most_common()),
    }
