import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * AOIMap — freeform polygon drawing on a MapLibre map.
 * Click to add vertices, double-click to close and save.
 * value / onChange: GeoJSON Polygon geometry | null
 */
export default function AOIMap({ value, onChange }) {
  const mapRef = useRef(null)
  const map = useRef(null)
  const markersRef = useRef([])      // maplibre Markers for vertices
  const vertices = useRef([])        // [[lng, lat], ...]
  const [drawing, setDrawing] = useState(false)
  const [pointCount, setPointCount] = useState(0)
  const drawingRef = useRef(false)   // sync ref for event handlers

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current) return
    const m = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [25.0, 64.0],
      zoom: 4,
    })
    m.addControl(new maplibregl.NavigationControl(), 'top-right')
    m.on('load', () => {
      m.addSource('aoi', { type: 'geojson', data: emptyFC() })
      m.addSource('preview', { type: 'geojson', data: emptyFC() })

      m.addLayer({ id: 'aoi-fill',    type: 'fill', source: 'aoi',
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.2 } })
      m.addLayer({ id: 'aoi-outline', type: 'line', source: 'aoi',
        paint: { 'line-color': '#ef4444', 'line-width': 2 } })
      m.addLayer({ id: 'preview-line', type: 'line', source: 'preview',
        paint: { 'line-color': '#ef4444', 'line-width': 1.5, 'line-dasharray': [4, 3] } })

      if (value) renderPolygon(m, value.coordinates[0])
    })
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  // ── Render a closed polygon from coordinate ring ──────────────────────────
  function renderPolygon(m, ring) {
    if (!m.getSource('aoi')) return
    m.getSource('aoi').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] } }],
    })
  }

  function emptyFC() { return { type: 'FeatureCollection', features: [] } }

  // ── Drawing logic ─────────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    if (!map.current) return
    // Clear existing polygon while drawing
    clearMarkers()
    vertices.current = []
    setPointCount(0)
    map.current.getSource('aoi')?.setData(emptyFC())
    map.current.getSource('preview')?.setData(emptyFC())

    drawingRef.current = true
    setDrawing(true)
    map.current.getCanvas().style.cursor = 'crosshair'

    const onClick = (e) => {
      if (!drawingRef.current) return
      const pt = [e.lngLat.lng, e.lngLat.lat]
      vertices.current = [...vertices.current, pt]
      setPointCount(vertices.current.length)

      // Add a small dot marker
      const el = document.createElement('div')
      el.className = 'aoi-vertex'
      const marker = new maplibregl.Marker({ element: el }).setLngLat(pt).addTo(map.current)
      markersRef.current.push(marker)

      // Update dashed preview line
      if (vertices.current.length >= 2) updatePreview()
    }

    const onDblClick = (e) => {
      if (!drawingRef.current || vertices.current.length < 3) return
      e.preventDefault()
      finishDraw()
      map.current.off('click', onClick)
      map.current.off('dblclick', onDblClick)
    }

    map.current.on('click', onClick)
    map.current.on('dblclick', onDblClick)
  }, [])

  function updatePreview() {
    const pts = vertices.current
    if (!map.current?.getSource('preview') || pts.length < 2) return
    // Open line from first to last + closing preview
    const ring = [...pts, pts[0]]
    map.current.getSource('preview').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature',
        geometry: { type: 'LineString', coordinates: ring } }],
    })
  }

  function finishDraw() {
    drawingRef.current = false
    setDrawing(false)
    map.current.getCanvas().style.cursor = ''
    map.current.getSource('preview')?.setData(emptyFC())

    const pts = vertices.current
    const ring = [...pts, pts[0]] // close polygon
    renderPolygon(map.current, ring)
    clearMarkers()

    const geom = { type: 'Polygon', coordinates: [ring] }
    onChange(geom)
  }

  function clearMarkers() {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }

  function clearAoi() {
    clearMarkers()
    vertices.current = []
    setPointCount(0)
    drawingRef.current = false
    setDrawing(false)
    if (map.current) {
      map.current.getCanvas().style.cursor = ''
      map.current.getSource('aoi')?.setData(emptyFC())
      map.current.getSource('preview')?.setData(emptyFC())
    }
    onChange(null)
  }

  // ── Bbox helper for display ───────────────────────────────────────────────
  function bboxFromPolygon(geom) {
    if (!geom) return null
    const coords = geom.coordinates[0]
    const lats = coords.map(c => c[1])
    const lons = coords.map(c => c[0])
    return {
      lat_min: Math.min(...lats).toFixed(3),
      lat_max: Math.max(...lats).toFixed(3),
      lon_min: Math.min(...lons).toFixed(3),
      lon_max: Math.max(...lons).toFixed(3),
    }
  }

  const bb = bboxFromPolygon(value)

  return (
    <div className="aoi-map-wrapper">
      <div className="aoi-controls">
        {!drawing && (
          <button type="button" className="btn-draw" onClick={startDraw}>
            ✏️ {value ? 'Piirrä uudelleen' : 'Piirrä valvonta-alue'}
          </button>
        )}
        {drawing && (
          <span className="draw-hint">
            🖱️ Klikkaa pisteitä — <strong>tupla-klikkaus</strong> sulkee alueen
            {pointCount > 0 && ` · ${pointCount} pistettä`}
          </span>
        )}
        {drawing && (
          <button type="button" className="btn-clear-aoi" onClick={clearAoi}>✕ Peruuta</button>
        )}
        {!drawing && value && (
          <button type="button" className="btn-clear-aoi" onClick={clearAoi}>✕ Poista alue</button>
        )}
      </div>

      <div ref={mapRef} className="aoi-map" />

      {bb && !drawing && (
        <div className="aoi-coords">
          <span>📍 {bb.lat_min}°–{bb.lat_max}°N</span>
          <span>📍 {bb.lon_min}°–{bb.lon_max}°E</span>
          <span className="aoi-roadmap-note">🗺️ Roadmap: useampi alue yhdellä agentilla</span>
        </div>
      )}
    </div>
  )
}

