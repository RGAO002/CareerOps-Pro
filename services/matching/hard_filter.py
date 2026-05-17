"""
Hard-filter SQL composition — cuts the candidate pool before vector search.

Every preference in the input dict is OPTIONAL. Missing keys = no filter on
that dimension; we never fabricate restrictions the user didn't state.

Returned (where_sql, params) is meant to be injected into queries that
already include `is_active = 1 AND embedding IS NOT NULL` — the matcher
layer composes the full WHERE.
"""
from __future__ import annotations

from typing import Optional


def build_where_clause(prefs: Optional[dict]) -> tuple[str, list]:
    """Compose an extra SQL WHERE fragment + params from user preferences.

    Recognized keys (all optional):
        levels:            list[str]  e.g. ["intern", "new_grad"]
        location_tiers:    list[str]  e.g. ["nyc_core", "remote_nyc_hq"]
        work_types:        list[str]  e.g. ["hybrid", "remote"]
        needs_sponsorship: bool       if True, exclude rows with
                                      sponsorship_signal='unfriendly'
        exclude_companies: list[str]  display_name LIKE matches dropped
        only_with_jd:      bool       require non-empty description_text
                                      (raises matcher quality but cuts pool)
    """
    prefs = prefs or {}
    clauses: list[str] = []
    params: list = []

    levels = prefs.get("levels") or []
    if levels:
        placeholders = ",".join("?" * len(levels))
        clauses.append(f"jl.level IN ({placeholders})")
        params.extend(levels)

    tiers = prefs.get("location_tiers") or []
    if tiers:
        placeholders = ",".join("?" * len(tiers))
        clauses.append(f"jl.location_tier IN ({placeholders})")
        params.extend(tiers)

    wts = prefs.get("work_types") or []
    if wts:
        placeholders = ",".join("?" * len(wts))
        clauses.append(f"jl.work_type IN ({placeholders})")
        params.extend(wts)

    if prefs.get("needs_sponsorship"):
        # Drop only EXPLICITLY unfriendly. Silent ('') stays — user can
        # decide per-row from the sponsorship badge in the UI.
        clauses.append("jl.sponsorship_signal != 'unfriendly'")

    if prefs.get("only_with_jd"):
        clauses.append("jl.description_text != ''")

    excludes = prefs.get("exclude_companies") or []
    if excludes:
        for company in excludes:
            clauses.append("c.display_name NOT LIKE ?")
            params.append(f"%{company}%")

    return (" AND ".join(clauses), params)
