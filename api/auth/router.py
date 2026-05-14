"""Local auth — demo/dev login that issues signed JWTs."""
from __future__ import annotations
import hashlib, json, os, time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import jwt

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
