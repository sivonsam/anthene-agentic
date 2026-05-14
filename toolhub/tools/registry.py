"""
Tool Registry — maps tool IDs to async functions + metadata.
"""

from tools.adsb import adsb_area, adsb_military
from tools.effis import effis_fires
from tools.weather import weather_area
from tools.map_tools import map_geocode
from tools.web_search import web_search
from tools.file_handler import file_read
from tools.telegram import telegram_notify
from tools.calculator import calculator
from tools.fmi import fmi_weather_observations, fmi_warnings
from tools.fingrid import fingrid_grid_status, fingrid_disturbances
from tools.gdacs import gdacs_alerts
from tools.opensky import opensky_area, opensky_aircraft
from tools.stuk import stuk_radiation
from tools.firms import firms_fires
from tools.entsoe import entsoe_load, entsoe_generation_outages
from tools.gas_storage import gas_storage

TOOL_REGISTRY: dict[str, dict] = {
    # ── Air traffic ──────────────────────────────────────────
    "adsb_area": {
        "fn": adsb_area,
        "name": "ADS-B Area Query",
        "description": "Live aircraft within radius from a location. Returns type, callsign, military status. (ADS-B Exchange)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "dist_nm": {"type": "number", "description": "Radius in nautical miles"}},
    },
    "adsb_military": {
        "fn": adsb_military,
        "name": "Global Military Aircraft",
        "description": "All currently tracked military aircraft globally. (ADS-B Exchange)",
        "parameters": {},
    },
    "opensky_area": {
        "fn": opensky_area,
        "name": "OpenSky Aircraft Area",
        "description": "Free ADS-B aircraft tracking. Live aircraft within radius. Alternative to ADS-B Exchange. (OpenSky Network)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "radius_km": {"type": "number"}},
    },
    "opensky_aircraft": {
        "fn": opensky_aircraft,
        "name": "OpenSky Single Aircraft",
        "description": "Current state of a specific aircraft by ICAO24 hex address.",
        "parameters": {"icao24": {"type": "string"}},
    },
    # ── Weather & environment ─────────────────────────────────
    "fmi_observations": {
        "fn": fmi_weather_observations,
        "name": "FMI Weather Observations",
        "description": "Finnish Meteorological Institute live weather observations near a location. Temperature, wind, pressure, snow. Free, no auth.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "hours_back": {"type": "integer"}},
    },
    "fmi_warnings": {
        "fn": fmi_warnings,
        "name": "FMI Weather Warnings",
        "description": "Active weather warnings from Finnish Meteorological Institute. Storms, icing, flooding.",
        "parameters": {"region": {"type": "string"}},
    },
    "weather_area": {
        "fn": weather_area,
        "name": "Weather (Open-Meteo)",
        "description": "Current weather conditions for any coordinates. Free, global coverage. (Open-Meteo)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}},
    },
    # ── Wildfires ─────────────────────────────────────────────
    "effis_fires": {
        "fn": effis_fires,
        "name": "EFFIS Active Fires (EU)",
        "description": "Active wildfire alerts from EU EFFIS. European coverage. Optionally filter by country.",
        "parameters": {"country": {"type": "string"}, "days": {"type": "integer"}},
    },
    "firms_fires": {
        "fn": firms_fires,
        "name": "NASA FIRMS Active Fires",
        "description": "NASA satellite fire detections globally. VIIRS + MODIS sensors. More global coverage than EFFIS.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "area_km": {"type": "number"}, "days": {"type": "integer"}, "country_iso": {"type": "string"}},
    },
    # ── Energy infrastructure ─────────────────────────────────
    "fingrid_status": {
        "fn": fingrid_grid_status,
        "name": "Fingrid Grid Status (Finland)",
        "description": "Real-time Finnish electricity grid: consumption, production, wind, nuclear, hydro, frequency. (Fingrid — requires free API key)",
        "parameters": {},
    },
    "fingrid_disturbances": {
        "fn": fingrid_disturbances,
        "name": "Fingrid Grid Disturbances",
        "description": "Recent electricity grid disturbance events in Finland.",
        "parameters": {"hours_back": {"type": "integer"}},
    },
    "entsoe_load": {
        "fn": entsoe_load,
        "name": "ENTSO-E Electricity Load",
        "description": "European electricity grid load (consumption) by country. Covers FI, SE, NO, DK, DE, etc. (ENTSO-E — requires free API key)",
        "parameters": {"country": {"type": "string", "description": "ISO2 country code"}, "hours_back": {"type": "integer"}},
    },
    "entsoe_outages": {
        "fn": entsoe_generation_outages,
        "name": "ENTSO-E Generation Outages",
        "description": "Planned power generation outages and shutdowns in European countries next 7 days.",
        "parameters": {"country": {"type": "string"}},
    },
    "gas_storage": {
        "fn": gas_storage,
        "name": "EU Gas Storage Levels",
        "description": "European natural gas storage fill levels by country or EU aggregate. Fill %, daily trend. Free, no auth. (GIE AGSI+)",
        "parameters": {"country": {"type": "string", "description": "ISO2 or 'EU'"}, "days_back": {"type": "integer"}},
    },
    # ── Radiation ─────────────────────────────────────────────
    "stuk_radiation": {
        "fn": stuk_radiation,
        "name": "STUK Radiation Monitoring",
        "description": "Finnish radiation dose rate readings from STUK monitoring network. Alert threshold: >0.5 µSv/h.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}},
    },
    # ── Disaster alerts ───────────────────────────────────────
    "gdacs_alerts": {
        "fn": gdacs_alerts,
        "name": "GDACS Disaster Alerts",
        "description": "Global Disaster Alert and Coordination System. Earthquakes, floods, cyclones, volcanoes. Free RSS/JSON. (GDACS/UN)",
        "parameters": {"alert_level": {"type": "string", "description": "Red|Orange|Green or null for all"}, "event_type": {"type": "string", "description": "EQ|TC|FL|VO|WF or null"}, "limit": {"type": "integer"}},
    },
    # ── Geospatial ────────────────────────────────────────────
    "map_geocode": {
        "fn": map_geocode,
        "name": "Geocode Address",
        "description": "Convert place name or address to coordinates. Uses Azure Maps or Nominatim fallback.",
        "parameters": {"query": {"type": "string"}},
    },
    # ── Web & files ───────────────────────────────────────────
    "web_search": {
        "fn": web_search,
        "name": "Web Search",
        "description": "Search the web with Bing or DuckDuckGo fallback.",
        "parameters": {"query": {"type": "string"}, "count": {"type": "integer"}},
    },
    "file_read": {
        "fn": file_read,
        "name": "Read Uploaded File",
        "description": "Read content of a previously uploaded file.",
        "parameters": {"file_id": {"type": "string"}},
    },
    # ── Notifications ─────────────────────────────────────────
    "telegram_notify": {
        "fn": telegram_notify,
        "name": "Telegram Notification",
        "description": "Send a message to the Anthene Telegram channel.",
        "parameters": {"message": {"type": "string"}},
    },
    # ── Utilities ─────────────────────────────────────────────
    "calculator": {
        "fn": calculator,
        "name": "Calculator",
        "description": "Safely evaluate a mathematical expression. Supports sqrt, sin, cos, log, etc.",
        "parameters": {"expression": {"type": "string"}},
    },
}
