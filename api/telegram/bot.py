"""Telegram bot helpers — send messages, set webhook."""
from __future__ import annotations
import os
import httpx

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = "https://api.telegram.org"


async def send_message(chat_id: str | int, text: str, parse_mode: str = "HTML") -> bool:
    if not BOT_TOKEN:
        return False
    url = f"{TELEGRAM_API}/bot{BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode})
            return resp.status_code == 200
        except Exception:
            return False


async def set_webhook(webhook_url: str) -> dict:
    url = f"{TELEGRAM_API}/bot{BOT_TOKEN}/setWebhook"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json={"url": webhook_url})
        return resp.json()


async def delete_webhook() -> dict:
    url = f"{TELEGRAM_API}/bot{BOT_TOKEN}/deleteWebhook"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url)
        return resp.json()
