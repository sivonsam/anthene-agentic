"""Telegram router — user linking & webhook."""
from __future__ import annotations
import os
import random
import string
from fastapi import APIRouter, Depends, HTTPException, Request
from auth.dependencies import CurrentUser, get_current_user
from telegram import bot as tg_bot
from telegram import cosmos as db

router = APIRouter(tags=["telegram"])

BOT_USERNAME = "AntheneAgenticBot"
API_BASE_URL = os.getenv("API_BASE_URL", "")


def _random_code(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


# ── User-facing ───────────────────────────────────────────────────────────────

@router.get("/telegram/status")
async def telegram_status(user: CurrentUser = Depends(get_current_user)):
    """Check if user has linked their Telegram."""
    tg = await db.get_telegram_user(user.id)
    if tg and tg.get("chat_id") and not tg.get("pending"):
        return {"linked": True, "tg_username": tg.get("tg_username", "")}
    return {"linked": False}


@router.post("/telegram/link-start")
async def link_start(user: CurrentUser = Depends(get_current_user)):
    """Generate a one-time link code and return Telegram deep link."""
    code = _random_code(8)
    await db.create_link_request(user.id, code)
    deep_link = f"https://t.me/{BOT_USERNAME}?start={code}"
    return {"link_code": code, "deep_link": deep_link, "bot_username": BOT_USERNAME}


@router.delete("/telegram/unlink")
async def unlink(user: CurrentUser = Depends(get_current_user)):
    """Unlink Telegram from this account."""
    await db.delete_telegram_user(user.id)
    return {"unlinked": True}


# ── Admin: set webhook ─────────────────────────────────────────────────────────

@router.post("/telegram/set-webhook")
async def set_webhook(user: CurrentUser = Depends(get_current_user)):
    if not API_BASE_URL:
        raise HTTPException(500, "API_BASE_URL not configured")
    webhook_url = f"{API_BASE_URL}/api/telegram/webhook"
    result = await tg_bot.set_webhook(webhook_url)
    return result


# ── Telegram webhook (no auth — called by Telegram servers) ──────────────────

@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Handle incoming Telegram updates."""
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    message = update.get("message") or update.get("edited_message")
    if not message:
        return {"ok": True}

    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()
    tg_username = message.get("from", {}).get("username", "")

    if not chat_id:
        return {"ok": True}

    # Handle /start <link_code>
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        code = parts[1].strip() if len(parts) > 1 else ""
        if code:
            pending = await db.find_by_link_code(code)
            if pending:
                await db.complete_link(pending["user_id"], chat_id, tg_username)
                await tg_bot.send_message(
                    chat_id,
                    "✅ <b>Anthene Agentic</b> on nyt yhdistetty Telegram-tiliisi!\n"
                    "Saat jatkossa agenttien hälytykset suoraan tähän chattiin.",
                )
                return {"ok": True}
        # No code or code not found
        await tg_bot.send_message(
            chat_id,
            "👋 Tervetuloa <b>Anthene Agentic</b> -bottiin!\n"
            "Linkitä tilisi avaamalla Anthene-sovellus → Hälytykset → Telegram-linkitys.",
        )

    return {"ok": True}
