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
      .mockResolvedValueOnce(makeJsonResponse({ results: [{ id: 777, name: 'Manila Station' }] }))
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
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
