"""LangGraph orchestrator. v0 graph shape (spec § 4.3):

  Coordinator → (PolishAgent | ExperienceAgent | END)

Live event emission: every state transition (run.started, agent.started,
agent.narration, suggestion.streamed, agent.completed, run.completed,
run.error) is pushed to the per-run event_queue so SSE consumers see them
in real time. This is what makes soft lock (spec § 6.2) and chat narration
(spec § 6.4) actually work *during* the run.

Sequential v0 — no parallel fan-out, no ReviewerAgent. LangGraph contract is
in place so v0.1 can add Reviewer / multi-section parallel without restructure.
"""
from __future__ import annotations
import time
from typing import Optional

from services.ai import context, runs, suggestions, event_queue
from services.ai.agents import coordinator, polish, experience
from services.ai.tools import read_tools


def _emit_streamed_suggestions_for_run(resume_id: str, run_id: str,
                                        already_emitted: set) -> set:
    """Read suggestions of this run that aren't yet emitted, push them to the
    event queue. Returns updated already_emitted set."""
    for s in suggestions.list_for_resume(resume_id):
        if s.get("runId") != run_id:
            continue
        sid = s["id"]
        if sid in already_emitted:
            continue
        event_queue.emit(run_id, "suggestion.streamed", {"suggestion": s})
        already_emitted.add(sid)
    return already_emitted


def _transition_run_streaming_to_pending(resume_id: str, run_id: str) -> None:
    items = suggestions.list_for_resume(resume_id)
    for s in items:
        if s.get("runId") == run_id and s.get("status") == "streaming":
            suggestions.set_status(resume_id, s["id"], "pending")


def run_orchestration(
    *, resume_id: str, user_input: str, selection: list,
    chat_history: list, clients: dict, run_id: Optional[str] = None,
) -> str:
    """Run the orchestration synchronously, emitting events to event_queue
    as it progresses. Caller (the route handler in Task 11) decides whether
    to invoke this on a background thread (production: yes; tests: directly).

    If `run_id` is supplied, that id is reused (route handler creates the
    run + opens the queue first, then dispatches the orchestration with the
    pre-allocated id so the SSE consumer can attach immediately). Otherwise
    a fresh run + queue are created here."""
    resume = read_tools.get_current_resume(resume_id)
    if resume is None:
        raise ValueError(f"resume {resume_id} not found")

    skeleton = context.build_skeleton(resume)
    if run_id is None:
        run_id = runs.create({
            "resume_id": resume_id, "user_input": user_input, "selection": selection,
            "chat_history": chat_history,
        })
        event_queue.open(run_id)

    event_queue.emit(run_id, "run.started",
                     {"runId": run_id, "createdAt": runs.load(run_id).get("created_at")})

    try:
        coord_decision = coordinator.run({
            "run_id": run_id, "resume_id": resume_id,
            "user_input": user_input, "selection": selection,
            "chat_history": chat_history, "skeleton": skeleton,
        }, clients["Coordinator"])
        runs.update(run_id, coordinator_decision=coord_decision)

        applied: list = []
        if coord_decision["kind"] == "answer":
            event_queue.emit(run_id, "agent.narration",
                             {"agentId": "Coordinator", "text": coord_decision["text"]})
        elif coord_decision["kind"] == "dispatch":
            target = coord_decision["target"]
            focus = coord_decision["focus"]
            brief = coord_decision["brief"]

            # Compute lock scope per spec § 6.2: PolishAgent locks the focus
            # block; ExperienceAgent locks the entire focus section (header +
            # all entries + all bullets within).
            locked = _compute_lock_scope(resume, target, focus)
            event_queue.emit(run_id, "agent.started",
                             {"agentId": target, "lockedBlockIds": locked})
            event_queue.emit(run_id, "agent.narration",
                             {"agentId": target, "text": f"{target} working on {focus}..."})

            already_emitted: set = set()
            if target == "PolishAgent":
                result = polish.run({
                    "run_id": run_id, "resume_id": resume_id,
                    "focus": focus, "brief": brief,
                    "skeleton": skeleton,
                    "focus_block": context.build_focus_block(resume, focus),
                }, clients["PolishAgent"])
                applied = result["applied_suggestion_ids"]
            elif target == "ExperienceAgent":
                result = experience.run({
                    "run_id": run_id, "resume_id": resume_id,
                    "focus": focus, "brief": brief,
                    "skeleton": skeleton,
                    "section": context.build_section_detail(resume, ["experience"]),
                }, clients["ExperienceAgent"])
                applied = result["applied_suggestion_ids"]

            # After the agent's tool-call burst, emit any new suggestions:
            already_emitted = _emit_streamed_suggestions_for_run(resume_id, run_id, already_emitted)
            event_queue.emit(run_id, "agent.completed",
                             {"agentId": target, "runId": run_id})

        _transition_run_streaming_to_pending(resume_id, run_id)
        runs.update(run_id, status="done", applied_suggestion_ids=applied,
                    completed_at=int(time.time() * 1000))
        event_queue.emit(run_id, "run.completed",
                         {"runId": run_id, "suggestionIds": applied, "status": "done"})
        return run_id
    except Exception as exc:
        runs.update(run_id, status="error", error=str(exc),
                    completed_at=int(time.time() * 1000))
        event_queue.emit(run_id, "run.error", {"runId": run_id, "error": str(exc)})
        raise
    finally:
        event_queue.close(run_id)


def _compute_lock_scope(resume: dict, agent: str, focus: str) -> list:
    """For PolishAgent: just [focus]. For ExperienceAgent: focus is a
    section id; expand to section + all entry ids + all bullet ids within."""
    if agent != "ExperienceAgent":
        return [focus]
    for s in resume.get("sections", []):
        if s["id"] != focus:
            continue
        ids = [s["id"]]
        for e in s.get("entries", []):
            ids.append(e["id"])
            for b in e.get("bullets", []):
                ids.append(b["id"])
        return ids
    return [focus]
