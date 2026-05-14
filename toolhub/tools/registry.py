"""
Tool Registry — maps tool IDs to async functions + metadata.

Only tools verified to work from Azure Container Apps (Sweden Central) are registered.
Removed tools that were non-functional:
  - ADS-B Exchange specific tools (adsb_military, adsb_emergency, adsb_by_*, aircraft_trail,
    aircraft_detail) — API key not subscribed to these endpoints (403)
  - EFFIS fires — Copernicus WFS blocks Azure IPs
  - STUK radiation — HTTP 404 (API endpoint removed)
  - FMI warnings — HTTP 400 (WFS query parameters changed)
  - Gas storage (AGSI) — 301 redirect (API URL changed, no follow)
  - NASA FIRMS fires — FIRMS_MAP_KEY not configured
  - Fingrid — FINGRID_API_KEY not configured
  - ENTSO-E — ENTSOE_API_KEY not configured
  - Azure Maps geocode — AZURE_MAPS_KEY not configured
  - Sanctions check — crashes (missing external config)
  - File read — Blob Storage not configured
  - Telegram notify — TELEGRAM_BOT_TOKEN not configured
  - OpenSky aircraft (icao24 lookup) — OpenSky direct blocked from Azure
  - Vessel detail — Digitraffic /locations/{mmsi} returns 404
"""

from tools.adsb import adsb_area
from tools.opensky import opensky_area
from tools.fmi import fmi_weather_observations as fmi_observations, fmi_lightning
from tools.weather import weather_area
from tools.gdacs import gdacs_alerts
from tools.vessels import vessels_area, vessels_bbox
from tools.web_search import web_search
from tools.calculator import calculator
from tools.analysis import detect_clusters, correlate_events

TOOL_REGISTRY: dict[str, dict] = {
    # ── Air traffic ──────────────────────────────────────────
    "adsb_area": {
        "fn": adsb_area,
        "name": "ADS-B Area Query",
        "description": (
            "Live aircraft within radius from a location. Returns callsign, type, altitude, "
            "speed, heading, squawk alerts. Data from Anthene Light cache (OpenSky + ADS-B Exchange, "
            "updates every 30s). Fallback: airplanes.live."
        ),
        "parameters": {
            "lat": {"type": "number", "description": "Center latitude"},
            "lon": {"type": "number", "description": "Center longitude"},
            "dist_nm": {"type": "number", "description": "Radius in nautical miles (default 50, max 250)"},
        },
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "OpenSky Network / ADS-B Exchange (via Anthene cache)",
        "license": "CC BY (OpenSky); open (airplanes.live)",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/group/liikenne",
    },
    "opensky_area": {
        "fn": opensky_area,
        "name": "OpenSky Aircraft Area",
        "description": (
            "Free ADS-B aircraft tracking via airplanes.live. Live aircraft within radius. "
            "Returns callsign, hex, altitude, speed, track. Use adsb_area for richer cached data."
        ),
        "parameters": {
            "lat": {"type": "number", "description": "Center latitude"},
            "lon": {"type": "number", "description": "Center longitude"},
            "radius_km": {"type": "number", "description": "Search radius in kilometers (default 200)"},
        },
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "airplanes.live / OpenSky Network",
        "license": "CC BY 4.0 (OpenSky)",
        "open_data": True,
        "avoindata_url": "https://opensky-network.org/",
    },
    # ── Maritime ─────────────────────────────────────────────
    "vessels_area": {
        "fn": vessels_area,
        "name": "AIS Alukset (säde)",
        "description": (
            "Live AIS vessel positions within a radius. Returns MMSI, speed (SOG), course (COG), "
            "heading, nav status. Source: Digitraffic Maritime, coverage: Baltic Sea + Finnish coast."
        ),
        "parameters": {
            "lat": {"type": "number", "description": "Center latitude"},
            "lon": {"type": "number", "description": "Center longitude"},
            "radius_nm": {"type": "number", "description": "Radius in nautical miles (default 30)"},
            "min_speed_knots": {"type": "number", "description": "Optional: filter by minimum speed"},
            "max_speed_knots": {"type": "number", "description": "Optional: filter by maximum speed"},
        },
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "Digitraffic / Väylävirasto",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://www.digitraffic.fi/meriliikenne/",
    },
    "vessels_bbox": {
        "fn": vessels_bbox,
        "name": "AIS Alukset (alue/AOI)",
        "description": (
            "Live AIS vessel positions within a bounding box. Returns all vessels in the rectangle. "
            "Use this with AOI (lat_min/lat_max/lon_min/lon_max) for area monitoring."
        ),
        "parameters": {
            "lat_min": {"type": "number"},
            "lat_max": {"type": "number"},
            "lon_min": {"type": "number"},
            "lon_max": {"type": "number"},
            "min_speed_knots": {"type": "number", "description": "Optional speed filter"},
        },
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "Digitraffic / Väylävirasto",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://www.digitraffic.fi/meriliikenne/",
    },
    # ── Weather & environment ─────────────────────────────────
    "fmi_observations": {
        "fn": fmi_observations,
        "name": "FMI Säähavainnot",
        "description": (
            "Ilmatieteen laitoksen reaaliaikaiset säähavainnot lähimmältä sääasemalta. "
            "Lämpötila, tuulen nopeus/suunta, kosteus, paine, sade. Päivittyy ~10 min välein."
        ),
        "parameters": {
            "lat": {"type": "number", "description": "Latitude"},
            "lon": {"type": "number", "description": "Longitude"},
            "hours_back": {"type": "number", "description": "Hours of history (default 1, max 24)"},
        },
        "avoindata_category": "ymparisto-ja-luonnonvarat",
        "avoindata_category_label": "Ympäristö",
        "source_org": "Ilmatieteen laitos (FMI)",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://en.ilmatieteenlaitos.fi/open-data",
    },
    "fmi_lightning": {
        "fn": fmi_lightning,
        "name": "FMI Salamahavainnot",
        "description": (
            "Salamahavainnot lähialueelta FMI:n avoimen datan kautta. "
            "Palauttaa salaman sijainnin, napaisuuden ja ajankohdan."
        ),
        "parameters": {
            "lat": {"type": "number"},
            "lon": {"type": "number"},
            "radius_km": {"type": "number", "description": "Radius in km (default 200)"},
            "hours_back": {"type": "number", "description": "Hours back (default 2)"},
        },
        "avoindata_category": "ymparisto-ja-luonnonvarat",
        "avoindata_category_label": "Ympäristö",
        "source_org": "Ilmatieteen laitos (FMI)",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://en.ilmatieteenlaitos.fi/open-data",
    },
    "weather_area": {
        "fn": weather_area,
        "name": "Sää globaali (Open-Meteo)",
        "description": (
            "Reaaliaikaiset sääolosuhteet koordinaateista. Lämpötila, kosteus, tuuli, "
            "sademäärä, pilvisyys. Global coverage, no API key needed."
        ),
        "parameters": {
            "lat": {"type": "number"},
            "lon": {"type": "number"},
        },
        "avoindata_category": "ymparisto-ja-luonnonvarat",
        "avoindata_category_label": "Ympäristö",
        "source_org": "Open-Meteo",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://open-meteo.com/",
    },
    # ── Disasters & alerts ────────────────────────────────────
    "gdacs_alerts": {
        "fn": gdacs_alerts,
        "name": "GDACS Katastrofivaroitukset",
        "description": (
            "YK:n GDACS-järjestelmän maailmanlaajuiset luonnonkatastrofivaroitukset. "
            "Maanjäristykset, syklonit, tulvat, kuivuudet. Päivittyy jatkuvasti."
        ),
        "parameters": {
            "event_type": {"type": "string", "description": "Filter: EQ=earthquake, TC=cyclone, FL=flood, DR=drought, WF=wildfire"},
            "min_severity": {"type": "number", "description": "Minimum alert level 1-3"},
        },
        "avoindata_category": "ymparisto-ja-luonnonvarat",
        "avoindata_category_label": "Ympäristö",
        "source_org": "GDACS / United Nations",
        "license": "Open (UN)",
        "open_data": True,
        "avoindata_url": "https://www.gdacs.org/",
    },
    # ── Analysis tools ────────────────────────────────────────
    "detect_clusters": {
        "fn": detect_clusters,
        "name": "Klusterianalyysi",
        "description": (
            "Havaitsee maantieteelliset klusterit alusten, lentokoneiden tai tapahtumien joukosta. "
            "Tunnistaa epätavalliset keskittymät ja poikkeamat. Input: list of {lat, lon, ...}."
        ),
        "parameters": {
            "items": {"type": "array", "description": "List of objects with lat/lon fields"},
            "radius_km": {"type": "number", "description": "Cluster radius in km (default 10)"},
            "min_cluster_size": {"type": "number", "description": "Minimum points per cluster (default 3)"},
        },
        "avoindata_category": "tiede-ja-teknologia",
        "avoindata_category_label": "Tiede ja teknologia",
        "source_org": "Anthene Analysis",
        "license": "Internal",
        "open_data": False,
        "avoindata_url": None,
    },
    "correlate_events": {
        "fn": correlate_events,
        "name": "Tapahtumien korrelaatio",
        "description": (
            "Korreloi kaksi tapahtumajoukkoa sijainnin perusteella. "
            "Esim. lentokoneet vs alukset samalla alueella — löytää yhteisesiintymät."
        ),
        "parameters": {
            "events_a": {"type": "array", "description": "First list of events with lat/lon"},
            "events_b": {"type": "array", "description": "Second list of events with lat/lon"},
            "radius_km": {"type": "number", "description": "Correlation radius in km (default 20)"},
        },
        "avoindata_category": "tiede-ja-teknologia",
        "avoindata_category_label": "Tiede ja teknologia",
        "source_org": "Anthene Analysis",
        "license": "Internal",
        "open_data": False,
        "avoindata_url": None,
    },
    # ── Search ────────────────────────────────────────────────
    "web_search": {
        "fn": web_search,
        "name": "Web-haku",
        "description": (
            "Hakee tietoa verkosta. Palauttaa linkit ja kuvaukset hakutuloksista. "
            "Käyttää Bing-hakua (jos avain asetettu) tai DuckDuckGo-fallbackia."
        ),
        "parameters": {
            "query": {"type": "string", "description": "Search query"},
            "count": {"type": "number", "description": "Number of results (default 5)"},
        },
        "avoindata_category": "tiede-ja-teknologia",
        "avoindata_category_label": "Tiede ja teknologia",
        "source_org": "Bing / DuckDuckGo",
        "license": "Commercial (Bing) / Open (DuckDuckGo)",
        "open_data": False,
        "avoindata_url": None,
    },
    # ── Utility ───────────────────────────────────────────────
    "calculator": {
        "fn": calculator,
        "name": "Laskin",
        "description": (
            "Evaluoi matemaattisen lausekkeen turvallisesti. "
            "Tukee peruslaskutoimituksia, trigonometriaa, logaritmeja. "
            "Esim: '2 * pi * 6371' tai 'sqrt(3**2 + 4**2)'."
        ),
        "parameters": {
            "expression": {"type": "string", "description": "Math expression to evaluate"},
        },
        "avoindata_category": "tiede-ja-teknologia",
        "avoindata_category_label": "Tiede ja teknologia",
        "source_org": "Anthene",
        "license": "Internal",
        "open_data": False,
        "avoindata_url": None,
    },
}
