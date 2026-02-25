import { useEffect, useRef, useState } from 'react'
import { GeoJSON, useMap } from 'react-leaflet'
import L, { type Layer, type LeafletMouseEvent, type PathOptions } from 'leaflet'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import { getAQIColor } from '@/utils/aqiColor'
import type { RegionAQIData } from '@/utils/mapTypes'

// ---------------------------------------------------------------------------
// GeoJSON source — Natural Earth country boundaries (public domain)
// Swap this URL to change source resolution without touching component logic.
// ---------------------------------------------------------------------------
const SEA_GEOJSON_URL =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'

/** GeoJSON feature properties we rely on for country matching */
interface CountryProperties {
  ADMIN?: string // full country name
  ISO_A3?: string // 3-letter ISO code
  [key: string]: unknown
}

interface CountryLayerProps {
  /** AQI data keyed by lowercase country name */
  aqiData: Map<string, RegionAQIData>
  /** Leaflet pane to render in */
  pane?: string
}

/**
 * Renders a GeoJSON layer for Southeast Asian countries.
 *
 * Each polygon is colored based on the country's AQI via `getAQIColor`.
 * Countries with no data render in a neutral dark gray for visual context.
 *
 * Interactions:
 *   - Hover  → highlights border, shows styled tooltip
 *   - Click  → fits bounds + opens popup with full AQI details
 *
 * Architecture note:
 *   Coupled only to `RegionAQIData` and a URL. Adapting to another region
 *   only requires swapping the GeoJSON URL.
 */
export function CountryLayer({ aqiData, pane }: CountryLayerProps) {
  const map = useMap()
  const geojsonRef = useRef<L.GeoJSON | null>(null)
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null)

  // Fetch GeoJSON once on mount
  useEffect(() => {
    let cancelled = false
    fetch(SEA_GEOJSON_URL)
      .then(r => r.json())
      .then((data: FeatureCollection) => {
        if (!cancelled) setGeoData(data)
      })
      .catch(err => console.error('[CountryLayer] Failed to load GeoJSON:', err))
    return () => {
      cancelled = true
    }
  }, [])

  // Re-color polygons whenever AQI data updates
  useEffect(() => {
    if (!geojsonRef.current) return
    geojsonRef.current.setStyle(feature =>
      featureStyle(feature as Feature<Geometry, CountryProperties>)
    )
  }, [aqiData])

  function getRegion(
    feature: Feature<Geometry, CountryProperties> | undefined
  ): RegionAQIData | undefined {
    const props = feature?.properties
    if (!props) return undefined

    // Try multiple possible name properties common in GeoJSON datasets
    const possibleNames = [
      props.name,
      props.NAME,
      props.admin,
      props.ADMIN,
      props.sovereignt,
      props.SOVEREIGNT,
    ]

    for (const rawName of possibleNames) {
      if (typeof rawName === 'string') {
        const name = rawName.toLowerCase().trim()
        const region = aqiData.get(name)
        if (region) return region
      }
    }

    return undefined
  }

  function featureStyle(feature: Feature<Geometry, CountryProperties> | undefined): PathOptions {
    const region = getRegion(feature)
    if (!region) return noDataStyle()

    return {
      fillColor: getAQIColor(region.aqi),
      fillOpacity: 0.75,
      color: 'rgba(255,255,255,0.15)',
      weight: 1,
    }
  }

  function noDataStyle(): PathOptions {
    return {
      fillColor: '#1e293b',
      fillOpacity: 0.35,
      color: 'rgba(255,255,255,0.05)',
      weight: 0.5,
    }
  }

  function highlightedStyle(): PathOptions {
    return {
      weight: 3,
      color: '#ffffff',
      fillOpacity: 0.95,
      dashArray: '',
    }
  }

  function onEachFeature(feature: Feature<Geometry, CountryProperties>, layer: Layer) {
    const region = getRegion(feature)
    if (!region) return

    const color = getAQIColor(region.aqi)

    // ---------- Tooltip ----------
    layer.bindTooltip(
      `<div style="
        padding:6px 10px;
        background:#0f172a;
        border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;
        box-shadow:0 10px 15px -3px rgba(0,0,0,0.4);
        font-family:sans-serif;
        min-width:140px;
        pointer-events:none;
      ">
        <div style="font-weight:700;font-size:12px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">${region.name}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:24px;font-weight:900;color:${color};line-height:1;">${region.aqi}</div>
          <div style="font-size:11px;font-weight:600;color:#f1f5f9;background:${color}33;padding:2px 6px;border-radius:4px;">${region.category}</div>
        </div>
      </div>`,
      {
        permanent: false,
        sticky: true,
        opacity: 1,
        direction: 'top',
        offset: [0, -6],
        className: 'custom-tooltip',
      }
    )

    // ---------- Popup ----------
    layer.bindPopup(
      `<div style="
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        min-width:160px;
        padding:2px 0;
      ">
        <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Country</div>
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:10px;">${region.name}</div>
        <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Air Quality Index</div>
          <div style="display:flex;align-items:flex-end;gap:8px;margin-bottom:6px;">
            <span style="font-size:40px;font-weight:900;line-height:1;color:${color};">${region.aqi}</span>
            <span style="font-size:11px;color:#94a3b8;margin-bottom:5px;">AQI</span>
          </div>
          <span style="
            background:${color}22;border:1px solid ${color}55;
            color:${color};padding:3px 10px;border-radius:99px;
            font-size:11px;font-weight:600;
          ">${region.category}</span>
        </div>
      </div>`,
      { closeButton: false, maxWidth: 240 }
    )

    // ---------- Events ----------
    layer.on({
      mouseover(e: LeafletMouseEvent) {
        const path = e.target as L.Path
        path.setStyle(highlightedStyle())
      },
      mouseout(e: LeafletMouseEvent) {
        const path = e.target as L.Path
        if (geojsonRef.current) {
          geojsonRef.current.resetStyle(path)
        }
      },
      click(e: LeafletMouseEvent) {
        const fg = e.target as L.FeatureGroup
        map.fitBounds(fg.getBounds(), { padding: [60, 60], maxZoom: 7 })
      },
    })
  }

  if (!geoData) return null

  // We use a key based on data size to force re-render when AQI data arrives.
  // This ensures onEachFeature is called for all countries with the actual data.
  return (
    <GeoJSON
      key={`geo-countries-${aqiData.size}`}
      ref={geojsonRef}
      data={geoData}
      pane={pane}
      style={feature => featureStyle(feature as Feature<Geometry, CountryProperties>)}
      onEachFeature={onEachFeature}
    />
  )
}
