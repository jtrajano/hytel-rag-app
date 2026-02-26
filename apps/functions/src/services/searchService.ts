/**
 * handles city or country air quality lookups.
 */

import { BigQuery } from '@google-cloud/bigquery'
import { VertexAI } from '@google-cloud/vertexai'
import { OpenAQClient } from './openaqClient.js'
import { env } from '../config/env.js'
import { BQClient } from './bqClient.js'
import { OpenMeteoClient } from './openMeteoClient.js'
import { pm25ToAqi, aqiToCategory, AqiCategory } from '../utils/aqiUtils.js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchPollution {
  aqi: number
  category: AqiCategory
  pm25: number
  pm10: number
  o3: number
  no2: number
  updatedAt: string
}

interface SearchGuidelineItem {
  id: string
  text: string
}

interface CitySearchResult {
  type: 'city' | 'country'
  id: string
  name: string
  country: string
  flagEmoji: string
  pollution: SearchPollution
  visitorGuidelines: SearchGuidelineItem[]
  preventionTips: SearchGuidelineItem[]
  improvementActions: SearchGuidelineItem[]
}

// ── Constants ──────────────────────────────────────────────────────────────────
const GEMINI_MODEL = env.vertex.geminiModel

// ── Helpers ────────────────────────────────────────────────────────────────────

const COUNTRY_FLAG: Record<string, string> = {
  philippines: '🇵🇭',
  indonesia: '🇮🇩',
  thailand: '🇹🇭',
  singapore: '🇸🇬',
  malaysia: '🇲🇾',
  vietnam: '🇻🇳',
  cambodia: '🇰🇭',
  myanmar: '🇲🇲',
  laos: '🇱🇦',
  india: '🇮🇳',
  japan: '🇯🇵',
  china: '🇨🇳',
  'south korea': '🇰🇷',
  australia: '🇦🇺',
  'united states': '🇺🇸',
  'united kingdom': '🇬🇧',
  germany: '🇩🇪',
  france: '🇫🇷',
  brazil: '🇧🇷',
  pakistan: '🇵🇰',
  bangladesh: '🇧🇩',
  nepal: '🇳🇵',
  'sri lanka': '🇱🇰',
}

/**
 * resolves country string to flag emoji.
 */
function resolveFlagEmoji(country: string): string {
  const lower = country.toLowerCase()
  if (COUNTRY_FLAG[lower]) return COUNTRY_FLAG[lower]
  const upper = country.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397))
  }
  return '🌍'
}

// ── Fallback content ───────────────────────────────────────────────────────────

function buildFallbackContent(category: AqiCategory): {
  visitorGuidelines: SearchGuidelineItem[]
  preventionTips: SearchGuidelineItem[]
  improvementActions: SearchGuidelineItem[]
} {
  const isUnhealthy = [
    'Unhealthy for Sensitive Groups',
    'Unhealthy',
    'Very Unhealthy',
    'Hazardous',
  ].includes(category)
  return {
    visitorGuidelines: [
      {
        id: 'vg-1',
        text: isUnhealthy
          ? 'Wear a well-fitted N95 or KN95 mask when outdoors.'
          : 'Air quality is acceptable; enjoy outdoor activities.',
      },
      {
        id: 'vg-2',
        text: isUnhealthy
          ? 'Limit prolonged outdoor exertion, especially during peak afternoon hours.'
          : 'Sensitive groups should still monitor conditions if exercising heavily.',
      },
      {
        id: 'vg-3',
        text: isUnhealthy
          ? 'Keep windows and doors closed; use air purifiers indoors.'
          : 'Stay hydrated and take breaks during extended outdoor time.',
      },
    ],
    preventionTips: [
      {
        id: 'pt-1',
        text: 'Check the local AQI forecast each morning before planning outdoor activities.',
      },
      { id: 'pt-2', text: 'Use an air purifier with a HEPA filter in frequently occupied rooms.' },
      { id: 'pt-3', text: 'Stay well-hydrated to support your respiratory system.' },
    ],
    improvementActions: [
      {
        id: 'ia-1',
        text: 'Advocate for stricter vehicle emission standards and more public transport.',
      },
      { id: 'ia-2', text: 'Support local tree-planting and urban greening initiatives.' },
      { id: 'ia-3', text: 'Reduce household burning and switch to cleaner cooking fuels.' },
    ],
  }
}

// ── SearchService ──────────────────────────────────────────────────────────────

export class SearchService {
  private readonly projectId: string
  private readonly bq: BigQuery
  private readonly vertexai: VertexAI
  private readonly openaq: OpenAQClient | null
  private readonly bqClient: BQClient
  private readonly openMeteo: OpenMeteoClient

  constructor(projectId: string) {
    this.projectId = projectId
    this.bq = new BigQuery({ projectId })
    this.vertexai = new VertexAI({ project: env.projectId, location: env.location })
    const apiKey = process.env.OPENAQ_API_KEY
    this.openaq = apiKey ? new OpenAQClient({ apiKey }) : null
    this.bqClient = new BQClient(projectId)
    this.openMeteo = new OpenMeteoClient()
  }

  // fetches live city data from openaq and open-meteo in parallel.

  private async fetchLiveCityData(searchQuery: string): Promise<{
    city: string
    country: string
    pm25: number | null
    pm10: number | null
    no2: number | null
    o3: number | null
    timestamp: string
  } | null> {
    const openaqPromise = this.openaq
      ? this.openaq.getCurrentByCity(searchQuery).catch(() => null)
      : Promise.resolve(null)
    const openMeteoPromise = this.openMeteo.getAirQualityByLocation(searchQuery).catch(() => null)

    const [aqResult, omResult] = await Promise.all([openaqPromise, openMeteoPromise])

    // prefers openaq when it has measurements.
    if (aqResult?.measurements?.length) {
      const get = (param: string) =>
        aqResult.measurements!.find((m: { parameter: string }) => m.parameter === param)?.value ??
        null
      return {
        city: aqResult.city ?? aqResult.location ?? searchQuery,
        country:
          typeof aqResult.country === 'string'
            ? aqResult.country
            : aqResult.country?.code ?? aqResult.country?.name ?? '',
        pm25: get('pm25'),
        pm10: get('pm10'),
        no2: get('no2'),
        o3: get('o3'),
        timestamp: aqResult.measurements![0]?.datetime?.utc ?? new Date().toISOString(),
      }
    }

    // falls back to open-meteo forecast.
    if (omResult) {
      const { location, forecast } = omResult
      const times = forecast.hourly?.time ?? []

      // find the index for the current local hour in the city's timezone.
      // open-meteo times are local strings like "2026-02-26T14:00", so we
      // match against the current hour formatted in the same timezone.
      let idx = 0
      if (times.length > 0 && forecast.timezone) {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: forecast.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          hour12: false,
        }).formatToParts(new Date())
        const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
        const hour = String(parseInt(get('hour'), 10) % 24).padStart(2, '0')
        const localHourStr = `${get('year')}-${get('month')}-${get('day')}T${hour}:00`
        const found = times.indexOf(localHourStr)
        if (found !== -1) idx = found
      }

      return {
        city: location.name,
        country: location.country ?? '',
        pm25: forecast.hourly?.pm2_5?.[idx] ?? null,
        pm10: forecast.hourly?.pm10?.[idx] ?? null,
        no2: forecast.hourly?.nitrogen_dioxide?.[idx] ?? null,
        o3: forecast.hourly?.ozone?.[idx] ?? null,
        timestamp: times[idx] ?? new Date().toISOString(),
      }
    }

    return null
  }

  // ── Step 3: ADPC satellite PM2.5 country lookup ────────────────────────────

  // ── Gemini content generation ──────────────────────────────────────────────

  private async generateContent(
    locationLabel: string,
    type: 'city' | 'country',
    aqi: number,
    category: AqiCategory,
    pm25: number,
    pm10: number,
    no2: number
  ): Promise<{
    visitorGuidelines: SearchGuidelineItem[]
    preventionTips: SearchGuidelineItem[]
    improvementActions: SearchGuidelineItem[]
  }> {
    const context =
      type === 'country'
        ? `national average across all cities in ${locationLabel}`
        : `the city of ${locationLabel}`

    const prompt = `You are an air quality health advisor. Based on the following real-time air quality data for ${context}, generate practical advice.

Air Quality Data:
- AQI: ${aqi} (${category})
- PM2.5: ${pm25} µg/m³
- PM10: ${pm10} µg/m³
- NO2: ${no2} µg/m³
${type === 'country' ? '- Note: these are national averages; individual cities may vary significantly.' : ''}

Respond ONLY with a valid JSON object (no markdown, no code fences) with exactly this shape:
{
  "visitorGuidelines": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "preventionTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "improvementActions": ["<action 1>", "<action 2>", "<action 3>"]
}

Guidelines: practical advice for visitors and tourists right now.
PreventionTips: what individuals can do to protect their health.
ImprovementActions: long-term community and policy actions to improve air quality.
Keep each item concise (1-2 sentences). Be specific to the current AQI level.`

    try {
      const model = this.vertexai.getGenerativeModel({ model: GEMINI_MODEL })
      const result = await model.generateContent(prompt)
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      const cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()
      const parsed = JSON.parse(cleaned) as {
        visitorGuidelines: string[]
        preventionTips: string[]
        improvementActions: string[]
      }

      const toItems = (arr: string[], prefix: string): SearchGuidelineItem[] =>
        (Array.isArray(arr) ? arr : []).slice(0, 5).map((t, i) => ({
          id: `${prefix}-${i + 1}`,
          text: String(t),
        }))

      return {
        visitorGuidelines: toItems(parsed.visitorGuidelines, 'vg'),
        preventionTips: toItems(parsed.preventionTips, 'pt'),
        improvementActions: toItems(parsed.improvementActions, 'ia'),
      }
    } catch {
      return buildFallbackContent(category)
    }
  }

  // ── Result assembly ────────────────────────────────────────────────────────

  private async buildCityResult(raw: {
    type: 'city' | 'country'
    name: string
    country: string
    locationLabel: string
    flagEmoji: string
    pm25: number
    pm10: number
    no2: number
    o3: number
    updatedAt: string
    skipAi?: boolean
  }): Promise<CitySearchResult> {
    const aqi = pm25ToAqi(raw.pm25)
    const category = aqiToCategory(aqi)

    let aiContent: {
      visitorGuidelines: SearchGuidelineItem[]
      preventionTips: SearchGuidelineItem[]
      improvementActions: SearchGuidelineItem[]
    } = {
      visitorGuidelines: [],
      preventionTips: [],
      improvementActions: [],
    }

    if (!raw.skipAi) {
      aiContent = await this.generateContent(
        raw.locationLabel,
        raw.type,
        aqi,
        category,
        raw.pm25,
        raw.pm10,
        raw.no2
      )
    }

    return {
      type: raw.type,
      id: raw.name.toLowerCase().replace(/\s+/g, '-'),
      name: raw.name,
      country: raw.country,
      flagEmoji: raw.flagEmoji,
      pollution: {
        aqi,
        category,
        pm25: raw.pm25,
        pm10: raw.pm10,
        o3: raw.o3,
        no2: raw.no2,
        updatedAt: raw.updatedAt,
      },
      ...aiContent,
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async generateGuidelines(
    name: string,
    country: string,
    type: 'city' | 'country',
    aqi: number,
    category: AqiCategory,
    pm25: number,
    pm10: number,
    no2: number
  ) {
    const locationLabel = type === 'country' ? name : `${name}, ${country}`
    return this.generateContent(locationLabel, type, aqi, category, pm25, pm10, no2)
  }

  async lookupCity(searchQuery: string, skipAi: boolean = false): Promise<CitySearchResult | null> {
    // fetches live data and falls back to bigquery.
    const liveRow = await this.fetchLiveCityData(searchQuery)
    if (liveRow) {
      return this.buildCityResult({
        type: 'city',
        name: liveRow.city,
        country: liveRow.country,
        locationLabel: liveRow.country ? `${liveRow.city}, ${liveRow.country}` : liveRow.city,
        flagEmoji: resolveFlagEmoji(liveRow.country),
        pm25: liveRow.pm25 ?? 0,
        pm10: liveRow.pm10 ?? 0,
        no2: liveRow.no2 ?? 0,
        o3: liveRow.o3 ?? 0,
        updatedAt: liveRow.timestamp,
        skipAi,
      })
    }

    // attempts bigquery city match as fallback.
    const cityRow = await this.bqClient.fetchCityData(searchQuery)
    if (cityRow) {
      return this.buildCityResult({
        type: 'city',
        name: cityRow.city,
        country: cityRow.country,
        locationLabel: `${cityRow.city}, ${cityRow.country}`,
        flagEmoji: resolveFlagEmoji(cityRow.country),
        pm25: cityRow.pm25 ?? 0,
        pm10: cityRow.pm10 ?? 0,
        no2: cityRow.no2 ?? 0,
        o3: cityRow.ozone ?? 0,
        updatedAt: cityRow.timestamp,
        skipAi,
      })
    }

    // aggregates country data from bigquery.
    const [countryRow, adpcRow] = await Promise.all([
      this.bqClient.fetchCountryData(searchQuery),
      this.bqClient.fetchAdpcCountryData(searchQuery),
    ])

    if (countryRow || adpcRow) {
      const matchedCountry = countryRow?.country ?? adpcRow!.country
      // prefers adpc satellite pm25 over global aggregate.
      return this.buildCityResult({
        type: 'country',
        name: matchedCountry,
        country: matchedCountry,
        locationLabel: matchedCountry,
        flagEmoji: resolveFlagEmoji(matchedCountry),
        pm25: adpcRow?.pm25 ?? countryRow?.pm25 ?? 0,
        pm10: countryRow?.pm10 ?? 0,
        no2: countryRow?.no2 ?? 0,
        o3: countryRow?.ozone ?? 0,
        updatedAt: countryRow?.timestamp ?? adpcRow!.timestamp,
        skipAi,
      })
    }

    return null
  }
}
