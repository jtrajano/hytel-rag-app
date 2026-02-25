import { AQI_RANGES } from './aqiRanges'

/**
 * Returns the hex color string for a given AQI value.
 * Used by Leaflet layers to color GeoJSON polygons and circle markers.
 *
 * Derives from AQI_RANGES — do NOT hardcode colors here.
 */
export function getAQIColor(aqi: number): string {
  for (const range of AQI_RANGES) {
    if (aqi <= range.max) return range.hex
  }
  // Fallback (should never be reached given Infinity upper bound)
  return AQI_RANGES[AQI_RANGES.length - 1].hex
}

/**
 * Returns the AQI category label for a given AQI value.
 * Mirrors the tRPC search router's AqiCategorySchema values.
 */
export function getAQICategory(aqi: number): string {
  for (const range of AQI_RANGES) {
    if (aqi <= range.max) return range.label
  }
  return AQI_RANGES[AQI_RANGES.length - 1].label
}
