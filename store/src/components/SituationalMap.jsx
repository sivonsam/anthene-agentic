import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLES = {
  night: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  day:   'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: { esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 }},
    layers: [{ id: 'esri-satellite', type: 'raster', source: 'esri' }]
  }
}

export default function SituationalMap({ api }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [style, setStyle] = useState('night')
  const [aircraft, setAircraft] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAircraft = useCallback(async () => {
    try {
      const result = await api.callTool('adsb_area', { lat: 62, lon: 25, dist_nm: 400 })
      const list = result?.aircraft || []
      setAircraft(list)
      // Update map source
      const map = mapInstance.current
      if (map && map.getSource('aircraft')) {
        map.getSource('aircraft').setData({
          type: 'FeatureCollection',
          features: list.map(a => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
            properties: { ...a, color: a.emergency ? '#ff3333' : a.military ? '#ff9900' : '#00cc88' }
          }))
        })
      }
    } catch (err) {
      console.error('ADS-B fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLES[style] || MAP_STYLES.night,
      center: [25, 62],
      zoom: 5
    })
    mapInstance.current = map

    map.on('load', () => {
      map.addSource('aircraft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'aircraft-circle',
        type: 'circle',
        source: 'aircraft',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      })
      fetchAircraft()
    })

    map.on('click', 'aircraft-circle', (e) => {
      const props = e.features[0].properties
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<b>${props.callsign || props.hex}</b><br/>✈ ${props.type || '?'} · ${props.registration || ''}<br/>⬆ ${props.alt_baro || '?'} ft · 💨 ${props.gs || '?'} kt`)
        .addTo(map)
    })

    map.on('mouseenter', 'aircraft-circle', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'aircraft-circle', () => { map.getCanvas().style.cursor = '' })

    const interval = setInterval(fetchAircraft, 8000)
    return () => { clearInterval(interval); map.remove() }
  }, [])

  // Style change
  useEffect(() => {
    if (mapInstance.current) mapInstance.current.setStyle(MAP_STYLES[style] || MAP_STYLES.night)
  }, [style])

  const counts = { total: aircraft.length, military: aircraft.filter(a => a.military).length, emergency: aircraft.filter(a => a.emergency).length }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Style switcher */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 4 }}>
        {['night','day','satellite'].map(s => (
          <button key={s} onClick={() => setStyle(s)}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: style === s ? '#6c63ff' : 'rgba(20,20,30,0.85)', color: '#fff', fontSize: 12 }}>
            {s === 'night' ? '🌙' : s === 'day' ? '☀️' : '🛰️'}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ position: 'absolute', bottom: 24, left: 12, zIndex: 10,
        background: 'rgba(10,10,20,0.85)', borderRadius: 10, padding: '10px 16px', color: '#eee' }}>
        {loading ? 'Haetaan lentoliikennettä...' : (
          <>
            <div>✈️ <b>{counts.total}</b> konetta</div>
            {counts.military > 0 && <div>🟠 <b>{counts.military}</b> sotilas</div>}
            {counts.emergency > 0 && <div>🔴 <b>{counts.emergency}</b> hätä</div>}
          </>
        )}
      </div>
    </div>
  )
}
