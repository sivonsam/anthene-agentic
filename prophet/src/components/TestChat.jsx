import React, { useState, useRef, useEffect } from 'react'
import LocationPickerModal from './LocationPickerModal'
import AgentMapPanel from './AgentMapPanel'

const MAP_TOOLS = new Set([
  'adsb_area','adsb_trail','adsb_flight','adsb_military',
  'weather_area','fmi_observations','fmi_warnings',
  'effis_fires','effis_risk',
  'nasa_firms_viirs','nasa_firms_modis',
  'ais_area','ais_vessel','ais_trail',
  'stuk_radiation','stuk_stations',
  'gdacs','map_geocode'
])

export default function TestChat({ agent, onRun }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const [showMap, setShowMap] = useState(false)
  const [toolResults, setToolResults] = useState([])
  const pendingToolInputs = useRef({})
  const bottomRef = useRef(null)

  const isMapBound = agent?.aoi || agent?.tools?.some(t => MAP_TOOLS.has(t))

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
        setMessages(m => [...m.filter(x => !x.streaming),
          { role: 'error', content: `Virhe: ${err}` }])
        setActiveTools([])
      },
    )
  }

  return (
    <div className="test-chat" style={isMapBound ? { display: 'flex', flexDirection: 'row', height: '100%' } : {}}>

      {/* Map panel — left side when map-bound */}
      {isMapBound && (
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #1e3a5f' }}>
          <AgentMapPanel agent={agent} toolResults={toolResults} />
        </div>
      )}

      {/* Chat panel */}
      <div style={isMapBound ? { width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column' } : { display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="test-chat-header">
          <span>🧪 Testaa: <strong>{agent?.name || 'Uusi agentti'}</strong></span>
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
