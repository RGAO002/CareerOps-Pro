"""
Batch/single tailor endpoints + WebSocket progress.
"""
import json
import uuid
import asyncio
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from api.db import get_db
from api.models import BatchTailorRequest, TailoredResumeOut

router = APIRouter()

# In-memory store for batch progress
_batch_progress: dict[str, dict] = {}


@router.post("/batch")
async def start_batch_tailor(body: BatchTailorRequest):
    """Start a batch tailor job. Returns a batch_id for WebSocket progress tracking."""
    # Validate resume exists
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM resumes WHERE id = ?", (body.resume_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "Resume not found")

        # Validate jobs exist
        placeholders = ",".join("?" for _ in body.job_ids)
        cursor = await db.execute(
            f"SELECT id FROM jobs WHERE id IN ({placeholders})", body.job_ids
        )
        found = [r["id"] for r in await cursor.fetchall()]
        missing = set(body.job_ids) - set(found)
        if missing:
            raise HTTPException(404, f"Jobs not found: {list(missing)}")
    finally:
        await db.close()

    batch_id = str(uuid.uuid4())
    _batch_progress[batch_id] = {
        "status": "pending",
        "total": len(body.job_ids),
        "completed": 0,
        "failed": 0,
        "current_job": None,
        "results": {},
    }

    # Start background task
    asyncio.create_task(
        _run_batch(batch_id, body.resume_id, body.job_ids,
                   body.model_choice, body.api_key, body.user_instructions)
    )

    return {"batch_id": batch_id, "total": len(body.job_ids)}


@router.get("/batch/{batch_id}")
async def get_batch_status(batch_id: str):
    """Poll batch status (alternative to WebSocket)."""
    progress = _batch_progress.get(batch_id)
    if not progress:
        raise HTTPException(404, "Batch not found")
    return progress


@router.websocket("/ws/{batch_id}")
async def batch_websocket(websocket: WebSocket, batch_id: str):
    """WebSocket for real-time batch progress updates."""
    await websocket.accept()

    progress = _batch_progress.get(batch_id)
    if not progress:
        await websocket.send_json({"type": "error", "message": "Batch not found"})
        await websocket.close()
        return

    try:
        last_sent = None
        while True:
            current = json.dumps(progress)
            if current != last_sent:
                await websocket.send_json({"type": "progress", **progress})
                last_sent = current

            if progress["status"] in ("completed", "failed"):
                await websocket.send_json({"type": "done", **progress})
                break

            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


@router.get("/result/{job_id}", response_model=TailoredResumeOut)
async def get_tailored_resume(job_id: str, resume_id: str = None):
    """Get the tailored resume for a specific job."""
    db = await get_db()
    try:
        if resume_id:
            cursor = await db.execute(
                "SELECT * FROM tailored_resumes WHERE job_id = ? AND resume_id = ?",
                (job_id, resume_id),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM tailored_resumes WHERE job_id = ? ORDER BY created_at DESC LIMIT 1",
                (job_id,),
            )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Tailored resume not found")
        result = dict(row)
        result["tailored_data"] = json.loads(result["tailored_data"])
        return result
    finally:
        await db.close()


@router.get("/result/{job_id}/pdf")
async def download_tailored_pdf(job_id: str, resume_id: str = None):
    """Download the tailored PDF for a specific job."""
    from fastapi.responses import Response

    db = await get_db()
    try:
        if resume_id:
            cursor = await db.execute(
                "SELECT pdf_bytes, tailored_data FROM tailored_resumes "
                "WHERE job_id = ? AND resume_id = ? AND status = 'completed'",
                (job_id, resume_id),
            )
        else:
            cursor = await db.execute(
                "SELECT pdf_bytes, tailored_data FROM tailored_resumes "
                "WHERE job_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1",
                (job_id,),
            )
        row = await cursor.fetchone()
        if not row or not row["pdf_bytes"]:
            raise HTTPException(404, "Tailored PDF not found")

        data = json.loads(row["tailored_data"])
        name = data.get("name", "resume").replace(" ", "_")

        # Get job info for filename
        cursor2 = await db.execute("SELECT company, title FROM jobs WHERE id = ?", (job_id,))
        job_row = await cursor2.fetchone()
        company = (job_row["company"] if job_row else "company").replace(" ", "_")

        filename = f"{name}_{company}_tailored.pdf"
        return Response(
            content=row["pdf_bytes"],
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        await db.close()


@router.get("/result/{job_id}/thumbnail")
async def get_tailored_thumbnail(job_id: str, resume_id: str = None):
    """Return a PNG thumbnail of the first page of the tailored PDF."""
    from fastapi.responses import Response
    import fitz  # pymupdf

    db = await get_db()
    try:
        if resume_id:
            cursor = await db.execute(
                "SELECT pdf_bytes FROM tailored_resumes "
                "WHERE job_id = ? AND resume_id = ? AND status = 'completed'",
                (job_id, resume_id),
            )
        else:
            cursor = await db.execute(
                "SELECT pdf_bytes FROM tailored_resumes "
                "WHERE job_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1",
                (job_id,),
            )
        row = await cursor.fetchone()
        if not row or not row["pdf_bytes"]:
            raise HTTPException(404, "Tailored PDF not found")

        doc = fitz.open(stream=row["pdf_bytes"], filetype="pdf")
        page = doc[0]
        # Render at 1.5x zoom for decent quality thumbnail
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        doc.close()

        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    finally:
        await db.close()


async def _run_batch(batch_id, resume_id, job_ids, model_choice, api_key, user_instructions):
    """Background batch tailor engine."""
    from api.tasks.batch_tailor import tailor_single_job

    progress = _batch_progress[batch_id]
    progress["status"] = "in_progress"

    sem = asyncio.Semaphore(3)

    async def _process_one(job_id):
        async with sem:
            progress["current_job"] = job_id
            try:
                result = await asyncio.to_thread(
                    tailor_single_job, resume_id, job_id, model_choice, api_key, user_instructions
                )
                progress["results"][job_id] = result
                if result.get("success"):
                    progress["completed"] += 1
                else:
                    progress["failed"] += 1
            except Exception as e:
                progress["results"][job_id] = {"success": False, "error": str(e)}
                progress["failed"] += 1

    tasks = [_process_one(jid) for jid in job_ids]
    await asyncio.gather(*tasks)

    progress["status"] = "completed"
    progress["current_job"] = None
