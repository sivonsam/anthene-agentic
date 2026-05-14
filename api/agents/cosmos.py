"""Cosmos DB client — agents, users, runs containers."""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError

logger = logging.getLogger(__name__)

COSMOS_ENDPOINT: str = os.getenv("COSMOS_ENDPOINT", "")
COSMOS_KEY: str = os.getenv("COSMOS_KEY", "")
DB_NAME = "anthene-agentic-db"

_client: Optional[CosmosClient] = None


def get_client() -> CosmosClient:
    global _client
    if _client is None:
        if not COSMOS_ENDPOINT or not COSMOS_KEY:
            raise RuntimeError("COSMOS_ENDPOINT and COSMOS_KEY must be set")
        _client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
    return _client


def _container(name: str):
    return get_client().get_database_client(DB_NAME).get_container_client(name)


# ── Agents ────────────────────────────────────────────────────────────────────

async def create_agent(agent: dict) -> dict:
    return await _container("agents").create_item(agent)


async def get_agent(agent_id: str, owner_id: str | None = None) -> dict | None:
    try:
        item = await _container("agents").read_item(agent_id, partition_key=owner_id or agent_id)
        return item
    except CosmosResourceNotFoundError:
        return None


async def list_agents_by_owner(owner_id: str) -> list[dict]:
    query = "SELECT * FROM c WHERE c.owner_id = @owner ORDER BY c._ts DESC"
    items = _container("agents").query_items(
        query=query,
        parameters=[{"name": "@owner", "value": owner_id}],
    )
    return [item async for item in items]


async def list_shared_agents() -> list[dict]:
    query = "SELECT * FROM c WHERE c.visibility IN ('shared') ORDER BY c._ts DESC"
    items = _container("agents").query_items(query=query)
    return [item async for item in items]


async def list_all_agents() -> list[dict]:
    items = _container("agents").query_items(query="SELECT * FROM c ORDER BY c._ts DESC")
    return [item async for item in items]


async def update_agent(agent_id: str, owner_id: str, patch: dict) -> dict | None:
    item = await get_agent(agent_id, owner_id)
    if item is None:
        return None
    item.update(patch)
    return await _container("agents").replace_item(agent_id, item)


async def delete_agent(agent_id: str, owner_id: str) -> bool:
    try:
        await _container("agents").delete_item(agent_id, partition_key=owner_id)
        return True
    except CosmosResourceNotFoundError:
        return False


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_or_create_user(user_id: str, defaults: dict) -> dict:
    try:
        return await _container("users").read_item(user_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        item = {"id": user_id, **defaults}
        return await _container("users").create_item(item)


async def update_user(user_id: str, patch: dict) -> dict | None:
    try:
        item = await _container("users").read_item(user_id, partition_key=user_id)
        item.update(patch)
        return await _container("users").replace_item(user_id, item)
    except CosmosResourceNotFoundError:
        return None


# ── Agent Runs ────────────────────────────────────────────────────────────────

async def create_run(run: dict) -> dict:
    return await _container("agent_runs").create_item(run)


async def update_run(run_id: str, agent_id: str, patch: dict) -> dict | None:
    try:
        item = await _container("agent_runs").read_item(run_id, partition_key=agent_id)
        item.update(patch)
        return await _container("agent_runs").replace_item(run_id, item)
    except CosmosResourceNotFoundError:
        return None


async def list_runs_for_user(user_id: str, limit: int = 20) -> list[dict]:
    query = f"SELECT TOP {limit} * FROM c WHERE c.user_id = @uid ORDER BY c._ts DESC"
    items = _container("agent_runs").query_items(
        query=query,
        parameters=[{"name": "@uid", "value": user_id}],
    )
    return [item async for item in items]
