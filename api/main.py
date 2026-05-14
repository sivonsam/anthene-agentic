"""
Anthene Light Agentic — Main API
==================================
FastAPI application providing:
  - Azure AD B2C JWT authentication
  - Agent registry (CRUD) backed by Azure Cosmos DB
  - LangGraph agent runtime with SSE streaming
  - User profile management
  - Tool Hub proxy

Base URL: /api

Endpoints:
  GET    /api/health
  GET    /api/users/me
  GET    /api/tools
  GET    /api/agents
  POST   /api/agents
  GET    /api/agents/{agent_id}
  PATCH  /api/agents/{agent_id}
  DELETE /api/agents/{agent_id}
  GET    /api/agents/store          (shared/public agents)
  POST   /api/run/{agent_id}        (SSE streaming execution)
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.router import router as agents_router
from runtime.router import router as runtime_router
from tools.router import router as tools_router
from users.router import router as users_router
from consult.router import router as consult_router

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("anthene-agentic-api")

app = FastAPI(
    title="Anthene Light Agentic API",
    version="1.0.0",
    description="Agentic runtime platform for Anthene Light Agentic",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router, prefix="/api")
app.include_router(runtime_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(consult_router, prefix="/api")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "anthene-agentic-api",
        "version": "1.0.0",
    }
