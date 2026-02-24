import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { OpenMeteoClient } from '../../services/openMeteoClient.js'
import { pm25ToAqi, aqiToCategory } from '../../utils/aqiUtils.js'

export const DaySummarySchema = z.object({
  label: z.string(),
  aqi: z.number(),
  category: z.string(),
})

export const ForecastResponseSchema = z.object({
  days: z.array(DaySummarySchema),
})

export const forecastRouter = router({
  byCity: publicProcedure
    .input(z.object({ city: z.string().min(1).max(100).nullable().optional() }))
    .output(ForecastResponseSchema.nullable())
    .query(async ({ input }) => {
      const city = input.city || 'Manila' // Default fallback
      const client = new OpenMeteoClient()
      const forecast = await client.get3DayForecast(city)

      if (!forecast || !forecast.hourly || !forecast.hourly.pm2_5) {
        return null
      }

      const pm25Data = forecast.hourly.pm2_5

      // Process up to 3 days (72 hours). Group by day label:
      // Day 0: "Today", Day 1: "Tomorrow", Day 2: "Day 3"
      const days = []

      for (let dayIdx = 0; dayIdx < 3; dayIdx++) {
        const startHour = dayIdx * 24
        const endHour = startHour + 24

        let maxPm25 = 0
        // Find peak PM2.5 for this 24-hour window
        for (let i = startHour; i < endHour && i < pm25Data.length; i++) {
          const val = pm25Data[i]
          if (val !== null && val > maxPm25) {
            maxPm25 = val
          }
        }

        const aqi = pm25ToAqi(maxPm25)
        const category = aqiToCategory(aqi)

        let label = 'Day 3'
        if (dayIdx === 0) label = 'Today'
        else if (dayIdx === 1) label = 'Tomorrow'

        days.push({ label, aqi, category })
      }

      return { days }
    }),
})
