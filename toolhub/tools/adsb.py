"""ADS-B Exchange tools."""

from __future__ import annotations

import os
import httpx

ADSB_API_KEY = os.getenv("ADSB_API_KEY", "")
ADSB_BASE = "https://adsbexchange-com1.p.rapidapi.com/v2"
HEADERS = {
    "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
    "x-rapidapi-key": ADSB_API_KEY,
}

_CATEGORY_MAP = {
    "A1": "light", "A2": "small", "A3": "large", "A4": "high_vortex",
    "A5": "heavy", "A6": "high_performance", "A7": "rotorcraft",
    "B1": "glider", "B2": "balloon", "B4": "drone_uav",
    "B6": "ultralight", "C1": "surface_emergency", "C2": "surface_service",
}


def _classify(ac: dict) -> dict:
    category = ac.get("category", "")
    return {
        "hex": ac.get("hex", ""),
        "callsign": (ac.get("flight") or "").strip() or None,
        "registration": ac.get("r"),
        "type": ac.get("t"),
        "category": category,
        "category_label": _CATEGORY_MAP.get(category, "unknown"),
        "lat": ac.get("lat"),
        "lon": ac.get("lon"),
        "altitude_ft": ac.get("alt_baro"),
        "ground_speed_kt": ac.get("gs"),
        "track_deg": ac.get("track"),
        "squawk": ac.get("squawk"),
        "emergency": ac.get("emergency"),
        "military": bool(ac.get("dbFlags", 0) & 1),
        "interesting": bool(ac.get("dbFlags", 0) & 2),
    }


async def adsb_area(lat: float, lon: float, dist_nm: float = 50.0) -> dict:
    """Live aircraft within dist_nm nautical miles of lat/lon."""
    dist_nm = min(dist_nm, 250)
    url = f"{ADSB_BASE}/lat/{lat}/lon/{lon}/dist/{int(dist_nm)}/"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = client.get(url, headers=HEADERS) if not ADSB_API_KEY else \
               await client.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
    aircraft = [_classify(ac) for ac in data.get("ac", [])]
    military = [a for a in aircraft if a["military"]]
    drones = [a for a in aircraft if a["category"] == "B4"]
    return {
        "total": len(aircraft),
        "military_count": len(military),
        "drone_count": len(drones),
        "aircraft": aircraft[:100],  # cap at 100
        "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
    }


async def adsb_military() -> dict:
    """All tracked military aircraft globally."""
    url = f"{ADSB_BASE}/mil/"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
    aircraft = [_classify(ac) for ac in data.get("ac", [])]
    return {"total": len(aircraft), "aircraft": aircraft[:200]}
