import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import AQIOverviewSection from './AQIOverviewSection'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      currentAqi: {
        useQuery: mockUseQuery,
      },
    },
  },
}))

describe('AQIOverviewSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({
      data: { aqi: 55, quality: 'Moderate', updatedAt: new Date().toISOString() },
      isLoading: false,
      isError: false,
    })
  })

  it('calls AQI query with city and enabled=true when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    render(<AQIOverviewSection homeCity="Manila" />)

    expect(trpc.chat.currentAqi.useQuery).toHaveBeenCalledWith(
      { city: 'Manila' },
      expect.objectContaining({
        enabled: true,
        staleTime: 10 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
      })
    )
  })

  it('disables query when user is not ready or city is missing', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as never)
    render(<AQIOverviewSection homeCity={null} />)

    expect(trpc.chat.currentAqi.useQuery).toHaveBeenCalledWith(
      { city: '' },
      expect.objectContaining({ enabled: false })
    )
  })
})
