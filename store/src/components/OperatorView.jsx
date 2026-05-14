import React, { useState, useRef, useEffect } from 'react'

const CATEGORY_ICONS = {
  aluevalvonta: '🗺️', liikenne: '🚦', ymparisto: '🌿', energia: '⚡',
  turvallisuus: '🛡️', tiedustelu: '🔍', halytin: '🔔', superagenti: '🌐', yleinen: '⚙️',
}

function OperatorChat({ agent, onRun, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
      (token) => {
        aiContent += token
        setMessages(m => m.map((msg, i) => i === m.length - 1 ? { ...msg, content: aiContent } : msg))
      },
      (tool, inp) => setActiveTools(t => [...t, { tool, status: 'running', input: inp }]),
      (tool) => setActiveTools(t => t.map(a => a.tool === tool ? { ...a, status: 'done' } : a)),
      () => {
        setStreaming(false)
        setMessages(m => m.map((msg, i) => i === m.length - 1 ? { ...msg, streaming: false } : msg))
        setActiveTools([])
      },
      (err) => {
        setStreaming(false)
        setMessages(m => [...m.filter(x => !x.streaming), { role: 'error', content: `Virhe: ${err}` }])
        setActiveTools([])
      },
    )
  }

  return (
    <div className="op-chat-panel">
      <div className="op-chat-header">
        <div className="op-chat-title">
          <span className="op-chat-icon">{CATEGORY_ICONS[agent.category] || '🤖'}</span>
          <div>
            <div className="op-chat-name">{agent.name}</div>
            <div className="op-chat-meta">🧠 {agent.model} · 🔧 {agent.tools?.length || 0} työkalua</div>
          </div>
        </div>
        <button className="op-chat-close" onClick={onClose}>✕</button>
      </div>

      <div className="op-chat-messages">
        {messages.length === 0 && (
          <div className="op-chat-empty">
            <div className="op-empty-icon">{CATEGORY_ICONS[agent.category] || '🤖'}</div>
            <div className="op-empty-name">{agent.name}</div>
            {agent.description && <div className="op-empty-desc">{agent.description}</div>}
            <div className="op-empty-hint">Kirjoita kysymys alla olevaan kenttään</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`op-msg op-msg-${msg.role}`}>
            <span className="op-msg-role">{msg.role === 'user' ? '👤' : msg.role === 'error' ? '❌' : '🤖'}</span>
            <span className="op-msg-content">
              {msg.content}
              {msg.streaming && <span className="blink">▌</span>}
            </span>
          </div>
        ))}
        {activeTools.map((t, i) => (
          <div key={i} className="op-tool-indicator">
            {t.status === 'running' ? <span className="op-tool-spin">⚙️</span> : '✅'} <code>{t.tool}</code>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="op-chat-input-row">
        <input
          className="op-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Kysy ${agent.name}:lta…`}
          disabled={streaming}
        />
        <button className="op-chat-send" onClick={send} disabled={streaming || !input.trim()}>
          {streaming ? <span className="op-dots"><span/><span/><span/></span> : '↑'}
        </button>
      </div>
    </div>
  )
}

// Slide-in panel: manage which agents are pinned
function ConfigPanel({ allAgents, pinnedIds, onToggle, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = allAgents.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <>
      <div className="op-config-backdrop" onClick={onClose} />
      <aside className="op-config-panel">
        <div className="op-config-header">
          <h2>📌 Konfiguroi Operaattori-näkymä</h2>
          <button className="op-config-close" onClick={onClose}>✕</button>
        </div>
        <p className="op-config-hint">Valitse agentit jotka näkyvät aina Operaattori-näkymässä. Pinnattuja: <strong>{pinnedIds.length}</strong></p>
        <input
          className="op-config-search"
          placeholder="🔍 Hae agentteja…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="op-config-list">
          {filtered.length === 0 && <div className="op-config-empty">Ei agentteja{search ? ' hakuehdoilla' : ''}</div>}
          {filtered.map(a => {
            const pinned = pinnedIds.includes(a.id)
            return (
              <div key={a.id} className={`op-config-item ${pinned ? 'pinned' : ''}`}>
                <div className="op-config-item-info">
                  <span className="op-config-cat-icon">{CATEGORY_ICONS[a.category] || '⚙️'}</span>
                  <div>
                    <div className="op-config-item-name">{a.name}</div>
                    <div className="op-config-item-meta">🧠 {a.model} · 🔧 {a.tools?.length || 0} · {a.visibility === 'shared' ? '🌐' : '🔒'}</div>
                  </div>
                </div>
                <button
                  className={`op-toggle-btn ${pinned ? 'on' : 'off'}`}
                  onClick={() => onToggle(a.id)}
                >
                  {pinned ? '📌 Pinnattu' : '+ Lisää'}
                </button>
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}

export default function OperatorView({ myAgents, storeAgents, operatorPins, onPinToggle, onRun }) {
  const [activeAgent, setActiveAgent] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)

  // All available agents (own + shared, deduped)
  const allAvailable = [
    ...myAgents,
    ...storeAgents.filter(s => !myAgents.find(m => m.id === s.id)),
  ]
  const pinnedAgents = allAvailable.filter(a => operatorPins.includes(a.id))

  const handleRun = (agent) => {
    setActiveAgent(agent)
  }

  return (
    <div className="operator-view">
      {/* Header bar */}
      <div className="op-view-header">
        <div className="op-view-title">
          <span className="op-view-icon">🖥️</span>
          <div>
            <div className="op-view-name">Operaattori-näkymä</div>
            <div className="op-view-sub">{pinnedAgents.length} agenttia käytössä</div>
          </div>
        </div>
        <button className="op-config-btn" onClick={() => setConfigOpen(true)}>
          ⚙️ Konfiguroi näkymä
        </button>
      </div>

      {/* Main workspace */}
      <div className={`op-workspace ${activeAgent ? 'with-chat' : ''}`}>

        {/* Agent tiles */}
        <div className="op-tiles-panel">
          {pinnedAgents.length === 0 ? (
            <div className="op-empty-state">
              <div className="op-empty-state-icon">📌</div>
              <h3>Ei pinnattuja agentteja</h3>
              <p>Lisää agentteja klikkaamalla "Konfiguroi näkymä" tai käytä agenttikortissa olevaa 📌-nappia Creator- tai Store-näkymässä.</p>
              <button className="btn-primary" onClick={() => setConfigOpen(true)}>
                ⚙️ Konfiguroi näkymä
              </button>
            </div>
          ) : (
            <div className="op-tiles-grid">
              {pinnedAgents.map(a => (
                <div
                  key={a.id}
                  className={`op-tile ${activeAgent?.id === a.id ? 'active' : ''}`}
                  onClick={() => setActiveAgent(activeAgent?.id === a.id ? null : a)}
                >
                  <div className="op-tile-top">
                    <span className="op-tile-icon">{CATEGORY_ICONS[a.category] || '⚙️'}</span>
                    <div className="op-tile-right">
                      <button
                        className="op-tile-pin-remove"
                        onClick={(e) => { e.stopPropagation(); onPinToggle(a.id) }}
                        title="Poista näkymästä"
                      >✕</button>
                    </div>
                  </div>
                  <div className="op-tile-name">{a.name}</div>
                  <div className="op-tile-meta">
                    <span>🧠 {a.model}</span>
                    <span>🔧 {a.tools?.length || 0}</span>
                    <span className={`op-vis ${a.visibility}`}>{a.visibility === 'shared' ? '🌐' : '🔒'}</span>
                  </div>
                  {a.description && <div className="op-tile-desc">{a.description}</div>}
                  <button
                    className="op-tile-run-btn"
                    onClick={(e) => { e.stopPropagation(); setActiveAgent(a) }}
                  >
                    ▶ Käynnistä
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat panel */}
        {activeAgent && (
          <OperatorChat
            agent={activeAgent}
            onRun={onRun(activeAgent)}
            onClose={() => setActiveAgent(null)}
          />
        )}
      </div>

      {/* Config panel */}
      {configOpen && (
        <ConfigPanel
          allAgents={allAvailable}
          pinnedIds={operatorPins}
          onToggle={onPinToggle}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
