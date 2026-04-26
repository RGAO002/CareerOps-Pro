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
from fastapi import APIRouter, HTTPException

from api.models.resume import Resume
from api.services import resume_store


router = APIRouter()


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
