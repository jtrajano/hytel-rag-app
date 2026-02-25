import { describe, it, expect } from 'vitest'
import { getAqiTextColor, getAqiBadgeClass, getAqiScaleIndex } from './searchUtils'

describe('searchUtils', () => {
  it('returns correct AQI text color for all ranges', () => {
    expect(getAqiTextColor(0)).toBe('text-green-500')
    expect(getAqiTextColor(75)).toBe('text-yellow-500')
    expect(getAqiTextColor(120)).toBe('text-orange-400')
    expect(getAqiTextColor(180)).toBe('text-orange-600')
    expect(getAqiTextColor(250)).toBe('text-red-600')
    expect(getAqiTextColor(400)).toBe('text-rose-900')
  })

  it('returns correct badge class for all ranges', () => {
    expect(getAqiBadgeClass(50)).toContain('bg-green-500')
    expect(getAqiBadgeClass(100)).toContain('bg-yellow-500')
    expect(getAqiBadgeClass(150)).toContain('bg-orange-400')
    expect(getAqiBadgeClass(200)).toContain('bg-orange-600')
    expect(getAqiBadgeClass(300)).toContain('bg-red-600')
    expect(getAqiBadgeClass(301)).toContain('bg-rose-900')
  })

  it('returns correct scale index boundaries', () => {
    expect(getAqiScaleIndex(50)).toBe(0)
    expect(getAqiScaleIndex(51)).toBe(1)
    expect(getAqiScaleIndex(101)).toBe(2)
    expect(getAqiScaleIndex(151)).toBe(3)
    expect(getAqiScaleIndex(201)).toBe(4)
    expect(getAqiScaleIndex(301)).toBe(5)
  })
})
