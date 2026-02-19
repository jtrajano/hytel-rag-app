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
import { OpenAQClient } from './openaqClient'

// ── Types ──────────────────────────────────────────────────────────────────────

export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous'

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

const DATASET = 'aircare_sea'
const GLOBAL_AQI_TABLE = 'global_aqi_reference'
const ADPC_REGIONS_TABLE = 'adpc_pm25_regions'
const LOCATION = 'us-central1'
const GEMINI_MODEL = 'gemini-2.0-flash-001'

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

// ── EPA AQI formula ────────────────────────────────────────────────────────────

interface AqiBreakpoint {
  cLo: number
  cHi: number
  iLo: number
  iHi: number
}

const PM25_BREAKPOINTS: AqiBreakpoint[] = [
  { cLo: 0.0, cHi: 12.0, iLo: 0, iHi: 50 },
  { cLo: 12.1, cHi: 35.4, iLo: 51, iHi: 100 },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150 },
  { cLo: 55.5, cHi: 150.4, iLo: 151, iHi: 200 },
  { cLo: 150.5, cHi: 250.4, iLo: 201, iHi: 300 },
  { cLo: 250.5, cHi: 500.4, iLo: 301, iHi: 500 },
]

function pm25ToAqi(pm25: number): number {
  const c = Math.round(pm25 * 10) / 10 // truncate to 1 decimal per EPA spec
  const bp = PM25_BREAKPOINTS.find(b => c >= b.cLo && c <= b.cHi)
  if (!bp) return pm25 > 500 ? 500 : 0
  const aqi = ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (c - bp.cLo) + bp.iLo
  return Math.round(aqi)
}

function aqiToCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
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

  constructor(projectId: string) {
    this.projectId = projectId
    this.bq = new BigQuery({ projectId })
    this.vertexai = new VertexAI({ project: projectId, location: LOCATION })
    const apiKey = process.env.OPENAQ_API_KEY ?? ''
    this.openaq = apiKey ? new OpenAQClient({ apiKey }) : null
  }

  // ── Step 1: City fetch — the query must appear inside the city name ──────────
  // One-directional LIKE only: avoids false positives where a short city name
  // happens to be a substring of a country name (e.g. "an" inside "Pakistan").

  private async fetchCityData(searchQuery: string) {
    const query = `
      SELECT
        city, country,
        CAST(timestamp AS STRING) AS timestamp,
        pm25, pm10, no2, so2, co, ozone,
        aqi_class
      FROM \`${this.projectId}.${DATASET}.${GLOBAL_AQI_TABLE}\`
      WHERE LOWER(TRIM(city)) LIKE CONCAT('%', LOWER(TRIM(@searchQuery)), '%')
      ORDER BY timestamp DESC
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { searchQuery } })
      if (!rows.length) return null
      return rows[0] as {
        city: string
        country: string
        timestamp: string
        pm25: number | null
        pm10: number | null
        no2: number | null
        so2: number | null
        co: number | null
        ozone: number | null
        aqi_class: string | null
      }
    } catch {
      return null
    }
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
        country: result.country ?? '',
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

  // ── Step 3: Country fetch — aggregate AVG across all cities in the country ──
  // One-directional LIKE: the query must appear inside the country name.

  private async fetchCountryData(searchQuery: string) {
    // Average all city readings for the matching country to produce a national overview
    const query = `
      SELECT
        country,
        ROUND(AVG(pm25), 2)   AS pm25,
        ROUND(AVG(pm10), 2)   AS pm10,
        ROUND(AVG(no2), 2)    AS no2,
        ROUND(AVG(so2), 2)    AS so2,
        ROUND(AVG(co), 2)     AS co,
        ROUND(AVG(ozone), 2)  AS ozone,
        CAST(MAX(timestamp) AS STRING) AS timestamp
      FROM \`${this.projectId}.${DATASET}.${GLOBAL_AQI_TABLE}\`
      WHERE LOWER(TRIM(country)) LIKE CONCAT('%', LOWER(TRIM(@searchQuery)), '%')
      GROUP BY country
      ORDER BY MAX(timestamp) DESC
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { searchQuery } })
      if (!rows.length) return null
      return rows[0] as {
        country: string
        timestamp: string
        pm25: number | null
        pm10: number | null
        no2: number | null
        so2: number | null
        co: number | null
        ozone: number | null
      }
    } catch {
      return null
    }
  }

  // ── Step 3: ADPC satellite PM2.5 country lookup ────────────────────────────

  private async fetchAdpcCountryData(searchQuery: string) {
    const query = `
      SELECT
        country,
        ROUND(AVG(pm25_avg), 2)        AS pm25,
        CAST(MAX(init_date) AS STRING) AS timestamp
      FROM \`${this.projectId}.${DATASET}.${ADPC_REGIONS_TABLE}\`
      WHERE LOWER(TRIM(country)) LIKE CONCAT('%', LOWER(TRIM(@searchQuery)), '%')
      GROUP BY country
      ORDER BY MAX(init_date) DESC
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { searchQuery } })
      if (!rows.length) return null
      return rows[0] as { country: string; pm25: number | null; timestamp: string }
    } catch {
      return null
    }
  }

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
    const cityRow = await this.fetchCityData(searchQuery)
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
      // so most OpenAQ results will fall back to the globe emoji.
      const flagEmoji = COUNTRY_FLAG[openaqRow.country.toLowerCase()] ?? '🌍'

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

    // Step 3: Fall back to country aggregate — run both tables in parallel
    const [countryRow, adpcRow] = await Promise.all([
      this.fetchCountryData(searchQuery),
      this.fetchAdpcCountryData(searchQuery),
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
