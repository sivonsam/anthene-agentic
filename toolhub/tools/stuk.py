"""STUK — Finnish Radiation and Nuclear Safety Authority.
Real-time radiation monitoring network (dose rates).
Public data, no auth.
https://www.stuk.fi/web/en/topics/radiation-in-environment/radiation-monitoring-network
"""

from __future__ import annotations

import httpx

# Primary: STUK external dose rate JSON API
# Fallback: STUK WMS/GeoServer for spatial queries
STUK_API = "https://www.stuk.fi/api/radiation-monitoring"
STUK_API_V2 = "https://www.stuk.fi/api/v2/radiation-monitoring"


async def stuk_radiation(lat: float | None = None, lon: float | None = None) -> dict:
    """
    Get radiation dose rate readings from STUK monitoring network.
    Optionally filter to nearest station by lat/lon.
    Returns dose rates in µSv/h (microsieverts per hour).
    Normal background: ~0.05–0.30 µSv/h
    Alert threshold: >0.5 µSv/h warrants attention
    """
    data = None
    last_error = None
    for url in [STUK_API, STUK_API_V2]:
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, headers={"Accept": "application/json"})
                if resp.status_code == 200:
                    data = resp.json()
                    break
                last_error = f"HTTP {resp.status_code} from {url}"
        except Exception as exc:
            last_error = str(exc)

    if data is None:
        return {
            "error": f"STUK radiation API not reachable: {last_error}",
            "note": "Radiation data can be viewed at https://www.stuk.fi and https://gis.stuk.fi",
            "wms_layer": "https://gis.stuk.fi/geoserver/wms",
            "source": "STUK",
            "status": "API unavailable — no live data",
        }

    stations = data if isinstance(data, list) else data.get("stations", [])

    if lat is not None and lon is not None and stations:
        import math
        def dist(s):
            slat = s.get("lat") or s.get("latitude", 0)
            slon = s.get("lon") or s.get("longitude", 0)
            return math.hypot(slat - lat, slon - lon)
        stations = sorted(stations, key=dist)[:5]

    elevated = [s for s in stations if (s.get("dose_rate") or 0) > 0.3]

    return {
        "station_count": len(stations),
        "elevated_readings": len(elevated),
        "stations": stations[:20],
        "alert_threshold_uSv_h": 0.5,
        "normal_range_uSv_h": "0.05-0.30",
        "source": "STUK radiation monitoring",
    }
