"""
DOL OFLC LCA disclosure data loader.

The U.S. Department of Labor publishes quarterly LCA disclosure datasets
covering H-1B, H-1B1, and E-3 visa applications. Each row is one filing.

Source page:
    https://www.dol.gov/agencies/eta/foreign-labor/performance

Public file URL pattern (subject to DOL CDN changes):
    https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY{YYYY}_Q{N}.xlsx

A single quarter is ~150-300k rows. We stream via openpyxl read-only mode to
keep memory bounded, and INSERT OR IGNORE into h1b_sponsors so re-runs are
fully idempotent (UNIQUE on case_number + source_file).

The h1b_sponsors table is intentionally append-only and keeps every status
(Certified / Denied / Withdrawn / ...). Filtering to "real sponsorship
evidence" happens at aggregation time, not at ingest, so the raw evidence
trail stays intact.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterator, Optional
from urllib.request import Request, urlopen

from openpyxl import load_workbook

from services.h1b.sponsor_normalize import normalize_employer_name


# DOL has rotated column names a few times across fiscal years, so for every
# field we accept multiple historical aliases. Order matters — first match wins.
CANDIDATE_COLUMNS: dict[str, list[str]] = {
    "case_number":       ["CASE_NUMBER"],
    "case_status":       ["CASE_STATUS"],
    "received_date":     ["RECEIVED_DATE"],
    "decision_date":     ["DECISION_DATE"],
    "visa_class":        ["VISA_CLASS"],
    "job_title":         ["JOB_TITLE"],
    "soc_code":          ["SOC_CODE"],
    "period_start":      ["BEGIN_DATE", "EMPLOYMENT_START_DATE"],
    "period_end":        ["END_DATE", "EMPLOYMENT_END_DATE"],
    "employer_name_raw": ["EMPLOYER_NAME"],
    "fein":              ["EMPLOYER_FEIN", "FEIN"],
    "worksite_city":     ["WORKSITE_CITY", "WORKSITE_CITY_1"],
    "worksite_state":    ["WORKSITE_STATE", "WORKSITE_STATE_1"],
    "worksite_postal":   ["WORKSITE_POSTAL_CODE", "WORKSITE_POSTAL_CODE_1"],
    "wage_rate_from":    ["WAGE_RATE_OF_PAY_FROM", "WAGE_RATE_OF_PAY_FROM_1"],
    "wage_rate_to":      ["WAGE_RATE_OF_PAY_TO", "WAGE_RATE_OF_PAY_TO_1"],
    "wage_unit":         ["WAGE_UNIT_OF_PAY", "WAGE_UNIT_OF_PAY_1"],
}

REQUIRED = ("case_number", "employer_name_raw", "case_status")


@dataclass
class LCARecord:
    case_number: str
    employer_name_raw: str
    employer_name_norm: str
    fein: Optional[str]
    job_title: Optional[str]
    soc_code: Optional[str]
    worksite_city: Optional[str]
    worksite_state: Optional[str]
    worksite_postal: Optional[str]
    wage_rate_from: Optional[float]
    wage_rate_to: Optional[float]
    wage_unit: Optional[str]
    case_status: str
    visa_class: Optional[str]
    received_date: Optional[str]
    decision_date: Optional[str]
    period_start: Optional[str]
    period_end: Optional[str]


def _resolve_columns(header: list) -> dict[str, int]:
    """Map our internal field names to column indices in the XLSX header.

    Raises ValueError if any field in REQUIRED is missing — we'd rather fail
    loudly on a schema change than silently store NULLs.
    """
    upper = [str(h).strip().upper() if h is not None else "" for h in header]
    resolved: dict[str, int] = {}
    for field, candidates in CANDIDATE_COLUMNS.items():
        for cand in candidates:
            if cand in upper:
                resolved[field] = upper.index(cand)
                break
    missing = [k for k in REQUIRED if k not in resolved]
    if missing:
        raise ValueError(
            f"DOL file missing required columns: {missing}. "
            f"Header preview: {upper[:30]}"
        )
    return resolved


def _to_str(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _to_float(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


_DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y", "%m/%d/%y")


def _to_date_str(v) -> Optional[str]:
    """Coerce an Excel cell to ISO YYYY-MM-DD, or None if unparseable."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s:
        return None
    head = s.split()[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(head, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return head[:10] if len(head) >= 10 else None


def iter_lca_records(xlsx_path: Path) -> Iterator[LCARecord]:
    """Stream LCA records from a DOL quarterly XLSX file.

    Uses openpyxl read-only mode so 50-100 MB / 200k+ row files do not blow
    memory. Skips rows missing required fields silently — DOL files always
    have a few empty/footer rows.
    """
    wb = load_workbook(filename=str(xlsx_path), read_only=True, data_only=True)
    try:
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        header = next(rows, None)
        if header is None:
            return
        col = _resolve_columns(list(header))

        def cell(row, field):
            idx = col.get(field)
            if idx is None or idx >= len(row):
                return None
            return row[idx]

        for row in rows:
            case_number = _to_str(cell(row, "case_number"))
            employer_raw = _to_str(cell(row, "employer_name_raw"))
            case_status = _to_str(cell(row, "case_status"))
            if not case_number or not employer_raw or not case_status:
                continue
            yield LCARecord(
                case_number=case_number,
                employer_name_raw=employer_raw,
                employer_name_norm=normalize_employer_name(employer_raw),
                fein=_to_str(cell(row, "fein")),
                job_title=_to_str(cell(row, "job_title")),
                soc_code=_to_str(cell(row, "soc_code")),
                worksite_city=_to_str(cell(row, "worksite_city")),
                worksite_state=_to_str(cell(row, "worksite_state")),
                worksite_postal=_to_str(cell(row, "worksite_postal")),
                wage_rate_from=_to_float(cell(row, "wage_rate_from")),
                wage_rate_to=_to_float(cell(row, "wage_rate_to")),
                wage_unit=_to_str(cell(row, "wage_unit")),
                case_status=case_status,
                visa_class=_to_str(cell(row, "visa_class")),
                received_date=_to_date_str(cell(row, "received_date")),
                decision_date=_to_date_str(cell(row, "decision_date")),
                period_start=_to_date_str(cell(row, "period_start")),
                period_end=_to_date_str(cell(row, "period_end")),
            )
    finally:
        wb.close()


_INSERT_SQL = """
INSERT OR IGNORE INTO h1b_sponsors (
    case_number, employer_name_raw, employer_name_norm, fein,
    job_title, soc_code,
    worksite_city, worksite_state, worksite_postal,
    wage_rate_from, wage_rate_to, wage_unit,
    case_status, visa_class,
    received_date, decision_date, period_start, period_end,
    source_file
) VALUES (
    ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?,
    ?
)
"""


def import_lca_file(
    xlsx_path: Path,
    db_path: Path,
    batch_size: int = 2000,
    progress_every: int = 25_000,
) -> dict:
    """Import an LCA XLSX file into h1b_sponsors. Idempotent across re-runs.

    Returns a stats dict: read / inserted / skipped / source_file.
    "skipped" includes both UNIQUE collisions (already-imported rows) and
    rows the streamer dropped for missing required fields.
    """
    source_file = xlsx_path.name
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA temp_store=MEMORY")

        read = 0
        inserted = 0
        batch: list[tuple] = []

        for rec in iter_lca_records(xlsx_path):
            read += 1
            batch.append((
                rec.case_number, rec.employer_name_raw, rec.employer_name_norm, rec.fein,
                rec.job_title, rec.soc_code,
                rec.worksite_city, rec.worksite_state, rec.worksite_postal,
                rec.wage_rate_from, rec.wage_rate_to, rec.wage_unit,
                rec.case_status, rec.visa_class,
                rec.received_date, rec.decision_date, rec.period_start, rec.period_end,
                source_file,
            ))
            if len(batch) >= batch_size:
                cur = conn.executemany(_INSERT_SQL, batch)
                inserted += cur.rowcount or 0
                conn.commit()
                batch.clear()
            if progress_every and read % progress_every == 0:
                print(
                    f"[dol] {source_file}: read={read:>9,} inserted={inserted:>9,}",
                    flush=True,
                )

        if batch:
            cur = conn.executemany(_INSERT_SQL, batch)
            inserted += cur.rowcount or 0
            conn.commit()

        return {
            "read": read,
            "inserted": inserted,
            "skipped": read - inserted,
            "source_file": source_file,
        }
    finally:
        conn.close()


def download_lca_file(
    url: str,
    dest_dir: Path,
    chunk_size: int = 1024 * 1024,
) -> Path:
    """Download a DOL XLSX to dest_dir/<basename>. Skips if already present.

    Returns the local file path.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = url.rsplit("/", 1)[-1]
    out = dest_dir / name
    if out.exists() and out.stat().st_size > 0:
        print(f"[dol] already cached: {out} ({out.stat().st_size:,} bytes)")
        return out

    req = Request(url, headers={"User-Agent": "CareerOpsPro-LCA/1.0"})
    print(f"[dol] downloading {url} ...")
    with urlopen(req, timeout=180) as resp, open(out, "wb") as f:
        size = 0
        last_logged = 0
        while True:
            chunk = resp.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)
            size += len(chunk)
            if size - last_logged >= 10 * 1024 * 1024:
                print(f"[dol] ...{size / 1024 / 1024:.0f} MB", flush=True)
                last_logged = size
    print(f"[dol] saved {out} ({out.stat().st_size:,} bytes)")
    return out
