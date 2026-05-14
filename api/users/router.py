"""Users router."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from auth.dependencies import CurrentUser, get_current_user
from agents.cosmos import get_or_create_user, update_user

router = APIRouter(tags=["users"])


class UserPreferencesUpdate(BaseModel):
    display_name: Optional[str] = None
    preferences: Optional[dict] = None


@router.get("/users/me")
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Get or create the current user's profile."""
    profile = await get_or_create_user(user.id, {
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "preferences": {},
    })
    return profile


@router.patch("/users/me")
async def update_me(body: UserPreferencesUpdate, user: CurrentUser = Depends(get_current_user)):
    """Update current user's display name or preferences."""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await update_user(user.id, patch)
    return updated or {"id": user.id, "message": "No changes"}
