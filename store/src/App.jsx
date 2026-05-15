import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest, DEV_MODE } from './config'
import { createApiClient } from './api'
import { initSSO, isTokenValid, getTokenExpiry, clearSession } from './sso'
import AgentCard from './components/AgentCard'
import AgentPreview from './components/AgentPreview'
import AdminTable from './components/AdminTable'
import QuickAgentModal from './components/QuickAgentModal'
import { ToastContainer } from './components/Toast'
import DevLogin from './components/DevLogin'
import SituationalMap from './components/SituationalMap'

const CATEGORIES = ['Kaikki', 'Aluevalvonta', 'Yleinen', 'Kriittinen infra', 'Liikenne', 'Meri', 'Ilma', 'Sensorfusion', 'Anomaliat', 'Hälytykset', 'Analyysit']
const CATEGORY_VALUES = {
  'Kaikki': '',
  'Aluevalvonta': 'aluevalvonta',
  'Yleinen': 'yleinen',
  'Kriittinen infra': 'kriittinen-infra',
  'Liikenne': 'liikenne',
  'Meri': 'meri',
  'Ilma': 'ilma',
  'Sensorfusion': 'sensorfusion',
  'Anomaliat': 'anomaliat',
  'Hälytykset': 'halytykset',
  'Analyysit': 'analyysit',
}

const SORT_OPTIONS = [
  { label: 'Uusimmat', value: 'newest' },
  { label: 'Nimi A–Z', value: 'name' },
  { label: 'Eniten työkaluja', value: 'tools' },
]

const VIEWS = ['Store', 'Omat', '🗺️ Tilannekuva', 'Admin']

let toastIdCounter = 0

export default function App() {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()

  const [view, setView] = useState('Store')
  const [storeAgents, setStoreAgents] = useState([])
  const [myAgents, setMyAgents] = useState([])
  const [allAgents, setAllAgents] = useState([])
  const [user, setUser] = useState(null)
  const [loadingStore, setLoadingStore] = useState(false)
  const [loadingMy, setLoadingMy] = useState(false)
  const [loadingAdmin, setLoadingAdmin] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Kaikki')
  const [sort, setSort] = useState('newest')
  const [previewAgent, setPreviewAgent] = useState(null)
  const chatDataRef = useRef({})
  const getChatData = (id) => chatDataRef.current[id] || {}
  const makeSaveChat = (id) => id
    ? (msgs, trs) => { chatDataRef.current[id] = { messages: msgs, toolResults: trs } }
    : undefined
  const [toasts, setToasts] = useState([])
  const [devToken, setDevToken] = useState(() => {
    const token = initSSO()
    return isTokenValid(token) ? token : null
  })
  const [devUser, setDevUser] = useState(() => { try { return JSON.parse(localStorage.getItem('anthene_user')) } catch { return null } })

  const isLoggedIn = (DEV_MODE && devToken != null) || isAuthenticated

  // Auto-logout when token expires
  useEffect(() => {
    if (!devToken) return
    const expiry = getTokenExpiry(devToken)
    if (!expiry) return
    const msUntilExpiry = expiry.getTime() - Date.now()
    if (msUntilExpiry <= 0) {
      clearSession()
      setDevToken(null)
      setUser(null)
      return
    }
    const timer = setTimeout(() => {
      clearSession()
      setDevToken(null)
      setUser(null)
    }, msUntilExpiry)
    return () => clearTimeout(timer)
  }, [devToken])

  const getToken = useCallback(async () => {
    if (DEV_MODE) return devToken || localStorage.getItem('anthene_token') || 'dev'
    const resp = await instance.acquireTokenSilent({ ...loginRequest, account: accounts[0] })
    return resp.accessToken
  }, [instance, accounts, devToken])

  const api = useMemo(() => createApiClient(getToken), [getToken])

  const addToast = (message, type = 'success') => {
    const id = ++toastIdCounter
    setToasts(t => [...t, { id, message, type }])
  }
  const dismissToast = (id) => setToasts(t => t.filter(x => x.id !== id))

  // Load user info
  useEffect(() => {
    if (!isLoggedIn) return
    if (DEV_MODE) {
      setUser(devUser || { name: 'Dev User', role: 'admin', sub: 'dev-user-1' })
      return
    }
    api.getMe().then(setUser).catch(() => {
      const acc = accounts[0]
      setUser({ name: acc?.name || 'Käyttäjä', role: 'user' })
    })
  }, [isLoggedIn])

  // Load store agents
  const loadStore = useCallback(async () => {
    setLoadingStore(true)
    try {
      const agents = await api.listStoreAgents()
      setStoreAgents(agents)
    } catch (e) {
      addToast(`Virhe: ${e.message}`, 'error')
    }
    setLoadingStore(false)
  }, [api])

  // Load my agents
  const loadMy = useCallback(async () => {
    setLoadingMy(true)
    try {
      const agents = await api.listMyAgents()
      setMyAgents(agents)
    } catch (e) {
      addToast(`Virhe: ${e.message}`, 'error')
    }
    setLoadingMy(false)
  }, [api])

  // Load all agents (admin)
  const loadAll = useCallback(async () => {
    setLoadingAdmin(true)
    try {
      const agents = await api.listAllAgents()
      setAllAgents(agents)
    } catch (e) {
      addToast(`Virhe: ${e.message}`, 'error')
    }
    setLoadingAdmin(false)
  }, [api])

  useEffect(() => { if (isLoggedIn) { loadStore(); loadMy() } }, [isLoggedIn])
  useEffect(() => { if (view === 'Admin' && isLoggedIn) loadAll() }, [view, isLoggedIn])

  const handleLogin = () => instance.loginPopup(loginRequest).catch(() => {})
  const handleLogout = () => instance.logoutPopup().catch(() => {})

  const handleCopy = async (agent) => {
    try {
      await api.copyAgent(agent.id)
      await loadMy()
      addToast(`✅ "${agent.name}" lisätty omiin agentteihin!`, 'success')
      setPreviewAgent(null)
    } catch (e) {
      addToast(`Virhe: ${e.message}`, 'error')
    }
  }

  const handleDeleteAdmin = async (agent) => {
    if (!confirm(`Poistetaanko agentti "${agent.name}" pysyvästi?`)) return
    try {
      await api.deleteAgent(agent.id)
      setAllAgents(a => a.filter(x => x.id !== agent.id))
      addToast(`Agentti "${agent.name}" poistettu.`, 'success')
    } catch (e) {
      addToast(`Virhe: ${e.message}`, 'error')
    }
  }

  const handleChangeVisibility = async (agent, newVisibility) => {
    try {
      await api.updateAgent(agent.id, { visibility: newVisibility })
      setAllAgents(a => a.map(x => x.id === agent.id ? { ...x, visibility: newVisibility } : x))
      addToast(`Näkyvyys päivitetty: ${agent.name}`, 'success')
    } catch (e) {
      addToast(`Virhe: ${e.message}`, 'error')
    }
  }

  const handleRunTest = (agent) => (message, aoiOverride, onToken, onToolStart, onToolEnd, onDone, onError) => {
    api.runAgentStream(agent.id, message, `store:${agent.id}`, aoiOverride,
      onToken, onToolStart, onToolEnd, onDone, onError, getToken)
  }

  // Filter + sort logic
  const applyFilters = (agents) => {
    let result = [...agents]
    const q = search.toLowerCase().trim()
    if (q) {
      result = result.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q)
      )
    }
    const catVal = CATEGORY_VALUES[category]
    if (catVal) {
      result = result.filter(a => a.category === catVal)
    }
    if (sort === 'newest') {
      result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    } else if (sort === 'name') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fi'))
    } else if (sort === 'tools') {
      result.sort((a, b) => (b.tools?.length || 0) - (a.tools?.length || 0))
    }
    return result
  }

  const filteredStore = useMemo(() => applyFilters(storeAgents), [storeAgents, search, category, sort])
  const filteredMy = useMemo(() => applyFilters(myAgents), [myAgents, search, category, sort])

  const isAdmin = user?.role === 'admin'

  const SearchBar = () => (
    <div className="store-search-bar">
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          type="text"
          placeholder="Hae nimellä, kuvauksella tai kategorialla…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} title="Tyhjennä haku">✕</button>
        )}
      </div>

      <div className="category-chips">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`category-chip ${category === cat ? 'active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <select
        className="sort-select"
        value={sort}
        onChange={e => setSort(e.target.value)}
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-hex">⚡</span>
          <span className="brand-name">Anthene Agentic</span>
          <span className="brand-product">AgentStore</span>
        </div>
        <nav className="header-nav">
          {VIEWS.filter(v => v !== 'Admin' || isAdmin).map(v => (
            <button
              key={v}
              className={`nav-btn ${view === v ? 'active' : ''}`}
              onClick={() => { setPreviewAgent(null); setView(v) }}
            >
              {v === 'Store' ? '🏪' : v === 'Omat' ? '🤖' : v === '🗺️ Tilannekuva' ? '' : '🛡️'} {v}
            </button>
          ))}
        </nav>
        <div className="header-user">
          {isLoggedIn ? (
            <>
              <span className="user-name">{user?.name || 'Käyttäjä'}</span>
              {isAdmin && <span className="admin-badge">Admin</span>}
              {!DEV_MODE && <button className="btn-logout" onClick={handleLogout}>Kirjaudu ulos</button>}
              {DEV_MODE && (
                <button className="btn-logout" onClick={() => {
                  clearSession()
                  setDevToken(null)
                  setDevUser(null)
                  setUser(null)
                }}>Kirjaudu ulos</button>
              )}
            </>
          ) : (
            <button className="btn-login" onClick={handleLogin}>Kirjaudu sisään</button>
          )}
        </div>
      </header>

      <div className="app-tagline">Selaa, arvioi ja ota käyttöön jaettuja AI-agentteja — yhteisön parhaat kyvykkyydet yhdessä paikassa</div>

      <main className="app-main">
        {!isLoggedIn ? (
          DEV_MODE
            ? <DevLogin onLogin={(token, user) => { setDevToken(token); setDevUser(user) }} />
            : (
              <div className="login-wall">
                <div className="login-card">
                  <span className="login-hex">⚡</span>
                  <h1>Anthene AgentStore</h1>
                  <p>Selaa ja ota käyttöön jaettuja AI-agentteja.<br/>Kirjaudu sisään jatkaaksesi.</p>
                  <button className="btn-primary btn-lg" onClick={handleLogin}>Kirjaudu sisään</button>
                </div>
              </div>
            )
        ) : (
          <>
            {/* ── Store ── */}
            {view === 'Store' && (
              <section className="view">
                <div className="view-toolbar">
                  <h2>🏪 Store <span className="count-badge">{filteredStore.length}</span></h2>
                </div>
                <SearchBar />
                {loadingStore ? (
                  <div className="spinner">Ladataan agentteja…</div>
                ) : filteredStore.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🏪</div>
                    <h3>{search || category !== 'Kaikki' ? 'Ei tuloksia' : 'Store on tyhjä'}</h3>
                    <p>{search || category !== 'Kaikki' ? 'Kokeile eri hakusanoja tai kategorioita.' : 'Ei jaettuja agentteja saatavilla.'}</p>
                    {(search || category !== 'Kaikki') && (
                      <button className="btn-secondary" onClick={() => { setSearch(''); setCategory('Kaikki') }}>
                        Tyhjennä suodattimet
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="agents-grid">
                    {filteredStore.map(a => (
                      <AgentCard
                        key={a.id}
                        agent={a}
                        showOwner
                        onPreview={ag => setPreviewAgent(ag)}
                        onCopy={handleCopy}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Omat ── */}
            {view === 'Omat' && (
              <section className="view">
                <div className="view-toolbar">
                  <h2>🤖 Omat agentit <span className="count-badge">{filteredMy.length}</span></h2>
                  <button className="btn-primary" onClick={() => setShowCreateModal(true)}>✚ Luo uusi agentti</button>
                </div>
                <SearchBar />
                {loadingMy ? (
                  <div className="spinner">Ladataan…</div>
                ) : filteredMy.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🤖</div>
                    <h3>{search || category !== 'Kaikki' ? 'Ei tuloksia' : 'Ei omia agentteja'}</h3>
                    <p>{search || category !== 'Kaikki' ? 'Kokeile eri hakusanoja.' : 'Ota käyttöön agentteja Storesta.'}</p>
                    {!(search || category !== 'Kaikki') && (
                      <button className="btn-primary" onClick={() => setView('Store')}>
                        Selaa Storea
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="agents-grid">
                    {filteredMy.map(a => (
                      <AgentCard
                        key={a.id}
                        agent={a}
                        onPreview={ag => setPreviewAgent(ag)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Admin ── */}
            {view === 'Admin' && isAdmin && (
              <section className="view">
                <div className="view-toolbar">
                  <h2>🛡️ Admin — kaikki agentit <span className="count-badge">{allAgents.length}</span></h2>
                  <button className="btn-secondary" onClick={loadAll}>🔄 Päivitä</button>
                </div>
                <AdminTable
                  agents={allAgents}
                  loading={loadingAdmin}
                  onChangeVisibility={handleChangeVisibility}
                  onDelete={handleDeleteAdmin}
                />
              </section>
            )}

            {/* ── Tilannekuva ── */}
            {view === '🗺️ Tilannekuva' && (
              <section className="view" style={{ padding: 0, height: 'calc(100vh - 120px)' }}>
                <SituationalMap api={api} />
              </section>
            )}
          </>
        )}
      </main>

      {/* Slide-in preview panel */}
      {previewAgent && (
        <AgentPreview
          agent={previewAgent}
          onClose={() => setPreviewAgent(null)}
          onRun={handleRunTest(previewAgent)}
          onCopy={view === 'Store' ? handleCopy : undefined}
          initialMessages={getChatData(previewAgent?.id).messages}
          initialToolResults={getChatData(previewAgent?.id).toolResults}
          onSave={makeSaveChat(previewAgent?.id)}
        />
      )}

      {/* Quick create modal */}
      {showCreateModal && (
        <QuickAgentModal
          api={api}
          onCreated={() => { setShowCreateModal(false); loadMy() }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <footer className="app-footer">
        Powered by <strong>Vivicta</strong> · v1.0 · ssivonen 2026
      </footer>
    </div>
  )
}
