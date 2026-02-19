export interface OpenAQLocation {
  id: number
  name: string
  city?: string
  locality?: string
  country?: string | { code?: string; name?: string }
  sensors?: Array<{
    id?: number
    parameter?: { name?: string }
  }>
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
  country?: string | { code?: string; name?: string }
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

interface OpenAQCountry {
  id: number
  code: string
  name: string
}

interface OpenAQLatestRow {
  value?: number
  datetime?: {
    utc?: string
    local?: string
  }
  sensorsId?: number
  locationsId?: number
}

export const DEFAULT_TARGET_CITIES = [
  'Manila',
  'Jakarta',
  'Bangkok',
  'Ho Chi Minh City',
  'Kuala Lumpur',
] as const

const CITY_TO_COUNTRY_CODE: Record<string, string> = {
  manila: 'PH',
  jakarta: 'ID',
  bangkok: 'TH',
  'ho chi minh city': 'VN',
  'ho chi minh': 'VN',
  hanoi: 'VN',
  singapore: 'SG',
  'kuala lumpur': 'MY',
  delhi: 'IN',
  tokyo: 'JP',
  london: 'GB',
  'los angeles': 'US',
}

export class OpenAQClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private countryIdByCodeCache: Map<string, number> | null = null

  constructor(options: OpenAQClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.openaq.org/v3'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async getCurrentByCity(city: string, latestLimit = 5): Promise<OpenAQLatestResult | null> {
    const candidates = await this.getCandidateLocationsByCity(city)
    let best: OpenAQLatestResult | null = null
    let bestTs = 0

    // Bound the scan to avoid excessive API calls while still favoring fresh data.
    for (const location of candidates.slice(0, 20)) {
      const path = `/locations/${location.id}/latest?limit=${latestLimit}`
      const payload =
        await this.request<OpenAQListResponse<OpenAQLatestResult | OpenAQLatestRow>>(path)
      const latest = this.extractPm25Latest(location, payload.results ?? [])
      if (latest === null) {
        continue
      }

      const ts = this.getMeasurementTimestamp(latest)
      if (ts >= bestTs) {
        best = latest
        bestTs = ts
      }
    }

    if (best) {
      return best
    }

    return null
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

  private async getCandidateLocationsByCity(city: string): Promise<OpenAQLocation[]> {
    const normalizedCity = this.normalize(city)
    const query = new URLSearchParams({ limit: '100' })
    const countryCode = CITY_TO_COUNTRY_CODE[normalizedCity]
    const countryId = countryCode ? await this.getCountryIdByCode(countryCode) : null
    if (countryId !== null) {
      query.set('countries_id', String(countryId))
    }

    const payload = await this.request<OpenAQListResponse<OpenAQLocation>>(
      `/locations?${query.toString()}`
    )
    const locations = payload.results ?? []

    const scored = locations
      .map(location => ({
        location,
        score: this.scoreLocationMatch(location, normalizedCity),
      }))
      .sort((a, b) => b.score - a.score)

    if (scored[0]?.score === 0) {
      return []
    }

    return scored.filter(entry => entry.score > 0).map(entry => entry.location)
  }

  private scoreLocationMatch(location: OpenAQLocation, normalizedCity: string): number {
    const city = this.normalize(location.city)
    const locality = this.normalize(location.locality)
    const name = this.normalize(location.name)

    if (city && city === normalizedCity) return 5
    if (locality && locality === normalizedCity) return 4
    if (name && name === normalizedCity) return 3
    if (city && city.includes(normalizedCity)) return 2
    if (locality && locality.includes(normalizedCity)) return 2
    if (name && name.includes(normalizedCity)) return 1
    return 0
  }

  private normalize(value: string | undefined): string {
    return (value ?? '').trim().toLowerCase()
  }

  private async getCountryIdByCode(code: string): Promise<number | null> {
    if (this.countryIdByCodeCache === null) {
      const payload = await this.request<OpenAQListResponse<OpenAQCountry>>('/countries?limit=500')
      const map = new Map<string, number>()
      for (const country of payload.results ?? []) {
        if (country.code) {
          map.set(country.code.toUpperCase(), country.id)
        }
      }
      this.countryIdByCodeCache = map
    }

    return this.countryIdByCodeCache.get(code.toUpperCase()) ?? null
  }

  private extractPm25Latest(
    location: OpenAQLocation,
    rows: Array<OpenAQLatestResult | OpenAQLatestRow>
  ): OpenAQLatestResult | null {
    const alreadyStructured = rows.find(
      row => 'measurements' in row && (row.measurements?.length ?? 0) > 0
    ) as OpenAQLatestResult | undefined
    if (alreadyStructured) {
      return alreadyStructured
    }

    const sensorParamById = new Map<number, string>()
    for (const sensor of location.sensors ?? []) {
      if (typeof sensor.id === 'number' && sensor.parameter?.name) {
        sensorParamById.set(sensor.id, this.normalize(sensor.parameter.name))
      }
    }

    const pm25Row = rows.find(row => {
      if (!('sensorsId' in row) || typeof row.sensorsId !== 'number') return false
      const parameter = sensorParamById.get(row.sensorsId)
      return parameter === 'pm25' || parameter === 'pm2.5'
    }) as OpenAQLatestRow | undefined

    if (!pm25Row || typeof pm25Row.value !== 'number') {
      return null
    }

    return {
      locationId: location.id,
      location: location.name,
      city:
        location.locality && this.normalize(location.locality) !== 'n/a'
          ? location.locality
          : location.city ?? location.name,
      country:
        typeof location.country === 'string'
          ? location.country
          : location.country?.code ?? location.country?.name,
      measurements: [
        {
          parameter: 'pm25',
          value: pm25Row.value,
          unit: 'ug/m3',
          datetime: pm25Row.datetime,
        },
      ],
    }
  }

  private getMeasurementTimestamp(result: OpenAQLatestResult): number {
    const timestamp =
      result.measurements?.[0]?.datetime?.utc ?? result.measurements?.[0]?.datetime?.local
    if (!timestamp) return 0
    const parsed = Date.parse(timestamp)
    return Number.isNaN(parsed) ? 0 : parsed
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
