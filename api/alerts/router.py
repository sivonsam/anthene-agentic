"""Alerts router."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from auth.dependencies import CurrentUser, get_current_user
from alerts.models import AlertCreate, alert_doc
from alerts import cosmos as db
from telegram import bot as tg_bot
from telegram import cosmos as tg_db

router = APIRouter(tags=["alerts"])


@router.get("/alerts")
async def list_alerts(user: CurrentUser = Depends(get_current_user)):
    return await db.list_alerts(user.id)


@router.post("/alerts", status_code=201)
async def create_alert(body: AlertCreate, user: CurrentUser = Depends(get_current_user)):
    doc = alert_doc(user.id, body)
    created = await db.create_alert(doc)
    # Send Telegram DM if user has linked their account
    tg_user = await tg_db.get_telegram_user(user.id)
    if tg_user and tg_user.get("chat_id"):
        icon = {"info": "ℹ️", "warning": "⚠️", "critical": "🚨"}.get(body.severity, "🔔")
        text = (
            f"{icon} <b>Anthene-hälytys</b>\n"
            f"<b>Agentti:</b> {body.agent_name}\n"
            f"<b>Viesti:</b> {body.message}"
        )
        sent = await tg_bot.send_message(tg_user["chat_id"], text)
        if sent:
            await db.mark_telegram_sent(created["id"], user.id)
    return created


@router.patch("/alerts/{alert_id}/read")
async def mark_read(alert_id: str, user: CurrentUser = Depends(get_current_user)):
    updated = await db.mark_read(alert_id, user.id)
    if not updated:
        raise HTTPException(404, "Alert not found")
    return updated


@router.patch("/alerts/read-all")
async def mark_all_read(user: CurrentUser = Depends(get_current_user)):
    alerts = await db.list_alerts(user.id)
    for a in alerts:
        if not a.get("read"):
            await db.mark_read(a["id"], user.id)
    return {"marked": len([a for a in alerts if not a.get("read")])}


@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, user: CurrentUser = Depends(get_current_user)):
    ok = await db.delete_alert(alert_id, user.id)
    if not ok:
        raise HTTPException(404, "Alert not found")
    return {"deleted": alert_id}
