"""
Anthene Light Agentic — Tool Hub
=================================
Standalone FastAPI service exposing all Anthene capabilities as callable tools
for the LangGraph runtime. Each tool is also registered as a LangGraph @tool
so the runtime can load them by ID.

Tools available:
  adsb_area         — Live aircraft in an area (ADS-B Exchange)
  adsb_military     — Global military aircraft
  effis_fires       — Active wildfires (EFFIS/FIRMS)
  weather_area      — Weather data for coordinates
  map_geocode       — Address → coordinates (Azure Maps)
  web_search        — Web search (Bing Search API)
  file_read         — Read uploaded file from Blob Storage
  telegram_notify   — Send Telegram message
  calculator        — Safe math expression evaluator

Endpoints:
  GET  /tools                  — list all tools with metadata
  POST /tools/call/{tool_id}   — call a tool with JSON body
  GET  /health                 — health check
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tools.registry import TOOL_REGISTRY

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("anthene-toolhub")

app = FastAPI(title="Anthene Tool Hub", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ToolCallRequest(BaseModel):
    args: dict = {}


@app.get("/health")
def health():
    return {"status": "ok", "tools": list(TOOL_REGISTRY.keys())}


@app.get("/tools")
def list_tools():
    return [
        {
            "id": tid,
            "name": meta["name"],
            "description": meta["description"],
            "parameters": meta["parameters"],
        }
        for tid, meta in TOOL_REGISTRY.items()
    ]


@app.post("/tools/call/{tool_id}")
async def call_tool(tool_id: str, body: ToolCallRequest):
    if tool_id not in TOOL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")
    tool_meta = TOOL_REGISTRY[tool_id]
    try:
        result = await tool_meta["fn"](**body.args)
        return {"tool_id": tool_id, "result": result}
    except Exception as exc:
        logger.exception("Tool %s failed: %s", tool_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))
