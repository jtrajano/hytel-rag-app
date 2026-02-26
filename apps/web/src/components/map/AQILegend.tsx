import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { AQI_RANGES } from '@/utils/aqiRanges'

/**
 * renders aqi legend custom leaflet control.
 */
export function AQILegend() {
  const map = useMap()

  useEffect(() => {
    const legend = new L.Control({ position: 'bottomright' })

    legend.onAdd = () => {
      const div = L.DomUtil.create('div')

      div.style.cssText = `
        background: rgba(15, 15, 20, 0.92);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 10px 14px;
        min-width: 180px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        color: #e5e7eb;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11px;
        pointer-events: none;
      `

      const title = document.createElement('p')
      title.textContent = 'AQI LEVEL'
      title.style.cssText = `
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #9ca3af;
        margin: 0 0 8px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      `
      div.appendChild(title)

      AQI_RANGES.forEach(range => {
        const row = document.createElement('div')
        row.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        `

        const swatch = document.createElement('span')
        swatch.style.cssText = `
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 3px;
          background-color: ${range.hex};
          flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.15);
        `

        const rangeText = range.max === Infinity ? `${range.min}+` : `${range.min}–${range.max}`

        const label = document.createElement('span')
        label.style.cssText = `color: #d1d5db; font-size: 11px; line-height: 1.2;`
        label.textContent = `${rangeText} · ${range.label}`

        row.appendChild(swatch)
        row.appendChild(label)
        div.appendChild(row)
      })

      return div
    }

    legend.addTo(map)

    return () => {
      legend.remove()
    }
  }, [map])

  return null
}
