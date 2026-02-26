import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SearchResults } from './SearchResults'

const { mockUseMutation } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    search: {
      guidelines: {
        useMutation: mockUseMutation,
      },
    },
  },
}))

const baseResult = {
  type: 'city' as const,
  id: 'mnl',
  name: 'Manila',
  country: 'Philippines',
  flagEmoji: '🇵🇭',
  pollution: {
    aqi: 90,
    category: 'Moderate',
    pm25: 25.4,
    pm10: 41.2,
    o3: 12.3,
    no2: 9.9,
    updatedAt: new Date().toISOString(),
  },
  visitorGuidelines: [{ id: '1', text: 'Wear a mask outdoors.' }],
  preventionTips: [{ id: '2', text: 'Keep windows closed during peak traffic.' }],
  improvementActions: [{ id: '3', text: 'Support low-emission transport.' }],
}

describe('SearchResults', () => {
  beforeEach(() => {
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      data: null,
    })
  })

  it('hides visitor guidelines when AQI <= 100', () => {
    const { queryByText } = render(<SearchResults result={baseResult} />)
    expect(queryByText('Visitor Guidelines')).not.toBeInTheDocument()
  })

  it('shows visitor guidelines when AQI > 100', () => {
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      data: {
        visitorGuidelines: baseResult.visitorGuidelines,
        preventionTips: [],
        improvementActions: [],
      },
    })

    const result = {
      ...baseResult,
      pollution: { ...baseResult.pollution, aqi: 150, category: 'Unhealthy for Sensitive Groups' },
    }
    const { getByText } = render(<SearchResults result={result} />)
    expect(getByText('Visitor Guidelines')).toBeInTheDocument()
    expect(getByText('Wear a mask outdoors.')).toBeInTheDocument()
  })

  it('uses country-specific labels when result type is country', () => {
    const result = {
      ...baseResult,
      type: 'country' as const,
      name: 'Thailand',
      country: 'Thailand',
    }
    const { getByText } = render(<SearchResults result={result} />)
    expect(getByText('National Overview')).toBeInTheDocument()
    expect(getByText('Avg. AQI')).toBeInTheDocument()
    expect(getByText(/National average/i)).toBeInTheDocument()
  })
})
