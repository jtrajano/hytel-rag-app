import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useCityAQI } from './useCityAQI'

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(options => options),
}))

const mockBatchFetch = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: vi.fn(() => ({
      search: {
        batchCities: {
          fetch: mockBatchFetch,
        },
      },
    })),
  },
}))

describe('useCityAQI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('configures react-query and fetches mapped city coordinates', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [100.5, 13.7] },
          properties: { name: 'Bangkok', country: 'Thailand' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [106.8, 10.8] },
          properties: { name: 'Ho Chi Minh City', country: 'Vietnam' },
        },
      ],
    }

    const batchResult = [
      { id: 'bangkok', name: 'Bangkok', aqi: 60, category: 'Moderate' },
      { id: 'ho-chi-minh-city', name: 'Ho Chi Minh City', aqi: 70, category: 'Moderate' },
    ]
    mockBatchFetch.mockResolvedValue(batchResult)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(geojson),
      })
    )

    renderHook(() => useCityAQI())

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0]
    expect(queryOptions.queryKey).toEqual(['map', 'cities'])
    expect(queryOptions.staleTime).toBe(10 * 60 * 1000)

    const data = await queryOptions.queryFn()

    expect(global.fetch).toHaveBeenCalledWith('/geo/sea-cities.json')
    expect(mockBatchFetch).toHaveBeenCalledWith([
      { id: 'bangkok', name: 'Bangkok', latitude: 13.7, longitude: 100.5 },
      {
        id: 'ho-chi-minh-city',
        name: 'Ho Chi Minh City',
        latitude: 10.8,
        longitude: 106.8,
      },
    ])
    expect(data).toEqual(batchResult)

    vi.unstubAllGlobals()
  })
})
