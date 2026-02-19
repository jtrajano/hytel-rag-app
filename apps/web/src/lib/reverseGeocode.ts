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

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    })
    if (!res.ok) return null

    const data: NominatimResponse = await res.json()
    const addr = data.address
    if (!addr) return null

    return addr.city ?? addr.town ?? addr.village ?? addr.county ?? null
  } catch {
    return null
  }
}
