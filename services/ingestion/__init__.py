"""
Ingestion layer — coordinates DOL imports and ATS job refreshes.

Modules:
    orchestrator   — refresh_company / refresh_all_companies
    dedup          — upsert_job_listing / retire_stale_for_company
    seed_loader    — load the seed CSV into the companies table
    scheduler      — APScheduler setup (Phase 2)
"""
