"""FIRMS — NASA Fire Information for Resource Management System.
Active fires globally. No API key required for basic access.
https://firms.modaps.eosdis.nasa.gov/api/
"""

from __future__ import annotations

import httpx
import os

FIRMS_KEY = os.getenv("FIRMS_MAP_KEY", "")  # Free key from NASA FIRMS
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api"

SOURCES = ["VIIRS_SNPP_NRT", "MODIS_NRT", "VIIRS_NOAA20_NRT"]


async def firms_fires(
    lat: float | None = None,
    lon: float | None = None,
    area_km: float = 500,
    days: int = 1,
    country_iso: str | None = None,
) -> dict:
    """
    Get active fire detections from NASA FIRMS.
    If lat/lon provided: area query around that point.
    If country_iso provided (e.g. 'FIN'): country-level query.
    Default: global last 24h sample.
    days: 1-10
    """
    days = min(max(days, 1), 10)

    if not FIRMS_KEY:
        return {
            "error": "FIRMS_MAP_KEY not set. Get free key at https://firms.modaps.eosdis.nasa.gov/api/",
            "note": "EFFIS (already integrated) is an alternative for European fires.",
            "firms_url": "https://firms.modaps.eosdis.nasa.gov/",
        }

    results = []
    source = SOURCES[0]  # VIIRS SNPP NRT — best coverage

    try:
        if lat is not None and lon is not None:
            # Area query: bbox from center
            delta = area_km / 111.0
            bbox = f"{lon-delta},{lat-delta},{lon+delta},{lat+delta}"
            url = f"{FIRMS_BASE}/area/json/{FIRMS_KEY}/{source}/{bbox}/{days}"
        elif country_iso:
            url = f"{FIRMS_BASE}/country/json/{FIRMS_KEY}/{source}/{country_iso}/{days}"
        else:
            # World sample — last day
            url = f"{FIRMS_BASE}/area/json/{FIRMS_KEY}/{source}/-180,-90,180,90/{days}"

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        fires = data if isinstance(data, list) else []
        high_confidence = [f for f in fires if f.get("confidence", "").lower() in ("high", "h", "nominal")]

        return {
            "total_detections": len(fires),
            "high_confidence": len(high_confidence),
            "fires": fires[:100],
            "source": f"NASA FIRMS / {source}",
            "days": days,
            "query": {"lat": lat, "lon": lon, "area_km": area_km, "country": country_iso},
        }
    except Exception as exc:
        return {"error": str(exc), "fires": [], "total_detections": 0}
