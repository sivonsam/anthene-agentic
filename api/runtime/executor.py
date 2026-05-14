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


def _build_lc_tool(tool_meta: dict, aoi_bbox: dict | None = None, extra_defaults: dict | None = None) -> StructuredTool:
    """Build a typed LangChain StructuredTool that calls the Tool Hub."""
    tool_id = tool_meta["id"]
    # Use the tool ID as the LangChain tool name — it's already clean (a-z0-9_)
    # and the LLM can match it to the capability block which shows [id:...].
    # OpenAI tool names: only [a-zA-Z0-9_.-] allowed — tool IDs satisfy this.
    import re
    tool_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', tool_id).strip('_').lower()
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

    # Pre-fill geo defaults from AOI bounding box + any extra defaults (e.g. chat_id)
    _geo_defaults: dict = {}
    if aoi_bbox and parameters:
        for pname in parameters:
            if pname in aoi_bbox:
                _geo_defaults[pname] = aoi_bbox[pname]
    if extra_defaults:
        _geo_defaults.update(extra_defaults)

    async def _call(**kwargs) -> str:
        merged = {**_geo_defaults, **{k: v for k, v in kwargs.items() if v is not None}}
        _HTTP_MEANINGS = {
            400: "Virheellinen pyyntö — tarkista parametrit",
            401: "Ei autentikoitu — API-avain puuttuu tai on virheellinen",
            403: "Ei käyttöoikeutta — API-avain ei tue tätä endpointia tai suunnitelma on liian suppea",
            404: "Endpointtia ei löydy — työkalu tai resurssi ei ole saatavilla",
            408: "Pyyntö aikakatkaistiin — palvelin ei vastannut ajoissa",
            429: "Liian monta pyyntöä — API-kutsujen raja ylitetty, odota hetki",
            500: "Palvelinvirhe — työkalu kaatui odottamattomasti",
            502: "Yhdyskäytävävirhe — välityspalvelin sai virheellisen vastauksen",
            503: "Palvelu ei käytettävissä — palvelin tilapäisesti poissa käytöstä",
            504: "Yhdyskäytävän aikakatkaisu — palvelu ei vastannut ajoissa",
        }
        async with httpx.AsyncClient(timeout=30, follow_redirects=False, verify=False) as client:
            resp = await client.post(
                f"{TOOLHUB_URL}/tools/call/{tool_id}",
                json={"args": merged},
            )
            if not resp.is_success:
                code = resp.status_code
                meaning = _HTTP_MEANINGS.get(code, "Tuntematon virhe")
                return json.dumps({
                    "error": True,
                    "status_code": code,
                    "status_text": resp.reason_phrase,
                    "meaning": meaning,
                    "tool": tool_id,
                    "message": f"HTTP {code} {resp.reason_phrase} — {meaning}",
                }, ensure_ascii=False)
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
    user_id: str = "",
) -> AsyncIterator[str]:
    """Stream SSE events from a LangGraph ReAct agent."""

    def _sse(obj: dict) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    try:
        # Load tools from Tool Hub
        all_tools = await _fetch_tool_list()
        enabled_ids = set(agent_def.get("tools", []))
        selected_tools = [t for t in all_tools if t["id"] in enabled_ids]

        # Fetch user's Telegram chat_id for telegram_alert tool injection
        user_telegram_chat_id = ""
        if user_id and "telegram_alert" in enabled_ids:
            try:
                from telegram.cosmos import get_telegram_user
                tg = await get_telegram_user(user_id)
                if tg and tg.get("chat_id") and not tg.get("pending"):
                    user_telegram_chat_id = str(tg["chat_id"])
            except Exception:
                pass

        # AOI — inject bounding box as default args for geo tools
        aoi = agent_def.get("aoi")  # GeoJSON Polygon geometry | None
        aoi_bbox: dict | None = None
        if aoi and aoi.get("type") == "Polygon":
            coords = aoi["coordinates"][0]
            lats = [c[1] for c in coords]
            lons = [c[0] for c in coords]
            center_lat = (min(lats) + max(lats)) / 2
            center_lon = (min(lons) + max(lons)) / 2
            # Compute radius from center to farthest corner (in km and nm)
            import math
            def _haversine_km(lat1, lon1, lat2, lon2):
                R = 6371.0
                dlat = math.radians(lat2 - lat1)
                dlon = math.radians(lon2 - lon1)
                a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
                return R * 2 * math.asin(math.sqrt(a))
            max_radius_km = max(
                _haversine_km(center_lat, center_lon, lat, lon)
                for lat, lon in zip(lats, lons)
            )
            max_radius_km = max(max_radius_km, 50.0)  # minimum 50km
            max_radius_nm = max_radius_km / 1.852
            aoi_bbox = {
                "lat": center_lat,
                "lon": center_lon,
                # bbox variants for different tools
                "lat_min": min(lats), "lat_max": max(lats),
                "lon_min": min(lons), "lon_max": max(lons),
                # Digitraffic uses lamin/lamax/lomin/lomax
                "lamin": min(lats), "lamax": max(lats),
                "lomin": min(lons), "lomax": max(lons),
                # radius variants for different tools
                "radius_km": round(max_radius_km, 1),
                "radius_nm": round(max_radius_nm, 1),
                "dist_nm": round(max_radius_nm, 1),
            }

        lc_tools = [_build_lc_tool(
            t, aoi_bbox,
            extra_defaults={"chat_id": user_telegram_chat_id} if t["id"] == "telegram_alert" and user_telegram_chat_id else None,
        ) for t in selected_tools]

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
                f"\n\nValvonta-alue (AOI) on määritetty. Käytä AINA seuraavia arvoja geotyökaluissa ellei käyttäjä erikseen pyydä muuta:\n"
                f"- Keskipiste: lat={aoi_bbox['lat']:.4f}, lon={aoi_bbox['lon']:.4f}\n"
                f"- Säde: radius_nm={aoi_bbox['radius_nm']:.1f} meripeninkulma, radius_km={aoi_bbox['radius_km']:.1f} km, dist_nm={aoi_bbox['dist_nm']:.1f}\n"
                f"- Bounding box: lat_min={aoi_bbox['lat_min']:.4f} lat_max={aoi_bbox['lat_max']:.4f} "
                f"lon_min={aoi_bbox['lon_min']:.4f} lon_max={aoi_bbox['lon_max']:.4f}\n"
                f"- Digitraffic/bbox-muoto: lamin={aoi_bbox['lamin']:.4f} lamax={aoi_bbox['lamax']:.4f} "
                f"lomin={aoi_bbox['lomin']:.4f} lomax={aoi_bbox['lomax']:.4f}\n"
                f"Analysoi tapahtumat tällä alueella. Käytä mieluiten vessels_bbox aluksille (bbox-haulla) ja adsb_area/opensky_area lentokoneille (säde-haulla).\n\n"
                f"TÄRKEÄÄ — Alueskopeutus: Kun AOI on valittu, rajoita KAIKKI vastauksesi ja analyysisi kyseiseen alueeseen. "
                f"Jos käyttäjä esittää avoimen kysymyksen (esim. 'mitä tapahtuu?', 'näytä liikenne', 'onko jotain poikkeavaa?'), "
                f"tulkitse se aina tarkoittamaan kyseistä valittua kartta-aluetta — älä kerro yleisistä globaaleista tai muiden alueiden tapahtumista. "
                f"Jos jokin havainto tai tieto ei kuulu AOI-alueelle, jätä se mainitsematta."
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
                # For map tools, send full output (needed for visualization).
                # For other tools, cap at 8000 chars to keep SSE manageable.
                MAP_TOOL_IDS = {
                    'adsb_area','adsb_military','aircraft_trail','aircraft_detail',
                    'opensky_area','opensky_aircraft',
                    'vessels_area','vessels_bbox','vessel_detail',
                    'effis_fires','firms_fires','fmi_lightning',
                    'stuk_radiation','gdacs_alerts','map_geocode',
                    'detect_clusters','correlate_events',
                    'weather_area','fmi_observations','fmi_warnings',
                }
                # LangGraph may return a ToolMessage or string — extract content
                if hasattr(tool_output, "content"):
                    raw_output = tool_output.content
                    if isinstance(raw_output, list):
                        # Multi-part content list — join text parts
                        raw_output = "".join(
                            p.get("text", "") if isinstance(p, dict) else str(p)
                            for p in raw_output
                        )
                else:
                    raw_output = str(tool_output)
                limit = len(raw_output) if tool_name in MAP_TOOL_IDS else 8000
                yield _sse({"type": "tool_end", "tool": tool_name, "output": raw_output[:limit]})

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
