"""GET /api/jobs/  +  GET /api/jobs/{job_id} — read-only wrappers over
services/job_tracker.py. Single-user app, no auth changes.

Spec § 3.4 — these power the AI Coordinator's read tools (`get_application_history`,
`get_application_by_id`).
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from services import job_tracker

router = APIRouter()


@router.get("/")
def list_jobs(
    status: Optional[str] = Query(None, description="Filter to a single status."),
    company: Optional[str] = Query(None, description="Substring match on company name."),
    since: Optional[str] = Query(None, description="ISO date YYYY-MM-DD; jobs applied on/after."),
    limit: int = Query(50, ge=1, le=500),
):
    data = job_tracker.load_tracker()
    items = data.get("jobs", [])
    if status:
        items = [j for j in items if j.get("status") == status]
    if company:
        c = company.lower()
        items = [j for j in items if c in (j.get("company") or "").lower()]
    if since:
        items = [j for j in items if (j.get("date_applied") or "") >= since]
    return {"jobs": items[:limit], "total_unfiltered": len(data.get("jobs", []))}


@router.get("/{job_id}")
def get_job(job_id: str):
    data = job_tracker.load_tracker()
    for j in data.get("jobs", []):
        if j.get("id") == job_id:
            return {"job": j}
    raise HTTPException(status_code=404, detail=f"job {job_id} not found")
