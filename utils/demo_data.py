"""
Demo Data Seeder — Creates a built-in Jane Doe sample session, demo job tracker
entries, and keyword cache so new visitors see a populated app right away.

Runs once on first launch; subsequent runs are no-ops (checks a sentinel file).
"""
import json
import os
from pathlib import Path
from datetime import datetime

# On HuggingFace Spaces, use /data for persistent storage
if os.environ.get("SPACE_ID") and Path("/data").exists():
    SESSIONS_DIR = Path("/data/saved_sessions")
else:
    SESSIONS_DIR = Path(__file__).parent.parent / "saved_sessions"
SENTINEL = SESSIONS_DIR / ".demo_seeded"

DEMO_SESSION_ID = "demo0001"
DEMO_VISITOR_ID = "demo"

# Bump this version whenever the demo data structure changes so the
# seeder re-runs on existing deployments.
_SEED_VERSION = "3"


def seed_demo_data():
    """Seed demo data if not already present. Safe to call on every startup."""
    print(f"[demo_data] seed_demo_data() called. SESSIONS_DIR={SESSIONS_DIR}")
    if SENTINEL.exists():
        existing_ver = SENTINEL.read_text().strip().split("|")[0]
        if existing_ver == _SEED_VERSION:
            print(f"[demo_data] Sentinel v{_SEED_VERSION} exists, skipping.")
            return
        # Version mismatch → re-seed (clean old demo files first)
        print(f"[demo_data] Version mismatch ({existing_ver} → {_SEED_VERSION}), re-seeding...")
        import shutil
        demo_dir = SESSIONS_DIR / "sessions" / DEMO_SESSION_ID
        if demo_dir.exists():
            shutil.rmtree(demo_dir)
    else:
        print("[demo_data] No sentinel, seeding fresh...")
    SESSIONS_DIR.mkdir(exist_ok=True)
    (SESSIONS_DIR / "sessions").mkdir(exist_ok=True)

    try:
        _seed_session()
        print("[demo_data] ✅ Session seeded")
    except Exception as e:
        print(f"[demo_data] ❌ Session seed failed: {e}")
    try:
        _seed_job_tracker()
        print("[demo_data] ✅ Job tracker seeded")
    except Exception as e:
        print(f"[demo_data] ❌ Job tracker seed failed: {e}")
    try:
        _seed_keyword_cache()
        print("[demo_data] ✅ Keyword cache seeded")
    except Exception as e:
        print(f"[demo_data] ❌ Keyword cache seed failed: {e}")

    # Write sentinel so we don't re-seed (version|timestamp)
    SENTINEL.write_text(f"{_SEED_VERSION}|{datetime.now().isoformat()}")
    print(f"[demo_data] Sentinel written. Done.")


def ensure_demo_session():
    """Ensure demo session files AND index entry exist. Safe to call on every page load."""
    SESSIONS_DIR.mkdir(exist_ok=True)
    (SESSIONS_DIR / "sessions").mkdir(exist_ok=True)

    demo_state = SESSIONS_DIR / "sessions" / DEMO_SESSION_ID / "state.json"
    index_path = SESSIONS_DIR / "index.json"

    # Check if demo entry exists in index
    index_ok = False
    if index_path.exists():
        try:
            with open(index_path, "r") as f:
                index = json.load(f)
            index_ok = any(s.get("id") == DEMO_SESSION_ID for s in index)
        except Exception:
            pass

    if demo_state.exists() and index_ok:
        return  # fast path: both files and index entry exist

    # Something missing → re-seed session (creates files + index entry)
    try:
        _seed_session()
        print("[demo_data] ensure_demo_session: re-seeded")
    except Exception as e:
        print(f"[demo_data] ensure_demo_session failed: {e}")


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

def _seed_session():
    """Create a Jane Doe demo session."""
    session_dir = SESSIONS_DIR / "sessions" / DEMO_SESSION_ID
    session_dir.mkdir(parents=True, exist_ok=True)

    # --- state.json ---
    state = {
        "resume_data": {
            "name": "Jane Doe",
            "role": "Full-Stack Software Engineer",
            "contact": [
                "jane.doe@email.com",
                "(555) 123-4567",
                "github.com/janedoe",
                "linkedin.com/in/janedoe",
            ],
            "skills": {
                "Languages": "Python, TypeScript, JavaScript, Java, SQL, Go",
                "Web Development": "React, Next.js, Node.js, Express, Django, FastAPI",
                "Data & Cloud": "AWS (S3, Lambda, EC2), PostgreSQL, MongoDB, Redis, Docker, Kubernetes",
                "Tools & Practices": "Git, CI/CD, Agile/Scrum, REST APIs, GraphQL, Unit Testing",
            },
            "summary": (
                "Full-stack software engineer with 4+ years of experience building "
                "scalable web applications. Proven track record of delivering features "
                "end-to-end across React/Next.js frontends and Python/Node.js backends. "
                "Passionate about clean architecture, developer experience, and shipping "
                "products that delight users."
            ),
            "experience": [
                {
                    "company": "TechNova Inc.",
                    "role": "Software Engineer II",
                    "date": "Jan 2023 \u2013 Present",
                    "bullets": [
                        "Led development of a **real-time analytics dashboard** serving 50K+ daily users, reducing page load time by **40%** through code-splitting and query optimization",
                        "Designed and implemented a **microservices architecture** for the payments module, handling **$2M+** in monthly transactions with 99.9% uptime",
                        "Mentored 3 junior developers through code reviews and pair programming, improving team velocity by **25%** within one quarter",
                        "Built automated CI/CD pipelines with **GitHub Actions** and **Docker**, cutting deployment time from 45 minutes to under 8 minutes",
                    ],
                },
                {
                    "company": "DataFlow Solutions",
                    "role": "Junior Software Engineer",
                    "date": "Jun 2021 \u2013 Dec 2022",
                    "bullets": [
                        "Developed RESTful APIs using **Django** and **PostgreSQL** to power a B2B SaaS platform with 200+ enterprise clients",
                        "Implemented real-time notification system using **WebSockets** and **Redis**, reducing user response time by **60%**",
                        "Collaborated with product and design teams to ship 15+ features across 6 sprint cycles, consistently meeting deadlines",
                        "Wrote comprehensive unit and integration tests achieving **92%** code coverage across core modules",
                    ],
                },
            ],
            "projects": [
                {
                    "name": "TaskBoard Pro \u2013 Collaborative Project Management Tool",
                    "tech": "Next.js, FastAPI, PostgreSQL, WebSocket",
                    "link": "github.com/janedoe/taskboard-pro",
                    "bullets": [
                        "Built a **real-time collaborative** task management app with drag-and-drop Kanban boards, live cursors, and instant sync across users",
                        "Implemented **role-based access control** with OAuth 2.0 and JWT, supporting team workspaces with fine-grained permissions",
                    ],
                },
                {
                    "name": "HealthTrack \u2013 AI-Powered Fitness Dashboard",
                    "tech": "React, Node.js, MongoDB, OpenAI API",
                    "link": "github.com/janedoe/healthtrack",
                    "bullets": [
                        "Created an AI-powered fitness app that generates personalized workout plans using **GPT-4** based on user goals and history",
                        "Integrated Apple Health and Google Fit APIs to aggregate cross-platform health data into unified visualizations",
                    ],
                },
            ],
            "education": [
                {
                    "school": "University of California, Berkeley",
                    "degree": "B.S., Computer Science",
                    "date": "Aug 2017 \u2013 May 2021",
                    "gpa": "3.7",
                    "coursework": [
                        "Data Structures & Algorithms",
                        "Operating Systems",
                        "Machine Learning",
                        "Distributed Systems",
                    ],
                    "note": "",
                }
            ],
        },
        "analysis_result": {
            "overall_score": 82,
            "category_scores": {
                "experience": 85,
                "skills": 80,
                "education": 78,
                "presentation": 84,
                "impact": 80,
            },
            "strengths": [
                {
                    "title": "Strong quantified impact throughout experience",
                    "description": (
                        "Multiple bullet points include specific metrics (40% load time reduction, "
                        "$2M+ transactions, 25% velocity improvement). This makes your contributions "
                        "tangible and memorable to recruiters."
                    ),
                    "icon": "\u2705",
                },
                {
                    "title": "Well-rounded full-stack skill set",
                    "description": (
                        "Demonstrated proficiency across both frontend (React, Next.js) and backend "
                        "(Python, Node.js, PostgreSQL) stacks with production-level experience."
                    ),
                    "icon": "\u2705",
                },
                {
                    "title": "Leadership and mentorship signals",
                    "description": (
                        "Mentoring junior developers and leading feature development shows growth "
                        "trajectory beyond individual contribution, positioning well for senior roles."
                    ),
                    "icon": "\u2705",
                },
            ],
            "weaknesses": [
                {
                    "title": "Limited system design depth in descriptions",
                    "description": (
                        "While you mention microservices, adding more detail about architectural "
                        "decisions (e.g., event-driven patterns, caching strategies) would strengthen "
                        "senior-level positioning."
                    ),
                    "icon": "\u26a0\ufe0f",
                },
                {
                    "title": "Projects section could show more scale",
                    "description": (
                        "Personal projects lack user/traffic metrics. Adding deployment stats or "
                        "user counts would make them more compelling alongside professional experience."
                    ),
                    "icon": "\u26a0\ufe0f",
                },
            ],
            "quick_wins": [
                "Add a line about scale (DAU, requests/sec) to the microservices bullet",
                "Include links to live deployed versions of personal projects",
                "Add a 'Certifications' section if you hold any AWS/cloud certs",
                "Consider a brief 'Interests' line to add personality",
            ],
            "summary": (
                "This is a strong mid-level full-stack resume with clear quantified impact "
                "and a good progression narrative. The technical breadth is impressive. "
                "To level up toward senior roles, consider adding more architectural depth "
                "and system-design thinking to your bullet points."
            ),
        },
        "job_matches": {
            "success": True,
            "matches": [
                {
                    "id": "1",
                    "title": "Senior Full-Stack Engineer",
                    "company": "Stripe",
                    "location": "San Francisco, CA (Hybrid)",
                    "salary": "$180,000 - $250,000",
                    "description": (
                        "Join our Payments team to build and maintain critical infrastructure "
                        "powering millions of businesses worldwide."
                    ),
                    "requirements": [
                        "4+ years of professional software engineering experience",
                        "Strong proficiency in TypeScript/JavaScript and Python",
                        "Experience with distributed systems and microservices",
                        "Familiarity with payment systems or fintech",
                    ],
                    "type": "Full-time",
                    "category": "Engineering",
                    "match_score": 88,
                    "match_reasons": [
                        "Direct full-stack experience with React + Python backend aligns perfectly",
                        "Payments/microservices experience at TechNova is highly relevant",
                        "4+ years of experience meets the seniority requirement",
                    ],
                    "gaps": [
                        "No explicit fintech or payment-processing domain experience listed",
                        "Distributed systems experience could be more prominent",
                    ],
                    "tailoring_tips": [
                        "Expand the payments microservice bullet to highlight transaction processing patterns",
                        "Add a bullet about distributed system challenges (consistency, fault tolerance)",
                    ],
                },
                {
                    "id": "2",
                    "title": "Software Engineer, Growth",
                    "company": "Notion",
                    "location": "New York, NY (Hybrid)",
                    "salary": "$150,000 - $200,000",
                    "description": (
                        "Drive growth through experimentation and feature development "
                        "on our collaboration platform."
                    ),
                    "requirements": [
                        "3+ years of software engineering experience",
                        "Experience with React and modern frontend frameworks",
                        "Data-driven mindset with experience in A/B testing",
                        "Strong communication skills",
                    ],
                    "type": "Full-time",
                    "category": "Engineering",
                    "match_score": 82,
                    "match_reasons": [
                        "Strong React/Next.js frontend experience matches requirements",
                        "Analytics dashboard work shows data-driven development approach",
                        "Collaboration tool project (TaskBoard Pro) is directly relevant",
                    ],
                    "gaps": [
                        "No explicit A/B testing or experimentation framework experience",
                        "Growth engineering is not highlighted in current experience",
                    ],
                    "tailoring_tips": [
                        "Reframe analytics dashboard work to emphasize data-driven decisions",
                        "Add any experience with feature flags or experimentation frameworks",
                    ],
                },
                {
                    "id": "3",
                    "title": "Backend Engineer",
                    "company": "Datadog",
                    "location": "Boston, MA (Remote-friendly)",
                    "salary": "$160,000 - $220,000",
                    "description": (
                        "Build scalable backend systems for our monitoring and "
                        "observability platform."
                    ),
                    "requirements": [
                        "3+ years of backend engineering experience",
                        "Proficiency in Go or Python",
                        "Experience with high-throughput distributed systems",
                        "Knowledge of monitoring, logging, or observability tools",
                    ],
                    "type": "Full-time",
                    "category": "Engineering",
                    "match_score": 75,
                    "match_reasons": [
                        "Strong Python backend experience with Django and FastAPI",
                        "CI/CD and Docker experience shows DevOps awareness",
                        "Go listed in skills, showing willingness to learn their primary language",
                    ],
                    "gaps": [
                        "No explicit high-throughput or big data pipeline experience",
                        "Observability/monitoring domain knowledge not demonstrated",
                        "Go is listed but no production experience shown",
                    ],
                    "tailoring_tips": [
                        "Highlight any experience with logging, metrics, or monitoring in past roles",
                        "Quantify API throughput or data volumes processed",
                        "Consider adding a Go side project to demonstrate proficiency",
                    ],
                },
            ],
            "candidate_summary": (
                "Full-stack software engineer with 4+ years of experience, strongest in "
                "React/Next.js frontends and Python backends. Well-suited for mid-to-senior "
                "full-stack or backend roles at product-focused companies."
            ),
            "recommended_focus": (
                "Senior full-stack engineering roles at mid-to-large tech companies, "
                "particularly those building SaaS platforms or developer tools."
            ),
        },
        "timeline": [],
        "selected_job": None,
        "current_diff": {},
        "page": "analysis",
        "cover_letter_text": "",
        "cover_letter_question": "",
        "cl_timeline": [],
    }

    with open(session_dir / "state.json", "w") as f:
        json.dump(state, f, indent=2)

    # --- resume.html (render from resume_data so preview works) ---
    try:
        from utils.html_renderer import render_resume_html, render_resume_html_for_pdf

        resume_html = render_resume_html(state["resume_data"], editable=False)
        with open(session_dir / "resume.html", "w", encoding="utf-8") as f:
            f.write(resume_html)

        # --- original.pdf + thumbnail ---
        try:
            from utils.pdf_utils import convert_html_to_pdf
            from utils.session_manager import generate_thumbnail

            pdf_html = render_resume_html_for_pdf(state["resume_data"])
            pdf_bytes = convert_html_to_pdf(pdf_html)
            if pdf_bytes:
                with open(session_dir / "original.pdf", "wb") as f:
                    f.write(pdf_bytes)
                thumb = generate_thumbnail(pdf_bytes)
                if thumb:
                    with open(session_dir / "thumbnail.png", "wb") as f:
                        f.write(thumb)
        except Exception as e:
            print(f"[demo_data] PDF/thumbnail generation skipped: {e}")
    except Exception as e:
        print(f"[demo_data] HTML generation skipped: {e}")

    # --- index.json ---
    index_path = SESSIONS_DIR / "index.json"
    if index_path.exists():
        try:
            with open(index_path, "r") as f:
                index = json.load(f)
        except Exception:
            index = []
    else:
        index = []

    # Remove old demo entry if any
    index = [s for s in index if s["id"] != DEMO_SESSION_ID]
    # Add demo entry at the end so user's own sessions appear first
    index.append({
        "id": DEMO_SESSION_ID,
        "pdf_md5": "demo",
        "pdf_filename": "Jane_Doe_Resume.pdf",
        "updated_at": "2026-03-01 10:00",
        "name": "\ud83d\udcdd Demo \u2014 Jane Doe (Full-Stack Engineer)",
        "visitor_id": DEMO_VISITOR_ID,
    })
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)


# ---------------------------------------------------------------------------
# Job Tracker
# ---------------------------------------------------------------------------

DEMO_JOBS = [
    {
        "id": "trk_demo0001",
        "company": "Stripe",
        "title": "Senior Full-Stack Engineer",
        "status": "interview",
        "date_applied": "2026-02-15",
        "url": "https://stripe.com/jobs",
        "salary_min": "$180,000",
        "salary_max": "$250,000",
        "notes": "Great culture, strong engineering brand. Prep system design.",
        "contacts": [],
        "follow_up_date": "2026-03-15",
        "linked_session_id": DEMO_SESSION_ID,
        "source": "imported",
        "location": "San Francisco, CA (Hybrid)",
        "work_type": "hybrid",
        "requirements": [
            "4+ years of professional software engineering experience",
            "Strong proficiency in TypeScript/JavaScript and Python",
            "Experience with distributed systems and microservices",
            "Familiarity with payment systems or fintech",
        ],
        "created_at": "2026-02-15 09:00",
        "updated_at": "2026-03-01 14:30",
        "custom_fields": {},
    },
    {
        "id": "trk_demo0002",
        "company": "Notion",
        "title": "Software Engineer, Growth",
        "status": "applied",
        "date_applied": "2026-02-20",
        "url": "https://notion.so/careers",
        "salary_min": "$150,000",
        "salary_max": "$200,000",
        "notes": "Applied via referral. Love the product.",
        "contacts": [],
        "follow_up_date": "",
        "linked_session_id": DEMO_SESSION_ID,
        "source": "imported",
        "location": "New York, NY (Hybrid)",
        "work_type": "hybrid",
        "requirements": [
            "3+ years of software engineering experience",
            "Experience with React and modern frontend frameworks",
            "Data-driven mindset with experience in A/B testing",
            "Strong communication skills",
        ],
        "created_at": "2026-02-20 11:00",
        "updated_at": "2026-02-20 11:00",
        "custom_fields": {},
    },
    {
        "id": "trk_demo0003",
        "company": "Datadog",
        "title": "Backend Engineer",
        "status": "wishlist",
        "date_applied": "",
        "url": "https://careers.datadoghq.com",
        "salary_min": "$160,000",
        "salary_max": "$220,000",
        "notes": "Interesting observability space. Need to brush up on Go.",
        "contacts": [],
        "follow_up_date": "",
        "linked_session_id": DEMO_SESSION_ID,
        "source": "imported",
        "location": "Boston, MA (Remote-friendly)",
        "work_type": "remote",
        "requirements": [
            "3+ years of backend engineering experience",
            "Proficiency in Go or Python",
            "Experience with high-throughput distributed systems",
            "Knowledge of monitoring, logging, or observability tools",
        ],
        "created_at": "2026-02-25 16:00",
        "updated_at": "2026-02-25 16:00",
        "custom_fields": {},
    },
    {
        "id": "trk_demo0004",
        "company": "Vercel",
        "title": "Software Engineer, Platform",
        "status": "rejected",
        "date_applied": "2026-01-10",
        "url": "https://vercel.com/careers",
        "salary_min": "$140,000",
        "salary_max": "$190,000",
        "notes": "Rejected after final round. Feedback: wanted more infra experience.",
        "contacts": [],
        "follow_up_date": "",
        "linked_session_id": None,
        "source": "manual",
        "location": "San Francisco, CA (Remote)",
        "work_type": "remote",
        "requirements": [
            "Experience with Next.js or similar frameworks",
            "Cloud infrastructure and CDN knowledge",
            "Strong TypeScript skills",
            "CI/CD pipeline experience",
        ],
        "created_at": "2026-01-10 10:00",
        "updated_at": "2026-02-05 09:00",
        "custom_fields": {},
    },
]


def _seed_job_tracker():
    """Add demo jobs to the tracker."""
    tracker_path = SESSIONS_DIR / "job_tracker.json"
    if tracker_path.exists():
        try:
            with open(tracker_path, "r") as f:
                data = json.load(f)
        except Exception:
            data = {"version": 1, "jobs": [], "custom_columns": []}
    else:
        data = {"version": 1, "jobs": [], "custom_columns": []}

    existing_ids = {j["id"] for j in data["jobs"]}
    for job in DEMO_JOBS:
        if job["id"] not in existing_ids:
            job_copy = dict(job)
            job_copy["visitor_id"] = "demo"
            data["jobs"].append(job_copy)

    with open(tracker_path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Keyword Cache
# ---------------------------------------------------------------------------

DEMO_KEYWORDS = {
    "trk_demo0001": {
        "keywords": [
            {"skill": "TypeScript", "category": "Languages & Frameworks"},
            {"skill": "Python", "category": "Languages & Frameworks"},
            {"skill": "React", "category": "Languages & Frameworks"},
            {"skill": "Distributed Systems", "category": "Cloud & DevOps"},
            {"skill": "Microservices", "category": "Cloud & DevOps"},
            {"skill": "Payment Systems", "category": "Tools & Platforms"},
            {"skill": "API Design", "category": "Languages & Frameworks"},
            {"skill": "PostgreSQL", "category": "Data & AI"},
            {"skill": "System Design", "category": "Soft Skills"},
            {"skill": "Team Leadership", "category": "Soft Skills"},
        ],
        "extracted_at": "2026-02-15T10:00:00.000000",
    },
    "trk_demo0002": {
        "keywords": [
            {"skill": "React", "category": "Languages & Frameworks"},
            {"skill": "Next.js", "category": "Languages & Frameworks"},
            {"skill": "A/B Testing", "category": "Marketing & Growth"},
            {"skill": "Growth Engineering", "category": "Marketing & Growth"},
            {"skill": "Data Analysis", "category": "Data & AI"},
            {"skill": "Feature Flags", "category": "Tools & Platforms"},
            {"skill": "Communication", "category": "Soft Skills"},
            {"skill": "Collaboration", "category": "Soft Skills"},
            {"skill": "Product Mindset", "category": "Product & Design"},
        ],
        "extracted_at": "2026-02-20T12:00:00.000000",
    },
    "trk_demo0003": {
        "keywords": [
            {"skill": "Go", "category": "Languages & Frameworks"},
            {"skill": "Python", "category": "Languages & Frameworks"},
            {"skill": "Distributed Systems", "category": "Cloud & DevOps"},
            {"skill": "Monitoring", "category": "Tools & Platforms"},
            {"skill": "Observability", "category": "Tools & Platforms"},
            {"skill": "High-throughput Systems", "category": "Data & AI"},
            {"skill": "Logging", "category": "Tools & Platforms"},
            {"skill": "Data Pipelines", "category": "Data & AI"},
            {"skill": "Backend Engineering", "category": "Languages & Frameworks"},
        ],
        "extracted_at": "2026-02-25T17:00:00.000000",
    },
    "trk_demo0004": {
        "keywords": [
            {"skill": "Next.js", "category": "Languages & Frameworks"},
            {"skill": "TypeScript", "category": "Languages & Frameworks"},
            {"skill": "Cloud Infrastructure", "category": "Cloud & DevOps"},
            {"skill": "CDN", "category": "Cloud & DevOps"},
            {"skill": "CI/CD", "category": "Cloud & DevOps"},
            {"skill": "Serverless", "category": "Cloud & DevOps"},
            {"skill": "Edge Computing", "category": "Cloud & DevOps"},
            {"skill": "Performance Optimization", "category": "Languages & Frameworks"},
        ],
        "extracted_at": "2026-01-10T11:00:00.000000",
    },
}


def _seed_keyword_cache():
    """Add demo keywords to the cache."""
    cache_path = SESSIONS_DIR / "keyword_cache.json"
    if cache_path.exists():
        try:
            with open(cache_path, "r") as f:
                cache = json.load(f)
        except Exception:
            cache = {}
    else:
        cache = {}

    for job_id, data in DEMO_KEYWORDS.items():
        if job_id not in cache:
            cache[job_id] = data

    with open(cache_path, "w") as f:
        json.dump(cache, f, indent=2)
