"""
Batch tailor engine — processes a single job's tailoring (called from background task).

This runs in a thread (via asyncio.to_thread) so it can call synchronous services.
"""
import json
import uuid
from services.sync_db import get_sync_db

SECTIONS_TO_TAILOR = ["summary", "skills", "experience", "projects"]


def tailor_single_job(resume_id, job_id, model_choice, api_key, user_instructions=""):
    """Tailor a resume for a single job. Stores result in tailored_resumes table."""
    from services.resume_editor import tailor_section
    from utils.html_renderer import render_resume_html_for_pdf
    from utils.pdf_utils import convert_html_to_pdf
    import copy

    conn = get_sync_db()
    try:
        # Load resume
        row = conn.execute(
            "SELECT resume_data FROM resumes WHERE id = ?", (resume_id,)
        ).fetchone()
        if not row:
            return {"success": False, "error": "Resume not found"}
        resume_data = json.loads(row["resume_data"])

        # Load job
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return {"success": False, "error": "Job not found"}

        job_dict = dict(row)
        for f in ("requirements", "gaps", "tailoring_tips"):
            if isinstance(job_dict[f], str):
                job_dict[f] = json.loads(job_dict[f])

        target_job = {
            "title": job_dict["title"],
            "company": job_dict["company"],
            "description": job_dict.get("jd_text", "") or job_dict.get("jd_summary", ""),
            "requirements": job_dict.get("requirements", []),
            "match_reasons": [],
            "gaps": job_dict.get("gaps", []),
            "tailoring_tips": job_dict.get("tailoring_tips", []),
        }

        # Create or update tailored_resumes entry as in_progress
        tr_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO tailored_resumes "
            "(id, job_id, resume_id, tailored_data, status) VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT(job_id, resume_id) DO UPDATE SET"
            " id = excluded.id, tailored_data = excluded.tailored_data,"
            " status = excluded.status",
            (tr_id, job_id, resume_id, json.dumps(resume_data), "in_progress"),
        )
        conn.commit()

        # Tailor each section
        tailored = copy.deepcopy(resume_data)
        messages = []

        for section in SECTIONS_TO_TAILOR:
            if section not in tailored:
                continue
            result = tailor_section(
                section, tailored, target_job, user_instructions, model_choice, api_key
            )
            if result.get("error"):
                messages.append(f"{section}: {result['error']}")
                continue
            tailored[section] = result["section_data"]
            if result.get("message"):
                messages.append(f"{section}: {result['message']}")

        # Render HTML + PDF
        html = render_resume_html_for_pdf(tailored)
        pdf_bytes = convert_html_to_pdf(html)

        changes_summary = " | ".join(messages)

        # Update DB
        conn.execute(
            "UPDATE tailored_resumes SET tailored_data = ?, html_cache = ?, "
            "pdf_bytes = ?, changes_summary = ?, status = ? WHERE id = ?",
            (
                json.dumps(tailored, ensure_ascii=False),
                html,
                pdf_bytes,
                changes_summary,
                "completed",
                tr_id,
            ),
        )
        # Update job status
        conn.execute(
            "UPDATE jobs SET status = 'tailored', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )
        conn.commit()

        return {"success": True, "tailored_resume_id": tr_id, "changes": changes_summary}

    except Exception as e:
        # Mark as failed
        try:
            conn.execute(
                "UPDATE tailored_resumes SET status = 'failed', error = ? "
                "WHERE job_id = ? AND resume_id = ?",
                (str(e), job_id, resume_id),
            )
            conn.commit()
        except Exception:
            pass
        return {"success": False, "error": str(e)}

    finally:
        conn.close()
