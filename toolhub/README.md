# Anthene Tool Hub

Standalone FastAPI service exposing all Anthene capabilities as LangGraph-compatible tools.

## Tools

| ID | Description | Auth needed |
|---|---|---|
| `adsb_area` | Live aircraft in radius | `ADSB_API_KEY` |
| `adsb_military` | Global military aircraft | `ADSB_API_KEY` |
| `effis_fires` | Active wildfires (EFFIS) | None |
| `weather_area` | Weather (Open-Meteo) | None |
| `map_geocode` | Geocoding (falls back to Nominatim) | Optional `AZURE_MAPS_KEY` |
| `web_search` | Web search (falls back to DuckDuckGo) | Optional `BING_SEARCH_KEY` |
| `file_read` | Read uploaded file | — |
| `telegram_notify` | Send Telegram message | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID` |
| `calculator` | Safe math evaluator | None |

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Environment variables

```
ADSB_API_KEY=...
AZURE_MAPS_KEY=...         (optional, falls back to Nominatim)
BING_SEARCH_KEY=...        (optional, falls back to DuckDuckGo)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHANNEL_ID=...
BLOB_STORAGE_URL=...       (optional, for file_read)
UPLOAD_DIR=/tmp/anthene-uploads
```

## Docker

```bash
docker build -t anthene-toolhub .
docker run -p 8001:8001 --env-file .env anthene-toolhub
```
