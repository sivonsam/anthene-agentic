import React, { useState, useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { API_BASE, DEV_MODE } from '../config'

const DEV_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZXYtdXNlci0xIiwibmFtZSI6IkRldiBVc2VyIiwiZW1haWwiOiJkZXZAYW50aGVuZS5haSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.'

const TABS = [
  { id: 'map', label: '🗺️ Kartta' },
  { id: 'agent', label: '🤖 Agenttianalyysi' },
  { id: 'alerts', label: '🔔 Hälytykset' },
]

const CAT_COLORS = {
  military: '#ff4444', balloon: '#ffdd00', helicopter: '#44aaff',
  uav: '#ff8800', unidentified: '#ff8800', emergency: '#ff0000',
  glider: '#c084fc', commercial: '#88cc88',
}

export default function AoiWindow({ aoi, initialAircraft = [], api, getToken, onClose }) {
  const [activeTab, setActiveTab] = useState('map')
  const [aircraft, setAircraft] = useState(initialAircraft)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [alerts, setAlerts] = useState([])
  const mapContainer = useRef(null)
  const map = useRef(null)
  const bottomRef = useRef(null)

  // ── Fetch aircraft in AOI ───────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return
    api.callTool('adsb_area', {
      lat: parseFloat(aoi.center[1].toFixed(4)),
      lon: parseFloat(aoi.center[0].toFixed(4)),
      dist_nm: aoi.dist_nm || 100,
    }).then(data => {
      const normalized = (data.aircraft || []).map(ac => ({
        ...ac,
        flight: ac.callsign || '',
        r: ac.registration || '',
        t: ac.type || '',
        category_label: ac.military
          ? 'military'
          : ac.emergency
            ? 'emergency'
            : ac.type?.startsWith?.('H')
              ? 'helicopter'
              : 'commercial',
      }))
      setAircraft(normalized)

      // Generate alerts for military / emergency
      const newAlerts = normalized
        .filter(a => a.category_label === 'military' || a.category_label === 'emergency')
        .map(a => ({
          id: a.hex,
          type: a.category_label,
          msg: `${a.category_label === 'military' ? '⚔️ Sotilaskone' : '🚨 Hätätilanne'}: ${a.flight || a.hex} (${a.t || '?'}) kork. ${a.alt_baro || '?'} ft`,
          ts: new Date().toISOString(),
        }))
      setAlerts(newAlerts)
    }).catch(e => console.warn('AoiWindow fetch failed', e))
  }, [aoi, api])

  // ── Mini map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'map' || map.current || !mapContainer.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: aoi.center,
      zoom: 7,
    })

    map.current.on('load', () => {
      // AOI polygon
      map.current.addSource('aoi-poly', {
        type: 'geojson',
        data: aoi.feature,
      })
      map.current.addLayer({
        id: 'aoi-fill',
        type: 'fill',
        source: 'aoi-poly',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.15 },
      })
      map.current.addLayer({
        id: 'aoi-line',
        type: 'line',
        source: 'aoi-poly',
        paint: { 'line-color': '#2563eb', 'line-width': 2 },
      })

      // Aircraft
      map.current.addSource('ac', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: aircraft.map(ac => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [ac.lon, ac.lat] },
            properties: { color: CAT_COLORS[ac.category_label] || '#888', label: ac.flight || ac.hex },
          })),
        },
      })
      map.current.addLayer({
        id: 'ac-circles',
        type: 'circle',
        source: 'ac',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      })
    })

    if (aoi.bbox) {
      map.current.fitBounds(
        [[aoi.bbox[0], aoi.bbox[1]], [aoi.bbox[2], aoi.bbox[3]]],
        { padding: 40, duration: 800 }
      )
    }

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [activeTab])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Consult ─────────────────────────────────────────────────────────────────
  const doConsult = async (userMsg) => {
    try {
      const token = DEV_MODE ? DEV_TOKEN : (getToken ? await getToken() : null)
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const mil = aircraft.filter(a => a.category_label === 'military').length
      const em = aircraft.filter(a => a.category_label === 'emergency').length
      const systemContext = `Aviation analyst for AOI "${aoi.name}". Center: ${aoi.center[1].toFixed(2)}°N ${aoi.center[0].toFixed(2)}°E, radius ~${aoi.dist_nm}nm. Aircraft: ${aircraft.length} total, ${mil} military, ${em} emergency. Active: ${aircraft.slice(0, 20).map(a => `${a.flight || a.hex}(${a.t || '?'}, ${a.category_label})`).join('; ')}`

      const resp = await fetch(`${API_BASE}/api/consult`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemContext },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg },
          ],
        }),
      })

      if (resp.ok) {
        const data = await resp.json()
        return data.content || data.message || data.reply || JSON.stringify(data)
      }
    } catch {}

    const mil = aircraft.filter(a => a.category_label === 'military').length
    const em = aircraft.filter(a => a.category_label === 'emergency').length
    return `AOI "${aoi.name}" sisältää ${aircraft.length} lentokonetta. Sotilaita: ${mil}. Hätätilanteet: ${em}. Koneet: ${aircraft.slice(0, 5).map(a => a.flight || a.hex).join(', ')}${aircraft.length > 5 ? ' ...' : ''}`
  }

  const send = async () => {
    const msg = input.trim()
    if (!msg || chatLoading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)
    const reply = await doConsult(msg)
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    setChatLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0f1117', borderRadius: 12, border: '1px solid #1e2433',
        width: '90vw', maxWidth: 800, height: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          borderBottom: '1px solid #1e2433', background: '#0d1929',
        }}>
          <span style={{ flex: 1, fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>
            ✈️ {aoi.name}
          </span>
          <span style={{ fontSize: 12, color: '#64748b', marginRight: 16 }}>
            {aircraft.length} lentokonetta · {aircraft.filter(a => a.category_label === 'military').length} sotilasta
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#475569',
              cursor: 'pointer', fontSize: 16, padding: '2px 8px', borderRadius: 6,
            }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e2433', background: '#0a0a0f' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px', background: 'none',
                border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? '#2563eb' : 'transparent'}`,
                color: activeTab === tab.id ? '#60a5fa' : '#64748b',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

          {/* Map tab */}
          {activeTab === 'map' && (
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
          )}

          {/* Agent tab */}
          {activeTab === 'agent' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                flex: 1, overflowY: 'auto', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {messages.length === 0 && (
                  <div className="flight-chat-msg assistant">
                    Kysy AOI "{aoi.name}" — {aircraft.length} lentokonetta alueella,
                    {' '}{aircraft.filter(a => a.category_label === 'military').length} sotilasta.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flight-chat-msg ${m.role}`}>{m.content}</div>
                ))}
                {chatLoading && <div className="flight-chat-msg assistant">⏳ Analysoidaan...</div>}
                <div ref={bottomRef} />
              </div>
              <div className="flight-chat-input-row">
                <textarea
                  className="flight-chat-input"
                  rows={2}
                  value={input}
                  placeholder="Kysy alueen tilanteesta..."
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                />
                <button
                  className="flight-chat-send-btn"
                  onClick={send}
                  disabled={chatLoading || !input.trim()}
                >➤</button>
              </div>
            </div>
          )}

          {/* Alerts tab */}
          {activeTab === 'alerts' && (
            <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
              {alerts.length === 0 ? (
                <div style={{ color: '#475569', fontSize: 13 }}>
                  ✅ Ei hälytyksiä — alueella ei sotilaskoneita tai hätätilanteita.
                </div>
              ) : (
                alerts.map(alert => (
                  <div key={alert.id} style={{
                    background: alert.type === 'military' ? '#3b1a1a' : '#1a1a3b',
                    border: `1px solid ${alert.type === 'military' ? '#7f1d1d' : '#1d1d7f'}`,
                    borderRadius: 8, padding: '10px 14px', marginBottom: 8,
                    color: '#e2e8f0', fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{alert.msg}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {new Date(alert.ts).toLocaleTimeString('fi-FI')}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
