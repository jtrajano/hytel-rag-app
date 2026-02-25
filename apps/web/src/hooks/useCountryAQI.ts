import { useQueries } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { useAuth } from '@/hooks/useAuth'
import type { RegionAQIData } from '@/utils/mapTypes'

/**
 * Southeast Asian countries the map covers.
 * Add new entries here when data becomes available for additional regions.
 */
const SEA_COUNTRIES = [
  'Thailand',
  'Vietnam',
  'Cambodia',
  'Laos',
  'Myanmar',
  'Malaysia',
  'Indonesia',
  'Philippines',
  'Singapore',
  'Brunei',
  'Timor-Leste',
]

interface UseCountryAQIResult {
  /** Map from lowercase country name → RegionAQIData */
  data: Map<string, RegionAQIData>
  isLoading: boolean
  isError: boolean
}

/**
 * Fetches AQI data for all Southeast Asian countries in parallel.
 * Reuses the same `trpc.search.byCity` procedure as the Search page —
 * no duplicated fetching logic.
 *
 * Returns a Map keyed by lowercase country name for O(1) GeoJSON lookups.
 *
 * Future city expansion: create a sibling `useCityAQI.ts` that follows
 * the same pattern but queries by city name and returns city-keyed data.
 */
export function useCountryAQI(): UseCountryAQIResult {
  const { user, loading } = useAuth()
  const utils = trpc.useUtils()

  const queries = useQueries({
    queries: SEA_COUNTRIES.map(country => ({
      queryKey: ['search', 'byCity', { query: country, skipAi: true }],
      queryFn: () => utils.search.byCity.fetch({ query: country, skipAi: true }),
      staleTime: 5 * 60 * 1000,
      retry: false,
      enabled: !loading && !!user,
    })),
  })

  const isLoading = queries.some(q => q.isLoading)
  const isError = queries.every(q => q.isError)

  const dataMap = new Map<string, RegionAQIData>()

  queries.forEach((q, i) => {
    const result = q.data
    if (!result) return

    const regionData: RegionAQIData = {
      id: result.id,
      name: result.name,
      aqi: result.pollution.aqi,
      category: result.pollution.category,
    }

    // Index by lowercase country name for GeoJSON property matching
    const normalizedQuery = SEA_COUNTRIES[i].toLowerCase()
    const normalizedResult = result.name.toLowerCase()

    dataMap.set(normalizedQuery, regionData)
    dataMap.set(normalizedResult, regionData)

    // Common aliases for Southeast Asian countries to improve robust matching
    if (normalizedQuery === 'timor-leste' || normalizedResult === 'timor-leste') {
      dataMap.set('east timor', regionData)
    }
    if (normalizedQuery === 'vietnam' || normalizedResult === 'vietnam') {
      dataMap.set('viet nam', regionData)
    }
    if (normalizedQuery === 'laos' || normalizedResult === 'laos') {
      dataMap.set('lao pdr', regionData)
    }
    if (normalizedQuery === 'brunei' || normalizedResult === 'brunei') {
      dataMap.set('brunei darussalam', regionData)
    }
  })

  return { data: dataMap, isLoading, isError }
}
