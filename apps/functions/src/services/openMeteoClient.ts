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
   */
  async geocodeCity(city: string): Promise<GeocodingResult | null> {
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

    if (!parsed.results || parsed.results.length === 0) {
      return null
    }

    return parsed.results[0]
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
}
