"""Fingrid open data — Finnish electricity grid.

API: https://data.fingrid.fi/api/
Requires free API key from data.fingrid.fi
"""

from __future__ import annotations

import os
import httpx

FINGRID_KEY = os.getenv("FINGRID_API_KEY", "")
FINGRID_BASE = "https://data.fingrid.fi/api"

# Key dataset IDs
DATASETS = {
    "consumption_realtime": 193,        # Electricity consumption in Finland
    "production_realtime": 192,         # Electricity production in Finland
    "wind_production": 181,             # Wind power production
    "nuclear_production": 188,          # Nuclear power production
    "hydro_production": 191,            # Hydro power production
    "frequency": 177,                   # Grid frequency (Hz)
    "cross_border_total": 198,          # Cross-border transmission total
    "balancing_capacity": 285,          # Balancing power capacity
}


async def _get_latest(dataset_id: int) -> dict | None:
    if not FINGRID_KEY:
        return None
    url = f"{FINGRID_BASE}/datasets/{dataset_id}/data"
    params = {"pageSize": 1, "sortOrder": "desc"}
    try:
        async with httpx.AsyncClient(timeout=10, headers={"x-api-key": FINGRID_KEY}) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        items = data.get("data", [])
        return items[0] if items else None
    except Exception:
        return None


async def fingrid_grid_status() -> dict:
    """Get current Finnish electricity grid status: consumption, production, frequency."""
    if not FINGRID_KEY:
        return {
            "error": "FINGRID_API_KEY not configured. Get a free key at data.fingrid.fi",
            "datasets_available": list(DATASETS.keys()),
        }

    results = {}
    import asyncio

    async def fetch(name, ds_id):
        val = await _get_latest(ds_id)
        if val:
            results[name] = {"value": val.get("value"), "unit": "MW" if name != "frequency" else "Hz", "time": val.get("startTime")}

    await asyncio.gather(*[fetch(name, ds_id) for name, ds_id in DATASETS.items()])

    return {
        "source": "Fingrid open data",
        "grid_status": results,
        "note": "Values in MW (megawatts), frequency in Hz",
    }


async def fingrid_disturbances(hours_back: int = 24) -> dict:
    """Get recent electricity grid disturbance events."""
    if not FINGRID_KEY:
        return {"error": "FINGRID_API_KEY not configured"}

    from datetime import datetime, timezone, timedelta
    start = (datetime.now(timezone.utc) - timedelta(hours=hours_back)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Dataset 291: disturbance events
    url = f"{FINGRID_BASE}/datasets/291/data"
    params = {"startTime": start, "endTime": end, "pageSize": 50}
    try:
        async with httpx.AsyncClient(timeout=10, headers={"x-api-key": FINGRID_KEY}) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        events = data.get("data", [])
        return {
            "hours_back": hours_back,
            "disturbance_count": len(events),
            "events": events[:20],
            "source": "Fingrid",
        }
    except Exception as exc:
        return {"error": str(exc)}
