import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { MapLevel, RegionAQIData } from '@/utils/mapTypes'
import { CountryLayer } from './CountryLayer'
import { CityLayer } from './CityLayer'
import { AQILegend } from './AQILegend'

// sets default sea coordinates and zoom.
const SEA_CENTER: [number, number] = [8, 115]
const DEFAULT_ZOOM = 4

interface AQIMapProps {
  // geographic granularity level selector.
  level: MapLevel

  // country level aqi data.
  countryData: Map<string, RegionAQIData>

  // city level aqi data.
  cityData?: RegionAQIData[]
}

/**
 * root map component.
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
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      {level === 'country' && <CountryLayer aqiData={countryData} pane="country-pane" />}

      {level === 'city' && <CityLayer cities={cityData} pane="marker-pane" />}

      <AQILegend />

      <CustomPanes />

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
 * defines custom leaflet panes.
 */
function CustomPanes() {
  const map = useMap()
  useEffect(() => {
    if (!map.getPane('country-pane')) {
      const pane = map.createPane('country-pane')
      pane.style.zIndex = '400'
    }

    if (!map.getPane('labels-pane')) {
      const pane = map.createPane('labels-pane')
      pane.style.zIndex = '450'
      pane.style.pointerEvents = 'none'
    }

    if (!map.getPane('marker-pane')) {
      const pane = map.createPane('marker-pane')
      pane.style.zIndex = '500'
    }
  }, [map])
  return null
}
