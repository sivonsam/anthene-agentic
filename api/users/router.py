"""Users router — profile + admin management."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import CurrentUser, get_current_user, require_admin
from agents.cosmos import (
    get_or_create_user, update_user, list_all_users,
    get_user_by_id, update_user_admin, delete_user_record,
    create_invite, list_invites, delete_invite,
)
from users.models import UserAdminUpdate, InviteCreate

router = APIRouter(tags=["users"])


class UserPreferencesUpdate(BaseModel):
    display_name: Optional[str] = None
    preferences: Optional[dict] = None


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/users/me")
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Get or create the current user's profile."""
    profile = await get_or_create_user(user.id, {
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "active": True,
        "preferences": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return profile


@router.patch("/users/me")
async def update_me(body: UserPreferencesUpdate, user: CurrentUser = Depends(get_current_user)):
    """Update current user's display name or preferences."""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await update_user(user.id, patch)
    return updated or {"id": user.id, "message": "No changes"}


# ── Admin — user management ───────────────────────────────────────────────────

@router.get("/admin/users")
async def admin_list_users(_: CurrentUser = Depends(require_admin)):
    """Admin: list all registered users."""
    users = await list_all_users()
    # Strip Cosmos internal fields
    clean = []
    for u in users:
        clean.append({
            "id": u.get("id"),
            "email": u.get("email", ""),
            "display_name": u.get("display_name", ""),
            "role": u.get("role", "editor"),
            "active": u.get("active", True),
            "created_at": u.get("created_at", ""),
            "preferences": u.get("preferences", {}),
        })
    return clean


@router.patch("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    body: UserAdminUpdate,
    actor: CurrentUser = Depends(require_admin),
):
    """Admin: update a user's role or active status."""
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Admins cannot modify their own account via this endpoint")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = await update_user_admin(user_id, patch)
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": updated.get("id"),
        "email": updated.get("email", ""),
        "display_name": updated.get("display_name", ""),
        "role": updated.get("role", "editor"),
        "active": updated.get("active", True),
    }


@router.delete("/admin/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: str,
    actor: CurrentUser = Depends(require_admin),
):
    """Admin: remove a user record (does not revoke B2C account)."""
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    deleted = await delete_user_record(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")


# ── Admin — invites ───────────────────────────────────────────────────────────

@router.get("/admin/invites")
async def admin_list_invites(_: CurrentUser = Depends(require_admin)):
    """Admin: list all pending invites."""
    return await list_invites()


@router.post("/admin/invites", status_code=201)
async def admin_create_invite(
    body: InviteCreate,
    actor: CurrentUser = Depends(require_admin),
):
    """Admin: create an email invite with a pre-assigned role."""
    now = datetime.now(timezone.utc).isoformat()
    invite_doc = {
        "id": str(uuid.uuid4()),
        "email": body.email,
        "role": body.role,
        "consumed": False,
        "created_by": actor.id,
        "created_at": now,
    }
    return await create_invite(invite_doc)


@router.delete("/admin/invites/{invite_id}", status_code=204)
async def admin_delete_invite(
    invite_id: str,
    _: CurrentUser = Depends(require_admin),
):
    """Admin: cancel a pending invite."""
    deleted = await delete_invite(invite_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Invite not found")

