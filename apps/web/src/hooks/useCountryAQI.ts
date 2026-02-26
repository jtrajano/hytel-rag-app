import { useQueries } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { useAuth } from '@/hooks/useAuth'
import type { RegionAQIData } from '@/utils/mapTypes'

/**
 * supported sea countries for aqi mapped.
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
  // aqi data mapped by lowercase country.
  data: Map<string, RegionAQIData>
  isLoading: boolean
  isError: boolean
}

/**
 * queries aqi data for sea countries in parallel.
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

    // indexes by lowercase country name for geojson matching.
    const normalizedQuery = SEA_COUNTRIES[i].toLowerCase()
    const normalizedResult = result.name.toLowerCase()

    dataMap.set(normalizedQuery, regionData)
    dataMap.set(normalizedResult, regionData)

    // uses common aliases for asian countries to improve mapping.
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
