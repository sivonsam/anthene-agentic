"""
AIS Vessel Tools — Digitraffic Maritime API
Source: https://meri.digitraffic.fi/api/ais/v1/
License: CC BY 4.0 (Traffic Management Finland / Väylävirasto)
Coverage: Baltic Sea, Gulf of Finland, Finnish coastal waters
Update interval: ~60 seconds
"""

from __future__ import annotations

import math
import httpx

DIGITRAFFIC_BASE = "https://meri.digitraffic.fi/api/ais/v1"

NAV_STATUS = {
    0: "Under way (engine)",
    1: "At anchor",
    2: "Not under command",
    3: "Restricted manoeuvrability",
    5: "Moored",
    6: "Aground",
    7: "Engaged in fishing",
    8: "Under way (sailing)",
    15: "Not defined",
}

VESSEL_TYPES = {
    range(20, 30): "Wing in ground",
    range(30, 40): "Fishing",
    range(40, 50): "Towing",
    range(60, 70): "Passenger",
    range(70, 80): "Cargo",
    range(80, 90): "Tanker",
    range(90, 100): "Other",
}


def _nav_status_label(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return NAV_STATUS.get(code, f"Status {code}")


def _vessel_type_label(type_code: int | None) -> str:
    if type_code is None:
        return "Unknown"
    for r, label in VESSEL_TYPES.items():
        if type_code in r:
            return label
    return f"Type {type_code}"


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in nautical miles."""
    R = 3440.065  # Earth radius in nm
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _fmt_vessel(props: dict, lon: float, lat: float) -> dict:
    sog = props.get("sog")
    cog = props.get("cog")
    heading = props.get("heading")
    nav_stat = props.get("navStat")
    return {
        "mmsi": props.get("mmsi"),
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "sog_knots": round(sog, 1) if sog is not None else None,
        "cog_deg": round(cog, 0) if cog is not None else None,
        "heading_deg": heading,
        "nav_status": _nav_status_label(nav_stat),
        "nav_status_code": nav_stat,
        "timestamp": props.get("timestamp"),
        "source": "digitraffic-ais",
    }


async def vessels_area(
    lat: float,
    lon: float,
    radius_nm: float = 30.0,
    min_speed_knots: float | None = None,
    max_speed_knots: float | None = None,
    nav_status: str | None = None,
) -> dict:
    """
    Live AIS vessel positions within a radius from a point.
    Calls Digitraffic Maritime API (CC BY 4.0, Traffic Management Finland).
    Covers Baltic Sea and Finnish coastal waters. Updates every ~60 seconds.

    Args:
        lat: Center latitude
        lon: Center longitude
        radius_nm: Search radius in nautical miles (default 30)
        min_speed_knots: Optional minimum speed filter
        max_speed_knots: Optional maximum speed filter
        nav_status: Optional navigation status filter, e.g. "Under way (engine)"
    """
    # Convert radius to bbox for initial server-side filter (approx 1 nm ≈ 0.01667°)
    deg_per_nm = 1 / 60.0
    lat_margin = radius_nm * deg_per_nm
    lon_margin = radius_nm * deg_per_nm / max(math.cos(math.radians(lat)), 0.01)

    params = {
        "laMin": round(lat - lat_margin, 4),
        "laMax": round(lat + lat_margin, 4),
        "loMin": round(lon - lon_margin, 4),
        "loMax": round(lon + lon_margin, 4),
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{DIGITRAFFIC_BASE}/locations",
            params=params,
            headers={"Accept-Encoding": "gzip"},
        )
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features") or []
    vessels = []

    for f in features:
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [None, None])
        flon, flat = coords[0], coords[1]
        if flon is None or flat is None:
            continue

        dist = _haversine_nm(lat, lon, flat, flon)
        if dist > radius_nm:
            continue

        v = _fmt_vessel(props, flon, flat)
        v["distance_nm"] = round(dist, 2)

        sog = v["sog_knots"]
        if min_speed_knots is not None and (sog is None or sog < min_speed_knots):
            continue
        if max_speed_knots is not None and (sog is not None and sog > max_speed_knots):
            continue
        if nav_status and nav_status.lower() not in (v["nav_status"] or "").lower():
            continue

        vessels.append(v)

    vessels.sort(key=lambda x: x["distance_nm"])

    moving = [v for v in vessels if (v["sog_knots"] or 0) > 0.5]
    anchored = [v for v in vessels if (v["sog_knots"] or 0) <= 0.5]

    return {
        "vessels": vessels[:100],
        "total": len(vessels),
        "moving": len(moving),
        "anchored": len(anchored),
        "center_lat": lat,
        "center_lon": lon,
        "radius_nm": radius_nm,
        "source": "digitraffic-ais",
        "license": "CC BY 4.0 – Traffic Management Finland",
    }


async def vessels_bbox(
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
    min_speed_knots: float | None = None,
) -> dict:
    """
    Live AIS vessel positions within a bounding box (AOI area).
    Ideal for area monitoring agents with a defined polygon AOI.
    Source: Digitraffic Maritime API (CC BY 4.0).

    Args:
        lat_min: Minimum latitude of the area
        lat_max: Maximum latitude of the area
        lon_min: Minimum longitude of the area
        lon_max: Maximum longitude of the area
        min_speed_knots: Optional minimum speed filter (e.g. 0.5 to exclude anchored)
    """
    params = {
        "laMin": lat_min,
        "laMax": lat_max,
        "loMin": lon_min,
        "loMax": lon_max,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{DIGITRAFFIC_BASE}/locations",
            params=params,
            headers={"Accept-Encoding": "gzip"},
        )
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features") or []
    vessels = []

    for f in features:
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [None, None])
        flon, flat = coords[0], coords[1]
        if flon is None or flat is None:
            continue

        v = _fmt_vessel(props, flon, flat)

        sog = v["sog_knots"]
        if min_speed_knots is not None and (sog is None or sog < min_speed_knots):
            continue

        vessels.append(v)

    vessels.sort(key=lambda x: x["sog_knots"] or 0, reverse=True)

    moving = [v for v in vessels if (v["sog_knots"] or 0) > 0.5]
    anchored = [v for v in vessels if (v["sog_knots"] or 0) <= 0.5]

    return {
        "vessels": vessels[:150],
        "total": len(vessels),
        "moving": len(moving),
        "anchored": len(anchored),
        "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
        "source": "digitraffic-ais",
        "license": "CC BY 4.0 – Traffic Management Finland",
    }


async def vessel_detail(mmsi: int) -> dict:
    """
    Current AIS position and status for a specific vessel by MMSI number.
    Source: Digitraffic Maritime API (CC BY 4.0).

    Args:
        mmsi: Maritime Mobile Service Identity (9-digit vessel identifier)
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{DIGITRAFFIC_BASE}/locations/{mmsi}",
            headers={"Accept-Encoding": "gzip"},
        )
        if resp.status_code == 404:
            return {"error": f"Vessel MMSI {mmsi} not found or not active in AIS feed."}
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features") or []
    if not features:
        return {"error": f"No position data for MMSI {mmsi}."}

    f = features[0]
    props = f.get("properties", {})
    coords = f.get("geometry", {}).get("coordinates", [None, None])
    flon, flat = coords[0], coords[1]

    v = _fmt_vessel(props, flon, flat)

    # Fetch vessel metadata (name, type, dimensions)
    try:
        meta_resp = await client.get(f"{DIGITRAFFIC_BASE}/vessels/{mmsi}")
        if meta_resp.status_code == 200:
            meta = meta_resp.json()
            v["name"] = meta.get("name")
            v["vessel_type"] = _vessel_type_label(meta.get("shipType"))
            v["call_sign"] = meta.get("callSign")
            v["imo"] = meta.get("imoLloyds")
            v["length_m"] = meta.get("dimA", 0) + meta.get("dimB", 0) or None
            v["beam_m"] = meta.get("dimC", 0) + meta.get("dimD", 0) or None
            v["destination"] = meta.get("destination")
            v["draught_m"] = meta.get("draught")
    except Exception:
        pass

    return v
