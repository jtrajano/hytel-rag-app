/**
 * CityLayer — scaffold for future city-level AQI rendering.
 *
 * TODO (Next Quarter): When city-level AQI data is available via the API,
 * implement this component to render circle markers for each city.
 * Steps to activate:
 *   1. Create `useCityAQI.ts` hook (mirror of `useCountryAQI.ts`)
 *   2. Populate with CircleMarker components from react-leaflet
 *   3. Use `getAQIColor(city.aqi)` for fill color
 *   4. Render in AQIMap when `level === "city"`
 *
 * The `RegionAQIData` interface is already compatible for city use —
 * no schema changes needed.
 */

import type { RegionAQIData } from '@/utils/mapTypes'

interface CityLayerProps {
  /** City AQI data — will be populated from useCityAQI hook */
  cities: RegionAQIData[]
}

/**
 * Renders circle markers for city-level AQI data.
 * Currently a no-op — activate when city data is available.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CityLayer(_props: CityLayerProps) {
  // TODO: implement city markers when city-level data is available
  return null
}
