"""EFFIS / FIRMS wildfire tool."""

from __future__ import annotations

import httpx

EFFIS_BASE = "https://effis.jrc.ec.europa.eu/api/fires"
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/country/csv"

# EFFIS WFS endpoint — may occasionally be slow or return 502
_EFFIS_WFS = "https://maps.effis.emergency.copernicus.eu/gwis"
# NASA EONET — fallback fire events API, no key needed
_EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"


async def effis_fires(country: str | None = None, days: int = 7) -> dict:
    """Active wildfire data from EFFIS GeoServer WFS (EU Copernicus).
    Falls back to NASA EONET if EFFIS is unavailable."""
    days = min(max(days, 1), 30)

    # Try EFFIS WFS first
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "ms:modis_firepoints_24h",
        "outputFormat": "application/json",
        "count": "500",
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(_EFFIS_WFS, params=params)
            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features", [])
                fires = []
                for f in features:
                    props = f.get("properties", {})
                    coords = f.get("geometry", {}).get("coordinates", [None, None])
                    fire = {
                        "lat": coords[1] if len(coords) > 1 else None,
                        "lon": coords[0] if coords else None,
                        "country": props.get("country_id", ""),
                        "frp": props.get("frp"),
                        "brightness": props.get("brightness"),
                        "acq_date": props.get("acq_date"),
                        "satellite": props.get("satellite", "MODIS"),
                    }
                    if country and fire["country"] != country.upper():
                        continue
                    fires.append(fire)
                return {
                    "total": len(fires),
                    "fires": fires[:200],
                    "filter_country": country,
                    "days_back": days,
                    "source": "EFFIS Copernicus (MODIS 24h)",
                }
    except Exception:
        pass

    # Fallback: NASA EONET wildfire events
    try:
        eonet_params = {"category": "wildfires", "status": "open", "limit": 50}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(_EONET_URL, params=eonet_params)
            resp.raise_for_status()
            data = resp.json()
        events = data.get("events", [])
        fires = []
        for e in events:
            geom = e.get("geometry", [{}])
            latest = geom[-1] if geom else {}
            coords = latest.get("coordinates", [None, None])
            fires.append({
                "lat": coords[1] if len(coords) > 1 else None,
                "lon": coords[0] if coords else None,
                "title": e.get("title"),
                "date": latest.get("date"),
                "source": "EONET",
            })
        return {
            "total": len(fires),
            "fires": fires[:100],
            "filter_country": country,
            "days_back": days,
            "source": "NASA EONET (EFFIS unavailable)",
            "note": "EFFIS Copernicus endpoint returned error — showing NASA EONET wildfire events instead",
        }
    except Exception as exc:
        return {
            "error": str(exc),
            "fires": [], "total": 0,
            "note": "Both EFFIS and NASA EONET failed. Try again later.",
        }
