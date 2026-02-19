import { describe, expect, it, vi } from 'vitest'
import { OpenAQClient } from './openaqClient'

const makeJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('OpenAQClient', () => {
  it('fetches latest measurements for a city via location lookup', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse({ results: [{ id: 183, code: 'PH', name: 'Philippines' }] })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({ results: [{ id: 777, name: 'Manila Station', city: 'Manila' }] })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              locationId: 777,
              city: 'Manila',
              country: 'PH',
              measurements: [{ parameter: 'pm25', value: 23.4 }],
            },
          ],
        })
      )

    const client = new OpenAQClient({ apiKey: 'test-key', fetchImpl: fetchMock })
    const result = await client.getCurrentByCity('Manila')

    expect(result?.locationId).toBe(777)
    expect(result?.measurements?.[0]?.parameter).toBe('pm25')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('falls back to another candidate location when first latest result is empty', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse({ results: [{ id: 183, code: 'PH', name: 'Philippines' }] })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            { id: 3, name: 'NMA - Nima', city: 'Accra' },
            { id: 777, name: 'Manila Station', city: 'Manila' },
          ],
        })
      )
      .mockResolvedValueOnce(makeJsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              locationId: 777,
              city: 'Manila',
              country: 'PH',
              measurements: [{ parameter: 'pm25', value: 28.1 }],
            },
          ],
        })
      )

    const client = new OpenAQClient({ apiKey: 'test-key', fetchImpl: fetchMock })
    const result = await client.getCurrentByCity('Manila')

    expect(result?.locationId).toBe(777)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('extracts PM2.5 from v3 latest sensor rows', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse({ results: [{ id: 183, code: 'PH', name: 'Philippines' }] })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              id: 777,
              name: 'Manila Station',
              locality: 'Manila',
              country: { code: 'PH', name: 'Philippines' },
              sensors: [{ id: 10, parameter: { name: 'pm25' } }],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              sensorsId: 10,
              locationsId: 777,
              value: 31.2,
              datetime: { utc: '2026-02-19T00:00:00Z' },
            },
          ],
        })
      )

    const client = new OpenAQClient({ apiKey: 'test-key', fetchImpl: fetchMock })
    const result = await client.getCurrentByCity('Manila')

    expect(result?.locationId).toBe(777)
    expect(result?.measurements?.[0]?.parameter).toBe('pm25')
    expect(result?.measurements?.[0]?.value).toBe(31.2)
  })

  it('prefers the most recent PM2.5 reading across matching locations', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse({ results: [{ id: 183, code: 'PH', name: 'Philippines' }] })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              id: 1001,
              name: 'Manila Old',
              locality: 'Manila',
              country: { code: 'PH', name: 'Philippines' },
              sensors: [{ id: 10, parameter: { name: 'pm25' } }],
            },
            {
              id: 1002,
              name: 'Manila Fresh',
              locality: 'Manila',
              country: { code: 'PH', name: 'Philippines' },
              sensors: [{ id: 11, parameter: { name: 'pm25' } }],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              sensorsId: 10,
              locationsId: 1001,
              value: 55.5,
              datetime: { utc: '2026-02-01T00:00:00Z' },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [
            {
              sensorsId: 11,
              locationsId: 1002,
              value: 14.4,
              datetime: { utc: '2026-02-19T12:00:00Z' },
            },
          ],
        })
      )

    const client = new OpenAQClient({ apiKey: 'test-key', fetchImpl: fetchMock })
    const result = await client.getCurrentByCity('Manila')

    expect(result?.locationId).toBe(1002)
    expect(result?.measurements?.[0]?.value).toBe(14.4)
  })

  it('returns null when no location is found for a city', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(makeJsonResponse({ results: [] }))

    const client = new OpenAQClient({ apiKey: 'test-key', fetchImpl: fetchMock })
    const result = await client.getCurrentByCity('Unknown City')

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a useful error on API failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', {
        status: 429,
      })
    )

    const client = new OpenAQClient({ apiKey: 'test-key', fetchImpl: fetchMock })

    await expect(client.getCurrentByCity('Manila')).rejects.toThrow(
      'OpenAQ request failed (429): rate limited'
    )
  })
})
