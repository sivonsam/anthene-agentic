"""Agent registry router — CRUD endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query

from auth.dependencies import CurrentUser, get_current_user, require_admin
from agents.models import AgentCreate, AgentUpdate, agent_doc
from agents import cosmos

router = APIRouter(tags=["agents"])


@router.get("/agents")
async def list_my_agents(user: CurrentUser = Depends(get_current_user)):
    """List all agents owned by the current user."""
    return await cosmos.list_agents_by_owner(user.id)


@router.get("/agents/store")
async def list_store_agents(user: CurrentUser = Depends(get_current_user)):
    """List all shared/public agents (AgentStore)."""
    return await cosmos.list_shared_agents()


@router.get("/agents/admin/all")
async def list_all_agents(user: CurrentUser = Depends(require_admin)):
    """Admin: list all agents regardless of visibility."""
    return await cosmos.list_all_agents()


@router.post("/agents", status_code=201)
async def create_agent(
    body: AgentCreate,
    user: CurrentUser = Depends(get_current_user),
):
    doc = agent_doc(user.id, body)
    created = await cosmos.create_agent(doc)
    return created


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, user: CurrentUser = Depends(get_current_user)):
    item = await cosmos.get_agent(agent_id, user.id)
    if item is None:
        # Try shared agents
        shared = await cosmos.list_shared_agents()
        item = next((a for a in shared if a["id"] == agent_id), None)
    if item is None and user.is_admin:
        all_agents = await cosmos.list_all_agents()
        item = next((a for a in all_agents if a["id"] == agent_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return item


@router.patch("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated = await cosmos.update_agent(agent_id, user.id, patch)
    if updated is None:
        # Check if the agent exists at all (owned by someone else → 403, truly missing → 404)
        all_agents = await cosmos.list_all_agents()
        exists = any(a["id"] == agent_id for a in all_agents)
        if exists:
            raise HTTPException(status_code=403, detail="Agent not owned by you")
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, user: CurrentUser = Depends(get_current_user)):
    deleted = await cosmos.delete_agent(agent_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")


@router.post("/agents/{agent_id}/copy")
async def copy_agent_from_store(
    agent_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Copy a shared agent to the user's own collection."""
    shared = await cosmos.list_shared_agents()
    source = next((a for a in shared if a["id"] == agent_id), None)
    if source is None:
        raise HTTPException(status_code=404, detail="Shared agent not found")

    import uuid
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    copy = {
        **source,
        "id": str(uuid.uuid4()),
        "owner_id": user.id,
        "visibility": "private",
        "name": f"{source['name']} (copy)",
        "created_at": now,
        "updated_at": now,
    }
    return await cosmos.create_agent(copy)
