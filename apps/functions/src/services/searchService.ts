/**
 * SearchService — City or country air quality lookup for the search page
 *
 * Flow:
 *   1. Try to find an exact/partial city match in BigQuery global_aqi_reference
 *   2. If no city match, try OpenAQ live API for wider global coverage
 *   3. If still no city match, aggregate country average from both BigQuery tables
 *   4. Compute numeric AQI from PM2.5 using the EPA formula
 *   5. Call Gemini to generate visitor guidelines, prevention tips, and improvement actions
 *   6. Return a structured result with a `type` field: 'city' | 'country'
 */

import { BigQuery } from '@google-cloud/bigquery'
import { VertexAI } from '@google-cloud/vertexai'
import { OpenAQClient } from './openaqClient.js'
import { env } from '../config/env.js'
import { BQClient } from './bqClient.js'
import { OpenMeteoClient } from './openMeteoClient.js'
import { pm25ToAqi, aqiToCategory, AqiCategory } from '../utils/aqiUtils.js'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SearchPollution {
  aqi: number
  category: AqiCategory
  pm25: number
  pm10: number
  o3: number
  no2: number
  updatedAt: string
}

export interface SearchGuidelineItem {
  id: string
  text: string
}

export interface CitySearchResult {
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

/** Country name (lowercase) → flag emoji */
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

  constructor(projectId: string) {
    this.projectId = projectId
    this.bq = new BigQuery({ projectId })
    this.vertexai = new VertexAI({ project: env.projectId, location: env.location })
    const apiKey = process.env.OPENAQ_API_KEY
    this.openaq = apiKey ? new OpenAQClient({ apiKey }) : null
    this.bqClient = new BQClient(projectId)
  }

  // ── Step 2: OpenAQ live API — wider global city coverage ──────────────────
  // Only attempted when BigQuery city lookup misses. Skipped silently if
  // OPENAQ_API_KEY is not set (this.openaq will be null).

  private async fetchOpenAQCityData(searchQuery: string) {
    if (!this.openaq) return null
    try {
      const result = await this.openaq.getCurrentByCity(searchQuery)
      if (!result?.measurements?.length) return null
      const get = (param: string) =>
        result.measurements!.find(m => m.parameter === param)?.value ?? null
      return {
        city: result.city ?? result.location ?? searchQuery,
        country:
          typeof result.country === 'string'
            ? result.country
            : result.country?.code ?? result.country?.name ?? '',
        pm25: get('pm25'),
        pm10: get('pm10'),
        no2: get('no2'),
        o3: get('o3'),
        timestamp: result.measurements![0]?.datetime?.utc ?? new Date().toISOString(),
      }
    } catch {
      return null
    }
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

  // ── Public API ─────────────────────────────────────────────────────────────

  async lookupCity(searchQuery: string): Promise<CitySearchResult | null> {
    // Try city match first
    const cityRow = await this.bqClient.fetchCityData(searchQuery)
    if (cityRow) {
      const pm25 = cityRow.pm25 ?? 0
      const pm10 = cityRow.pm10 ?? 0
      const no2 = cityRow.no2 ?? 0
      const o3 = cityRow.ozone ?? 0
      const aqi = pm25ToAqi(pm25)
      const category = aqiToCategory(aqi)
      const flagEmoji = COUNTRY_FLAG[cityRow.country.toLowerCase()] ?? '🌍'

      const aiContent = await this.generateContent(
        `${cityRow.city}, ${cityRow.country}`,
        'city',
        aqi,
        category,
        pm25,
        pm10,
        no2
      )

      return {
        type: 'city',
        id: cityRow.city.toLowerCase().replace(/\s+/g, '-'),
        name: cityRow.city,
        country: cityRow.country,
        flagEmoji,
        pollution: { aqi, category, pm25, pm10, o3, no2, updatedAt: cityRow.timestamp },
        ...aiContent,
      }
    }

    // Step 2: OpenAQ live API — wider global city coverage
    const openaqRow = await this.fetchOpenAQCityData(searchQuery)
    if (openaqRow) {
      const pm25 = openaqRow.pm25 ?? 0
      const pm10 = openaqRow.pm10 ?? 0
      const no2 = openaqRow.no2 ?? 0
      const o3 = openaqRow.o3 ?? 0
      const aqi = pm25ToAqi(pm25)
      const category = aqiToCategory(aqi)
      // OpenAQ returns ISO 2-letter codes (e.g. "PH") — flag map uses full names,
      // so we try generating the flag from the code if it's missing from the map.
      const code = openaqRow.country.toUpperCase()
      const flagEmoji =
        COUNTRY_FLAG[openaqRow.country.toLowerCase()] ??
        (/^[A-Z]{2}$/.test(code)
          ? code.replace(/./g, (char: string) => String.fromCodePoint(char.charCodeAt(0) + 127397))
          : '🌍')

      const aiContent = await this.generateContent(
        openaqRow.country ? `${openaqRow.city}, ${openaqRow.country}` : openaqRow.city,
        'city',
        aqi,
        category,
        pm25,
        pm10,
        no2
      )

      return {
        type: 'city',
        id: openaqRow.city.toLowerCase().replace(/\s+/g, '-'),
        name: openaqRow.city,
        country: openaqRow.country,
        flagEmoji,
        pollution: { aqi, category, pm25, pm10, o3, no2, updatedAt: openaqRow.timestamp },
        ...aiContent,
      }
    }

    // Step 2.5: Open-Meteo — last resort for global city level data
    try {
      const om = new OpenMeteoClient()
      const omResult = await om.getAirQualityByLocation(searchQuery)
      if (omResult) {
        const { location, forecast } = omResult
        const pm25Values = forecast.hourly?.pm2_5 ?? []
        const pm10Values = forecast.hourly?.pm10 ?? []
        const no2Values = forecast.hourly?.nitrogen_dioxide ?? []
        const o3Values = forecast.hourly?.ozone ?? []

        // Find first non-null values
        const pm25 = pm25Values.find((v: number | null) => v !== null) ?? 0
        const pm10 = pm10Values.find((v: number | null) => v !== null) ?? 0
        const no2 = no2Values.find((v: number | null) => v !== null) ?? 0
        const o3 = o3Values.find((v: number | null) => v !== null) ?? 0

        const aqi = pm25ToAqi(pm25)
        const category = aqiToCategory(aqi)
        const flagEmoji = COUNTRY_FLAG[(location.country ?? '').toLowerCase()] ?? '🌍'

        const aiContent = await this.generateContent(
          location.country ? `${location.name}, ${location.country}` : location.name,
          'city',
          aqi,
          category,
          pm25,
          pm10,
          no2
        )

        return {
          type: 'city',
          id: location.name.toLowerCase().replace(/\s+/g, '-'),
          name: location.name,
          country: location.country ?? '',
          flagEmoji,
          pollution: {
            aqi,
            category,
            pm25,
            pm10,
            o3,
            no2,
            updatedAt: forecast.hourly?.time[0] ?? new Date().toISOString(),
          },
          ...aiContent,
        }
      }
    } catch {
      // Proceed to country fallback if Open-Meteo fails
    }

    // Step 3: Fall back to country aggregate — run both tables in parallel
    const [countryRow, adpcRow] = await Promise.all([
      this.bqClient.fetchCountryData(searchQuery),
      this.bqClient.fetchAdpcCountryData(searchQuery),
    ])

    if (countryRow || adpcRow) {
      const matchedCountry = countryRow?.country ?? adpcRow!.country
      // Prefer ADPC satellite pm25 (more reliable regional data); fall back to global_aqi aggregate
      const pm25 = adpcRow?.pm25 ?? countryRow?.pm25 ?? 0
      const pm10 = countryRow?.pm10 ?? 0
      const no2 = countryRow?.no2 ?? 0
      const o3 = countryRow?.ozone ?? 0
      const updatedAt = countryRow?.timestamp ?? adpcRow!.timestamp
      const aqi = pm25ToAqi(pm25)
      const category = aqiToCategory(aqi)
      const flagEmoji = COUNTRY_FLAG[matchedCountry.toLowerCase()] ?? '🌍'

      const aiContent = await this.generateContent(
        matchedCountry,
        'country',
        aqi,
        category,
        pm25,
        pm10,
        no2
      )

      return {
        type: 'country',
        id: matchedCountry.toLowerCase().replace(/\s+/g, '-'),
        name: matchedCountry,
        country: matchedCountry,
        flagEmoji,
        pollution: { aqi, category, pm25, pm10, o3, no2, updatedAt },
        ...aiContent,
      }
    }

    return null
  }
}
