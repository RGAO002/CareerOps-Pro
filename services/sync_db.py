"""
Sync PostgreSQL connection helper for services running in threads.

Provides a sqlite3-compatible interface (conn.execute(), row dict access)
backed by psycopg2 so existing sync service code needs minimal changes.
"""
import os
import re

import psycopg2
import psycopg2.extras
import psycopg2.extensions


def _to_pg(sql: str) -> str:
    """Replace SQLite ? placeholders with psycopg2 %s."""
    return sql.replace("?", "%s")


class _SyncCursor:
    """Minimal sqlite3 cursor compatibility wrapper around a psycopg2 cursor."""

    def __init__(self, cur: psycopg2.extensions.cursor):
        self._cur = cur

    def fetchone(self):
        row = self._cur.fetchone()
        return dict(row) if row is not None else None

    def fetchall(self):
        return [dict(r) for r in self._cur.fetchall()]

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    def __iter__(self):
        return (dict(r) for r in self._cur)


class _SyncConn:
    """sqlite3-compatible wrapper around a psycopg2 connection."""

    def __init__(self, conn):
        self._conn = conn

    @property
    def row_factory(self):
        return None

    @row_factory.setter
    def row_factory(self, value):
        pass  # always use RealDictCursor; sqlite3.Row assignment is a no-op

    def _cursor(self):
        return self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql: str, params=None) -> _SyncCursor:
        cur = self._cursor()
        cur.execute(_to_pg(sql), list(params) if params else None)
        return _SyncCursor(cur)

    def executemany(self, sql: str, params_seq) -> None:
        cur = self._cursor()
        psycopg2.extras.execute_batch(cur, _to_pg(sql), list(params_seq))
        cur.close()

    def executescript(self, sql: str) -> None:
        """Run multiple semicolon-separated SQL statements."""
        cur = self._conn.cursor()
        stmts = _split_sql(sql)
        for stmt in stmts:
            cur.execute(stmt)
        cur.close()

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def _split_sql(script: str) -> list[str]:
    """Split a SQL script into individual statements, skipping empty ones.

    Naive semicolon split is fine here — none of our scripts use PL/pgSQL
    dollar-quoting or embedded semicolons inside strings.
    """
    return [s.strip() for s in script.split(";") if s.strip()]


def get_sync_db() -> _SyncConn:
    """Return a sync PostgreSQL connection wrapped in the sqlite3-compatible interface."""
    url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(url, sslmode="require")
    return _SyncConn(conn)
