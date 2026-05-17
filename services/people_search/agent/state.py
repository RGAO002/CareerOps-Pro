"""Agent state — what the loop accumulates across turns."""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from services.people_search.schema import Candidate, Evidence


# ──────────────────────────────────────────────────────────────────
# Budget caps. Hardcoded for now — tunable per call via AgentState init.
# ──────────────────────────────────────────────────────────────────

MAIN_AGENT_LIMITS = {
    "max_rounds": 25,
    "max_seconds": 300,        # 5 minutes
    "max_tokens_total": 400_000,  # rough cost gate; ~$1.50 on Sonnet
}

SUBAGENT_LIMITS = {
    "max_rounds": 10,
    "max_seconds": 90,
    "max_tokens_total": 80_000,
}


@dataclass
class TrackedCandidate:
    """A candidate the agent has hypothesized + accumulated context for.

    Wraps the public Candidate model with an internal id the LLM uses
    to reference this candidate across enrich_candidate() / finalize() calls.
    """
    id: str
    candidate: Candidate
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = self.candidate.model_dump()
        d["id"] = self.id
        d["notes"] = list(self.notes)
        return d


@dataclass
class SearchLogEntry:
    """One tool call + summary, kept across turns so the agent doesn't
    repeat itself."""
    tool: str
    input_summary: str
    result_summary: str
    timestamp: float


@dataclass
class AgentState:
    """All mutable state the agent's loop accumulates.

    The `history` list holds Anthropic message dicts in the exact format
    the SDK expects (alternating user/assistant). Tools mutate the other
    fields as side effects when the LLM invokes them.
    """
    query: str
    history: list[dict] = field(default_factory=list)
    candidates: dict[str, TrackedCandidate] = field(default_factory=dict)
    evidence_pool: list[Evidence] = field(default_factory=list)
    search_log: list[SearchLogEntry] = field(default_factory=list)

    # Budget tracking
    rounds: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    started_at: float = field(default_factory=time.time)

    # Termination
    finalized: bool = False
    final_top_ids: list[str] = field(default_factory=list)
    termination_reason: Optional[str] = None

    # Limits — defaults to main agent; subagent overrides via init
    limits: dict = field(default_factory=lambda: dict(MAIN_AGENT_LIMITS))

    # ── helpers ──

    def elapsed(self) -> float:
        return time.time() - self.started_at

    def tokens_total(self) -> int:
        return self.tokens_in + self.tokens_out

    def budget_exhausted(self) -> Optional[str]:
        """Return a termination reason if any budget cap is hit, else None."""
        if self.rounds >= self.limits["max_rounds"]:
            return f"max_rounds ({self.limits['max_rounds']}) reached"
        if self.elapsed() >= self.limits["max_seconds"]:
            return f"max_seconds ({self.limits['max_seconds']}) reached"
        if self.tokens_total() >= self.limits["max_tokens_total"]:
            return f"max_tokens ({self.limits['max_tokens_total']}) reached"
        return None

    def new_candidate_id(self) -> str:
        return f"c{len(self.candidates) + 1}"

    def add_candidate(self, candidate: Candidate) -> str:
        cid = self.new_candidate_id()
        self.candidates[cid] = TrackedCandidate(id=cid, candidate=candidate)
        return cid

    def update_candidate(self, cid: str, patch: dict[str, Any]) -> bool:
        tc = self.candidates.get(cid)
        if not tc:
            return False
        for k, v in patch.items():
            if not hasattr(tc.candidate, k):
                continue
            current = getattr(tc.candidate, k)
            # Merge dicts/lists rather than replace where it makes sense
            if isinstance(current, dict) and isinstance(v, dict):
                current.update(v)
            elif isinstance(current, list) and isinstance(v, list):
                current.extend(v)
            else:
                setattr(tc.candidate, k, v)
        return True

    def log_search(self, tool: str, input_summary: str, result_summary: str) -> None:
        self.search_log.append(SearchLogEntry(
            tool=tool,
            input_summary=input_summary[:200],
            result_summary=result_summary[:200],
            timestamp=time.time(),
        ))

    def stats_dict(self) -> dict:
        return {
            "rounds": self.rounds,
            "elapsed_s": round(self.elapsed(), 2),
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "tokens_total": self.tokens_total(),
            "candidates_count": len(self.candidates),
            "evidence_count": len(self.evidence_pool),
            "search_log_count": len(self.search_log),
        }


def make_subagent_state(query: str) -> AgentState:
    """Build a state with subagent budget caps."""
    return AgentState(query=query, limits=dict(SUBAGENT_LIMITS))
