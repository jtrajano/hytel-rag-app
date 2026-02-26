import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()

vi.mock('@google-cloud/bigquery', () => {
  return {
    BigQuery: vi.fn().mockImplementation(() => ({
      query: queryMock,
    })),
  }
})

import { BQClient } from './bqClient'

describe('BQClient', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('maps a city row from getGlobalAqiForCity', async () => {
    queryMock.mockResolvedValueOnce([
      [
        {
          city: 'Manila',
          country: 'Philippines',
          timestamp: '2026-02-01T00:00:00Z',
          pm25: 21,
          pm10: 40,
          no2: 12,
          so2: 5,
          co: 1,
          ozone: 19,
          aerosol_optical_depth: 0.5,
          aqi_class: 'Moderate',
        },
      ],
    ])

    const client = new BQClient('test-project')
    const result = await client.getGlobalAqiForCity('Manila')

    expect(result).toEqual({
      city: 'Manila',
      country: 'Philippines',
      timestamp: '2026-02-01T00:00:00Z',
      pm25: 21,
      pm10: 40,
      no2: 12,
      so2: 5,
      co: 1,
      ozone: 19,
      aerosolOpticalDepth: 0.5,
      aqiClass: 'Moderate',
    })
    expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({ params: { city: 'Manila' } }))
  })

  it('returns null from getGlobalAqiForCity when query fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('bq failure'))

    const client = new BQClient('test-project')
    await expect(client.getGlobalAqiForCity('Manila')).resolves.toBeNull()
  })

  it('maps country aggregate data with placeholder city', async () => {
    queryMock.mockResolvedValueOnce([
      [
        {
          country: 'Indonesia',
          timestamp: '2026-02-02T00:00:00Z',
          pm25: 30.5,
          pm10: 50.2,
          no2: 14.1,
          so2: 6.7,
          co: 1.2,
          ozone: 22.8,
          aerosol_optical_depth: 0.9,
        },
      ],
    ])

    const client = new BQClient('test-project')
    const result = await client.getCountryAggregatedData('Indonesia')

    expect(result?.city).toBe('Indonesia (National Avg)')
    expect(result?.aqiClass).toBeNull()
    expect(result?.pm25).toBe(30.5)
  })

  it('maps ADPC forecast response shape', async () => {
    queryMock.mockResolvedValueOnce([
      [
        {
          country: 'Thailand',
          init_date: '2026-02-03',
          avg_pm25: 18.22,
          max_pm25: 40.1,
          nearest_forecast: '2026-02-03T06:00:00Z',
        },
      ],
    ])

    const client = new BQClient('test-project')
    const result = await client.getAdpcForecastForCountry('Thailand')

    expect(result).toEqual({
      country: 'Thailand',
      initDate: '2026-02-03',
      avgPm25: 18.22,
      maxPm25: 40.1,
      nearestForecast: '2026-02-03T06:00:00Z',
    })
  })

  it('returns null from fetchCountryData when no rows are found', async () => {
    queryMock.mockResolvedValueOnce([[]])

    const client = new BQClient('test-project')
    const result = await client.fetchCountryData('Singapore')
    expect(result).toBeNull()
  })

  it('passes searchQuery when fetching city data', async () => {
    queryMock.mockResolvedValueOnce([
      [
        {
          city: 'Bangkok',
          country: 'Thailand',
          timestamp: '2026-02-04T00:00:00Z',
          pm25: 29,
          pm10: 45,
          no2: 11,
          so2: 4,
          co: 1,
          ozone: 18,
          aqi_class: 'Moderate',
        },
      ],
    ])

    const client = new BQClient('test-project')
    const result = await client.fetchCityData('Bangkok')

    expect(result?.city).toBe('Bangkok')
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: { searchQuery: 'Bangkok' } })
    )
  })
})
