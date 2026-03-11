"""
Job Application Tracker Service — Manage job application tracking data.
Global tracker (not per-session), persisted to saved_sessions/job_tracker.json.
"""
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

# On HuggingFace Spaces, use /data for persistent storage
if os.environ.get("SPACE_ID") and Path("/data").exists():
    TRACKER_DIR = Path("/data/saved_sessions")
else:
    TRACKER_DIR = Path(__file__).parent.parent / "saved_sessions"
TRACKER_FILE = TRACKER_DIR / "job_tracker.json"


def _clean_url(url: str) -> str:
    """Strip markdown link syntax [text](url) → url, and ensure no wrapping."""
    import re
    if not url:
        return ""
    url = url.strip()
    # Match markdown link: [text](url)
    m = re.match(r'\[.*?\]\((.*?)\)', url)
    if m:
        url = m.group(1)
    return url.strip()

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

# --- Work type definitions ---
WORK_TYPES = [
    ("", "Not specified"),
    ("onsite", "🏢 On-site"),
    ("remote", "🌐 Remote"),
    ("hybrid", "🔀 Hybrid"),
]
WORK_TYPE_LABELS = {w[0]: w[1] for w in WORK_TYPES}


def _ensure_dir():
    TRACKER_DIR.mkdir(exist_ok=True)


COLUMN_TYPES = [
    ("text", "Text"),
    ("yes_no", "Yes / No"),
    ("number", "Number"),
    ("date", "Date"),
    ("select", "Single Select"),
]

COLUMN_TYPE_LABELS = {t[0]: t[1] for t in COLUMN_TYPES}


def load_tracker() -> dict:
    """Load the tracker data. Returns {"version": 1, "jobs": [...], "custom_columns": [...]}."""
    _ensure_dir()
    if TRACKER_FILE.exists():
        try:
            with open(TRACKER_FILE, "r") as f:
                data = json.load(f)
            # Ensure custom_columns key exists (migration)
            if "custom_columns" not in data:
                data["custom_columns"] = []
            # Migrate: ensure new fields exist on all jobs
            dirty = False
            for job in data.get("jobs", []):
                raw = job.get("url", "")
                cleaned = _clean_url(raw)
                if cleaned != raw:
                    job["url"] = cleaned
                    dirty = True
                for field, default in [("location", ""), ("work_type", ""), ("requirements", [])]:
                    if field not in job:
                        job[field] = default
                        dirty = True
            if dirty:
                with open(TRACKER_FILE, "w") as fw:
                    json.dump(data, fw, indent=2)
            return data
        except (json.JSONDecodeError, IOError):
            return {"version": 1, "jobs": [], "custom_columns": []}
    return {"version": 1, "jobs": [], "custom_columns": []}


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
    location: str = "",
    work_type: str = "",
    requirements: list = None,
    visitor_id: str = None,
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
        "url": _clean_url(url),
        "salary_min": salary_min,
        "salary_max": salary_max,
        "notes": notes,
        "contacts": contacts or [],
        "follow_up_date": follow_up_date,
        "linked_session_id": linked_session_id,
        "source": source,
        "location": location,
        "work_type": work_type,
        "requirements": requirements or [],
        "created_at": now,
        "updated_at": now,
    }
    if visitor_id:
        entry["visitor_id"] = visitor_id
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
                    if k == "url":
                        v = _clean_url(v)
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


def import_from_session(session_id: str, selected_job: dict, status: str = "applied", visitor_id: str = None) -> dict:
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

    # Extract location and work type from parsed JD
    location = selected_job.get("location", "")
    if location and location.lower() in ("not specified", "unknown", "n/a"):
        location = ""
    # Prefer the dedicated work_type field (from updated parse_custom_jd);
    # fall back to checking the employment "type" field for legacy data
    work_type = selected_job.get("work_type", "")
    if work_type not in ("onsite", "remote", "hybrid"):
        work_type_raw = selected_job.get("type", "").lower()
        work_type = ""
        if "remote" in work_type_raw:
            work_type = "remote"
        elif "hybrid" in work_type_raw:
            work_type = "hybrid"
        elif any(w in work_type_raw for w in ("on-site", "onsite", "in-office", "in office")):
            work_type = "onsite"

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
        location=location,
        work_type=work_type,
        requirements=selected_job.get("requirements", []),
        visitor_id=visitor_id,
    )


def get_jobs_by_status(status: str = None, visitor_id: str = None) -> list:
    """Get jobs filtered by status and visitor_id.
    - Local: show all jobs (no visitor_id filtering)
    - Cloud: filter by visitor_id, plus demo jobs visible to everyone
    """
    is_cloud = bool(os.environ.get("SPACE_ID"))
    data = load_tracker()
    jobs = data["jobs"]

    # Cloud: isolate by visitor_id
    if is_cloud and visitor_id:
        jobs = [j for j in jobs
                if j.get("visitor_id") == visitor_id
                or j.get("visitor_id") == "demo"]

    if status is None or status == "all":
        return jobs
    return [j for j in jobs if j["status"] == status]


def get_custom_columns() -> list:
    """Get the list of custom columns.
    Each column: {"id": "col_xxx", "name": "Industry", "type": "text", "options": [...]}
    """
    data = load_tracker()
    return data.get("custom_columns", [])


def add_custom_column(name: str, col_type: str = "text", options: list = None) -> dict:
    """Add a user-defined column. Returns the new column definition."""
    data = load_tracker()
    col = {
        "id": f"col_{uuid.uuid4().hex[:6]}",
        "name": name.strip(),
        "type": col_type,
        "options": options or [],
    }
    data["custom_columns"].append(col)
    save_tracker(data)
    return col


def delete_custom_column(col_id: str) -> bool:
    """Delete a custom column and remove its data from all jobs."""
    data = load_tracker()
    before = len(data.get("custom_columns", []))
    data["custom_columns"] = [c for c in data.get("custom_columns", []) if c["id"] != col_id]
    if len(data["custom_columns"]) < before:
        # Remove field from all jobs
        for job in data["jobs"]:
            cf = job.get("custom_fields", {})
            cf.pop(col_id, None)
        save_tracker(data)
        return True
    return False


def update_custom_field(job_id: str, col_id: str, value) -> bool:
    """Update a custom field value for a job."""
    data = load_tracker()
    for job in data["jobs"]:
        if job["id"] == job_id:
            if "custom_fields" not in job:
                job["custom_fields"] = {}
            job["custom_fields"][col_id] = value
            save_tracker(data)
            return True
    return False
