import React, { useState, useEffect, useCallback } from 'react'

const ROLES = [
  { value: 'admin', label: '👑 Admin', desc: 'Täysi pääsy, käyttäjähallinta' },
  { value: 'editor', label: '✏️ Editor', desc: 'Luo ja muokkaa agentteja' },
  { value: 'viewer', label: '👁️ Viewer', desc: 'Vain agenttien suoritus' },
]

function RoleBadge({ role }) {
  const r = ROLES.find(x => x.value === role) || ROLES[1]
  return <span className={`role-badge role-${role}`}>{r.label}</span>
}

function ActiveToggle({ active, onChange, disabled }) {
  return (
    <button
      className={`active-toggle ${active ? 'active' : 'inactive'}`}
      onClick={onChange}
      disabled={disabled}
      title={active ? 'Aktiivinen — klikkaa poistuaksesi' : 'Estetty — klikkaa aktivoidaksesi'}
    >
      {active ? '✅ Aktiivinen' : '🚫 Estetty'}
    </button>
  )
}

function UsersTab({ api }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listUsers()
      setUsers(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [api])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (user, newRole) => {
    if (newRole === user.role) return
    setUpdating(user.id)
    try {
      const updated = await api.updateUser(user.id, { role: newRole })
      setUsers(us => us.map(u => u.id === user.id ? { ...u, ...updated } : u))
    } catch (e) {
      setError(e.message)
    }
    setUpdating(null)
  }

  const handleActiveToggle = async (user) => {
    setUpdating(user.id)
    try {
      const updated = await api.updateUser(user.id, { active: !user.active })
      setUsers(us => us.map(u => u.id === user.id ? { ...u, ...updated } : u))
    } catch (e) {
      setError(e.message)
    }
    setUpdating(null)
  }

  const handleDelete = async (user) => {
    if (!confirm(`Poistetaanko käyttäjä "${user.display_name || user.email}"?\n\nTämä poistaa käyttäjätietueen tietokannasta, mutta ei poista B2C-tiliä.`)) return
    setUpdating(user.id)
    try {
      await api.deleteUser(user.id)
      setUsers(us => us.filter(u => u.id !== user.id))
    } catch (e) {
      setError(e.message)
    }
    setUpdating(null)
  }

  const filtered = users.filter(u =>
    !search || u.email?.includes(search) || u.display_name?.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    active: users.filter(u => u.active !== false).length,
    blocked: users.filter(u => u.active === false).length,
  }

  return (
    <div className="admin-tab">
      <div className="admin-stats">
        <div className="stat-card"><span className="stat-value">{stats.total}</span><span className="stat-label">Käyttäjää</span></div>
        <div className="stat-card"><span className="stat-value">{stats.admins}</span><span className="stat-label">Adminia</span></div>
        <div className="stat-card"><span className="stat-value">{stats.active}</span><span className="stat-label">Aktiivista</span></div>
        <div className="stat-card stat-warn"><span className="stat-value">{stats.blocked}</span><span className="stat-label">Estettyä</span></div>
      </div>

      {error && <div className="admin-error">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>}

      <div className="admin-toolbar">
        <input
          className="admin-search"
          placeholder="🔍 Hae sähköpostilla tai nimellä…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn-sm btn-outline" onClick={load}>🔄 Päivitä</button>
      </div>

      {loading ? (
        <div className="admin-loading">Ladataan käyttäjiä…</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">Ei käyttäjiä{search ? ' hakuehdoilla' : ''}</div>
      ) : (
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                <th>Käyttäjä</th>
                <th>Rooli</th>
                <th>Tila</th>
                <th>Liittynyt</th>
                <th>Toiminnot</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className={u.active === false ? 'user-row blocked' : 'user-row'}>
                  <td className="user-info">
                    <div className="user-avatar">{(u.display_name || u.email || '?')[0].toUpperCase()}</div>
                    <div>
                      <div className="user-name">{u.display_name || '—'}</div>
                      <div className="user-email">{u.email}</div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="role-select"
                      value={u.role || 'editor'}
                      onChange={e => handleRoleChange(u, e.target.value)}
                      disabled={updating === u.id}
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <ActiveToggle
                      active={u.active !== false}
                      onChange={() => handleActiveToggle(u)}
                      disabled={updating === u.id}
                    />
                  </td>
                  <td className="user-date">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('fi-FI') : '—'}
                  </td>
                  <td>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() => handleDelete(u)}
                      disabled={updating === u.id}
                      title="Poista käyttäjätietue"
                    >🗑️ Poista käyttäjä</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InvitesTab({ api }) {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listInvites()
      setInvites(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [api])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setCreating(true)
    setError(null)
    try {
      const invite = await api.createInvite({ email: email.trim(), role })
      setInvites(prev => [invite, ...prev])
      setEmail('')
    } catch (e) {
      setError(e.message)
    }
    setCreating(false)
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteInvite(id)
      setInvites(prev => prev.filter(i => i.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="admin-tab">
      <div className="invite-form-card">
        <h3>✉️ Uusi kutsu</h3>
        <p>Käyttäjä saa automaattisesti määritetyn roolin kirjautuessaan ensimmäistä kertaa.</p>
        {error && <div className="admin-error">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>}
        <form className="invite-form" onSubmit={handleCreate}>
          <input
            type="email"
            className="invite-email-input"
            placeholder="sahkoposti@esimerkki.fi"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <select className="role-select" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
            ))}
          </select>
          <button className="btn-primary" type="submit" disabled={creating || !email.trim()}>
            {creating ? 'Luodaan…' : '➕ Lähetä kutsu'}
          </button>
        </form>
      </div>

      <h3 className="invite-list-title">Odottavat kutsut <span className="count-badge">{invites.length}</span></h3>

      {loading ? (
        <div className="admin-loading">Ladataan kutsuja…</div>
      ) : invites.length === 0 ? (
        <div className="admin-empty">Ei odottavia kutsuja</div>
      ) : (
        <div className="invite-list">
          {invites.map(inv => (
            <div key={inv.id} className="invite-row">
              <div className="invite-info">
                <span className="invite-email">{inv.email}</span>
                <RoleBadge role={inv.role} />
              </div>
              <div className="invite-meta">
                {inv.created_at ? new Date(inv.created_at).toLocaleDateString('fi-FI') : ''}
              </div>
              <button
                className="btn-sm btn-danger"
                onClick={() => handleDelete(inv.id)}
                title="Peruuta kutsu"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminPanel({ api }) {
  const [tab, setTab] = useState('users')

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>⚙️ Käyttäjähallinta</h2>
        <p>Hallinnoi käyttäjiä, rooleja ja kutsuja</p>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >👥 Käyttäjät</button>
        <button
          className={`admin-tab-btn ${tab === 'invites' ? 'active' : ''}`}
          onClick={() => setTab('invites')}
        >✉️ Kutsut</button>
      </div>

      {tab === 'users' && <UsersTab api={api} />}
      {tab === 'invites' && <InvitesTab api={api} />}
    </div>
  )
}
