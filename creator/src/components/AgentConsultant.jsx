import React, { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { API_BASE, DEV_MODE } from '../config'

const AOIMap = lazy(() => import('./AOIMap'))

const SUPERAGENT_TOOLS = [
  "adsb_area","adsb_military","opensky_area","opensky_aircraft",
  "fmi_observations","fmi_warnings","weather_area",
  "effis_fires","firms_fires","gdacs_alerts",
  "fingrid_status","fingrid_disturbances","entsoe_load","entsoe_outages","gas_storage",
  "stuk_radiation","map_geocode","web_search","file_read","telegram_notify","calculator",
]

const SUPERAGENT_PROMPT = `Olet Anthene Superagentti — kattava tilannekuva-agentti jolla on käytössä kaikki 21 tietotyökalua.

Käytettävissäsi on data seuraavista lähteistä:
🛫 ILMAILU: ADS-B Exchange, OpenSky Network — live lentokoneet, sotilaskoneet
🌦 SÄÄ: FMI, Open-Meteo — reaaliaikaiset havainnot, varoitukset, globaali kattavuus  
🌿 YMPÄRISTÖ: EU EFFIS, NASA FIRMS — metsäpalot satelliittidatalla
🌋 KATASTROFIT: GDACS/YK — maanjäristykset, hirmumyrskyt, tulvat, tulivuoret
⚡ ENERGIA: Fingrid, ENTSO-E, GIE — sähköverkot, kaasun varastot, katkokset
☢️ SÄTEILY: STUK — säteilymittaukset koko Suomesta
📍 PAIKKATIEDOT: Azure Maps / Nominatim — geokoodaus
🔍 ANALYTIIKKA: Web-haku, tiedostoluku, laskin
📢 VIESTINTÄ: Telegram-ilmoitukset

Tehtäväsi:
1. Analysoi tilannekuvaa kokonaisvaltaisesti yhdistämällä useita datalähteitä
2. Etsi poikkeavuuksia, korrelaatioita ja merkityksellisiä yhteyksiä
3. Tarjoa proaktiivisesti lisätietoa — älä odota että sinua pyydetään
4. Hälytyksistä: kerro selkeästi kriittisyystaso (matala/kohtalainen/korkea/kriittinen)
5. Käytä Telegram-ilmoituksia vain kriittisiin hälytyksiin

Vastaa aina suomeksi. Ole tarkka, analyyttinen ja proaktiivinen.`

function ThinkingDots() {
  return (
    <span className="thinking-dots">
      <span>.</span><span>.</span><span>.</span>
    </span>
  )
}

function Message({ msg }) {
  return (
    <div className={`consult-msg consult-msg--${msg.role}`}>
      {msg.role === 'assistant' && <div className="consult-avatar">🤖</div>}
      <div className="consult-bubble">
        {msg.content.split('\n').map((line, i) => (
          <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
        ))}
      </div>
      {msg.role === 'user' && <div className="consult-avatar consult-avatar--user">👤</div>}
    </div>
  )
}

function AgentPreview({ agent, onAccept }) {
  if (!agent) return null
  const CATEGORY_LABELS = {
    aluevalvonta: '🗺️ Aluevalvonta', liikenne: '🚦 Liikenne & Logistiikka',
    ymparisto: '🌿 Ympäristö & Luonto', energia: '⚡ Energia & Kriittinen infra',
    turvallisuus: '🛡️ Turvallisuus & Pelastus', tiedustelu: '🔍 Tilannekuva & Analytiikka',
    halytin: '🔔 Hälytin & Automatisointi', superagenti: '🌐 Superagentti',
    yleinen: '⚙️ Yleinen',
  }
  return (
    <div className="agent-preview">
      <div className="agent-preview-header">
        <span className="agent-preview-badge">✨ Ehdotettu agentti</span>
      </div>
      <div className="agent-preview-name">{agent.name}</div>
      <div className="agent-preview-desc">{agent.description}</div>
      <div className="agent-preview-meta">
        <span className="preview-tag">{CATEGORY_LABELS[agent.category] || agent.category}</span>
        <span className="preview-tag">🤖 {agent.model}</span>
        <span className="preview-tag">🔧 {agent.tools?.length || 0} työkalua</span>
      </div>
      <div className="agent-preview-tools">
        {agent.tools?.map(t => <span key={t} className="preview-tool">{t}</span>)}
      </div>
      <div className="agent-preview-prompt">
        <div className="prompt-label">Systeemiprompt</div>
        <div className="prompt-text">{agent.system_prompt?.slice(0, 300)}{agent.system_prompt?.length > 300 ? '…' : ''}</div>
      </div>
      <button className="btn-accept" onClick={() => onAccept(agent)}>
        ✚ Luo tämä agentti
      </button>
    </div>
  )
}

export default function AgentConsultant({ getToken, onAccept, onSuperAgent }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Haluatko että sparrailen sinulle parhaan mahdollisen ratkaisun tarpeisiisi?',
    }
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [recommendation, setRecommendation] = useState(null)
  const [aoiPolygon, setAoiPolygon] = useState(null)
  const [showAoiMap, setShowAoiMap] = useState(false)
  const [started, setStarted] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking, showAoiMap])

  const handleAoiChange = (geojson) => {
    setAoiPolygon(geojson)
    if (geojson) {
      setShowAoiMap(false)
      // Compute approximate center for display
      const coords = geojson.coordinates[0]
      const lats = coords.map(c => c[1])
      const lons = coords.map(c => c[0])
      const clat = (Math.min(...lats) + Math.max(...lats)) / 2
      const clon = (Math.min(...lons) + Math.max(...lons)) / 2
      const areaMsg = `📍 Olen rajannut analyysi­alueen kartalta.\nKeskipiste: ${clat.toFixed(3)}°N, ${clon.toFixed(3)}°E | Pinta-ala arviolta ${Math.round(Math.abs(Math.max(...lats)-Math.min(...lats)) * Math.abs(Math.max(...lons)-Math.min(...lons)) * 111 * 111)} km²`
      const newMessages = [...messages, { role: 'user', content: areaMsg }]
      setMessages(newMessages)
      // Auto-send with AOI to AI
      sendToAI(newMessages, geojson)
    }
  }

  const sendToAI = async (msgs, aoi = aoiPolygon) => {
    setIsThinking(true)
    try {
      const token = await getToken()
      const payload = { messages: msgs }
      if (aoi) payload.aoi = aoi
      const resp = await fetch(`${API_BASE}/api/consult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      setIsThinking(false)
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data) continue
          try {
            const event = JSON.parse(data)
            if (event.type === 'token') {
              assistantContent += event.content
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
                return updated
              })
            } else if (event.type === 'recommendation') {
              setRecommendation(event.agent)
            }
          } catch {}
        }
      }
    } catch (e) {
      setIsThinking(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Virhe: ${e.message}` }])
    }
    inputRef.current?.focus()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    setStarted(true)
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    await sendToAI(newMessages)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const handleStart = async (answer) => {
    setStarted(true)
    const newMessages = [...messages, { role: 'user', content: answer }]
    setMessages(newMessages)
    await sendToAI(newMessages)
  }

  return (
    <div className="consult-layout">
      <div className="consult-chat">
        <div className="consult-header">
          <span className="consult-header-icon">🧠</span>
          <div>
            <div className="consult-header-title">AI-agenttikonsultti</div>
            <div className="consult-header-sub">Thinking mode — löytää parhaan ratkaisun kysymällä</div>
          </div>
        </div>

        <div className="consult-messages">
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {isThinking && (
            <div className="consult-msg consult-msg--assistant">
              <div className="consult-avatar">🤖</div>
              <div className="consult-bubble consult-bubble--thinking">
                Ajattelee<ThinkingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="consult-input-row">
          <textarea
            ref={inputRef}
            className="consult-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Kirjoita viesti… (Enter lähettää, Shift+Enter uusi rivi)"
            rows={2}
            disabled={isThinking}
          />
          <button className="consult-send" onClick={send} disabled={isThinking || !input.trim()}>
            {isThinking ? '⏳' : '➤'}
          </button>
        </div>

        {!started && (
          <div className="consult-quick-actions">
            <button className="quick-chip quick-chip--yes" onClick={() => handleStart('Kyllä')}>
              👍 Kyllä, sparraillaan!
            </button>
            <button className="quick-chip quick-chip--aoi" onClick={() => { setStarted(true); setShowAoiMap(true) }}>
              📍 Kyllä, ja rajaan alueen kartalta
            </button>
          </div>
        )}

        {started && !showAoiMap && (
          <div className="consult-quick-actions">
            <button className="quick-chip quick-chip--aoi" onClick={() => setShowAoiMap(v => !v)}>
              📍 {aoiPolygon ? '✔ Alue rajattu — muokkaa' : 'Rajaa alue kartalta'}
            </button>
            {aoiPolygon && (
              <button className="quick-chip quick-chip--clear" onClick={() => { setAoiPolygon(null) }}>
                ✕ Poista rajaus
              </button>
            )}
          </div>
        )}

        {showAoiMap && (
          <div className="consult-aoi-panel">
            <div className="consult-aoi-header">
              <span>📍 Rajaa analyysi­alue kartalta</span>
              <button className="aoi-close" onClick={() => setShowAoiMap(false)}>✕</button>
            </div>
            <Suspense fallback={<div className="aoi-loading">Ladataan karttaa…</div>}>
              <AOIMap value={aoiPolygon} onChange={handleAoiChange} />
            </Suspense>
          </div>
        )}
      </div>

      <div className="consult-sidebar">
        {recommendation ? (
          <AgentPreview agent={recommendation} onAccept={onAccept} />
        ) : (
          <div className="consult-sidebar-empty">
            <div className="sidebar-empty-icon">💡</div>
            <div className="sidebar-empty-title">Suositus näkyy tässä</div>
            <div className="sidebar-empty-text">
              Kerro konsultille tarpeistasi — muutaman kysymyksen jälkeen se rakentaa sinulle täydellisen agenttikonfiguraation.
            </div>
            <div className="sidebar-separator">tai aloita suoraan</div>
            <button className="btn-superagent" onClick={onSuperAgent}>
              🌐 Luo Superagentti
              <span className="superagent-sub">Kaikki 21 työkalua käytössä</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export { SUPERAGENT_TOOLS, SUPERAGENT_PROMPT }
