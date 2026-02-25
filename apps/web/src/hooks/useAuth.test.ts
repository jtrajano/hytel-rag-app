import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuth } from './useAuth'
import { useAuthContext } from '@/providers/AuthProvider'

vi.mock('@/providers/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the auth context value', () => {
    const authContext = {
      user: { uid: 'user-1' },
      loading: false,
      logout: vi.fn(),
    }
    vi.mocked(useAuthContext).mockReturnValue(authContext as never)

    const { result } = renderHook(() => useAuth())

    expect(useAuthContext).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(authContext)
  })
})
