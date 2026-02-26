import { describe, expect, it } from 'vitest'
import { aqiToCategory, findClosestHourlyIndex, pm25ToAqi } from './aqiUtils'

describe('aqiUtils', () => {
  describe('pm25ToAqi', () => {
    it('maps known breakpoint edges', () => {
      expect(pm25ToAqi(0)).toBe(0)
      expect(pm25ToAqi(12.0)).toBe(50)
      expect(pm25ToAqi(35.4)).toBe(100)
      expect(pm25ToAqi(55.4)).toBe(150)
      expect(pm25ToAqi(150.4)).toBe(200)
      expect(pm25ToAqi(250.4)).toBe(300)
      expect(pm25ToAqi(500.4)).toBe(500)
    })

    it('clamps out-of-range values', () => {
      expect(pm25ToAqi(-5)).toBe(0)
      expect(pm25ToAqi(999)).toBe(500)
    })

    it('covers configured PM2.5 breakpoint ranges', () => {
      expect(pm25ToAqi(80)).toBeGreaterThan(150)
      expect(pm25ToAqi(200)).toBeGreaterThanOrEqual(250)
      expect(pm25ToAqi(400)).toBeGreaterThan(400)
    })
  })

  describe('aqiToCategory', () => {
    it('returns the expected category for AQI thresholds', () => {
      expect(aqiToCategory(50)).toBe('Good')
      expect(aqiToCategory(51)).toBe('Moderate')
      expect(aqiToCategory(101)).toBe('Unhealthy for Sensitive Groups')
      expect(aqiToCategory(151)).toBe('Unhealthy')
      expect(aqiToCategory(201)).toBe('Very Unhealthy')
      expect(aqiToCategory(301)).toBe('Hazardous')
    })
  })

  describe('findClosestHourlyIndex', () => {
    it('returns the index with the smallest absolute time delta', () => {
      const times = ['2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', '2026-01-01T02:00:00Z']
      const target = new Date('2026-01-01T01:20:00Z')
      expect(findClosestHourlyIndex(times, target)).toBe(1)
    })

    it('skips invalid timestamps and returns -1 when all are invalid', () => {
      expect(findClosestHourlyIndex(['bad', 'still-bad'], new Date())).toBe(-1)
    })
  })
})
