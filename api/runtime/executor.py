"""
LangGraph Agent Runtime — executes agents as ReAct graphs with SSE streaming.

POST /run/{agent_id}
  Body: { "message": "...", "session_id": "optional" }
  Response: SSE stream of events:
    data: {"type": "token", "content": "..."}
    data: {"type": "tool_start", "tool": "...", "input": {...}}
    data: {"type": "tool_end", "tool": "...", "output": "..."}
    data: {"type": "done", "run_id": "..."}
    data: {"type": "error", "message": "..."}
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator

import httpx
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import StructuredTool
from langchain_openai import AzureChatOpenAI
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel, Field, create_model

logger = logging.getLogger(__name__)

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
TOOLHUB_URL = os.getenv("TOOLHUB_URL", "http://localhost:8001")

# In-process session memory (replace with Redis/Cosmos for multi-instance)
_sessions: dict[str, list] = {}


def _make_llm(model_name: str) -> AzureChatOpenAI:
    deployment = os.getenv(f"AZURE_DEPLOYMENT_{model_name.upper().replace('-', '_')}", model_name)
    return AzureChatOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
        azure_deployment=deployment,
        temperature=0,
        streaming=True,
    )


async def _fetch_tool_list() -> list[dict]:
    """Fetch available tools from Tool Hub."""
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, verify=False) as client:
        resp = await client.get(f"{TOOLHUB_URL}/tools")
        resp.raise_for_status()
        return resp.json()


def _build_lc_tool(tool_meta: dict, aoi_bbox: dict | None = None) -> StructuredTool:
    """Build a typed LangChain StructuredTool that calls the Tool Hub."""
    tool_id = tool_meta["id"]
    # OpenAI tool names: only [a-zA-Z0-9_.-] allowed
    import re
    tool_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', tool_meta["name"]).strip('_').lower()
    tool_name = re.sub(r'_+', '_', tool_name)  # collapse multiple underscores
    tool_desc = tool_meta["description"]
    parameters = tool_meta.get("parameters", {})

    _type_map = {"number": float, "integer": int, "string": str, "boolean": bool}
    field_defs: dict = {}
    for pname, pinfo in parameters.items():
        py_type = _type_map.get(pinfo.get("type", "string"), str)
        field_defs[pname] = (py_type, Field(default=None, description=pinfo.get("description", "")))

    InputModel: type[BaseModel] | None = (
        create_model(f"{tool_name}_args", **field_defs) if field_defs else None
    )

    # Pre-fill geo defaults from AOI bounding box
    _geo_defaults: dict = {}
    if aoi_bbox and parameters:
        for pname in parameters:
            if pname in aoi_bbox:
                _geo_defaults[pname] = aoi_bbox[pname]

    async def _call(**kwargs) -> str:
        merged = {**_geo_defaults, **{k: v for k, v in kwargs.items() if v is not None}}
        async with httpx.AsyncClient(timeout=30, follow_redirects=False, verify=False) as client:
            resp = await client.post(
                f"{TOOLHUB_URL}/tools/call/{tool_id}",
                json={"args": merged},
            )
            resp.raise_for_status()
            data = resp.json()
        return json.dumps(data.get("result", {}), ensure_ascii=False)

    if InputModel:
        return StructuredTool.from_function(
            coroutine=_call,
            name=tool_name,
            description=tool_desc,
            args_schema=InputModel,
        )

    # No-parameter tool
    async def _call_noargs() -> str:
        return await _call()

    return StructuredTool.from_function(
        coroutine=_call_noargs,
        name=tool_name,
        description=tool_desc,
    )


async def run_agent_stream(
    agent_def: dict,
    message: str,
    session_id: str,
    run_id: str,
) -> AsyncIterator[str]:
    """Stream SSE events from a LangGraph ReAct agent."""

    def _sse(obj: dict) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    try:
        # Load tools from Tool Hub
        all_tools = await _fetch_tool_list()
        enabled_ids = set(agent_def.get("tools", []))
        selected_tools = [t for t in all_tools if t["id"] in enabled_ids]

        # AOI — inject bounding box as default args for geo tools
        aoi = agent_def.get("aoi")  # GeoJSON Polygon geometry | None
        aoi_bbox: dict | None = None
        if aoi and aoi.get("type") == "Polygon":
            coords = aoi["coordinates"][0]
            lats = [c[1] for c in coords]
            lons = [c[0] for c in coords]
            aoi_bbox = {
                "lat": (min(lats) + max(lats)) / 2,
                "lon": (min(lons) + max(lons)) / 2,
                "lat_min": min(lats), "lat_max": max(lats),
                "lon_min": min(lons), "lon_max": max(lons),
            }

        lc_tools = [_build_lc_tool(t, aoi_bbox) for t in selected_tools]

        # Build LLM
        llm = _make_llm(agent_def.get("model", "gpt-4o"))

        # Build system prompt — append AOI context when defined
        system_prompt = agent_def.get("system_prompt", "You are a helpful assistant.")

        # --- Capability constraint (always injected) ---
        # Split tools: enabled vs available-but-not-enabled
        available_not_enabled = [t for t in all_tools if t["id"] not in enabled_ids]

        if selected_tools:
            enabled_lines = "\n".join(
                f"  - {t['name']} [id:{t['id']}]: {t.get('description', '')}" for t in selected_tools
            )
        else:
            enabled_lines = "  (ei yhtään työkalua käytössä)"

        if available_not_enabled:
            available_lines = "\n".join(
                f"  - {t['name']} [id:{t['id']}]: {t.get('description', '')}" for t in available_not_enabled
            )
        else:
            available_lines = "  (ei lisättäviä työkaluja)"

        capability_block = (
            "\n\n---\n"
            "TÄMÄN AGENTIN KÄYTÖSSÄ OLEVAT TYÖKALUT:\n"
            f"{enabled_lines}\n\n"
            "JÄRJESTELMÄSSÄ SAATAVILLA MUTTA EI KÄYTÖSSÄ TÄSSÄ AGENTISSA:\n"
            f"{available_lines}\n\n"
            "KÄYTTÄYTYMISSÄÄNNÖT:\n"
            "1. Toimi VAIN yllä lueteltujen käytössä olevien työkalujen puitteissa.\n"
            "2. Jos käyttäjä pyytää jotain mitä EI OLE käytössä tässä agentissa MUTTA ON saatavilla järjestelmässä, "
            "vastaa lyhyesti: mitä pyydettiin, mikä työkalu sen hoitaisi, ja sisällytä vastaukseen TASAN YKSI rivi muodossa:\n"
            "   [ADD_TOOL: tool_id | Työkalun nimi]\n"
            "   Älä selitä enemmän — käyttäjä näkee nappin jolla lisätä työkalu.\n"
            "3. Jos pyydettävää kyvykkyyttä EI OLE missään järjestelmässä, vastaa lyhyesti mitä pyydettiin "
            "ja ehdota pelkästään kirjausta kehitys-backlogiin.\n"
            "4. Älä KOSKAAN ehdota ulkoisia rajapintoja, kolmannen osapuolen palveluita tai muita integraatioita.\n"
            "---"
        )
        system_prompt += capability_block

        if aoi_bbox:
            system_prompt += (
                f"\n\nValvonta-alue (AOI) on määritetty. Käytä aina tätä aluetta geotyökaluissa ellei käyttäjä erikseen pyydä muuta:\n"
                f"- Keskipiste: lat={aoi_bbox['lat']:.4f}, lon={aoi_bbox['lon']:.4f}\n"
                f"- Kattavuus: lat {aoi_bbox['lat_min']:.4f}–{aoi_bbox['lat_max']:.4f}, "
                f"lon {aoi_bbox['lon_min']:.4f}–{aoi_bbox['lon_max']:.4f}\n"
                f"Analysoi tapahtumat tällä alueella."
            )
        graph = create_react_agent(llm, lc_tools)

        # Session memory
        history = _sessions.get(session_id, [])
        messages = [SystemMessage(content=system_prompt)] + history + [HumanMessage(content=message)]

        ai_response_parts = []

        # Stream
        async for event in graph.astream_events({"messages": messages}, version="v2"):
            kind = event.get("event", "")

            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    ai_response_parts.append(chunk.content)
                    yield _sse({"type": "token", "content": chunk.content})

            elif kind == "on_tool_start":
                tool_name = event.get("name", "unknown")
                tool_input = event.get("data", {}).get("input", {})
                yield _sse({"type": "tool_start", "tool": tool_name, "input": tool_input})

            elif kind == "on_tool_end":
                tool_name = event.get("name", "unknown")
                tool_output = event.get("data", {}).get("output", "")
                yield _sse({"type": "tool_end", "tool": tool_name, "output": str(tool_output)[:500]})

        # Update session memory
        ai_content = "".join(ai_response_parts)
        history.append(HumanMessage(content=message))
        history.append(AIMessage(content=ai_content))
        # Keep last 20 message pairs
        _sessions[session_id] = history[-40:]

        yield _sse({"type": "done", "run_id": run_id})

    except Exception as exc:
        logger.exception("Agent run %s failed: %s", run_id, exc)
        yield _sse({"type": "error", "message": str(exc)})
