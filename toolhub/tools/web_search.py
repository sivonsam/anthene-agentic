"""Web search tool using Bing Search API."""

from __future__ import annotations

import os
import httpx

BING_KEY = os.getenv("BING_SEARCH_KEY", "")
BING_ENDPOINT = "https://api.bing.microsoft.com/v7.0/search"


async def web_search(query: str, count: int = 5) -> dict:
    """Search the web with Bing. Falls back to DuckDuckGo if no key."""
    count = min(max(count, 1), 10)

    if not BING_KEY:
        # DuckDuckGo instant answer fallback (no API key needed)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_redirect": "1"},
            )
            resp.raise_for_status()
            data = resp.json()
        results = [
            {"title": r.get("Text", ""), "snippet": r.get("Text", ""), "url": r.get("FirstURL", "")}
            for r in data.get("RelatedTopics", [])[:count]
            if r.get("FirstURL")
        ]
        return {"query": query, "results": results, "source": "duckduckgo"}

    headers = {"Ocp-Apim-Subscription-Key": BING_KEY}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(BING_ENDPOINT, headers=headers, params={"q": query, "count": count})
        resp.raise_for_status()
        data = resp.json()

    results = [
        {"title": r.get("name", ""), "snippet": r.get("snippet", ""), "url": r.get("url", "")}
        for r in data.get("webPages", {}).get("value", [])
    ]
    return {"query": query, "results": results, "source": "bing"}
