import React, { useState, useRef, useEffect } from 'react'
import LocationPickerModal from './LocationPickerModal'
import AgentMapPanel from './AgentMapPanel'

const MAP_TOOLS = new Set([
  'adsb_area','adsb_military','adsb_emergency',
  'adsb_by_registration','adsb_by_callsign','adsb_by_squawk','adsb_by_type',
  'aircraft_trail','aircraft_detail',
  'opensky_area','opensky_aircraft',
  'weather_area','fmi_observations','fmi_warnings','fmi_lightning',
  'effis_fires','firms_fires',
  'vessels_area','vessels_bbox','vessel_detail',
  'stuk_radiation','gdacs_alerts',
  'map_geocode','detect_clusters','correlate_events',
])

export default function TestChat({ agent, onRun }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const [showMap, setShowMap] = useState(false)
  const [toolResults, setToolResults] = useState([])
  const [localAoi, setLocalAoi] = useState(null)
  const pendingToolInputs = useRef({})
  const bottomRef = useRef(null)

  const effectiveAoi = localAoi || agent?.aoi || null
  const isMapBound = effectiveAoi || agent?.tools?.some(t => MAP_TOOLS.has(t))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setStreaming(true)

    let aiContent = ''
    setMessages(m => [...m, { role: 'assistant', content: '', streaming: true }])

    onRun(
      userMsg,
      effectiveAoi,
      // onToken
      (token) => {
        aiContent += token
        setMessages(m => m.map((msg, i) =>
          i === m.length - 1 ? { ...msg, content: aiContent } : msg
        ))
      },
      // onToolStart
      (tool, input) => {
        pendingToolInputs.current[tool] = input
        setActiveTools(t => [...t, { tool, status: 'running', input }])
      },
      // onToolEnd
      (tool, output) => {
        const savedInput = pendingToolInputs.current[tool] || {}
        delete pendingToolInputs.current[tool]
        setToolResults(prev => [...prev, { tool, input: savedInput, output, timestamp: Date.now() }])
        setActiveTools(t => t.map(a => a.tool === tool ? { ...a, status: 'done' } : a))
      },
      // onDone
      () => {
        setStreaming(false)
        setMessages(m => m.map((msg, i) =>
          i === m.length - 1 ? { ...msg, streaming: false } : msg
        ))
        setActiveTools([])
      },
      // onError
      (err) => {
        setStreaming(false)
        const HTTP_MEANINGS = {
          '400': 'Virheellinen pyyntö — tarkista parametrit',
          '401': 'Ei autentikoitu — API-avain puuttuu tai on virheellinen',
          '403': 'Ei käyttöoikeutta — suunnitelma tai avain ei tue tätä toimintoa',
          '404': 'Ei löydy — resurssia tai endpointtia ei ole',
          '408': 'Aikakatkaisu — palvelu ei vastannut ajoissa',
          '429': 'Liian monta pyyntöä — odota hetki ja yritä uudelleen',
          '500': 'Palvelinvirhe — työkalu kaatui odottamattomasti',
          '502': 'Yhdyskäytävävirhe — välityspalvelin sai virhevastauksen',
          '503': 'Palvelu ei käytettävissä — kokeile myöhemmin uudelleen',
          '504': 'Yhdyskäytävän aikakatkaisu — palvelu ei vastannut',
        }
        const codeMatch = String(err).match(/\b([45]\d{2})\b/)
        const code = codeMatch?.[1]
        const meaning = code ? HTTP_MEANINGS[code] : null
        const display = meaning
          ? `Virhe ${code}: ${meaning}`
          : `Virhe: ${err}`
        setMessages(m => [...m.filter(x => !x.streaming),
          { role: 'error', content: display }])
        setActiveTools([])
      },
    )
  }

  return (
    <div className="test-chat" style={isMapBound ? { display: 'flex', flexDirection: 'row', height: 600, minHeight: 520 } : {}}>

      {/* Map panel — left side when map-bound */}
      {isMapBound && (
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #1e3a5f' }}>
          <AgentMapPanel agent={agent} toolResults={toolResults} onAoiChange={setLocalAoi} />
        </div>
      )}

      {/* Chat panel */}
      <div style={isMapBound ? { width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column' } : { display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="test-chat-header">
          <span>🧪 Testaa: <strong>{agent?.name || 'Agentti'}</strong></span>
          {agent?.tools?.length > 0 && (
            <span className="tools-badge">{agent.tools.length} työkalua</span>
          )}
          {isMapBound && <span style={{ fontSize: '.7rem', background: '#7c6fcd20', border: '1px solid #7c6fcd40', borderRadius: 20, padding: '2px 8px', color: '#a29ae0' }}>🗺️</span>}
        </div>

        <div className="test-chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
          {messages.length === 0 && (
            <div className="test-chat-empty">Kirjoita viesti testataksesi agenttia…</div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
              <span className="chat-role">{msg.role === 'user' ? '👤' : msg.role === 'error' ? '❌' : '🤖'}</span>
              <span className="chat-content">
                {msg.content}
                {msg.streaming && <span className="blink">▌</span>}
              </span>
            </div>
          ))}
          {activeTools.map((t, i) => (
            <div key={i} className="tool-indicator">
              {t.status === 'running' ? '⚙️' : '✅'} <code>{t.tool}</code>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="test-chat-input">
          <button
            className="map-pick-btn"
            onClick={() => setShowMap(true)}
            title="Valitse sijainti kartalta"
            disabled={streaming}
          >📍</button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Kirjoita viesti tai valitse sijainti kartalta…"
            disabled={streaming}
          />
          <button onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </div>

      {showMap && (
        <LocationPickerModal
          onConfirm={(locationText) => {
            setInput(prev => prev ? `${locationText} — ${prev}` : locationText)
            setShowMap(false)
          }}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  )
}
