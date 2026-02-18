import { useQuery } from '@tanstack/react-query'
import { STATIC_PLACES_DATA } from '@/data/staticPlacesData'
import { PlaceSearchResult, PlaceSearchResultSchema } from '@/lib/schema/pollutionSchema'

// Async even for static data — swap the body for fetch() when API is ready
async function fetchPlaceByQuery(query: string): Promise<PlaceSearchResult | null> {
  const normalised = query.trim().toLowerCase()

  const match = STATIC_PLACES_DATA.find(
    p => p.name.toLowerCase().includes(normalised) || p.country.toLowerCase().includes(normalised)
  )

  if (!match) return null

  // Validate shape with Zod — guards against stale static data drift and future API responses
  const result = PlaceSearchResultSchema.safeParse(match)
  if (!result.success) {
    console.warn('[useSearchPlace] Zod validation failed:', result.error.flatten())
    return null
  }

  return result.data
}

export function useSearchPlace(query: string) {
  return useQuery<PlaceSearchResult | null>({
    queryKey: ['searchPlace', query.trim().toLowerCase()],
    queryFn: () => fetchPlaceByQuery(query),
    enabled: query.trim().length > 0,
    staleTime: Infinity, // static data; change to 5 * 60 * 1000 when using live API
  })
}
