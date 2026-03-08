"""
Resume API — read/list saved sessions for the Review page.
"""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter()

SESSIONS_DIR = Path(__file__).parent.parent.parent / "saved_sessions"


@router.get("/sessions")
async def list_sessions():
    """List all saved resume sessions (id + metadata)."""
    sessions = []
    if not SESSIONS_DIR.exists():
        return {"sessions": []}

    for f in sorted(SESSIONS_DIR.glob("session_*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            sessions.append({
                "id": f.stem,
                "name": data.get("session_name", f.stem),
                "has_resume": bool(data.get("resume_data")),
                "has_job": bool(data.get("selected_job")),
                "job_title": data.get("selected_job", {}).get("title", ""),
                "company": data.get("selected_job", {}).get("company", ""),
            })
        except (json.JSONDecodeError, IOError):
            continue

    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Load a full session by ID."""
    path = SESSIONS_DIR / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        data = json.loads(path.read_text())
        return data
    except (json.JSONDecodeError, IOError) as e:
        raise HTTPException(status_code=500, detail=str(e))
