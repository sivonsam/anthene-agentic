"""File reading tool — reads uploaded files from local storage or Blob."""

from __future__ import annotations

import os
import base64
import httpx

BLOB_BASE = os.getenv("BLOB_STORAGE_URL", "")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/anthene-uploads")


async def file_read(file_id: str) -> dict:
    """Read content of a previously uploaded file by its ID."""
    # Local filesystem first (for dev/edge)
    local_path = os.path.join(UPLOAD_DIR, file_id)
    if os.path.exists(local_path):
        with open(local_path, "rb") as f:
            raw = f.read()
        text = raw.decode("utf-8", errors="replace")
        return {
            "file_id": file_id,
            "size_bytes": len(raw),
            "content": text[:10000],  # cap at 10k chars
            "truncated": len(text) > 10000,
            "source": "local",
        }

    # Azure Blob fallback
    if BLOB_BASE:
        url = f"{BLOB_BASE}/{file_id}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            raw = resp.content
        text = raw.decode("utf-8", errors="replace")
        return {
            "file_id": file_id,
            "size_bytes": len(raw),
            "content": text[:10000],
            "truncated": len(text) > 10000,
            "source": "blob",
        }

    return {"error": f"File '{file_id}' not found", "file_id": file_id}
