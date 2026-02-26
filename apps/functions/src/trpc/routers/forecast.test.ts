import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pm25ToAqi, aqiToCategory } from '../../utils/aqiUtils'

const mocks = vi.hoisted(() => ({
  get3DayForecast: vi.fn(),
}))

vi.mock('../../services/openMeteoClient.js', () => ({
  OpenMeteoClient: vi.fn().mockImplementation(() => ({
    get3DayForecast: mocks.get3DayForecast,
  })),
}))

import { createCallerFactory } from '../trpc'
import { forecastRouter } from './forecast'

const createCaller = createCallerFactory(forecastRouter)

describe('forecastRouter.byCity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Manila as default city when input city is null', async () => {
    mocks.get3DayForecast.mockResolvedValueOnce({
      hourly: {
        pm2_5: new Array(72).fill(10),
      },
    })
    const caller = createCaller({ user: null })

    await caller.byCity({ city: null })

    expect(mocks.get3DayForecast).toHaveBeenCalledWith('Manila')
  })

  it('returns null when forecast payload is missing pm2_5 data', async () => {
    mocks.get3DayForecast.mockResolvedValueOnce({
      hourly: {},
    })
    const caller = createCaller({ user: null })

    const result = await caller.byCity({ city: 'Bangkok' })
    expect(result).toBeNull()
  })

  it('builds 3 day summaries from daily peak pm2_5 values', async () => {
    const values = [
      ...new Array(24).fill(0).map((_, i) => (i === 10 ? 32 : 12)),
      ...new Array(24).fill(0).map((_, i) => (i === 5 ? 80 : 20)),
      ...new Array(24).fill(0).map((_, i) => (i === 12 ? 160 : 30)),
    ]

    mocks.get3DayForecast.mockResolvedValueOnce({
      hourly: {
        pm2_5: values,
      },
    })
    const caller = createCaller({ user: null })

    const result = await caller.byCity({ city: 'Jakarta' })

    expect(result).not.toBeNull()
    expect(result?.days).toHaveLength(3)
    expect(result?.days[0]).toEqual({
      label: 'Today',
      aqi: pm25ToAqi(32),
      category: aqiToCategory(pm25ToAqi(32)),
    })
    expect(result?.days[1]).toEqual({
      label: 'Tomorrow',
      aqi: pm25ToAqi(80),
      category: aqiToCategory(pm25ToAqi(80)),
    })
    expect(result?.days[2]).toEqual({
      label: 'Day 3',
      aqi: pm25ToAqi(160),
      category: aqiToCategory(pm25ToAqi(160)),
    })
  })
})
