import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGeolocation } from './useGeolocation'

describe('useGeolocation', () => {
  const originalGeolocation = navigator.geolocation

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    })
  })

  it('returns coordinates when geolocation succeeds', async () => {
    const getCurrentPosition = vi.fn(success => {
      success({ coords: { latitude: 14.6, longitude: 121.0 } })
    })

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })

    const { result } = renderHook(() => useGeolocation())

    let coordinates: { latitude: number; longitude: number } | null = null
    await act(async () => {
      coordinates = await result.current.getLocation()
    })

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(coordinates).toEqual({ latitude: 14.6, longitude: 121.0 })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error when geolocation fails', async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error({ message: 'User denied Geolocation' })
    })

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })

    const { result } = renderHook(() => useGeolocation())

    let coordinates: { latitude: number; longitude: number } | null = null
    await act(async () => {
      coordinates = await result.current.getLocation()
    })

    expect(coordinates).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('User denied Geolocation')
  })

  it('handles browsers without geolocation support', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useGeolocation())

    let coordinates: { latitude: number; longitude: number } | null = null
    await act(async () => {
      coordinates = await result.current.getLocation()
    })

    expect(coordinates).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('Geolocation not supported by your browser')
  })
})
