"""
Tool Registry — maps tool IDs to async functions + metadata.

Each open-data tool includes:
  avoindata_category : avoindata.suomi.fi category slug
  source_org         : data provider organisation
  license            : data license
  avoindata_url      : link to avoindata.suomi.fi listing (if available)
  open_data          : True = publicly available, no commercial key needed by default
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
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "ADS-B Exchange / OpenSky Network",
        "license": "CC BY (OpenSky); kaupallinen (ADS-B Exchange)",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/group/liikenne",
    },
    "adsb_military": {
        "fn": adsb_military,
        "name": "Global Military Aircraft",
        "description": "All currently tracked military aircraft globally. (ADS-B Exchange)",
        "parameters": {},
        "avoindata_category": "oikeus-oikeysjarjestelma-ja-yleinen-turvallisuus",
        "avoindata_category_label": "Oikeus ja yleinen turvallisuus",
        "source_org": "ADS-B Exchange",
        "license": "Kaupallinen API-avain vaaditaan",
        "open_data": False,
        "avoindata_url": None,
    },
    "opensky_area": {
        "fn": opensky_area,
        "name": "OpenSky Aircraft Area",
        "description": "Free ADS-B aircraft tracking. Live aircraft within radius. Alternative to ADS-B Exchange. (OpenSky Network)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "radius_km": {"type": "number"}},
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "OpenSky Network",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/group/liikenne",
    },
    "opensky_aircraft": {
        "fn": opensky_aircraft,
        "name": "OpenSky Single Aircraft",
        "description": "Current state of a specific aircraft by ICAO24 hex address.",
        "parameters": {"icao24": {"type": "string"}},
        "avoindata_category": "liikenne",
        "avoindata_category_label": "Liikenne",
        "source_org": "OpenSky Network",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/group/liikenne",
    },
    # ── Weather & environment ─────────────────────────────────
    "fmi_observations": {
        "fn": fmi_weather_observations,
        "name": "FMI Weather Observations",
        "description": "Finnish Meteorological Institute live weather observations near a location. Temperature, wind, pressure, snow. Free, no auth.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "hours_back": {"type": "integer"}},
        "avoindata_category": "ymparisto",
        "avoindata_category_label": "Ympäristö",
        "source_org": "Ilmatieteen laitos (FMI)",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/dataset?q=ilmatieteen+laitos",
    },
    "fmi_warnings": {
        "fn": fmi_warnings,
        "name": "FMI Weather Warnings",
        "description": "Active weather warnings from Finnish Meteorological Institute. Storms, icing, flooding.",
        "parameters": {"region": {"type": "string"}},
        "avoindata_category": "ymparisto",
        "avoindata_category_label": "Ympäristö",
        "source_org": "Ilmatieteen laitos (FMI)",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/dataset?q=ilmatieteen+laitos",
    },
    "weather_area": {
        "fn": weather_area,
        "name": "Weather (Open-Meteo)",
        "description": "Current weather conditions for any coordinates. Free, global coverage. (Open-Meteo)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}},
        "avoindata_category": "ymparisto",
        "avoindata_category_label": "Ympäristö",
        "source_org": "Open-Meteo (ERA5 / DWD / ECMWF)",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": None,
    },
    # ── Wildfires ─────────────────────────────────────────────
    "effis_fires": {
        "fn": effis_fires,
        "name": "EFFIS Active Fires (EU)",
        "description": "Active wildfire alerts from EU EFFIS. European coverage. Optionally filter by country.",
        "parameters": {"country": {"type": "string"}, "days": {"type": "integer"}},
        "avoindata_category": "ymparisto",
        "avoindata_category_label": "Ympäristö",
        "source_org": "European Forest Fire Information System (EFFIS / JRC)",
        "license": "Avoin EU (EUPL)",
        "open_data": True,
        "avoindata_url": None,
    },
    "firms_fires": {
        "fn": firms_fires,
        "name": "NASA FIRMS Active Fires",
        "description": "NASA satellite fire detections globally. VIIRS + MODIS sensors. More global coverage than EFFIS.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "area_km": {"type": "number"}, "days": {"type": "integer"}, "country_iso": {"type": "string"}},
        "avoindata_category": "ymparisto",
        "avoindata_category_label": "Ympäristö",
        "source_org": "NASA FIRMS (VIIRS/MODIS)",
        "license": "Julkinen (NASA Open Data)",
        "open_data": True,
        "avoindata_url": None,
    },
    # ── Energy infrastructure ─────────────────────────────────
    "fingrid_status": {
        "fn": fingrid_grid_status,
        "name": "Fingrid Grid Status (Finland)",
        "description": "Real-time Finnish electricity grid: consumption, production, wind, nuclear, hydro, frequency. (Fingrid — requires free API key)",
        "parameters": {},
        "avoindata_category": "energia",
        "avoindata_category_label": "Energia",
        "source_org": "Fingrid Oyj",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/dataset?q=fingrid",
    },
    "fingrid_disturbances": {
        "fn": fingrid_disturbances,
        "name": "Fingrid Grid Disturbances",
        "description": "Recent electricity grid disturbance events in Finland.",
        "parameters": {"hours_back": {"type": "integer"}},
        "avoindata_category": "energia",
        "avoindata_category_label": "Energia",
        "source_org": "Fingrid Oyj",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/dataset?q=fingrid",
    },
    "entsoe_load": {
        "fn": entsoe_load,
        "name": "ENTSO-E Electricity Load",
        "description": "European electricity grid load (consumption) by country. Covers FI, SE, NO, DK, DE, etc. (ENTSO-E — requires free API key)",
        "parameters": {"country": {"type": "string", "description": "ISO2 country code"}, "hours_back": {"type": "integer"}},
        "avoindata_category": "energia",
        "avoindata_category_label": "Energia",
        "source_org": "ENTSO-E (European Network of Transmission System Operators)",
        "license": "Avoin (ENTSO-E rekisteröinti)",
        "open_data": True,
        "avoindata_url": None,
    },
    "entsoe_outages": {
        "fn": entsoe_generation_outages,
        "name": "ENTSO-E Generation Outages",
        "description": "Planned power generation outages and shutdowns in European countries next 7 days.",
        "parameters": {"country": {"type": "string"}},
        "avoindata_category": "energia",
        "avoindata_category_label": "Energia",
        "source_org": "ENTSO-E",
        "license": "Avoin (ENTSO-E rekisteröinti)",
        "open_data": True,
        "avoindata_url": None,
    },
    "gas_storage": {
        "fn": gas_storage,
        "name": "EU Gas Storage Levels",
        "description": "European natural gas storage fill levels by country or EU aggregate. Fill %, daily trend. Free, no auth. (GIE AGSI+)",
        "parameters": {"country": {"type": "string", "description": "ISO2 or 'EU'"}, "days_back": {"type": "integer"}},
        "avoindata_category": "energia",
        "avoindata_category_label": "Energia",
        "source_org": "Gas Infrastructure Europe (GIE AGSI+)",
        "license": "Avoin (GIE)",
        "open_data": True,
        "avoindata_url": None,
    },
    # ── Radiation ─────────────────────────────────────────────
    "stuk_radiation": {
        "fn": stuk_radiation,
        "name": "STUK Radiation Monitoring",
        "description": "Finnish radiation dose rate readings from STUK monitoring network. Alert threshold: >0.5 µSv/h.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}},
        "avoindata_category": "terveys",
        "avoindata_category_label": "Terveys",
        "source_org": "Säteilyturvakeskus (STUK)",
        "license": "CC BY 4.0",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/dataset?q=stuk+s%C3%A4teily",
    },
    # ── Disaster alerts ───────────────────────────────────────
    "gdacs_alerts": {
        "fn": gdacs_alerts,
        "name": "GDACS Disaster Alerts",
        "description": "Global Disaster Alert and Coordination System. Earthquakes, floods, cyclones, volcanoes. Free RSS/JSON. (GDACS/UN)",
        "parameters": {"alert_level": {"type": "string", "description": "Red|Orange|Green or null for all"}, "event_type": {"type": "string", "description": "EQ|TC|FL|VO|WF or null"}, "limit": {"type": "integer"}},
        "avoindata_category": "oikeus-oikeysjarjestelma-ja-yleinen-turvallisuus",
        "avoindata_category_label": "Oikeus ja yleinen turvallisuus",
        "source_org": "GDACS / UN OCHA",
        "license": "Julkinen (UN Open Data)",
        "open_data": True,
        "avoindata_url": None,
    },
    # ── Geospatial ────────────────────────────────────────────
    "map_geocode": {
        "fn": map_geocode,
        "name": "Geocode Address",
        "description": "Convert place name or address to coordinates. Uses Azure Maps or Nominatim fallback.",
        "parameters": {"query": {"type": "string"}},
        "avoindata_category": "alueet-ja-kaupungit",
        "avoindata_category_label": "Alueet ja kaupungit",
        "source_org": "Nominatim / OpenStreetMap",
        "license": "ODbL (OpenStreetMap)",
        "open_data": True,
        "avoindata_url": "https://avoindata.suomi.fi/data/fi/group/alueet-ja-kaupungit",
    },
    # ── Web & files ───────────────────────────────────────────
    "web_search": {
        "fn": web_search,
        "name": "Web Search",
        "description": "Search the web with Bing or DuckDuckGo fallback.",
        "parameters": {"query": {"type": "string"}},
        "open_data": False,
    },
    "file_read": {
        "fn": file_read,
        "name": "Read Uploaded File",
        "description": "Read content of a previously uploaded file.",
        "parameters": {"file_id": {"type": "string"}},
        "open_data": False,
    },
    # ── Notifications ─────────────────────────────────────────
    "telegram_notify": {
        "fn": telegram_notify,
        "name": "Telegram Notification",
        "description": "Send a message to the Anthene Telegram channel.",
        "parameters": {"message": {"type": "string"}},
        "open_data": False,
    },
    # ── Utilities ─────────────────────────────────────────────
    "calculator": {
        "fn": calculator,
        "name": "Calculator",
        "description": "Safely evaluate a mathematical expression. Supports sqrt, sin, cos, log, etc.",
        "parameters": {"expression": {"type": "string"}},
        "open_data": False,
    },
}



# Tool category taxonomy — used in Creator UI grouping and Store catalog
# Each tool has: category (slug) + category_label (Finnish display name with emoji)
TOOL_CATEGORIES = {
    "ilmailu":      "🛫 Ilmailu",
    "meri":         "⚓ Meri & Vesiväylät",
    "saa":          "🌦 Sää & Ilmasto",
    "ymparisto":    "🌿 Ympäristö & Tulipalot",
    "katastrofit":  "🌋 Katastrofit & Hälytykset",
    "energia":      "⚡ Energia & Verkot",
    "saateily":     "☢️ Säteily & CBRN",
    "paikkatiedot": "📍 Paikkatiedot & Kartat",
    "tiedustelu":   "🔍 Tiedustelu & Analytiikka",
    "viestinta":    "📢 Viestintä",
}

TOOL_REGISTRY: dict[str, dict] = {
    # ── 🛫 Ilmailu ────────────────────────────────────────────
    "adsb_area": {
        "fn": adsb_area,
        "name": "ADS-B Area Query",
        "description": "Live aircraft within radius from a location. Returns type, callsign, military status. (ADS-B Exchange)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "dist_nm": {"type": "number", "description": "Radius in nautical miles"}},
        "category": "ilmailu",
        "category_label": "🛫 Ilmailu",
    },
    "adsb_military": {
        "fn": adsb_military,
        "name": "Global Military Aircraft",
        "description": "All currently tracked military aircraft globally. (ADS-B Exchange)",
        "parameters": {},
        "category": "ilmailu",
        "category_label": "🛫 Ilmailu",
    },
    "opensky_area": {
        "fn": opensky_area,
        "name": "OpenSky Aircraft Area",
        "description": "Free ADS-B aircraft tracking. Live aircraft within bbox. No API key needed. (OpenSky Network)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "radius_km": {"type": "number"}},
        "category": "ilmailu",
        "category_label": "🛫 Ilmailu",
    },
    "opensky_aircraft": {
        "fn": opensky_aircraft,
        "name": "OpenSky Single Aircraft",
        "description": "Current state of a specific aircraft by ICAO24 hex address.",
        "parameters": {"icao24": {"type": "string"}},
        "category": "ilmailu",
        "category_label": "🛫 Ilmailu",
    },
    # ── 🌦 Sää & Ilmasto ─────────────────────────────────────
    "fmi_observations": {
        "fn": fmi_weather_observations,
        "name": "FMI Säähavainnot",
        "description": "Ilmatieteen laitoksen reaaliaikaiset säähavainnot lähimmiltä asemilta. Lämpötila, tuuli, paine, lumi. (FMI)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "hours_back": {"type": "integer"}},
        "category": "saa",
        "category_label": "🌦 Sää & Ilmasto",
    },
    "fmi_warnings": {
        "fn": fmi_warnings,
        "name": "FMI Varoitukset",
        "description": "Ilmatieteen laitoksen aktiiviset säävaroitukset. Myrskyt, jäätäminen, tulvat. (FMI)",
        "parameters": {"region": {"type": "string"}},
        "category": "saa",
        "category_label": "🌦 Sää & Ilmasto",
    },
    "weather_area": {
        "fn": weather_area,
        "name": "Sää globaali (Open-Meteo)",
        "description": "Reaaliaikaiset sääolosuhteet koordinaateista. Ilmainen, globaali kattavuus. (Open-Meteo / ERA5)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}},
        "category": "saa",
        "category_label": "🌦 Sää & Ilmasto",
    },
    # ── 🌿 Ympäristö & Tulipalot ──────────────────────────────
    "effis_fires": {
        "fn": effis_fires,
        "name": "EFFIS Metsäpalot (EU)",
        "description": "EU:n EFFIS-järjestelmän aktiiviset metsäpalovaroitukset. Eurooppalainen kattavuus.",
        "parameters": {"country": {"type": "string"}, "days": {"type": "integer"}},
        "category": "ymparisto",
        "category_label": "🌿 Ympäristö & Tulipalot",
    },
    "firms_fires": {
        "fn": firms_fires,
        "name": "NASA FIRMS Satelliittipalot",
        "description": "NASA:n satelliittipohjainen tulipalojen havainnointi globaalisti. VIIRS + MODIS. (NASA FIRMS)",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}, "area_km": {"type": "number"}, "days": {"type": "integer"}, "country_iso": {"type": "string"}},
        "category": "ymparisto",
        "category_label": "🌿 Ympäristö & Tulipalot",
    },
    # ── 🌋 Katastrofit & Hälytykset ───────────────────────────
    "gdacs_alerts": {
        "fn": gdacs_alerts,
        "name": "GDACS Katastrofivaroitukset",
        "description": "YK:n GDACS-järjestelmän maailmanlaajuiset luonnonkatastrofivaroitukset. Maanjäristykset, tulvat, syklonit, tulivuoret.",
        "parameters": {"alert_level": {"type": "string", "description": "Red|Orange|Green tai tyhjä kaikki"}, "event_type": {"type": "string", "description": "EQ|TC|FL|VO|WF tai tyhjä"}, "limit": {"type": "integer"}},
        "category": "katastrofit",
        "category_label": "🌋 Katastrofit & Hälytykset",
    },
    # ── ⚡ Energia & Verkot ───────────────────────────────────
    "fingrid_status": {
        "fn": fingrid_grid_status,
        "name": "Fingrid Sähköverkko (Suomi)",
        "description": "Suomen sähköverkon reaaliaikatilanne: kulutus, tuotanto, tuuli, ydinvoima, vesivoima, taajuus. (Fingrid)",
        "parameters": {},
        "category": "energia",
        "category_label": "⚡ Energia & Verkot",
    },
    "fingrid_disturbances": {
        "fn": fingrid_disturbances,
        "name": "Fingrid Häiriöt",
        "description": "Suomen sähköverkossa viimeaikaiset häiriötapahtumat.",
        "parameters": {"hours_back": {"type": "integer"}},
        "category": "energia",
        "category_label": "⚡ Energia & Verkot",
    },
    "entsoe_load": {
        "fn": entsoe_load,
        "name": "ENTSO-E Sähkönkulutus (EU)",
        "description": "Euroopan sähköverkon kulutusdata maittain. Kattaa FI, SE, NO, DK, DE jne. (ENTSO-E)",
        "parameters": {"country": {"type": "string", "description": "ISO2-maakoodi"}, "hours_back": {"type": "integer"}},
        "category": "energia",
        "category_label": "⚡ Energia & Verkot",
    },
    "entsoe_outages": {
        "fn": entsoe_generation_outages,
        "name": "ENTSO-E Tuotantokatkokset",
        "description": "Suunnitellut sähköntuotannon katkokset Euroopassa seuraavat 7 vrk. (ENTSO-E)",
        "parameters": {"country": {"type": "string"}},
        "category": "energia",
        "category_label": "⚡ Energia & Verkot",
    },
    "gas_storage": {
        "fn": gas_storage,
        "name": "EU Kaasun varastotaso",
        "description": "Euroopan maakaasun varastointiasteet maittain tai EU-aggregaattina. Täyttöaste %, päivittäinen trendi. (GIE AGSI+)",
        "parameters": {"country": {"type": "string", "description": "ISO2 tai 'EU'"}, "days_back": {"type": "integer"}},
        "category": "energia",
        "category_label": "⚡ Energia & Verkot",
    },
    # ── ☢️ Säteily & CBRN ────────────────────────────────────
    "stuk_radiation": {
        "fn": stuk_radiation,
        "name": "STUK Säteilymittaukset",
        "description": "STUK:n valvontaverkon säteilyannokset lähimmiltä mittausasemilta. Hälytystarve yli 0,5 µSv/h.",
        "parameters": {"lat": {"type": "number"}, "lon": {"type": "number"}},
        "category": "saateily",
        "category_label": "☢️ Säteily & CBRN",
    },
    # ── 📍 Paikkatiedot & Kartat ──────────────────────────────
    "map_geocode": {
        "fn": map_geocode,
        "name": "Geokoodaus",
        "description": "Muuntaa paikan nimen tai osoitteen koordinaateiksi. Azure Maps tai Nominatim-fallback.",
        "parameters": {"query": {"type": "string"}},
        "category": "paikkatiedot",
        "category_label": "📍 Paikkatiedot & Kartat",
    },
    # ── 🔍 Tiedustelu & Analytiikka ───────────────────────────
    "web_search": {
        "fn": web_search,
        "name": "Web-haku",
        "description": "Hakee tietoa verkosta Bing- tai DuckDuckGo-fallbackilla.",
        "parameters": {"query": {"type": "string"}, "count": {"type": "integer"}},
        "category": "tiedustelu",
        "category_label": "🔍 Tiedustelu & Analytiikka",
    },
    "file_read": {
        "fn": file_read,
        "name": "Lue tiedosto",
        "description": "Lukee aiemmin ladatun tiedoston sisällön analysoitavaksi.",
        "parameters": {"file_id": {"type": "string"}},
        "category": "tiedustelu",
        "category_label": "🔍 Tiedustelu & Analytiikka",
    },
    "calculator": {
        "fn": calculator,
        "name": "Laskin",
        "description": "Evaluoi matemaattisen lausekkeen turvallisesti. Tukee sqrt, sin, cos, log jne.",
        "parameters": {"expression": {"type": "string"}},
        "category": "tiedustelu",
        "category_label": "🔍 Tiedustelu & Analytiikka",
    },
    # ── 📢 Viestintä ─────────────────────────────────────────
    "telegram_notify": {
        "fn": telegram_notify,
        "name": "Telegram-ilmoitus",
        "description": "Lähettää viestin Anthene-Telegram-kanavalle.",
        "parameters": {"message": {"type": "string"}},
        "category": "viestinta",
        "category_label": "📢 Viestintä",
    },
}
