"""Tools router — proxy to Tool Hub."""

from __future__ import annotations

import httpx
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import CurrentUser, get_current_user

router = APIRouter(tags=["tools"])
TOOLHUB_URL = os.getenv("TOOLHUB_URL", "http://localhost:8001")


@router.get("/tools")
async def list_tools(user: CurrentUser = Depends(get_current_user)):
    """List all available tools from the Tool Hub."""
    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
        resp = await client.get(f"{TOOLHUB_URL}/tools")
        resp.raise_for_status()
        return resp.json()
