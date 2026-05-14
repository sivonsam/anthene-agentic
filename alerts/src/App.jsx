import React, { useState, useEffect, useCallback } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'https://anthene-api.greensea-93121b9f.swedencentral.azurecontainerapps.io'
const DEV_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZXYtdXNlci0xIiwibmFtZSI6IkRldiBVc2VyIiwiZW1haWwiOiJkZXZAYW50aGVuZS5haSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.'

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEV_TOKEN}`, ...opts.headers },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const SEV_COLOR = { info: '#60a5fa', warning: '#fbbf24', critical: '#ef4444' }
const SEV_ICON  = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }
const SEV_LABEL = { info: 'Info', warning: 'Varoitus', critical: 'Kriittinen' }

function formatTs(ts) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleString('fi-FI') } catch { return ts }
}

export default function App() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tgStatus, setTgStatus] = useState(null)
  const [linking, setLinking] = useState(false)
  const [linkData, setLinkData] = useState(null)
  const [filter, setFilter] = useState('all')  // all | unread | info | warning | critical

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/api/alerts')
      setAlerts(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTgStatus = useCallback(async () => {
    try {
      const s = await apiFetch('/api/telegram/status')
      setTgStatus(s)
    } catch {}
  }, [])

  useEffect(() => {
    load()
    loadTgStatus()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load, loadTgStatus])

  async function markRead(id) {
    await apiFetch(`/api/alerts/${id}/read`, { method: 'PATCH' })
    setAlerts(a => a.map(x => x.id === id ? { ...x, read: true } : x))
  }

  async function markAllRead() {
    await apiFetch('/api/alerts/read-all', { method: 'PATCH' })
    setAlerts(a => a.map(x => ({ ...x, read: true })))
  }

  async function deleteAlert(id) {
    await apiFetch(`/api/alerts/${id}`, { method: 'DELETE' })
    setAlerts(a => a.filter(x => x.id !== id))
  }

  async function startLink() {
    setLinking(true)
    try {
      const d = await apiFetch('/api/telegram/link-start', { method: 'POST' })
      setLinkData(d)
    } catch (e) {
      setLinking(false)
    }
  }

  async function unlink() {
    await apiFetch('/api/telegram/unlink', { method: 'DELETE' })
    setTgStatus({ linked: false })
    setLinkData(null)
  }

  async function checkLinkDone() {
    await loadTgStatus()
    setLinkData(null)
    setLinking(false)
  }

  const unread = alerts.filter(a => !a.read).length
  const filtered = alerts.filter(a => {
    if (filter === 'unread') return !a.read
    if (['info', 'warning', 'critical'].includes(filter)) return a.severity === filter
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: '#07111f', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0f1a2e', borderBottom: '1px solid #1e3a5f', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#7c6fcd' }}>🔔 Anthene Hälytykset</span>
        {unread > 0 && (
          <span style={{ background: '#ef4444', borderRadius: '999px', padding: '1px 8px', fontSize: '.75rem', fontWeight: 700 }}>{unread}</span>
        )}
        <div style={{ flex: 1 }} />
        {/* Telegram status */}
        {tgStatus?.linked
          ? <span style={{ fontSize: '.75rem', color: '#34d399', border: '1px solid #34d39940', borderRadius: 20, padding: '2px 10px' }}>
              ✅ Telegram: @{tgStatus.tg_username || 'linkitetty'}
              <button onClick={unlink} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 6, fontSize: '1rem' }}>✕</button>
            </span>
          : <button onClick={startLink} style={{ fontSize: '.75rem', background: '#1e3a5f', border: '1px solid #2d5a8f', borderRadius: 20, padding: '3px 12px', color: '#60a5fa', cursor: 'pointer' }}>
              📱 Linkitä Telegram
            </button>
        }
        {unread > 0 && (
          <button onClick={markAllRead} style={{ fontSize: '.75rem', background: '#1e3a5f', border: '1px solid #2d5a8f', borderRadius: 20, padding: '3px 12px', color: '#94a3b8', cursor: 'pointer' }}>
            ✓ Merkitse kaikki luetuksi
          </button>
        )}
      </div>

      {/* Telegram link modal */}
      {linkData && (
        <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 12, padding: 28, maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📱</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Linkitä Telegram</div>
            <div style={{ fontSize: '.85rem', color: '#94a3b8', marginBottom: 20 }}>
              Avaa @AntheneAgenticBot Telegramissa ja paina <strong>START</strong> tai klikkaa alla olevaa linkkiä.
            </div>
            <a href={linkData.deep_link} target="_blank" rel="noreferrer"
               style={{ display: 'block', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '10px 0', textDecoration: 'none', marginBottom: 12, fontWeight: 600 }}>
              🚀 Avaa @AntheneAgenticBot
            </a>
            <div style={{ fontSize: '.75rem', color: '#475569', marginBottom: 16 }}>Linkityskoodi: <code style={{ color: '#7c6fcd' }}>{linkData.link_code}</code></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={checkLinkDone} style={{ flex: 1, background: '#1e3a5f', border: '1px solid #2d5a8f', borderRadius: 8, padding: '8px 0', color: '#60a5fa', cursor: 'pointer' }}>✅ Valmis</button>
              <button onClick={() => { setLinkData(null); setLinking(false) }} style={{ flex: 1, background: '#1e1e2e', border: '1px solid #3f3f5f', borderRadius: 8, padding: '8px 0', color: '#94a3b8', cursor: 'pointer' }}>Peruuta</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ padding: '10px 20px', display: 'flex', gap: 8, background: '#0b1526', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {[['all','Kaikki'], ['unread','Lukematta'], ['critical','🚨 Kriittiset'], ['warning','⚠️ Varoitukset'], ['info','ℹ️ Infot']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            fontSize: '.75rem', borderRadius: 20, padding: '3px 12px', cursor: 'pointer',
            background: filter === v ? '#1e3a5f' : 'transparent',
            border: filter === v ? '1px solid #60a5fa' : '1px solid #1e3a5f',
            color: filter === v ? '#60a5fa' : '#94a3b8',
          }}>{l}{v === 'all' ? ` (${alerts.length})` : v === 'unread' ? ` (${unread})` : ''}</button>
        ))}
      </div>

      {/* Alerts list */}
      <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 40 }}>Ladataan…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 40, fontSize: '1rem' }}>
            {filter === 'unread' ? '✅ Ei lukemattomia hälytyksiä' : '🔔 Ei hälytyksiä'}
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} onClick={() => !a.read && markRead(a.id)} style={{
            background: a.read ? '#0b1526' : '#0f1a2e',
            border: `1px solid ${a.read ? '#1e3a5f' : SEV_COLOR[a.severity] || '#60a5fa'}40`,
            borderLeft: `4px solid ${SEV_COLOR[a.severity] || '#60a5fa'}`,
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 10,
            cursor: a.read ? 'default' : 'pointer',
            opacity: a.read ? 0.7 : 1,
            transition: 'all .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{SEV_ICON[a.severity] || '🔔'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '.85rem', color: SEV_COLOR[a.severity] || '#60a5fa' }}>{SEV_LABEL[a.severity] || a.severity}</span>
                  <span style={{ fontSize: '.75rem', color: '#475569' }}>•</span>
                  <span style={{ fontSize: '.78rem', color: '#7c6fcd' }}>🤖 {a.agent_name}</span>
                  <span style={{ fontSize: '.75rem', color: '#475569' }}>•</span>
                  <span style={{ fontSize: '.75rem', color: '#475569' }}>{formatTs(a.timestamp)}</span>
                  {a.telegram_sent && <span style={{ fontSize: '.7rem', color: '#34d399' }}>📱</span>}
                  {!a.read && <span style={{ fontSize: '.65rem', background: '#2563eb', borderRadius: 20, padding: '1px 6px', color: '#fff' }}>uusi</span>}
                </div>
                <div style={{ fontSize: '.88rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.message}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteAlert(a.id) }}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '0 4px', fontSize: '1rem', flexShrink: 0 }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
