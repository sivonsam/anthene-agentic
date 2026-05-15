import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
const AOIMap = lazy(() => import('./AOIMap'))

const CATEGORIES = [
  { value: 'aluevalvonta', label: '🗺️ Aluevalvonta',         desc: 'AOI-pohjainen aluevalvonta' },
  { value: 'liikenne',     label: '🚦 Liikenne & Logistiikka', desc: 'Ilma-, meri- ja tieliikenne' },
  { value: 'ymparisto',    label: '🌿 Ympäristö & Luonto',    desc: 'Tulipalot, luonnonilmiöt, ekologia' },
  { value: 'energia',      label: '⚡ Energia & Kriittinen infra', desc: 'Sähköverkko, kaasu, ydinvoima' },
  { value: 'turvallisuus', label: '🛡️ Turvallisuus & Pelastus', desc: 'Pelastus, rajavalvonta, turvallisuus' },
  { value: 'tiedustelu',   label: '🔍 Tilannekuva & Analytiikka', desc: 'Tiedustelu, raportointi, analyysit' },
  { value: 'halytin',      label: '🔔 Hälytin & Automatisointi', desc: 'Kynnysarvopohjainen automaattinen hälytin' },
  { value: 'yleinen',      label: '⚙️ Yleinen',               desc: 'Yleiskäyttöinen agentti' },
]
const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'phi-3-medium', 'mistral-large']
const VISIBILITIES = [
  { value: 'private', label: '🔒 Yksityinen', desc: 'Vain sinä näet tämän agentin' },
  { value: 'shared', label: '🌐 Jaettu', desc: 'Näkyy AgentStoressa kaikille' },
]

export default function AgentForm({ tools = [], initial = null, onSave, onCancel, loading }) {
  const isPrefill = initial?.id === '__prefill__'
  const [form, setForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    tools: [],
    model: 'gpt-4o',
    visibility: 'private',
    category: 'yleinen',
    graph_type: 'react',
    memory_scope: 'conversation',
    aoi: null,
    telegram_alerts: false,
    telegram_alert_level: 'always',
    ...initial,
  })

  // Re-fill when consultant passes a new prefill config
  useEffect(() => {
    if (initial) {
      setForm({
        name: '', description: '', system_prompt: '', tools: [],
        model: 'gpt-4o', visibility: 'private', category: 'yleinen',
        graph_type: 'react', memory_scope: 'conversation', aoi: null,
        telegram_alerts: false, telegram_alert_level: 'always',
        ...initial,
      })
    }
  }, [initial?.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleTool = (id) => {
    set('tools', form.tools.includes(id)
      ? form.tools.filter(t => t !== id)
      : [...form.tools, id])
  }

  const toggleTelegramAlerts = (enabled) => {
    setForm(f => {
      const newTools = enabled
        ? (f.tools.includes('telegram_alert') ? f.tools : [...f.tools, 'telegram_alert'])
        : f.tools.filter(t => t !== 'telegram_alert')
      return { ...f, telegram_alerts: enabled, tools: newTools }
    })
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
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
        {(() => {
          const grouped = tools.reduce((acc, t) => {
            const key = t.category_label || '🔍 Tiedustelu & Analytiikka'
            if (!acc[key]) acc[key] = []
            acc[key].push(t)
            return acc
          }, {})
          return Object.entries(grouped).map(([groupLabel, groupTools]) => (
            <div key={groupLabel} className="tool-group">
              <div className="tool-group-header">{groupLabel}</div>
              <div className="tools-grid">
                {groupTools.map(t => (
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
          ))
        })()}
      </div>

      <div className="form-section telegram-section">
        <label>📡 Telegram-hälytykset</label>
        <div className="telegram-toggle-row">
          <label className="toggle-switch">
            <input type="checkbox" checked={form.telegram_alerts}
              onChange={e => toggleTelegramAlerts(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <span className="toggle-label">
            {form.telegram_alerts ? 'Käytössä — agentti lähettää hälytykset @AntheneAgenticBot-botiin' : 'Pois päältä'}
          </span>
        </div>
        {form.telegram_alerts && (
          <div className="telegram-config">
            <div className="form-section" style={{ marginBottom: 0 }}>
              <label>Hälytystaso</label>
              <select value={form.telegram_alert_level} onChange={e => set('telegram_alert_level', e.target.value)}>
                <option value="always">Aina — kaikki agentin havainnot</option>
                <option value="warning">Varoitus — merkittävät poikkeamat</option>
                <option value="critical">Kriittinen — vain vakavat tapahtumat</option>
              </select>
            </div>
            <div className="telegram-hint">
              <span>🔗</span>
              <span>
                Aktivoi ensin botti: avaa{' '}
                <a href="https://t.me/AntheneAgenticBot" target="_blank" rel="noreferrer">@AntheneAgenticBot</a>
                {' '}Telegramissa ja lähetä <code>/start</code>. Linkityskoodi löytyy{' '}
                <a href="https://victorious-forest-0551b9903.7.azurestaticapps.net" target="_blank" rel="noreferrer">Alerts UI:sta ↗</a>
              </span>
            </div>
          </div>
        )}
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

      <div className="form-section">
        <label>🗺️ Valvonta-alue (AOI) — valinnainen</label>
        <p className="field-hint">Piirrä kartalle maantieteellinen alue, jonka sisällä agentti toimii. Alue välitetään automaattisesti geotyökaluille.</p>
        <Suspense fallback={<div className="map-loading">Ladataan karttaa…</div>}>
          <AOIMap value={form.aoi} onChange={val => set('aoi', val)} />
        </Suspense>
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
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Peruuta muokkaus</button>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Tallennetaan…' : initial ? '💾 Päivitä agentti' : '🚀 Luo agentti'}
        </button>
      </div>
    </form>
  )
}
