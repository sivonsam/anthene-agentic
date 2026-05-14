import React from 'react'

export default function AgentCard({ agent, onEdit, onDelete, onTest, onCopy, onPreview, showOwner = false, onPinOperator, isPinned = false }) {
  const categoryColors = {
    security: '#ef4444',
    environmental: '#22c55e',
    logistics: '#3b82f6',
    intelligence: '#a855f7',
    custom: '#6b7280',
  }

  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <div
          className="agent-category-dot"
          style={{ background: categoryColors[agent.category] || '#6b7280' }}
          title={agent.category}
        />
        <span
          className="agent-name"
          onClick={() => onPreview?.(agent)}
          style={onPreview ? { cursor: 'pointer' } : {}}
          title={onPreview ? 'Esikatsele agentti' : agent.name}
        >
          {agent.name}
        </span>
        <span className={`agent-visibility ${agent.visibility}`}>
          {agent.visibility === 'private' ? '🔒' : '🌐'}
        </span>
      </div>

      {agent.description && (
        <p className="agent-description">{agent.description}</p>
      )}

      <div className="agent-meta">
        <span className="agent-model">🧠 {agent.model}</span>
        <span className="agent-tools">🔧 {agent.tools?.length || 0} työkalua</span>
        {showOwner && agent.owner_id && (
          <span className="agent-owner">👤 {agent.owner_id.slice(0, 8)}…</span>
        )}
      </div>

      {agent.tools?.length > 0 && (
        <div className="agent-tools-list">
          {agent.tools.slice(0, 4).map(t => (
            <span key={t} className="tool-tag">{t}</span>
          ))}
          {agent.tools.length > 4 && (
            <span className="tool-tag tool-tag-more">+{agent.tools.length - 4}</span>
          )}
        </div>
      )}

      <div className="agent-card-actions">
        {onPinOperator && (
          <button
            className={`btn-action btn-pin ${isPinned ? 'pinned' : ''}`}
            onClick={() => onPinOperator(agent)}
            title={isPinned ? 'Poista Operaattori-UI:sta' : 'Vie Operaattori-UI:hin'}
          >
            {isPinned ? '📌 Pinnattu' : '📌 Operaattorille'}
          </button>
        )}
        {onPreview && (
          <button className="btn-action btn-preview" onClick={() => onPreview(agent)} title="Esikatsele agenttia">
            👁 Esikatsele
          </button>
        )}
        {onTest && (
          <button className="btn-action btn-test" onClick={() => onTest(agent)} title="Testaa agenttia">
            ▶ Testaa agenttia
          </button>
        )}
        {onEdit && (
          <button className="btn-action btn-edit" onClick={() => onEdit(agent)} title="Muokkaa agenttia">
            ✏️ Muokkaa
          </button>
        )}
        {onCopy && (
          <button className="btn-action btn-copy" onClick={() => onCopy(agent)} title="Kopioi omaan kokoelmaan">
            📋 Ota käyttöön
          </button>
        )}
        {onDelete && (
          <button className="btn-action btn-delete" onClick={() => onDelete(agent)} title="Poista agentti">
            🗑️ Poista agentti
          </button>
        )}
      </div>
    </div>
  )
}
