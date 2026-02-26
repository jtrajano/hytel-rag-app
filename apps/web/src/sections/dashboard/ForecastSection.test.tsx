import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import ForecastSection from './ForecastSection'
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
    forecast: {
      byCity: {
        useQuery: mockUseQuery,
      },
    },
  },
}))

describe('ForecastSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({
      data: { days: [] },
      isLoading: false,
      isError: false,
    })
  })

  it('queries forecast with enabled=true when auth and city are available', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    render(<ForecastSection homeCity="Bangkok" />)

    expect(trpc.forecast.byCity.useQuery).toHaveBeenCalledWith(
      { city: 'Bangkok' },
      expect.objectContaining({
        enabled: true,
        staleTime: 60 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchInterval: 60 * 60 * 1000,
      })
    )
  })

  it('disables forecast query without user/city', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as never)
    render(<ForecastSection homeCity={null} />)

    expect(trpc.forecast.byCity.useQuery).toHaveBeenCalledWith(
      { city: '' },
      expect.objectContaining({ enabled: false })
    )
  })
})
