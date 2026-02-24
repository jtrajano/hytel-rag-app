import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, publicProcedure } from '../trpc.js'
import { RAGService } from '../../services/ragService.js'
import { SearchService } from '../../services/searchService.js'
import { OpenMeteoClient } from '../../services/openMeteoClient.js'
import { pm25ToAqi, aqiToCategory } from '../../utils/aqiUtils.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'

function findClosestHourlyIndex(times: string[], target: Date): number {
  if (!times.length) return -1

  const targetMs = target.getTime()
  let bestIndex = -1
  let bestDelta = Number.POSITIVE_INFINITY

  for (let i = 0; i < times.length; i++) {
    const ts = Date.parse(times[i])
    if (Number.isNaN(ts)) continue
    const delta = Math.abs(ts - targetMs)
    if (delta < bestDelta) {
      bestDelta = delta
      bestIndex = i
    }
  }

  return bestIndex
}

export const chatRouter = router({
  currentAqi: publicProcedure
    .input(
      z.object({
        city: z.string().min(1).max(100).default('Manila'),
      })
    )
    .query(async ({ input }) => {
      const svc = new SearchService(PROJECT_ID)
      const result = await svc.lookupCity(input.city)

      if (result) {
        return {
          city: result.name,
          aqi: result.pollution.aqi,
          quality: result.pollution.category,
          updatedAt: result.pollution.updatedAt,
        }
      }

      // Fallback: if SearchService misses (e.g., missing OpenAQ/BQ data), use Open-Meteo forecast.
      const openMeteo = new OpenMeteoClient()
      const forecast = await openMeteo.get3DayForecast(input.city)
      const pm25Values = forecast?.hourly?.pm2_5 ?? []
      const firstIndex = pm25Values.findIndex(v => v !== null)

      if (forecast && firstIndex !== -1) {
        const pm25 = pm25Values[firstIndex]!
        const aqi = pm25ToAqi(pm25)
        const quality = aqiToCategory(aqi)
        const updatedAt = forecast.hourly?.time[firstIndex] ?? new Date().toISOString()

        return {
          city: input.city,
          aqi,
          quality,
          updatedAt,
        }
      }

      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No air quality data found for ${input.city}.`,
      })
    }),
  ask: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        city: z.string().optional(),
        country: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const rag = new RAGService(PROJECT_ID)
      return await rag.ask(input.question, input.city)
    }),
  // Query mirror for clients that issue GET requests (e.g., stale cached bundles).
  askBriefing: publicProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        city: z.string().optional(),
        country: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let question = input.question

      if (input.city) {
        try {
          const openMeteo = new OpenMeteoClient()
          const forecast = await openMeteo.get3DayForecast(input.city)
          const times = forecast?.hourly?.time ?? []
          const idx = findClosestHourlyIndex(times, new Date())

          if (forecast && idx !== -1) {
            const pm25 = forecast.hourly?.pm2_5?.[idx] ?? null
            const pm10 = forecast.hourly?.pm10?.[idx] ?? null
            const no2 = forecast.hourly?.nitrogen_dioxide?.[idx] ?? null
            const o3 = forecast.hourly?.ozone?.[idx] ?? null
            const co = forecast.hourly?.carbon_monoxide?.[idx] ?? null
            const sampleTime = times[idx]
            const aqi = pm25 != null ? pm25ToAqi(pm25) : null
            const category = aqi != null ? aqiToCategory(aqi) : null

            question = `${question}

Open-Meteo nearest hourly air-quality sample for ${input.city}:
- Time (closest to now): ${sampleTime}
- PM2.5: ${pm25 ?? 'n/a'} µg/m³
- PM10: ${pm10 ?? 'n/a'} µg/m³
- NO2: ${no2 ?? 'n/a'} µg/m³
- O3: ${o3 ?? 'n/a'} µg/m³
- CO: ${co ?? 'n/a'} µg/m³
- Estimated AQI from PM2.5: ${aqi ?? 'n/a'}${category ? ` (${category})` : ''}`
          }
        } catch {
          // Keep briefing resilient if Open-Meteo is unavailable.
        }
      }

      const rag = new RAGService(PROJECT_ID)
      return await rag.ask(question, input.city)
    }),
})
