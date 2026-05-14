"""Pydantic models for agents."""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
import uuid
from datetime import datetime, timezone


VALID_TOOLS = [
    "adsb_area", "adsb_military", "opensky_area", "opensky_aircraft",
    "fmi_observations", "fmi_warnings", "weather_area",
    "effis_fires", "firms_fires",
    "fingrid_status", "fingrid_disturbances",
    "entsoe_load", "entsoe_outages", "gas_storage",
    "stuk_radiation", "gdacs_alerts",
    "map_geocode", "web_search", "file_read", "telegram_notify", "calculator",
]

VALID_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "phi-3-medium", "mistral-large"]

# Agent categories — describe the MISSION of the agent, not the technology
VALID_CATEGORIES = [
    "aluevalvonta",   # 🗺️  AOI-pohjainen aluevalvonta
    "liikenne",       # 🚦  Ilma-, meri- ja tieliikenne
    "ymparisto",      # 🌿  Ympäristö, tulipalot, luonnonilmiöt
    "energia",        # ⚡  Sähköverkko, kaasu, ydinvoima, kriittinen infra
    "turvallisuus",   # 🛡️  Pelastus, rajavalvonta, yleinen turvallisuus
    "tiedustelu",     # 🔍  Tilannekuva, analytiikka, raportointi
    "halytin",        # 🔔  Kynnysarvopohjainen automaattinen hälytin
    "superagenti",    # 🌐  Kaikki 21 työkalua, kattava tilannekuva
    "yleinen",        # ⚙️  Yleiskäyttöinen
]

VALID_VISIBILITIES = ["private", "shared"]


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field("", max_length=500)
    system_prompt: str = Field(..., min_length=10, max_length=4000)
    tools: list[str] = Field(default_factory=list)
    model: str = Field("gpt-4o")
    visibility: Literal["private", "shared"] = "private"
    category: str = Field("yleinen")
    graph_type: Literal["react", "custom"] = "react"
    memory_scope: Literal["conversation", "user", "global"] = "conversation"
    aoi: Optional[dict[str, Any]] = None  # GeoJSON Polygon geometry


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    tools: Optional[list[str]] = None
    model: Optional[str] = None
    visibility: Optional[Literal["private", "shared"]] = None
    category: Optional[str] = None
    aoi: Optional[dict[str, Any]] = None


class AgentResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    description: str
    system_prompt: str
    tools: list[str]
    model: str
    visibility: str
    category: str
    graph_type: str
    memory_scope: str
    aoi: Optional[dict[str, Any]] = None
    created_at: str
    updated_at: str


def agent_doc(owner_id: str, data: AgentCreate) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "owner_id": owner_id,
        "name": data.name,
        "description": data.description,
        "system_prompt": data.system_prompt,
        "tools": [t for t in data.tools if t in VALID_TOOLS],
        "model": data.model if data.model in VALID_MODELS else "gpt-4o",
        "visibility": data.visibility,
        "category": data.category if data.category in VALID_CATEGORIES else "yleinen",
        "graph_type": data.graph_type,
        "memory_scope": data.memory_scope,
        "aoi": data.aoi,
        "created_at": now,
        "updated_at": now,
    }
