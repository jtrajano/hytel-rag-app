import { describe, it, expect } from 'vitest'
import { PollutionDataSchema, PlaceSearchResultSchema } from './pollutionSchema'

const validPollution = {
  aqi: 85,
  category: 'Moderate',
  pm25: 21.5,
  pm10: 34.2,
  o3: 12.4,
  no2: 9.1,
  updatedAt: '2026-02-25T10:00:00.000Z',
} as const

describe('PollutionDataSchema', () => {
  it('accepts a valid pollution payload', () => {
    const parsed = PollutionDataSchema.parse(validPollution)
    expect(parsed).toEqual(validPollution)
  })

  it('rejects invalid numeric/category values', () => {
    expect(() =>
      PollutionDataSchema.parse({
        ...validPollution,
        aqi: 85.5,
      })
    ).toThrow()

    expect(() =>
      PollutionDataSchema.parse({
        ...validPollution,
        pm25: -1,
      })
    ).toThrow()

    expect(() =>
      PollutionDataSchema.parse({
        ...validPollution,
        category: 'Bad',
      })
    ).toThrow()
  })
})

describe('PlaceSearchResultSchema', () => {
  it('accepts a valid place search result', () => {
    const payload = {
      id: 'manila-ph',
      name: 'Manila',
      country: 'Philippines',
      flagEmoji: '🇵🇭',
      pollution: validPollution,
      visitorGuidelines: [{ id: 'g1', text: 'Wear a mask outdoors.' }],
      preventionTips: [{ id: 'p1', text: 'Use an air purifier indoors.' }],
      improvementActions: [{ id: 'i1', text: 'Support cleaner transport options.' }],
    }

    const parsed = PlaceSearchResultSchema.parse(payload)
    expect(parsed).toEqual(payload)
  })

  it('rejects invalid nested payloads', () => {
    expect(() =>
      PlaceSearchResultSchema.parse({
        id: 'manila-ph',
        name: 'Manila',
        country: 'Philippines',
        flagEmoji: '🇵🇭',
        pollution: { ...validPollution, no2: -0.1 },
        visitorGuidelines: [{ id: 'g1', text: 'Wear a mask outdoors.' }],
        preventionTips: [{ id: 'p1', text: 'Use an air purifier indoors.' }],
        improvementActions: [{ id: 'i1', text: 'Support cleaner transport options.' }],
      })
    ).toThrow()

    expect(() =>
      PlaceSearchResultSchema.parse({
        id: 'manila-ph',
        name: 'Manila',
        country: 'Philippines',
        flagEmoji: '🇵🇭',
        pollution: validPollution,
        visitorGuidelines: [{ id: 'g1' }],
        preventionTips: [{ id: 'p1', text: 'Use an air purifier indoors.' }],
        improvementActions: [{ id: 'i1', text: 'Support cleaner transport options.' }],
      })
    ).toThrow()
  })
})
