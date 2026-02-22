import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock-prefixed vars are hoisted alongside vi.mock() by Vitest ──────────────

const mockGet = vi.fn()
const mockFindNearest = vi.fn(() => ({ get: mockGet }))
const mockCollection = vi.fn(() => ({ findNearest: mockFindNearest }))

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))

const mockGetAccessToken = vi.fn()

const mockGetLiveByCity = vi.fn()
const mockGetGlobalAqiForCity = vi.fn()
const mockGetAdpcForecastForCountry = vi.fn()
const mockGetCountryAggregatedData = vi.fn()

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(() => ({ collection: mockCollection })),
}))

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel })),
}))

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => ({ getAccessToken: mockGetAccessToken })),
}))

vi.mock('./openaqClient.js', () => ({
  OpenAQClient: vi.fn(() => ({ getLiveByCity: mockGetLiveByCity })),
}))

vi.mock('./bqClient.js', () => ({
  BQClient: vi.fn(() => ({
    getGlobalAqiForCity: mockGetGlobalAqiForCity,
    getAdpcForecastForCountry: mockGetAdpcForecastForCountry,
    getCountryAggregatedData: mockGetCountryAggregatedData,
  })),
}))

vi.mock('../config/env.js', () => ({
  env: {
    projectId: 'test-project',
    location: 'asia-southeast1',
    vertex: {
      embeddingModel: 'text-embedding-004',
      geminiModel: 'gemini-2.0-flash-001',
      location: 'us-central1',
    },
    bigquery: {
      dataset: 'aircare_sea',
      globalAqiTable: 'global_aqi_reference',
      adpcRegionsTable: 'adpc_pm25_regions',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RAGService', () => {
  let service: RAGService

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAQ_API_KEY = 'test-openaq-key'

    mockGetAccessToken.mockResolvedValue('mock-token')
    global.fetch = vi.fn().mockResolvedValue(makeEmbedResponse())
    mockGet.mockResolvedValue({ docs: [] })
    mockGetLiveByCity.mockResolvedValue(null)
    mockGetGlobalAqiForCity.mockResolvedValue(null)
    mockGetAdpcForecastForCountry.mockResolvedValue(null)
    mockGetCountryAggregatedData.mockResolvedValue(null)
    mockGenerateContent.mockResolvedValue(makeGeminiResponse('Here is your air quality answer.'))

    service = new RAGService('test-project')
  })

  // ── Basic answer shape ─────────────────────────────────────────────────────

  describe('ask() — basic', () => {
    it('returns answer with empty sources when no city and no chunks', async () => {
      const result = await service.ask('What is PM2.5?')

      expect(result.answer).toBe('Here is your air quality answer.')
      expect(result.sources).toEqual([])
      expect(result.liveAqi).toBeUndefined()
      expect(result.globalAqi).toBeUndefined()
      expect(result.adpc).toBeUndefined()
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

    it('skips live data lookups when no city is provided', async () => {
      await service.ask('What is PM2.5?')

      expect(mockGetLiveByCity).not.toHaveBeenCalled()
      expect(mockGetGlobalAqiForCity).not.toHaveBeenCalled()
      expect(mockGetAdpcForecastForCountry).not.toHaveBeenCalled()
    })
  })

  // ── Embedding ──────────────────────────────────────────────────────────────

  describe('ask() — embedding', () => {
    it('calls the embedding API with the user question', async () => {
      await service.ask('What causes PM2.5?')

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

      await expect(service.ask('What is PM2.5?')).rejects.toThrow('Embedding API error (401)')
    })

    it('passes the retrieved vector to Firestore findNearest', async () => {
      const customVector = Array<number>(768).fill(0.42)
      global.fetch = vi.fn().mockResolvedValue(makeEmbedResponse(customVector))

      await service.ask('Any question')

      expect(mockFindNearest).toHaveBeenCalledWith(
        expect.objectContaining({ queryVector: customVector })
      )
    })
  })

  // ── Gemini generation ──────────────────────────────────────────────────────

  describe('ask() — Gemini', () => {
    it('returns fallback text when Gemini returns no candidates', async () => {
      mockGenerateContent.mockResolvedValue({ response: { candidates: [] } })

      const result = await service.ask('What is AQI?')

      expect(result.answer).toBe('Sorry, I could not generate an answer. Please try again.')
    })

    it('uses no-data fallback prompt when no chunks or live data exist', async () => {
      await service.ask('Tell me about air quality in SEA')

      const [prompt] = mockGenerateContent.mock.calls[0] as [string]
      expect(prompt).toContain('No specific data found')
    })

    it('includes RAG chunks in the Gemini prompt', async () => {
      mockGet.mockResolvedValue({
        docs: [makeChunkDoc({ content: 'PM2.5 causes respiratory issues.' })],
      })

      await service.ask('Health effects?')

      const [prompt] = mockGenerateContent.mock.calls[0] as [string]
      expect(prompt).toContain('Relevant knowledge:')
      expect(prompt).toContain('PM2.5 causes respiratory issues.')
    })
  })

  // ── Live OpenAQ data ───────────────────────────────────────────────────────

  describe('ask() — live AQI', () => {
    it('fetches live AQI when a city is provided and OpenAQ is configured', async () => {
      const liveAqi = {
        city: 'Bangkok',
        country: 'TH',
        timestamp: '2026-02-22T06:00:00Z',
        pm25: 45.2,
        pm10: 60.1,
        no2: 12.3,
        o3: null,
      }
      mockGetLiveByCity.mockResolvedValue(liveAqi)

      const result = await service.ask('How is the air in Bangkok?', 'Bangkok')

      expect(mockGetLiveByCity).toHaveBeenCalledWith('Bangkok')
      expect(result.liveAqi).toEqual(liveAqi)
    })

    it('skips live AQI when OPENAQ_API_KEY is not set', async () => {
      delete process.env.OPENAQ_API_KEY
      const noKeyService = new RAGService('test-project')

      await noKeyService.ask('Bangkok air?', 'Bangkok')

      expect(mockGetLiveByCity).not.toHaveBeenCalled()
    })

    it('includes live OpenAQ section in the Gemini prompt', async () => {
      mockGetLiveByCity.mockResolvedValue({
        city: 'Singapore',
        country: 'SG',
        timestamp: '2026-02-22T06:00:00Z',
        pm25: 12.0,
        pm10: null,
        no2: null,
        o3: null,
      })

      await service.ask('Singapore air?', 'Singapore')

      const [prompt] = mockGenerateContent.mock.calls[0] as [string]
      expect(prompt).toContain('Live OpenAQ reading for Singapore')
      expect(prompt).toContain('PM2.5: 12')
    })
  })

  // ── BigQuery global AQI ────────────────────────────────────────────────────

  describe('ask() — global AQI', () => {
    it('includes global AQI data when the city is found in BigQuery', async () => {
      const globalAqi = {
        city: 'Manila',
        country: 'Philippines',
        timestamp: '2026-02-22T00:00:00Z',
        pm25: 30.2,
        pm10: 50.0,
        no2: 18.0,
        so2: 5.0,
        co: 0.8,
        ozone: 40.0,
        aerosolOpticalDepth: 0.3,
        aqiClass: 'Moderate',
      }
      mockGetGlobalAqiForCity.mockResolvedValue(globalAqi)

      const result = await service.ask('Manila air quality?', 'Manila')

      expect(result.globalAqi).toEqual(globalAqi)
    })

    it('falls back to country aggregated data when city is not found in BigQuery', async () => {
      const countryData = {
        city: 'Vietnam (National Avg)',
        country: 'Vietnam',
        timestamp: '2026-02-22T00:00:00Z',
        pm25: 22.5,
        pm10: 38.0,
        no2: 10.0,
        so2: 3.0,
        co: 0.5,
        ozone: 35.0,
        aerosolOpticalDepth: 0.2,
        aqiClass: null,
      }
      mockGetCountryAggregatedData.mockResolvedValue(countryData)

      const result = await service.ask('Vietnam air?', 'Vietnam')

      expect(mockGetCountryAggregatedData).toHaveBeenCalledWith('Vietnam')
      expect(result.globalAqi).toEqual(countryData)
    })

    it('does not call getCountryAggregatedData when city is found in BigQuery', async () => {
      mockGetGlobalAqiForCity.mockResolvedValue({
        city: 'Jakarta',
        country: 'Indonesia',
        timestamp: '2026-02-22T00:00:00Z',
        pm25: 55.0,
        pm10: null,
        no2: null,
        so2: null,
        co: null,
        ozone: null,
        aerosolOpticalDepth: null,
        aqiClass: 'Unhealthy',
      })

      await service.ask('Jakarta air?', 'Jakarta')

      expect(mockGetCountryAggregatedData).not.toHaveBeenCalled()
    })
  })

  // ── ADPC country resolution ────────────────────────────────────────────────

  describe('ask() — ADPC resolution', () => {
    it('resolves country from city for ADPC lookup (Bangkok → Thailand)', async () => {
      const adpc = {
        country: 'Thailand',
        initDate: '2026-02-22',
        avgPm25: 38.5,
        maxPm25: 72.0,
        nearestForecast: '2026-02-22T00:00:00Z',
      }
      mockGetAdpcForecastForCountry.mockResolvedValue(adpc)

      const result = await service.ask('Air quality in Bangkok?', 'Bangkok')

      expect(mockGetAdpcForecastForCountry).toHaveBeenCalledWith('Thailand')
      expect(result.adpc).toEqual(adpc)
    })

    it('uses the explicit country parameter over city-based lookup', async () => {
      const adpc = {
        country: 'Malaysia',
        initDate: '2026-02-22',
        avgPm25: 20.1,
        maxPm25: 35.0,
        nearestForecast: '2026-02-22T00:00:00Z',
      }
      mockGetAdpcForecastForCountry.mockResolvedValue(adpc)

      // city=Bangkok would normally resolve to Thailand, but country='Malaysia' overrides it
      const result = await service.ask('Air in KL?', 'Bangkok', 'Malaysia')

      expect(mockGetAdpcForecastForCountry).toHaveBeenCalledWith('Malaysia')
      expect(result.adpc).toEqual(adpc)
    })

    it('skips ADPC when city has no mapping in CITY_COUNTRY and country fallback returns null', async () => {
      await service.ask('Air quality?', 'UnknownCity')

      expect(mockGetAdpcForecastForCountry).not.toHaveBeenCalled()
    })

    it('fetches ADPC for the country resolved via country aggregated fallback', async () => {
      const countryData = {
        city: 'Vietnam (National Avg)',
        country: 'Vietnam',
        timestamp: '2026-02-22T00:00:00Z',
        pm25: 22.5,
        pm10: null,
        no2: null,
        so2: null,
        co: null,
        ozone: null,
        aerosolOpticalDepth: null,
        aqiClass: null,
      }
      const adpc = {
        country: 'Vietnam',
        initDate: '2026-02-22',
        avgPm25: 25.0,
        maxPm25: 45.0,
        nearestForecast: '2026-02-22T00:00:00Z',
      }
      mockGetGlobalAqiForCity.mockResolvedValue(null)
      mockGetCountryAggregatedData.mockResolvedValue(countryData)
      mockGetAdpcForecastForCountry.mockResolvedValue(adpc)

      const result = await service.ask('Vietnam forecast?', 'Vietnam')

      expect(mockGetAdpcForecastForCountry).toHaveBeenCalledWith('Vietnam')
      expect(result.adpc).toEqual(adpc)
    })

    it('includes ADPC section in the Gemini prompt when forecast is available', async () => {
      mockGetAdpcForecastForCountry.mockResolvedValue({
        country: 'Thailand',
        initDate: '2026-02-22',
        avgPm25: 38.5,
        maxPm25: 72.0,
        nearestForecast: '2026-02-22T00:00:00Z',
      })

      await service.ask('Bangkok forecast?', 'Bangkok')

      const [prompt] = mockGenerateContent.mock.calls[0] as [string]
      expect(prompt).toContain('ADPC Satellite Forecast for Thailand')
      expect(prompt).toContain('Average PM2.5: 38.5')
    })
  })
})
