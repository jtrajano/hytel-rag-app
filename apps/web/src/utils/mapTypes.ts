/**
 * Shared types for the AQI map feature.
 *
 * Designed to be generic — `RegionAQIData` works for both country-level
 * and future city-level data without modification.
 */

/** Determines which geographic granularity the map renders */
export type MapLevel = 'country' | 'city'

/**
 * Normalized AQI data for any geographic region (country or city).
 * Both CountryLayer and CityLayer consume this shape.
 */
export interface RegionAQIData {
  /** Stable identifier (e.g. country name or city slug) */
  id: string
  /** Human-readable display name */
  name: string
  /** AQI value */
  aqi: number
  /** AQI category label (e.g. "Good", "Moderate") */
  category: string
}
