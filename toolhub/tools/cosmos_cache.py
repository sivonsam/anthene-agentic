"""
Read cached flight/vessel data from Anthene Light's Cosmos DB.

Anthene Light polls OpenSky + ADS-B Exchange every 30-60s and caches
results in Cosmos DB. We read from this cache instead of calling external
APIs directly — which fail from Azure Container Apps (network restrictions).

Env vars required:
  LIGHT_COSMOS_URL  — https://anthene-cosmos-<id>.documents.azure.com:443/
  LIGHT_COSMOS_KEY  — primary master key
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import math
import os
import time
import urllib.parse

import httpx

COSMOS_URL = os.getenv(
    "LIGHT_COSMOS_URL",
    "https://anthene-cosmos-k73hhxyzyk6c4.documents.azure.com:443/",
)
COSMOS_DB = "anthene-db"

_SQUAWK_SPECIAL = {
    "7500": "HIJACK",
    "7600": "RADIO_FAILURE",
    "7700": "GENERAL_EMERGENCY",
    "7400": "UAV_LOST_LINK",
}


def _cosmos_key() -> str:
    return os.getenv("LIGHT_COSMOS_KEY", "")


def _auth_header(verb: str, resource_type: str, resource_id: str, date: str) -> str:
    key_bytes = base64.b64decode(_cosmos_key())
    string_to_sign = (
        f"{verb.lower()}\n{resource_type.lower()}\n{resource_id}\n{date.lower()}\n\n"
    )
    sig = base64.b64encode(
        hmac.new(key_bytes, string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    ).decode()
    return urllib.parse.quote(f"type=master&ver=1.0&sig={sig}")


def _now_rfc1123() -> str:
    return time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())


async def _read_item(
    client: httpx.AsyncClient, container: str, doc_id: str
) -> dict | None:
    """Read a single document from Cosmos DB by id (partition key = /id)."""
    resource_id = f"dbs/{COSMOS_DB}/colls/{container}/docs/{doc_id}"
    date = _now_rfc1123()
    auth = _auth_header("GET", "docs", resource_id, date)
    base = COSMOS_URL.rstrip("/")
    resp = await client.get(
        f"{base}/{resource_id}",
        headers={
            "Authorization": auth,
            "x-ms-date": date,
            "x-ms-version": "2018-12-31",
            "x-ms-documentdb-partitionkey": f'["{doc_id}"]',
        },
        timeout=10,
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3440.065  # nautical miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalize_opensky(f: dict) -> dict:
    """Normalize OpenSky cached record to standard output dict."""
    alt_m = f.get("baroAltitude")
    vel_ms = f.get("velocity")
    vr_ms = f.get("verticalRate")
    squawk = f.get("squawk") or ""
    return {
        "hex": f.get("icao24", ""),
        "callsign": f.get("callsign"),
        "country": f.get("originCountry"),
        "lat": f.get("latitude"),
        "lon": f.get("longitude"),
        "altitude_ft": round(alt_m * 3.28084) if alt_m is not None else None,
        "ground_speed_kt": round(vel_ms * 1.94384) if vel_ms is not None else None,
        "track_deg": f.get("heading"),
        "vertical_rate_fpm": round(vr_ms * 196.85) if vr_ms is not None else None,
        "on_ground": f.get("onGround"),
        "squawk": squawk,
        "squawk_alert": _SQUAWK_SPECIAL.get(squawk),
        "military": False,
        "event_time": f.get("eventTime"),
        "source": "OpenSky (cached)",
    }


def _normalize_adsbexchange(f: dict) -> dict:
    """Normalize ADS-B Exchange cached record (units: ft, kt, fpm)."""
    squawk = f.get("squawk") or ""
    alt_raw = f.get("baroAltitude")
    # ADS-B Exchange stores altitude in feet; may be "ground" string
    alt_ft = None
    if isinstance(alt_raw, (int, float)):
        alt_ft = int(alt_raw)
    gs = f.get("groundSpeed")
    vr = f.get("verticalRate")
    return {
        "hex": f.get("icao24", ""),
        "callsign": f.get("callsign"),
        "registration": f.get("registration"),
        "type": f.get("aircraftType"),
        "description": f.get("description"),
        "lat": f.get("latitude"),
        "lon": f.get("longitude"),
        "altitude_ft": alt_ft,
        "ground_speed_kt": int(gs) if gs is not None else None,
        "track_deg": f.get("heading"),
        "vertical_rate_fpm": int(vr) if vr is not None else None,
        "on_ground": f.get("onGround"),
        "squawk": squawk,
        "squawk_alert": _SQUAWK_SPECIAL.get(squawk),
        "emergency": f.get("emergency") if f.get("emergency") not in (None, "none") else None,
        "military": False,
        "mlat": f.get("mlat"),
        "event_time": f.get("eventTime"),
        "source": "ADS-B Exchange (cached)",
    }


async def get_flights_in_area(lat: float, lon: float, dist_nm: float) -> dict:
    """
    Read cached flights from Anthene Light's Cosmos DB and filter by distance.
    Returns same dict shape as adsb_area.
    """
    if not _cosmos_key():
        return {
            "error": "LIGHT_COSMOS_KEY not configured — cannot read flight cache",
            "aircraft": [],
            "total": 0,
        }

    raw_flights: list[dict] = []
    sources_used: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for doc_id in ("opensky", "adsbexchange"):
                doc = await _read_item(client, "live-flights", doc_id)
                if doc:
                    raw_flights.extend(doc.get("flights", []))
                    sources_used.append(doc_id)
                    updated_at = doc.get("updatedAt")
    except Exception as exc:
        return {
            "error": f"Cosmos DB read error: {exc}",
            "aircraft": [],
            "total": 0,
        }

    if not raw_flights:
        return {
            "total": 0,
            "aircraft": [],
            "note": "Ei lennokkaita välimuistissa. Anthene Light poller saattaa olla pois.",
            "sources": sources_used,
        }

    # Deduplicate by icao24 — adsbexchange wins (richer metadata)
    seen: dict[str, dict] = {}
    for f in raw_flights:
        key = (f.get("icao24") or f.get("callsign") or "").lower()
        if key:
            seen[key] = f

    # Normalize and filter by distance
    in_range: list[dict] = []
    for f in seen.values():
        flat = f.get("latitude")
        flon = f.get("longitude")
        if flat is None or flon is None:
            continue
        if _haversine_nm(lat, lon, flat, flon) > dist_nm:
            continue
        src = f.get("source", "")
        in_range.append(
            _normalize_adsbexchange(f) if src == "adsbexchange" else _normalize_opensky(f)
        )

    squawk_alerts = [a for a in in_range if a.get("squawk_alert")]
    military = [a for a in in_range if a.get("military")]
    emergencies = [a for a in in_range if a.get("emergency")]

    return {
        "total": len(in_range),
        "military_count": len(military),
        "drone_count": 0,
        "emergency_count": len(emergencies),
        "squawk_alert_count": len(squawk_alerts),
        "aircraft": in_range[:150],
        "query": {"lat": lat, "lon": lon, "dist_nm": dist_nm},
        "sources": sources_used,
        "source": "Anthene Light cache (Cosmos DB)",
        "note": "Tiedot välimuistista. Päivittyy 30–60 sekunnin välein.",
    }


async def get_vessels_cached() -> dict:
    """
    Read cached AIS vessels from Anthene Light's Cosmos DB snapshot.
    Returns list of vessel records.
    """
    if not _cosmos_key():
        return {
            "error": "LIGHT_COSMOS_KEY not configured — cannot read vessel cache",
            "vessels": [],
            "total": 0,
        }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            doc = await _read_item(client, "live-vessels", "snapshot")
    except Exception as exc:
        return {"error": f"Cosmos DB read error: {exc}", "vessels": [], "total": 0}

    if not doc:
        return {"vessels": [], "total": 0, "note": "Ei alusdata välimuistissa."}

    return {
        "vessels": doc.get("vessels", []),
        "total": doc.get("count", len(doc.get("vessels", []))),
        "updated_at": doc.get("updatedAt"),
        "source": "Anthene Light cache (Cosmos DB)",
    }
