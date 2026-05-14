import React, { useState, useEffect, useCallback, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import MaplibreDraw from 'maplibre-gl-draw'
import 'maplibre-gl-draw/dist/mapbox-gl-draw.css'
import { API_BASE, DEV_MODE } from '../config'

const DEV_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZXYtdXNlci0xIiwibmFtZSI6IkRldiBVc2VyIiwiZW1haWwiOiJkZXZAYW50aGVuZS5haSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.'

const MAP_STYLES = {
  night: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  day:   'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
}
const SATELLITE_STYLE = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: { 'esri-satellite': {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri',
  }},
  layers: [{ id: 'satellite-bg', type: 'raster', source: 'esri-satellite' }],
}

const CAT_COLORS = {
  military: '#ff4444',
  balloon: '#ffdd00',
  helicopter: '#44aaff',
  uav: '#ff8800',
  unidentified: '#ff8800',
  emergency: '#ff0000',
  glider: '#c084fc',
  commercial: '#88cc88',
}
const FILTERS = ['military','balloon','helicopter','uav','unidentified','emergency','glider','commercial']

function distNmFromBbox(bbox) {
  const [w, s, e, n] = bbox
  const deg = Math.sqrt((n - s) ** 2 + (e - w) ** 2)
  return Math.max(50, Math.min(500, Math.round(deg * 60 / 2)))
}
function bboxFromFeature(feature) {
  const coords = feature.geometry.coordinates[0]
  const lons = coords.map(c => c[0]), lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}
function centerFromBbox(bbox) {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}
function ptInPolygon(pt, polygon) {
  const [x, y] = pt
  const vs = polygon[0]
  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const [xi, yi] = vs[i], [xj, yj] = vs[j]
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// ── Inline AOI Chat Panel ────────────────────────────────────────────────────
function AoiChatPanel({ aoi, aircraftInAoi, getToken, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const doConsult = async (userMsg) => {
    try {
      const token = DEV_MODE ? DEV_TOKEN : (getToken ? await getToken() : null)
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const milCount = aircraftInAoi.filter(a => a.category_label === 'military').length
      const emCount = aircraftInAoi.filter(a => a.category_label === 'emergency').length
      const systemContext = `Aviation analyst for AOI "${aoi.name}". Center: ${aoi.center[1].toFixed(2)}°N ${aoi.center[0].toFixed(2)}°E, radius ~${aoi.dist_nm}nm. Aircraft: ${aircraftInAoi.length} total, ${milCount} military, ${emCount} emergency. Active: ${aircraftInAoi.slice(0, 20).map(a => `${a.flight || a.hex}(${a.t || '?'}, ${a.category_label})`).join('; ')}`

      const resp = await fetch(`${API_BASE}/api/consult`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemContext },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg }
          ]
        })
      })

      if (resp.ok) {
        const data = await resp.json()
        return data.content || data.message || data.reply || JSON.stringify(data)
      }
    } catch {}

    // Fallback: local summary
    const mil = aircraftInAoi.filter(a => a.category_label === 'military').length
    const em = aircraftInAoi.filter(a => a.category_label === 'emergency').length
    return `AOI "${aoi.name}" sisältää ${aircraftInAoi.length} lentokonetta. Sotilaita: ${mil}. Hätätilanteet: ${em}. Koneet: ${aircraftInAoi.slice(0, 5).map(a => a.flight || a.hex).join(', ')}${aircraftInAoi.length > 5 ? ' ...' : ''}`
  }

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    const reply = await doConsult(msg)
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    setLoading(false)
  }

  return (
    <div className="flight-chat-overlay">
      <div className="flight-chat-handle">
        <span className="flight-chat-title">🤖 AOI-analyysi: {aoi.name}</span>
        <button className="flight-chat-close" onClick={onClose}>✕</button>
      </div>
      <div className="flight-chat-messages">
        {messages.length === 0 && (
          <div className="flight-chat-msg assistant">
            Kysy jotain AOI:stä "{aoi.name}" — {aircraftInAoi.length} lentokonetta alueella.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flight-chat-msg ${m.role}`}>{m.content}</div>
        ))}
        {loading && <div className="flight-chat-msg assistant">⏳ Analysoidaan...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="flight-chat-input-row">
        <textarea
          className="flight-chat-input"
          rows={2}
          value={input}
          placeholder="Kysy lentoanalyysistä..."
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        />
        <button className="flight-chat-send-btn" onClick={send} disabled={loading || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  )
}

// ── Main FlightMapView ────────────────────────────────────────────────────────
export default function FlightMapView({ api, getToken }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const draw = useRef(null)
  const popup = useRef(null)
  const pollTimer = useRef(null)

  const [mapStyle, setMapStyle] = useState('night')
  const [aircraft, setAircraft] = useState([])
  const [aois, setAois] = useState([])
  const [activeFilters, setActiveFilters] = useState(new Set(FILTERS))
  const [chatAoi, setChatAoi] = useState(null)
  const [drawing, setDrawing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── Fetch aircraft ──────────────────────────────────────────────────────────
  const fetchAircraft = useCallback(async () => {
    const center = map.current?.getCenter()
    if (!center) return
    try {
      const data = await api.callTool('adsb_area', {
        lat: parseFloat(center.lat.toFixed(4)),
        lon: parseFloat(center.lng.toFixed(4)),
        dist_nm: 200,
      })
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
    } catch (e) {
      console.warn('adsb fetch failed', e)
    }
  }, [api])

  // ── Update map source when aircraft changes ─────────────────────────────────
  useEffect(() => {
    if (!map.current) return
    const src = map.current.getSource('aircraft')
    if (!src) return
    const filtered = aircraft.filter(ac => activeFilters.has(ac.category_label))
    src.setData({
      type: 'FeatureCollection',
      features: filtered.map(ac => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ac.lon, ac.lat] },
        properties: {
          hex: ac.hex,
          flight: ac.flight,
          alt: ac.alt_baro,
          gs: ac.gs,
          track: ac.track,
          cat: ac.category_label,
          color: CAT_COLORS[ac.category_label] || '#888',
          r: ac.r,
          t: ac.t,
        },
      })),
    })
  }, [aircraft, activeFilters])

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.night,
      center: [25, 62],
      zoom: 5,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right')

    draw.current = new MaplibreDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    })
    map.current.addControl(draw.current, 'top-left')

    popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })

    map.current.on('load', () => {
      // Aircraft source
      map.current.addSource('aircraft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Aircraft circles
      map.current.addLayer({
        id: 'aircraft-circles',
        type: 'circle',
        source: 'aircraft',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      })

      // Aircraft labels
      map.current.addLayer({
        id: 'aircraft-labels',
        type: 'symbol',
        source: 'aircraft',
        layout: {
          'text-field': ['coalesce', ['get', 'flight'], ['get', 'hex']],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': '#000',
          'text-halo-width': 1,
        },
      })

      // Click popup
      map.current.on('click', 'aircraft-circles', (e) => {
        const props = e.features[0].properties
        const coords = e.features[0].geometry.coordinates.slice()
        const html = `<div class="ac-popup">
          <h3>${props.flight || props.hex}</h3>
          <table>
            <tr><td>Rekisteri</td><td>${props.r || '—'}</td></tr>
            <tr><td>Tyyppi</td><td>${props.t || '—'}</td></tr>
            <tr><td>Kategoria</td><td>${props.cat}</td></tr>
            <tr><td>Korkeus</td><td>${props.alt != null ? props.alt + ' ft' : '—'}</td></tr>
            <tr><td>Nopeus</td><td>${props.gs != null ? props.gs + ' kt' : '—'}</td></tr>
          </table>
        </div>`
        popup.current.setLngLat(coords).setHTML(html).addTo(map.current)
      })

      map.current.on('mouseenter', 'aircraft-circles', () => {
        map.current.getCanvas().style.cursor = 'pointer'
      })
      map.current.on('mouseleave', 'aircraft-circles', () => {
        map.current.getCanvas().style.cursor = ''
      })

      fetchAircraft()
    })

    // Draw events
    map.current.on('draw.create', handleDrawCreate)
    map.current.on('draw.update', handleDrawCreate)

    return () => {
      clearInterval(pollTimer.current)
      map.current?.remove()
      map.current = null
    }
  }, [])

  // ── Start polling after map loads ───────────────────────────────────────────
  useEffect(() => {
    clearInterval(pollTimer.current)
    pollTimer.current = setInterval(fetchAircraft, 5000)
    return () => clearInterval(pollTimer.current)
  }, [fetchAircraft])

  // ── Style switcher ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current) return
    const style = mapStyle === 'satellite' ? SATELLITE_STYLE : MAP_STYLES[mapStyle]
    map.current.setStyle(style)
    map.current.once('styledata', () => {
      // Re-add sources/layers after style change
      if (!map.current.getSource('aircraft')) {
        map.current.addSource('aircraft', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: 'aircraft-circles',
          type: 'circle',
          source: 'aircraft',
          paint: {
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          },
        })
        map.current.addLayer({
          id: 'aircraft-labels',
          type: 'symbol',
          source: 'aircraft',
          layout: {
            'text-field': ['coalesce', ['get', 'flight'], ['get', 'hex']],
            'text-size': 11,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#000',
            'text-halo-width': 1,
          },
        })
        // Re-bind click
        map.current.on('click', 'aircraft-circles', (e) => {
          const props = e.features[0].properties
          const coords = e.features[0].geometry.coordinates.slice()
          const html = `<div class="ac-popup">
            <h3>${props.flight || props.hex}</h3>
            <table>
              <tr><td>Rekisteri</td><td>${props.r || '—'}</td></tr>
              <tr><td>Tyyppi</td><td>${props.t || '—'}</td></tr>
              <tr><td>Kategoria</td><td>${props.cat}</td></tr>
              <tr><td>Korkeus</td><td>${props.alt != null ? props.alt + ' ft' : '—'}</td></tr>
              <tr><td>Nopeus</td><td>${props.gs != null ? props.gs + ' kt' : '—'}</td></tr>
            </table>
          </div>`
          popup.current.setLngLat(coords).setHTML(html).addTo(map.current)
        })
        map.current.on('mouseenter', 'aircraft-circles', () => {
          map.current.getCanvas().style.cursor = 'pointer'
        })
        map.current.on('mouseleave', 'aircraft-circles', () => {
          map.current.getCanvas().style.cursor = ''
        })
      }
      // Force update aircraft source
      setAircraft(prev => [...prev])
    })
  }, [mapStyle])

  // ── Draw AOI handler ────────────────────────────────────────────────────────
  const handleDrawCreate = useCallback((e) => {
    const feature = e.features?.[0]
    if (!feature || feature.geometry.type !== 'Polygon') return
    const bbox = bboxFromFeature(feature)
    const center = centerFromBbox(bbox)
    const dist_nm = distNmFromBbox(bbox)
    const newAoi = {
      id: feature.id,
      name: `AOI-${Date.now().toString().slice(-4)}`,
      feature,
      center,
      dist_nm,
      bbox,
    }
    setAois(prev => [...prev.filter(a => a.id !== feature.id), newAoi])
    setDrawing(false)
    setSidebarOpen(true)
  }, [])

  const startDrawing = () => {
    if (!draw.current) return
    draw.current.changeMode('draw_polygon')
    setDrawing(true)
  }

  const finishDrawing = () => {
    if (!draw.current) return
    draw.current.changeMode('simple_select')
    setDrawing(false)
  }

  const deleteAoi = (id) => {
    if (draw.current) draw.current.delete(id)
    setAois(prev => prev.filter(a => a.id !== id))
    if (chatAoi?.id === id) setChatAoi(null)
  }

  // ── AOI stats ───────────────────────────────────────────────────────────────
  const aoiStats = (aoi) => {
    const inAoi = aircraft.filter(ac =>
      ptInPolygon([ac.lon, ac.lat], aoi.feature.geometry.coordinates)
    )
    return {
      total: inAoi.length,
      military: inAoi.filter(a => a.category_label === 'military').length,
      unidentified: inAoi.filter(a => a.category_label === 'unidentified').length,
      aircraft: inAoi,
    }
  }

  const toggleFilter = (f) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  return (
    <div className="flight-map-root">
      {/* Sidebar toggle */}
      <button
        className={`flight-sidebar-toggle ${sidebarOpen ? '' : 'collapsed'}`}
        style={{ left: sidebarOpen ? 260 : 0 }}
        onClick={() => setSidebarOpen(v => !v)}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>

      {/* Sidebar */}
      <div className={`flight-sidebar ${sidebarOpen ? '' : 'closed'}`}>
        <div className="flight-sidebar-header">
          <h3>✈️ Lentoanalyysi</h3>
          <div className="flight-style-switcher">
            {['night', 'day', 'satellite'].map(s => (
              <button
                key={s}
                className={`flight-style-btn ${mapStyle === s ? 'active' : ''}`}
                onClick={() => setMapStyle(s)}
              >
                {s === 'night' ? '🌙' : s === 'day' ? '☀️' : '🛰️'}
              </button>
            ))}
          </div>
        </div>

        <div className="flight-aoi-section">
          <div className="flight-aoi-title">Alueet ({aois.length})</div>
          {aois.map(aoi => {
            const stats = aoiStats(aoi)
            return (
              <div key={aoi.id} className="flight-aoi-item">
                <div className="flight-aoi-item-header">
                  <span className="flight-aoi-name">{aoi.name}</span>
                  <button className="flight-aoi-delete" onClick={() => deleteAoi(aoi.id)}>🗑</button>
                </div>
                <div className="flight-aoi-stats">
                  <span className="flight-badge flight-badge-total">{stats.total} kpl</span>
                  {stats.military > 0 && (
                    <span className="flight-badge flight-badge-mil">⚔️ {stats.military}</span>
                  )}
                  {stats.unidentified > 0 && (
                    <span className="flight-badge flight-badge-unid">❓ {stats.unidentified}</span>
                  )}
                </div>
                <div className="flight-aoi-actions">
                  <button
                    className="flight-aoi-btn primary"
                    onClick={() => setChatAoi({ ...aoi, aircraftInAoi: stats.aircraft })}
                  >
                    🤖 Brief Me
                  </button>
                  <button
                    className="flight-aoi-btn"
                    onClick={() => {
                      if (map.current && aoi.bbox) {
                        map.current.fitBounds(
                          [[aoi.bbox[0], aoi.bbox[1]], [aoi.bbox[2], aoi.bbox[3]]],
                          { padding: 60, duration: 800 }
                        )
                      }
                    }}
                  >
                    🔍 Zoom
                  </button>
                </div>
              </div>
            )
          })}
          {aois.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, padding: '8px 0' }}>
              Piirrä AOI kartalle ↓
            </div>
          )}
        </div>

        <div className="flight-sidebar-footer">
          <button
            className={`flight-draw-btn ${drawing ? 'active' : ''}`}
            onClick={drawing ? finishDrawing : startDrawing}
          >
            {drawing ? '✅ Viimeistele AOI' : '✏️ Piirrä AOI'}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flight-map-area">
        <div ref={mapContainer} className="flight-map-el" />

        {/* Filter panel */}
        <div className="flight-filter-panel">
          <div className="flight-filter-title">Suodattimet</div>
          {FILTERS.map(f => (
            <label key={f} className="flight-filter-row">
              <input
                type="checkbox"
                style={{ display: 'none' }}
                checked={activeFilters.has(f)}
                onChange={() => toggleFilter(f)}
              />
              <span
                className="flight-filter-dot"
                style={{
                  background: CAT_COLORS[f] || '#888',
                  opacity: activeFilters.has(f) ? 1 : 0.25,
                }}
              />
              <span style={{ opacity: activeFilters.has(f) ? 1 : 0.4 }}>{f}</span>
            </label>
          ))}
          <div style={{ marginTop: 8, fontSize: 10, color: '#475569' }}>
            {aircraft.length} lentokonetta
          </div>
        </div>

        {/* Drawing overlay hint */}
        {drawing && (
          <div className="flight-draw-overlay">
            <span>Klikkaa karttaa piirtääksesi alue</span>
            <button className="flight-draw-finish-btn" onClick={finishDrawing}>
              Valmis
            </button>
          </div>
        )}

        {/* AOI Chat overlay */}
        {chatAoi && (
          <AoiChatPanel
            aoi={chatAoi}
            aircraftInAoi={chatAoi.aircraftInAoi || []}
            getToken={getToken}
            onClose={() => setChatAoi(null)}
          />
        )}
      </div>
    </div>
  )
}
