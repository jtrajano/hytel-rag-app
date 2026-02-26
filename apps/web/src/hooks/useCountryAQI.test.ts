import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useQueries } from '@tanstack/react-query'
import { useCountryAQI } from './useCountryAQI'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

type UseQueriesArg = {
  queries: Array<{
    queryKey: unknown[]
    queryFn: () => Promise<unknown>
    staleTime: number
    retry: boolean
    enabled: boolean
  }>
}

vi.mock('@tanstack/react-query', () => ({
  useQueries: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockByCityFetch = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: vi.fn(() => ({
      search: {
        byCity: {
          fetch: mockByCityFetch,
        },
      },
    })),
  },
}))

describe('useCountryAQI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds one query per SEA country with auth-based enabled flag', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    vi.mocked(useQueries).mockReturnValue([])

    renderHook(() => useCountryAQI())

    const arg = vi.mocked(useQueries).mock.calls[0][0] as UseQueriesArg
    expect(arg.queries).toHaveLength(11)
    expect(arg.queries[0]).toEqual(
      expect.objectContaining({
        queryKey: ['search', 'byCity', { query: 'Thailand', skipAi: true }],
        staleTime: 5 * 60 * 1000,
        retry: false,
        enabled: true,
      })
    )

    await arg.queries[0].queryFn()
    expect(mockByCityFetch).toHaveBeenCalledWith({ query: 'Thailand', skipAi: true })

    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as never)
    renderHook(() => useCountryAQI())
    const argNoUser = vi.mocked(useQueries).mock.calls[1][0] as UseQueriesArg
    expect(argNoUser.queries.every((q: { enabled: boolean }) => q.enabled === false)).toBe(true)
  })

  it('maps country data and aliases into a lookup map', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    vi.mocked(useQueries).mockReturnValue([
      {
        isLoading: false,
        isError: false,
        data: { id: 'id-th', name: 'Thailand', pollution: { aqi: 55, category: 'Moderate' } },
      },
      {
        isLoading: false,
        isError: false,
        data: { id: 'id-vn', name: 'Vietnam', pollution: { aqi: 80, category: 'Unhealthy' } },
      },
      { isLoading: false, isError: false, data: undefined },
      {
        isLoading: false,
        isError: false,
        data: { id: 'id-la', name: 'Laos', pollution: { aqi: 42, category: 'Good' } },
      },
      { isLoading: false, isError: false, data: undefined },
      { isLoading: false, isError: false, data: undefined },
      { isLoading: false, isError: false, data: undefined },
      { isLoading: false, isError: false, data: undefined },
      { isLoading: false, isError: false, data: undefined },
      {
        isLoading: false,
        isError: false,
        data: { id: 'id-bn', name: 'Brunei', pollution: { aqi: 48, category: 'Good' } },
      },
      {
        isLoading: false,
        isError: false,
        data: { id: 'id-tl', name: 'Timor-Leste', pollution: { aqi: 33, category: 'Good' } },
      },
    ] as never)

    const { result } = renderHook(() => useCountryAQI())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)

    expect(result.current.data.get('thailand')).toMatchObject({ id: 'id-th' })
    expect(result.current.data.get('vietnam')).toMatchObject({ id: 'id-vn' })
    expect(result.current.data.get('viet nam')).toMatchObject({ id: 'id-vn' })
    expect(result.current.data.get('lao pdr')).toMatchObject({ id: 'id-la' })
    expect(result.current.data.get('brunei darussalam')).toMatchObject({ id: 'id-bn' })
    expect(result.current.data.get('east timor')).toMatchObject({ id: 'id-tl' })
  })

  it('derives loading and error flags from query states', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    vi.mocked(useQueries).mockReturnValue([
      { isLoading: true, isError: false, data: undefined },
      { isLoading: false, isError: true, data: undefined },
    ] as never)

    const { result } = renderHook(() => useCountryAQI())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isError).toBe(false)

    vi.mocked(useQueries).mockReturnValue([
      { isLoading: false, isError: true, data: undefined },
      { isLoading: false, isError: true, data: undefined },
    ] as never)

    const next = renderHook(() => useCountryAQI())
    expect(next.result.current.isError).toBe(true)
  })

  it('uses trpc utils', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    vi.mocked(useQueries).mockReturnValue([])

    renderHook(() => useCountryAQI())
    expect(trpc.useUtils).toHaveBeenCalledTimes(1)
  })
})
