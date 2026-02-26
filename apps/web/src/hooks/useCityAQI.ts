import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import type { RegionAQIData } from '@/utils/mapTypes'

interface CityFeature {
  type: string
  geometry: {
    type: string
    coordinates: [number, number]
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
 * queries city aqi data using open-meteo.
 */
export function useCityAQI() {
  const utils = trpc.useUtils()

  return useQuery<RegionAQIData[]>({
    queryKey: ['map', 'cities'],
    queryFn: async () => {
      // fetches city coordinates list.
      const resp = await fetch('/geo/sea-cities.json')
      const geojson = (await resp.json()) as FeatureCollection

      const cities = geojson.features.map(f => ({
        id: f.properties.name.toLowerCase().replace(/\s+/g, '-'),
        name: f.properties.name,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
      }))

      // queries batch aqi via backend bypassing hook overhead.
      return await utils.search.batchCities.fetch(cities)
    },
    staleTime: 10 * 60 * 1000,
  })
}
