import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://anthene-api.greensea-93121b9f.swedencentral.azurecontainerapps.io'

export default function DevLogin({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.detail || 'Kirjautuminen epäonnistui')
      }
      const data = await resp.json()
      localStorage.setItem('anthene_token', data.token)
      localStorage.setItem('anthene_user', JSON.stringify(data.user))
      onLogin(data.token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wall">
      <div className="login-card">
        <div className="login-logo">⬡</div>
        <h2>Anthene Agentic</h2>
        <p className="login-subtitle">Kirjaudu sisään</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            placeholder="Käyttäjätunnus"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
          />
          <input
            type="password"
            placeholder="Salasana"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} className="btn-login">
            {loading ? 'Kirjaudutaan...' : 'Kirjaudu sisään'}
          </button>
        </form>
        <p className="login-hint">Demo: admin / Jallukola</p>
      </div>
    </div>
  )
}
