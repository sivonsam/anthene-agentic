"""GDACS — Global Disaster Alert and Coordination System.

Free RSS/JSON feed, no auth required.
https://www.gdacs.org/xml/rss.xml
"""

from __future__ import annotations

import httpx
import xml.etree.ElementTree as ET

GDACS_RSS = "https://www.gdacs.org/xml/rss.xml"
GDACS_API = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"

ALERT_COLORS = {"Red": 3, "Orange": 2, "Green": 1}


async def gdacs_alerts(
    alert_level: str | None = None,
    event_type: str | None = None,
    limit: int = 20,
) -> dict:
    """
    Get active global disaster alerts from GDACS.
    alert_level: 'Red', 'Orange', 'Green' (or None for all)
    event_type: 'EQ' (earthquake), 'TC' (tropical cyclone), 'FL' (flood),
                'VO' (volcano), 'DR' (drought), 'WF' (wildfire), or None for all
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(GDACS_RSS)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)

        events = []
        for item in root.findall(".//item"):
            def get(tag):
                el = item.find(tag)
                return el.text if el is not None else None

            def getns(ns, tag):
                el = item.find(f"{{{ns}}}{tag}")
                return el.text if el is not None else None

            gdacs_ns = "http://www.gdacs.org"
            geo_ns = "http://www.w3.org/2003/01/geo/wgs84_pos#"

            event = {
                "title": get("title"),
                "description": get("description"),
                "link": get("link"),
                "pubDate": get("pubDate"),
                "alertlevel": getns(gdacs_ns, "alertlevel"),
                "eventtype": getns(gdacs_ns, "eventtype"),
                "eventname": getns(gdacs_ns, "eventname"),
                "country": getns(gdacs_ns, "country"),
                "fromdate": getns(gdacs_ns, "fromdate"),
                "todate": getns(gdacs_ns, "todate"),
                "severity": getns(gdacs_ns, "severity"),
                "population": getns(gdacs_ns, "population"),
                "lat": getns(geo_ns, "lat"),
                "lon": getns(geo_ns, "long"),
            }

            if alert_level and event.get("alertlevel") != alert_level:
                continue
            if event_type and event.get("eventtype") != event_type:
                continue

            events.append(event)

        # Sort by alert level severity
        events.sort(key=lambda e: ALERT_COLORS.get(e.get("alertlevel", ""), 0), reverse=True)

        return {
            "total": len(events),
            "filtered_by_level": alert_level,
            "filtered_by_type": event_type,
            "events": events[:limit],
            "source": "GDACS RSS",
        }
    except Exception as exc:
        return {"error": str(exc), "events": []}
