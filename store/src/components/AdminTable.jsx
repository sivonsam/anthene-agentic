import React from 'react'

const visibilityLabels = { private: 'Yksityinen', shared: 'Jaettu', public: 'Julkinen' }
const visibilityColors = { private: 'var(--text2)', shared: 'var(--blue)', public: 'var(--accent)' }

// Admin table of ALL agents with owner info, visibility management, delete
// Props: agents, onChangeVisibility, onDelete, loading
export default function AdminTable({ agents, onChangeVisibility, onDelete, loading }) {
  if (loading) return <div className="spinner">Ladataan kaikkia agentteja…</div>

  if (!agents.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🗄️</div>
        <h3>Ei agentteja</h3>
        <p>Järjestelmässä ei ole yhtään agenttia.</p>
      </div>
    )
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Omistaja</th>
            <th>Nimi</th>
            <th>Kategoria</th>
            <th>Näkyvyys</th>
            <th>Työkalut</th>
            <th>Luotu</th>
            <th>Toiminnot</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.id}>
              <td className="admin-td-mono" title={agent.id}>
                {agent.id ? agent.id.slice(0, 8) + '…' : '—'}
              </td>
              <td className="admin-td-mono" title={agent.owner_id}>
                {agent.owner_id ? agent.owner_id.slice(0, 8) + '…' : '—'}
              </td>
              <td className="admin-td-name">{agent.name}</td>
              <td>
                <span className="admin-category">{agent.category || '—'}</span>
              </td>
              <td>
                <span
                  className="admin-visibility-badge"
                  style={{ color: visibilityColors[agent.visibility] || 'var(--text2)' }}
                >
                  {agent.visibility === 'private' ? '🔒' : '🌐'}{' '}
                  {visibilityLabels[agent.visibility] || agent.visibility}
                </span>
              </td>
              <td className="admin-td-center">{agent.tools?.length || 0}</td>
              <td className="admin-td-date">
                {agent.created_at ? new Date(agent.created_at).toLocaleDateString('fi-FI') : '—'}
              </td>
              <td>
                <div className="admin-actions">
                  <select
                    className="admin-visibility-select"
                    value={agent.visibility}
                    onChange={e => onChangeVisibility(agent, e.target.value)}
                    title="Vaihda näkyvyys"
                  >
                    <option value="private">🔒 Yksityinen</option>
                    <option value="shared">🌐 Jaettu</option>
                  </select>
                  <button
                    className="btn-action btn-delete"
                    onClick={() => onDelete(agent)}
                    title="Poista agentti"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
