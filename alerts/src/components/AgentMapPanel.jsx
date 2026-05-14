import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { API_BASE } from '../config'

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const DEV_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZXYtdXNlci0xIiwibmFtZSI6IkRldiBVc2VyIiwiZW1haWwiOiJkZXZAYW50aGVuZS5haSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.'

function parseToolOutput(tool, inputStr, outputStr) {
  let input = {}, output = {}
  try { input = typeof inputStr === 'string' ? JSON.parse(inputStr) : (inputStr || {}) } catch {}
  try { output = typeof outputStr === 'string' ? JSON.parse(outputStr) : (outputStr || {}) } catch {}

  const features = []

  // ✈️ Aircraft — ADS-B Exchange (all area/list tools)
  if (['adsb_area','adsb_military','adsb_emergency',
       'adsb_by_registration','adsb_by_callsign','adsb_by_squawk','adsb_by_type'].includes(tool)) {
    const aircraft = output.aircraft || (output.hex ? [output] : [])
    aircraft.forEach(a => {
      if (!a.lat || !a.lon) return
      const isEmerg = a.emergency || a.squawk_alert
      const isMil = a.military
      const color = isEmerg ? '#ff3333' : isMil ? '#ff9900' : '#00cc88'
      const emergBadge = isEmerg ? `🚨 ${a.emergency || a.squawk_alert}\n` : ''
      const milBadge = isMil ? '🪖 ' : ''
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[a.lon,a.lat] }, properties:{
        color,
        label: a.callsign || a.registration || a.hex || '?',
        popup: `${milBadge}✈️ ${a.callsign||a.hex}\n${emergBadge}${a.type||''} ${a.registration||''}\n${a.operator ? a.operator+'\n' : ''}⬆ ${a.altitude_ft||'?'} ft · �� ${a.ground_speed_kt||'?'} kt`,
        layer:'adsb',
        trackable: true,
        track_callsign: a.callsign || '',
        track_registration: a.registration || '',
        track_hex: a.hex || '',
        track_label: a.callsign || a.registration || a.hex || '?',
      }})
    })
  }

  // ✈️ Aircraft — OpenSky Network
  if (['opensky_area','opensky_aircraft'].includes(tool)) {
    const aircraft = output.aircraft || (output.hex ? [output] : [])
    aircraft.forEach(a => {
      const lat = a.lat ?? a.latitude
      const lon = a.lon ?? a.longitude
      if (!lat || !lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
        color: '#00cc88',
        label: a.callsign || a.hex || '?',
        popup: `✈️ ${a.callsign||a.hex||'?'}\n${a.country||''}\n⬆ ${a.altitude_ft||'?'} ft · 💨 ${a.ground_speed_kt||'?'} kt`,
        layer:'adsb'
      }})
    })
  }

  // ✈️ Aircraft trail — ADS-B Exchange
  if (tool === 'aircraft_trail') {
    const trail = output.trail || []
    trail.forEach((p, i) => {
      if (!p.lat || !p.lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[p.lon,p.lat] }, properties:{
        color: i === trail.length-1 ? '#00cc88' : '#334155',
        label: i === trail.length-1 ? (output.callsign||output.hex||'✈️') : '',
        popup: `✈️ ${output.callsign||output.hex||'?'}\n⬆ ${p.altitude_ft||'?'} ft · 💨 ${p.ground_speed_kt||'?'} kt`,
        layer:'adsb'
      }})
    })
  }

  // ✈️ Aircraft detail
  if (tool === 'aircraft_detail') {
    const lat = output.lat, lon = output.lon
    if (lat && lon) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
      color:'#00cc88', label: output.callsign||output.hex||'?',
      popup:`✈️ ${output.callsign||output.hex}\n${output.type||''} ${output.registration||''}\n⬆ ${output.altitude_ft||'?'} ft`,
      layer:'adsb'
    }})
  }

  // 🌡️ Weather
  if (['weather_area','fmi_observations'].includes(tool)) {
    const lat = output.lat ?? input.lat, lon = output.lon ?? input.lon
    if (lat && lon) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
      color:'#60a5fa',
      label:`${output.temperature_c??output.temperature??'?'}°C`,
      popup:`🌡️ ${output.temperature_c??output.temperature??'?'}°C\n💨 ${output.wind_speed_kt??output.wind_speed??'?'} kt\n☁️ ${output.cloud_cover_pct??output.cloud_cover??'?'}%`,
      layer:'weather'
    }})
  }

  // ⚡ Lightning
  if (tool === 'fmi_lightning') {
    const strikes = output.strikes || []
    strikes.slice(0,100).forEach(s => {
      if (!s.lat || !s.lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[s.lon,s.lat] }, properties:{
        color:'#fbbf24', label:'⚡',
        popup:`⚡ Salamahavainto`,
        layer:'lightning'
      }})
    })
  }

  // 🔥 Fires — EFFIS
  if (tool === 'effis_fires') {
    const fires = output.fires || output.hotspots || []
    fires.forEach(f => {
      if (!f.lat || !f.lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[f.lon,f.lat] }, properties:{
        color:'#f97316', label:'🔥',
        popup:`🔥 Metsäpalo\nPinta-ala: ${f.area_ha||'?'} ha`,
        layer:'fires'
      }})
    })
  }

  // 🛰️ Fires — NASA FIRMS
  if (tool === 'firms_fires') {
    const hotspots = output.hotspots || output.fires || []
    hotspots.forEach(h => {
      if (!h.lat || !h.lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[h.lon,h.lat] }, properties:{
        color:'#ef4444', label:'🛰️',
        popup:`🛰️ NASA FIRMS\nFRP: ${h.frp||'?'} MW\n${h.acq_date||''}`,
        layer:'firms'
      }})
    })
  }

  // 🚢 Vessels — Digitraffic AIS
  if (['vessels_area','vessels_bbox'].includes(tool)) {
    const vessels = output.vessels || []
    vessels.forEach(v => {
      const lat = v.latitude ?? v.lat, lon = v.longitude ?? v.lon
      if (!lat || !lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
        color: (v.sog_knots||0) > 1 ? '#a78bfa' : '#64748b',
        label: String(v.mmsi||'🚢'),
        popup:`🚢 MMSI: ${v.mmsi||'?'}\nNopeus: ${v.sog_knots||'?'} kn · Kurssi: ${v.cog_deg||'?'}°\nTila: ${v.nav_status||'?'}\nEtäisyys: ${v.distance_nm||'?'} nm`,
        layer:'vessels'
      }})
    })
  }

  if (tool === 'vessel_detail') {
    const lat = output.latitude ?? output.lat, lon = output.longitude ?? output.lon
    if (lat && lon) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
      color:'#a78bfa',
      label: output.name || String(output.mmsi||'🚢'),
      popup:`🚢 ${output.name||output.mmsi}\nNopeus: ${output.sog_knots||'?'} kn\nTila: ${output.nav_status||'?'}\nDest: ${output.destination||'?'}`,
      layer:'vessels'
    }})
  }

  // ☢️ Radiation
  if (tool === 'stuk_radiation') {
    const stations = output.stations || (output.dose_rate !== undefined ? [{ ...output, ...input }] : [])
    stations.forEach(s => {
      if (!s.lat || !s.lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[s.lon,s.lat] }, properties:{
        color: (s.dose_rate||0) > 0.3 ? '#ef4444' : '#fbbf24',
        label:`${s.dose_rate??'?'} µSv/h`,
        popup:`☢️ STUK ${s.name||''}\nAnnosnopeus: ${s.dose_rate||'?'} µSv/h`,
        layer:'radiation'
      }})
    })
  }

  // 🌋 GDACS alerts
  if (tool === 'gdacs_alerts') {
    const alerts = output.alerts || []
    alerts.forEach(a => {
      const lat = a.lat ?? a.latitude, lon = a.lon ?? a.longitude
      if (!lat || !lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
        color: a.alert_level === 'Red' ? '#ef4444' : '#f97316',
        label: a.event_type || '🌋',
        popup:`🌋 ${a.title||a.event_type}\nTaso: ${a.alert_level||'?'}`,
        layer:'gdacs'
      }})
    })
  }

  // 📍 Geocode
  if (tool === 'map_geocode') {
    const lat = output.lat ?? output.latitude, lon = output.lon ?? output.longitude
    if (lat && lon) features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{
      color:'#7c6fcd', label: output.name || output.display_name || '📍',
      popup:`📍 ${output.name||output.display_name||'Sijainti'}`,
      layer:'geocode'
    }})
  }

  // 🔬 Cluster analysis — plot cluster centers
  if (tool === 'detect_clusters') {
    const clusters = output.clusters || []
    clusters.forEach(c => {
      if (!c.center_lat || !c.center_lon) return
      features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[c.center_lon,c.center_lat] }, properties:{
        color:'#f59e0b',
        label:`${c.member_count}`,
        popup:`🔬 Klusteri ${c.cluster_id}\nJäseniä: ${c.member_count}\nKeskipiste: ${c.center_lat?.toFixed(3)}, ${c.center_lon?.toFixed(3)}`,
        layer:'clusters'
      }})
    })
  }

  return features
}

const LAYER_LABELS = {
  adsb: '✈️ Lentokoneet',
  weather: '🌡️ Sää',
  lightning: '⚡ Salamat',
  fires: '🔥 Tulipalot',
  firms: '🛰️ Satelliittipalot',
  vessels: '🚢 Alukset',
  radiation: '☢️ Säteily',
  gdacs: '🌋 Katastrofit',
  geocode: '📍 Paikka',
  clusters: '🔬 Klusterit',
}

export default function AgentMapPanel({ agent, toolResults = [], onAoiChange }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const [layerCounts, setLayerCounts] = useState({})
  const [drawing, setDrawing] = useState(false)
  const [drawnAoi, setDrawnAoi] = useState(null)
  const drawVertices = useRef([])
  const drawMarkers = useRef([])
  const drawingRef = useRef(false)

  // Aircraft tracking state
  const [trackedAc, setTrackedAc] = useState(null)   // { callsign, registration, hex, label }
  const trackHistory = useRef([])                      // [[lon,lat], ...]  max 30 positions
  const trackMarkerRef = useRef(null)
  const trackIntervalRef = useRef(null)

  async function fetchTrackPosition(info) {
    try {
      const tool = info.callsign ? 'adsb_by_callsign' : 'adsb_by_registration'
      const body = info.callsign ? { callsign: info.callsign } : { registration: info.registration }
      const res = await fetch(`${API_BASE}/api/tools/call/${tool}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEV_TOKEN}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) return null
      const data = await res.json()
      const aircraft = data.aircraft || (data.lat ? [data] : [])
      return aircraft.find(a => a.lat && a.lon) || null
    } catch { return null }
  }

  function updateTrackLayers(pos, acData) {
    const map = mapInstance.current
    if (!map || !map.loaded()) return
    const history = trackHistory.current
    const lineData = { type: 'Feature', geometry: { type: 'LineString', coordinates: history.length > 1 ? history : [] } }
    if (map.getSource('track-trail')) {
      map.getSource('track-trail').setData(lineData)
    } else if (history.length > 1) {
      map.addSource('track-trail', { type: 'geojson', data: lineData })
      map.addLayer({ id: 'track-trail', type: 'line', source: 'track-trail',
        paint: { 'line-color': '#60a5fa', 'line-width': 3, 'line-opacity': 0.85 } })
    }
    if (trackMarkerRef.current) {
      trackMarkerRef.current.setLngLat(pos)
    } else {
      const el = document.createElement('div')
      el.title = acData?.callsign || ''
      el.style.cssText = 'width:22px;height:22px;background:#60a5fa;border:3px solid white;border-radius:50%;box-shadow:0 0 14px #60a5fa99;cursor:pointer;'
      trackMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map)
    }
    map.panTo(pos, { duration: 1000 })
  }

  async function doTrackUpdate(info) {
    const ac = await fetchTrackPosition(info)
    if (!ac) return
    const pos = [ac.lon, ac.lat]
    trackHistory.current = [...trackHistory.current.slice(-29), pos]
    updateTrackLayers(pos, ac)
  }

  function startTracking(info) {
    if (trackIntervalRef.current) clearInterval(trackIntervalRef.current)
    trackHistory.current = []
    setTrackedAc(info)
    doTrackUpdate(info)
    trackIntervalRef.current = setInterval(() => doTrackUpdate(info), 30000)
  }

  function stopTracking() {
    if (trackIntervalRef.current) { clearInterval(trackIntervalRef.current); trackIntervalRef.current = null }
    setTrackedAc(null)
    trackHistory.current = []
    if (trackMarkerRef.current) { trackMarkerRef.current.remove(); trackMarkerRef.current = null }
    const map = mapInstance.current
    if (map) {
      if (map.getLayer('track-trail')) map.removeLayer('track-trail')
      if (map.getSource('track-trail')) map.removeSource('track-trail')
    }
  }

  // Register global callback for popup track buttons
  useEffect(() => {
    window.__antheneTrack = (callsign, registration, hex, label) => {
      startTracking({ callsign, registration, hex, label })
    }
    return () => { delete window.__antheneTrack }
  }, [])

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => { if (trackIntervalRef.current) clearInterval(trackIntervalRef.current) }
  }, [])

  useEffect(() => {
    let center = [25, 62], zoom = 5
    if (agent?.aoi?.coordinates) {
      try {
        const coords = agent.aoi.coordinates[0]
        const lons = coords.map(c => c[0]), lats = coords.map(c => c[1])
        center = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
        zoom = 7
      } catch {}
    }

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STYLE,
      center,
      zoom
    })
    mapInstance.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', () => {
      if (agent?.aoi) {
        map.addSource('aoi', { type: 'geojson', data: agent.aoi })
        map.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#7c6fcd', 'fill-opacity': 0.1 } })
        map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#7c6fcd', 'line-width': 2, 'line-dasharray': [3, 2] } })
      }
    })

    return () => map.remove()
  }, [])

  // Render drawnAoi polygon on map whenever it changes
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !map.loaded()) return
    const SRC = 'drawn-aoi'
    if (map.getSource(SRC)) {
      if (drawnAoi) {
        map.getSource(SRC).setData(drawnAoi)
      } else {
        if (map.getLayer('drawn-aoi-fill')) map.removeLayer('drawn-aoi-fill')
        if (map.getLayer('drawn-aoi-line')) map.removeLayer('drawn-aoi-line')
        map.removeSource(SRC)
      }
    } else if (drawnAoi) {
      map.addSource(SRC, { type: 'geojson', data: drawnAoi })
      map.addLayer({ id: 'drawn-aoi-fill', type: 'fill', source: SRC, paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.08 } })
      map.addLayer({ id: 'drawn-aoi-line', type: 'line', source: SRC, paint: { 'line-color': '#ef4444', 'line-width': 2 } })
    }
  }, [drawnAoi])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const applyMarkers = () => {

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const counts = {}
    const allFeatures = []

    toolResults.forEach(({ tool, input, output }) => {
      const features = parseToolOutput(tool, input, output)
      features.forEach(f => {
        allFeatures.push(f)
        counts[f.properties.layer] = (counts[f.properties.layer] || 0) + 1
      })
    })

    allFeatures.forEach(f => {
      const [lon, lat] = f.geometry.coordinates
      const props = f.properties

      const el = document.createElement('div')
      el.style.cssText = `
        background: ${props.color};
        border: 2px solid rgba(255,255,255,0.8);
        border-radius: 50%;
        width: 14px; height: 14px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      `

      let popupHtml
      if (props.trackable) {
        const cs = (props.track_callsign || '').replace(/'/g, "\\'")
        const reg = (props.track_registration || '').replace(/'/g, "\\'")
        const hex = (props.track_hex || '').replace(/'/g, "\\'")
        const lbl = (props.track_label || '').replace(/'/g, "\\'")
        popupHtml = `<div style="font-size:12px;color:#e2e8f0;background:#0f172a;padding:6px 10px;border-radius:6px;max-width:220px">
          <pre style="margin:0 0 6px;white-space:pre-wrap">${props.popup}</pre>
          <button onclick="window.__antheneTrack('${cs}','${reg}','${hex}','${lbl}')" style="font-size:11px;background:#1e3a5f;border:1px solid #60a5fa;border-radius:12px;padding:2px 10px;color:#60a5fa;cursor:pointer;width:100%">🎯 Seuraa kartalla</button>
        </div>`
      } else {
        popupHtml = `<div style="white-space:pre;font-size:12px;color:#e2e8f0;background:#0f172a;padding:6px 10px;border-radius:6px;max-width:220px">${props.popup}</div>`
      }

      const popup = new maplibregl.Popup({ offset: 10 }).setHTML(popupHtml)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })

    if (allFeatures.length > 0 && !agent?.aoi) {
      const lons = allFeatures.map(f => f.geometry.coordinates[0])
      const lats = allFeatures.map(f => f.geometry.coordinates[1])
      if (lons.length > 1) {
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 60, maxZoom: 12 }
        )
      } else {
        map.flyTo({ center: [lons[0], lats[0]], zoom: 9 })
      }
    }

    setLayerCounts(counts)
    } // applyMarkers
    if (map.loaded()) applyMarkers()
    else map.once('load', applyMarkers)
  }, [toolResults])

  function _updatePreview(verts) {
    const map = mapInstance.current
    if (!map) return
    const PSRC = 'draw-preview'
    const lineData = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: verts.length > 1 ? verts : [] }
    }
    if (map.getSource(PSRC)) {
      map.getSource(PSRC).setData(lineData)
    } else {
      map.addSource(PSRC, { type: 'geojson', data: lineData })
      map.addLayer({ id: 'draw-preview-line', type: 'line', source: PSRC,
        paint: { 'line-color': '#ef4444', 'line-width': 2, 'line-dasharray': [4, 2] } })
    }
  }

  function _removePreview() {
    const map = mapInstance.current
    if (!map) return
    if (map.getLayer('draw-preview-line')) map.removeLayer('draw-preview-line')
    if (map.getSource('draw-preview')) map.removeSource('draw-preview')
  }

  function startDraw() {
    const map = mapInstance.current
    if (!map) return
    // clear any existing drawn AOI
    setDrawnAoi(null)
    drawVertices.current = []
    drawMarkers.current.forEach(m => m.remove())
    drawMarkers.current = []
    _removePreview()
    drawingRef.current = true
    setDrawing(true)
    map.getCanvas().style.cursor = 'crosshair'
    map.doubleClickZoom.disable()

    const onClick = (e) => {
      if (!drawingRef.current) return
      const pt = [e.lngLat.lng, e.lngLat.lat]
      const newVerts = [...drawVertices.current, pt]
      drawVertices.current = newVerts
      const el = document.createElement('div')
      el.style.cssText = 'width:8px;height:8px;background:#ef4444;border:2px solid white;border-radius:50%;cursor:crosshair;pointer-events:none;'
      const marker = new maplibregl.Marker({ element: el }).setLngLat(pt).addTo(map)
      drawMarkers.current.push(marker)
      _updatePreview(newVerts)
    }
    const onDblClick = (e) => {
      if (!drawingRef.current) return
      e.preventDefault()
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      drawingRef.current = false
      setDrawing(false)
      map.getCanvas().style.cursor = ''
      map.doubleClickZoom.enable()
      drawMarkers.current.forEach(m => m.remove())
      drawMarkers.current = []
      _removePreview()
      // dblclick fires two click events first — remove those 2 extra vertices
      const verts = drawVertices.current.slice(0, -2)
      if (verts.length < 3) return
      const ring = [...verts, verts[0]]
      const geom = { type: 'Polygon', coordinates: [ring] }
      setDrawnAoi(geom)
      if (onAoiChange) onAoiChange(geom)
    }
    map.on('click', onClick)
    map.on('dblclick', onDblClick)
  }

  function clearDraw() {
    setDrawnAoi(null)
    drawMarkers.current.forEach(m => m.remove())
    drawMarkers.current = []
    drawVertices.current = []
    if (onAoiChange) onAoiChange(null)
  }

  const hasData = Object.keys(layerCounts).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#07111f' }}>
      <div style={{ padding: '8px 12px', background: '#0f1a2e', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#7c6fcd' }}>🗺️ Tilannekuva</span>
        {(agent?.aoi || drawnAoi) && (
          <span style={{ fontSize: '.7rem', background: '#7c6fcd20', border: '1px solid #7c6fcd40', borderRadius: 20, padding: '1px 8px', color: '#a29ae0' }}>AOI</span>
        )}
        {onAoiChange && !drawing && (
          <button onClick={startDraw} title="Piirrä valvonta-alue kartalle" style={{ fontSize: '.7rem', background: '#1e3a5f', border: '1px solid #2d5a8f', borderRadius: 20, padding: '2px 10px', color: '#60a5fa', cursor: 'pointer' }}>
            ✏️ {drawnAoi ? 'Piirrä uudelleen' : 'Rajaa alue'}
          </button>
        )}
        {onAoiChange && drawing && (
          <span style={{ fontSize: '.72rem', color: '#fbbf24' }}>🖱️ Klikkaa pisteitä · <strong>2×klikkaus</strong> sulkee</span>
        )}
        {onAoiChange && drawnAoi && !drawing && (
          <button onClick={clearDraw} title="Poista alue" style={{ fontSize: '.7rem', background: '#1e1e2e', border: '1px solid #3f3f5f', borderRadius: 20, padding: '2px 8px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        )}
        {Object.entries(layerCounts).map(([layer, count]) => (
          <span key={layer} style={{ fontSize: '.7rem', background: '#1e3a5f', borderRadius: 20, padding: '1px 8px', color: '#94a3b8' }}>
            {LAYER_LABELS[layer] || layer}: {count}
          </span>
        ))}
        {!hasData && <span style={{ fontSize: '.72rem', color: '#3a5070' }}>Odottaa työkalukutsuja…</span>}
        {trackedAc && (
          <span style={{ fontSize: '.7rem', background: '#1e3a5f', border: '1px solid #60a5fa60', borderRadius: 20, padding: '2px 10px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
            📡 {trackedAc.label}
            <button onClick={stopTracking} title="Lopeta seuranta" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1 }}>✕</button>
          </span>
        )}
      </div>
      <div ref={mapRef} style={{ flex: 1 }} />
    </div>
  )
}
