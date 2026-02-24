import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, publicProcedure } from '../trpc.js'
import { RAGService } from '../../services/ragService.js'
import { SearchService } from '../../services/searchService.js'
import { OpenMeteoClient } from '../../services/openMeteoClient.js'
import { pm25ToAqi, aqiToCategory } from '../../utils/aqiUtils.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'

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
      return await rag.ask(input.question, input.city, input.country)
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
      const rag = new RAGService(PROJECT_ID)
      return await rag.ask(input.question, input.city, input.country)
    }),
})
