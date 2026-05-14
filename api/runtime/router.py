"""Runtime router — agent execution via SSE."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth.dependencies import CurrentUser, get_current_user
from agents import cosmos
from runtime.executor import run_agent_stream

router = APIRouter(tags=["runtime"])


class RunRequest(BaseModel):
    message: str
    session_id: str | None = None
    aoi_override: dict | None = None  # GeoJSON Polygon geometry, overrides agent's stored AOI


@router.post("/run/{agent_id}")
async def run_agent(
    agent_id: str,
    body: RunRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Execute an agent and stream the response as SSE."""
    # Resolve agent — own or shared
    agent_def = await cosmos.get_agent(agent_id, user.id)
    if agent_def is None:
        shared = await cosmos.list_shared_agents()
        agent_def = next((a for a in shared if a["id"] == agent_id), None)
    if agent_def is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    session_id = body.session_id or f"{user.id}:{agent_id}:default"
    run_id = str(uuid.uuid4())

    # Apply per-message AOI override (from chat map drawing)
    if body.aoi_override:
        agent_def = {**agent_def, "aoi": body.aoi_override}

    # Log run start
    run_doc = {
        "id": run_id,
        "agent_id": agent_id,
        "user_id": user.id,
        "session_id": session_id,
        "input": body.message,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    await cosmos.create_run(run_doc)

    async def event_stream():
        async for chunk in run_agent_stream(agent_def, body.message, session_id, run_id, user_id=user.id):
            yield chunk
        # Mark run complete
        await cosmos.update_run(run_id, agent_id, {
            "status": "completed",
            "ended_at": datetime.now(timezone.utc).isoformat(),
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/runs")
async def list_my_runs(user: CurrentUser = Depends(get_current_user)):
    """List recent agent runs for the current user."""
    return await cosmos.list_runs_for_user(user.id)
