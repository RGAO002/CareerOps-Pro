"""Subagent CLI entry point.

Spawned by the main agent via:
    asyncio.create_subprocess_exec(
        sys.executable, "-m", "services.people_search.agent.subagent",
        stdin=PIPE, stdout=PIPE, stderr=PIPE,
    )

Reads a JSON payload from stdin, runs the subagent loop, prints the
resulting dossier as JSON on stdout, and exits.

Payload schema (from main agent's spawn_subagent tool):
    {
        "task": "<focused investigation>",
        "candidate_id": "<parent's candidate id>",
        "parent_query": "<original user query>",
        "known_candidates": [...]
    }
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

# Make sure project root is on sys.path when run as a module from a subprocess
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# .env is needed because subprocess doesn't inherit FastAPI's load_dotenv
load_dotenv(_PROJECT_ROOT / ".env")

from services.people_search.agent.loop import run_subagent  # noqa: E402


async def _main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        sys.stderr.write("subagent: empty stdin\n")
        return 2

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"subagent: invalid JSON on stdin: {e}\n")
        return 2

    try:
        dossier = await run_subagent(payload)
    except Exception as e:
        sys.stderr.write(f"subagent: crashed: {e}\n")
        return 1

    sys.stdout.write(json.dumps(dossier, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
