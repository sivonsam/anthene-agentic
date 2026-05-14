"""Local auth — demo/dev login that issues signed JWTs."""
from __future__ import annotations
import hashlib, json, os, time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import jwt

from auth.dependencies import get_current_user, CurrentUser

router = APIRouter(tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "anthene-demo-secret-2025")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8

# Users: env var DEMO_USERS as JSON, or hardcoded defaults
_DEFAULT_USERS = [
    {"username": "admin",       "password_hash": hashlib.sha256(b"Jallukola").hexdigest(),   "role": "admin",  "name": "Admin"},
    {"username": "operaattori", "password_hash": hashlib.sha256(b"Anthene2025").hexdigest(), "role": "editor", "name": "Operaattori"},
    {"username": "demo",        "password_hash": hashlib.sha256(b"demo").hexdigest(),        "role": "viewer", "name": "Demo User"},
]

def _load_users():
    raw = os.getenv("DEMO_USERS")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return _DEFAULT_USERS

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: dict

@router.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest):
    users = _load_users()
    pw_hash = hashlib.sha256(req.password.encode()).hexdigest()
    user = next((u for u in users if u["username"] == req.username and u["password_hash"] == pw_hash), None)
    if not user:
        raise HTTPException(status_code=401, detail="Väärä käyttäjätunnus tai salasana")
    now = int(time.time())
    payload = {
        "sub": user["username"],
        "oid": user["username"],
        "name": user["name"],
        "extension_Role": user["role"],
        "emails": [f"{user['username']}@anthene.local"],
        "iss": "anthene-local",
        "iat": now,
        "exp": now + JWT_EXPIRE_HOURS * 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"token": token, "user": {"id": user["username"], "name": user["name"], "role": user["role"]}}


# ── Session config ─────────────────────────────────────────────────────────────

DEFAULT_SESSION_HOURS = 8


@router.get("/auth/session-config")
async def get_session_config(user: CurrentUser = Depends(get_current_user)):
    """Get session configuration."""
    try:
        from agents import cosmos
        doc = await cosmos.get_config("session")
        return doc or {"session_hours": DEFAULT_SESSION_HOURS, "max_idle_minutes": 60}
    except Exception:
        return {"session_hours": DEFAULT_SESSION_HOURS, "max_idle_minutes": 60}


@router.put("/auth/session-config")
async def update_session_config(
    body: dict,
    user: CurrentUser = Depends(get_current_user)
):
    """Admin only: update session configuration."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        from agents import cosmos
        await cosmos.upsert_config("session", body)
    except Exception:
        pass
    return body


@router.post("/auth/refresh")
async def refresh_token(user: CurrentUser = Depends(get_current_user)):
    """Refresh token for another session_hours period."""
    try:
        from agents import cosmos
        config = await cosmos.get_config("session") or {}
        hours = config.get("session_hours", DEFAULT_SESSION_HOURS)
    except Exception:
        hours = DEFAULT_SESSION_HOURS

    now = int(time.time())
    payload = {
        "sub": user.id,
        "oid": user.id,
        "name": user.display_name,
        "extension_Role": user.role,
        "emails": [user.email] if user.email else [],
        "iss": "anthene-local",
        "iat": now,
        "exp": now + int(hours) * 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"token": token, "expires_in": int(hours) * 3600}
