"""Alert models."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field
import uuid
from datetime import datetime, timezone


SEVERITY = Literal["info", "warning", "critical"]


class AlertCreate(BaseModel):
    agent_id: str
    agent_name: str
    message: str
    severity: SEVERITY = "info"


def alert_doc(user_id: str, body: AlertCreate) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "agent_id": body.agent_id,
        "agent_name": body.agent_name,
        "message": body.message,
        "severity": body.severity,
        "timestamp": now,
        "read": False,
        "telegram_sent": False,
    }
