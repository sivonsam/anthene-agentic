import React, { useEffect } from 'react'
import TestChat from './TestChat'

const categoryColors = {
  security: '#ef4444',
  environmental: '#22c55e',
  logistics: '#3b82f6',
  intelligence: '#a855f7',
  custom: '#6b7280',
}

const categoryLabels = {
  security: 'Security',
  environmental: 'Environmental',
  logistics: 'Logistics',
  intelligence: 'Intelligence',
  custom: 'Custom',
}

const MAP_TOOLS = new Set([
  'adsb_area','adsb_trail','adsb_flight','adsb_military',
  'weather_area','fmi_observations','fmi_warnings',
  'effis_fires','effis_risk',
  'nasa_firms_viirs','nasa_firms_modis',
  'ais_area','ais_vessel','ais_trail',
  'stuk_radiation','stuk_stations',
  'gdacs','map_geocode'
])

// Slide-in right panel with full agent details + TestChat
// Props: agent, onClose, onRun, onCopy, initialMessages, initialToolResults, onSave
export default function AgentPreview({ agent, onClose, onRun, onCopy, initialMessages, initialToolResults, onSave }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!agent) return null

  const isMapBound = agent?.aoi || agent?.tools?.some(t => MAP_TOOLS.has(t))

  return (
    <>
      <div className="preview-backdrop" onClick={onClose} />
      <aside className="preview-panel" style={isMapBound ? { width: 860 } : {}}>
        <div className="preview-header">
          <div className="preview-title">
            <div
              className="agent-category-dot"
              style={{ background: categoryColors[agent.category] || '#6b7280' }}
            />
            <h2>{agent.name}</h2>
          </div>
          <button className="preview-close" onClick={onClose} aria-label="Sulje">✕</button>
        </div>

        <div className="preview-body">
          <div className="preview-meta-row">
            {agent.category && (
              <span
                className="preview-category-badge"
                style={{ borderColor: categoryColors[agent.category] || '#6b7280', color: categoryColors[agent.category] || '#6b7280' }}
              >
                {categoryLabels[agent.category] || agent.category}
              </span>
            )}
            <span className={`agent-visibility ${agent.visibility}`}>
              {agent.visibility === 'private' ? '🔒 Yksityinen' : '🌐 Jaettu'}
            </span>
          </div>

          {agent.description && (
            <div className="preview-section">
              <p className="preview-description">{agent.description}</p>
            </div>
          )}

          <div className="preview-section">
            <div className="preview-info-grid">
              <div className="preview-info-item">
                <span className="preview-info-label">Malli</span>
                <span className="preview-info-value">🧠 {agent.model}</span>
              </div>
              <div className="preview-info-item">
                <span className="preview-info-label">Työkaluja</span>
                <span className="preview-info-value">🔧 {agent.tools?.length || 0}</span>
              </div>
              {agent.owner_id && (
                <div className="preview-info-item">
                  <span className="preview-info-label">Omistaja</span>
                  <span className="preview-info-value">👤 {agent.owner_id.slice(0, 8)}…</span>
                </div>
              )}
              {agent.created_at && (
                <div className="preview-info-item">
                  <span className="preview-info-label">Luotu</span>
                  <span className="preview-info-value">{new Date(agent.created_at).toLocaleDateString('fi-FI')}</span>
                </div>
              )}
            </div>
          </div>

          {agent.tools?.length > 0 && (
            <div className="preview-section">
              <span className="preview-section-label">Työkalut</span>
              <div className="agent-tools-list" style={{ marginTop: 8 }}>
                {agent.tools.map(t => (
                  <span key={t} className="tool-tag">{t}</span>
                ))}
              </div>
            </div>
          )}

          {agent.system_prompt && (
            <div className="preview-section">
              <span className="preview-section-label">Järjestelmäprompt</span>
              <pre className="preview-prompt">{agent.system_prompt}</pre>
            </div>
          )}

          {onCopy && (
            <div className="preview-section">
              <button className="btn-primary btn-full" onClick={() => onCopy(agent)}>
                📋 Ota käyttöön
              </button>
            </div>
          )}

          {onRun && (
            <div className="preview-chat">
              <TestChat key={agent?.id} agent={agent} onRun={onRun}
                initialMessages={initialMessages}
                initialToolResults={initialToolResults}
                onSave={onSave} />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
