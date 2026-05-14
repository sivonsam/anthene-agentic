import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest, DEV_MODE } from './config'
import { createApiClient } from './api'
import AgentCard from './components/AgentCard'
import TestChat from './components/TestChat'
import './App.css'

// ── localStorage helpers ──────────────────────────────────────────────────────
const PINS_KEY = 'anthene_prophet_pins'
const SESSIONS_KEY = 'anthene_prophet_sessions'

function loadPins() {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '[]') } catch { return [] }
}
function savePins(pins) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins))
}
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]') } catch { return [] }
}
function saveSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 20)))
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60_000) return 'juuri nyt'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min sitten`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h sitten`
  return d.toLocaleDateString('fi-FI')
}

function statusLabel(status) {
  if (status === 'running') return { label: 'Käynnissä', cls: 'status-running' }
  if (status === 'completed') return { label: 'Valmis', cls: 'status-done' }
  if (status === 'failed') return { label: 'Virhe', cls: 'status-failed' }
  return { label: 'Odottaa', cls: 'status-pending' }
}

// ── Root App — decides DEV vs MSAL mode ─────────────────────────────────────
export default function App() {
  if (DEV_MODE) {
    const devUser = { name: 'Dev User', id: 'dev-user-1', email: 'dev@anthene.ai' }
    const getToken = () => Promise.resolve('dev-token')
    return <Prophet user={devUser} getToken={getToken} onLogout={null} />
  }
  return <MsalGate />
}

// Only rendered inside <MsalProvider>
function MsalGate() {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()

  const handleLogin = () => instance.loginPopup(loginRequest).catch(() => {})
  const handleLogout = () => instance.logoutPopup().catch(() => {})

  const getToken = useCallback(async () => {
    const resp = await instance.acquireTokenSilent({ ...loginRequest, account: accounts[0] })
    return resp.accessToken
  }, [instance, accounts])

  if (!isAuthenticated) {
    return (
      <div className="login-wall">
        <div className="login-card">
          <span className="login-hex">⬡</span>
          <h1>Anthene Agent Prophet</h1>
          <p>Operationaalinen kojelauta omille agenteillesi.<br />Kirjaudu sisään jatkaaksesi.</p>
          <button className="btn-primary btn-lg" onClick={handleLogin}>Kirjaudu sisään</button>
        </div>
      </div>
    )
  }

  const user = {
    name: accounts[0]?.name || 'Käyttäjä',
    id: accounts[0]?.localAccountId || 'user',
    email: accounts[0]?.username || '',
  }

  return <Prophet user={user} getToken={getToken} onLogout={handleLogout} />
}

// ── Main Prophet dashboard ───────────────────────────────────────────────────
function Prophet({ user, getToken, onLogout }) {
  const [view, setView] = useState('dashboard')
  const [agents, setAgents] = useState([])
  const [storeAgents, setStoreAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pinnedIds, setPinnedIds] = useState(loadPins)
  const [sessions, setSessions] = useState(loadSessions)
  const [activeAgent, setActiveAgent] = useState(null)
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sessionKey, setSessionKey] = useState(0) // remount TestChat on new session

  const api = createApiClient(getToken)

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAgents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [myAgents, storeList] = await Promise.all([
        api.listMyAgents(),
        api.listStoreAgents(),
      ])
      setAgents(myAgents)
      setStoreAgents(storeList)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAgents() }, [])

  // ── Session helpers ─────────────────────────────────────────────────────────
  const createSessionId = (agentId) =>
    `prophet:${user.id}:${agentId}:${Date.now()}`

  const upsertSession = (session) => {
    setSessions(prev => {
      const without = prev.filter(s => s.id !== session.id)
      const updated = [session, ...without]
      saveSessions(updated)
      return updated
    })
  }

  const updateSessionStatus = (sessionId, status) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === sessionId ? { ...s, status } : s)
      saveSessions(updated)
      return updated
    })
  }

  // ── Launch / continue session ───────────────────────────────────────────────
  const launchAgent = (agent, existingSessionId = null) => {
    const sessionId = existingSessionId || createSessionId(agent.id)
    if (!existingSessionId) {
      upsertSession({
        id: sessionId,
        agentId: agent.id,
        agentName: agent.name,
        startedAt: new Date().toISOString(),
        status: 'running',
      })
    } else {
      updateSessionStatus(sessionId, 'running')
    }
    setActiveAgent(agent)
    setActiveSessionId(sessionId)
    setSessionKey(k => k + 1)
    setView('sessio')
    setSidebarCollapsed(true)
  }

  const continueSession = (session) => {
    const agent =
      agents.find(a => a.id === session.agentId) ||
      storeAgents.find(a => a.id === session.agentId)
    if (!agent) {
      setError('Agentin tietoja ei löydy. Lataa sivu uudelleen.')
      return
    }
    launchAgent(agent, session.id)
  }

  const closeSession = () => {
    setActiveAgent(null)
    setActiveSessionId(null)
    setSidebarCollapsed(false)
    setView('sessiot')
  }

  // ── Pin helpers ─────────────────────────────────────────────────────────────
  const togglePin = (agentId) => {
    setPinnedIds(prev => {
      const updated = prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
      savePins(updated)
      return updated
    })
  }

  // ── onRun factory for TestChat ──────────────────────────────────────────────
  const makeOnRun = (agent, sessionId) =>
    (message, onToken, onToolStart, onToolEnd, onDone, onError) => {
      api.runAgentStream(
        agent.id,
        message,
        sessionId,
        onToken,
        onToolStart,
        onToolEnd,
        (runId) => {
          updateSessionStatus(sessionId, 'completed')
          onDone?.(runId)
        },
        (err) => {
          updateSessionStatus(sessionId, 'failed')
          onError?.(err)
        },
        getToken,
      )
    }

  // ── Derived data ────────────────────────────────────────────────────────────
  const allAgentMap = [...agents, ...storeAgents].reduce((m, a) => { m[a.id] = a; return m }, {})
  const pinnedAgents = pinnedIds.map(id => allAgentMap[id]).filter(Boolean)
  const ownPlusCopied = [
    ...agents,
    ...storeAgents.filter(sa => !agents.find(a => a.id === sa.id)),
  ]
  const recentSessions = sessions.slice(0, 5)

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const breadcrumb = (() => {
    const parts = ['Prophet']
    if (view === 'dashboard') parts.push('Dashboard')
    else if (view === 'agentit') parts.push('Agentit')
    else if (view === 'sessiot') parts.push('Sessiot')
    else if (view === 'sessio' && activeAgent) {
      parts.push('Agentit', activeAgent.name, `Sessio ${activeSessionId?.slice(-8) || ''}`)
    }
    return parts
  })()

  const navTo = (v) => {
    if (v !== 'sessio') {
      setSidebarCollapsed(false)
    }
    setView(v)
  }

  return (
    <div className={`prophet-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-hex">⬡</span>
          {!sidebarCollapsed && (
            <div className="brand-text">
              <span className="brand-name">Anthene</span>
              <span className="brand-sub">Agent Prophet</span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {[
            { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
            { id: 'agentit',   icon: '🤖', label: 'Agentit' },
            { id: 'sessiot',   icon: '📋', label: 'Sessiot' },
          ].map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navTo(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
            </button>
          ))}
        </nav>

        {!sidebarCollapsed && pinnedAgents.length > 0 && (
          <div className="sidebar-pins">
            <div className="sidebar-section-title">📌 Kiinnitetyt</div>
            {pinnedAgents.map(agent => (
              <button
                key={agent.id}
                className="pinned-agent-btn"
                onClick={() => launchAgent(agent)}
                title={agent.name}
              >
                <span className="pinned-dot" style={{ background: categoryColor(agent.category) }} />
                <span className="pinned-name">{agent.name}</span>
                <span className="pinned-launch">▶</span>
              </button>
            ))}
          </div>
        )}

        {sidebarCollapsed && pinnedAgents.length > 0 && (
          <div className="sidebar-pins-icons">
            {pinnedAgents.map(agent => (
              <button
                key={agent.id}
                className="pinned-icon-btn"
                onClick={() => launchAgent(agent)}
                title={agent.name}
              >
                <span className="pinned-dot" style={{ background: categoryColor(agent.category) }} />
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-footer">
          {sidebarCollapsed ? (
            <button className="sidebar-expand-btn" onClick={() => setSidebarCollapsed(false)} title="Laajenna">
              ›
            </button>
          ) : (
            <div className="sidebar-user">
              <span className="sidebar-user-name">👤 {user.name}</span>
              {onLogout && (
                <button className="btn-logout-sm" onClick={onLogout} title="Kirjaudu ulos">↩</button>
              )}
              {DEV_MODE && <span className="dev-badge">DEV</span>}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="main-area">
        {/* Header */}
        <header className="prophet-header">
          <div className="breadcrumb">
            {breadcrumb.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="breadcrumb-sep">›</span>}
                <span className={`breadcrumb-part ${i === breadcrumb.length - 1 ? 'active' : ''}`}>
                  {part}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="header-right">
            {view === 'sessio' && activeAgent && (
              <div className="session-id-badge">
                Sessio: <code>{activeSessionId?.slice(-12)}</code>
              </div>
            )}
            {!sidebarCollapsed ? null : (
              <button className="btn-icon" onClick={() => setSidebarCollapsed(false)} title="Avaa navigaatio">
                ☰
              </button>
            )}
            {view !== 'sessio' && !DEV_MODE && onLogout && (
              <span className="header-user-name">{user.name}</span>
            )}
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="error-banner">
            ⚠️ {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Views */}
        <div className={`view-container ${view === 'sessio' ? 'view-fullscreen' : ''}`}>

          {/* ── Dashboard ─────────────────────────────────────────────────── */}
          {view === 'dashboard' && (
            <DashboardView
              user={user}
              agents={agents}
              pinnedAgents={pinnedAgents}
              recentSessions={recentSessions}
              loading={loading}
              onLaunch={launchAgent}
              onContinue={continueSession}
              onGoAgentit={() => navTo('agentit')}
              onGoSessiot={() => navTo('sessiot')}
            />
          )}

          {/* ── Agentit ───────────────────────────────────────────────────── */}
          {view === 'agentit' && (
            <AgentitView
              agents={agents}
              storeAgents={storeAgents}
              ownPlusCopied={ownPlusCopied}
              pinnedIds={pinnedIds}
              loading={loading}
              onLaunch={launchAgent}
              onTogglePin={togglePin}
            />
          )}

          {/* ── Sessiot ───────────────────────────────────────────────────── */}
          {view === 'sessiot' && (
            <SessiotView
              sessions={sessions}
              allAgentMap={allAgentMap}
              onContinue={continueSession}
              onLaunchNew={() => navTo('agentit')}
            />
          )}

          {/* ── Aktiivinen sessio ─────────────────────────────────────────── */}
          {view === 'sessio' && activeAgent && (
            <AktiivisenSessioView
              key={sessionKey}
              agent={activeAgent}
              sessionId={activeSessionId}
              onRun={makeOnRun(activeAgent, activeSessionId)}
              onClose={closeSession}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Category colour helper ────────────────────────────────────────────────────
function categoryColor(cat) {
  return {
    security: '#ef4444',
    environmental: '#22c55e',
    logistics: '#3b82f6',
    intelligence: '#a855f7',
    custom: '#6b7280',
  }[cat] || '#6b7280'
}

// ── Dashboard view ────────────────────────────────────────────────────────────
function DashboardView({ user, agents, pinnedAgents, recentSessions, loading, onLaunch, onContinue, onGoAgentit, onGoSessiot }) {
  return (
    <div className="view dashboard-view">
      <div className="dashboard-greeting">
        <h2>Hei, {user.name.split(' ')[0]} 👋</h2>
        <p className="text-muted">Operationaalinen kojelauta — käynnistä tai jatka agenttisessioita.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{agents.length}</div>
          <div className="stat-label">Agentit</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pinnedAgents.length}</div>
          <div className="stat-label">Kiinnitetyt</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recentSessions.length}</div>
          <div className="stat-label">Viimeisimmät sessiot</div>
        </div>
        <div className="stat-card stat-cta" onClick={onGoAgentit}>
          <div className="stat-value">▶</div>
          <div className="stat-label">Käynnistä uusi</div>
        </div>
      </div>

      {pinnedAgents.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header">
            <h3>📌 Kiinnitetyt agentit</h3>
          </div>
          <div className="quick-launch-grid">
            {pinnedAgents.map(agent => (
              <QuickLaunchCard key={agent.id} agent={agent} onLaunch={onLaunch} />
            ))}
          </div>
        </section>
      )}

      {pinnedAgents.length === 0 && !loading && (
        <div className="empty-pins-hint">
          <span>💡</span>
          <span>Kiinnitä agentteja Agentit-näkymästä nähdäksesi ne tässä pikakäynnistyksessä.</span>
          <button className="btn-link" onClick={onGoAgentit}>Selaa agentteja →</button>
        </div>
      )}

      {recentSessions.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header">
            <h3>🕐 Viimeisimmät sessiot</h3>
            <button className="btn-link" onClick={onGoSessiot}>Kaikki sessiot →</button>
          </div>
          <div className="sessions-mini-list">
            {recentSessions.map(session => {
              const st = statusLabel(session.status)
              return (
                <div key={session.id} className="session-mini-row">
                  <div className="session-mini-info">
                    <span className="session-agent-name">{session.agentName}</span>
                    <span className="session-time">{fmtTime(session.startedAt)}</span>
                  </div>
                  <span className={`status-badge ${st.cls}`}>{st.label}</span>
                  <button className="btn-continue-sm" onClick={() => onContinue(session)}>
                    Jatka ▶
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {loading && <div className="spinner">Ladataan agentteja…</div>}
    </div>
  )
}

function QuickLaunchCard({ agent, onLaunch }) {
  return (
    <div className="quick-launch-card" onClick={() => onLaunch(agent)}>
      <div className="qlc-dot" style={{ background: categoryColor(agent.category) }} />
      <div className="qlc-info">
        <div className="qlc-name">{agent.name}</div>
        {agent.description && (
          <div className="qlc-desc">{agent.description.slice(0, 60)}{agent.description.length > 60 ? '…' : ''}</div>
        )}
      </div>
      <button className="qlc-launch-btn" title="Käynnistä">▶</button>
    </div>
  )
}

// ── Agentit view ──────────────────────────────────────────────────────────────
function AgentitView({ agents, storeAgents, ownPlusCopied, pinnedIds, loading, onLaunch, onTogglePin }) {
  const [search, setSearch] = useState('')

  const filtered = ownPlusCopied.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description?.toLowerCase().includes(search.toLowerCase())
  )
  const myFiltered = filtered.filter(a => agents.find(x => x.id === a.id))
  const storeFiltered = filtered.filter(a => !agents.find(x => x.id === a.id))

  return (
    <div className="view agentit-view">
      <div className="view-toolbar">
        <h2>🤖 Agentit <span className="count-badge">{ownPlusCopied.length}</span></h2>
        <input
          className="search-input"
          placeholder="🔍 Hae agentista…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="spinner">Ladataan…</div>}

      {!loading && myFiltered.length === 0 && storeFiltered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <h3>Ei agentteja</h3>
          <p>Luo agentteja Creator-sovelluksessa tai ota käyttöön agentteja Storesta.</p>
        </div>
      )}

      {myFiltered.length > 0 && (
        <section className="agent-section">
          <div className="agent-section-title">Omat agentit</div>
          <div className="agents-grid">
            {myFiltered.map(agent => (
              <ProphetAgentCard
                key={agent.id}
                agent={agent}
                pinned={pinnedIds.includes(agent.id)}
                onLaunch={onLaunch}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        </section>
      )}

      {storeFiltered.length > 0 && (
        <section className="agent-section">
          <div className="agent-section-title">Store-agentit</div>
          <div className="agents-grid">
            {storeFiltered.map(agent => (
              <ProphetAgentCard
                key={agent.id}
                agent={agent}
                pinned={pinnedIds.includes(agent.id)}
                onLaunch={onLaunch}
                onTogglePin={onTogglePin}
                isStore
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ProphetAgentCard({ agent, pinned, onLaunch, onTogglePin, isStore }) {
  return (
    <div className="prophet-agent-card">
      <div className="pac-header">
        <div className="pac-dot" style={{ background: categoryColor(agent.category) }} />
        <span className="pac-name">{agent.name}</span>
        {isStore && <span className="store-badge">Store</span>}
        <button
          className={`pin-btn ${pinned ? 'pinned' : ''}`}
          onClick={() => onTogglePin(agent.id)}
          title={pinned ? 'Irrota kiinnitys' : 'Kiinnitä'}
        >
          {pinned ? '📌' : '📍'}
        </button>
      </div>

      {agent.description && (
        <p className="pac-desc">{agent.description}</p>
      )}

      <div className="pac-meta">
        <span>🧠 {agent.model}</span>
        <span>🔧 {agent.tools?.length || 0} työkalua</span>
        <span className={`pac-vis ${agent.visibility}`}>
          {agent.visibility === 'private' ? '🔒' : '🌐'}
        </span>
      </div>

      {agent.tools?.length > 0 && (
        <div className="pac-tools">
          {agent.tools.slice(0, 4).map(t => (
            <span key={t} className="tool-tag">{t}</span>
          ))}
          {agent.tools.length > 4 && (
            <span className="tool-tag tool-tag-more">+{agent.tools.length - 4}</span>
          )}
        </div>
      )}

      <button className="btn-kaynista" onClick={() => onLaunch(agent)}>
        ▶ Käynnistä
      </button>
    </div>
  )
}

// ── Sessiot view ──────────────────────────────────────────────────────────────
function SessiotView({ sessions, allAgentMap, onContinue, onLaunchNew }) {
  if (sessions.length === 0) {
    return (
      <div className="view">
        <div className="view-toolbar">
          <h2>📋 Sessiot</h2>
        </div>
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <h3>Ei sessioita vielä</h3>
          <p>Käynnistä ensimmäinen agenttisessio Agentit-näkymästä.</p>
          <button className="btn-primary" onClick={onLaunchNew}>Selaa agentteja</button>
        </div>
      </div>
    )
  }

  return (
    <div className="view sessiot-view">
      <div className="view-toolbar">
        <h2>📋 Sessiot <span className="count-badge">{sessions.length}</span></h2>
        <button className="btn-primary" onClick={onLaunchNew}>+ Uusi sessio</button>
      </div>

      <div className="sessions-list">
        {sessions.map(session => {
          const st = statusLabel(session.status)
          const agent = allAgentMap[session.agentId]
          return (
            <div key={session.id} className="session-row">
              <div className="session-row-icon">
                <span style={{ fontSize: 20 }}>🤖</span>
              </div>
              <div className="session-row-info">
                <div className="session-row-name">{session.agentName}</div>
                <div className="session-row-meta">
                  <code className="session-id-text">{session.id}</code>
                  <span className="session-time">{fmtTime(session.startedAt)}</span>
                </div>
              </div>
              <span className={`status-badge ${st.cls}`}>{st.label}</span>
              <div className="session-row-actions">
                {agent ? (
                  <button className="btn-jatka" onClick={() => onContinue(session)}>
                    Jatka ▶
                  </button>
                ) : (
                  <span className="text-muted" title="Agentin tiedot ei löydy">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Aktiivinen sessio ─────────────────────────────────────────────────────────
function AktiivisenSessioView({ agent, sessionId, onRun, onClose }) {
  return (
    <div className="sessio-view">
      <div className="sessio-chat-area">
        <div className="sessio-chat-header">
          <div className="sessio-chat-title">
            <span className="agent-dot" style={{ background: categoryColor(agent.category) }} />
            <span>{agent.name}</span>
            <code className="sessio-id">{sessionId?.slice(-12)}</code>
          </div>
          <button className="btn-close-session" onClick={onClose} title="Sulje sessio">
            ✕ Sulje
          </button>
        </div>
        <div className="sessio-chat-body">
          <TestChat agent={agent} onRun={onRun} />
        </div>
      </div>

      <aside className="agent-info-panel">
        <div className="aip-section">
          <div className="aip-label">Agentti</div>
          <div className="aip-agent-name">{agent.name}</div>
          {agent.description && (
            <div className="aip-agent-desc">{agent.description}</div>
          )}
        </div>

        <div className="aip-section">
          <div className="aip-label">Malli</div>
          <div className="aip-value model-value">🧠 {agent.model}</div>
        </div>

        {agent.tools?.length > 0 && (
          <div className="aip-section">
            <div className="aip-label">Työkalut ({agent.tools.length})</div>
            <div className="aip-tools">
              {agent.tools.map(t => (
                <span key={t} className="tool-tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        {agent.system_prompt && (
          <div className="aip-section">
            <div className="aip-label">Järjestelmäkehote</div>
            <div className="aip-prompt">
              {agent.system_prompt.slice(0, 200)}
              {agent.system_prompt.length > 200 ? '…' : ''}
            </div>
          </div>
        )}

        <div className="aip-section aip-session-info">
          <div className="aip-label">Sessio ID</div>
          <code className="aip-session-id">{sessionId}</code>
        </div>

        <button className="btn-close-sidebar" onClick={onClose}>
          ✕ Lopeta sessio
        </button>
      </aside>
    </div>
  )
}
