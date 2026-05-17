"""
Seed loader — populate the ``companies`` table from a CSV.

The seed CSV is the Tier 1 source of truth for ATS ↔ company mapping in
Phase 1. Each row has been manually verified by visiting the ATS URL
(e.g. https://boards-api.greenhouse.io/v1/boards/{slug}/jobs).

CSV columns:
    slug              internal slug, e.g. 'stripe'
    display_name      user-facing name
    aliases           pipe-separated ("Stripe Inc|Stripe Payments Company")
    domain            company domain
    ats_vendor        'greenhouse','lever','ashby','workday','smartrecruiters','workable'
    ats_slug          vendor-specific identifier
    ats_config_json   raw JSON for vendor extras (use '{}' if none)
    industry          'fintech','tech','hedge-fund',...
    hq_city
    hq_state
    is_bodyshop       '0' or '1'

Importer is idempotent: upsert on the unique ``slug`` column.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterable

from api.db import get_db
from services.h1b.sponsor_normalize import normalize_employer_name

SEED_PATH = Path(__file__).parent.parent.parent / "data" / "seed" / "nyc_h1b_companies.csv"


def _parse_aliases(raw: str) -> list[str]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.split("|")]
    return [p for p in parts if p]


def _parse_rows(path: Path) -> Iterable[dict]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            slug = (row.get("slug") or "").strip()
            if not slug:
                continue
            display_name = (row.get("display_name") or "").strip()
            aliases = _parse_aliases(row.get("aliases") or "")
            ats_config_raw = (row.get("ats_config_json") or "{}").strip() or "{}"
            try:
                # Validate — we still store the raw JSON string in the DB.
                json.loads(ats_config_raw)
            except json.JSONDecodeError:
                ats_config_raw = "{}"

            yield {
                "slug": slug,
                "display_name": display_name,
                "normalized_name": normalize_employer_name(display_name),
                "aliases": aliases,
                "domain": (row.get("domain") or "").strip(),
                "ats_vendor": (row.get("ats_vendor") or "").strip().lower(),
                "ats_slug": (row.get("ats_slug") or "").strip(),
                "ats_config": ats_config_raw,
                "industry": (row.get("industry") or "").strip(),
                "hq_city": (row.get("hq_city") or "").strip(),
                "hq_state": (row.get("hq_state") or "").strip(),
                "is_bodyshop": 1 if (row.get("is_bodyshop") or "0").strip() == "1" else 0,
            }


async def load_seed_companies(
    path: Path | None = None,
    prune: bool = True,
) -> dict:
    """Upsert seed companies into the ``companies`` table.

    The seed CSV is treated as the source of truth: by default, any company
    already in the DB whose slug is not in the CSV is marked ``is_active=0``
    (soft-deactivated, not hard-deleted, so ingest_runs history and any
    tracker rows referencing them stay intact).

    Args:
        path: Optional override path to the CSV file.
        prune: If True, deactivate companies not present in the CSV.

    Returns:
        ``{inserted, updated, pruned, total}``
    """
    csv_path = path or SEED_PATH
    if not csv_path.exists():
        raise FileNotFoundError(f"Seed CSV not found at {csv_path}")

    rows = list(_parse_rows(csv_path))
    inserted = 0
    updated = 0
    pruned = 0

    db = await get_db()
    try:
        for row in rows:
            cursor = await db.execute(
                "SELECT id FROM companies WHERE slug = ?", (row["slug"],)
            )
            existing = await cursor.fetchone()

            if existing is None:
                await db.execute(
                    """
                    INSERT INTO companies (
                        slug, display_name, normalized_name, aliases,
                        domain, ats_vendor, ats_slug, ats_config,
                        hq_city, hq_state, industry, is_bodyshop, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        row["slug"],
                        row["display_name"],
                        row["normalized_name"],
                        json.dumps(row["aliases"]),
                        row["domain"],
                        row["ats_vendor"],
                        row["ats_slug"],
                        row["ats_config"],
                        row["hq_city"],
                        row["hq_state"],
                        row["industry"],
                        row["is_bodyshop"],
                    ),
                )
                inserted += 1
            else:
                await db.execute(
                    """
                    UPDATE companies
                    SET display_name = ?,
                        normalized_name = ?,
                        aliases = ?,
                        domain = ?,
                        ats_vendor = ?,
                        ats_slug = ?,
                        ats_config = ?,
                        hq_city = ?,
                        hq_state = ?,
                        industry = ?,
                        is_bodyshop = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE slug = ?
                    """,
                    (
                        row["display_name"],
                        row["normalized_name"],
                        json.dumps(row["aliases"]),
                        row["domain"],
                        row["ats_vendor"],
                        row["ats_slug"],
                        row["ats_config"],
                        row["hq_city"],
                        row["hq_state"],
                        row["industry"],
                        row["is_bodyshop"],
                        row["slug"],
                    ),
                )
                updated += 1

        if prune:
            seed_slugs = {row["slug"] for row in rows}
            cursor = await db.execute(
                "SELECT id, slug FROM companies WHERE is_active = 1"
            )
            active = await cursor.fetchall()
            stale_ids = [r["id"] for r in active if r["slug"] not in seed_slugs]
            if stale_ids:
                placeholders = ",".join("?" for _ in stale_ids)
                await db.execute(
                    f"""
                    UPDATE companies
                    SET is_active = 0,
                        last_fetch_status = 'pruned',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id IN ({placeholders})
                    """,
                    stale_ids,
                )
                pruned = len(stale_ids)

        await db.commit()
    finally:
        await db.close()

    return {
        "inserted": inserted,
        "updated": updated,
        "pruned": pruned,
        "total": len(rows),
    }
