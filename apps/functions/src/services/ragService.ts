/**
 * handles embedding retrieval and prompting.
 */

import { Firestore } from '@google-cloud/firestore'
import { VertexAI, type Content } from '@google-cloud/vertexai'
import { GoogleAuth } from 'google-auth-library'
import { OpenMeteoClient } from './openMeteoClient.js'
import type { AirQualityWithLocation } from './openMeteoClient.js'
import { pm25ToAqi, aqiToCategory, findClosestHourlyIndex } from '../utils/aqiUtils.js'
import { env } from '../config/env.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RagSource {
  label: string
  url: string
}

interface RagAnswer {
  answer: string
  sources: RagSource[]
  liveAqi?: AirQualityWithLocation
}

interface AskOptions {
  includeLiveAqi?: boolean
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

// ── System prompt (PDD §8.3) ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are AirCare SEA, an AI assistant specialized in air quality and environmental health across Southeast Asia.

Your role:
- Answer questions about PM2.5, AQI, air pollution, and health impacts
- Give practical, actionable advice based on the provided data
- Be concise and easy to understand for non-technical users
- Always ground your answers in the provided context; do not invent facts
- When citing knowledge sources, reference them as [1], [2], etc.
- If Open-Meteo forecast data is provided, use it for current and near-future air quality conditions.
- If the question is outside air quality or health, politely redirect

Tone: Friendly, clear, and reassuring — not alarmist.`

// ── RAGService ────────────────────────────────────────────────────────────────

export class RAGService {
  private readonly projectId: string
  private readonly db: Firestore
  private readonly vertexai: VertexAI
  private readonly auth: GoogleAuth
  private readonly openMeteo: OpenMeteoClient

  constructor(projectId: string) {
    this.projectId = projectId
    this.db = new Firestore({ projectId })
    this.vertexai = new VertexAI({ project: projectId, location: LOCATION })
    this.auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
    this.openMeteo = new OpenMeteoClient()
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
        queryVector,
        limit: TOP_K,
        distanceMeasure: 'COSINE',
        distanceResultField: 'vector_distance',
        distanceThreshold: DISTANCE_THRESHOLD,
      })
      .get()

    return snapshot.docs.map(doc => doc.data() as FirestoreChunk)
  }

  // ── Step 3: Extract location ─────────────────────────────────────────────────

  private async _extractLocation(question: string): Promise<string | null> {
    const model = this.vertexai.getGenerativeModel({ model: GEMINI_MODEL })
    const result = await model.generateContent(
      `Extract the city or country name from this air quality question. ` +
        `Return only the place name (e.g. "Bangkok" or "Thailand"), or "none" if no specific location is mentioned.\n\n` +
        `Question: ${question}`
    )
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'none'
    return text.toLowerCase() === 'none' ? null : text
  }

  // ── Step 4: Generate ─────────────────────────────────────────────────────────

  async ask(
    question: string,
    history: Content[] = [],
    city?: string,
    options: AskOptions = {}
  ): Promise<RagAnswer> {
    const includeLiveAqi = options.includeLiveAqi ?? false
    const [queryVector, detectedLocation] = await Promise.all([
      this._embed(question),
      includeLiveAqi ? (city ? Promise.resolve(city) : this._extractLocation(question)) : null,
    ])

    const effectiveCity = includeLiveAqi ? city ?? detectedLocation ?? undefined : undefined

    const [aqiResult, chunks] = await Promise.all([
      effectiveCity ? this.openMeteo.getAirQualityByLocation(effectiveCity) : Promise.resolve(null),
      this._retrieveChunks(queryVector),
    ])

    const hourly = aqiResult?.forecast.hourly
    const locationLabel = aqiResult
      ? `${aqiResult.location.name}${aqiResult.location.country ? `, ${aqiResult.location.country}` : ''}`
      : city

    let forecastSection = ''
    if (hourly) {
      const now = new Date()
      const idx = findClosestHourlyIndex(hourly.time, now)
      const i = idx !== -1 ? idx : 0

      const pm25 = hourly.pm2_5?.[i] ?? null
      const aqi = pm25 != null ? pm25ToAqi(pm25) : null
      const category = aqi != null ? aqiToCategory(aqi) : null

      forecastSection =
        `Current air quality for ${locationLabel} (${hourly.time[i]}):\n` +
        (pm25 != null ? `- PM2.5: ${pm25} µg/m³\n` : '') +
        (hourly.pm10?.[i] != null ? `- PM10: ${hourly.pm10[i]} µg/m³\n` : '') +
        (hourly.nitrogen_dioxide?.[i] != null
          ? `- NO2: ${hourly.nitrogen_dioxide[i]} µg/m³\n`
          : '') +
        (hourly.ozone?.[i] != null ? `- Ozone: ${hourly.ozone[i]} µg/m³\n` : '') +
        (hourly.carbon_monoxide?.[i] != null ? `- CO: ${hourly.carbon_monoxide[i]} µg/m³\n` : '') +
        (aqi != null ? `- Estimated AQI: ${aqi}${category ? ` (${category})` : ''}\n` : '') +
        `\n3-day PM2.5 peak forecast:\n` +
        [0, 1, 2]
          .map(day => {
            const slice = (hourly.pm2_5 ?? [])
              .slice(day * 24, day * 24 + 24)
              .filter((v): v is number => v != null)
            if (!slice.length) return null
            const peak = Math.max(...slice)
            const dayAqi = pm25ToAqi(peak)
            const label = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : 'Day 3'
            return `- ${label}: ${peak.toFixed(1)} µg/m³ peak (AQI ${dayAqi}, ${aqiToCategory(dayAqi)})`
          })
          .filter(Boolean)
          .join('\n')
    }

    const ragSection =
      chunks.length > 0
        ? `Relevant knowledge:\n` + chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
        : ''

    const hasData = forecastSection || ragSection

    console.log(forecastSection)
    console.log(ragSection)
    const contextualPrompt = hasData
      ? `CONTEXTUAL DATA:\n${forecastSection}\n${ragSection}\n\nUSER QUESTION: ${question}`
      : question

    const model = this.vertexai.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
    })

    const chat = model.startChat({ history })
    const result = await chat.sendMessage(contextualPrompt)

    const answer =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ??
      'Sorry, I could not generate an answer. Please try again.'

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
      liveAqi: aqiResult ?? undefined,
    }
  }
}
