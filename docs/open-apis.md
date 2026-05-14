# Anthene Agentic — Avoimet API-rajapinnat tilannekuvaan

> Tutkittu: 2026-05-14 | Lähde: automaattinen haku
> Tavoite: ilmaiset/avoimet APIit jotka tukevat kriittisen infrastruktuurin tilannekuvaa

---

## Yhteenvetotaulukko

| # | Nimi | Tarjoaja | Kattavuus | Auth | Formaatti | Relevanssi |
|---|---|---|---|---|---|---|
| 1 | FMI Open Data WFS | Ilmatieteen laitos | Suomi | Ei | WFS/XML/GeoJSON | **Korkea** |
| 2 | Fingrid Avoin Data | Fingrid | Suomi | API key | JSON | **Korkea** |
| 3 | STUK säteilyvalvonta | STUK | Suomi | Ei | JSON/XML | **Korkea** |
| 4 | SYKE hydrologiadata | SYKE | Suomi | Ei / API key | JSON, WFS/WMS | **Korkea** |
| 5 | Väylä liikennedata | Väylä | Suomi | vaihtelee | JSON, WFS/WMS | **Korkea** |
| 6 | Traficom avoin data | Traficom | Suomi | vaihtelee | JSON/XML | **Keski-Korkea** |
| 7 | Finavia lentotieto | Finavia | Suomen lentoasemat | Ei / ehdot | JSON/XML | **Keski** |
| 8 | Digiroad tieverkko | Väylä | Suomi | API key / ehdot | WFS/WMS | **Keski** |
| 9 | SMHI avoin data | SMHI | Ruotsi / Pohjoismaat | Ei | JSON/XML/WMS | **Korkea** |
| 10 | MET Norway API | MET Norway | Norja / globaali | Ei (User-Agent vaatimus) | JSON | **Korkea** |
| 11 | DMI avoin data | DMI | Tanska / Arktis | Osittain API key | JSON/WMS | **Korkea** |
| 12 | NVE tulvavaroitukset | NVE | Norja | Ei | JSON/WMS | **Korkea** |
| 13 | Nord Pool sähkömarkkinat | Nord Pool | Pohjoismaat / Baltia | Ei (julkinen) | JSON | **Korkea** |
| 14 | Kartverket geodata | Kartverket | Norja | Ei | WMS/WFS/JSON | **Keski** |
| 15 | ENTSO-E Transparency | ENTSO-E | Eurooppa | API key | XML/CSV | **Korkea** |
| 16 | ENTSOG kaasunsiirto | ENTSOG | Eurooppa | API key | XML | **Korkea** |
| 17 | GIE AGSI+ kaasuvarastot | GIE | Eurooppa | Ei | JSON | **Korkea** |
| 18 | Copernicus EMS | EC / CEMS | EU / globaali | Ei (julkiset kerrokset) | WMS/WFS/GeoJSON | **Korkea** |
| 19 | EFAS tulvaennusteet | JRC / Copernicus | Eurooppa | Ei | WMS/WFS | **Korkea** |
| 20 | EFFIS metsäpalot | JRC / Copernicus | Eurooppa | Ei | WMS/WFS | **Korkea** |
| 21 | GDACS katastrofivaroitukset | YK / OCHA / EU | Globaali | Ei | JSON/RSS/XML | **Korkea** |
| 22 | FIRMS aktiiviset palot | NASA | Globaali | Ei | GeoJSON/CSV/KML | **Korkea** |
| 23 | CAMS ilmanlaatu / päästöt | ECMWF / Copernicus | EU / globaali | Ei (useimmat) | WMS/NetCDF/JSON | **Korkea** |
| 24 | OpenSky Network ADS-B | OpenSky | Globaali | Vapaa tili / rajoitettu | JSON | **Korkea** |
| 25 | USGS maanjäristykset | USGS | Globaali | Ei | GeoJSON | **Korkea** |
| 26 | IAEA PRIS ydinvoimala | IAEA | Globaali | Ei | JSON/XML | **Keski** |
| 27 | OpenAQ ilmanlaatu | OpenAQ | Globaali | Ei / vapaa API key | JSON | **Keski-Korkea** |
| 28 | Cloudflare Radar | Cloudflare | Globaali | Ei (useimmat) | JSON/CSV | **Keski-Korkea** |
| 29 | RIPEstat / BGP | RIPE NCC | Globaali | Ei | JSON | **Keski-Korkea** |
| 30 | ReliefWeb API | OCHA | Globaali | Ei | JSON | **Keski** |
| 31 | WHO terveyshätätilat | WHO | Globaali | Ei | JSON/RSS | **Keski** |

---

## TOP 20 — Toteutusprioriteetti

### 🔴 Kriittinen — Toteuta ensin

| Prioriteetti | API | Miksi tärkeä |
|---|---|---|
| 1 | **FMI Open Data WFS** | Reaaliaikainen sää, tutka, ukkoset, varoitukset — kriittinen kenttäoperaatioille |
| 2 | **Fingrid Avoin Data** | Sähköverkon häiriöt, katkot — kriittinen infrastruktuuri |
| 3 | **STUK säteilyvalvonta** | Säteily-anomaliat reaaliajassa — turvallisuuskriittinen |
| 4 | **SYKE hydrologiadata** | Tulvat, vedenkorkeudet — reaaliaikainen tilannetietoisuus |
| 5 | **OpenSky Network** | Vapaasti käytettävä ADS-B — vaihtoehto ADS-B Exchangelle |
| 6 | **GDACS** | Globaalit katastrofivaroitukset JSON-muodossa — reaaliaikainen |
| 7 | **FIRMS** | NASA:n aktiiviset palot — parempi kattavuus kuin EFFIS yksin |
| 8 | **ENTSO-E Transparency** | Euroopan sähköverkko, tuotantokatkot — energiaturvallisuus |

### 🟡 Korkea — Toteuta toisessa vaiheessa

| Prioriteetti | API | Miksi tärkeä |
|---|---|---|
| 9 | **EFAS / EFFIS** | EU-tason tulva- ja paloenuste, WMS kartalle |
| 10 | **CAMS** | Ilmanlaatu, savun leviäminen — palo- ja teollisuushäiriöt |
| 11 | **GIE AGSI+** | Kaasun varastotasot — energiaturvallisuusindikaattori |
| 12 | **MET Norway** | Täysin ilmainen, laaja peittävyys — sää ja varoitukset |
| 13 | **SMHI** | Ruotsin sää, merdata, varoitukset |
| 14 | **NVE tulvavaroitukset** | Norjan tulva- ja maavyöryvaroitukset |
| 15 | **ENTSO-G / ENTSOG** | Euroopan kaasunsiirto, kapasiteetti, katkot |
| 16 | **Copernicus EMS** | Kriisikartat, WMS-kerrokset suoraan karttaan |

### 🟢 Keski — Toteuta kolmannessa vaiheessa

| Prioriteetti | API | Miksi tärkeä |
|---|---|---|
| 17 | **Väylä liikennedata** | Teiden sulkemiset, liikennehäiriöt |
| 18 | **Cloudflare Radar** | Kyberhyökkäykset, verkko-katkot — kybertilannetietoisuus |
| 19 | **RIPEstat / BGP** | BGP-reititysmuutokset — kyberturvallisuusindikaattori |
| 20 | **USGS maanjäristykset** | Seisminen aktiivisuus — infrastruktuurivaikutukset |

---

## Tekninen toteutus

### LangGraph Tool Hub -integraatiot (JSON APIs → suoraan tooliksi)

```python
# Nämä sopivat suoraan LangGraph @tool -wrappereiksi:
- Fingrid API        → sähköverkkodata
- OpenSky Network    → lentoliikenne (ADS-B)
- GDACS REST API     → katastrofivaroitukset
- FIRMS API          → aktiiviset palot
- ENTSO-E API        → sähköverkon tuotantokatkot
- GIE AGSI+          → kaasun varastotasot
- USGS Earthquake    → maanjäristykset
- OpenAQ             → ilmanlaatu
- Cloudflare Radar   → verkko-katkot
- RIPEstat           → BGP-reititykseen
- MET Norway         → sää
- STUK               → säteily
```

### Karttakerrokset (WMS/WFS → suoraan MapLibrelle)

```javascript
// Nämä voidaan lisätä suoraan karttanäkymiin:
- FMI WFS/WMS        → tutka, ukkoset, varoitukset
- SYKE WMS           → tulvakartat, vesistödata
- EFAS WMS           → EU-tulvaennuste
- EFFIS WMS          → palokuorma, aktiiviset palot
- CAMS WMS           → ilmanlaatu, savun leviäminen
- Copernicus EMS WMS → kriisikartat
- Väylä WMS          → tieliikenne
```

### Hälytysintegraatiot (reaaliaikainen polling → Telegram / alertit)

```python
# Näistä kannattaa tehdä automaattiset hälytykset:
- FMI varoitukset    → myrsky, tulva, pakkanen
- Fingrid katkot     → sähköverkon häiriöt
- STUK               → säteilypiikki
- GDACS              → uusi katastrofi
- FIRMS              → uusi paloalue
- OpenSky            → ilmatilan erikoistilanteet
```

---

## Endpointit (vahvistetut)

```
FMI WFS:        https://opendata.fmi.fi/wfs
Fingrid:        https://data.fingrid.fi/api/
STUK:           https://www.stuk.fi/web/en/topics/radiation-in-environment/radiation-monitoring-network
SYKE avoin:     https://avoin.ymparisto.fi/
Väylä/digitraffic: https://tie.digitraffic.fi/ ja https://meri.digitraffic.fi/
MET Norway:     https://api.met.no/weatherapi/
SMHI:           https://opendata.smhi.se/apidocs/
NVE Atlas:      https://atlas.nve.no/
ENTSO-E:        https://transparency.entsoe.eu/api
ENTSOG:         https://transparency.entsog.eu/api/v1/
GIE AGSI+:      https://agsi.gie.eu/api/
EFFIS:          https://maps.effis.emergency.copernicus.eu/gwis
CAMS:           https://ads.atmosphere.copernicus.eu/
GDACS:          https://www.gdacs.org/xml/rss.xml (RSS) + JSON API
FIRMS:          https://firms.modaps.eosdis.nasa.gov/api/
OpenSky:        https://opensky-network.org/api/states/all
USGS:           https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
OpenAQ:         https://api.openaq.org/v3/
Cloudflare Radar: https://radar.cloudflare.com/api/v4/
RIPEstat:       https://stat.ripe.net/data/
```

---

## Huomiot ja rajoitteet

| API | Rajoite / huomio |
|---|---|
| FMI | WFS-kyselyrakenne vaatii parametrisoinnin (StoredQuery) |
| Fingrid | API key haettava data.fingrid.fi:stä (ilmainen) |
| OpenSky | Anonyymi käyttö: 400 req/päivä; kirjautuneena enemmän |
| ENTSO-E | API key haettava (ilmainen rekisteröitymällä) |
| ENTSO-G | API key haettava |
| MET Norway | User-Agent header PAKOLLINEN tai API blokkaa |
| FIRMS | Ei vaadi kirjautumista MapKey:llä, tai hanki ilmainen key |
| CAMS | Osa palveluista vaatii Copernicus CDS -tilin (ilmainen) |

---

*Raportti tallennettu: `/Users/samisivonen/Desktop/anthene-agentic/docs/open-apis.md`*
