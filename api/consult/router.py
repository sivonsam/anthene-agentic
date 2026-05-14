"""Agent consultation endpoint — SSE streaming AI consultant."""

from __future__ import annotations

import json
import logging
import os
from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openai import AsyncAzureOpenAI
from pydantic import BaseModel

from auth.dependencies import CurrentUser, get_current_user

router = APIRouter(tags=["consult"])
logger = logging.getLogger("anthene-consult")

_client: AsyncAzureOpenAI | None = None


def _get_client() -> AsyncAzureOpenAI:
    global _client
    if _client is None:
        _client = AsyncAzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
        )
    return _client


CONSULTANT_SYSTEM_PROMPT = """Olet Anthene-alustan senior AI-agenttikonsultti. Tehtäväsi on käydä syvällinen konsultaatiokeskustelu käyttäjän kanssa ja rakentaa heille täydellinen, heidän tarpeisiinsa räätälöity AI-agenttikonfiguraatio.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KÄYTETTÄVISSÄ OLEVAT TYÖKALUT (21 kpl)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛫 ILMAILU
• adsb_area — Live lentokoneet säteen sisällä. Paras reaaliaikaiseen ilma-aluevalvontaan
• adsb_military — Sotilaslentokoneet globaalisti (vaatii API-avaimen)
• opensky_area — Ilmainen ADS-B seuranta bbox-alueella, ei API-avainta
• opensky_aircraft — Yksittäisen lentokoneen tila ICAO24-tunnuksella

🌦 SÄÄ & ILMASTO
• fmi_observations — FMI:n reaaliaikaiset säähavainnot lähimmiltä asemilta (Suomi, ilmainen)
• fmi_warnings — FMI:n aktiiviset säävaroitukset alueittain (myrskyt, jää, tulvat)
• weather_area — Globaali sää koordinaateista, ilmainen, kattaa koko maailman (Open-Meteo)

🌿 YMPÄRISTÖ & TULIPALOT
• effis_fires — EU:n EFFIS-metsäpalohälytykset, eurooppalainen kattavuus
• firms_fires — NASA:n VIIRS+MODIS satelliittipohjainen tulipalodata globaalisti

🌋 KATASTROFIT & HÄLYTYKSET
• gdacs_alerts — YK:n GDACS: maanjäristykset, hirmumyrskyt, tulvat, tulivuoret, metsäpalot

⚡ ENERGIA & VERKOT
• fingrid_status — Suomen sähköverkon reaaliaikatila: kulutus, tuotanto, taajuus, tuuli, ydinvoima
• fingrid_disturbances — Fingridin sähköverkohäiriöt (Suomi)
• entsoe_load — Euroopan sähkönkulutus maittain, kattaa FI/SE/NO/DK/DE+ (ENTSO-E)
• entsoe_outages — Suunnitellut tuotantokatkokset EU:ssa seuraavat 7 vrk
• gas_storage — Euroopan maakaasun varastointiasteet maittain tai EU-tasolla (GIE AGSI+)

☢️ SÄTEILY & CBRN
• stuk_radiation — STUK:n säteilydosiimitaukset lähimmiltä asemilta (Suomi), hälytysraja 0,5 µSv/h

📍 PAIKKATIEDOT & KARTAT
• map_geocode — Muuntaa osoitteen tai paikanimen koordinaateiksi (Azure Maps / Nominatim)

🔍 TIEDUSTELU & ANALYTIIKKA
• web_search — Web-haku Bingillä tai DuckDuckGolla, taustatiedon hankintaan
• file_read — Lukee ladatun tiedoston sisällön analyysia varten
• calculator — Matemaattiset laskut, tilastointi, yksikkömuunnokset

📢 VIESTINTÄ
• telegram_notify — Lähettää automaattisen ilmoituksen Anthene-Telegram-kanavalle

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENTTIKATEGORIAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• aluevalvonta — AOI-pohjainen maantieteellinen valvonta
• liikenne — Ilma-, meri- ja tieliikenne
• ymparisto — Ympäristö, tulipalot, luonnonilmiöt
• energia — Sähköverkko, kaasu, ydinvoima, kriittinen infra
• turvallisuus — Pelastus, rajavalvonta, yleinen turvallisuus
• tiedustelu — Tilannekuva, analytiikka, raportointi
• halytin — Kynnysarvopohjainen automaattinen hälytin
• superagenti — Kaikki 21 työkalua, kattava tilannekuva
• yleinen — Yleiskäyttöinen

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KONSULTOINTIPROSESSI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. AVAUS: Tervehdi lyhyesti ja kysy käyttötarkoitusta yhdellä avoimella kysymyksellä
2. TARKENTAMINEN (2–4 kierrosta): Kysy max 2 kysymystä kerrallaan:
   - Maantieteellinen alue (Suomi / Pohjoismaat / Eurooppa / globaali?)
   - Käyttötapaus (jatkuva valvonta / kertaluonteinen analyysi / automaattinen hälytin?)
   - Kriittisin tieto (mikä tieto on ehdottoman tärkeä?)
   - Hälytystarve (pitääkö Telegramiin lähettää ilmoituksia?)
   - Aikaikkuna (reaaliaikaisuus / historiatiedot / ennuste?)
3. PROAKTIIVISUUS: Ehdota aina konkreettisia vaihtoehtoja: "Haluatko A vai B?"
4. EHDOTUS: Tee kattava suositus kun tiedät riittävästi

MALLIVALINTA:
• gpt-4o — paras yleiskäyttöön ja monimutkaiseen analyysiin
• gpt-4o-mini — nopea, kustannustehokas, hälytyksiin
• gpt-4.1 — pitkä konteksti, isojen dokumenttien analyysiin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUOSITUKSEN MUOTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kun olet kerännyt riittävästi tietoa, kirjoita suosituksesi selkeästi suomeksi:
- Perustele jokainen työkalu
- Kirjoita ammattimainen, kattava systeemiprompt suomeksi
- Lisää AINA suosituksesi loppuun tämä JSON-blokki (muuta arvoja!):

```recommendation
{"ready":true,"agent":{"name":"AGENTIN NIMI","description":"KUVAUS","category":"KATEGORIA","tools":["työkalu1","työkalu2"],"model":"gpt-4o","system_prompt":"SYSTEEMIPROMPT TÄHÄN"}}
```

Vastaa AINA suomeksi. Ole proaktiivinen — älä odota käyttäjää, vaan johda konsultaatiota eteenpäin."""


class ConsultMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ConsultRequest(BaseModel):
    messages: list[ConsultMessage]
    aoi: dict | None = None  # GeoJSON Polygon geometry from map drawing


def _aoi_context(aoi: dict) -> str:
    """Format AOI GeoJSON into a human-readable context string for the AI."""
    try:
        coords = aoi.get("coordinates", [[]])[0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        center_lon = sum(lons) / len(lons)
        center_lat = sum(lats) / len(lats)
        return (
            f"\n\n📍 KÄYTTÄJÄ ON RAJANNUT ANALYYSI­ALUEEN KARTALTA:\n"
            f"• GeoJSON: {json.dumps(aoi)}\n"
            f"• Likimääräinen keskipiste: lat={center_lat:.4f}, lon={center_lon:.4f}\n"
            f"• Laajuus: lat {min(lats):.3f}–{max(lats):.3f}, lon {min(lons):.3f}–{max(lons):.3f}\n"
            f"\nSisällytä tämä AOI (aoi-kenttä) suositukseen. "
            f"Käytä koordinaatteja ({center_lat:.4f}, {center_lon:.4f}) agentin systeemipromptin "
            f"oletuslokaationa. Sopeudu alueeseen valitsemalla oikeat työkalut.\n"
        )
    except Exception:
        return f"\n\n📍 AOI määritelty: {json.dumps(aoi)}\n"


async def _stream_consultant(messages: list[dict], aoi: dict | None = None) -> AsyncIterator[str]:
    """Stream consultant response as SSE."""
    client = _get_client()

    # Inject AOI context into system prompt if provided
    system_content = CONSULTANT_SYSTEM_PROMPT
    if aoi:
        system_content += _aoi_context(aoi)

    full_messages = [{"role": "system", "content": system_content}] + messages

    try:
        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=full_messages,
            stream=True,
            temperature=0.7,
            max_tokens=2000,
        )

        buffer = ""
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                text = delta.content
                buffer += text

                # Check for completed recommendation block
                if "```recommendation" in buffer and "```" in buffer.split("```recommendation", 1)[1]:
                    before, rest = buffer.split("```recommendation", 1)
                    rec_content, after = rest.split("```", 1)
                    try:
                        rec_json = json.loads(rec_content.strip())
                        agent_rec = rec_json.get('agent', {})
                        # Inject AOI into recommendation if user drew one
                        if aoi and not agent_rec.get('aoi'):
                            agent_rec['aoi'] = aoi
                        if before.strip():
                            yield f"data: {json.dumps({'type': 'token', 'content': before})}\n\n"
                        # Emit the recommendation
                        yield f"data: {json.dumps({'type': 'recommendation', 'agent': agent_rec})}\n\n"
                        if after.strip():
                            yield f"data: {json.dumps({'type': 'token', 'content': after})}\n\n"
                        buffer = ""
                        continue
                    except json.JSONDecodeError:
                        pass  # Keep buffering

                # Emit text chunks (avoid buffering too much)
                if len(buffer) > 50 and "```recommendation" not in buffer:
                    yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
                    buffer = ""

        # Flush remaining buffer
        if buffer:
            yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"

        yield "data: {\"type\":\"done\"}\n\n"

    except Exception as e:
        logger.exception("Consultant stream error: %s", e)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.post("/consult")
async def consult(
    body: ConsultRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Stream AI consultant response for agent design."""
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    return StreamingResponse(
        _stream_consultant(messages, aoi=body.aoi),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
