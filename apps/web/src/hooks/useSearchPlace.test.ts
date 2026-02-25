import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSearchPlace } from './useSearchPlace'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    search: {
      byCity: {
        useQuery: mockUseQuery,
      },
    },
  },
}))

describe('useSearchPlace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    })
  })

  it('trims query and enables search when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)

    renderHook(() => useSearchPlace('  Bangkok  '))

    expect(trpc.search.byCity.useQuery).toHaveBeenCalledWith(
      { query: 'Bangkok' },
      expect.objectContaining({
        enabled: true,
        staleTime: 5 * 60 * 1000,
        retry: false,
      })
    )
  })

  it('disables search while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: true } as never)

    renderHook(() => useSearchPlace('Manila'))

    expect(trpc.search.byCity.useQuery).toHaveBeenCalledWith(
      { query: 'Manila' },
      expect.objectContaining({ enabled: false })
    )
  })

  it('disables search when there is no authenticated user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as never)

    renderHook(() => useSearchPlace('Jakarta'))

    expect(trpc.search.byCity.useQuery).toHaveBeenCalledWith(
      { query: 'Jakarta' },
      expect.objectContaining({ enabled: false })
    )
  })

  it('disables search for empty queries after trim', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)

    renderHook(() => useSearchPlace('   '))

    expect(trpc.search.byCity.useQuery).toHaveBeenCalledWith(
      { query: '' },
      expect.objectContaining({ enabled: false })
    )
  })
})
