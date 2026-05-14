"""Cosmos DB helpers for alerts container."""
from __future__ import annotations
from agents.cosmos import _container
from azure.cosmos.exceptions import CosmosResourceNotFoundError


async def create_alert(doc: dict) -> dict:
    return await _container("alerts").create_item(doc)


async def list_alerts(user_id: str) -> list[dict]:
    q = "SELECT * FROM c WHERE c.user_id = @uid ORDER BY c.timestamp DESC"
    items = _container("alerts").query_items(
        query=q, parameters=[{"name": "@uid", "value": user_id}]
    )
    return [item async for item in items]


async def get_alert(alert_id: str, user_id: str) -> dict | None:
    try:
        return await _container("alerts").read_item(alert_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        return None


async def mark_read(alert_id: str, user_id: str) -> dict | None:
    item = await get_alert(alert_id, user_id)
    if not item:
        return None
    item["read"] = True
    return await _container("alerts").replace_item(alert_id, item)


async def delete_alert(alert_id: str, user_id: str) -> bool:
    try:
        await _container("alerts").delete_item(alert_id, partition_key=user_id)
        return True
    except CosmosResourceNotFoundError:
        return False


async def mark_telegram_sent(alert_id: str, user_id: str) -> None:
    item = await get_alert(alert_id, user_id)
    if item:
        item["telegram_sent"] = True
        await _container("alerts").replace_item(alert_id, item)
