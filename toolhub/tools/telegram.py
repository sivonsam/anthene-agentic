"""Telegram notification tool."""

from __future__ import annotations

import os
import httpx

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "")


async def telegram_notify(message: str) -> dict:
    """Send a message to the configured Telegram channel."""
    if not BOT_TOKEN or not CHANNEL_ID:
        return {"error": "Telegram not configured (missing BOT_TOKEN or CHANNEL_ID)"}

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": CHANNEL_ID, "text": message, "parse_mode": "HTML"}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    return {
        "sent": data.get("ok", False),
        "message_id": data.get("result", {}).get("message_id"),
        "channel": CHANNEL_ID,
    }
