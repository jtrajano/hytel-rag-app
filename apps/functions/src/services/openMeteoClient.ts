import { z } from 'zod'

// --- Zod Schemas ---

export const GeocodingResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
})

export const GeocodingResponseSchema = z.object({
  results: z.array(GeocodingResultSchema).optional(),
})

export const AirQualityHourlySchema = z.object({
  time: z.array(z.string()),
  pm10: z.array(z.number().nullable()).optional(),
  pm2_5: z.array(z.number().nullable()).optional(),
  carbon_monoxide: z.array(z.number().nullable()).optional(),
  nitrogen_dioxide: z.array(z.number().nullable()).optional(),
  ozone: z.array(z.number().nullable()).optional(),
})

export const AirQualityResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  hourly: AirQualityHourlySchema.optional(),
})

export type GeocodingResult = z.infer<typeof GeocodingResultSchema>
export type AirQualityResponse = z.infer<typeof AirQualityResponseSchema>

export interface AirQualityWithLocation {
  location: GeocodingResult
  forecast: AirQualityResponse
}

// --- Geocoding cache ---
// Module-level: shared across all OpenMeteoClient instances within the same
// warm Cloud Function invocation, eliminating duplicate geocode calls for the
// same city name within a single request chain.
const geocodeCache = new Map<string, GeocodingResult | null>()

/** @internal - For testing use only */
export const _clearGeocodeCache = () => geocodeCache.clear()

// --- Client ---

export interface OpenMeteoClientOptions {
  fetchImpl?: typeof fetch
  geocodingBaseUrl?: string
  airQualityBaseUrl?: string
}

export class OpenMeteoClient {
  private readonly fetchImpl: typeof fetch
  private readonly geocodingBaseUrl: string
  private readonly airQualityBaseUrl: string

  constructor(options: OpenMeteoClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.geocodingBaseUrl = options.geocodingBaseUrl ?? 'https://geocoding-api.open-meteo.com/v1'
    this.airQualityBaseUrl =
      options.airQualityBaseUrl ?? 'https://air-quality-api.open-meteo.com/v1'
  }

  /**
   * Resolves a city name to its geographic coordinates.
   * Results are cached at the module level to avoid redundant API calls
   * when the same city is geocoded multiple times within a warm instance.
   */
  async geocodeCity(city: string): Promise<GeocodingResult | null> {
    const key = city.toLowerCase().trim()
    if (geocodeCache.has(key)) return geocodeCache.get(key)!

    const url = new URL(`${this.geocodingBaseUrl}/search`)
    url.searchParams.set('name', city)
    url.searchParams.set('count', '1')
    url.searchParams.set('format', 'json')

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(
        `Geocoding API request failed with status ${response.status}: ${await response.text()}`
      )
    }

    const data = await response.json()
    const parsed = GeocodingResponseSchema.parse(data)
    const result = parsed.results && parsed.results.length > 0 ? parsed.results[0] : null

    geocodeCache.set(key, result)
    return result
  }

  /**
   * Fetches a 3-day air quality forecast for the specified city.
   */
  async get3DayForecast(city: string): Promise<AirQualityResponse | null> {
    const location = await this.geocodeCity(city)
    if (!location) {
      return null // City not found
    }

    const url = new URL(`${this.airQualityBaseUrl}/air-quality`)
    url.searchParams.set('latitude', location.latitude.toString())
    url.searchParams.set('longitude', location.longitude.toString())
    url.searchParams.set('hourly', 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone')
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '3')

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(
        `Air Quality API request failed with status ${response.status}: ${await response.text()}`
      )
    }

    const data = await response.json()
    return AirQualityResponseSchema.parse(data)
  }

  /**
   * Geocodes a city or country name and returns the resolved location alongside
   * a 3-day air quality forecast. Accepts any place name — city, region, or country.
   */
  async getAirQualityByLocation(cityOrCountry: string): Promise<AirQualityWithLocation | null> {
    const location = await this.geocodeCity(cityOrCountry)
    if (!location) return null

    const url = new URL(`${this.airQualityBaseUrl}/air-quality`)
    url.searchParams.set('latitude', location.latitude.toString())
    url.searchParams.set('longitude', location.longitude.toString())
    url.searchParams.set('hourly', 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone')
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '3')

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(
        `Air Quality API request failed with status ${response.status}: ${await response.text()}`
      )
    }

    const data = await response.json()
    const forecast = AirQualityResponseSchema.parse(data)
    return { location, forecast }
  }

  /**
   * Fetches current air quality for multiple locations in a single batch request.
   */
  async getAirQualityBatch(
    coords: { latitude: number; longitude: number }[]
  ): Promise<AirQualityResponse[]> {
    if (coords.length === 0) return []

    const url = new URL(`${this.airQualityBaseUrl}/air-quality`)
    url.searchParams.set('latitude', coords.map(c => c.latitude).join(','))
    url.searchParams.set('longitude', coords.map(c => c.longitude).join(','))
    url.searchParams.set('hourly', 'pm2_5')
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '1')

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(
        `Air Quality Batch API failed with status ${response.status}: ${await response.text()}`
      )
    }

    const data = await response.json()

    // Open-Meteo returns a single object if one coord is passed,
    // or an array of objects if multiple coords are passed.
    if (Array.isArray(data)) {
      return z.array(AirQualityResponseSchema).parse(data)
    }
    return [AirQualityResponseSchema.parse(data)]
  }
}
