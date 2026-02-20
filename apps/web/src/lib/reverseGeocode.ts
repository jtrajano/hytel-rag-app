/**
 * Reverse geocodes lat/lon coordinates to a city name using the
 * Nominatim OpenStreetMap API (free, no API key required).
 *
 * Returns the city name string, or null if the lookup fails.
 */

interface NominatimResponse {
  address?: {
    city?: string
    town?: string
    village?: string
    county?: string
    country?: string
  }
}

interface ReverseGeocodeResult {
  city: string | null
  country: string | null
}

// 1. A cache to prevent re-fetching coordinates we already looked up
const geocodeCache = new Map<string, ReverseGeocodeResult | null>()

// 2. A queue to force all requests to wait their turn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let requestQueue: Promise<any> = Promise.resolve()

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<ReverseGeocodeResult | null> {
  const cacheKey = `${lat},${lon}`

  // If we already fetched this coordinate, return it instantly
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!
  }

  // Attach this new request to the end of the global queue
  requestQueue = requestQueue.then(async () => {
    // Force a 1.1 second delay to perfectly respect Nominatim's rate limit
    await new Promise(resolve => setTimeout(resolve, 1100))

    try {
      // The `_t` timestamp parameter acts as a "cache-buster" to prevent the
      // browser from attempting dangerous connection reuses which also cause 425 errors.
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&email=fernando.ordiales@hytel.io&_t=${Date.now()}`

      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      })

      if (!res.ok) return null

      const data: NominatimResponse = await res.json()
      const addr = data.address
      if (!addr) return null

      const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? null
      const country = addr.country ?? null

      const result = { city, country }

      // Save the result to the cache before returning
      geocodeCache.set(cacheKey, result)

      return result
    } catch {
      return null
    }
  })

  return requestQueue
}
