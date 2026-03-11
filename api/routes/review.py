"""
Multi-LLM Review — WebSocket endpoint for AI roundtable discussions.

Protocol:
  Client → Server (JSON):
    {"type": "start", "content": "...", "section": "summary",
     "resume_data": {...}, "job_data": {...},
     "models": [
       {"id": "model_a", "name": "gpt-4o", "api_key": "sk-..."},
       {"id": "model_b", "name": "gemini-2.5-flash", "api_key": "AIza..."}
     ]}
    {"type": "user_message", "content": "I think version A is too long..."}
    {"type": "pick", "choice": "model_a"}  — blind pick
    {"type": "stop"}                       — abort the discussion

  Server → Client (JSON):
    {"type": "round_start", "round": 1}
    {"type": "model_draft", "model_id": "model_a", "model_name": "GPT-4o",
     "content": "...", "round": 1}
    {"type": "model_review", "model_id": "model_a", "model_name": "GPT-4o",
     "reviewing": "model_b", "feedback": "...", "round": 1}
    {"type": "final_versions", "versions": [
       {"model_id": "model_a", "label": "Version A", "content": "...",
        "rationale": "..."},
       {"model_id": "model_b", "label": "Version B", "content": "...",
        "rationale": "..."}
     ]}
    {"type": "pick_result", "chosen_model_id": "model_a",
     "chosen_model_name": "GPT-4o"}
    {"type": "error", "message": "..."}
    {"type": "done"}
"""
from __future__ import annotations

import asyncio
import json
import traceback
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from services.llm import get_llm, detect_provider

router = APIRouter()

# ── Section-specific prompts ───────────────────────────────────
SECTION_PROMPTS = {
    "summary": (
        "You are an expert resume writer. Write a compelling professional "
        "summary / profile section for the candidate's resume. The summary "
        "should be 2-4 sentences, highlight the candidate's key strengths, "
        "and be tailored to the target job."
    ),
    "experience": (
        "You are an expert resume writer. Improve the bullet points for "
        "the specified work experience entry. Each bullet should start with "
        "a strong action verb, include quantifiable results where possible, "
        "and be relevant to the target job."
    ),
    "skills": (
        "You are an expert resume writer. Optimize the skills section to "
        "best match the target job requirements while staying truthful to "
        "the candidate's actual abilities."
    ),
    "general": (
        "You are an expert resume writer and career coach. Help improve "
        "the resume content as requested."
    ),
}


def _build_context(resume_data: dict, job_data: dict, section: str) -> str:
    """Build context string for the LLM from resume + job data."""
    parts = []
    if resume_data:
        parts.append("=== CANDIDATE RESUME ===")
        if resume_data.get("name"):
            parts.append(f"Name: {resume_data['name']}")
        if resume_data.get("summary"):
            parts.append(f"Current Summary: {resume_data['summary']}")
        if resume_data.get("skills"):
            skills_str = "; ".join(
                f"{k}: {v}" for k, v in resume_data["skills"].items()
            )
            parts.append(f"Skills: {skills_str}")
        if resume_data.get("experience"):
            parts.append("Experience:")
            for exp in resume_data["experience"][:3]:
                parts.append(
                    f"  - {exp.get('title', '')} @ {exp.get('company', '')} "
                    f"({exp.get('date', '')})"
                )
                for b in exp.get("bullets", [])[:4]:
                    parts.append(f"    • {b}")

    if job_data:
        parts.append("\n=== TARGET JOB ===")
        parts.append(f"Title: {job_data.get('title', 'N/A')}")
        parts.append(f"Company: {job_data.get('company', 'N/A')}")
        if job_data.get("requirements"):
            parts.append("Requirements:")
            for r in job_data["requirements"][:10]:
                parts.append(f"  - {r}")

    return "\n".join(parts)


async def _call_llm(model_name: str, api_key: str, messages: list) -> str:
    """Call an LLM synchronously (wrapped for async) with timeout."""
    print(f"[REVIEW] Calling LLM: {model_name} ...")
    try:
        llm = get_llm(model_name, api_key)
        loop = asyncio.get_running_loop()
        res = await asyncio.wait_for(
            loop.run_in_executor(None, llm.invoke, messages),
            timeout=120,  # 2 min timeout
        )
        print(f"[REVIEW] LLM {model_name} responded ({len(res.content)} chars)")
        return res.content
    except asyncio.TimeoutError:
        raise RuntimeError(f"{model_name} timed out after 120s")
    except Exception as e:
        print(f"[REVIEW] LLM {model_name} error: {e}")
        traceback.print_exc()
        raise


async def _send(ws: WebSocket, data: dict):
    """Send JSON to the WebSocket client."""
    await ws.send_text(json.dumps(data, ensure_ascii=False))


@router.websocket("/ws")
async def review_ws(ws: WebSocket):
    """Multi-LLM Review WebSocket handler.

    Implements a round-based discussion:
      Round 1: Both models write a draft
      Round 2: Each model reviews the other's draft + incorporates user feedback
      Final:   Each model produces a final version with rationale → blind pick
    """
    await ws.accept()
    print("[REVIEW] WebSocket connected")
    state: dict[str, Any] = {
        "models": [],
        "context": "",
        "section": "general",
        "user_instruction": "",
        "drafts": {},       # model_id → draft text
        "reviews": {},      # model_id → review text
        "finals": {},       # model_id → final text
        "user_messages": [],
        "stopped": False,
    }

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "stop":
                state["stopped"] = True
                await _send(ws, {"type": "done"})
                break

            elif msg_type == "user_message":
                # User intervenes mid-discussion
                state["user_messages"].append(msg["content"])
                # Acknowledge
                await _send(ws, {
                    "type": "user_ack",
                    "content": msg["content"],
                })

            elif msg_type == "pick":
                # Blind pick — reveal the chosen model
                choice = msg["choice"]
                chosen = next(
                    (m for m in state["models"] if m["id"] == choice), None
                )
                if chosen:
                    await _send(ws, {
                        "type": "pick_result",
                        "chosen_model_id": choice,
                        "chosen_model_name": chosen["name"],
                    })
                await _send(ws, {"type": "done"})
                break

            elif msg_type == "start":
                # ── Initialize session ──
                state["models"] = msg.get("models", [])
                state["section"] = msg.get("section", "general")
                state["user_instruction"] = msg.get("content", "")
                resume_data = msg.get("resume_data", {})
                job_data = msg.get("job_data", {})
                state["context"] = _build_context(
                    resume_data, job_data, state["section"]
                )

                print(f"[REVIEW] Start: section={state['section']}, "
                      f"models={[m['name'] for m in state['models']]}, "
                      f"context_len={len(state['context'])}")

                if len(state["models"]) < 2:
                    await _send(ws, {
                        "type": "error",
                        "message": "Need at least 2 models for review.",
                    })
                    continue

                sys_prompt = SECTION_PROMPTS.get(
                    state["section"], SECTION_PROMPTS["general"]
                )

                # ════════ ROUND 1: Initial Drafts ════════
                await _send(ws, {"type": "round_start", "round": 1})

                draft_tasks = []
                for m in state["models"]:
                    messages = [
                        SystemMessage(content=sys_prompt),
                        HumanMessage(content=(
                            f"{state['context']}\n\n"
                            f"User request: {state['user_instruction']}\n\n"
                            f"Write your best version. Be concise and specific."
                        )),
                    ]
                    draft_tasks.append(
                        _call_llm(m["name"], m["api_key"], messages)
                    )

                print(f"[REVIEW] Round 1: gathering {len(draft_tasks)} drafts...")
                drafts = await asyncio.gather(*draft_tasks, return_exceptions=True)
                print(f"[REVIEW] Round 1: gather complete, "
                      f"results: {[type(d).__name__ if isinstance(d, Exception) else f'{len(d)} chars' for d in drafts]}")

                for m, draft in zip(state["models"], drafts):
                    if isinstance(draft, Exception):
                        await _send(ws, {
                            "type": "error",
                            "message": f"{m['name']}: {str(draft)}",
                        })
                        state["drafts"][m["id"]] = f"[Error: {str(draft)}]"
                    else:
                        state["drafts"][m["id"]] = draft
                        await _send(ws, {
                            "type": "model_draft",
                            "model_id": m["id"],
                            "model_name": m["name"],
                            "content": draft,
                            "round": 1,
                        })

                if state["stopped"]:
                    break

                # ── Wait for user intervention or continue ──
                # Give user a moment to intervene by waiting for a message
                # with a short timeout. If no message, proceed.
                try:
                    raw2 = await asyncio.wait_for(
                        ws.receive_text(), timeout=1.0
                    )
                    msg2 = json.loads(raw2)
                    if msg2.get("type") == "stop":
                        state["stopped"] = True
                        await _send(ws, {"type": "done"})
                        break
                    elif msg2.get("type") == "user_message":
                        state["user_messages"].append(msg2["content"])
                        await _send(ws, {
                            "type": "user_ack",
                            "content": msg2["content"],
                        })
                except asyncio.TimeoutError:
                    pass  # No user input, proceed to round 2

                # ════════ ROUND 2: Cross-Review ════════
                await _send(ws, {"type": "round_start", "round": 2})

                user_feedback = ""
                if state["user_messages"]:
                    user_feedback = (
                        "\n\nUser feedback to incorporate:\n"
                        + "\n".join(f"- {m}" for m in state["user_messages"])
                    )

                review_tasks = []
                review_pairs = []
                for i, m in enumerate(state["models"]):
                    other = state["models"][1 - i]
                    other_draft = state["drafts"].get(other["id"], "")
                    my_draft = state["drafts"].get(m["id"], "")

                    messages = [
                        SystemMessage(content=sys_prompt),
                        HumanMessage(content=(
                            f"{state['context']}\n\n"
                            f"Your draft:\n{my_draft}\n\n"
                            f"Another writer's draft:\n{other_draft}\n\n"
                            f"{user_feedback}\n\n"
                            f"Review the other draft. What's good about it? "
                            f"What could be improved? Then produce your FINAL "
                            f"improved version incorporating the best ideas "
                            f"from both drafts and any user feedback.\n\n"
                            f"Format your response as:\n"
                            f"REVIEW:\n[your review of the other draft]\n\n"
                            f"FINAL VERSION:\n[your improved final version]\n\n"
                            f"RATIONALE:\n[why you made these choices]"
                        )),
                    ]
                    review_tasks.append(
                        _call_llm(m["name"], m["api_key"], messages)
                    )
                    review_pairs.append((m, other))

                print(f"[REVIEW] Round 2: gathering {len(review_tasks)} reviews...")
                results = await asyncio.gather(
                    *review_tasks, return_exceptions=True
                )
                print(f"[REVIEW] Round 2: gather complete")

                versions = []
                for (m, other), result in zip(review_pairs, results):
                    if isinstance(result, Exception):
                        await _send(ws, {
                            "type": "error",
                            "message": f"{m['name']}: {str(result)}",
                        })
                        continue

                    # Parse the structured response
                    review_text = ""
                    final_text = ""
                    rationale = ""

                    content = result
                    if "REVIEW:" in content:
                        parts = content.split("FINAL VERSION:")
                        review_text = parts[0].replace("REVIEW:", "").strip()
                        if len(parts) > 1:
                            remaining = parts[1]
                            if "RATIONALE:" in remaining:
                                final_parts = remaining.split("RATIONALE:")
                                final_text = final_parts[0].strip()
                                rationale = final_parts[1].strip()
                            else:
                                final_text = remaining.strip()
                    else:
                        final_text = content

                    # Send the review
                    await _send(ws, {
                        "type": "model_review",
                        "model_id": m["id"],
                        "model_name": m["name"],
                        "reviewing": other["id"],
                        "feedback": review_text,
                        "round": 2,
                    })

                    state["finals"][m["id"]] = final_text
                    versions.append({
                        "model_id": m["id"],
                        "label": f"Version {'A' if m == state['models'][0] else 'B'}",
                        "content": final_text,
                        "rationale": rationale,
                    })

                # ════════ FINAL: Present blind pick ════════
                if versions:
                    await _send(ws, {
                        "type": "final_versions",
                        "versions": versions,
                    })

                # Now wait for user to pick or send more messages
                # (the loop continues to handle "pick" or "stop" messages)

    except WebSocketDisconnect:
        print("[REVIEW] Client disconnected")
    except Exception as e:
        print(f"[REVIEW] Unhandled error: {e}")
        traceback.print_exc()
        try:
            await _send(ws, {
                "type": "error",
                "message": f"Server error: {str(e)}",
            })
        except Exception:
            pass
