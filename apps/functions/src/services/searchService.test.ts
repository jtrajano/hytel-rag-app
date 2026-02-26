import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    openaqGetCurrentByCity: vi.fn(),
    bqFetchCityData: vi.fn(),
    bqFetchCountryData: vi.fn(),
    bqFetchAdpcCountryData: vi.fn(),
    openMeteoGetAirQualityByLocation: vi.fn(),
    vertexGenerateContent: vi.fn(),
  }
})

vi.mock('../config/env.js', () => ({
  env: {
    projectId: 'test-project',
    location: 'asia-southeast1',
    vertex: { geminiModel: 'gemini-test' },
  },
}))

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mocks.vertexGenerateContent,
    }),
  })),
}))

vi.mock('./openaqClient.js', () => ({
  OpenAQClient: vi.fn().mockImplementation(() => ({
    getCurrentByCity: mocks.openaqGetCurrentByCity,
  })),
}))

vi.mock('./bqClient.js', () => ({
  BQClient: vi.fn().mockImplementation(() => ({
    fetchCityData: mocks.bqFetchCityData,
    fetchCountryData: mocks.bqFetchCountryData,
    fetchAdpcCountryData: mocks.bqFetchAdpcCountryData,
  })),
}))

vi.mock('./openMeteoClient.js', () => ({
  OpenMeteoClient: vi.fn().mockImplementation(() => ({
    getAirQualityByLocation: mocks.openMeteoGetAirQualityByLocation,
  })),
}))

import { SearchService } from './searchService'

describe('SearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAQ_API_KEY = 'test-key'
    mocks.openaqGetCurrentByCity.mockResolvedValue(null)
    mocks.openMeteoGetAirQualityByLocation.mockResolvedValue(null)
    mocks.bqFetchCityData.mockResolvedValue(null)
    mocks.bqFetchCountryData.mockResolvedValue(null)
    mocks.bqFetchAdpcCountryData.mockResolvedValue(null)
    mocks.vertexGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    visitorGuidelines: ['Wear a mask'],
                    preventionTips: ['Use a purifier'],
                    improvementActions: ['Support clean transit'],
                  }),
                },
              ],
            },
          },
        ],
      },
    })
  })

  it('prefers OpenAQ city data when available', async () => {
    mocks.openaqGetCurrentByCity.mockResolvedValueOnce({
      city: 'Manila',
      country: 'PH',
      measurements: [
        { parameter: 'pm25', value: 25, datetime: { utc: '2026-02-20T00:00:00Z' } },
        { parameter: 'pm10', value: 44 },
        { parameter: 'no2', value: 12 },
        { parameter: 'o3', value: 9 },
      ],
    })
    mocks.openMeteoGetAirQualityByLocation.mockResolvedValueOnce({
      location: { name: 'Manila', country: 'Philippines' },
      forecast: { hourly: { time: ['2026-02-20T01:00:00Z'], pm2_5: [19] } },
    })

    const service = new SearchService('test-project')
    const result = await service.lookupCity('Manila', true)

    expect(result?.type).toBe('city')
    expect(result?.name).toBe('Manila')
    expect(result?.country).toBe('PH')
    expect(result?.pollution.pm25).toBe(25)
    expect(result?.pollution.pm10).toBe(44)
    expect(result?.pollution.no2).toBe(12)
    expect(result?.pollution.o3).toBe(9)
    expect(result?.flagEmoji).toBe('🇵🇭')
    expect(result?.visitorGuidelines).toEqual([])
  })

  it('falls back to Open-Meteo when OpenAQ has no reading', async () => {
    mocks.openMeteoGetAirQualityByLocation.mockResolvedValueOnce({
      location: { name: 'Jakarta', country: 'Indonesia' },
      forecast: {
        hourly: {
          time: ['2026-02-20T00:00:00Z'],
          pm2_5: [null, 31.2],
          pm10: [45.3],
          nitrogen_dioxide: [11.1],
          ozone: [19.4],
        },
      },
    })

    const service = new SearchService('test-project')
    const result = await service.lookupCity('Jakarta', true)

    expect(result?.name).toBe('Jakarta')
    expect(result?.country).toBe('Indonesia')
    expect(result?.pollution.pm25).toBe(31.2)
    expect(result?.pollution.pm10).toBe(45.3)
    expect(result?.pollution.no2).toBe(11.1)
    expect(result?.pollution.o3).toBe(19.4)
  })

  it('falls back to BigQuery city lookup when live sources fail', async () => {
    mocks.bqFetchCityData.mockResolvedValueOnce({
      city: 'Bangkok',
      country: 'Thailand',
      timestamp: '2026-02-18T00:00:00Z',
      pm25: 41,
      pm10: 55,
      no2: 20,
      ozone: 30,
    })

    const service = new SearchService('test-project')
    const result = await service.lookupCity('Bangkok', true)

    expect(result?.type).toBe('city')
    expect(result?.id).toBe('bangkok')
    expect(result?.pollution.pm25).toBe(41)
    expect(result?.pollution.updatedAt).toBe('2026-02-18T00:00:00Z')
  })

  it('uses country aggregate fallback and prefers ADPC PM2.5 when available', async () => {
    mocks.bqFetchCountryData.mockResolvedValueOnce({
      country: 'Thailand',
      timestamp: '2026-02-15T00:00:00Z',
      pm25: 35,
      pm10: 60,
      no2: 14,
      ozone: 25,
    })
    mocks.bqFetchAdpcCountryData.mockResolvedValueOnce({
      country: 'Thailand',
      pm25: 17,
      timestamp: '2026-02-16T00:00:00Z',
    })

    const service = new SearchService('test-project')
    const result = await service.lookupCity('Thailand', true)

    expect(result?.type).toBe('country')
    expect(result?.name).toBe('Thailand')
    expect(result?.pollution.pm25).toBe(17)
    expect(result?.pollution.updatedAt).toBe('2026-02-15T00:00:00Z')
  })

  it('returns null when all data sources fail', async () => {
    const service = new SearchService('test-project')
    await expect(service.lookupCity('NoSuchPlace', true)).resolves.toBeNull()
  })

  it('generates AI content when skipAi is false', async () => {
    mocks.openMeteoGetAirQualityByLocation.mockResolvedValueOnce({
      location: { name: 'Singapore', country: 'Singapore' },
      forecast: {
        hourly: {
          time: ['2026-02-20T00:00:00Z'],
          pm2_5: [12],
          pm10: [20],
          nitrogen_dioxide: [8],
          ozone: [15],
        },
      },
    })
    mocks.vertexGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `\`\`\`json
{
  "visitorGuidelines": ["Tip A", "Tip B", "Tip C"],
  "preventionTips": ["Tip D", "Tip E", "Tip F"],
  "improvementActions": ["Action A", "Action B", "Action C"]
}
\`\`\``,
                },
              ],
            },
          },
        ],
      },
    })

    const service = new SearchService('test-project')
    const result = await service.lookupCity('Singapore')

    expect(result?.visitorGuidelines[0]).toEqual({ id: 'vg-1', text: 'Tip A' })
    expect(result?.preventionTips[1]).toEqual({ id: 'pt-2', text: 'Tip E' })
    expect(result?.improvementActions[2]).toEqual({ id: 'ia-3', text: 'Action C' })
  })
})
