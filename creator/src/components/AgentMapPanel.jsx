import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function parseToolOutput(tool, inputStr, outputStr) {
  let input = {}, output = {}
  try { input = typeof inputStr === 'string' ? JSON.parse(inputStr) : inputStr } catch {}
  try { output = typeof outputStr === 'string' ? JSON.parse(outputStr) : outputStr } catch {}

  const features = []

  if (tool === 'adsb_area' || tool === 'adsb_military') {
    const aircraft = output.aircraft || []
    aircraft.forEach(a => {
      if (!a.lat || !a.lon) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: {
          color: a.emergency ? '#ff3333' : a.military ? '#ff9900' : '#00cc88',
          label: a.callsign || a.hex || '?',
          popup: `✈️ ${a.callsign || a.hex}\n${a.type || ''} ${a.registration || ''}\n⬆ ${a.alt_baro || '?'} ft · 💨 ${a.gs || '?'} kt`,
          layer: 'adsb'
        }
      })
    })
  }

  if (tool === 'weather_area' || tool === 'fmi_observations') {
    const lat = output.lat ?? input.lat
    const lon = output.lon ?? input.lon
    if (lat && lon) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          color: '#60a5fa',
          label: `${output.temperature_c ?? output.temperature ?? '?'}°C`,
          popup: `🌡️ ${output.temperature_c ?? output.temperature ?? '?'}°C\n💨 ${output.wind_speed_kt ?? output.wind_speed ?? '?'} kt\n☁️ ${output.cloud_cover_pct ?? output.cloud_cover ?? '?'}%\n💧 ${output.humidity_pct ?? output.humidity ?? '?'}%`,
          layer: 'weather'
        }
      })
    }
  }

  if (tool === 'effis_fires' || tool === 'effis_risk') {
    const fires = output.fires || output.hotspots || []
    fires.forEach(f => {
      if (!f.lat || !f.lon) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: {
          color: '#f97316',
          label: '🔥',
          popup: `🔥 Tulipalo\nPinta-ala: ${f.area_ha || '?'} ha\nAktiivisuus: ${f.activity || '?'}`,
          layer: 'fires'
        }
      })
    })
  }

  if (tool === 'nasa_firms_viirs' || tool === 'nasa_firms_modis') {
    const hotspots = output.hotspots || output.fires || []
    hotspots.forEach(h => {
      if (!h.lat || !h.lon) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
        properties: {
          color: '#ef4444',
          label: '🛰️',
          popup: `🛰️ NASA FIRMS\nFRP: ${h.frp || '?'} MW\n${h.acq_date || ''}`,
          layer: 'firms'
        }
      })
    })
  }

  if (tool === 'ais_area' || tool === 'ais_vessel') {
    const vessels = output.vessels || (output.mmsi ? [output] : [])
    vessels.forEach(v => {
      if (!v.lat || !v.lon) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        properties: {
          color: '#a78bfa',
          label: v.name || v.mmsi || '🚢',
          popup: `🚢 ${v.name || v.mmsi}\nTyyppi: ${v.type || '?'}\nNopeus: ${v.speed || '?'} kt`,
          layer: 'vessels'
        }
      })
    })
  }

  if (tool === 'stuk_radiation' || tool === 'stuk_stations') {
    const stations = output.stations || (output.dose_rate !== undefined ? [{ ...output, ...input }] : [])
    stations.forEach(s => {
      if (!s.lat || !s.lon) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          color: s.dose_rate > 0.3 ? '#ef4444' : '#fbbf24',
          label: `${s.dose_rate ?? '?'} µSv/h`,
          popup: `☢️ STUK ${s.name || ''}\nAnnosnopeus: ${s.dose_rate || '?'} µSv/h`,
          layer: 'radiation'
        }
      })
    })
  }

  if (tool === 'map_geocode') {
    const lat = output.lat ?? output.latitude
    const lon = output.lon ?? output.longitude
    if (lat && lon) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          color: '#7c6fcd',
          label: output.name || output.display_name || '📍',
          popup: `📍 ${output.name || output.display_name || 'Sijainti'}`,
          layer: 'geocode'
        }
      })
    }
  }

  return features
}

const LAYER_LABELS = {
  adsb: '✈️ Lentokoneet',
  weather: '🌡️ Sää',
  fires: '🔥 Tulipalot',
  firms: '🛰️ NASA FIRMS',
  vessels: '🚢 Alukset',
  radiation: '☢️ Säteily',
  geocode: '📍 Paikka'
}

export default function AgentMapPanel({ agent, toolResults = [] }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const [layerCounts, setLayerCounts] = useState({})

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

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !map.loaded()) return

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

      const popup = new maplibregl.Popup({ offset: 10 })
        .setHTML(`<div style="white-space:pre;font-size:12px;color:#e2e8f0;background:#0f172a;padding:6px 10px;border-radius:6px;max-width:220px">${props.popup}</div>`)

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
  }, [toolResults])

  const hasData = Object.keys(layerCounts).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#07111f' }}>
      <div style={{ padding: '8px 12px', background: '#0f1a2e', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#7c6fcd' }}>🗺️ Tilannekuva</span>
        {agent?.aoi && (
          <span style={{ fontSize: '.7rem', background: '#7c6fcd20', border: '1px solid #7c6fcd40', borderRadius: 20, padding: '1px 8px', color: '#a29ae0' }}>AOI</span>
        )}
        {Object.entries(layerCounts).map(([layer, count]) => (
          <span key={layer} style={{ fontSize: '.7rem', background: '#1e3a5f', borderRadius: 20, padding: '1px 8px', color: '#94a3b8' }}>
            {LAYER_LABELS[layer] || layer}: {count}
          </span>
        ))}
        {!hasData && <span style={{ fontSize: '.72rem', color: '#3a5070' }}>Odottaa työkalukutsuja…</span>}
      </div>
      <div ref={mapRef} style={{ flex: 1 }} />
    </div>
  )
}
