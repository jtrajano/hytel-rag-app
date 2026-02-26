import { AQI_RANGES } from './aqiRanges'

/**
 * returns map hex color for aqi value.
 */
export function getAQIColor(aqi: number): string {
  for (const range of AQI_RANGES) {
    if (aqi <= range.max) return range.hex
  }
  // fallback color if aqi exceeds defined ranges.
  return AQI_RANGES[AQI_RANGES.length - 1].hex
}

/**
 * returns category label mirroring trpc schema.
 */
export function getAQICategory(aqi: number): string {
  for (const range of AQI_RANGES) {
    if (aqi <= range.max) return range.label
  }
  return AQI_RANGES[AQI_RANGES.length - 1].label
}
