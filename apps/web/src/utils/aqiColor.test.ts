import { describe, it, expect } from 'vitest'
import { getAQIColor, getAQICategory } from './aqiColor'

describe('aqiColor utilities', () => {
  it('returns expected colors across AQI boundaries', () => {
    expect(getAQIColor(0)).toBe('#22c55e')
    expect(getAQIColor(50)).toBe('#22c55e')
    expect(getAQIColor(51)).toBe('#eab308')
    expect(getAQIColor(100)).toBe('#eab308')
    expect(getAQIColor(101)).toBe('#fb923c')
    expect(getAQIColor(150)).toBe('#fb923c')
    expect(getAQIColor(151)).toBe('#ea580c')
    expect(getAQIColor(200)).toBe('#ea580c')
    expect(getAQIColor(201)).toBe('#dc2626')
    expect(getAQIColor(300)).toBe('#dc2626')
    expect(getAQIColor(301)).toBe('#4c0519')
    expect(getAQIColor(9999)).toBe('#4c0519')
  })

  it('returns expected categories across AQI boundaries', () => {
    expect(getAQICategory(0)).toBe('Good')
    expect(getAQICategory(50)).toBe('Good')
    expect(getAQICategory(51)).toBe('Moderate')
    expect(getAQICategory(100)).toBe('Moderate')
    expect(getAQICategory(101)).toBe('Unhealthy for Sensitive Groups')
    expect(getAQICategory(150)).toBe('Unhealthy for Sensitive Groups')
    expect(getAQICategory(151)).toBe('Unhealthy')
    expect(getAQICategory(200)).toBe('Unhealthy')
    expect(getAQICategory(201)).toBe('Very Unhealthy')
    expect(getAQICategory(300)).toBe('Very Unhealthy')
    expect(getAQICategory(301)).toBe('Hazardous')
    expect(getAQICategory(9999)).toBe('Hazardous')
  })
})
