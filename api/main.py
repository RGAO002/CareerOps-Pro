"""
CareerOps Pro — FastAPI Backend

REST + WebSocket API for the Next.js frontend.
"""
import sys
from contextlib import asynccontextmanager
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env", override=False)
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import init_db
from api.routes.resume import router as resume_router
from api.routes.review import router as review_router
from api.routes.walkthrough import router as walkthrough_router
from api.routes.humanize import router as humanize_router
from api.routes.ai import router as ai_router
from api.routes.jobs import router as jobs_router
from api.routes.public_jobs import router as public_jobs_router
from api.routes.tailoring import router as tailoring_router
from api.routes.tracker import router as tracker_router
from api.routes.chat import router as chat_router
from api.routes.people_search import router as people_search_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="CareerOps Pro API",
    version="2.0.0",
    description="Backend for CareerOps Pro — resume editor v3 + job recommendation",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router,       prefix="/api/resume",        tags=["resume"])
app.include_router(review_router,       prefix="/api/review",        tags=["review"])
app.include_router(walkthrough_router,  prefix="/api/walkthrough",   tags=["walkthrough"])
app.include_router(humanize_router,     prefix="/api/humanize",      tags=["humanize"])
app.include_router(ai_router,           prefix="/api/ai",            tags=["ai"])
# public_jobs MUST come before jobs_router to avoid "public" being captured as {job_id}
app.include_router(public_jobs_router,  prefix="/api/jobs/public",   tags=["public-jobs"])
app.include_router(jobs_router,         prefix="/api/jobs",          tags=["jobs"])
app.include_router(tailoring_router,    prefix="/api/tailor",        tags=["tailoring"])
app.include_router(tracker_router,      prefix="/api/tracker",       tags=["tracker"])
app.include_router(chat_router,         prefix="/api/chat",          tags=["chat"])
app.include_router(people_search_router, prefix="/api/people-search", tags=["people-search"])

from api.services import ai_tools
ai_tools.register_all()


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
