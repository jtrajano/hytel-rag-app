export interface OpenAQLocation {
  id: number
  name: string
  city?: string
  country?: string
}

export interface OpenAQMeasurement {
  parameter: string
  value: number
  unit?: string
  datetime?: {
    utc?: string
    local?: string
  }
}

export interface OpenAQLatestResult {
  locationId: number
  location?: string
  city?: string
  country?: string
  coordinates?: {
    latitude: number
    longitude: number
  }
  measurements?: OpenAQMeasurement[]
}

export interface OpenAQClientOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

interface OpenAQListResponse<T> {
  results?: T[]
}

export const DEFAULT_TARGET_CITIES = [
  'Manila',
  'Jakarta',
  'Bangkok',
  'Ho Chi Minh City',
  'Kuala Lumpur',
] as const

export class OpenAQClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OpenAQClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.openaq.org/v3'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async getCurrentByCity(city: string, latestLimit = 5): Promise<OpenAQLatestResult | null> {
    const location = await this.getFirstLocationByCity(city)
    if (!location) {
      return null
    }

    const path = `/locations/${location.id}/latest?limit=${latestLimit}`
    const payload = await this.request<OpenAQListResponse<OpenAQLatestResult>>(path)
    return payload.results?.[0] ?? null
  }

  async getCurrentForTargetCities(
    cities: readonly string[] = DEFAULT_TARGET_CITIES,
    latestLimit = 5
  ): Promise<Record<string, OpenAQLatestResult | null>> {
    const entries = await Promise.all(
      cities.map(async city => {
        const latest = await this.getCurrentByCity(city, latestLimit)
        return [city, latest] as const
      })
    )

    return Object.fromEntries(entries)
  }

  private async getFirstLocationByCity(city: string): Promise<OpenAQLocation | null> {
    const query = new URLSearchParams({ city, limit: '1' })
    const payload = await this.request<OpenAQListResponse<OpenAQLocation>>(
      `/locations?${query.toString()}`
    )
    return payload.results?.[0] ?? null
  }

  private async request<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`OpenAQ request failed (${response.status}): ${message}`)
    }

    return (await response.json()) as T
  }
}
