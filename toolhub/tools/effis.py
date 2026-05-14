"""EFFIS / FIRMS wildfire tool."""

from __future__ import annotations

import httpx

EFFIS_BASE = "https://effis.jrc.ec.europa.eu/api/fires"
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/country/csv"


async def effis_fires(country: str | None = None, days: int = 7) -> dict:
    """Active wildfire data from EFFIS GeoServer WFS."""
    days = min(max(days, 1), 30)

    # Use EFFIS WFS public endpoint
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "ms:modis_firepoints_24h",
        "outputFormat": "application/json",
        "count": "500",
    }
    url = "https://maps.effis.emergency.copernicus.eu/gwis"

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
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
                "frp": props.get("frp"),       # fire radiative power
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
        }
    except Exception as exc:
        return {"error": str(exc), "fires": [], "total": 0}
