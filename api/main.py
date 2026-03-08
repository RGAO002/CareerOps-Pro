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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.review import router as review_router
from api.routes.resume import router as resume_router

app = FastAPI(
    title="CareerOps Pro API",
    version="0.1.0",
    description="Backend for CareerOps Pro Next.js frontend",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router, prefix="/api/resume", tags=["resume"])
app.include_router(review_router, prefix="/api/review", tags=["review"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
