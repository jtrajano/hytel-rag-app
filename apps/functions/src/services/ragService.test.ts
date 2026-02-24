import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock-prefixed vars are hoisted alongside vi.mock() by Vitest ──────────────

const mockGet = vi.fn()
const mockFindNearest = vi.fn(() => ({ get: mockGet }))
const mockCollection = vi.fn(() => ({ findNearest: mockFindNearest }))

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))

const mockGetAccessToken = vi.fn()

const mockGetAirQualityByLocation = vi.fn()

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(() => ({ collection: mockCollection })),
}))

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel })),
}))

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => ({ getAccessToken: mockGetAccessToken })),
}))

vi.mock('./openMeteoClient.js', () => ({
  OpenMeteoClient: vi.fn(() => ({ getAirQualityByLocation: mockGetAirQualityByLocation })),
}))

vi.mock('../config/env.js', () => ({
  env: {
    projectId: 'test-project',
    vertex: {
      embeddingModel: 'text-embedding-004',
      geminiModel: 'gemini-2.0-flash-001',
      location: 'us-central1',
    },
    rag: {
      collection: 'rag_chunks',
      topK: 5,
      distanceThreshold: 0.4,
    },
  },
}))

import { RAGService } from './ragService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_VECTOR = Array<number>(768).fill(0.1)

const makeEmbedResponse = (vector = MOCK_VECTOR): Response =>
  new Response(JSON.stringify({ predictions: [{ embeddings: { values: vector } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const makeChunkDoc = (
  overrides: Partial<{
    content: string
    source_label: string
    source_url: string
    doc_id: string
    chunk_index: number
    total_chunks: number
  }> = {}
) => ({
  data: () => ({
    content: 'PM2.5 is fine particulate matter.',
    source_label: 'WHO Guidelines',
    source_url: 'https://who.int/air-quality',
    doc_id: 'doc-1',
    chunk_index: 0,
    total_chunks: 1,
    ...overrides,
  }),
})

const makeGeminiResponse = (text: string) => ({
  response: { candidates: [{ content: { parts: [{ text }] } }] },
})

/**
 * Creates an AirQualityWithLocation result with 72 hourly values.
 * All pollutant values are constant so the prompt content is predictable
 * regardless of which hourly index findClosestHourlyIndex selects.
 */
function makeForecastResult(name = 'Bangkok', country = 'Thailand', pm25 = 20.0) {
  const times = Array.from({ length: 72 }, (_, i) => {
    const d = new Date(Date.now() + i * 3_600_000)
    return d.toISOString().slice(0, 16)
  })
  return {
    location: { id: 1, name, latitude: 13.75, longitude: 100.52, country },
    forecast: {
      latitude: 13.75,
      longitude: 100.52,
      timezone: 'Asia/Bangkok',
      hourly: {
        time: times,
        pm2_5: Array<number>(72).fill(pm25),
        pm10: Array<number>(72).fill(pm25 * 1.5),
        nitrogen_dioxide: Array<number>(72).fill(5.0),
        ozone: Array<number>(72).fill(60.0),
        carbon_monoxide: Array<number>(72).fill(200.0),
      },
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RAGService', () => {
  let service: RAGService

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetAccessToken.mockResolvedValue('mock-token')
    global.fetch = vi.fn().mockResolvedValue(makeEmbedResponse())
    mockGet.mockResolvedValue({ docs: [] })
    mockGetAirQualityByLocation.mockResolvedValue(null)

    // Default Gemini behaviour:
    //   - location extraction calls (contain the extraction prompt prefix) → 'none'
    //   - all other calls (final answer generation) → stock answer
    mockGenerateContent.mockImplementation((prompt: unknown) => {
      const text = typeof prompt === 'string' ? prompt : ''
      if (text.startsWith('Extract the city or country name')) {
        return Promise.resolve(makeGeminiResponse('none'))
      }
      return Promise.resolve(makeGeminiResponse('Here is your air quality answer.'))
    })

    service = new RAGService('test-project')
  })

  // ── Basic answer shape ─────────────────────────────────────────────────────

  describe('ask() — basic', () => {
    it('returns answer with empty sources when no city and no chunks', async () => {
      const result = await service.ask('What is PM2.5?')

      expect(result.answer).toBe('Here is your air quality answer.')
      expect(result.sources).toEqual([])
      expect(result.liveAqi).toBeUndefined()
    })

    it('maps retrieved chunks to sources', async () => {
      mockGet.mockResolvedValue({
        docs: [
          makeChunkDoc({ source_label: 'WHO', source_url: 'https://who.int' }),
          makeChunkDoc({ source_label: 'EPA', source_url: 'https://epa.gov' }),
        ],
      })

      const result = await service.ask('What is AQI?')

      expect(result.sources).toEqual([
        { label: 'WHO', url: 'https://who.int' },
        { label: 'EPA', url: 'https://epa.gov' },
      ])
    })

    it('deduplicates sources that share the same URL', async () => {
      mockGet.mockResolvedValue({
        docs: [
          makeChunkDoc({ source_label: 'WHO', source_url: 'https://who.int', chunk_index: 0 }),
          makeChunkDoc({ source_label: 'WHO', source_url: 'https://who.int', chunk_index: 1 }),
          makeChunkDoc({ source_label: 'EPA', source_url: 'https://epa.gov' }),
        ],
      })

      const result = await service.ask('What is PM2.5?')

      expect(result.sources).toHaveLength(2)
      expect(result.sources.map(s => s.url)).toEqual(['https://who.int', 'https://epa.gov'])
    })

    it('skips Open-Meteo when no city is provided and no location is detected', async () => {
      await service.ask('What is PM2.5?')

      expect(mockGetAirQualityByLocation).not.toHaveBeenCalled()
    })
  })

  // ── Embedding ──────────────────────────────────────────────────────────────

  describe('ask() — embedding', () => {
    it('calls the embedding API with the user question', async () => {
      await service.ask('What causes PM2.5?', 'Bangkok')

      expect(global.fetch).toHaveBeenCalledOnce()
      const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ]
      const body = JSON.parse(opts.body as string)
      expect(body.instances[0].content).toBe('What causes PM2.5?')
    })

    it('throws when the embedding API returns a non-2xx status', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))

      await expect(service.ask('What is PM2.5?', 'Bangkok')).rejects.toThrow(
        'Embedding API error (401)'
      )
    })

    it('passes the retrieved vector to Firestore findNearest', async () => {
      const customVector = Array<number>(768).fill(0.42)
      global.fetch = vi.fn().mockResolvedValue(makeEmbedResponse(customVector))

      await service.ask('Any question', 'Bangkok')

      expect(mockFindNearest).toHaveBeenCalledWith(
        expect.objectContaining({ queryVector: customVector })
      )
    })
  })

  // ── Gemini generation ──────────────────────────────────────────────────────

  describe('ask() — Gemini', () => {
    it('returns fallback text when Gemini returns no candidates for the answer', async () => {
      mockGenerateContent.mockImplementation((prompt: unknown) => {
        const text = typeof prompt === 'string' ? prompt : ''
        if (text.startsWith('Extract the city or country name')) {
          return Promise.resolve(makeGeminiResponse('none'))
        }
        return Promise.resolve({ response: { candidates: [] } })
      })

      const result = await service.ask('What is AQI?', 'Bangkok')

      expect(result.answer).toBe('Sorry, I could not generate an answer. Please try again.')
    })

    it('uses no-data fallback prompt when no chunks or live data exist', async () => {
      // city provided, Open-Meteo returns null → no forecastSection
      await service.ask('Tell me about air quality in SEA', 'UnknownCity')

      const calls = mockGenerateContent.mock.calls
      const lastPrompt = (calls[calls.length - 1] as [string])[0]
      expect(lastPrompt).toContain('No specific data found')
    })

    it('includes RAG chunks in the Gemini prompt', async () => {
      mockGet.mockResolvedValue({
        docs: [makeChunkDoc({ content: 'PM2.5 causes respiratory issues.' })],
      })

      await service.ask('Health effects?', 'Bangkok')

      const calls = mockGenerateContent.mock.calls
      const lastPrompt = (calls[calls.length - 1] as [string])[0]
      expect(lastPrompt).toContain('Relevant knowledge:')
      expect(lastPrompt).toContain('PM2.5 causes respiratory issues.')
    })
  })

  // ── Open-Meteo AQI data ────────────────────────────────────────────────────

  describe('ask() — Open-Meteo AQI', () => {
    it('calls getAirQualityByLocation with the provided city', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(makeForecastResult())

      await service.ask('How is the air in Bangkok?', 'Bangkok')

      expect(mockGetAirQualityByLocation).toHaveBeenCalledWith('Bangkok')
    })

    it('returns liveAqi with resolved location and forecast', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(makeForecastResult('Bangkok', 'Thailand', 45.0))

      const result = await service.ask('Bangkok air?', 'Bangkok')

      expect(result.liveAqi).toBeDefined()
      expect(result.liveAqi?.location.name).toBe('Bangkok')
      expect(result.liveAqi?.location.country).toBe('Thailand')
    })

    it('returns liveAqi as undefined when Open-Meteo finds no match', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(null)

      const result = await service.ask('Air quality?', 'UnknownCity')

      expect(result.liveAqi).toBeUndefined()
    })

    it('includes current conditions with AQI in the Gemini prompt', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(makeForecastResult('Bangkok', 'Thailand', 45.0))

      await service.ask('Bangkok air?', 'Bangkok')

      const calls = mockGenerateContent.mock.calls
      const lastPrompt = (calls[calls.length - 1] as [string])[0]
      expect(lastPrompt).toContain('Current air quality for Bangkok, Thailand')
      expect(lastPrompt).toContain('PM2.5: 45')
      expect(lastPrompt).toContain('Estimated AQI:')
    })

    it('includes 3-day peak forecast section in the Gemini prompt', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(
        makeForecastResult('Manila', 'Philippines', 30.0)
      )

      await service.ask('Manila air?', 'Manila')

      const calls = mockGenerateContent.mock.calls
      const lastPrompt = (calls[calls.length - 1] as [string])[0]
      expect(lastPrompt).toContain('3-day PM2.5 peak forecast')
      expect(lastPrompt).toContain('Today:')
      expect(lastPrompt).toContain('Tomorrow:')
    })
  })

  // ── Location extraction ────────────────────────────────────────────────────

  describe('ask() — location extraction', () => {
    it('extracts location from the question when no city is passed', async () => {
      mockGenerateContent.mockImplementation((prompt: unknown) => {
        const text = typeof prompt === 'string' ? prompt : ''
        if (text.startsWith('Extract the city or country name')) {
          return Promise.resolve(makeGeminiResponse('Bangkok'))
        }
        return Promise.resolve(makeGeminiResponse('Here is your air quality answer.'))
      })
      mockGetAirQualityByLocation.mockResolvedValue(makeForecastResult())

      await service.ask('How is the air in Bangkok today?')

      expect(mockGetAirQualityByLocation).toHaveBeenCalledWith('Bangkok')
    })

    it('skips Open-Meteo when Gemini returns "none" for location', async () => {
      // default beforeEach mock already returns 'none' for extraction
      await service.ask('What is PM2.5?')

      expect(mockGetAirQualityByLocation).not.toHaveBeenCalled()
    })

    it('uses explicit city and skips extraction entirely', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(makeForecastResult())

      await service.ask('Air quality in Bangkok?', 'Bangkok')

      // With city provided, generateContent is called once (final answer only)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(mockGetAirQualityByLocation).toHaveBeenCalledWith('Bangkok')
    })

    it('works for a country name as the explicit city parameter', async () => {
      mockGetAirQualityByLocation.mockResolvedValue(
        makeForecastResult('Thailand', 'Thailand', 18.0)
      )

      const result = await service.ask('Air quality in Thailand?', 'Thailand')

      expect(mockGetAirQualityByLocation).toHaveBeenCalledWith('Thailand')
      expect(result.liveAqi?.location.name).toBe('Thailand')
    })
  })
})
