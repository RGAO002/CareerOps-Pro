"""
Dashboard / tracker endpoints — status management, stats, search.
"""
import json
from fastapi import APIRouter, HTTPException

from api.db import get_db

router = APIRouter()

VALID_STATUSES = ["to_tailor", "tailored", "to_apply", "applied", "interviewing", "offer", "rejected"]


@router.get("/stats")
async def get_dashboard_stats():
    """Get aggregate stats for the dashboard."""
    db = await get_db()
    try:
        # Status counts
        cursor = await db.execute(
            "SELECT status, COUNT(*) as count FROM jobs GROUP BY status"
        )
        status_counts = {r["status"]: r["count"] for r in await cursor.fetchall()}

        # Total
        cursor = await db.execute("SELECT COUNT(*) as total FROM jobs")
        total = (await cursor.fetchone())["total"]

        # Average match score
        cursor = await db.execute(
            "SELECT AVG(match_score) as avg_score FROM jobs WHERE match_score > 0"
        )
        row = await cursor.fetchone()
        avg_score = round(row["avg_score"] or 0, 1)

        # Tailored count
        cursor = await db.execute(
            "SELECT COUNT(*) as count FROM tailored_resumes WHERE status = 'completed'"
        )
        tailored_count = (await cursor.fetchone())["count"]

        return {
            "total_jobs": total,
            "status_counts": status_counts,
            "avg_match_score": avg_score,
            "tailored_resumes": tailored_count,
        }
    finally:
        await db.close()


@router.get("/board")
async def get_dashboard_board(resume_id: str = None):
    """Get full dashboard data: jobs with their tailored resume status."""
    db = await get_db()
    try:
        if resume_id:
            cursor = await db.execute(
                "SELECT j.*, tr.id as tr_id, tr.status as tr_status "
                "FROM jobs j "
                "LEFT JOIN tailored_resumes tr ON j.id = tr.job_id AND tr.resume_id = ? "
                "WHERE j.resume_id = ? "
                "ORDER BY j.updated_at DESC",
                (resume_id, resume_id),
            )
        else:
            cursor = await db.execute(
                "SELECT j.*, tr.id as tr_id, tr.status as tr_status "
                "FROM jobs j "
                "LEFT JOIN tailored_resumes tr ON j.id = tr.job_id "
                "ORDER BY j.updated_at DESC"
            )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            for f in ("requirements", "gaps", "tailoring_tips"):
                if isinstance(d.get(f), str):
                    d[f] = json.loads(d[f])
            d["has_tailored_resume"] = d.get("tr_status") == "completed"
            d["tailored_resume_id"] = d.pop("tr_id", None)
            d.pop("tr_status", None)
            result.append(d)
        return result
    finally:
        await db.close()


@router.put("/status/{job_id}")
async def update_job_status(job_id: str, body: dict):
    """Update just the status of a job."""
    new_status = body.get("status")
    if new_status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {VALID_STATUSES}")

    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM jobs WHERE id = ?", (job_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "Job not found")

        await db.execute(
            "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_status, job_id),
        )
        await db.commit()
        return {"ok": True, "status": new_status}
    finally:
        await db.close()
