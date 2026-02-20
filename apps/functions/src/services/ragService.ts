/**
 * RAGService — Embedding → Retrieval → Prompting pipeline
 *
 * Flow:
 *   1. Embed the user question via Vertex AI text-embedding-004 (REST)
 *   2. Retrieve relevant chunks from Firestore rag_chunks via findNearest (cosine)
 *   3. Fetch live AQI from BigQuery aqi_measurements (if a city is supplied)
 *   4. Fetch multi-pollutant reading from BigQuery global_aqi_reference (if a city is supplied)
 *   5. Fetch ADPC satellite forecast from BigQuery adpc_pm25_regions (if a country is known)
 *   6. Build a grounded prompt and generate an answer with Gemini
 */

import { BigQuery } from '@google-cloud/bigquery'
import { Firestore } from '@google-cloud/firestore'
import { VertexAI } from '@google-cloud/vertexai'
import { GoogleAuth } from 'google-auth-library'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AqiReading {
  city: string
  pm25: number
  timestamp: string
}

export interface GlobalAqiReading {
  city: string
  country: string
  timestamp: string
  pm25: number | null
  pm10: number | null
  no2: number | null
  so2: number | null
  co: number | null
  ozone: number | null
  aerosolOpticalDepth: number | null
  aqiClass: string | null
}

export interface AdpcForecast {
  country: string
  initDate: string
  avgPm25: number | null
  maxPm25: number | null
  nearestForecast: string | null
}

export interface RagSource {
  label: string
  url: string
}

export interface RagAnswer {
  answer: string
  sources: RagSource[]
  aqi?: AqiReading
  globalAqi?: GlobalAqiReading
  adpc?: AdpcForecast
}

interface FirestoreChunk {
  content: string
  source_label: string
  source_url: string
  doc_id: string
  chunk_index: number
  total_chunks: number
  vector_distance?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLLECTION = 'rag_chunks'
const DATASET = 'aircare_sea'
const DISTANCE_THRESHOLD = 0.4
const TOP_K = 5
const LOCATION = 'us-central1'
const EMBEDDING_MODEL = 'text-embedding-004'
const GEMINI_MODEL = 'gemini-2.0-flash-001'
const ADPC_REGIONS_TABLE = 'adpc_pm25_regions'
const GLOBAL_AQI_TABLE = 'global_aqi_reference'

/** Maps lowercase city name → ADPC country name */
const CITY_COUNTRY: Record<string, string> = {
  bangkok: 'Thailand',
  manila: 'Philippines',
  jakarta: 'Indonesia',
  singapore: 'Singapore',
  'kuala lumpur': 'Malaysia',
  'ho chi minh': 'Vietnam',
  hanoi: 'Vietnam',
  'phnom penh': 'Cambodia',
  yangon: 'Myanmar',
  vientiane: 'Laos',
}

// ── System prompt (PDD §8.3) ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are AirCare SEA, an AI assistant specialized in air quality and environmental health across Southeast Asia.

Your role:
- Answer questions about PM2.5, AQI, air pollution, and health impacts
- Give practical, actionable advice based on the provided data
- Be concise and easy to understand for non-technical users
- Always ground your answers in the provided context; do not invent facts
- When citing knowledge sources, reference them as [1], [2], etc.
- If live AQI data is provided, factor it into your recommendation
- If multi-pollutant data (PM10, NO2, SO2, CO, Ozone) is provided from global_aqi_reference, use it to give a fuller picture of air quality beyond just PM2.5
- If ADPC satellite forecast data is provided, use it to describe current and near-future air quality conditions for that country
- If the question is outside air quality or health, politely redirect

Tone: Friendly, clear, and reassuring — not alarmist.`

// ── RAGService ────────────────────────────────────────────────────────────────

export class RAGService {
  private readonly projectId: string
  private readonly db: Firestore
  private readonly bq: BigQuery
  private readonly vertexai: VertexAI
  private readonly auth: GoogleAuth

  constructor(projectId: string) {
    this.projectId = projectId
    this.db = new Firestore({ projectId })
    this.bq = new BigQuery({ projectId })
    this.vertexai = new VertexAI({ project: projectId, location: LOCATION })
    this.auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
  }

  // ── Step 1: Embed ────────────────────────────────────────────────────────────

  private async _embed(text: string): Promise<number[]> {
    const token = await this.auth.getAccessToken()
    const url =
      `https://${LOCATION}-aiplatform.googleapis.com/v1` +
      `/projects/${this.projectId}/locations/${LOCATION}` +
      `/publishers/google/models/${EMBEDDING_MODEL}:predict`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ content: text }],
        parameters: { outputDimensionality: 768 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Embedding API error (${res.status}): ${err}`)
    }

    const data = (await res.json()) as {
      predictions: Array<{ embeddings: { values: number[] } }>
    }
    return data.predictions[0].embeddings.values
  }

  // ── Step 2: Retrieve ─────────────────────────────────────────────────────────

  private async _retrieveChunks(queryVector: number[]): Promise<FirestoreChunk[]> {
    const snapshot = await this.db
      .collection(COLLECTION)
      .findNearest({
        vectorField: 'embedding',
        queryVector, // Array<number> accepted directly
        limit: TOP_K,
        distanceMeasure: 'COSINE', // string literal — no DistanceMeasure enum needed
        distanceResultField: 'vector_distance',
        distanceThreshold: DISTANCE_THRESHOLD, // server-side filter
      })
      .get()

    return snapshot.docs.map(doc => doc.data() as FirestoreChunk)
  }

  // ── Step 3: Fetch live AQI from BigQuery ─────────────────────────────────────

  async getAqiForCity(city: string): Promise<AqiReading | null> {
    const query = `
      SELECT city, pm25, CAST(timestamp AS STRING) AS timestamp
      FROM \`${this.projectId}.${DATASET}.aqi_measurements\`
      WHERE LOWER(TRIM(city)) = LOWER(TRIM(@city))
        AND pm25 IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { city } })
      if (!rows.length) return null
      const row = rows[0] as { city: string; pm25: number; timestamp: string }
      return { city: row.city, pm25: row.pm25, timestamp: row.timestamp }
    } catch {
      return null
    }
  }

  // ── Step 4: Fetch multi-pollutant reading from global_aqi_reference ─────────

  async getGlobalAqiForCity(city: string): Promise<GlobalAqiReading | null> {
    const query = `
      SELECT
        city, country,
        CAST(timestamp AS STRING) AS timestamp,
        pm25, pm10, no2, so2, co, ozone,
        aerosol_optical_depth,
        aqi_class
      FROM \`${this.projectId}.${DATASET}.${GLOBAL_AQI_TABLE}\`
      WHERE LOWER(TRIM(city)) = LOWER(TRIM(@city))
      ORDER BY timestamp DESC
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { city } })
      if (!rows.length) return null
      const r = rows[0] as {
        city: string
        country: string
        timestamp: string
        pm25: number
        pm10: number
        no2: number
        so2: number
        co: number
        ozone: number
        aerosol_optical_depth: number
        aqi_class: string
      }
      return {
        city: r.city,
        country: r.country,
        timestamp: r.timestamp,
        pm25: r.pm25 ?? null,
        pm10: r.pm10 ?? null,
        no2: r.no2 ?? null,
        so2: r.so2 ?? null,
        co: r.co ?? null,
        ozone: r.ozone ?? null,
        aerosolOpticalDepth: r.aerosol_optical_depth ?? null,
        aqiClass: r.aqi_class ?? null,
      }
    } catch {
      return null
    }
  }

  // ── Step 4.5: Fetch aggregated country data from global_aqi_reference ─────────

  async getCountryAggregatedData(country: string): Promise<GlobalAqiReading | null> {
    const query = `
      SELECT
        country,
        CAST(MAX(timestamp) AS STRING) AS timestamp,
        AVG(pm25) as pm25,
        AVG(pm10) as pm10,
        AVG(no2) as no2,
        AVG(so2) as so2,
        AVG(co) as co,
        AVG(ozone) as ozone,
        AVG(aerosol_optical_depth) as aerosol_optical_depth
      FROM \`${this.projectId}.${DATASET}.${GLOBAL_AQI_TABLE}\`
      WHERE LOWER(TRIM(country)) LIKE CONCAT('%', LOWER(TRIM(@country)), '%')
      GROUP BY country
      ORDER BY MAX(timestamp) DESC
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { country } })
      if (!rows.length) return null
      const r = rows[0] as {
        country: string
        timestamp: string
        pm25: number
        pm10: number
        no2: number
        so2: number
        co: number
        ozone: number
        aerosol_optical_depth: number
      }
      return {
        city: `${r.country} (National Avg)`, // Placeholder for prompt context
        country: r.country,
        timestamp: r.timestamp,
        pm25: r.pm25 ?? null,
        pm10: r.pm10 ?? null,
        no2: r.no2 ?? null,
        so2: r.so2 ?? null,
        co: r.co ?? null,
        ozone: r.ozone ?? null,
        aerosolOpticalDepth: r.aerosol_optical_depth ?? null,
        aqiClass: null, // Aggregates don't have a single class
      }
    } catch {
      return null
    }
  }

  // ── Step 5: Fetch ADPC satellite forecast from BigQuery ───────────────────────

  async getAdpcForecastForCountry(country: string): Promise<AdpcForecast | null> {
    const query = `
      SELECT
        country,
        CAST(init_date AS STRING)              AS init_date,
        ROUND(AVG(pm25_avg), 2)               AS avg_pm25,
        ROUND(MAX(pm25_max), 2)               AS max_pm25,
        CAST(MIN(forecast_datetime) AS STRING) AS nearest_forecast
      FROM \`${this.projectId}.${DATASET}.${ADPC_REGIONS_TABLE}\`
      WHERE LOWER(TRIM(country)) = LOWER(TRIM(@country))
        AND init_date = (
          SELECT MAX(init_date)
          FROM \`${this.projectId}.${DATASET}.${ADPC_REGIONS_TABLE}\`
          WHERE LOWER(TRIM(country)) = LOWER(TRIM(@country))
        )
      GROUP BY country, init_date
      LIMIT 1
    `
    try {
      const [rows] = await this.bq.query({ query, params: { country } })
      if (!rows.length) return null
      const r = rows[0] as {
        country: string
        init_date: string
        avg_pm25: number
        max_pm25: number
        nearest_forecast: string
      }
      return {
        country: r.country,
        initDate: r.init_date,
        avgPm25: r.avg_pm25 ?? null,
        maxPm25: r.max_pm25 ?? null,
        nearestForecast: r.nearest_forecast ?? null,
      }
    } catch {
      return null
    }
  }

  // ── Step 5: Generate ─────────────────────────────────────────────────────────

  async ask(question: string, city?: string, country?: string): Promise<RagAnswer> {
    // Derive country from city if not explicitly provided
    const resolvedCountry = country ?? (city ? CITY_COUNTRY[city.toLowerCase()] : undefined)

    // Run embedding + all BigQuery lookups in parallel
    // Run embedding + initial lookups
    const [queryVector, cityAqi, cityGlobal, adpc] = await Promise.all([
      this._embed(question),
      city ? this.getAqiForCity(city) : Promise.resolve(null),
      city ? this.getGlobalAqiForCity(city) : Promise.resolve(null),
      resolvedCountry ? this.getAdpcForecastForCountry(resolvedCountry) : Promise.resolve(null),
    ])

    // If no specific city data found, and we have a "city" input that might be a country, try country lookup
    let finalGlobalAqi = cityGlobal
    let finalAdpc = adpc

    if (!finalGlobalAqi && city && !cityAqi) {
      // Try treating the "city" input as a country
      const countryData = await this.getCountryAggregatedData(city)
      if (countryData) {
        finalGlobalAqi = countryData
        // Also try fetching ADPC for this "city-as-country"
        if (!finalAdpc) {
          finalAdpc = await this.getAdpcForecastForCountry(countryData.country)
        }
      }
    }

    const chunks = await this._retrieveChunks(queryVector)

    // Build grounded prompt
    const aqiSection = cityAqi
      ? `Live sensor reading:\n` +
        `- City: ${cityAqi.city}\n` +
        `- PM2.5: ${cityAqi.pm25} µg/m³\n` +
        `- Recorded: ${cityAqi.timestamp}\n`
      : ''

    const globalAqiSection = finalGlobalAqi
      ? `Multi-pollutant reading for ${finalGlobalAqi.city}, ${finalGlobalAqi.country} (${finalGlobalAqi.timestamp}):\n` +
        (finalGlobalAqi.aqiClass ? `- AQI Class: ${finalGlobalAqi.aqiClass}\n` : '') +
        (finalGlobalAqi.pm25 != null ? `- PM2.5: ${finalGlobalAqi.pm25} µg/m³\n` : '') +
        (finalGlobalAqi.pm10 != null ? `- PM10: ${finalGlobalAqi.pm10} µg/m³\n` : '') +
        (finalGlobalAqi.no2 != null ? `- NO2: ${finalGlobalAqi.no2} µg/m³\n` : '') +
        (finalGlobalAqi.so2 != null ? `- SO2: ${finalGlobalAqi.so2} µg/m³\n` : '') +
        (finalGlobalAqi.co != null ? `- CO: ${finalGlobalAqi.co} µg/m³\n` : '') +
        (finalGlobalAqi.ozone != null ? `- Ozone: ${finalGlobalAqi.ozone} µg/m³\n` : '') +
        (finalGlobalAqi.aerosolOpticalDepth != null
          ? `- Aerosol Optical Depth: ${finalGlobalAqi.aerosolOpticalDepth}\n`
          : '')
      : ''

    const adpcSection = finalAdpc
      ? `ADPC Satellite Forecast for ${finalAdpc.country} (model init: ${finalAdpc.initDate}):\n` +
        `- Average PM2.5: ${finalAdpc.avgPm25} µg/m³\n` +
        `- Peak PM2.5: ${finalAdpc.maxPm25} µg/m³\n` +
        `- Forecast start: ${finalAdpc.nearestForecast}\n`
      : ''

    const ragSection =
      chunks.length > 0
        ? `Relevant knowledge:\n` + chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
        : ''

    const hasData = aqiSection || globalAqiSection || adpcSection || ragSection
    const userPrompt = hasData
      ? `${aqiSection}${globalAqiSection}${adpcSection}\n${ragSection}\n\nUser question: ${question}`
      : `User question: ${question}\n\n(No specific data found — answer from general knowledge about SEA air quality.)`

    const model = this.vertexai.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
    })

    const result = await model.generateContent(userPrompt)
    const answer =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ??
      'Sorry, I could not generate an answer. Please try again.'

    // Deduplicate sources
    const seenUrls = new Set<string>()
    const sources: RagSource[] = chunks
      .filter(c => {
        if (seenUrls.has(c.source_url)) return false
        seenUrls.add(c.source_url)
        return true
      })
      .map(c => ({ label: c.source_label, url: c.source_url }))

    return {
      answer,
      sources,
      aqi: cityAqi ?? undefined,
      globalAqi: finalGlobalAqi ?? undefined,
      adpc: finalAdpc ?? undefined,
    }
  }
}
