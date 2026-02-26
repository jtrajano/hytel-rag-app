import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { getAQIColor } from '@/utils/aqiColor'
import type { RegionAQIData } from '@/utils/mapTypes'
import { useEffect, useState } from 'react'

interface CityFeature {
  geometry: { coordinates: [number, number] }
  properties: { name: string }
}

interface CityLayerProps {
  // city aqi measurements.
  cities: RegionAQIData[]
  // leaflet drawing pane.
  pane?: string
}

/**
 * renders city aqi circle markers.
 */
export function CityLayer({ cities, pane }: CityLayerProps) {
  const [coords, setCoords] = useState<Map<string, [number, number]>>(new Map())

  // loads coordinates for aqi matching.
  useEffect(() => {
    fetch('/geo/sea-cities.json')
      .then(r => r.json())
      .then(data => {
        const map = new Map<string, [number, number]>()
        data.features.forEach((f: CityFeature) => {
          map.set(f.properties.name.toLowerCase(), [
            f.geometry.coordinates[1],
            f.geometry.coordinates[0],
          ])
        })
        setCoords(map)
      })
  }, [])

  if (cities.length === 0 || coords.size === 0) return null

  return (
    <>
      {cities.map(city => {
        const pos = coords.get(city.name.toLowerCase())
        if (!pos) return null

        const color = getAQIColor(city.aqi)

        return (
          <CircleMarker
            key={city.id}
            center={pos}
            radius={8}
            pane={pane}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.8,
              color: '#ffffff',
              weight: 1.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky className="custom-tooltip">
              <div
                style={{
                  padding: '6px 10px',
                  background: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)',
                  fontFamily: 'sans-serif',
                  minWidth: '140px',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '12px',
                    color: '#94a3b8',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {city.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color, lineHeight: 1 }}>
                    {city.aqi}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#f1f5f9',
                      background: `${color}33`,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {city.category}
                  </div>
                </div>
              </div>
            </Tooltip>

            <Popup maxWidth={200}>
              <div className="font-sans">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  City
                </div>
                <div className="text-lg font-bold text-white mb-2">{city.name}</div>
                <div className="border-t border-slate-100 pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Air Quality Index
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black" style={{ color }}>
                      {city.aqi}
                    </span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${color}22`, color }}
                    >
                      {city.category}
                    </span>
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}
