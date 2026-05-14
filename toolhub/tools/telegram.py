"""Telegram alert tool — sends personal DM via @AntheneAgenticBot."""

from __future__ import annotations

import os
import httpx

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


async def telegram_alert(
    message: str,
    severity: str = "info",
    chat_id: str = "",
) -> dict:
    """Send a Telegram alert to the user's personal DM.

    Requires the user to have linked their Telegram account in the Anthene Alerts UI.
    The chat_id is injected automatically by the agent runtime from the user's profile.
    """
    if not BOT_TOKEN:
        return {"error": "TELEGRAM_BOT_TOKEN not configured"}
    if not chat_id:
        return {"error": "Käyttäjällä ei ole linkitettyä Telegram-tiliä. Pyydä käyttäjää linkittämään tili Hälytysnäkymässä."}

    icon = {"info": "ℹ️", "warning": "⚠️", "critical": "🚨"}.get(severity, "🔔")
    text = f"{icon} <b>Anthene-hälytys</b>\n{message}"

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json=payload)
            data = resp.json()
        except Exception as e:
            return {"error": str(e)}

    return {
        "sent": data.get("ok", False),
        "message_id": data.get("result", {}).get("message_id"),
        "chat_id": chat_id,
        "severity": severity,
    }
