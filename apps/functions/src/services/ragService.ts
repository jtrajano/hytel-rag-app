/**
 * RAGService — Embedding → Retrieval → Prompting pipeline
 *
 * Flow:
 *   1. Embed the user question via Vertex AI text-embedding-004 (REST)
 *   2. Retrieve relevant chunks from Firestore rag_chunks via findNearest (cosine)
 *   3. Fetch multi-pollutant reading from BigQuery global_aqi_reference (if a city is supplied)
 *   4. Fetch ADPC satellite forecast from BigQuery adpc_pm25_regions (if a country is known)
 *   6. Build a grounded prompt and generate an answer with Gemini
 */

import { Firestore } from '@google-cloud/firestore'
import { VertexAI } from '@google-cloud/vertexai'
import { GoogleAuth } from 'google-auth-library'
import { OpenAQClient } from './openaqClient.js'
import type { OpenAQLiveCityReading } from './openaqClient.js'
import { AdpcForecast, BQClient, GlobalAqiReading } from './bqClient.js'
import { env } from '../config/env.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RagSource {
  label: string
  url: string
}

//export type LiveCityReading = OpenAQLiveCityReading

export interface RagAnswer {
  answer: string
  sources: RagSource[]
  liveAqi?: OpenAQLiveCityReading
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

const COLLECTION = env.rag.collection

const DISTANCE_THRESHOLD = env.rag.distanceThreshold
const TOP_K = env.rag.topK
const LOCATION = env.vertex.location
const EMBEDDING_MODEL = env.vertex.embeddingModel
const GEMINI_MODEL = env.vertex.geminiModel

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
- If live OpenAQ data is provided, prioritize it for current conditions.
- If multi-pollutant data (PM10, NO2, SO2, CO, Ozone) is provided from global_aqi_reference, use it to give a fuller picture of air quality beyond just PM2.5
- If ADPC satellite forecast data is provided, use it to describe current and near-future air quality conditions for that country
- If the question is outside air quality or health, politely redirect

Tone: Friendly, clear, and reassuring — not alarmist.`

// ── RAGService ────────────────────────────────────────────────────────────────

export class RAGService {
  private readonly projectId: string
  private readonly db: Firestore
  private readonly vertexai: VertexAI
  private readonly auth: GoogleAuth
  private readonly openaq: OpenAQClient | null
  private readonly bqClient: BQClient

  constructor(projectId: string) {
    this.projectId = projectId
    this.db = new Firestore({ projectId })
    this.vertexai = new VertexAI({ project: projectId, location: LOCATION })
    this.auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
    const apiKey = process.env.OPENAQ_API_KEY ?? ''
    this.openaq = apiKey ? new OpenAQClient({ apiKey }) : null
    this.bqClient = new BQClient(projectId)
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

  // ── Step 5: Generate ─────────────────────────────────────────────────────────

  async ask(question: string, city?: string, country?: string): Promise<RagAnswer> {
    // Derive country from city if not explicitly provided
    const resolvedCountry = country ?? (city ? CITY_COUNTRY[city.toLowerCase()] : undefined)

    // Run embedding + all BigQuery lookups in parallel
    // Run embedding + initial lookups
    const [queryVector, liveCityAqi, cityGlobal, adpc] = await Promise.all([
      this._embed(question),
      city && this.openaq ? this.openaq.getLiveByCity(city) : Promise.resolve(null),
      city ? this.bqClient.getGlobalAqiForCity(city) : Promise.resolve(null),
      resolvedCountry
        ? this.bqClient.getAdpcForecastForCountry(resolvedCountry)
        : Promise.resolve(null),
    ])

    // If no specific city data found, and we have a "city" input that might be a country, try country lookup
    let finalGlobalAqi = cityGlobal
    let finalAdpc = adpc

    if (!finalGlobalAqi && city) {
      // Try treating the "city" input as a country
      const countryData = await this.bqClient.getCountryAggregatedData(city)
      if (countryData) {
        finalGlobalAqi = countryData
        // Also try fetching ADPC for this "city-as-country"
        if (!finalAdpc) {
          finalAdpc = await this.bqClient.getAdpcForecastForCountry(countryData.country)
        }
      }
    }

    const chunks = await this._retrieveChunks(queryVector)

    // Build grounded prompt
    const liveOpenAqSection = liveCityAqi
      ? `Live OpenAQ reading for ${liveCityAqi.city}${liveCityAqi.country ? `, ${liveCityAqi.country}` : ''} (${liveCityAqi.timestamp}):\n` +
        (liveCityAqi.pm25 != null ? `- PM2.5: ${liveCityAqi.pm25} ug/m3\n` : '') +
        (liveCityAqi.pm10 != null ? `- PM10: ${liveCityAqi.pm10} ug/m3\n` : '') +
        (liveCityAqi.no2 != null ? `- NO2: ${liveCityAqi.no2} ug/m3\n` : '') +
        (liveCityAqi.o3 != null ? `- O3: ${liveCityAqi.o3} ug/m3\n` : '')
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

    const hasData = liveOpenAqSection || globalAqiSection || adpcSection || ragSection
    const userPrompt = hasData
      ? `${liveOpenAqSection}${globalAqiSection}${adpcSection}\n${ragSection}\n\nUser question: ${question}`
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
      liveAqi: liveCityAqi ?? undefined,
      globalAqi: finalGlobalAqi ?? undefined,
      adpc: finalAdpc ?? undefined,
    }
  }
}
