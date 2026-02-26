/**
 * provides shared types for map feature.
 */

/** determines geographic map rendering granularity. */
export type MapLevel = 'country' | 'city'

/**
 * normalized aqi data for geographic regions.
 */
export interface RegionAQIData {
  id: string
  name: string
  aqi: number
  category: string
}
