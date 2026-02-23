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
      {level === 'country' && <CountryLayer aqiData={countryData} />}

      {/*
       * City marker layer — scaffold only.
       * TODO: Activate when city-level data is available from API.
       * Pass cityData from useCityAQI hook and remove the empty array fallback.
       */}
      {level === 'city' && <CityLayer cities={cityData} />}

      {/* Legend — always visible, level-agnostic */}
      <AQILegend />

      <LabelPane />
      {/* 
        Labels Overlay (Text/Names) 
        We use a custom 'labels-pane' (z-index 650) with 'pointer-events: none'
        to ensure city and country names are always visible and do NOT
        block hover/click interactions on polygons.
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
 * Creates a custom Leaflet pane for labels.
 * We disable pointer-events on this pane so that labels don't intercept
 * hover or click events meant for the actual data layers (polygons/markers).
 */
function LabelPane() {
  const map = useMap()
  useEffect(() => {
    // Only create if it doesn't exist
    if (!map.getPane('labels-pane')) {
      const pane = map.createPane('labels-pane')
      pane.style.zIndex = '625' // Above polygons (400), below tooltips (650)
      pane.style.pointerEvents = 'none'
    }
  }, [map])
  return null
}
