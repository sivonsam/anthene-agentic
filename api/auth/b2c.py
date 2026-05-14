"""
Azure AD B2C JWT validation.

Validates Bearer tokens issued by the configured B2C tenant and policy.
Uses PyJWT + JWKS fetching. JWKS is cached in-process.

Environment variables:
  B2C_TENANT_NAME     — e.g. "antheneagentic" (the B2C tenant subdomain)
  B2C_POLICY          — e.g. "B2C_1_signup_signin"
  B2C_CLIENT_ID       — App registration client ID (audience)
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx
import jwt
from jwt import PyJWKClient, PyJWKClientError

logger = logging.getLogger(__name__)

B2C_TENANT_NAME: str = os.getenv("B2C_TENANT_NAME", "")
B2C_POLICY: str = os.getenv("B2C_POLICY", "B2C_1_signup_signin")
B2C_CLIENT_ID: str = os.getenv("B2C_CLIENT_ID", "")

# In dev mode (no B2C configured) we allow a simple dev token
DEV_MODE: bool = not B2C_TENANT_NAME or not B2C_CLIENT_ID

JWT_SECRET: str = os.getenv("JWT_SECRET", "anthene-demo-secret-2025")


def _jwks_url() -> str:
    return (
        f"https://{B2C_TENANT_NAME}.b2clogin.com/"
        f"{B2C_TENANT_NAME}.onmicrosoft.com/"
        f"{B2C_POLICY}/discovery/v2.0/keys"
    )


_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None and not DEV_MODE:
        _jwks_client = PyJWKClient(_jwks_url(), cache_keys=True)
    return _jwks_client


def validate_token(token: str) -> dict:
    """
    Validate a B2C JWT and return its claims dict.
    In DEV_MODE (no B2C configured) accepts any well-formed JWT without
    signature verification and returns its payload — useful for local dev.
    """
    # Try local HS256 token first (issued by /api/auth/login)
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            if payload.get("iss") == "anthene-local":
                return payload
    except Exception:
        pass

    if DEV_MODE:
        logger.warning("DEV_MODE: skipping B2C JWT signature validation")
        # Accept special sentinel tokens for local / demo use
        if token in ("dev", "dev-token", "demo"):
            return {
                "oid": "dev-user-001",
                "sub": "dev-user-001",
                "emails": ["dev@anthene.local"],
                "name": "Dev User",
                "extension_Role": "admin",
            }
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            return payload
        except Exception as exc:
            raise ValueError(f"Invalid token format: {exc}")

    client = _get_jwks_client()
    try:
        signing_key = client.get_signing_key_from_jwt(token)
    except PyJWKClientError as exc:
        raise ValueError(f"JWKS error: {exc}")

    try:
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=B2C_CLIENT_ID,
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError:
        raise ValueError("Token expired")
    except jwt.InvalidTokenError as exc:
        raise ValueError(f"Invalid token: {exc}")

    return payload
