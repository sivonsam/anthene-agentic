"""
OpenSky Network — free ADS-B aircraft tracking.
No auth: 400 req/day limit, anonymous queries
With login: higher limits

https://opensky-network.org/api/states/all
"""

from __future__ import annotations

import os
import httpx

OPENSKY_BASE = "https://opensky-network.org/api"
OPENSKY_USER = os.getenv("OPENSKY_USER", "")
OPENSKY_PASS = os.getenv("OPENSKY_PASS", "")

FIELDS = [
    "icao24", "callsign", "origin_country", "time_position", "last_contact",
    "longitude", "latitude", "baro_altitude", "on_ground", "velocity",
    "true_track", "vertical_rate", "sensors", "geo_altitude", "squawk",
    "spi", "position_source",
]


def _classify(state: list) -> dict:
    s = dict(zip(FIELDS, state))
    return {
        "hex": s.get("icao24", ""),
        "callsign": (s.get("callsign") or "").strip() or None,
        "country": s.get("origin_country"),
        "lat": s.get("latitude"),
        "lon": s.get("longitude"),
        "altitude_m": s.get("baro_altitude"),
        "altitude_ft": round(s["baro_altitude"] * 3.28084) if s.get("baro_altitude") else None,
        "speed_ms": s.get("velocity"),
        "speed_kt": round(s["velocity"] * 1.94384) if s.get("velocity") else None,
        "heading_deg": s.get("true_track"),
        "vertical_rate_ms": s.get("vertical_rate"),
        "on_ground": s.get("on_ground"),
        "squawk": s.get("squawk"),
        "last_contact": s.get("last_contact"),
    }


async def opensky_area(lat: float, lon: float, radius_km: float = 100) -> dict:
    """Live aircraft from OpenSky Network (or airplanes.live fallback) within a radius around lat/lon."""
    import math
    dist_nm = int(radius_km / 1.852)
    delta_lat = radius_km / 111.0
    delta_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    lamin = lat - delta_lat
    lamax = lat + delta_lat
    lomin = lon - delta_lon
    lomax = lon + delta_lon

    # Try airplanes.live first — more reliable from Azure, same ADS-B Exchange format
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.airplanes.live/v2/point/{lat}/{lon}/{dist_nm}",
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                acs = data.get("ac", [])
                aircraft = []
                for ac in acs:
                    if ac.get("lat") is None or ac.get("lon") is None:
                        continue
                    aircraft.append({
                        "hex": ac.get("hex", ""),
                        "callsign": (ac.get("flight") or "").strip() or None,
                        "country": ac.get("r", "")[:2] if ac.get("r") else None,
                        "lat": ac.get("lat"),
                        "lon": ac.get("lon"),
                        "altitude_m": round(ac["alt_baro"] / 3.28084) if isinstance(ac.get("alt_baro"), (int, float)) else None,
                        "altitude_ft": ac.get("alt_baro") if isinstance(ac.get("alt_baro"), (int, float)) else None,
                        "speed_kt": ac.get("gs"),
                        "heading_deg": ac.get("track"),
                        "on_ground": ac.get("alt_baro") == "ground",
                        "squawk": ac.get("squawk"),
                        "last_contact": ac.get("seen"),
                    })
                airborne = [a for a in aircraft if not a["on_ground"]]
                on_ground = [a for a in aircraft if a["on_ground"]]
                return {
                    "total": len(aircraft),
                    "airborne": len(airborne),
                    "on_ground": len(on_ground),
                    "aircraft": aircraft[:100],
                    "query": {"lat": lat, "lon": lon, "radius_km": radius_km},
                    "source": "airplanes.live (free open ADS-B)",
                }
    except Exception:
        pass

    # Fall back to OpenSky Network
    params = {"lamin": lamin, "lamax": lamax, "lomin": lomin, "lomax": lomax}
    auth = (OPENSKY_USER, OPENSKY_PASS) if OPENSKY_USER else None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{OPENSKY_BASE}/states/all",
                params=params,
                auth=auth,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AntheneMonitor/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()

        states = data.get("states") or []
        aircraft = [_classify(s) for s in states if s[6] is not None and s[5] is not None]
        airborne = [a for a in aircraft if not a["on_ground"]]
        on_ground = [a for a in aircraft if a["on_ground"]]

        return {
            "total": len(aircraft),
            "airborne": len(airborne),
            "on_ground": len(on_ground),
            "aircraft": aircraft[:100],
            "query": {"lat": lat, "lon": lon, "radius_km": radius_km},
            "source": "OpenSky Network (free)",
            "timestamp": data.get("time"),
        }
    except Exception as exc:
        return {"error": str(exc), "aircraft": [], "total": 0}


async def opensky_aircraft(icao24: str) -> dict:
    """Get current state of a specific aircraft by ICAO24 hex address."""
    auth = (OPENSKY_USER, OPENSKY_PASS) if OPENSKY_USER else None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{OPENSKY_BASE}/states/all",
                params={"icao24": icao24.lower()},
                auth=auth,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AntheneMonitor/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()
        states = data.get("states") or []
        if not states:
            return {"error": f"Aircraft {icao24} not found or not tracked"}
        return _classify(states[0])
    except Exception as exc:
        return {"error": str(exc)}
