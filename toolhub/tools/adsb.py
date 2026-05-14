"""ADS-B Exchange tools — direct enterprise v2 API + Cosmos cache + airplanes.live fallback.

Direct API base: https://adsbexchange.com/api/aircraft/v2/
Auth header: api-auth: <key>
Endpoint corrections vs RapidAPI version:
  reg/{r}/      → registration/{r}/
  hex/{h}/      → icao/{h}/
  type/{t}/     → NOT available in European Coverage trial
  trail/{h}/    → NOT available in European Coverage trial
"""

from __future__ import annotations

import math
import os
import httpx

from tools.cosmos_cache import get_flights_in_area as _cosmos_flights

ADSB_API_KEY = os.getenv("ADSB_API_KEY", "")
# Direct API — European Coverage trial (May 11 – June 8 2026)
ADSB_BASE = "https://adsbexchange.com/api/aircraft/v2"

_CATEGORY_MAP = {
    "A1": "light", "A2": "small", "A3": "large", "A4": "high_vortex",
    "A5": "heavy", "A6": "high_performance", "A7": "rotorcraft",
    "B1": "glider", "B2": "balloon", "B4": "drone_uav",
    "B6": "ultralight", "C1": "surface_emergency", "C2": "surface_service",
}

_EMERGENCY_MAP = {
    "none": None, "general": "general_emergency",
    "lifeguard": "medical_lifeguard", "minfuel": "minimum_fuel",
    "nordo": "radio_failure", "unlawful": "hijack",
    "downed": "downed_aircraft",
}

_SQUAWK_SPECIAL = {
    "7500": "HIJACK", "7600": "RADIO_FAILURE", "7700": "GENERAL_EMERGENCY",
    "7400": "UAV_LOST_LINK", "2000": "VFR_TRANSPONDER",
}


def _get_headers() -> dict:
    """Direct ADS-B Exchange API uses api-auth header."""
    key = os.getenv("ADSB_API_KEY", ADSB_API_KEY)
    return {"api-auth": key, "Accept": "application/json"}


def _classify_adsb(ac: dict) -> dict:
    category = ac.get("category", "")
    squawk = ac.get("squawk") or ""
    emerg_raw = ac.get("emergency", "none") or "none"
    db_flags = ac.get("dbFlags", 0) or 0
    return {
        "hex": ac.get("hex", ""),
        "callsign": (ac.get("flight") or "").strip() or None,
        "registration": ac.get("r"),
        "type": ac.get("t"),
        "type_description": ac.get("desc"),
        "operator": ac.get("ownOp"),
        "year": ac.get("year"),
        "category": category,
        "category_label": _CATEGORY_MAP.get(category, "unknown"),
        "lat": ac.get("lat"),
        "lon": ac.get("lon"),
        "altitude_ft": ac.get("alt_baro"),
        "altitude_geom_ft": ac.get("alt_geom"),
        "ground_speed_kt": ac.get("gs"),
        "true_airspeed_kt": ac.get("tas"),
        "indicated_airspeed_kt": ac.get("ias"),
        "mach": ac.get("mach"),
        "track_deg": ac.get("track"),
        "heading_mag": ac.get("mag_heading"),
        "vertical_rate_fpm": ac.get("baro_rate"),
        "geom_rate_fpm": ac.get("geom_rate"),
        "squawk": squawk,
        "squawk_alert": _SQUAWK_SPECIAL.get(squawk),
        "emergency": _EMERGENCY_MAP.get(emerg_raw, emerg_raw) if emerg_raw != "none" else None,
        "nav_altitude_ft": ac.get("nav_altitude_mcp"),
        "nav_heading": ac.get("nav_heading"),
        "nav_modes": ac.get("nav_modes"),
        "nic": ac.get("nic"),
        "nac_p": ac.get("nac_p"),
        "nac_v": ac.get("nac_v"),
        "sil": ac.get("sil"),
        "gva": ac.get("gva"),
        "seen_sec": ac.get("seen"),
        "rssi": ac.get("rssi"),
        "messages": ac.get("messages"),
        "on_ground": ac.get("alt_baro") == "ground",
        "military": bool(db_flags & 1),
        "interesting": bool(db_flags & 2),
        "pia": bool(db_flags & 8),   # privacy ICAO address
        "ladd": bool(db_flags & 16), # LADD (blocked from public)
        "source": "ADS-B Exchange",
    }


def _classify_opensky(state: list) -> dict:
    fields = [
        "icao24", "callsign", "origin_country", "time_position", "last_contact",
        "longitude", "latitude", "baro_altitude", "on_ground", "velocity",
        "true_track", "vertical_rate", "sensors", "geo_altitude", "squawk", "spi", "position_source",
    ]
    s = dict(zip(fields, state))
    squawk = s.get("squawk") or ""
    return {
        "hex": s.get("icao24", ""),
        "callsign": (s.get("callsign") or "").strip() or None,
        "country": s.get("origin_country"),
        "lat": s.get("latitude"),
        "lon": s.get("longitude"),
        "altitude_ft": round(s["baro_altitude"] * 3.28084) if s.get("baro_altitude") else None,
        "ground_speed_kt": round(s["velocity"] * 1.94384) if s.get("velocity") else None,
        "track_deg": s.get("true_track"),
        "vertical_rate_fpm": round(s["vertical_rate"] * 196.85) if s.get("vertical_rate") else None,
        "on_ground": s.get("on_ground"),
        "squawk": squawk,
        "squawk_alert": _SQUAWK_SPECIAL.get(squawk),
        "military": False,
        "source": "OpenSky Network (fallback)",
    }


def _require_key() -> dict | None:
    if not os.getenv("ADSB_API_KEY", ADSB_API_KEY):
        return {
            "error": "ADS-B Exchange API key (ADSB_API_KEY) not configured.",
            "aircraft": [], "total": 0,
        }
    return None


async def _adsb_area_free(lat: float, lon: float, dist_nm: float) -> dict:
    """Fallback: use airplanes.live (primary) then OpenSky (secondary) for free ADS-B data."""
    dist_nm_int = int(min(dist_nm, 250))

    # 1. Try airplanes.live — same JSON format as ADS-B Exchange, works from Azure
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.airplanes.live/v2/point/{lat}/{lon}/{dist_nm_int}",
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                aircraft = [_classify_adsb(ac) for ac in data.get("ac", []) if ac.get("lat") and ac.get("lon")]
                military = [a for a in aircraft if a["military"]]
                squawk_alerts = [a for a in aircraft if a.get("squawk_alert")]
                return {
                    "total": len(aircraft),
                    "military_count": len(military),
                    "drone_count": 0,
                    "squawk_alert_count": len(squawk_alerts),
                    "aircraft": aircraft[:150],
                    "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
                    "note": "Using airplanes.live (free open ADS-B — ADS-B Exchange plan does not include lat/lon endpoint)",
                    "source": "airplanes.live",
                }
    except Exception:
        pass

    # 2. Try OpenSky Network — may be rate-limited from Azure IPs
    radius_km = dist_nm * 1.852
    delta_lat = radius_km / 111.0
    delta_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    params = {
        "lamin": lat - delta_lat, "lamax": lat + delta_lat,
        "lomin": lon - delta_lon, "lomax": lon + delta_lon,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://opensky-network.org/api/states/all",
                params=params,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AntheneMonitor/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()
        states = data.get("states") or []
        aircraft = [_classify_opensky(s) for s in states if s[5] is not None and s[6] is not None]
        squawk_alerts = [a for a in aircraft if a.get("squawk_alert")]
        return {
            "total": len(aircraft),
            "military_count": 0,
            "drone_count": 0,
            "squawk_alert_count": len(squawk_alerts),
            "aircraft": aircraft[:100],
            "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
            "note": "Using OpenSky Network (free fallback — no military/operator tagging)",
            "source": "OpenSky Network",
        }
    except Exception as e:
        return {
            "total": 0, "military_count": 0, "drone_count": 0, "aircraft": [],
            "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
            "note": f"Kaikki vapaat ADS-B-lähteet epäonnistuivat ({type(e).__name__}).",
            "error": True,
        }


# Keep old name as alias for backward compatibility
_adsb_area_opensky = _adsb_area_free


# ─── Public tool functions ────────────────────────────────────────────────────

async def adsb_area(lat: float, lon: float, dist_nm: float = 50.0) -> dict:
    """Live aircraft within dist_nm nautical miles of lat/lon. Includes military,
    drone, emergency, squawk alerts, operator, aircraft type description."""
    dist_nm = min(dist_nm, 250)

    # Primary: ADS-B Exchange direct API (enterprise trial, European coverage)
    if os.getenv("ADSB_API_KEY", ADSB_API_KEY):
        url = f"{ADSB_BASE}/lat/{lat}/lon/{lon}/dist/{int(dist_nm)}/"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=_get_headers())
                if resp.status_code == 200:
                    data = resp.json()
                    ac_list = data.get("ac") or []
                    if ac_list is not None:  # empty list is OK — no aircraft in range
                        aircraft = [_classify_adsb(ac) for ac in ac_list]
                        military = [a for a in aircraft if a["military"]]
                        drones = [a for a in aircraft if a["category"] == "B4"]
                        emergencies = [a for a in aircraft if a.get("emergency")]
                        squawk_alerts = [a for a in aircraft if a.get("squawk_alert")]
                        return {
                            "total": len(aircraft),
                            "military_count": len(military),
                            "drone_count": len(drones),
                            "emergency_count": len(emergencies),
                            "squawk_alert_count": len(squawk_alerts),
                            "aircraft": aircraft[:150],
                            "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
                            "source": "ADS-B Exchange (direct API)",
                        }
        except Exception:
            pass

    # Fallback 1: Anthene Light Cosmos DB cache
    cosmos_result = await _cosmos_flights(lat, lon, dist_nm)
    if not cosmos_result.get("error"):
        return cosmos_result

    # Fallback 2: airplanes.live / OpenSky
    return await _adsb_area_opensky(lat, lon, dist_nm)


async def adsb_military() -> dict:
    """All currently tracked military aircraft globally."""
    err = _require_key()
    if err:
        return err
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(f"{ADSB_BASE}/mil/", headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    aircraft = [_classify_adsb(ac) for ac in data.get("ac", [])]
    return {
        "total": len(aircraft),
        "aircraft": aircraft[:300],
        "source": "ADS-B Exchange",
    }


async def adsb_emergency() -> dict:
    """All aircraft currently squawking emergency codes (7700, 7600, 7500)
    or with declared emergency status. Use for real-time incident awareness."""
    err = _require_key()
    if err:
        return err
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{ADSB_BASE}/sqk/7700/", headers=_get_headers())
        r2 = await client.get(f"{ADSB_BASE}/sqk/7600/", headers=_get_headers())
        r3 = await client.get(f"{ADSB_BASE}/sqk/7500/", headers=_get_headers())
    for r in [resp, r2, r3]:
        if r.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {r.status_code}: {r.text[:100]}", "aircraft": [], "total": 0}
    all_ac = (
        resp.json().get("ac", []) +
        r2.json().get("ac", []) +
        r3.json().get("ac", [])
    )
    seen = set()
    unique = []
    for ac in all_ac:
        h = ac.get("hex", "")
        if h not in seen:
            seen.add(h)
            unique.append(_classify_adsb(ac))
    return {
        "total": len(unique),
        "aircraft": unique,
        "codes_checked": ["7700 (emergency)", "7600 (radio failure)", "7500 (hijack)"],
        "source": "ADS-B Exchange",
    }


async def adsb_by_registration(registration: str) -> dict:
    """Find aircraft by tail number / registration (e.g. OH-LVL, N12345).
    Returns current position and details."""
    err = _require_key()
    if err:
        return err
    reg = registration.upper().replace("-", "").replace(" ", "")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{ADSB_BASE}/registration/{reg}/", headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    aircraft_list = data.get("ac", [])
    if not aircraft_list:
        return {"error": f"Aircraft with registration '{registration}' not found or not currently tracked.", "registration": registration}
    return {
        "total": len(aircraft_list),
        "aircraft": [_classify_adsb(ac) for ac in aircraft_list],
        "source": "ADS-B Exchange",
    }


async def adsb_by_callsign(callsign: str) -> dict:
    """Find aircraft by flight callsign (e.g. FIN123, BAW456).
    Returns current position and details for matching flights."""
    err = _require_key()
    if err:
        return err
    cs = callsign.upper().strip()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{ADSB_BASE}/callsign/{cs}/", headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    aircraft_list = data.get("ac", [])
    if not aircraft_list:
        return {"error": f"No aircraft found with callsign '{callsign}'.", "callsign": callsign}
    return {
        "total": len(aircraft_list),
        "aircraft": [_classify_adsb(ac) for ac in aircraft_list],
        "source": "ADS-B Exchange",
    }


async def adsb_by_squawk(squawk: str) -> dict:
    """Find all aircraft squawking a specific transponder code (e.g. 7700, 7500, 7600).
    Special codes: 7700=emergency, 7600=radio failure, 7500=hijack."""
    err = _require_key()
    if err:
        return err
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{ADSB_BASE}/sqk/{squawk}/", headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    aircraft_list = data.get("ac", [])
    return {
        "squawk": squawk,
        "squawk_meaning": _SQUAWK_SPECIAL.get(squawk, "custom/assigned"),
        "total": len(aircraft_list),
        "aircraft": [_classify_adsb(ac) for ac in aircraft_list],
        "source": "ADS-B Exchange",
    }


async def adsb_by_type(icao_type: str) -> dict:
    """Find all currently airborne aircraft of a specific ICAO type code
    (e.g. B738 = Boeing 737-800, A320 = Airbus A320, C172 = Cessna 172,
    F16 = F-16, UH60 = Black Hawk). Useful for fleet monitoring."""
    err = _require_key()
    if err:
        return err
    t = icao_type.upper().strip()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{ADSB_BASE}/type/{t}/", headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    aircraft_list = data.get("ac", [])
    return {
        "icao_type": t,
        "total": len(aircraft_list),
        "aircraft": [_classify_adsb(ac) for ac in aircraft_list[:200]],
        "source": "ADS-B Exchange",
    }


async def aircraft_trail(hex_code: str) -> dict:
    """Recent flight trail (positions over time) for a specific aircraft
    by ICAO24 hex address. Returns timestamped lat/lon/altitude/speed points."""
    err = _require_key()
    if err:
        return {**err, "hex": hex_code, "trail": []}
    url = f"{ADSB_BASE}/trail/{hex_code}/"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    trail = []
    for p in data.get("trail", []):
        trail.append({
            "lat": p.get("lat"),
            "lon": p.get("lon"),
            "altitude_ft": p.get("alt"),
            "ground_speed_kt": p.get("gs"),
            "track_deg": p.get("trk"),
            "timestamp": p.get("ts"),
        })
    ac = (data.get("ac") or [{}])[0] if isinstance(data.get("ac"), list) else (data.get("ac") or {})
    return {
        "hex": hex_code,
        "callsign": (ac.get("flight") or "").strip() or None,
        "registration": ac.get("r"),
        "type": ac.get("t"),
        "operator": ac.get("ownOp"),
        "trail": trail,
        "trail_points": len(trail),
        "source": "ADS-B Exchange",
    }


async def aircraft_detail(hex_code: str) -> dict:
    """Current position and full details for a specific aircraft
    by ICAO24 hex address. Includes operator, type, nav state, signal quality."""
    err = _require_key()
    if err:
        return {**err, "hex": hex_code}
    url = f"{ADSB_BASE}/icao/{hex_code}/"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_get_headers())
        if resp.status_code != 200:
            return {"error": f"ADS-B Exchange virhe {resp.status_code}: {resp.text[:100]}", "aircraft": [], "total": 0}
        if resp.json().get("message") and not resp.json().get("ac") and not resp.json().get("trail"):
            msg = resp.json()["message"]
            return {"error": f"ADS-B Exchange: {msg}", "aircraft": [], "total": 0}
        resp.raise_for_status()
        data = resp.json()
    aircraft_list = data.get("ac", [])
    if not aircraft_list:
        return {"error": f"Aircraft {hex_code} not found or not currently tracked.", "hex": hex_code}
    return _classify_adsb(aircraft_list[0])
