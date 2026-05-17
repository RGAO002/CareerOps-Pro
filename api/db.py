"""
Database layer — async SQLite via aiosqlite.

Keeps things simple: raw SQL + aiosqlite, no ORM overhead.

Schema layout:
  • User-facing tables (pre-existing): resumes, jobs (personal tracker), tailored_resumes
  • Public H1B job engine (new): h1b_sponsors, companies, job_listings (+ FTS5),
    ingest_runs, listing_reports
"""
import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "careeops.db"

SCHEMA_SQL = """
-- ============================================================
-- User-facing tables (pre-existing)
-- ============================================================

CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    filename TEXT NOT NULL,
    resume_data JSON NOT NULL,
    pdf_bytes BLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT DEFAULT '',
    work_type TEXT DEFAULT '',
    url TEXT DEFAULT '',
    jd_summary TEXT DEFAULT '',
    jd_text TEXT DEFAULT '',
    requirements JSON DEFAULT '[]',
    match_score INTEGER DEFAULT 0,
    gaps JSON DEFAULT '[]',
    tailoring_tips JSON DEFAULT '[]',
    status TEXT DEFAULT 'to_tailor',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tailored_resumes (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id TEXT REFERENCES resumes(id) ON DELETE CASCADE,
    tailored_data JSON NOT NULL,
    html_cache TEXT,
    pdf_bytes BLOB,
    changes_summary TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, resume_id)
);

-- ============================================================
-- Public H1B job engine tables (new)
-- ============================================================

-- h1b_sponsors: DOL OFLC LCA disclosure facts (append-only, quarterly import).
-- One row = one LCA record. The authoritative evidence table.
CREATE TABLE IF NOT EXISTS h1b_sponsors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number        TEXT NOT NULL,
    employer_name_raw  TEXT NOT NULL,
    employer_name_norm TEXT NOT NULL,
    fein               TEXT,
    job_title          TEXT,
    soc_code           TEXT,
    worksite_city      TEXT,
    worksite_state     TEXT,
    worksite_postal    TEXT,
    wage_rate_from     REAL,
    wage_rate_to       REAL,
    wage_unit          TEXT,
    case_status        TEXT NOT NULL,
    visa_class         TEXT,
    received_date      TEXT,
    decision_date      TEXT,
    period_start       TEXT,
    period_end         TEXT,
    source_file        TEXT NOT NULL,
    imported_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(case_number, source_file)
);
CREATE INDEX IF NOT EXISTS idx_h1b_employer_norm ON h1b_sponsors(employer_name_norm);
CREATE INDEX IF NOT EXISTS idx_h1b_city_state    ON h1b_sponsors(worksite_city, worksite_state);
CREATE INDEX IF NOT EXISTS idx_h1b_decision_date ON h1b_sponsors(decision_date);
CREATE INDEX IF NOT EXISTS idx_h1b_status_visa   ON h1b_sponsors(case_status, visa_class);

-- companies: deduped H1B sponsor master table.
-- Populated manually via seed CSV, enriched by DOL LCA aggregation.
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug               TEXT UNIQUE NOT NULL,
    display_name       TEXT NOT NULL,
    normalized_name    TEXT NOT NULL,
    aliases            JSON DEFAULT '[]',
    domain             TEXT,
    careers_url        TEXT,
    ats_vendor         TEXT,
    ats_slug           TEXT,
    ats_config         JSON DEFAULT '{}',
    hq_city            TEXT,
    hq_state           TEXT,
    industry           TEXT,
    is_bodyshop        INTEGER DEFAULT 0,
    is_active          INTEGER DEFAULT 1,
    h1b_lca_count_1y   INTEGER DEFAULT 0,
    h1b_lca_count_3y   INTEGER DEFAULT 0,
    -- USCIS H-1B Employer Data Hub: actual approval counts (more authoritative
    -- than DOL LCA, which are applications). Populated by services/h1b/uscis_loader.py.
    uscis_h1b_approvals_1y INTEGER DEFAULT 0,
    uscis_h1b_approvals_3y INTEGER DEFAULT 0,
    last_fetched_at    TIMESTAMP,
    last_fetch_status  TEXT,
    last_fetch_error   TEXT,
    consecutive_fetch_errors INTEGER DEFAULT 0,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_companies_normalized ON companies(normalized_name);
CREATE INDEX IF NOT EXISTS idx_companies_ats        ON companies(ats_vendor, is_active);

-- uscis_h1b_approvals: per-employer per-FY pre-aggregated USCIS data.
-- Source: https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub
-- Each USCIS CSV row is one (FY, employer, worksite_state) triple; we collapse
-- by (employer_norm, FY) so a company with many subsidiary entities has
-- one row per FY summing all approvals/denials.
CREATE TABLE IF NOT EXISTS uscis_h1b_approvals (
    employer_name_norm    TEXT NOT NULL,
    fiscal_year           INTEGER NOT NULL,
    initial_approvals     INTEGER NOT NULL DEFAULT 0,
    initial_denials       INTEGER NOT NULL DEFAULT 0,
    continuing_approvals  INTEGER NOT NULL DEFAULT 0,
    continuing_denials    INTEGER NOT NULL DEFAULT 0,
    total_approvals       INTEGER NOT NULL DEFAULT 0,  -- initial + continuing
    employer_name_sample  TEXT,                        -- one raw form for human review
    primary_state         TEXT,                        -- most common worksite state
    PRIMARY KEY (employer_name_norm, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_uscis_employer ON uscis_h1b_approvals(employer_name_norm);
CREATE INDEX IF NOT EXISTS idx_uscis_fy       ON uscis_h1b_approvals(fiscal_year);

-- job_listings: live public job pool. Aggressively upserted on every ATS refresh.
CREATE TABLE IF NOT EXISTS job_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    external_id        TEXT NOT NULL,
    source             TEXT NOT NULL,
    title              TEXT NOT NULL,
    location_raw       TEXT DEFAULT '',
    location_city      TEXT DEFAULT '',
    location_state     TEXT DEFAULT '',
    location_country   TEXT DEFAULT '',
    is_nyc_metro       INTEGER DEFAULT 0,
    location_tier      TEXT DEFAULT '',
    work_type          TEXT DEFAULT '',
    department         TEXT DEFAULT '',
    team               TEXT DEFAULT '',
    employment_type    TEXT DEFAULT '',
    description_html   TEXT DEFAULT '',
    description_text   TEXT DEFAULT '',
    requirements       JSON DEFAULT '[]',
    salary_min         REAL,
    salary_max         REAL,
    salary_currency    TEXT DEFAULT 'USD',
    apply_url          TEXT NOT NULL,
    posted_at          TEXT,
    updated_ats_at     TEXT,
    first_seen_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active          INTEGER DEFAULT 1,
    -- Extracted from JD by services/ingestion/jd_extractor.py.
    -- All optional; '' / NULL means "couldn't determine".
    level              TEXT DEFAULT '',
    years_min          INTEGER,
    sponsorship_signal TEXT DEFAULT '',
    UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_jl_company     ON job_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_jl_nyc_active  ON job_listings(is_nyc_metro, is_active);
CREATE INDEX IF NOT EXISTS idx_jl_last_seen   ON job_listings(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_jl_posted_at   ON job_listings(posted_at);
CREATE INDEX IF NOT EXISTS idx_jl_location_tier ON job_listings(location_tier);

-- FTS5 virtual table for full-text search on title + description_text + department.
CREATE VIRTUAL TABLE IF NOT EXISTS job_listings_fts USING fts5(
    title, description_text, department,
    content='job_listings',
    content_rowid='id'
);

-- Triggers to keep FTS in sync with job_listings.
CREATE TRIGGER IF NOT EXISTS job_listings_ai AFTER INSERT ON job_listings BEGIN
    INSERT INTO job_listings_fts(rowid, title, description_text, department)
    VALUES (new.id, new.title, new.description_text, new.department);
END;
CREATE TRIGGER IF NOT EXISTS job_listings_ad AFTER DELETE ON job_listings BEGIN
    INSERT INTO job_listings_fts(job_listings_fts, rowid, title, description_text, department)
    VALUES ('delete', old.id, old.title, old.description_text, old.department);
END;
CREATE TRIGGER IF NOT EXISTS job_listings_au AFTER UPDATE ON job_listings BEGIN
    INSERT INTO job_listings_fts(job_listings_fts, rowid, title, description_text, department)
    VALUES ('delete', old.id, old.title, old.description_text, old.department);
    INSERT INTO job_listings_fts(rowid, title, description_text, department)
    VALUES (new.id, new.title, new.description_text, new.department);
END;

-- ingest_runs: observability for the pipelines.
CREATE TABLE IF NOT EXISTS ingest_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline       TEXT NOT NULL,
    source         TEXT,
    company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    started_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at    TIMESTAMP,
    status         TEXT,
    jobs_fetched   INTEGER DEFAULT 0,
    jobs_upserted  INTEGER DEFAULT 0,
    jobs_retired   INTEGER DEFAULT 0,
    error_message  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_pipeline_time ON ingest_runs(pipeline, started_at DESC);

-- listing_reports: user-reported bad listings (quality crowdsourcing).
CREATE TABLE IF NOT EXISTS listing_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    note       TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_listing ON listing_reports(listing_id);
"""


async def get_db() -> aiosqlite.Connection:
    """Get a database connection (caller must close or use as context manager)."""
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def _add_column_if_missing(db, table: str, column: str, ddl: str) -> None:
    """Idempotently add a column to an existing table using PRAGMA table_info."""
    cursor = await db.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in await cursor.fetchall()}
    if column not in existing:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


async def init_db():
    """Create tables if they don't exist and apply additive migrations."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)
        # Additive migration: link user tracker rows back to the public job_listings they came from.
        await _add_column_if_missing(
            db,
            "jobs",
            "source_listing_id",
            "source_listing_id INTEGER REFERENCES job_listings(id) ON DELETE SET NULL",
        )
        # Additive migrations for jd_extractor outputs. Existing DBs predate
        # these columns; CREATE TABLE IF NOT EXISTS in SCHEMA_SQL won't add
        # them, so we ALTER explicitly.
        await _add_column_if_missing(
            db, "job_listings", "level",
            "level TEXT DEFAULT ''",
        )
        await _add_column_if_missing(
            db, "job_listings", "years_min",
            "years_min INTEGER",
        )
        await _add_column_if_missing(
            db, "job_listings", "sponsorship_signal",
            "sponsorship_signal TEXT DEFAULT ''",
        )
        # Embedding column for semantic match. Stored as raw float32 BLOB
        # (1536 dim × 4 bytes = 6144 bytes/row). Computed by
        # services.matching.embed.compute_all_embeddings; NULL until then.
        await _add_column_if_missing(
            db, "job_listings", "embedding",
            "embedding BLOB",
        )
        # USCIS H-1B approval counts (FY2021-2023 aggregated per company).
        # 1y / 3y mirror the DOL LCA columns but use USCIS approvals — actual
        # decisions, not applications.
        await _add_column_if_missing(
            db, "companies", "uscis_h1b_approvals_1y",
            "uscis_h1b_approvals_1y INTEGER DEFAULT 0",
        )
        await _add_column_if_missing(
            db, "companies", "uscis_h1b_approvals_3y",
            "uscis_h1b_approvals_3y INTEGER DEFAULT 0",
        )
        await db.commit()
    finally:
        await db.close()
