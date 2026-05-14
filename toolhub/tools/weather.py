"""Weather tool using Open-Meteo (free, no API key needed)."""

from __future__ import annotations

import httpx

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"


async def weather_area(lat: float, lon: float) -> dict:
    """Current weather conditions for given coordinates."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "temperature_2m", "relative_humidity_2m", "wind_speed_10m",
            "wind_direction_10m", "weather_code", "cloud_cover",
            "precipitation", "surface_pressure",
        ],
        "wind_speed_unit": "kn",
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(OPEN_METEO, params=params)
        resp.raise_for_status()
        data = resp.json()

    current = data.get("current", {})
    return {
        "lat": lat,
        "lon": lon,
        "timezone": data.get("timezone"),
        "temperature_c": current.get("temperature_2m"),
        "humidity_pct": current.get("relative_humidity_2m"),
        "wind_speed_kt": current.get("wind_speed_10m"),
        "wind_direction_deg": current.get("wind_direction_10m"),
        "cloud_cover_pct": current.get("cloud_cover"),
        "precipitation_mm": current.get("precipitation"),
        "pressure_hpa": current.get("surface_pressure"),
        "visibility_m": None,  # not available in current endpoint
        "weather_code": current.get("weather_code"),
        "time": current.get("time"),
    }
