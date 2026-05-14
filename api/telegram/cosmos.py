"""Cosmos helpers for Telegram user linking."""
from __future__ import annotations
from agents.cosmos import _container
from azure.cosmos.exceptions import CosmosResourceNotFoundError


async def get_telegram_user(user_id: str) -> dict | None:
    try:
        return await _container("telegram_users").read_item(user_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        return None


async def save_telegram_user(user_id: str, chat_id: int, tg_username: str = "") -> dict:
    doc = {"id": user_id, "user_id": user_id, "chat_id": chat_id, "tg_username": tg_username}
    return await _container("telegram_users").upsert_item(doc)


async def delete_telegram_user(user_id: str) -> bool:
    try:
        await _container("telegram_users").delete_item(user_id, partition_key=user_id)
        return True
    except CosmosResourceNotFoundError:
        return False


async def find_by_link_code(link_code: str) -> dict | None:
    """Find a pending link request by code."""
    q = "SELECT * FROM c WHERE c.link_code = @code AND c.pending = true"
    items = _container("telegram_users").query_items(
        query=q, parameters=[{"name": "@code", "value": link_code}]
    )
    async for item in items:
        return item
    return None


async def create_link_request(user_id: str, link_code: str) -> dict:
    """Upsert a pending link request (overwrite any previous)."""
    doc = {"id": user_id, "user_id": user_id, "link_code": link_code, "pending": True}
    return await _container("telegram_users").upsert_item(doc)


async def complete_link(user_id: str, chat_id: int, tg_username: str = "") -> dict:
    """Finalise linking — clear pending state, store chat_id."""
    doc = {
        "id": user_id,
        "user_id": user_id,
        "chat_id": chat_id,
        "tg_username": tg_username,
        "pending": False,
        "link_code": None,
    }
    return await _container("telegram_users").upsert_item(doc)
