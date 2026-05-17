"""
Ingestion CLI — operator utility for the H1B job engine.

Commands:
    seed-companies              Upsert seed CSV into the companies table.
    refresh-all                 Refresh every active company via its ATS adapter.
    refresh-company <slug>      Refresh one company by slug.
    stats                       Print high-level counts from the DB.
    import-lca <path|url|dir>   Import DOL OFLC LCA disclosure file(s) into h1b_sponsors.
    aggregate-lca               Recompute companies.h1b_lca_count_1y / 3y from h1b_sponsors.
    top-sponsors                List top DOL employers — for seed expansion discovery.

Usage examples:
    python scripts/ingest_cli.py seed-companies
    python scripts/ingest_cli.py refresh-all
    python scripts/ingest_cli.py refresh-company stripe
    python scripts/ingest_cli.py stats
    python scripts/ingest_cli.py import-lca data/dol/LCA_Disclosure_Data_FY2025_Q1.xlsx
    python scripts/ingest_cli.py import-lca data/dol/   # imports every .xlsx in dir
    python scripts/ingest_cli.py aggregate-lca
    python scripts/ingest_cli.py top-sponsors --limit 100 --since-days 365

Note on DOL downloads:
    DOL CDN gates downloads behind a JS cookie challenge that curl/httpx cannot
    pass, so import-lca with an https URL will likely fail. The expected workflow
    is: download the quarterly XLSX from
        https://www.dol.gov/agencies/eta/foreign-labor/performance
    in a browser, drop into data/dol/, then run import-lca with the local path.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Put project root on sys.path so ``api.*`` / ``services.*`` imports work.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Match the FastAPI app's behavior — .env is the single source of truth for
# OPENAI_API_KEY etc. Without this, compute-embeddings would error out even
# though the user has the key in .env.
from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

from api.db import DB_PATH, get_db, init_db  # noqa: E402
from services.h1b.aggregate import (  # noqa: E402
    compute_company_lca_aggregates,
    top_sponsors,
)
from services.feeds.simplify_feed import (  # noqa: E402
    REPO_URLS as SIMPLIFY_REPOS,
    refresh_simplify_feed,
)
from services.matching.embed import compute_all_embeddings  # noqa: E402
from services.matching.matcher import match as run_match  # noqa: E402
from services.h1b.dol_loader import (  # noqa: E402
    download_lca_file,
    import_lca_file,
)
from services.h1b.uscis_loader import (  # noqa: E402
    backfill_sponsorship_signal_from_company_history,
    compute_company_uscis_aggregates,
    import_uscis_file,
)
from services.ingestion.orchestrator import refresh_all_companies  # noqa: E402
from services.ingestion.jd_extractor import extract as extract_jd_fields  # noqa: E402
from services.ingestion.role_filter import evaluate as eval_role  # noqa: E402
from services.ingestion.seed_loader import load_seed_companies  # noqa: E402

DOL_DIR = PROJECT_ROOT / "data" / "dol"
USCIS_DIR = PROJECT_ROOT / "data" / "uscis_h1b"


async def cmd_seed_companies() -> int:
    await init_db()
    result = await load_seed_companies()
    print(
        f"[seed-companies] inserted={result['inserted']} "
        f"updated={result['updated']} pruned={result['pruned']} "
        f"total={result['total']}"
    )
    return 0


async def cmd_refresh_all(only_slug: str | None = None) -> int:
    await init_db()
    results = await refresh_all_companies(only_slug=only_slug)
    if not results:
        print("[refresh] no active companies found")
        return 0

    ok = sum(1 for r in results if r.status == "ok")
    err = sum(1 for r in results if r.status == "error")
    skipped = sum(1 for r in results if r.status == "skipped")
    total_fetched = sum(r.fetched for r in results)
    total_upserted = sum(r.upserted for r in results)
    total_retired = sum(r.retired for r in results)
    total_filtered = sum(r.filtered_out for r in results)

    print(f"[refresh] done: ok={ok} error={err} skipped={skipped}")
    print(
        f"[refresh] jobs: fetched={total_fetched} "
        f"upserted={total_upserted} retired={total_retired} "
        f"filtered_out={total_filtered}"
    )

    for r in results:
        line = f"  - {r.company_slug:<20} [{r.vendor:<15}] {r.status}"
        if r.status == "ok":
            line += (
                f"  fetched={r.fetched} upserted={r.upserted} "
                f"retired={r.retired} filtered={r.filtered_out}"
            )
        elif r.error:
            line += f"  error={r.error}"
        print(line)
    return 0 if err == 0 else 1


async def cmd_stats() -> int:
    await init_db()
    db = await get_db()
    try:
        async def _scalar(query: str) -> int:
            cursor = await db.execute(query)
            row = await cursor.fetchone()
            return int(row[0]) if row and row[0] is not None else 0

        total_companies = await _scalar("SELECT COUNT(*) FROM companies")
        active_companies = await _scalar(
            "SELECT COUNT(*) FROM companies WHERE is_active = 1"
        )
        total_listings = await _scalar("SELECT COUNT(*) FROM job_listings")
        active_listings = await _scalar(
            "SELECT COUNT(*) FROM job_listings WHERE is_active = 1"
        )
        nyc_listings = await _scalar(
            "SELECT COUNT(*) FROM job_listings "
            "WHERE is_active = 1 AND is_nyc_metro = 1"
        )
        h1b_count = await _scalar("SELECT COUNT(*) FROM h1b_sponsors")
        ingest_runs = await _scalar("SELECT COUNT(*) FROM ingest_runs")

        print("=" * 52)
        print("  CareerOps-Pro Job Engine — Stats")
        print("=" * 52)
        print(f"  Companies:     {active_companies} active / {total_companies} total")
        print(f"  Job listings:  {active_listings} active / {total_listings} total")
        print(f"    in NYC metro: {nyc_listings}")
        print(f"  H1B LCA rows:  {h1b_count}")
        print(f"  Ingest runs:   {ingest_runs}")
        print("=" * 52)

        # Tier breakdown for active NYC listings.
        cursor = await db.execute(
            """
            SELECT COALESCE(NULLIF(location_tier, ''), '(none)') AS tier,
                   COUNT(*) AS n
            FROM job_listings
            WHERE is_active = 1 AND is_nyc_metro = 1
            GROUP BY tier
            ORDER BY n DESC
            """
        )
        rows = await cursor.fetchall()
        if rows:
            print("  NYC metro by tier:")
            for r in rows:
                print(f"    {r['tier']:<16} {r['n']}")

        # Per-company summary.
        cursor = await db.execute(
            """
            SELECT c.slug,
                   c.ats_vendor,
                   c.last_fetch_status,
                   COUNT(jl.id) FILTER (WHERE jl.is_active = 1) AS active,
                   COUNT(jl.id) FILTER (WHERE jl.is_active = 1 AND jl.is_nyc_metro = 1) AS nyc
            FROM companies c
            LEFT JOIN job_listings jl ON jl.company_id = c.id
            GROUP BY c.id
            ORDER BY nyc DESC, active DESC
            """
        )
        rows = await cursor.fetchall()
        if rows:
            print("  Per-company (top 30):")
            print(f"    {'slug':<22} {'vendor':<15} {'status':<10} active    nyc")
            for r in rows[:30]:
                status = r["last_fetch_status"] or "-"
                print(
                    f"    {r['slug']:<22} {(r['ats_vendor'] or ''):<15} "
                    f"{status:<10} {r['active'] or 0:>6}  {r['nyc'] or 0:>6}"
                )
    finally:
        await db.close()
    return 0


def cmd_import_lca(target: str) -> int:
    """Import one DOL XLSX, every XLSX in a directory, or a remote URL."""
    asyncio.run(init_db())

    paths: list[Path] = []
    if target.startswith(("http://", "https://")):
        try:
            paths = [download_lca_file(target, DOL_DIR)]
        except Exception as e:
            print(
                f"[import-lca] download failed: {e}\n"
                f"DOL CDN often gates downloads behind a JS cookie challenge.\n"
                f"Workaround: download the file in a browser from\n"
                f"  https://www.dol.gov/agencies/eta/foreign-labor/performance\n"
                f"into {DOL_DIR}/ and re-run with the local path."
            )
            return 1
    else:
        p = Path(target)
        if not p.exists():
            print(f"[import-lca] not found: {p}")
            return 1
        if p.is_dir():
            paths = sorted(p.glob("*.xlsx"))
            if not paths:
                print(f"[import-lca] no .xlsx files in {p}")
                return 1
        else:
            paths = [p]

    total_read = 0
    total_inserted = 0
    for path in paths:
        print(f"[import-lca] -> {path.name}")
        result = import_lca_file(path, DB_PATH)
        print(
            f"[import-lca]    read={result['read']:,}  "
            f"inserted={result['inserted']:,}  "
            f"skipped={result['skipped']:,}"
        )
        total_read += result["read"]
        total_inserted += result["inserted"]

    print(
        f"[import-lca] DONE: {len(paths)} file(s), "
        f"read={total_read:,}  inserted={total_inserted:,}"
    )
    print(
        "[import-lca] next: run `python scripts/ingest_cli.py aggregate-lca` "
        "to refresh per-company sponsor counts."
    )
    return 0


def cmd_aggregate_lca() -> int:
    asyncio.run(init_db())
    result = compute_company_lca_aggregates(DB_PATH)
    print(
        f"[aggregate-lca] companies updated: {result['companies_updated']}, "
        f"with at least one certified LCA in 3y: {result['with_any_lca']}"
    )
    return 0


def cmd_import_uscis(target: str) -> int:
    """Import USCIS H-1B Employer Data Hub CSV(s).

    Accepts a path to one .csv, a directory of .csv files, or skip the arg
    to default to data/uscis_h1b/. Re-running an FY's CSV overwrites that
    year's totals — fully idempotent.
    """
    asyncio.run(init_db())

    paths: list[Path] = []
    if not target:
        paths = sorted(USCIS_DIR.glob("h1b_datahubexport-*.csv"))
        if not paths:
            print(f"[import-uscis] no CSVs in {USCIS_DIR}")
            return 1
    else:
        p = Path(target)
        if not p.exists():
            print(f"[import-uscis] not found: {p}")
            return 1
        if p.is_dir():
            paths = sorted(p.glob("h1b_datahubexport-*.csv"))
            if not paths:
                print(f"[import-uscis] no h1b_datahubexport-*.csv in {p}")
                return 1
        else:
            paths = [p]

    for path in paths:
        print(f"[import-uscis] -> {path.name}")
        result = import_uscis_file(path, DB_PATH)
        print(
            f"[import-uscis]    employers={result['employers']:,}  "
            f"FYs={result['fiscal_years']}  rows_written={result['rows_written']:,}"
        )

    print(
        f"[import-uscis] DONE: {len(paths)} file(s). "
        "next: run `python scripts/ingest_cli.py aggregate-uscis` to refresh per-company totals."
    )
    return 0


def cmd_backfill_sponsor_signals(threshold: int) -> int:
    """Set sponsorship_signal='company_history' on silent jobs whose company
    has verified USCIS H-1B approval history.

    Conservative: only touches rows where the JD extractor produced no signal;
    explicit JD 'friendly' / 'unfriendly' is preserved.
    """
    asyncio.run(init_db())
    result = backfill_sponsorship_signal_from_company_history(
        DB_PATH, threshold_3y=threshold
    )
    print(
        f"[backfill-sponsor] threshold={result['threshold_3y']} approvals/3y. "
        f"marked={result['jobs_marked']:,} jobs as 'company_history', "
        f"remaining silent={result['jobs_remaining_silent']:,}."
    )
    return 0


def cmd_aggregate_uscis(current_fy: int = 2023) -> int:
    """Refresh companies.uscis_h1b_approvals_1y / _3y from uscis_h1b_approvals."""
    asyncio.run(init_db())
    result = compute_company_uscis_aggregates(DB_PATH, current_fy=current_fy)
    print(
        f"[aggregate-uscis] companies with H-1B approvals (last 3y): "
        f"{result['companies_with_approvals']}"
    )
    print(
        f"[aggregate-uscis] (of which {result['prefix_match_extra']} matched via "
        "subsidiary prefix, e.g. 'amazon' → 'amazon com services')"
    )
    print(
        f"[aggregate-uscis] total approvals summed across our companies: "
        f"{result['total_approvals_3y_summed']:,}"
    )
    return 0


async def cmd_reclassify_locations() -> int:
    """Re-run services/ats/location_filter on every active job_listing.

    Use after expanding the tier taxonomy (e.g. NYC-only → all NA hubs).
    Reads location_raw + the company's HQ as context, writes back the new
    location_tier + is_nyc_metro + city/state/country.
    """
    from collections import Counter

    from services.ats.location_filter import classify_location

    await init_db()
    db = await get_db()
    try:
        cur = await db.execute(
            "SELECT jl.id, jl.location_raw, c.hq_city, c.hq_state "
            "FROM job_listings jl JOIN companies c ON c.id = jl.company_id "
            "WHERE jl.is_active = 1"
        )
        rows = await cur.fetchall()
        print(f"[reclassify] {len(rows):,} active jobs")

        tiers = Counter()
        updates: list[tuple] = []
        for r in rows:
            loc = classify_location(
                r["location_raw"] or "",
                company_hq_city=r["hq_city"] or "",
                company_hq_state=r["hq_state"] or "",
            )
            tier = loc["location_tier"] or "(empty)"
            tiers[tier] += 1
            updates.append((
                1 if loc["is_nyc_metro"] else 0,
                loc["location_tier"],
                loc["city"], loc["state"], loc["country"],
                r["id"],
            ))

        BATCH = 500
        total = 0
        for i in range(0, len(updates), BATCH):
            chunk = updates[i:i + BATCH]
            cur = await db.executemany(
                "UPDATE job_listings SET "
                "is_nyc_metro=?, location_tier=?, "
                "location_city=?, location_state=?, location_country=? "
                "WHERE id=?",
                chunk,
            )
            total += cur.rowcount or 0
        await db.commit()

        print(f"[reclassify] updated {total:,} rows")
        print(f"[reclassify] distribution:")
        for k, v in tiers.most_common():
            print(f"   {v:>5,}  {k}")
        return 0
    finally:
        await db.close()


def cmd_compute_embeddings(only_missing: bool) -> int:
    """Run OpenAI text-embedding-3-small over active jobs and store BLOBs."""
    asyncio.run(init_db())
    try:
        result = compute_all_embeddings(only_missing=only_missing)
    except RuntimeError as e:
        print(f"[embed] failed: {e}")
        return 1
    print(f"[embed] {result}")
    return 0


def cmd_match(
    resume_id: str,
    top_k: int,
    levels: list[str] | None,
    location_tiers: list[str] | None,
    work_types: list[str] | None,
    needs_sponsorship: bool,
    only_with_jd: bool,
) -> int:
    """One-shot test: run the matcher and print top results to stdout."""
    asyncio.run(init_db())
    prefs = {
        "levels":            levels or None,
        "location_tiers":    location_tiers or None,
        "work_types":        work_types or None,
        "needs_sponsorship": needs_sponsorship,
        "only_with_jd":      only_with_jd,
    }
    try:
        results = run_match(resume_id=resume_id, preferences=prefs, top_k=top_k)
    except Exception as e:
        print(f"[match] failed: {e}")
        return 1
    if not results:
        print("[match] 0 results — relax filters or compute embeddings first.")
        return 0
    print(f"[match] top {len(results)} for resume {resume_id}")
    print(f"  {'#':>2}  {'score':>5}  {'level':<10} {'spon':<10} "
          f"{'cos':>5} {'skl':>5} {'sp':>4} {'rec':>4}  company / title")
    for i, r in enumerate(results, 1):
        sp = r["score_parts"]
        print(
            f"  {i:>2}  {r['score']:.3f}  "
            f"{r['level'][:9]:<10} {(r['sponsorship_signal'] or '-')[:9]:<10} "
            f"{sp['cosine']:.2f}  {sp['skill']:.2f}  "
            f"{sp['sponsor']:.2f}  {sp['recency']:.2f}  "
            f"{r['company']} — {r['title']}"
        )
    return 0


def cmd_refresh_simplify(repos: list[str], no_download: bool) -> int:
    """Pull Pitt CSC × Simplify curated job listings from GitHub and merge
    into the public pool. Companies not yet seeded are auto-created with
    ats_vendor='external'.
    """
    asyncio.run(init_db())
    try:
        result = refresh_simplify_feed(repos=repos, download=not no_download)
    except Exception as e:
        print(f"[refresh-simplify] failed: {e}")
        return 1

    print(f"[refresh-simplify] repos: {repos}")
    print(f"[refresh-simplify] fetched (passed parse filter): {result['fetched']:,}")
    print(f"[refresh-simplify] role_filter dropped:           {result['filtered_role']:,}")
    print(f"[refresh-simplify] cross-source dupes skipped:    {result['duped_existing']:,}")
    print(f"[refresh-simplify] upserted into job_listings:    {result['upserted']:,}")
    print(f"[refresh-simplify] retired (stale from prior):    {result['retired']:,}")
    print(f"[refresh-simplify] companies auto-created:        {result['companies_auto_created']:,}")
    return 0


async def cmd_extract_jd_fields(only_missing: bool, batch: int) -> int:
    """Backfill level / years_min / work_type / sponsorship_signal on existing
    job_listings rows.

    Sponsorship merging rule:
        Some sources (e.g. SimplifyJobs) hand us an explicit friendly/unfriendly
        tag at ingest time. The regex extractor here cannot see those upstream
        signals, so we *don't* let an empty regex result wipe them. Only
        overwrite when the regex produces a concrete result, or when the
        existing value is empty / 'company_history' (a derived placeholder).

    Use --only-missing to skip rows whose level + sponsorship_signal both
    already have an explicit JD-derived value.
    """
    from collections import Counter

    await init_db()
    db = await get_db()
    try:
        where = "WHERE is_active = 1"
        if only_missing:
            where += (
                " AND (level IS NULL OR level = '') "
                "AND (sponsorship_signal IS NULL OR sponsorship_signal = '' "
                "     OR sponsorship_signal = 'company_history')"
            )
        cur = await db.execute(
            f"SELECT id, title, description_text, location_raw, sponsorship_signal "
            f"FROM job_listings {where}"
        )
        rows = await cur.fetchall()
        print(f"[extract-jd] {len(rows):,} rows to process")

        levels: Counter[str] = Counter()
        sponsors: Counter[str] = Counter()
        worktypes: Counter[str] = Counter()
        years_count = 0
        updated = 0

        # Treat 'company_history' as a placeholder that JD evidence may overwrite,
        # but preserve upstream-supplied 'friendly' / 'unfriendly' on regex misses.
        _OVERWRITABLE = {"", "company_history", None}

        updates: list[tuple] = []
        for r in rows:
            jd = extract_jd_fields(r["title"], r["description_text"], r["location_raw"])
            existing_signal = r["sponsorship_signal"] or ""
            new_signal = jd["sponsorship_signal"]
            # Preserve upstream tag when regex finds nothing.
            if not new_signal and existing_signal not in _OVERWRITABLE:
                new_signal = existing_signal
            updates.append((
                jd["level"], jd["years_min"], jd["work_type"], new_signal,
                r["id"],
            ))
            levels[jd["level"] or "(empty)"] += 1
            sponsors[new_signal or "(empty)"] += 1
            worktypes[jd["work_type"] or "(empty)"] += 1
            if jd["years_min"]:
                years_count += 1

            if len(updates) >= batch:
                cur = await db.executemany(
                    "UPDATE job_listings SET "
                    "level=?, years_min=?, work_type=?, sponsorship_signal=? "
                    "WHERE id=?",
                    updates,
                )
                updated += cur.rowcount or 0
                await db.commit()
                updates.clear()

        if updates:
            cur = await db.executemany(
                "UPDATE job_listings SET "
                "level=?, years_min=?, work_type=?, sponsorship_signal=? "
                "WHERE id=?",
                updates,
            )
            updated += cur.rowcount or 0
            await db.commit()

        print(f"[extract-jd] updated {updated:,} rows")
        print(f"[extract-jd] level distribution:")
        for k, v in levels.most_common():
            print(f"   {v:>6,}  {k}")
        print(f"[extract-jd] sponsorship_signal distribution:")
        for k, v in sponsors.most_common():
            print(f"   {v:>6,}  {k}")
        print(f"[extract-jd] work_type distribution:")
        for k, v in worktypes.most_common():
            print(f"   {v:>6,}  {k}")
        print(f"[extract-jd] years_min populated: {years_count:,} rows")
        return 0
    finally:
        await db.close()


async def cmd_prune_non_target(dry_run: bool, sample: int) -> int:
    """Soft-delete (is_active=0) every active job_listing that the role_filter
    rejects. Always shows a summary + sample first; pass --commit to act.
    """
    from collections import Counter

    await init_db()
    db = await get_db()
    try:
        cur = await db.execute(
            "SELECT id, title, department FROM job_listings WHERE is_active = 1"
        )
        rows = await cur.fetchall()

        kept = 0
        to_drop_ids: list[int] = []
        reasons: Counter[str] = Counter()
        sample_drops: list[tuple[str, str, str]] = []
        for r in rows:
            keep, reason = eval_role(r["title"], r["department"])
            if keep:
                kept += 1
            else:
                to_drop_ids.append(r["id"])
                reasons[reason.split(":", 1)[0] + ":" + reason.split(":", 1)[1].split()[0]
                        if ":" in reason else reason] += 1
                if len(sample_drops) < sample:
                    sample_drops.append((r["title"], r["department"], reason))

        print(
            f"[prune] active jobs: {len(rows):,}  keep: {kept:,}  "
            f"would drop: {len(to_drop_ids):,}"
        )
        print("[prune] top drop reasons:")
        for reason, n in reasons.most_common(15):
            print(f"   {n:>5,}  {reason}")
        if sample_drops:
            print(f"[prune] sample drops ({len(sample_drops)}):")
            for t, d, r in sample_drops:
                print(f"   [{r}]  dept={d!r}  title={t!r}")

        if dry_run:
            print("[prune] dry-run: no changes written. Re-run with --commit to apply.")
            return 0

        if not to_drop_ids:
            print("[prune] nothing to do.")
            return 0

        # Batch update to avoid the SQLite parameter cap.
        BATCH = 500
        total = 0
        for i in range(0, len(to_drop_ids), BATCH):
            batch = to_drop_ids[i:i + BATCH]
            placeholders = ",".join("?" * len(batch))
            cur = await db.execute(
                f"UPDATE job_listings SET is_active = 0 "
                f"WHERE id IN ({placeholders})",
                batch,
            )
            total += cur.rowcount or 0
        await db.commit()
        print(f"[prune] soft-deleted {total:,} rows (is_active=0).")
        return 0
    finally:
        await db.close()


def cmd_top_sponsors(
    limit: int,
    since_days: int,
    include_seeded: bool,
) -> int:
    rows = top_sponsors(
        DB_PATH,
        limit=limit,
        since_days=since_days,
        only_unseeded=not include_seeded,
    )
    if not rows:
        print(
            "[top-sponsors] no rows. Did you run `import-lca` first? "
            "Or relax --since-days."
        )
        return 0

    label = "all employers" if include_seeded else "unseeded employers"
    print(f"[top-sponsors] {label}, top {len(rows)} by certified LCAs in last {since_days}d")
    print(
        f"  {'rank':>4}  {'1y':>5}  {'window':>6}  {'st':<3}  "
        f"{'in_companies':<12}  employer (sample raw)"
    )
    for i, s in enumerate(rows, 1):
        flag = "✓" if s.in_companies_table else ""
        print(
            f"  {i:>4}  {s.certified_1y:>5,}  {s.certified_3y:>6,}  "
            f"{s.sample_state:<3}  {flag:<12}  {s.employer_name_sample[:60]}"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="ingest_cli", description="CareerOps-Pro ingestion CLI"
    )
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("seed-companies", help="Upsert seed CSV into companies")

    p_refresh = sub.add_parser("refresh-all", help="Refresh every active company")
    p_refresh.add_argument(
        "--only", help="Optional: limit to a single company slug", default=None
    )

    p_single = sub.add_parser("refresh-company", help="Refresh a single company by slug")
    p_single.add_argument("slug", help="company slug")

    sub.add_parser("stats", help="Print DB stats")

    p_lca = sub.add_parser(
        "import-lca",
        help="Import a DOL OFLC LCA XLSX file (or directory of files, or URL)",
    )
    p_lca.add_argument("target", help="path to .xlsx, directory, or https URL")

    sub.add_parser(
        "aggregate-lca",
        help="Refresh companies.h1b_lca_count_1y / 3y from h1b_sponsors",
    )

    p_uscis = sub.add_parser(
        "import-uscis",
        help="Import USCIS H-1B Employer Data Hub CSV(s) (FY2021-2023). "
             "No arg = use data/uscis_h1b/.",
    )
    p_uscis.add_argument(
        "target", nargs="?", default="",
        help="path to .csv file or directory; omit to use data/uscis_h1b/",
    )

    p_uscis_agg = sub.add_parser(
        "aggregate-uscis",
        help="Refresh companies.uscis_h1b_approvals_1y / _3y from uscis_h1b_approvals",
    )
    p_uscis_agg.add_argument(
        "--current-fy", type=int, default=2023,
        help="latest FY in the data (default 2023)",
    )

    p_bsig = sub.add_parser(
        "backfill-sponsor-signals",
        help="On silent jobs (no JD signal), set sponsorship_signal=company_history "
             "when company has verified USCIS approval history",
    )
    p_bsig.add_argument(
        "--threshold", type=int, default=10,
        help="minimum 3y USCIS approvals to qualify (default 10)",
    )

    sub.add_parser(
        "reclassify-locations",
        help="Re-run location_filter on every active job (after taxonomy changes)",
    )

    p_emb = sub.add_parser(
        "compute-embeddings",
        help="Run OpenAI text-embedding-3-small over active jobs",
    )
    p_emb.add_argument(
        "--all", action="store_true",
        help="recompute every active row (default: only rows with NULL embedding)",
    )

    p_match = sub.add_parser(
        "match",
        help="Test the matcher: print top recommendations for a resume",
    )
    p_match.add_argument("resume_id", help="row id from the resumes table")
    p_match.add_argument("--top-k", type=int, default=10)
    p_match.add_argument("--level", action="append", default=None,
                         help="repeatable: intern|new_grad|junior|mid|senior|staff|principal")
    p_match.add_argument("--location-tier", action="append", default=None,
                         help="repeatable: nyc_core|nj_close|ny_suburb|remote_nyc_hq")
    p_match.add_argument("--work-type", action="append", default=None,
                         help="repeatable: hybrid|remote|onsite")
    p_match.add_argument("--needs-sponsorship", action="store_true")
    p_match.add_argument("--only-with-jd", action="store_true",
                         help="restrict to jobs where description_text is non-empty")

    p_simp = sub.add_parser(
        "refresh-simplify",
        help="Pull Pitt CSC × Simplify GitHub feeds and merge into public pool",
    )
    p_simp.add_argument(
        "--repo", action="append", choices=list(SIMPLIFY_REPOS) + ["all"],
        default=None,
        help="repo to pull (repeatable). Default: all.",
    )
    p_simp.add_argument(
        "--no-download", action="store_true",
        help="reuse already-downloaded data/simplify/<repo>.json (faster for re-runs)",
    )

    p_extract = sub.add_parser(
        "extract-jd",
        help="Run jd_extractor over job_listings — populate level/years/work_type/sponsorship_signal",
    )
    p_extract.add_argument(
        "--only-missing", action="store_true",
        help="skip rows that already have level + sponsorship_signal set",
    )
    p_extract.add_argument("--batch", type=int, default=500)

    p_prune = sub.add_parser(
        "prune-non-target",
        help="Soft-delete active jobs the role_filter would reject (sales/ops/clinical/etc)",
    )
    p_prune.add_argument(
        "--commit", action="store_true",
        help="Actually write is_active=0. Without this, runs as a dry preview.",
    )
    p_prune.add_argument("--sample", type=int, default=20)

    p_top = sub.add_parser(
        "top-sponsors",
        help="Top employers by certified LCA count (discover candidates to seed)",
    )
    p_top.add_argument("--limit", type=int, default=100)
    p_top.add_argument(
        "--since-days", type=int, default=1095,
        help="lookback window for the count (default 1095 = 3y)",
    )
    p_top.add_argument(
        "--include-seeded", action="store_true",
        help="also show employers already in companies table (default: hide)",
    )

    args = parser.parse_args()

    if args.cmd == "seed-companies":
        return asyncio.run(cmd_seed_companies())
    if args.cmd == "refresh-all":
        return asyncio.run(cmd_refresh_all(only_slug=args.only))
    if args.cmd == "refresh-company":
        return asyncio.run(cmd_refresh_all(only_slug=args.slug))
    if args.cmd == "stats":
        return asyncio.run(cmd_stats())
    if args.cmd == "import-lca":
        return cmd_import_lca(args.target)
    if args.cmd == "aggregate-lca":
        return cmd_aggregate_lca()
    if args.cmd == "import-uscis":
        return cmd_import_uscis(args.target)
    if args.cmd == "aggregate-uscis":
        return cmd_aggregate_uscis(current_fy=args.current_fy)
    if args.cmd == "backfill-sponsor-signals":
        return cmd_backfill_sponsor_signals(threshold=args.threshold)
    if args.cmd == "reclassify-locations":
        return asyncio.run(cmd_reclassify_locations())
    if args.cmd == "compute-embeddings":
        return cmd_compute_embeddings(only_missing=not args.all)
    if args.cmd == "match":
        return cmd_match(
            resume_id=args.resume_id,
            top_k=args.top_k,
            levels=args.level,
            location_tiers=args.location_tier,
            work_types=args.work_type,
            needs_sponsorship=args.needs_sponsorship,
            only_with_jd=args.only_with_jd,
        )
    if args.cmd == "refresh-simplify":
        repos = args.repo or ["all"]
        if "all" in repos:
            repos = list(SIMPLIFY_REPOS)
        return cmd_refresh_simplify(repos=repos, no_download=args.no_download)
    if args.cmd == "extract-jd":
        return asyncio.run(cmd_extract_jd_fields(only_missing=args.only_missing, batch=args.batch))
    if args.cmd == "prune-non-target":
        return asyncio.run(cmd_prune_non_target(dry_run=not args.commit, sample=args.sample))
    if args.cmd == "top-sponsors":
        return cmd_top_sponsors(args.limit, args.since_days, args.include_seeded)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
