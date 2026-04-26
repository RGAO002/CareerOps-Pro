# api/routes/resume.py
"""Resume Editor v1 API.

Endpoints:
  GET    /                  list user's resumes (summary)
  GET    /:id              full resume
  PUT    /:id              update doc + meta
  POST   /                 create blank resume
  POST   /parse            upload PDF, parse, return new resume
  POST   /:id/variant      fork variant
  POST   /:id/snapshot     create explicit snapshot
  GET    /:id/snapshots    list snapshots
  POST   /:id/restore      restore from snapshot id
  POST   /:id/ai/rewrite-bullet   AI tool dispatch
"""
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.models.resume import Resume
from api.services import resume_store


router = APIRouter()


class CreateResumeRequest(BaseModel):
    title: str = "Untitled resume"


@router.get("/")
async def list_resumes() -> dict:
    """List the current user's resumes (summary view, no doc)."""
    resumes = resume_store.list_all()
    return {
        "resumes": [
            {
                "id": r.id,
                "title": r.title,
                "parent_id": r.parent_id,
                "is_base": r.is_base,
                "target_company": r.target_company,
                "target_role": r.target_role,
                "updated_at": r.updated_at,
            }
            for r in resumes
        ],
    }


@router.get("/{resume_id}")
async def get_resume(resume_id: str) -> Resume:
    """Get one resume in full (meta + doc)."""
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return r


@router.put("/{resume_id}")
async def upsert_resume(resume_id: str, payload: Resume) -> Resume:
    """Create or replace a resume. URL id always wins."""
    payload.id = resume_id
    payload.updated_at = max(payload.updated_at, _now_ms())
    resume_store.save(payload)
    return payload


def _now_ms() -> int:
    import time
    return int(time.time() * 1000)


@router.post("/")
async def create_blank_resume(body: CreateResumeRequest) -> Resume:
    """Create a new blank resume."""
    rid = str(uuid.uuid4())
    now = _now_ms()
    blank_doc = {
        "type": "doc",
        "content": [
            {"type": "resumeHeader", "attrs": {"contacts": []}, "content": []},
            {
                "type": "resumeSection",
                "attrs": {"heading": "Experience"},
                "content": [
                    {
                        "type": "entry",
                        "attrs": {"title": "", "meta": ""},
                        "content": [{"type": "bullet", "content": []}],
                    }
                ],
            },
        ],
    }
    r = Resume(id=rid, title=body.title, created_at=now, updated_at=now, doc=blank_doc)
    resume_store.save(r)
    return r
