"""FMI (Finnish Meteorological Institute) open data tools.

Endpoint: https://opendata.fmi.fi/wfs (WFS 2.0)
No authentication required.
"""

from __future__ import annotations

import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta


FMI_WFS = "https://opendata.fmi.fi/wfs"
NS = {
    "wfs": "http://www.opengis.net/wfs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
    "BsWfs": "http://xml.fmi.fi/schema/wfs/2.0",
}


def _iso_now(offset_hours: int = 0) -> str:
    t = datetime.now(timezone.utc) + timedelta(hours=offset_hours)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


async def fmi_weather_observations(lat: float, lon: float, hours_back: int = 1) -> dict:
    """Get latest weather observations near a location from FMI open data."""
    hours_back = min(max(hours_back, 1), 24)
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "getFeature",
        "storedquery_id": "fmi::observations::weather::simple",
        "latlon": f"{lat},{lon}",
        "maxlocations": "1",
        "starttime": _iso_now(-hours_back),
        "endtime": _iso_now(),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FMI_WFS, params=params)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        observations = []
        for member in root.findall(".//BsWfs:BsWfsElement", NS):
            obs = {}
            time_el = member.find("BsWfs:Time", NS)
            name_el = member.find("BsWfs:ParameterName", NS)
            val_el = member.find("BsWfs:ParameterValue", NS)
            if time_el is not None:
                obs["time"] = time_el.text
            if name_el is not None:
                obs["parameter"] = name_el.text
            if val_el is not None:
                obs["value"] = val_el.text
            if obs:
                observations.append(obs)

        # Group by parameter
        grouped: dict[str, str] = {}
        for o in observations:
            grouped[o.get("parameter", "?")] = o.get("value", "NaN")

        return {
            "lat": lat, "lon": lon,
            "hours_back": hours_back,
            "observations": grouped,
            "raw_count": len(observations),
            "source": "FMI open data WFS",
        }
    except Exception as exc:
        return {"error": str(exc), "lat": lat, "lon": lon}


async def fmi_warnings(region: str = "Finland") -> dict:
    """Get active weather warnings from FMI."""
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "getFeature",
        "storedquery_id": "fmi::warnings::active",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FMI_WFS, params=params)
            resp.raise_for_status()
            # Parse basic XML
            root = ET.fromstring(resp.content)
            count = len(root.findall(".//{*}member"))
            return {
                "region": region,
                "warning_count": count,
                "source": "FMI warnings WFS",
                "note": "Use WMS layer for map visualization: https://openwms.fmi.fi/geoserver/wms",
            }
    except Exception as exc:
        return {"error": str(exc), "warning_count": 0}


async def fmi_lightning(lat: float, lon: float, hours_back: int = 2) -> dict:
    """Lightning strike detections near a location from FMI open data.
    Covers Finland and surrounding seas. Updates every few minutes.

    Args:
        lat: Center latitude
        lon: Center longitude
        hours_back: How many hours back to search (1-6)
    """
    hours_back = min(max(hours_back, 1), 6)
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "getFeature",
        "storedquery_id": "fmi::observations::lightning::multipointcoverage",
        "bbox": f"{lon-3},{lat-3},{lon+3},{lat+3}",
        "starttime": _iso_now(-hours_back),
        "endtime": _iso_now(),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FMI_WFS, params=params)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        # Parse lightning positions from gml:positions
        strikes = []
        pos_els = root.findall(".//{http://www.opengis.net/gml/3.2}pos")
        for el in pos_els:
            parts = (el.text or "").split()
            if len(parts) >= 2:
                try:
                    strikes.append({"lat": float(parts[0]), "lon": float(parts[1])})
                except ValueError:
                    pass

        return {
            "lat": lat, "lon": lon,
            "hours_back": hours_back,
            "strike_count": len(strikes),
            "strikes": strikes[:200],
            "source": "FMI open data WFS – lightning",
            "license": "CC BY 4.0",
        }
    except Exception as exc:
        return {"error": str(exc), "lat": lat, "lon": lon, "strike_count": 0}
