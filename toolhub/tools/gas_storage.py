"""GIE AGSI+ — European gas storage levels.
No authentication required.
https://agsi.gie.eu/api/
"""

from __future__ import annotations

import httpx

AGSI_BASE = "https://agsi.gie.eu/api"

COUNTRY_CODES = {
    "FI": "fi", "SE": "se", "NO": "no", "DE": "de",
    "FR": "fr", "IT": "it", "NL": "nl", "AT": "at",
    "PL": "pl", "EE": "ee", "LV": "lv", "LT": "lt",
    "EU": "eu",  # EU aggregate
}


async def gas_storage(country: str = "EU", days_back: int = 7) -> dict:
    """
    Get European gas storage levels from GIE AGSI+.
    country: ISO2 code or 'EU' for aggregate
    Returns storage fill %, net change, trend.
    """
    code = COUNTRY_CODES.get(country.upper(), "eu")

    try:
        from datetime import datetime, timezone, timedelta
        end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        start = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")

        url = f"{AGSI_BASE}/"
        params = {
            "country": code,
            "from": start,
            "to": end,
            "size": days_back + 1,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        records = data.get("data", [])
        if not records:
            return {"error": "No data returned", "country": country}

        latest = records[0] if records else {}
        previous = records[1] if len(records) > 1 else {}

        fill = latest.get("gasInStorage") or latest.get("full")
        prev_fill = previous.get("gasInStorage") or previous.get("full")
        trend = None
        if fill and prev_fill:
            try:
                trend = round(float(fill) - float(prev_fill), 2)
            except Exception:
                pass

        return {
            "country": country,
            "date": latest.get("gasDayStart") or latest.get("date"),
            "fill_pct": fill,
            "trend_pct_day": trend,
            "trend_direction": "↑ filling" if (trend or 0) > 0 else "↓ withdrawing" if (trend or 0) < 0 else "→ stable",
            "injection": latest.get("injection"),
            "withdrawal": latest.get("withdrawal"),
            "days_of_data": len(records),
            "source": "GIE AGSI+",
        }
    except Exception as exc:
        return {"error": str(exc), "country": country}
