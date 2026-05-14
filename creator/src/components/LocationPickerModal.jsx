import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export default function LocationPickerModal({ onConfirm, onClose }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markerRef = useRef(null)
  const modeRef = useRef('point')
  const [mode, setMode] = useState('point') // 'point' | 'area' | 'search'
  const [picked, setPicked] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [areaCoords, setAreaCoords] = useState([])

  const clearPolygon = useCallback((map) => {
    if (!map) return
    if (map.getLayer('draw-fill')) map.removeLayer('draw-fill')
    if (map.getLayer('draw-line')) map.removeLayer('draw-line')
    if (map.getSource('draw-area')) map.removeSource('draw-area')
  }, [])

  const drawPolygon = useCallback((map, coords) => {
    if (coords.length < 2) return
    const src = map.getSource('draw-area')
    const geojson = {
      type: 'Feature',
      geometry: {
        type: coords.length >= 3 ? 'Polygon' : 'LineString',
        coordinates: coords.length >= 3 ? [[...coords, coords[0]]] : coords
      }
    }
    if (src) {
      src.setData(geojson)
    } else {
      map.addSource('draw-area', { type: 'geojson', data: geojson })
      map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-area', paint: { 'fill-color': '#7c6fcd', 'fill-opacity': 0.25 }, filter: ['==', '$type', 'Polygon'] })
      map.addLayer({ id: 'draw-line', type: 'line', source: 'draw-area', paint: { 'line-color': '#7c6fcd', 'line-width': 2 } })
    }
    if (coords.length >= 3) {
      const lats = coords.map(c => c[1]), lons = coords.map(c => c[0])
      setPicked({
        type: 'area',
        label: `alue (${coords.length} pistettä)`,
        bbox: {
          minLat: Math.min(...lats).toFixed(4), maxLat: Math.max(...lats).toFixed(4),
          minLon: Math.min(...lons).toFixed(4), maxLon: Math.max(...lons).toFixed(4)
        },
        center: {
          lat: ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(4),
          lon: ((Math.min(...lons) + Math.max(...lons)) / 2).toFixed(4)
        }
      })
    }
  }, [])

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE,
      center: [25, 62],
      zoom: 5
    })
    mapInstance.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('click', (e) => {
      const currentMode = modeRef.current
      if (currentMode === 'point' || currentMode === 'search') {
        const { lat, lng } = e.lngLat
        if (markerRef.current) markerRef.current.remove()
        const el = document.createElement('div')
        el.style.cssText = 'width:18px;height:18px;background:#7c6fcd;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px #0006'
        markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
        setPicked({ lat: lat.toFixed(5), lon: lng.toFixed(5), label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
      } else if (currentMode === 'area') {
        setAreaCoords(prev => {
          const next = [...prev, [e.lngLat.lng, e.lngLat.lat]]
          drawPolygon(map, next)
          return next
        })
      }
    })

    return () => map.remove()
  }, [drawPolygon])

  useEffect(() => {
    modeRef.current = mode
    if (!mapInstance.current) return
    if (mode !== 'area') {
      setAreaCoords([])
      clearPolygon(mapInstance.current)
    }
    if (mode !== 'point' && mode !== 'search') {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
      if (mode !== 'area') setPicked(null)
    }
  }, [mode, clearPolygon])

  async function doSearch() {
    if (!searchQ.trim()) return
    try {
      const r = await fetch(`${NOMINATIM}?format=json&q=${encodeURIComponent(searchQ)}&limit=5&accept-language=fi`, {
        headers: { 'User-Agent': 'Anthene/1.0' }
      })
      const data = await r.json()
      setSearchResults(data)
    } catch { setSearchResults([]) }
  }

  function selectSearchResult(item) {
    const lat = parseFloat(item.lat), lon = parseFloat(item.lon)
    mapInstance.current?.flyTo({ center: [lon, lat], zoom: 10 })
    if (markerRef.current) markerRef.current.remove()
    const el = document.createElement('div')
    el.style.cssText = 'width:18px;height:18px;background:#7c6fcd;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px #0006'
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(mapInstance.current)
    setPicked({ lat: lat.toFixed(5), lon: lon.toFixed(5), label: item.display_name.split(',').slice(0, 2).join(', ') })
    setSearchResults([])
  }

  function handleConfirm() {
    if (!picked) return
    let text = ''
    if (picked.type === 'area') {
      text = `📍 Alue kartalla: keskipiste lat ${picked.center.lat}, lon ${picked.center.lon} (bbox: lat ${picked.bbox.minLat}–${picked.bbox.maxLat}, lon ${picked.bbox.minLon}–${picked.bbox.maxLon})`
    } else {
      text = `📍 Sijainti: ${picked.label} (lat: ${picked.lat}, lon: ${picked.lon})`
    }
    onConfirm(text)
  }

  const canConfirm = picked && (picked.type !== 'area' || areaCoords.length >= 3)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0f1a2e', borderBottom: '1px solid #1e3a5f', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '.95rem' }}>📍 Valitse sijainti tai alue</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {[['point', '📍 Piste'], ['area', '✏️ Alue'], ['search', '🔍 Haku']].map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '4px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600,
              background: mode === m ? '#7c6fcd' : '#1e3a5f', color: mode === m ? '#fff' : '#94a3b8'
            }}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid #1e3a5f', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '.82rem' }}>Peruuta</button>
          <button onClick={handleConfirm} disabled={!canConfirm} style={{
            padding: '5px 14px', borderRadius: 8, border: 'none', cursor: canConfirm ? 'pointer' : 'default',
            background: canConfirm ? '#7c6fcd' : '#1e3a5f', color: canConfirm ? '#fff' : '#475569', fontSize: '.82rem', fontWeight: 700
          }}>Käytä sijaintia ↵</button>
        </div>
      </div>

      {/* Search bar (search mode) */}
      {mode === 'search' && (
        <div style={{ background: '#0a1525', borderBottom: '1px solid #1e3a5f', padding: '8px 16px', flexShrink: 0, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Hae paikkaa… (esim. Helsinki, Tampere, Oulu)"
              style={{ flex: 1, background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2e8f0', padding: '6px 12px', fontSize: '.85rem', outline: 'none' }}
              autoFocus
            />
            <button onClick={doSearch} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#7c6fcd', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem' }}>Hae</button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ position: 'absolute', left: 16, right: 16, top: '100%', background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 8, zIndex: 100, maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
              {searchResults.map((r, i) => (
                <div key={i} onClick={() => selectSearchResult(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8', borderBottom: '1px solid #111e30' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1e3a5f'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  {r.display_name.split(',').slice(0, 3).join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mode hint */}
      <div style={{ background: '#07111f', padding: '5px 16px', flexShrink: 0, fontSize: '.75rem', color: '#3a5070' }}>
        {mode === 'point' && '🖱️ Klikkaa karttaa asettaaksesi pisteen'}
        {mode === 'area' && `✏️ Klikkaa kartalle alue-pisteet (min. 3). Pisteitä: ${areaCoords.length}`}
        {mode === 'search' && '🔍 Hae paikka nimellä → klikkaa tulosta → napsauta karttaa tarkentaaksesi'}
        {picked && <span style={{ marginLeft: 16, color: '#7c6fcd', fontWeight: 600 }}>✓ Valittu: {picked.label}</span>}
        {mode === 'area' && areaCoords.length >= 3 && (
          <button onClick={() => { setAreaCoords([]); clearPolygon(mapInstance.current); setPicked(null) }}
            style={{ marginLeft: 12, background: 'none', border: '1px solid #1e3a5f', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '1px 8px', fontSize: '.72rem' }}>
            Tyhjennä alue
          </button>
        )}
      </div>

      {/* Map */}
      <div ref={mapRef} style={{ flex: 1 }} />
    </div>
  )
}
