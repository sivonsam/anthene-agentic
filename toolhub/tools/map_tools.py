"""Map / geocoding tools using Azure Maps."""

from __future__ import annotations

import os
import httpx

AZURE_MAPS_KEY = os.getenv("AZURE_MAPS_KEY", "")
MAPS_BASE = "https://atlas.microsoft.com"


async def map_geocode(query: str) -> dict:
    """Convert place name or address to coordinates via Azure Maps."""
    if not AZURE_MAPS_KEY:
        # Fallback: Nominatim (OpenStreetMap, free, no key)
        url = "https://nominatim.openstreetmap.org/search"
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "anthene-agentic/1.0"}) as client:
            resp = await client.get(url, params={"q": query, "format": "json", "limit": 3})
            resp.raise_for_status()
            results = resp.json()
        if not results:
            return {"error": "No results found", "query": query}
        top = results[0]
        return {
            "query": query,
            "lat": float(top["lat"]),
            "lon": float(top["lon"]),
            "display_name": top.get("display_name"),
            "source": "nominatim",
        }

    url = f"{MAPS_BASE}/geocode"
    params = {"api-version": "2023-06-01", "query": query, "subscription-key": AZURE_MAPS_KEY}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        return {"error": "No results found", "query": query}
    top = features[0]
    coords = top.get("geometry", {}).get("coordinates", [None, None])
    return {
        "query": query,
        "lat": coords[1],
        "lon": coords[0],
        "display_name": top.get("properties", {}).get("address", {}).get("formattedAddress"),
        "source": "azure_maps",
    }
