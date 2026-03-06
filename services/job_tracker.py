"""
Job Application Tracker Service — Manage job application tracking data.
Global tracker (not per-session), persisted to saved_sessions/job_tracker.json.
"""
import json
import uuid
from datetime import datetime
from pathlib import Path

TRACKER_DIR = Path(__file__).parent.parent / "saved_sessions"
TRACKER_FILE = TRACKER_DIR / "job_tracker.json"

# --- Status definitions ---
STATUSES = [
    ("wishlist", "📌 Wishlist", "#94a3b8"),
    ("applied", "📤 Applied", "#3b82f6"),
    ("phone_screen", "📞 Phone Screen", "#8b5cf6"),
    ("interview", "🎙️ Interview", "#f59e0b"),
    ("offer", "🎉 Offer", "#22c55e"),
    ("accepted", "✅ Accepted", "#10b981"),
    ("rejected", "❌ Rejected", "#ef4444"),
]

STATUS_LABELS = {s[0]: s[1] for s in STATUSES}
STATUS_COLORS = {s[0]: s[2] for s in STATUSES}


def _ensure_dir():
    TRACKER_DIR.mkdir(exist_ok=True)


def load_tracker() -> dict:
    """Load the tracker data. Returns {"version": 1, "jobs": [...]}."""
    _ensure_dir()
    if TRACKER_FILE.exists():
        try:
            with open(TRACKER_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {"version": 1, "jobs": []}
    return {"version": 1, "jobs": []}


def save_tracker(data: dict):
    """Write tracker data to disk."""
    _ensure_dir()
    with open(TRACKER_FILE, "w") as f:
        json.dump(data, f, indent=2)


def add_job(
    company: str,
    title: str,
    status: str = "wishlist",
    date_applied: str = "",
    url: str = "",
    salary_min: str = "",
    salary_max: str = "",
    notes: str = "",
    contacts: list = None,
    follow_up_date: str = "",
    linked_session_id: str = None,
    source: str = "manual",
) -> dict:
    """Add a new job entry. Returns the created entry."""
    data = load_tracker()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = {
        "id": f"trk_{uuid.uuid4().hex[:8]}",
        "company": company,
        "title": title,
        "status": status,
        "date_applied": date_applied or now.split(" ")[0],
        "url": url,
        "salary_min": salary_min,
        "salary_max": salary_max,
        "notes": notes,
        "contacts": contacts or [],
        "follow_up_date": follow_up_date,
        "linked_session_id": linked_session_id,
        "source": source,
        "created_at": now,
        "updated_at": now,
    }
    data["jobs"].insert(0, entry)  # newest first
    save_tracker(data)
    return entry


def update_job(job_id: str, updates: dict) -> bool:
    """Update fields on an existing job entry. Returns True if found and updated."""
    data = load_tracker()
    for job in data["jobs"]:
        if job["id"] == job_id:
            for k, v in updates.items():
                if k != "id":  # never overwrite id
                    job[k] = v
            job["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            save_tracker(data)
            return True
    return False


def delete_job(job_id: str) -> bool:
    """Delete a job entry by ID. Returns True if found and deleted."""
    data = load_tracker()
    before = len(data["jobs"])
    data["jobs"] = [j for j in data["jobs"] if j["id"] != job_id]
    if len(data["jobs"]) < before:
        save_tracker(data)
        return True
    return False


def import_from_session(session_id: str, selected_job: dict, status: str = "applied") -> dict:
    """
    Import a job from a session's selected_job into the tracker.
    Prevents duplicate imports for the same session_id + job title combo.
    Returns the created (or existing) entry.
    """
    data = load_tracker()

    # Check for existing import from this session with same title
    for job in data["jobs"]:
        if (job.get("linked_session_id") == session_id and
                job.get("title") == selected_job.get("title")):
            return job  # already imported

    salary = selected_job.get("salary", "")
    salary_min = ""
    salary_max = ""
    if salary and "-" in salary:
        parts = salary.split("-")
        salary_min = parts[0].strip()
        salary_max = parts[-1].strip()
    elif salary:
        salary_min = salary

    return add_job(
        company=selected_job.get("company", "Unknown Company"),
        title=selected_job.get("title", "Unknown Position"),
        status=status,
        url=selected_job.get("url", ""),
        salary_min=salary_min,
        salary_max=salary_max,
        notes="",
        linked_session_id=session_id,
        source="imported",
    )


def get_jobs_by_status(status: str = None) -> list:
    """Get jobs filtered by status. If status is None or 'all', returns all."""
    data = load_tracker()
    if status is None or status == "all":
        return data["jobs"]
    return [j for j in data["jobs"] if j["status"] == status]
