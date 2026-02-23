/**
 * Shared AQI range configuration — single source of truth for all AQI bands.
 *
 * Both the map's color logic and the legend derive from this config.
 * Adding or adjusting a range here automatically propagates to:
 *   - getAQIColor / getAQICategory (aqiColor.ts)
 *   - AQILegend component
 *
 * Future city-level support will use this same config unchanged.
 */
export interface AQIRange {
  min: number
  max: number // Infinity for the last band
  label: string
  /** Hex color used on the Leaflet map */
  hex: string
  /** Tailwind background class — must be an explicit string for JIT to detect */
  bgClass: string
}

export const AQI_RANGES: AQIRange[] = [
  { min: 0, max: 50, label: 'Good', hex: '#22c55e', bgClass: 'bg-green-500' },
  { min: 51, max: 100, label: 'Moderate', hex: '#eab308', bgClass: 'bg-yellow-500' },
  {
    min: 101,
    max: 150,
    label: 'Unhealthy for Sensitive Groups',
    hex: '#fb923c',
    bgClass: 'bg-orange-400',
  },
  { min: 151, max: 200, label: 'Unhealthy', hex: '#ea580c', bgClass: 'bg-orange-600' },
  { min: 201, max: 300, label: 'Very Unhealthy', hex: '#dc2626', bgClass: 'bg-red-600' },
  { min: 301, max: Infinity, label: 'Hazardous', hex: '#4c0519', bgClass: 'bg-rose-950' },
]
