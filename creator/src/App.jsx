import React, { useState, useEffect, useCallback } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest, DEV_MODE, API_BASE } from './config'
import { createApiClient } from './api'
import AgentForm from './components/AgentForm'
import AgentCard from './components/AgentCard'
import TestChat from './components/TestChat'
import AgentConsultant, { SUPERAGENT_TOOLS, SUPERAGENT_PROMPT } from './components/AgentConsultant'
import AdminPanel from './components/AdminPanel'
import './App.css'

export default function App() {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [view, setView] = useState('Omat agentit')
  const [agents, setAgents] = useState([])
  const [storeAgents, setStoreAgents] = useState([])
  const [tools, setTools] = useState([])
  const [userProfile, setUserProfile] = useState(null)
  const [operatorPins, setOperatorPins] = useState([]) // agent IDs pinned to operator UI
  const [editingAgent, setEditingAgent] = useState(null)
  const [testingAgent, setTestingAgent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [formLoading, setFormLoading] = useState(false)
  // 'consult' | 'manual' — create mode
  const [createMode, setCreateMode] = useState('consult')

  const getToken = useCallback(async () => {
    if (DEV_MODE) return 'dev'
    const resp = await instance.acquireTokenSilent({ ...loginRequest, account: accounts[0] })
    return resp.accessToken
  }, [instance, accounts])

  const api = createApiClient(getToken)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [myAgents, toolList, profile] = await Promise.all([
        api.listMyAgents(),
        api.getTools(),
        api.getMe(),
      ])
      setAgents(myAgents)
      setTools(toolList)
      setUserProfile(profile)
      setOperatorPins(profile?.preferences?.operator_agents || [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const loadStore = async () => {
    try {
      const shared = await api.listStoreAgents()
      setStoreAgents(shared)
    } catch (e) { setError(e.message) }
  }

  const isLoggedIn = DEV_MODE || isAuthenticated

  useEffect(() => { if (isLoggedIn) loadData() }, [isLoggedIn])
  useEffect(() => { if (view === 'AgentStore' && isLoggedIn) loadStore() }, [view, isLoggedIn])

  const handleLogin = () => instance.loginPopup(loginRequest).catch(() => {})
  const handleLogout = () => instance.logoutPopup().catch(() => {})

  const handleSave = async (formData) => {
    setFormLoading(true)
    setError(null)
    try {
      if (editingAgent) {
        await api.updateAgent(editingAgent.id, formData)
      } else {
        await api.createAgent(formData)
      }
      await loadData()
      setEditingAgent(null)
      setView('Omat agentit')
    } catch (e) { setError(e.message) }
    setFormLoading(false)
  }

  const handleDelete = async (agent) => {
    if (!confirm(`Poistetaanko agentti "${agent.name}"?`)) return
    try {
      await api.deleteAgent(agent.id)
      setAgents(a => a.filter(x => x.id !== agent.id))
    } catch (e) { setError(e.message) }
  }

  const handleCopyFromStore = async (agent) => {
    try {
      await api.copyAgent(agent.id)
      await loadData()
      setView('Omat agentit')
    } catch (e) { setError(e.message) }
  }

  const handlePinOperator = async (agent) => {
    const alreadyPinned = operatorPins.includes(agent.id)
    const newPins = alreadyPinned
      ? operatorPins.filter(id => id !== agent.id)
      : [...operatorPins, agent.id]
    setOperatorPins(newPins)
    try {
      await api.updateMe({ preferences: { operator_agents: newPins } })
    } catch (e) {
      setOperatorPins(operatorPins) // revert on error
      setError(e.message)
    }
  }

  const handleRunTest = (agent) => (message, onToken, onToolStart, onToolEnd, onDone, onError) => {
    api.runAgentStream(agent.id, message, `test:${agent.id}`,
      onToken, onToolStart, onToolEnd, onDone, onError, getToken)
  }

  const user = DEV_MODE ? { name: 'Dev User' } : accounts[0]
  const isAdmin = DEV_MODE || userProfile?.role === 'admin'
  const VIEWS = ['Omat agentit', 'Luo agentti', 'AgentStore', ...(isAdmin ? ['Hallinta'] : [])]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-hex">⚡</span>
          <span className="brand-name">Anthene Agentic</span>
          <span className="brand-product">Agent Creator</span>
        </div>
        <nav className="header-nav">
          {VIEWS.map(v => (
            <button key={v} className={`nav-btn ${view === v ? 'active' : ''}`}
              onClick={() => { setEditingAgent(null); setView(v) }}>
              {v === 'Omat agentit' ? '🤖' : v === 'Luo agentti' ? '✚' : v === 'Hallinta' ? '⚙️' : '🏪'} {v}
            </button>
          ))}
        </nav>
        <div className="header-user">
          {isLoggedIn ? (
            <>
              <span className="user-name">{user?.name || 'Käyttäjä'}</span>
              {!DEV_MODE && <button className="btn-logout" onClick={handleLogout}>Kirjaudu ulos</button>}
              {DEV_MODE && <span className="dev-badge">DEV</span>}
            </>
          ) : (
            <button className="btn-login" onClick={handleLogin}>Kirjaudu sisään</button>
          )}
        </div>
      </header>

      <div className="app-tagline">Luo, konfiguroi ja testaa omia AI-agentteja — määritä kyvykkyydet, systeemikehote ja julkaise Storeen</div>

      <main className="app-main">
        {error && <div className="error-banner">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>}

        {!isLoggedIn ? (
          <div className="login-wall">
            <div className="login-card">
              <span className="login-hex">⚡</span>
              <h1>Anthene Agent Creator</h1>
              <p>Luo, hallinnoi ja testaa omia AI-agenttejasi.<br/>Kirjaudu sisään jatkaaksesi.</p>
              <button className="btn-primary btn-lg" onClick={handleLogin}>Kirjaudu sisään</button>
            </div>
          </div>
        ) : (
          <>
            {view === 'Omat agentit' && (
              <section className="view">
                <div className="view-toolbar">
                  <h2>Omat agentit <span className="count-badge">{agents.length}</span></h2>
                  <button className="btn-primary" onClick={() => { setEditingAgent(null); setView('Luo agentti') }}>
                    + Luo uusi agentti
                  </button>
                </div>
                {loading ? <div className="spinner">Ladataan…</div>
                  : agents.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🤖</div>
                      <h3>Ei vielä agentteja</h3>
                      <p>Luo ensimmäinen agenttisi tai selaa AgentStorea.</p>
                      <button className="btn-primary" onClick={() => setView('Luo agentti')}>Luo uusi agentti</button>
                    </div>
                  ) : (
                    <div className="agents-grid">
                      {agents.map(a => (
                        <AgentCard key={a.id} agent={a}
                          onEdit={(ag) => { setEditingAgent(ag); setView('Luo agentti') }}
                          onDelete={handleDelete}
                          onTest={(ag) => setTestingAgent(testingAgent?.id === ag.id ? null : ag)}
                          onPinOperator={handlePinOperator}
                          isPinned={operatorPins.includes(a.id)}
                        />
                      ))}
                    </div>
                  )}
                {testingAgent && (
                  <div className="test-panel-wrap">
                    <TestChat agent={testingAgent} onRun={handleRunTest(testingAgent)} />
                  </div>
                )}
              </section>
            )}

            {view === 'Luo agentti' && (
              <section className="view">
                <div className="view-toolbar">
                  <h2>{editingAgent ? `✏️ Muokkaa: ${editingAgent.name}` : '✚ Luo uusi agentti'}</h2>
                  {!editingAgent && (
                    <div className="create-mode-toggle">
                      <button
                        className={`mode-btn ${createMode === 'consult' ? 'active' : ''}`}
                        onClick={() => setCreateMode('consult')}
                      >🧠 AI-konsultointi</button>
                      <button
                        className={`mode-btn ${createMode === 'manual' ? 'active' : ''}`}
                        onClick={() => setCreateMode('manual')}
                      >✏️ Manuaalinen</button>
                    </div>
                  )}
                </div>

                {!editingAgent && createMode === 'consult' ? (
                  <AgentConsultant
                    getToken={getToken}
                    onAccept={(agentConfig) => {
                      setEditingAgent(null)
                      setCreateMode('manual')
                      // Pre-fill form from consultant recommendation — name left blank for user to fill
                      setEditingAgent({ ...agentConfig, id: '__prefill__', name: '' })
                    }}
                    onSuperAgent={() => {
                      setCreateMode('manual')
                      setEditingAgent({
                        id: '__prefill__',
                        name: '',
                        description: '',
                        category: 'superagenti',
                        tools: SUPERAGENT_TOOLS,
                        model: 'gpt-4o',
                        system_prompt: '',
                        graph_type: 'react',
                        memory_scope: 'conversation',
                        visibility: 'private',
                      })
                    }}
                  />
                ) : (
                  <div className="create-layout">
                    <AgentForm
                      tools={tools}
                      initial={editingAgent?.id === '__prefill__' ? editingAgent : editingAgent}
                      onSave={async (formData) => {
                        await handleSave(formData)
                        setCreateMode('consult')
                      }}
                      onCancel={() => {
                        setEditingAgent(null)
                        setCreateMode('consult')
                        setView('Omat agentit')
                      }}
                      loading={formLoading}
                    />
                    {editingAgent && editingAgent.id !== '__prefill__' && (
                      <TestChat agent={editingAgent} onRun={handleRunTest(editingAgent)} />
                    )}
                  </div>
                )}
              </section>
            )}

            {view === 'AgentStore' && (
              <section className="view">
                <div className="view-toolbar">
                  <h2>🏪 AgentStore <span className="count-badge">{storeAgents.length}</span></h2>
                </div>
                {storeAgents.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🏪</div>
                    <h3>Store on tyhjä</h3>
                    <p>Jaa oma agenttisi Storessa asettamalla näkyvyydeksi "Jaettu".</p>
                  </div>
                ) : (
                  <div className="agents-grid">
                    {storeAgents.map(a => (
                      <AgentCard key={a.id} agent={a} showOwner
                        onCopy={handleCopyFromStore}
                        onTest={(ag) => setTestingAgent(testingAgent?.id === ag.id ? null : ag)}
                      />
                    ))}
                  </div>
                )}
                {testingAgent && (
                  <div className="test-panel-wrap">
                    <TestChat agent={testingAgent} onRun={handleRunTest(testingAgent)} />
                  </div>
                )}
              </section>
            )}

            {view === 'Hallinta' && isAdmin && (
              <section className="view">
                <AdminPanel api={api} />
              </section>
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        Powered by <strong>Vivicta</strong> · v1.0 · ssivonen 2026
      </footer>
    </div>
  )
}
