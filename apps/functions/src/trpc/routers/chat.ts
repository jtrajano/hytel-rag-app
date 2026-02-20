import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc.js'
import { RAGService } from '../../services/ragService.js'
import { OpenAQClient } from '../../services/openaqClient.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'
const OPENAQ_API_KEY = process.env.OPENAQ_API_KEY

const PM25_BREAKPOINTS = [
  { cLow: 0, cHigh: 12, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
] as const

function pm25ToUsAqi(pm25: number): number {
  const concentration = Math.max(0, Math.min(500.4, Number(pm25.toFixed(1))))
  const bp =
    PM25_BREAKPOINTS.find(range => concentration >= range.cLow && concentration <= range.cHigh) ??
    PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1]

  const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (concentration - bp.cLow) + bp.iLow
  return Math.round(aqi)
}

function aqiToCategory(
  aqi: number
):
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous' {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

export const chatRouter = router({
  currentAqi: protectedProcedure
    .input(
      z.object({
        city: z.string().min(1).max(100).default('Manila'),
      })
    )
    .query(async ({ input }) => {
      if (!OPENAQ_API_KEY) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'OPENAQ_API_KEY is not configured.',
        })
      }

      const client = new OpenAQClient({ apiKey: OPENAQ_API_KEY })
      const latest = await client.getCurrentByCity(input.city)
      const pm25Measurement = latest?.measurements?.find(m =>
        ['pm25', 'pm2.5'].includes(m.parameter.toLowerCase())
      )

      if (!pm25Measurement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No PM2.5 data found for ${input.city}.`,
        })
      }

      const aqi = pm25ToUsAqi(pm25Measurement.value)

      return {
        city: latest?.city ?? input.city,
        aqi,
        quality: aqiToCategory(aqi),
        updatedAt:
          pm25Measurement.datetime?.local ??
          pm25Measurement.datetime?.utc ??
          new Date().toISOString(),
      }
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
})
