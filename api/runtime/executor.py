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
from langchain_core.tools import tool as lc_tool
from langchain_openai import AzureChatOpenAI
from langgraph.prebuilt import create_react_agent

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
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(f"{TOOLHUB_URL}/tools")
        resp.raise_for_status()
        return resp.json()


def _build_lc_tool(tool_meta: dict) -> object:
    """Build a LangChain tool that calls the Tool Hub."""
    tool_id = tool_meta["id"]
    tool_name = tool_meta["name"].replace(" ", "_").lower()
    tool_desc = tool_meta["description"]

    @lc_tool(tool_name)
    async def dynamic_tool(**kwargs) -> str:
        f"""Call {tool_name} via Anthene Tool Hub. {tool_desc}"""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{TOOLHUB_URL}/tools/call/{tool_id}",
                json={"args": kwargs},
            )
            resp.raise_for_status()
            data = resp.json()
        return json.dumps(data.get("result", {}), ensure_ascii=False)

    dynamic_tool.__doc__ = tool_desc
    return dynamic_tool


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
        lc_tools = [_build_lc_tool(t) for t in selected_tools]

        # Build LLM
        llm = _make_llm(agent_def.get("model", "gpt-4o"))

        # Build graph
        system_prompt = agent_def.get("system_prompt", "You are a helpful assistant.")
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
