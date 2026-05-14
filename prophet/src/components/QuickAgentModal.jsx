import React, { useState, useEffect } from 'react'

const CATEGORIES = [
  { value: 'aluevalvonta', label: '🗺️ Aluevalvonta' },
  { value: 'liikenne',     label: '🚦 Liikenne & Logistiikka' },
  { value: 'ymparisto',    label: '🌿 Ympäristö & Luonto' },
  { value: 'energia',      label: '⚡ Energia & Kriittinen infra' },
  { value: 'turvallisuus', label: '🛡️ Turvallisuus & Pelastus' },
  { value: 'tiedustelu',   label: '🔍 Tilannekuva & Analytiikka' },
  { value: 'halytin',      label: '🔔 Hälytin & Automatisointi' },
  { value: 'superagenti',  label: '🌐 Superagentti' },
  { value: 'yleinen',      label: '⚙️ Yleinen' },
]
const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'phi-3-medium', 'mistral-large']

export default function QuickAgentModal({ api, onCreated, onClose }) {
  const [form, setForm] = useState({
    name: '', description: '', system_prompt: '',
    tools: [], model: 'gpt-4o', visibility: 'private',
    category: 'yleinen', graph_type: 'react', memory_scope: 'conversation',
  })
  const [availableTools, setAvailableTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toolSearch, setToolSearch] = useState('')

  useEffect(() => {
    api.getTools().then(setAvailableTools).catch(() => {})
  }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleTool = (id) =>
    set('tools', form.tools.includes(id) ? form.tools.filter(t => t !== id) : [...form.tools, id])

  const filteredTools = availableTools.filter(t =>
    !toolSearch || t.id?.toLowerCase().includes(toolSearch.toLowerCase()) ||
    t.name?.toLowerCase().includes(toolSearch.toLowerCase())
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Agentin nimi on pakollinen.'); return }
    setLoading(true)
    setError(null)
    try {
      const created = await api.createAgent(form)
      onCreated(created)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="qam-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="qam-modal">
        <div className="qam-header">
          <span className="qam-title">✚ Luo uusi agentti</span>
          <button className="qam-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="qam-error">⚠️ {error}</div>}

        <form className="qam-form" onSubmit={handleSubmit}>
          <div className="qam-row">
            <label>Nimi *</label>
            <input
              className="qam-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Esim. Lennonjohdon tilannekuva"
              required
              autoFocus
            />
          </div>

          <div className="qam-row">
            <label>Kuvaus</label>
            <input
              className="qam-input"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Lyhyt kuvaus agentin tarkoituksesta"
            />
          </div>

          <div className="qam-row-2col">
            <div className="qam-row">
              <label>Kategoria</label>
              <select className="qam-select" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="qam-row">
              <label>Malli</label>
              <select className="qam-select" value={form.model} onChange={e => set('model', e.target.value)}>
                {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="qam-row">
            <label>Systeemiprompt</label>
            <textarea
              className="qam-textarea"
              value={form.system_prompt}
              onChange={e => set('system_prompt', e.target.value)}
              placeholder="Kuvaa agentin rooli, tehtävä ja käyttäytyminen…"
              rows={4}
            />
          </div>

          <div className="qam-row">
            <label>Työkalut <span className="qam-count">({form.tools.length} valittu)</span></label>
            <input
              className="qam-input qam-tool-search"
              placeholder="🔍 Etsi työkalua…"
              value={toolSearch}
              onChange={e => setToolSearch(e.target.value)}
            />
            <div className="qam-tools-grid">
              {filteredTools.map(t => {
                const id = t.id || t.name
                const checked = form.tools.includes(id)
                return (
                  <label key={id} className={`qam-tool-chip ${checked ? 'checked' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTool(id)} />
                    <span>{id}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="qam-row">
            <label>Näkyvyys</label>
            <div className="qam-visibility-row">
              {[{v:'private',l:'🔒 Yksityinen'},{v:'shared',l:'🌐 Jaettu Storeen'}].map(({v,l}) => (
                <label key={v} className={`qam-vis-btn ${form.visibility===v?'active':''}`}>
                  <input type="radio" name="visibility" value={v}
                    checked={form.visibility===v} onChange={() => set('visibility', v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>

          <div className="qam-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Peruuta</button>
            <button type="submit" className="btn-primary" disabled={loading || !form.name.trim()}>
              {loading ? 'Luodaan…' : '🚀 Luo agentti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
