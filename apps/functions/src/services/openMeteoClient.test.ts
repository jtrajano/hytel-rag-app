import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenMeteoClient, _clearGeocodeCache } from './openMeteoClient'

describe('OpenMeteoClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    _clearGeocodeCache()
  })

  it('geocodes a city successfully', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 123,
              name: 'Berlin',
              latitude: 52.52,
              longitude: 13.41,
              country: 'Germany',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const client = new OpenMeteoClient({ fetchImpl: fetchMock })
    const result = await client.geocodeCity('Berlin')

    expect(result).toStrictEqual({
      id: 123,
      name: 'Berlin',
      latitude: 52.52,
      longitude: 13.41,
      country: 'Germany',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callUrl = fetchMock.mock.calls[0][0]
    expect(callUrl).toContain('name=Berlin')
  })

  it('returns null when geocoding finds no results', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const client = new OpenMeteoClient({ fetchImpl: fetchMock })
    const result = await client.geocodeCity('UnknownCity')

    expect(result).toBeNull()
  })

  it('fetches a 3-day forecast successfully', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              name: 'London',
              latitude: 51.5,
              longitude: -0.12,
              country: 'UK',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          latitude: 51.5,
          longitude: -0.12,
          timezone: 'GMT',
          hourly: {
            time: ['2024-01-01T00:00', '2024-01-01T01:00'],
            pm10: [10, 12],
            pm2_5: [5, 6],
            carbon_monoxide: [100, 110],
            nitrogen_dioxide: [20, 22],
            ozone: [30, 32],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const client = new OpenMeteoClient({ fetchImpl: fetchMock })
    const result = await client.get3DayForecast('London')

    expect(result).toBeDefined()
    expect(result?.latitude).toBe(51.5)
    expect(result?.hourly?.pm10).toEqual([10, 12])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondCallArg = fetchMock.mock.calls[1][0]
    const requestUrl =
      typeof secondCallArg === 'string' || secondCallArg instanceof URL
        ? secondCallArg.toString()
        : secondCallArg.url
    const url = new URL(requestUrl)
    expect(url.searchParams.get('latitude')).toBe('51.5')
    expect(url.searchParams.get('longitude')).toBe('-0.12')
    expect(url.searchParams.get('forecast_days')).toBe('3')
  })

  it('returns null for forecast if city is not found', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const client = new OpenMeteoClient({ fetchImpl: fetchMock })
    const result = await client.get3DayForecast('Nowhereville')

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws an error when the API request fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const client = new OpenMeteoClient({ fetchImpl: fetchMock })

    await expect(client.geocodeCity('Berlin')).rejects.toThrow(
      'Geocoding API request failed with status 500: Internal Server Error'
    )
  })
})
