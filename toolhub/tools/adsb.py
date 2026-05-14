"""ADS-B Exchange tools — falls back to OpenSky Network when API key is not set."""

from __future__ import annotations

import math
import os
import httpx

ADSB_API_KEY = os.getenv("ADSB_API_KEY", "")
ADSB_BASE = "https://adsbexchange-com1.p.rapidapi.com/v2"

_CATEGORY_MAP = {
    "A1": "light", "A2": "small", "A3": "large", "A4": "high_vortex",
    "A5": "heavy", "A6": "high_performance", "A7": "rotorcraft",
    "B1": "glider", "B2": "balloon", "B4": "drone_uav",
    "B6": "ultralight", "C1": "surface_emergency", "C2": "surface_service",
}


def _classify_adsb(ac: dict) -> dict:
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
        "source": "ADS-B Exchange",
    }


def _classify_opensky(state: list) -> dict:
    fields = [
        "icao24", "callsign", "origin_country", "time_position", "last_contact",
        "longitude", "latitude", "baro_altitude", "on_ground", "velocity",
        "true_track", "vertical_rate", "sensors", "geo_altitude", "squawk", "spi", "position_source",
    ]
    s = dict(zip(fields, state))
    return {
        "hex": s.get("icao24", ""),
        "callsign": (s.get("callsign") or "").strip() or None,
        "country": s.get("origin_country"),
        "lat": s.get("latitude"),
        "lon": s.get("longitude"),
        "altitude_ft": round(s["baro_altitude"] * 3.28084) if s.get("baro_altitude") else None,
        "ground_speed_kt": round(s["velocity"] * 1.94384) if s.get("velocity") else None,
        "track_deg": s.get("true_track"),
        "on_ground": s.get("on_ground"),
        "squawk": s.get("squawk"),
        "military": False,
        "source": "OpenSky Network (fallback)",
    }


async def _adsb_area_opensky(lat: float, lon: float, dist_nm: float) -> dict:
    """Fallback: use OpenSky Network when no ADS-B Exchange key is configured."""
    radius_km = dist_nm * 1.852
    delta_lat = radius_km / 111.0
    delta_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    params = {
        "lamin": lat - delta_lat, "lamax": lat + delta_lat,
        "lomin": lon - delta_lon, "lomax": lon + delta_lon,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get("https://opensky-network.org/api/states/all", params=params)
        resp.raise_for_status()
        data = resp.json()
    states = data.get("states") or []
    aircraft = [_classify_opensky(s) for s in states if s[5] is not None and s[6] is not None]
    military = [a for a in aircraft if a.get("military")]
    drones = []
    return {
        "total": len(aircraft),
        "military_count": len(military),
        "drone_count": len(drones),
        "aircraft": aircraft[:100],
        "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
        "note": "ADS-B Exchange API key not configured — using OpenSky Network (free, no military tagging)",
    }


async def adsb_area(lat: float, lon: float, dist_nm: float = 50.0) -> dict:
    """Live aircraft within dist_nm nautical miles of lat/lon."""
    dist_nm = min(dist_nm, 250)
    if not ADSB_API_KEY:
        return await _adsb_area_opensky(lat, lon, dist_nm)
    url = f"{ADSB_BASE}/lat/{lat}/lon/{lon}/dist/{int(dist_nm)}/"
    headers = {
        "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
        "x-rapidapi-key": ADSB_API_KEY,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    aircraft = [_classify_adsb(ac) for ac in data.get("ac", [])]
    military = [a for a in aircraft if a["military"]]
    drones = [a for a in aircraft if a["category"] == "B4"]
    return {
        "total": len(aircraft),
        "military_count": len(military),
        "drone_count": len(drones),
        "aircraft": aircraft[:100],
        "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
    }


async def adsb_military() -> dict:
    """All tracked military aircraft globally. Requires ADS-B Exchange API key."""
    if not ADSB_API_KEY:
        return {
            "error": "ADS-B Exchange API key (ADSB_API_KEY) not configured.",
            "suggestion": "Use adsb_area or opensky_area for aircraft tracking without an API key.",
            "aircraft": [], "total": 0,
        }
    url = f"{ADSB_BASE}/mil/"
    headers = {
        "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
        "x-rapidapi-key": ADSB_API_KEY,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    aircraft = [_classify_adsb(ac) for ac in data.get("ac", [])]
    return {"total": len(aircraft), "aircraft": aircraft[:200]}



async def aircraft_trail(hex_code: str) -> dict:
    """Recent flight trail (positions over time) for a specific aircraft by ICAO24 hex address.
    Returns list of {lat, lon, altitude_ft, ground_speed_kt, timestamp} points.
    Uses ADS-B Exchange /trail/ endpoint. Falls back to note if no key."""
    if not ADSB_API_KEY:
        return {"error": "ADS-B Exchange API key not configured.", "trail": [], "hex": hex_code}
    url = f"{ADSB_BASE}/trail/{hex_code}/"
    headers = {"x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com", "x-rapidapi-key": ADSB_API_KEY}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    trail = []
    for p in data.get("trail", []):
        trail.append({
            "lat": p.get("lat"), "lon": p.get("lon"),
            "altitude_ft": p.get("alt"),
            "ground_speed_kt": p.get("gs"),
            "timestamp": p.get("ts"),
        })
    ac = data.get("ac") or {}
    return {
        "hex": hex_code,
        "callsign": (ac.get("flight") or "").strip() or None,
        "registration": ac.get("r"),
        "type": ac.get("t"),
        "trail": trail,
        "trail_points": len(trail),
        "source": "ADS-B Exchange",
    }


async def aircraft_detail(hex_code: str) -> dict:
    """Current position and details for a specific aircraft by ICAO24 hex address.
    Uses ADS-B Exchange /hex/ endpoint."""
    if not ADSB_API_KEY:
        return {"error": "ADS-B Exchange API key not configured.", "hex": hex_code}
    url = f"{ADSB_BASE}/hex/{hex_code}/"
    headers = {"x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com", "x-rapidapi-key": ADSB_API_KEY}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    aircraft_list = data.get("ac", [])
    if not aircraft_list:
        return {"error": f"Aircraft {hex_code} not found or not currently tracked.", "hex": hex_code}
    return _classify_adsb(aircraft_list[0])
