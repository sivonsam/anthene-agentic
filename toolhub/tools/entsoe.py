"""ENTSO-E Transparency Platform — European electricity grid data.
Free API key required (register at transparency.entsoe.eu).
https://transparency.entsoe.eu/api
"""

from __future__ import annotations

import os
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

ENTSOE_KEY = os.getenv("ENTSOE_API_KEY", "")
ENTSOE_BASE = "https://web-api.tp.entsoe.eu/api"

# EIC area codes for Nordic countries
AREAS = {
    "FI": "10YFI-1--------U",
    "SE": "10YSE-1--------K",
    "NO": "10YNO-0--------C",
    "DK": "10Y1001A1001A65H",
    "EE": "10Y1001A1001A39I",
    "LV": "10YLV-1001A00074",
    "LT": "10YLT-1001A0008Q",
    "DE": "10Y1001A1001A83F",
}

DOCUMENT_TYPES = {
    "load": "A65",           # Actual total load
    "generation": "A75",     # Actual generation per type
    "outages": "A77",        # Planned outages (generation)
    "prices": "A44",         # Day-ahead prices
}


def _fmt_date(dt: datetime) -> str:
    return dt.strftime("%Y%m%d%H%M")


async def entsoe_load(country: str = "FI", hours_back: int = 2) -> dict:
    """Get actual electricity load (consumption) for a country from ENTSO-E."""
    if not ENTSOE_KEY:
        return {
            "error": "ENTSOE_API_KEY not configured. Free registration at transparency.entsoe.eu",
            "supported_countries": list(AREAS.keys()),
        }

    area = AREAS.get(country.upper())
    if not area:
        return {"error": f"Unknown country '{country}'. Supported: {list(AREAS.keys())}"}

    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours_back)
    params = {
        "securityToken": ENTSOE_KEY,
        "documentType": DOCUMENT_TYPES["load"],
        "outBiddingZone_Domain": area,
        "periodStart": _fmt_date(start),
        "periodEnd": _fmt_date(now),
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(ENTSOE_BASE, params=params)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        ns = {"ns": "urn:iec62325.351:tc57wg16:451-6:generationloaddocument:3:0"}
        points = []
        for ts in root.findall(".//ns:TimeSeries", ns):
            for pt in ts.findall(".//ns:Point", ns):
                pos = pt.find("ns:position", ns)
                qty = pt.find("ns:quantity", ns)
                if pos is not None and qty is not None:
                    points.append({"position": pos.text, "quantity_mw": qty.text})

        latest = points[-1] if points else None
        return {
            "country": country,
            "area_code": area,
            "hours_back": hours_back,
            "data_points": len(points),
            "latest_mw": latest.get("quantity_mw") if latest else None,
            "series": points[-12:],  # last 12 points
            "source": "ENTSO-E Transparency",
        }
    except Exception as exc:
        return {"error": str(exc), "country": country}


async def entsoe_generation_outages(country: str = "FI") -> dict:
    """Get planned generation outages for a country (power plant shutdowns)."""
    if not ENTSOE_KEY:
        return {"error": "ENTSOE_API_KEY not configured"}

    area = AREAS.get(country.upper())
    if not area:
        return {"error": f"Unknown country '{country}'"}

    now = datetime.now(timezone.utc)
    params = {
        "securityToken": ENTSOE_KEY,
        "documentType": DOCUMENT_TYPES["outages"],
        "biddingZone_Domain": area,
        "periodStart": _fmt_date(now),
        "periodEnd": _fmt_date(now + timedelta(days=7)),
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(ENTSOE_BASE, params=params)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        count = len(root.findall(".//{*}TimeSeries"))
        return {
            "country": country,
            "outage_events_next_7d": count,
            "note": "See transparency.entsoe.eu for full details",
            "source": "ENTSO-E",
        }
    except Exception as exc:
        return {"error": str(exc)}
