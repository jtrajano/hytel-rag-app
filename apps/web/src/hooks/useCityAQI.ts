import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import type { RegionAQIData } from '@/utils/mapTypes'

interface CityFeature {
  type: string
  geometry: {
    type: string
    coordinates: [number, number] // [lon, lat]
  }
  properties: {
    name: string
    country: string
  }
}

interface FeatureCollection {
  type: string
  features: CityFeature[]
}

/**
 * Fetches city-level AQI data for all major SEA cities using Open-Meteo.
 * Loads the city list from a local GeoJSON and queries the batch API.
 */
export function useCityAQI() {
  const utils = trpc.useUtils()

  return useQuery<RegionAQIData[]>({
    queryKey: ['map', 'cities'],
    queryFn: async () => {
      // 1. Fetch the city coordinates list
      const resp = await fetch('/geo/sea-cities.json')
      const geojson = (await resp.json()) as FeatureCollection

      const cities = geojson.features.map(f => ({
        id: f.properties.name.toLowerCase().replace(/\s+/g, '-'),
        name: f.properties.name,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
      }))

      // 2. Query batch AQI from Open-Meteo (via backend)
      // Note: We use the trpc client directly to bypass the hook overhead for an array of inputs
      return await utils.search.batchCities.fetch(cities)
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
