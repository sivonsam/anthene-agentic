import React, { useState, useEffect, useRef } from 'react'

const CATEGORIES = ['security', 'environmental', 'logistics', 'intelligence', 'custom']
const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'phi-3-medium', 'mistral-large']
const VISIBILITIES = [
  { value: 'private', label: '🔒 Yksityinen', desc: 'Vain sinä näet tämän agentin' },
  { value: 'shared', label: '🌐 Jaettu', desc: 'Näkyy AgentStoressa kaikille' },
]

export default function AgentForm({ tools = [], initial = null, onSave, onCancel, loading }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    tools: [],
    model: 'gpt-4o',
    visibility: 'private',
    category: 'custom',
    graph_type: 'react',
    memory_scope: 'conversation',
    ...initial,
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleTool = (id) => {
    set('tools', form.tools.includes(id)
      ? form.tools.filter(t => t !== id)
      : [...form.tools, id])
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form className="agent-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <label>Agentin nimi *</label>
        <input
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="esim. Suomen ilmatilan valvoja"
          required
          maxLength={100}
        />
      </div>

      <div className="form-section">
        <label>Kuvaus</label>
        <input
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Lyhyt kuvaus agentin tehtävästä"
          maxLength={500}
        />
      </div>

      <div className="form-row">
        <div className="form-section">
          <label>Kategoria</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-section">
          <label>Malli</label>
          <select value={form.model} onChange={e => set('model', e.target.value)}>
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="form-section">
        <label>Systeemiprompt *</label>
        <textarea
          value={form.system_prompt}
          onChange={e => set('system_prompt', e.target.value)}
          placeholder="Olet asiantuntija-agentti joka... Tehtäväsi on..."
          rows={6}
          required
          minLength={10}
          maxLength={4000}
        />
        <span className="char-count">{form.system_prompt.length}/4000</span>
      </div>

      <div className="form-section">
        <label>Työkalut ({form.tools.length} valittu)</label>
        <div className="tools-grid">
          {tools.map(t => (
            <label key={t.id} className={`tool-chip ${form.tools.includes(t.id) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={form.tools.includes(t.id)}
                onChange={() => toggleTool(t.id)}
              />
              <span className="tool-name">{t.name}</span>
              <span className="tool-desc">{t.description.slice(0, 60)}…</span>
            </label>
          ))}
        </div>
      </div>

      <div className="form-section">
        <label>Näkyvyys</label>
        <div className="visibility-options">
          {VISIBILITIES.map(v => (
            <label key={v.value} className={`visibility-option ${form.visibility === v.value ? 'selected' : ''}`}>
              <input
                type="radio"
                name="visibility"
                value={v.value}
                checked={form.visibility === v.value}
                onChange={() => set('visibility', v.value)}
              />
              <div>
                <strong>{v.label}</strong>
                <span>{v.desc}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="form-row">
        <div className="form-section">
          <label>Muistityyppi</label>
          <select value={form.memory_scope} onChange={e => set('memory_scope', e.target.value)}>
            <option value="conversation">Keskustelukohtainen</option>
            <option value="user">Käyttäjäkohtainen</option>
            <option value="global">Globaali (jaettu muisti)</option>
          </select>
        </div>
        <div className="form-section">
          <label>Graph-tyyppi</label>
          <select value={form.graph_type} onChange={e => set('graph_type', e.target.value)}>
            <option value="react">ReAct (suositeltu)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Peruuta</button>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Tallennetaan…' : initial ? '💾 Päivitä agentti' : '🚀 Luo agentti'}
        </button>
      </div>
    </form>
  )
}
