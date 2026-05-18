"""
Database layer — async PostgreSQL via asyncpg (Supabase).
"""
import asyncpg
import os
import re
import ssl
import sys
from typing import Optional
from urllib.parse import urlparse, unquote

_pool: Optional[asyncpg.Pool] = None

# ──────────────────────────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────────────────────────

_SCHEMA_STMTS = [
    """
    CREATE TABLE IF NOT EXISTS resumes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        filename TEXT NOT NULL,
        resume_data TEXT NOT NULL,
        pdf_bytes BYTEA,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
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
        requirements TEXT DEFAULT '[]',
        match_score INTEGER DEFAULT 0,
        gaps TEXT DEFAULT '[]',
        tailoring_tips TEXT DEFAULT '[]',
        status TEXT DEFAULT 'to_tailor',
        notes TEXT DEFAULT '',
        source_listing_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tailored_resumes (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
        resume_id TEXT REFERENCES resumes(id) ON DELETE CASCADE,
        tailored_data TEXT NOT NULL,
        html_cache TEXT,
        pdf_bytes BYTEA,
        changes_summary TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_id, resume_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS h1b_sponsors (
        id BIGSERIAL PRIMARY KEY,
        case_number        TEXT NOT NULL,
        employer_name_raw  TEXT NOT NULL,
        employer_name_norm TEXT NOT NULL,
        fein               TEXT,
        job_title          TEXT,
        soc_code           TEXT,
        worksite_city      TEXT,
        worksite_state     TEXT,
        worksite_postal    TEXT,
        wage_rate_from     DOUBLE PRECISION,
        wage_rate_to       DOUBLE PRECISION,
        wage_unit          TEXT,
        case_status        TEXT NOT NULL,
        visa_class         TEXT,
        received_date      TEXT,
        decision_date      TEXT,
        period_start       TEXT,
        period_end         TEXT,
        source_file        TEXT NOT NULL,
        imported_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(case_number, source_file)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_h1b_employer_norm ON h1b_sponsors(employer_name_norm)",
    "CREATE INDEX IF NOT EXISTS idx_h1b_city_state    ON h1b_sponsors(worksite_city, worksite_state)",
    "CREATE INDEX IF NOT EXISTS idx_h1b_decision_date ON h1b_sponsors(decision_date)",
    "CREATE INDEX IF NOT EXISTS idx_h1b_status_visa   ON h1b_sponsors(case_status, visa_class)",
    """
    CREATE TABLE IF NOT EXISTS companies (
        id BIGSERIAL PRIMARY KEY,
        slug               TEXT UNIQUE NOT NULL,
        display_name       TEXT NOT NULL,
        normalized_name    TEXT NOT NULL,
        aliases            TEXT DEFAULT '[]',
        domain             TEXT,
        careers_url        TEXT,
        ats_vendor         TEXT,
        ats_slug           TEXT,
        ats_config         TEXT DEFAULT '{}',
        hq_city            TEXT,
        hq_state           TEXT,
        industry           TEXT,
        is_bodyshop        INTEGER DEFAULT 0,
        is_active          INTEGER DEFAULT 1,
        h1b_lca_count_1y   INTEGER DEFAULT 0,
        h1b_lca_count_3y   INTEGER DEFAULT 0,
        uscis_h1b_approvals_1y INTEGER DEFAULT 0,
        uscis_h1b_approvals_3y INTEGER DEFAULT 0,
        last_fetched_at    TIMESTAMPTZ,
        last_fetch_status  TEXT,
        last_fetch_error   TEXT,
        consecutive_fetch_errors INTEGER DEFAULT 0,
        created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_companies_normalized ON companies(normalized_name)",
    "CREATE INDEX IF NOT EXISTS idx_companies_ats        ON companies(ats_vendor, is_active)",
    """
    CREATE TABLE IF NOT EXISTS uscis_h1b_approvals (
        employer_name_norm    TEXT NOT NULL,
        fiscal_year           INTEGER NOT NULL,
        initial_approvals     INTEGER NOT NULL DEFAULT 0,
        initial_denials       INTEGER NOT NULL DEFAULT 0,
        continuing_approvals  INTEGER NOT NULL DEFAULT 0,
        continuing_denials    INTEGER NOT NULL DEFAULT 0,
        total_approvals       INTEGER NOT NULL DEFAULT 0,
        employer_name_sample  TEXT,
        primary_state         TEXT,
        PRIMARY KEY (employer_name_norm, fiscal_year)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_uscis_employer ON uscis_h1b_approvals(employer_name_norm)",
    "CREATE INDEX IF NOT EXISTS idx_uscis_fy       ON uscis_h1b_approvals(fiscal_year)",
    """
    CREATE TABLE IF NOT EXISTS job_listings (
        id BIGSERIAL PRIMARY KEY,
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
        requirements       TEXT DEFAULT '[]',
        salary_min         DOUBLE PRECISION,
        salary_max         DOUBLE PRECISION,
        salary_currency    TEXT DEFAULT 'USD',
        apply_url          TEXT NOT NULL,
        posted_at          TEXT,
        updated_ats_at     TEXT,
        first_seen_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_seen_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        is_active          INTEGER DEFAULT 1,
        level              TEXT DEFAULT '',
        years_min          INTEGER,
        sponsorship_signal TEXT DEFAULT '',
        embedding          BYTEA,
        UNIQUE(source, external_id)
    )
    """,
    # search_vector: added via additive migration below so ALTER TABLE is idempotent.
    "CREATE INDEX IF NOT EXISTS idx_jl_company       ON job_listings(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_jl_nyc_active    ON job_listings(is_nyc_metro, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_jl_last_seen     ON job_listings(last_seen_at)",
    "CREATE INDEX IF NOT EXISTS idx_jl_posted_at     ON job_listings(posted_at)",
    "CREATE INDEX IF NOT EXISTS idx_jl_location_tier ON job_listings(location_tier)",
    """
    CREATE TABLE IF NOT EXISTS ingest_runs (
        id BIGSERIAL PRIMARY KEY,
        pipeline       TEXT NOT NULL,
        source         TEXT,
        company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        started_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        finished_at    TIMESTAMPTZ,
        status         TEXT,
        jobs_fetched   INTEGER DEFAULT 0,
        jobs_upserted  INTEGER DEFAULT 0,
        jobs_retired   INTEGER DEFAULT 0,
        error_message  TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ingest_pipeline_time ON ingest_runs(pipeline, started_at DESC)",
    """
    CREATE TABLE IF NOT EXISTS listing_reports (
        id BIGSERIAL PRIMARY KEY,
        listing_id INTEGER NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
        reason     TEXT NOT NULL,
        note       TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_reports_listing ON listing_reports(listing_id)",
]

# Additive migration: generated tsvector column for full-text search.
_SEARCH_VECTOR_MIGRATION = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_listings' AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE job_listings ADD COLUMN search_vector TSVECTOR
            GENERATED ALWAYS AS (
                to_tsvector('english',
                    coalesce(title, '') || ' ' ||
                    coalesce(description_text, '') || ' ' ||
                    coalesce(department, '')
                )
            ) STORED;
    END IF;
END $$
"""

_SEARCH_VECTOR_INDEX = (
    "CREATE INDEX IF NOT EXISTS idx_jl_fts ON job_listings USING GIN(search_vector)"
)


# ──────────────────────────────────────────────────────────────────
# Compatibility wrapper (aiosqlite-compatible interface on asyncpg)
# ──────────────────────────────────────────────────────────────────

def _to_pg(sql: str) -> str:
    """Replace SQLite ? positional placeholders with PostgreSQL $1, $2, ..."""
    n = 0
    out: list[str] = []
    for ch in sql:
        if ch == "?":
            n += 1
            out.append(f"${n}")
        else:
            out.append(ch)
    return "".join(out)


def _parse_rowcount(status: str) -> int:
    """Parse affected-row count from asyncpg status string (e.g. 'UPDATE 5')."""
    try:
        return int(status.split()[-1])
    except (ValueError, IndexError):
        return 0


class _Cursor:
    """Minimal aiosqlite-compatible cursor wrapping asyncpg results."""

    def __init__(self, rows, rowcount: int = 0):
        self._rows = rows if rows is not None else []
        self.rowcount: int = rowcount

    async def fetchall(self):
        return list(self._rows)

    async def fetchone(self):
        return self._rows[0] if self._rows else None


class _Conn:
    """aiosqlite-compatible wrapper around an asyncpg connection from the pool."""

    def __init__(self, conn: asyncpg.Connection, pool: asyncpg.Pool):
        self._conn = conn
        self._pool = pool

    async def execute(self, sql: str, params=None) -> _Cursor:
        pg_sql = _to_pg(sql)
        args = list(params) if params else []
        stripped = sql.strip().upper()
        is_read = stripped.startswith(("SELECT", "WITH"))
        has_returning = "RETURNING" in stripped

        if is_read or has_returning:
            rows = await self._conn.fetch(pg_sql, *args)
            return _Cursor(rows, len(rows))
        else:
            status = await self._conn.execute(pg_sql, *args)
            return _Cursor([], _parse_rowcount(status))

    async def executemany(self, sql: str, params_seq) -> None:
        pg_sql = _to_pg(sql)
        await self._conn.executemany(pg_sql, [list(p) for p in params_seq])

    async def commit(self) -> None:
        pass  # asyncpg auto-commits DDL/DML outside explicit transactions

    async def close(self) -> None:
        await self._pool.release(self._conn)


# ──────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────

async def get_db() -> _Conn:
    """Acquire a connection from the pool wrapped in the aiosqlite-compatible interface."""
    conn = await _pool.acquire()
    return _Conn(conn, _pool)


async def init_db() -> None:
    """Create connection pool, apply schema, and run additive migrations."""
    global _pool
    raw_url = os.environ.get("DATABASE_URL", "")
    if not raw_url:
        print("FATAL: DATABASE_URL is not set", file=sys.stderr, flush=True)
        sys.exit(1)

    # Parse URL manually so asyncpg doesn't choke on special chars in the
    # password (e.g. '!'). Use a custom SSL context that encrypts the
    # connection but skips certificate verification — required because
    # Supabase uses a self-signed intermediate CA that Python rejects.
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    try:
        parsed = urlparse(raw_url)
        _pool = await asyncpg.create_pool(
            host=parsed.hostname,
            port=parsed.port or 5432,
            user=unquote(parsed.username or ""),
            password=unquote(parsed.password or ""),
            database=(parsed.path or "/postgres").lstrip("/"),
            min_size=1,
            max_size=10,
            ssl=ssl_ctx,
        )
    except Exception as exc:
        print(f"FATAL: asyncpg pool creation failed: {exc}", file=sys.stderr, flush=True)
        raise

    try:
        async with _pool.acquire() as conn:
            for stmt in _SCHEMA_STMTS:
                stmt = stmt.strip()
                if stmt:
                    await conn.execute(stmt)
            await conn.execute(_SEARCH_VECTOR_MIGRATION)
            await conn.execute(_SEARCH_VECTOR_INDEX)
    except Exception as exc:
        print(f"FATAL: schema init failed: {exc}", file=sys.stderr, flush=True)
        raise
