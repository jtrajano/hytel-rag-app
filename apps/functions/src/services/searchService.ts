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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/**
 * Resolves a country string (full name or ISO-2 code) to a flag emoji.
 * Falls back to 🌍 if no match is found.
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

  // ── Step 2: Live city data — OpenAQ → Open-Meteo fallback ────────────────
  // Tries OpenAQ first (requires OPENAQ_API_KEY); falls back to Open-Meteo
  // forecast data when OpenAQ is unavailable or returns no measurements.

  private async fetchLiveCityData(searchQuery: string): Promise<{
    city: string
    country: string
    pm25: number | null
    pm10: number | null
    no2: number | null
    o3: number | null
    timestamp: string
  } | null> {
    // Attempt 2: Open-Meteo air quality forecast
    try {
      const omResult = await this.openMeteo.getAirQualityByLocation(searchQuery)
      if (omResult) {
        const { location, forecast } = omResult
        return {
          city: location.name,
          country: location.country ?? '',
          pm25: forecast.hourly?.pm2_5?.find((v: number | null) => v !== null) ?? null,
          pm10: forecast.hourly?.pm10?.find((v: number | null) => v !== null) ?? null,
          no2: forecast.hourly?.nitrogen_dioxide?.find((v: number | null) => v !== null) ?? null,
          o3: forecast.hourly?.ozone?.find((v: number | null) => v !== null) ?? null,
          timestamp: forecast.hourly?.time[0] ?? new Date().toISOString(),
        }
      }
    } catch {
      // fall through
    }

    // Attempt 1: OpenAQ live readings
    if (this.openaq) {
      try {
        const result = await this.openaq.getCurrentByCity(searchQuery)
        if (result?.measurements?.length) {
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
        }
      } catch {
        // fall through to Open-Meteo
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

  async lookupCity(searchQuery: string, skipAi: boolean = false): Promise<CitySearchResult | null> {
    // Step 1: BigQuery city match
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

    // Step 2: Live city data — OpenAQ with Open-Meteo fallback
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

    // Step 3: Fall back to country aggregate — run both tables in parallel
    const [countryRow, adpcRow] = await Promise.all([
      this.bqClient.fetchCountryData(searchQuery),
      this.bqClient.fetchAdpcCountryData(searchQuery),
    ])

    if (countryRow || adpcRow) {
      const matchedCountry = countryRow?.country ?? adpcRow!.country
      // Prefer ADPC satellite pm25 (more reliable regional data); fall back to global_aqi aggregate
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
