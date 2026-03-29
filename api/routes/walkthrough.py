"""
Walkthrough Mode API — WebSocket-driven guided resume optimization.

Endpoints:
  GET  /context  — serve walkthrough context (resume + job data)
  POST /save     — save final resume_data result
  WS   /ws       — AI-driven walkthrough conversation
"""
import asyncio
import copy
import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from services.walkthrough import (
    initial_analysis,
    apply_rewrite,
    handle_user_input,
    apply_change,
    revert_change,
)

router = APIRouter()

SESSIONS_DIR = Path(__file__).parent.parent.parent / "saved_sessions"
WALKTHROUGH_CONTEXT_FILE = SESSIONS_DIR / "_walkthrough_context.json"
WALKTHROUGH_RESULT_FILE = SESSIONS_DIR / "_walkthrough_result.json"


# ── REST endpoints ───────────────────────────────────────────

@router.get("/context")
async def get_walkthrough_context():
    """Return walkthrough context written by Streamlit's Walkthrough button."""
    if not WALKTHROUGH_CONTEXT_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="No walkthrough context available. Click the Walkthrough button in the Resume Editor first.",
        )
    try:
        data = json.loads(WALKTHROUGH_CONTEXT_FILE.read_text())
        # Inject server-side API keys so the frontend can auto-fill
        data["api_keys"] = {
            "openai": os.getenv("OPENAI_API_KEY", ""),
            "google": os.getenv("GOOGLE_API_KEY", ""),
            "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
        }
        return data
    except (json.JSONDecodeError, IOError) as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaveResultBody(BaseModel):
    resume_data: dict


@router.post("/save")
async def save_result(body: SaveResultBody):
    """Save final walkthrough result for Streamlit to pick up."""
    SESSIONS_DIR.mkdir(exist_ok=True)
    WALKTHROUGH_RESULT_FILE.write_text(
        json.dumps({"resume_data": body.resume_data}, ensure_ascii=False, indent=2)
    )
    return {"status": "ok"}


# ── Helper ───────────────────────────────────────────────────

async def _send(ws: WebSocket, data: dict):
    """Send JSON message to WebSocket client."""
    await ws.send_text(json.dumps(data, ensure_ascii=False))


# ── WebSocket handler ────────────────────────────────────────

@router.websocket("/ws")
async def walkthrough_ws(ws: WebSocket):
    """AI-driven walkthrough conversation loop.

    Protocol:
      Client → start:        {type, resume_data, job_data, model: {name, api_key}}
      Server → status:       {type, content}
      Server → question:     {type, question_id, section, analysis, options[]}
      Client → choose:       {type, question_id, choice}
      Client → user_message: {type, content}
      Client → skip_all:     {type, apply_recommended: bool}
      Client → apply:        {type}
      Client → stop:         {type}
      Server → applied:      {type, question_id, description}
      Server → ai_message:   {type, content}
      Server → summary:      {type, changes[], stats}
      Server → complete:     {type, final_resume_data}
      Server → error:        {type, message}
    """
    await ws.accept()
    print("[WALKTHROUGH] WebSocket connected")

    try:
        # ── Wait for start message ──
        raw = await ws.receive_text()
        msg = json.loads(raw)

        if msg.get("type") != "start":
            await _send(ws, {"type": "error", "message": "Expected 'start' message"})
            return

        resume_data = msg.get("resume_data", {})
        job_data = msg.get("job_data", {})
        model_cfg = msg.get("model", {})
        model_name = model_cfg.get("name", "gpt-5.4-mini")
        api_key = model_cfg.get("api_key", "")

        if not api_key:
            await _send(ws, {"type": "error", "message": "API key is required"})
            return

        original_data = copy.deepcopy(resume_data)
        working_data = copy.deepcopy(resume_data)
        changes: list[dict] = []  # {question_id, section, index, description, skipped}
        rewrite_tasks: dict[str, asyncio.Task] = {}
        rewrite_results: dict[str, dict] = {}

        # ── Phase 1: Initial analysis ──
        await _send(ws, {"type": "status", "content": "Analyzing your resume against the job description..."})

        try:
            questions, auto_fixes = await initial_analysis(
                resume_data, job_data, model_name, api_key
            )
        except Exception as e:
            await _send(ws, {"type": "error", "message": f"Analysis failed: {e}"})
            return

        if not questions:
            await _send(ws, {"type": "ai_message", "content": "Your resume looks well-aligned with this job. No major changes needed!"})
            await _send(ws, {"type": "summary", "changes": [], "stats": {"total": 0, "user_chosen": 0, "ai_auto": 0}})
            return

        job_title = job_data.get("title", "this position")
        job_company = job_data.get("company", "")
        target_label = f"{job_title} @ {job_company}" if job_company else job_title
        await _send(ws, {
            "type": "ai_message",
            "content": f"Found {len(questions)} key decisions for optimizing your resume for {target_label}. "
                       f"I'll also make {len(auto_fixes)} minor improvements automatically. Let's go!",
        })

        # ── Phase 2: Walk through questions ──
        stopped = False
        skip_all_mode = None  # None, "recommended", "keep"

        for qi, question in enumerate(questions):
            if stopped:
                break

            # If skip_all was triggered, apply bulk
            if skip_all_mode is not None:
                if skip_all_mode == "recommended":
                    rec = next((o for o in question["options"] if o.get("recommended")), question["options"][0])
                    direction = rec["id"]
                    direction_label = rec["label"]
                else:
                    direction = "keep"
                    direction_label = "Keep as is"

                if direction != "keep":
                    task = asyncio.create_task(
                        apply_rewrite(question, direction, direction_label,
                                      working_data, job_data, model_name, api_key)
                    )
                    rewrite_tasks[question["id"]] = task

                changes.append({
                    "question_id": question["id"],
                    "section": question["section"],
                    "index": question.get("index"),
                    "description": direction_label,
                    "skipped": direction == "keep",
                    "auto": True,
                })
                continue

            # Send question to client
            await _send(ws, {
                "type": "question",
                "question_id": question["id"],
                "section": question["section"],
                "analysis": question["analysis"],
                "options": question["options"],
                "progress": {"current": qi + 1, "total": len(questions)},
            })

            # Wait for user response
            chosen_direction = None
            chosen_label = None

            while chosen_direction is None:
                raw = await ws.receive_text()
                resp = json.loads(raw)
                resp_type = resp.get("type")

                if resp_type == "stop":
                    stopped = True
                    break

                elif resp_type == "choose":
                    choice_id = resp.get("choice")
                    if choice_id == "keep":
                        chosen_direction = "keep"
                        chosen_label = "Keep as is"
                    else:
                        opt = next((o for o in question["options"] if o["id"] == choice_id), None)
                        if opt:
                            chosen_direction = choice_id
                            chosen_label = opt["label"]
                        else:
                            await _send(ws, {"type": "error", "message": f"Unknown choice: {choice_id}"})

                elif resp_type == "user_message":
                    try:
                        ai_resp = await handle_user_input(
                            resp.get("content", ""),
                            question, working_data, job_data,
                            model_name, api_key,
                        )
                        if ai_resp.get("type") == "new_options":
                            question["options"] = ai_resp["options"]
                            await _send(ws, {
                                "type": "question",
                                "question_id": question["id"],
                                "section": question["section"],
                                "analysis": ai_resp.get("message", question["analysis"]),
                                "options": ai_resp["options"],
                                "progress": {"current": qi + 1, "total": len(questions)},
                                "updated": True,
                            })
                        else:
                            await _send(ws, {"type": "ai_message", "content": ai_resp.get("message", "Got it.")})
                            # Treat as choosing the recommended direction with user's nuance
                            chosen_direction = "custom"
                            chosen_label = resp.get("content", "")
                    except Exception as e:
                        await _send(ws, {"type": "ai_message", "content": f"I understand. Let me work with that."})
                        chosen_direction = "custom"
                        chosen_label = resp.get("content", "")

                elif resp_type == "skip_all":
                    apply_recommended = resp.get("apply_recommended", True)
                    skip_all_mode = "recommended" if apply_recommended else "keep"

                    # Handle current question with skip_all mode
                    if skip_all_mode == "recommended":
                        rec = next((o for o in question["options"] if o.get("recommended")), question["options"][0])
                        chosen_direction = rec["id"]
                        chosen_label = rec["label"]
                    else:
                        chosen_direction = "keep"
                        chosen_label = "Keep as is"

            if stopped:
                break

            # Record change and start background rewrite
            is_keep = chosen_direction == "keep"
            changes.append({
                "question_id": question["id"],
                "section": question["section"],
                "index": question.get("index"),
                "description": chosen_label,
                "skipped": is_keep,
                "auto": skip_all_mode is not None,
            })

            if not is_keep:
                task = asyncio.create_task(
                    apply_rewrite(question, chosen_direction, chosen_label,
                                  working_data, job_data, model_name, api_key)
                )
                rewrite_tasks[question["id"]] = task
                await _send(ws, {
                    "type": "applied",
                    "question_id": question["id"],
                    "description": f"Rewriting {question['section']}...",
                })

        # ── Wait for all background rewrites to finish ──
        if rewrite_tasks and not stopped:
            await _send(ws, {"type": "status", "content": "Finalizing all changes..."})
            results = await asyncio.gather(
                *rewrite_tasks.values(), return_exceptions=True
            )
            for qid, result in zip(rewrite_tasks.keys(), results):
                if isinstance(result, Exception):
                    print(f"[WALKTHROUGH] Rewrite failed for {qid}: {result}")
                    # Mark as failed in changes
                    for c in changes:
                        if c["question_id"] == qid:
                            c["description"] += " (rewrite failed, kept original)"
                            c["skipped"] = True
                else:
                    rewrite_results[qid] = result

            # Apply all rewrites to working_data in order
            for question in questions:
                qid = question["id"]
                if qid in rewrite_results:
                    rr = rewrite_results[qid]
                    working_data = apply_change(
                        working_data,
                        rr["section"],
                        rr.get("index"),
                        rr["new_content"],
                    )
                    # Update change description with actual result
                    for c in changes:
                        if c["question_id"] == qid:
                            c["description"] = rr.get("description", c["description"])

        if stopped:
            await _send(ws, {"type": "done"})
            return

        # ── Phase 3: Summary ──
        user_chosen = sum(1 for c in changes if not c.get("auto") and not c.get("skipped"))
        ai_auto = sum(1 for c in changes if c.get("auto") and not c.get("skipped"))
        kept = sum(1 for c in changes if c.get("skipped"))

        await _send(ws, {
            "type": "summary",
            "changes": changes,
            "auto_fixes": auto_fixes,
            "stats": {
                "total": len(changes) + len(auto_fixes),
                "user_chosen": user_chosen,
                "ai_auto": ai_auto + len(auto_fixes),
                "kept": kept,
            },
        })

        # ── Wait for apply/cancel ──
        while True:
            raw = await ws.receive_text()
            resp = json.loads(raw)

            if resp.get("type") == "apply":
                # Save result
                SESSIONS_DIR.mkdir(exist_ok=True)
                WALKTHROUGH_RESULT_FILE.write_text(
                    json.dumps({"resume_data": working_data}, ensure_ascii=False, indent=2)
                )
                await _send(ws, {"type": "complete", "final_resume_data": working_data})
                break

            elif resp.get("type") in ("stop", "cancel"):
                await _send(ws, {"type": "done"})
                break

    except WebSocketDisconnect:
        print("[WALKTHROUGH] Client disconnected")
    except Exception as e:
        print(f"[WALKTHROUGH] Error: {e}")
        try:
            await _send(ws, {"type": "error", "message": str(e)})
        except Exception:
            pass
