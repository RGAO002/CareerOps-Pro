"""
Session Manager - Save and restore resume editing sessions
"""
import os
import json
import hashlib
import uuid
from datetime import datetime
from pathlib import Path

# Base directory for saved sessions
SESSIONS_DIR = Path(__file__).parent.parent / "saved_sessions"
SESSIONS_INDEX = SESSIONS_DIR / "index.json"


def ensure_dirs():
    """Ensure session directories exist."""
    SESSIONS_DIR.mkdir(exist_ok=True)
    (SESSIONS_DIR / "sessions").mkdir(exist_ok=True)


def get_pdf_md5(pdf_bytes: bytes) -> str:
    """Calculate MD5 hash of PDF bytes."""
    return hashlib.md5(pdf_bytes).hexdigest()


def generate_thumbnail(pdf_bytes: bytes) -> bytes:
    """Generate PNG thumbnail from first page of PDF."""
    try:
        import fitz  # PyMuPDF
        pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = pdf_doc[0]
        # Higher resolution for better quality (1.5x scale)
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        pdf_doc.close()
        return png_bytes
    except Exception as e:
        print(f"[DEBUG] Thumbnail generation error: {e}")
        return None


def load_index() -> list:
    """Load sessions index."""
    ensure_dirs()
    if SESSIONS_INDEX.exists():
        try:
            with open(SESSIONS_INDEX, "r") as f:
                return json.load(f)
        except:
            return []
    return []


def save_index(index: list):
    """Save sessions index."""
    ensure_dirs()
    with open(SESSIONS_INDEX, "w") as f:
        json.dump(index, f, indent=2)


def save_session(
    pdf_bytes: bytes,
    pdf_filename: str,
    resume_data: dict,
    resume_html: str = None,
    analysis_result: dict = None,
    job_matches: dict = None,
    timeline: list = None,
    selected_job: dict = None,
    current_diff: dict = None,
    page: str = "analysis",
    session_id: str = None
) -> str:
    """
    Save a session. If session_id is provided, update existing session.
    Returns the session_id.
    """
    ensure_dirs()
    
    pdf_md5 = get_pdf_md5(pdf_bytes)
    
    # Generate or use existing session ID
    if not session_id:
        session_id = str(uuid.uuid4())[:8]
    
    session_dir = SESSIONS_DIR / "sessions" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    
    # Save PDF
    pdf_path = session_dir / "original.pdf"
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)
    
    # Generate and save thumbnail
    thumbnail = generate_thumbnail(pdf_bytes)
    if thumbnail:
        thumb_path = session_dir / "thumbnail.png"
        with open(thumb_path, "wb") as f:
            f.write(thumbnail)
    
    # Save HTML (the source of truth for rendering)
    if resume_html:
        html_path = session_dir / "resume.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(resume_html)
    
    # Save state
    state = {
        "resume_data": resume_data,
        "analysis_result": analysis_result,
        "job_matches": job_matches,
        "timeline": timeline or [],
        "selected_job": selected_job,
        "current_diff": current_diff or {},
        "page": page
    }
    state_path = session_dir / "state.json"
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)
    
    # Update index
    index = load_index()
    
    # Find existing entry or create new
    existing = next((s for s in index if s["id"] == session_id), None)
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    name = resume_data.get("name", "Unknown")
    role = resume_data.get("role", "")
    display_name = f"{name} - {role}" if role else name
    
    entry = {
        "id": session_id,
        "pdf_md5": pdf_md5,
        "pdf_filename": pdf_filename,
        "name": display_name,
        "updated_at": now
    }
    
    if existing:
        # Update existing entry
        idx = index.index(existing)
        index[idx] = entry
    else:
        # Add new entry at the beginning
        index.insert(0, entry)
    
    save_index(index)
    
    return session_id


def load_session(session_id: str) -> dict:
    """
    Load a session by ID.
    Returns dict with all session data including pdf_bytes and resume_html.
    """
    session_dir = SESSIONS_DIR / "sessions" / session_id
    
    if not session_dir.exists():
        return None
    
    result = {"id": session_id}
    
    # Load PDF
    pdf_path = session_dir / "original.pdf"
    if pdf_path.exists():
        with open(pdf_path, "rb") as f:
            result["pdf_bytes"] = f.read()
    
    # Load thumbnail
    thumb_path = session_dir / "thumbnail.png"
    if thumb_path.exists():
        with open(thumb_path, "rb") as f:
            result["thumbnail"] = f.read()
    
    # Load HTML (source of truth)
    html_path = session_dir / "resume.html"
    if html_path.exists():
        with open(html_path, "r", encoding="utf-8") as f:
            result["resume_html"] = f.read()
    
    # Load state
    state_path = session_dir / "state.json"
    if state_path.exists():
        with open(state_path, "r") as f:
            state = json.load(f)
            result.update(state)
    
    # Get filename from index
    index = load_index()
    entry = next((s for s in index if s["id"] == session_id), None)
    if entry:
        result["pdf_filename"] = entry.get("pdf_filename", "resume.pdf")
        result["display_name"] = entry.get("name", "Unknown")
    
    return result


def delete_session(session_id: str) -> bool:
    """Delete a session."""
    import shutil
    
    session_dir = SESSIONS_DIR / "sessions" / session_id
    
    if session_dir.exists():
        shutil.rmtree(session_dir)
    
    # Update index
    index = load_index()
    index = [s for s in index if s["id"] != session_id]
    save_index(index)
    
    return True


def get_thumbnail_path(session_id: str) -> Path:
    """Get path to thumbnail image."""
    return SESSIONS_DIR / "sessions" / session_id / "thumbnail.png"


def list_sessions() -> list:
    """List all saved sessions with their info."""
    return load_index()
