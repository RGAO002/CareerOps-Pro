"""
CareerOps Pro — FastAPI Backend

Serves the services layer via REST + WebSocket endpoints.
Runs alongside the Streamlit app; shares the same services/ and saved_sessions/.
"""
import sys
from pathlib import Path

# Ensure project root is on sys.path so `services.*` imports work
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load .env so OPENAI_API_KEY etc. are available without manual sourcing.
# Best-effort — if python-dotenv isn't installed we just skip silently.
try:
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env", override=False)
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.review import router as review_router
from api.routes.resume import router as resume_router
from api.routes.walkthrough import router as walkthrough_router
from api.routes.humanize import router as humanize_router
from api.routes.jobs import router as jobs_router
from api.routes.ai import router as ai_router

app = FastAPI(
    title="CareerOps Pro API",
    version="0.1.0",
    description="Backend for CareerOps Pro Next.js frontend",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    # Dev: allow any localhost / 127.0.0.1 port. Next dev auto-bumps the port
    # when 3000 is in use, and we don't want to babysit a hardcoded allowlist.
    # Tighten this for production deploys.
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router, prefix="/api/resume", tags=["resume"])
app.include_router(review_router, prefix="/api/review", tags=["review"])
app.include_router(walkthrough_router, prefix="/api/walkthrough", tags=["walkthrough"])
app.include_router(humanize_router, prefix="/api/humanize", tags=["humanize"])
app.include_router(jobs_router, prefix="/api/jobs", tags=["jobs"])
app.include_router(ai_router, prefix="/api/ai", tags=["ai"])


from api.services import ai_tools
ai_tools.register_all()

@app.get("/api/health")
async def health():
    return {"status": "ok"}
