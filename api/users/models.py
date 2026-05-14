"""User management models."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, field_validator


VALID_ROLES = ["admin", "editor", "viewer"]


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None
    display_name: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {VALID_ROLES}")
        return v


class InviteCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    role: str = Field("editor")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {VALID_ROLES}")
        return v

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v):
        return v.strip().lower()
