import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { MapLevel, RegionAQIData } from '@/utils/mapTypes'
import { CountryLayer } from './CountryLayer'
import { CityLayer } from './CityLayer'
import { AQILegend } from './AQILegend'

// Southeast Asia center coordinates and initial zoom
const SEA_CENTER: [number, number] = [8, 115]
const DEFAULT_ZOOM = 4

interface AQIMapProps {
  /**
   * Geographic granularity level.
   * - "country" renders GeoJSON country polygons (currently active)
   * - "city"    renders city circle markers (future — needs useCityAQI)
   */
  level: MapLevel

  /** AQI data for country-level rendering */
  countryData: Map<string, RegionAQIData>

  /**
   * AQI data for city-level rendering.
   * Future: populate from useCityAQI hook when city data is available.
   */
  cityData?: RegionAQIData[]
}

/**
 * Root map component — owns the Leaflet MapContainer.
 *
 * Switching between country and city rendering is controlled by the `level`
 * prop. This design allows the parent (PollutionMapSection) to toggle
 * granularity without unmounting/remounting the map canvas.
 *
 * Tile layer: CartoDB Dark Matter — lightweight, dark theme, no API key needed.
 */
export function AQIMap({ level, countryData, cityData = [] }: AQIMapProps) {
  return (
    <MapContainer
      center={SEA_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={3}
      maxZoom={10}
      scrollWheelZoom
      style={{ width: '100%', height: '100%', background: '#0a0f1a' }}
      className="rounded-xl"
    >
      {/* Dark basemap — no API key required */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      {/* Country polygon layer — active by default */}
      {level === 'country' && <CountryLayer aqiData={countryData} pane="country-pane" />}

      {/* City marker layer */}
      {level === 'city' && <CityLayer cities={cityData} pane="marker-pane" />}

      {/* Legend — always visible, level-agnostic */}
      <AQILegend />

      <CustomPanes />
      {/* 
        Labels Overlay (Text/Names) 
        Positioned between countries and markers for clear visibility
      */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
        pane="labels-pane"
      />
    </MapContainer>
  )
}

/**
 * Creates custom Leaflet panes for better layer control.
 */
function CustomPanes() {
  const map = useMap()
  useEffect(() => {
    // 1. Country Polygons (Bottom)
    if (!map.getPane('country-pane')) {
      const pane = map.createPane('country-pane')
      pane.style.zIndex = '400'
    }
    // 2. Labels (Middle) - Pointer events disabled so they don't block clicks
    if (!map.getPane('labels-pane')) {
      const pane = map.createPane('labels-pane')
      pane.style.zIndex = '450'
      pane.style.pointerEvents = 'none'
    }
    // 3. City Markers (Top)
    if (!map.getPane('marker-pane')) {
      const pane = map.createPane('marker-pane')
      pane.style.zIndex = '500'
    }
  }, [map])
  return null
}
